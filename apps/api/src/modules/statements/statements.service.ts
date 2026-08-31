import type { PrismaClient } from "@prisma/client";
import puppeteer from "puppeteer";
import ExcelJS from "exceljs";
import type { StatementDocument, StatementFormat } from "@white-label/shared-types";
import { formatMinorAmount } from "@white-label/shared-types";
import { getWalletStatementForRange } from "../wallets/wallets.service.js";
import { NotFoundError } from "../../lib/errors.js";

/** Loads the customer's own wallet + currency and builds the Statement of Account document for [dateFrom, dateTo]. Scoped to the requesting customer — never another customer's wallet. */
export async function buildStatementDocument(prisma: PrismaClient, customerId: string, walletId: string, dateFrom: Date, dateTo: Date): Promise<StatementDocument> {
  const wallet = await prisma.wallet.findFirst({ where: { id: walletId, customerId }, include: { account: true, currency: true } });
  if (!wallet) throw new NotFoundError("Wallet");

  const { openingBalanceMinor, closingBalanceMinor, lines } = await getWalletStatementForRange(prisma, wallet.accountId, wallet.account.type, dateFrom, dateTo);

  return {
    currencyCode: wallet.currencyCode,
    decimals: wallet.currency.decimals,
    dateFrom: dateFrom.toISOString(),
    dateTo: dateTo.toISOString(),
    openingBalanceMinor,
    closingBalanceMinor,
    lines: lines.map((l) => ({
      date: l.date,
      description: l.description,
      type: l.type as StatementDocument["lines"][number]["type"],
      status: l.status as StatementDocument["lines"][number]["status"],
      direction: l.direction,
      amountMinor: l.amountMinor,
      balanceAfterMinor: l.balanceAfterMinor,
    })),
  };
}

export type StatementRenderOptions = {
  productName: string;
  logoUrl?: string | null;
  primaryColor?: string | null;
  accountLabel: string;
  customerName: string;
};

function humanizeType(type: string): string {
  return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmt(doc: StatementDocument, amountMinor: string): string {
  return `${formatMinorAmount(amountMinor, doc.decimals)} ${doc.currencyCode}`;
}

/** Plain numeric value (no thousands separators) for spreadsheet cells — formatMinorAmount is for display strings only. */
function toNumber(amountMinor: string, decimals: number): number {
  return Number(amountMinor) / 10 ** decimals;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/**
 * Builds the printable statement page. Dynamic text (customer name, transaction descriptions) is
 * always customer-authored or system-generated — escaped here because this HTML is handed to a
 * real headless browser for PDF rendering, where an unescaped <script> would actually execute.
 */
function renderStatementHtml(doc: StatementDocument, opts: StatementRenderOptions): string {
  const accent = opts.primaryColor && /^#[0-9a-fA-F]{6}$/.test(opts.primaryColor) ? opts.primaryColor : "#4f46e5";
  const productName = escapeHtml(opts.productName);
  const customerName = escapeHtml(opts.customerName);
  const accountLabel = escapeHtml(opts.accountLabel);

  let totalDebitMinor = 0n;
  let totalCreditMinor = 0n;
  let debitCount = 0;
  let creditCount = 0;
  for (const line of doc.lines) {
    if (line.direction === "DEBIT") {
      totalDebitMinor += BigInt(line.amountMinor);
      debitCount++;
    } else {
      totalCreditMinor += BigInt(line.amountMinor);
      creditCount++;
    }
  }

  const rows = doc.lines
    .map(
      (line) => `
        <tr>
          <td class="col-date">${escapeHtml(new Date(line.date).toLocaleString())}</td>
          <td class="col-desc">${escapeHtml(line.description)}</td>
          <td class="col-type">${escapeHtml(humanizeType(line.type))}</td>
          <td class="col-amt">${line.direction === "DEBIT" ? `<span class="debit-amt">${escapeHtml(formatMinorAmount(line.amountMinor, doc.decimals))}</span>` : `<span class="dash">&ndash;</span>`}</td>
          <td class="col-amt">${line.direction === "CREDIT" ? `<span class="credit-amt">${escapeHtml(formatMinorAmount(line.amountMinor, doc.decimals))}</span>` : `<span class="dash">&ndash;</span>`}</td>
          <td class="col-amt">${escapeHtml(formatMinorAmount(line.balanceAfterMinor, doc.decimals))}</td>
        </tr>`,
    )
    .join("");

  const logo = opts.logoUrl
    ? `<img src="${escapeHtml(opts.logoUrl)}" alt="${productName}">`
    : `<span class="brand-name">${productName}</span>`;

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Statement of Account</title>
<style>
  :root {
    --bg: #eef0f3;
    --card-bg: #ffffff;
    --border: #e6e8ec;
    --text: #1a1d29;
    --muted: #8a90a2;
    --credit: #16a34a;
    --debit: #1a1d29;
    --header-bg: #f7f8fa;
    --accent: ${accent};
  }
  * { box-sizing: border-box; }
  html, body {
    margin: 0; padding: 0;
    background: var(--bg); color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  }
  .page { max-width: 1000px; margin: 0 auto; padding: 32px 20px 48px; }
  .brand-row { display: flex; justify-content: flex-end; align-items: center; margin-bottom: 8px; }
  .brand-row img { height: 36px; }
  .brand-name { font-size: 18px; font-weight: 700; color: var(--accent); }
  .statement-title { text-align: center; font-size: 26px; font-weight: 700; margin: 4px 0 6px; }
  .generated-sub { text-align: center; color: var(--muted); font-size: 12px; margin-bottom: 24px; }
  .statement-card {
    background: var(--card-bg); border: 1px solid var(--border); border-radius: 10px;
    padding: 22px 26px; margin-bottom: 20px; box-shadow: 0 1px 2px rgba(20,20,30,0.03);
  }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; }
  .info-label { font-size: 11px; color: var(--muted); margin-bottom: 6px; }
  .info-value { font-size: 13.5px; font-weight: 600; }
  .section-head { display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
  .section-head h2 { font-size: 16px; font-weight: 700; margin: 0; }
  .section-head .period { font-size: 12.5px; color: var(--muted); }
  .summary-grid {
    display: grid; grid-template-columns: repeat(3, 1fr); row-gap: 18px; column-gap: 20px;
    padding-bottom: 20px; border-bottom: 1px dashed var(--border);
  }
  .summary-label { font-size: 11px; color: var(--muted); margin-bottom: 6px; }
  .summary-value { font-size: 15px; font-weight: 700; }
  .table-wrap { overflow-x: auto; margin-top: 18px; border: 1px solid var(--border); border-radius: 8px; }
  table { border-collapse: collapse; width: 100%; min-width: 720px; font-size: 12px; }
  thead th {
    background: var(--header-bg); text-align: left; font-weight: 600; color: #4b5163;
    padding: 10px 12px; border-bottom: 1px solid var(--border); white-space: nowrap;
  }
  tbody td { padding: 9px 12px; border-bottom: 1px solid var(--border); vertical-align: top; }
  tbody tr:last-child td { border-bottom: none; }
  .col-date { white-space: nowrap; color: #4b5163; }
  .col-desc { min-width: 220px; color: #333744; }
  .col-type { white-space: nowrap; color: #4b5163; }
  .col-amt { white-space: nowrap; text-align: right; font-variant-numeric: tabular-nums; }
  .credit-amt { color: var(--credit); font-weight: 600; }
  .debit-amt { color: var(--debit); }
  .dash { color: #b8bcc6; }
  .empty { text-align: center; color: var(--muted); padding: 24px; }
  .doc-footer { text-align: center; color: var(--muted); font-size: 11px; margin-top: 24px; }
</style>
</head>
<body>
<div class="page">
  <div class="brand-row">${logo}</div>
  <div class="statement-title">Statement of Account</div>
  <div class="generated-sub">Generated on ${escapeHtml(new Date().toLocaleString())}</div>

  <section class="statement-card">
    <div class="info-grid">
      <div>
        <div class="info-label">Account Holder</div>
        <div class="info-value">${customerName}</div>
      </div>
      <div>
        <div class="info-label">Account</div>
        <div class="info-value">${accountLabel}</div>
      </div>
      <div>
        <div class="info-label">Statement Period</div>
        <div class="info-value">${escapeHtml(new Date(doc.dateFrom).toLocaleDateString())} &ndash; ${escapeHtml(new Date(doc.dateTo).toLocaleDateString())}</div>
      </div>
    </div>
  </section>

  <section class="statement-card">
    <div class="section-head">
      <h2>${accountLabel}</h2>
      <span class="period">Period: ${escapeHtml(new Date(doc.dateFrom).toLocaleDateString())} &ndash; ${escapeHtml(new Date(doc.dateTo).toLocaleDateString())}</span>
    </div>
    <div class="summary-grid">
      <div>
        <div class="summary-label">Opening Balance</div>
        <div class="summary-value">${escapeHtml(fmt(doc, doc.openingBalanceMinor))}</div>
      </div>
      <div>
        <div class="summary-label">Total Debit</div>
        <div class="summary-value">${escapeHtml(fmt(doc, totalDebitMinor.toString()))}</div>
      </div>
      <div>
        <div class="summary-label">Debit Count</div>
        <div class="summary-value">${debitCount}</div>
      </div>
      <div>
        <div class="summary-label">Closing Balance (current)</div>
        <div class="summary-value">${escapeHtml(fmt(doc, doc.closingBalanceMinor))}</div>
      </div>
      <div>
        <div class="summary-label">Total Credit</div>
        <div class="summary-value credit-amt">${escapeHtml(fmt(doc, totalCreditMinor.toString()))}</div>
      </div>
      <div>
        <div class="summary-label">Credit Count</div>
        <div class="summary-value">${creditCount}</div>
      </div>
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Description</th>
            <th>Type</th>
            <th>Debit (${escapeHtml(doc.currencyCode)})</th>
            <th>Credit (${escapeHtml(doc.currencyCode)})</th>
            <th>Balance After (${escapeHtml(doc.currencyCode)})</th>
          </tr>
        </thead>
        <tbody>
          ${doc.lines.length > 0 ? rows : `<tr><td colspan="6" class="empty">No transactions in this period.</td></tr>`}
        </tbody>
      </table>
    </div>
  </section>

  <div class="doc-footer">This is a system-generated statement from ${productName}.</div>
</div>
</body>
</html>`;
}

export async function renderStatementPdf(doc: StatementDocument, opts: StatementRenderOptions): Promise<Buffer> {
  const html = renderStatementHtml(doc, opts);
  const browser = await puppeteer.launch({ args: ["--no-sandbox", "--disable-setuid-sandbox"] });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    const buffer = await page.pdf({ format: "A4", margin: { top: "20px", bottom: "20px", left: "16px", right: "16px" }, printBackground: true });
    return Buffer.from(buffer);
  } finally {
    await browser.close();
  }
}

export async function renderStatementExcel(doc: StatementDocument, opts: StatementRenderOptions): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = opts.productName;
  const sheet = workbook.addWorksheet("Statement");

  sheet.addRow([opts.productName]);
  sheet.addRow(["Statement of Account"]);
  sheet.addRow([`Account Holder: ${opts.customerName}`]);
  sheet.addRow([`Account: ${opts.accountLabel} (${doc.currencyCode})`]);
  sheet.addRow([`Period: ${new Date(doc.dateFrom).toLocaleDateString()} - ${new Date(doc.dateTo).toLocaleDateString()}`]);
  sheet.addRow([`Opening balance: ${fmt(doc, doc.openingBalanceMinor)}`]);
  sheet.addRow([`Closing balance (current): ${fmt(doc, doc.closingBalanceMinor)}`]);
  sheet.addRow([]);

  const headerRow = sheet.addRow(["Date", "Description", "Type", "Direction", "Credit", "Debit", "Balance after"]);
  headerRow.font = { bold: true };

  for (const line of doc.lines) {
    const amount = toNumber(line.amountMinor, doc.decimals);
    const balance = toNumber(line.balanceAfterMinor, doc.decimals);
    sheet.addRow([
      new Date(line.date).toLocaleString(),
      line.description,
      humanizeType(line.type),
      line.direction === "CREDIT" ? "Credit" : "Debit",
      line.direction === "CREDIT" ? amount : null,
      line.direction === "DEBIT" ? amount : null,
      balance,
    ]);
  }

  sheet.columns.forEach((col) => {
    col.width = 20;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export function statementFilename(doc: StatementDocument, format: StatementFormat): string {
  const from = new Date(doc.dateFrom).toISOString().slice(0, 10);
  const to = new Date(doc.dateTo).toISOString().slice(0, 10);
  const ext = format === "PDF" ? "pdf" : "xlsx";
  return `statement-${doc.currencyCode}-${from}-to-${to}.${ext}`;
}

export function statementContentType(format: StatementFormat): string {
  return format === "PDF" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
}

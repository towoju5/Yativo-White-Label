import type { PrismaClient } from "@prisma/client";
import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";
import type { StatementDocument, StatementFormat } from "@white-label/shared-types";
import { formatMinorAmount } from "@white-label/shared-types";
import { getWalletStatementForRange } from "../wallets/wallets.service.js";
import { NotFoundError } from "../../lib/errors.js";
import logger from "../../lib/logger.js";

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
    // Newest first — matches the on-screen statement/transaction history convention. The
    // opening/closing balances above are unaffected; this only reorders the display rows.
    lines: lines
      .map((l) => ({
        date: l.date,
        description: l.description,
        type: l.type as StatementDocument["lines"][number]["type"],
        status: l.status as StatementDocument["lines"][number]["status"],
        direction: l.direction,
        amountMinor: l.amountMinor,
        balanceAfterMinor: l.balanceAfterMinor,
      }))
      .reverse(),
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

/** Best-effort logo fetch — a broken/unreachable admin-set logo URL must never break statement generation. */
async function fetchLogoBuffer(logoUrl: string): Promise<Buffer | null> {
  try {
    const res = await fetch(logoUrl, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch (err) {
    logger.warn({ err, logoUrl }, "Couldn't fetch branding logo for statement PDF — falling back to text");
    return null;
  }
}

const PAGE_MARGIN = 40;
const PAGE_HEIGHT = 841.89; // A4 in points
const CONTENT_WIDTH = 595.28 - PAGE_MARGIN * 2;
const FOOTER_BAND_HEIGHT = 34; // reserved at the bottom of every page for the running footer
const PAGE_BOTTOM = PAGE_HEIGHT - PAGE_MARGIN - FOOTER_BAND_HEIGHT;

// Column widths sum to exactly CONTENT_WIDTH so the table never runs past the right margin.
const COL_WIDTHS = { date: 78, desc: 175, type: 62, debit: 65, credit: 65, balance: 70 };
const COLS = {
  date: 0,
  desc: COL_WIDTHS.date,
  type: COL_WIDTHS.date + COL_WIDTHS.desc,
  debit: COL_WIDTHS.date + COL_WIDTHS.desc + COL_WIDTHS.type,
  credit: COL_WIDTHS.date + COL_WIDTHS.desc + COL_WIDTHS.type + COL_WIDTHS.debit,
  balance: COL_WIDTHS.date + COL_WIDTHS.desc + COL_WIDTHS.type + COL_WIDTHS.debit + COL_WIDTHS.credit,
};
const CELL_PADDING_X = 5;
const ROW_MIN_HEIGHT = 20;
const ROW_PADDING_Y = 6;

export async function renderStatementPdf(doc: StatementDocument, opts: StatementRenderOptions): Promise<Buffer> {
  const accentHex = opts.primaryColor && /^#[0-9a-fA-F]{6}$/.test(opts.primaryColor) ? opts.primaryColor : "#4f46e5";
  const logoBuffer = opts.logoUrl ? await fetchLogoBuffer(opts.logoUrl) : null;

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

  // bufferPages lets us go back and stamp "Page X of Y" on every page once the total is known —
  // pdfkit streams pages out as they're finished, so that number isn't available any earlier.
  const pdf = new PDFDocument({ size: "A4", margin: PAGE_MARGIN, bufferPages: true });
  const chunks: Buffer[] = [];
  pdf.on("data", (chunk) => chunks.push(chunk));
  const result = new Promise<Buffer>((resolve) => pdf.on("end", () => resolve(Buffer.concat(chunks))));

  /** A thin colored rule used as a masthead accent and as a left-border callout on cards. */
  function accentRule(x: number, y: number, width: number, height: number) {
    pdf.rect(x, y, width, height).fill(accentHex);
  }

  // --- Header: the logo, made as prominent as the page allows (full content width, generous
  // height) rather than a small corner icon — falls back to the product name as bold text. ---
  if (logoBuffer) {
    try {
      pdf.image(logoBuffer, PAGE_MARGIN, pdf.y, { fit: [CONTENT_WIDTH, 90], align: "center", valign: "center" });
      pdf.y += 96;
    } catch (err) {
      logger.warn({ err }, "Couldn't render fetched logo image — falling back to text");
      pdf.font("Helvetica-Bold").fontSize(22).fillColor(accentHex).text(opts.productName, { align: "center" });
      pdf.moveDown(0.3);
    }
  } else {
    pdf.font("Helvetica-Bold").fontSize(22).fillColor(accentHex).text(opts.productName, { align: "center" });
    pdf.moveDown(0.3);
  }

  pdf.font("Helvetica-Bold").fontSize(18).fillColor("#111827").text("Statement of Account", { align: "center" });
  pdf.font("Helvetica").fontSize(9).fillColor("#8a90a2").text(`Generated on ${new Date().toLocaleString()}`, { align: "center" });
  pdf.moveDown(0.6);
  accentRule(PAGE_MARGIN, pdf.y, CONTENT_WIDTH, 2.5);
  pdf.y += 18;

  // --- Account info card (colored left-border callout, matching a bank statement's masthead) ---
  const infoBoxY = pdf.y;
  const infoBoxHeight = 56;
  pdf.roundedRect(PAGE_MARGIN, infoBoxY, CONTENT_WIDTH, infoBoxHeight, 6).fillAndStroke("#ffffff", "#e6e8ec");
  accentRule(PAGE_MARGIN, infoBoxY, 3, infoBoxHeight);
  const infoColWidth = CONTENT_WIDTH / 3;
  const infoCols: [string, string][] = [
    ["Account Holder", opts.customerName],
    ["Account", opts.accountLabel],
    ["Statement Period", `${new Date(doc.dateFrom).toLocaleDateString()} – ${new Date(doc.dateTo).toLocaleDateString()}`],
  ];
  infoCols.forEach(([label, value], i) => {
    const x = PAGE_MARGIN + 20 + i * infoColWidth;
    if (i > 0) pdf.moveTo(x - 10, infoBoxY + 12).lineTo(x - 10, infoBoxY + infoBoxHeight - 12).strokeColor("#e6e8ec").stroke();
    pdf.font("Helvetica").fontSize(8).fillColor("#8a90a2").text(label.toUpperCase(), x, infoBoxY + 13, { width: infoColWidth - 28 });
    pdf.font("Helvetica-Bold").fontSize(11).fillColor("#1a1d29").text(value, x, infoBoxY + 27, { width: infoColWidth - 28, ellipsis: true });
  });
  pdf.y = infoBoxY + infoBoxHeight + 16;

  // --- Summary card ---
  const summaryY = pdf.y;
  const summaryHeight = 96;
  pdf.roundedRect(PAGE_MARGIN, summaryY, CONTENT_WIDTH, summaryHeight, 6).fillAndStroke("#ffffff", "#e6e8ec");
  accentRule(PAGE_MARGIN, summaryY, 3, summaryHeight);
  pdf.font("Helvetica-Bold").fontSize(12).fillColor("#1a1d29").text(opts.accountLabel, PAGE_MARGIN + 20, summaryY + 15);
  pdf
    .moveTo(PAGE_MARGIN + 16, summaryY + 34)
    .lineTo(PAGE_MARGIN + CONTENT_WIDTH - 16, summaryY + 34)
    .strokeColor("#f0f1f3")
    .stroke();

  const tiles: [string, string, string | null][] = [
    ["Opening Balance", fmt(doc, doc.openingBalanceMinor), null],
    ["Total Debit", fmt(doc, totalDebitMinor.toString()), null],
    ["Debit Count", String(debitCount), null],
    ["Closing Balance (current)", fmt(doc, doc.closingBalanceMinor), null],
    ["Total Credit", fmt(doc, totalCreditMinor.toString()), "#16a34a"],
    ["Credit Count", String(creditCount), null],
  ];
  const tileColWidth = CONTENT_WIDTH / 3;
  tiles.forEach(([label, value, color], i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = PAGE_MARGIN + 20 + col * tileColWidth;
    const y = summaryY + 44 + row * 26;
    if (col > 0) pdf.moveTo(x - 10, summaryY + 40).lineTo(x - 10, summaryY + summaryHeight - 10).strokeColor("#f0f1f3").stroke();
    pdf.font("Helvetica").fontSize(8).fillColor("#8a90a2").text(label.toUpperCase(), x, y, { width: tileColWidth - 28 });
    pdf.font("Helvetica-Bold").fontSize(11).fillColor(color ?? "#1a1d29").text(value, x, y + 12, { width: tileColWidth - 28, ellipsis: true });
  });
  pdf.y = summaryY + summaryHeight + 16;

  // --- Transaction table ---
  const HEADER_HEIGHT = 24;

  function drawTableHeader() {
    const y = pdf.y;
    pdf.rect(PAGE_MARGIN, y, CONTENT_WIDTH, HEADER_HEIGHT).fill("#f7f8fa");
    pdf.font("Helvetica-Bold").fontSize(8).fillColor("#4b5163");
    const textY = y + 8;
    pdf.text("DATE", PAGE_MARGIN + COLS.date + CELL_PADDING_X, textY, { width: COL_WIDTHS.date - CELL_PADDING_X });
    pdf.text("DESCRIPTION", PAGE_MARGIN + COLS.desc + CELL_PADDING_X, textY, { width: COL_WIDTHS.desc - CELL_PADDING_X });
    pdf.text("TYPE", PAGE_MARGIN + COLS.type + CELL_PADDING_X, textY, { width: COL_WIDTHS.type - CELL_PADDING_X });
    pdf.text("DEBIT", PAGE_MARGIN + COLS.debit, textY, { width: COL_WIDTHS.debit - CELL_PADDING_X, align: "right" });
    pdf.text("CREDIT", PAGE_MARGIN + COLS.credit, textY, { width: COL_WIDTHS.credit - CELL_PADDING_X, align: "right" });
    pdf.text("BALANCE", PAGE_MARGIN + COLS.balance, textY, { width: COL_WIDTHS.balance - CELL_PADDING_X, align: "right" });
    pdf.moveTo(PAGE_MARGIN, y + HEADER_HEIGHT).lineTo(PAGE_MARGIN + CONTENT_WIDTH, y + HEADER_HEIGHT).strokeColor("#e6e8ec").stroke();
    pdf.y = y + HEADER_HEIGHT;
  }

  drawTableHeader();

  if (doc.lines.length === 0) {
    pdf.font("Helvetica").fontSize(9).fillColor("#8a90a2").text("No transactions in this period.", PAGE_MARGIN, pdf.y + 12, { width: CONTENT_WIDTH, align: "center" });
    pdf.y += 40;
  }

  doc.lines.forEach((line, i) => {
    pdf.font("Helvetica").fontSize(8);
    const descWidth = COL_WIDTHS.desc - CELL_PADDING_X * 2;
    const descHeight = pdf.heightOfString(line.description, { width: descWidth });
    const rowHeight = Math.max(ROW_MIN_HEIGHT, descHeight + ROW_PADDING_Y);

    if (pdf.y + rowHeight > PAGE_BOTTOM) {
      pdf.addPage();
      pdf.y = PAGE_MARGIN;
      drawTableHeader();
    }

    const y = pdf.y;
    if (i % 2 === 1) pdf.rect(PAGE_MARGIN, y, CONTENT_WIDTH, rowHeight).fill("#fafbfc");

    const textY = y + ROW_PADDING_Y / 2;
    pdf.font("Helvetica").fontSize(8).fillColor("#4b5163");
    pdf.text(new Date(line.date).toLocaleString(), PAGE_MARGIN + COLS.date + CELL_PADDING_X, textY, { width: COL_WIDTHS.date - CELL_PADDING_X });
    pdf.fillColor("#333744").text(line.description, PAGE_MARGIN + COLS.desc + CELL_PADDING_X, textY, { width: descWidth });
    pdf.fillColor("#4b5163").text(humanizeType(line.type), PAGE_MARGIN + COLS.type + CELL_PADDING_X, textY, { width: COL_WIDTHS.type - CELL_PADDING_X });
    pdf
      .fillColor(line.direction === "DEBIT" ? "#1a1d29" : "#b8bcc6")
      .text(line.direction === "DEBIT" ? formatMinorAmount(line.amountMinor, doc.decimals) : "–", PAGE_MARGIN + COLS.debit, textY, {
        width: COL_WIDTHS.debit - CELL_PADDING_X,
        align: "right",
      });
    pdf
      .fillColor(line.direction === "CREDIT" ? "#16a34a" : "#b8bcc6")
      .text(line.direction === "CREDIT" ? formatMinorAmount(line.amountMinor, doc.decimals) : "–", PAGE_MARGIN + COLS.credit, textY, {
        width: COL_WIDTHS.credit - CELL_PADDING_X,
        align: "right",
      });
    pdf.fillColor("#1a1d29").text(formatMinorAmount(line.balanceAfterMinor, doc.decimals), PAGE_MARGIN + COLS.balance, textY, { width: COL_WIDTHS.balance - CELL_PADDING_X, align: "right" });

    pdf.moveTo(PAGE_MARGIN, y + rowHeight).lineTo(PAGE_MARGIN + CONTENT_WIDTH, y + rowHeight).strokeColor("#f0f1f3").stroke();
    pdf.y = y + rowHeight;
  });

  // --- Running footer on every page: disclaimer + page numbers, stamped now that the total
  // page count is known (bufferPages above holds every page open until we do this). ---
  const footerY = PAGE_HEIGHT - PAGE_MARGIN - 18;
  const { count } = pdf.bufferedPageRange();
  for (let i = 0; i < count; i++) {
    pdf.switchToPage(i);
    pdf.moveTo(PAGE_MARGIN, footerY - 8).lineTo(PAGE_MARGIN + CONTENT_WIDTH, footerY - 8).strokeColor("#e6e8ec").stroke();
    pdf.font("Helvetica").fontSize(7.5).fillColor("#8a90a2");
    pdf.text(`This is a system-generated statement from ${opts.productName}.`, PAGE_MARGIN, footerY, { width: CONTENT_WIDTH * 0.7, lineBreak: false });
    pdf.text(`Page ${i + 1} of ${count}`, PAGE_MARGIN, footerY, { width: CONTENT_WIDTH, align: "right", lineBreak: false });
  }

  pdf.end();
  return result;
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

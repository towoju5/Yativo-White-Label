import type { PrismaClient } from "@prisma/client";
import PDFDocument from "pdfkit";
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

export function renderStatementPdf(doc: StatementDocument, opts: { productName: string; accountLabel: string }): Promise<Buffer> {
  const pdf = new PDFDocument({ size: "A4", margin: 40 });
  const chunks: Buffer[] = [];
  pdf.on("data", (chunk) => chunks.push(chunk));

  pdf.fontSize(16).text(opts.productName, { continued: false });
  pdf.fontSize(11).fillColor("#555").text("Statement of Account").moveDown(0.5);
  pdf.fillColor("#000").fontSize(10);
  pdf.text(`Account: ${opts.accountLabel} (${doc.currencyCode})`);
  pdf.text(`Period: ${new Date(doc.dateFrom).toLocaleDateString()} – ${new Date(doc.dateTo).toLocaleDateString()}`);
  pdf.text(`Opening balance: ${fmt(doc, doc.openingBalanceMinor)}`);
  pdf.text(`Closing balance: ${fmt(doc, doc.closingBalanceMinor)}`);
  pdf.moveDown();

  const colX = { date: 40, desc: 120, type: 290, dir: 370, amount: 420, balance: 495 };
  const headerY = pdf.y;
  pdf.fontSize(9).fillColor("#555");
  pdf.text("Date", colX.date, headerY, { width: 75 });
  pdf.text("Description", colX.desc, headerY, { width: 165 });
  pdf.text("Type", colX.type, headerY, { width: 75 });
  pdf.text("Dir.", colX.dir, headerY, { width: 45 });
  pdf.text("Amount", colX.amount, headerY, { width: 70 });
  pdf.text("Balance", colX.balance, headerY, { width: 70 });
  pdf.moveDown(0.5);
  pdf.moveTo(40, pdf.y).lineTo(565, pdf.y).strokeColor("#ddd").stroke();
  pdf.moveDown(0.3);

  pdf.fillColor("#000").fontSize(9);
  if (doc.lines.length === 0) {
    pdf.text("No transactions in this period.", 40);
  }
  for (const line of doc.lines) {
    if (pdf.y > 760) {
      pdf.addPage();
    }
    const y = pdf.y;
    pdf.text(new Date(line.date).toLocaleDateString(), colX.date, y, { width: 75 });
    pdf.text(line.description, colX.desc, y, { width: 165 });
    pdf.text(humanizeType(line.type), colX.type, y, { width: 75 });
    pdf.text(line.direction === "CREDIT" ? "Credit" : "Debit", colX.dir, y, { width: 45 });
    pdf.text(`${line.direction === "CREDIT" ? "+" : "-"}${formatMinorAmount(line.amountMinor, doc.decimals)}`, colX.amount, y, { width: 70 });
    pdf.text(formatMinorAmount(line.balanceAfterMinor, doc.decimals), colX.balance, y, { width: 70 });
    pdf.moveDown(0.6);
  }

  const result = new Promise<Buffer>((resolve) => {
    pdf.on("end", () => resolve(Buffer.concat(chunks)));
  });
  pdf.end();
  return result;
}

export async function renderStatementExcel(doc: StatementDocument, opts: { productName: string; accountLabel: string }): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = opts.productName;
  const sheet = workbook.addWorksheet("Statement");

  sheet.addRow([opts.productName]);
  sheet.addRow(["Statement of Account"]);
  sheet.addRow([`Account: ${opts.accountLabel} (${doc.currencyCode})`]);
  sheet.addRow([`Period: ${new Date(doc.dateFrom).toLocaleDateString()} - ${new Date(doc.dateTo).toLocaleDateString()}`]);
  sheet.addRow([`Opening balance: ${fmt(doc, doc.openingBalanceMinor)}`]);
  sheet.addRow([`Closing balance: ${fmt(doc, doc.closingBalanceMinor)}`]);
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

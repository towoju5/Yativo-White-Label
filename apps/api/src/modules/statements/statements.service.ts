import { fileURLToPath } from "node:url";
import path from "node:path";
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

// ── Typography ──────────────────────────────────────────────────────────────
// Inter, embedded from the static TTFs in ../../../assets/fonts. A real typeface reads as a
// designed document; PDFKit's built-in Helvetica reads as a library default, which is exactly
// the "ugly" a bank-grade statement can't afford. (fontkit's WOFF2 subsetter chokes on Inter's
// glyph set — TrueType outlines side-step that entirely, hence TTF rather than the more common
// @fontsource woff2 distribution.)
const ASSETS_DIR = fileURLToPath(new URL("../../../assets", import.meta.url));
const FONT_FILES = { regular: "Regular", medium: "Medium", semibold: "SemiBold", bold: "Bold" } as const;
type FontWeight = keyof typeof FONT_FILES;

function interFontPath(weight: FontWeight): string {
  return path.join(ASSETS_DIR, "fonts", `Inter-${FONT_FILES[weight]}.ttf`);
}

function registerFonts(pdf: PDFKit.PDFDocument) {
  for (const weight of Object.keys(FONT_FILES) as FontWeight[]) {
    pdf.registerFont(`Inter-${weight}`, interFontPath(weight));
  }
}

// ── Palette (neutral ink + muted grays; the brand color is used sparingly, as an accent — not a
// loud masthead — the way a printed bank statement uses its brand mark) ──
const INK = "#14161f";
const SUBTLE = "#4b5060";
const MUTED = "#8b90a0";
const HAIRLINE = "#e4e6ec";
const PANEL_BG = "#f8f9fb";
const POSITIVE = "#15803d";

const PAGE_MARGIN = 44;
const PAGE_HEIGHT = 841.89; // A4 in points
const PAGE_WIDTH = 595.28;
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;
const FOOTER_BAND_HEIGHT = 34; // reserved at the bottom of every page for the running footer
const PAGE_BOTTOM = PAGE_HEIGHT - PAGE_MARGIN - FOOTER_BAND_HEIGHT;

// Column widths sum to exactly CONTENT_WIDTH — date-only (no time) keeps that column narrow and
// gives the description column the room a real description needs before truncating awkwardly.
const COL_WIDTHS = { date: 64, desc: 197, type: 62, debit: 66, credit: 66, balance: 52 };
const COLS = {
  date: 0,
  desc: 64,
  type: 64 + 197,
  debit: 64 + 197 + 62,
  credit: 64 + 197 + 62 + 66,
  balance: 64 + 197 + 62 + 66 + 66,
};
const CELL_PADDING_X = 6;
const ROW_MIN_HEIGHT = 22;
const ROW_PADDING_Y = 8;

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
}

export async function renderStatementPdf(doc: StatementDocument, opts: StatementRenderOptions): Promise<Buffer> {
  const accentHex = opts.primaryColor && /^#[0-9a-fA-F]{6}$/.test(opts.primaryColor) ? opts.primaryColor : "#4f46e5";
  const logoBuffer = opts.logoUrl ? await fetchLogoBuffer(opts.logoUrl) : null;

  let totalDebitMinor = 0n;
  let totalCreditMinor = 0n;
  for (const line of doc.lines) {
    if (line.direction === "DEBIT") totalDebitMinor += BigInt(line.amountMinor);
    else totalCreditMinor += BigInt(line.amountMinor);
  }

  // bufferPages lets us go back and stamp "Page X of Y" on every page once the total is known —
  // pdfkit streams pages out as they're finished, so that number isn't available any earlier.
  const pdf = new PDFDocument({ size: "A4", margin: PAGE_MARGIN, bufferPages: true });
  registerFonts(pdf);
  const chunks: Buffer[] = [];
  pdf.on("data", (chunk) => chunks.push(chunk));
  const result = new Promise<Buffer>((resolve) => pdf.on("end", () => resolve(Buffer.concat(chunks))));

  function label(text: string, x: number, y: number, width: number, align: "left" | "right" = "left") {
    pdf.font("Inter-semibold").fontSize(7).fillColor(MUTED).text(text.toUpperCase(), x, y, { width, align, characterSpacing: 0.5 });
  }

  // --- Masthead: logo/wordmark at a restrained size on the left, the statement title and its
  // date range on the right — the layout of a printed bank statement's letterhead, not a poster. ---
  const headTop = pdf.y;
  if (logoBuffer) {
    try {
      pdf.image(logoBuffer, PAGE_MARGIN, headTop, { fit: [180, 34] });
    } catch (err) {
      logger.warn({ err }, "Couldn't render fetched logo image — falling back to text");
      pdf.font("Inter-bold").fontSize(15).fillColor(accentHex).text(opts.productName, PAGE_MARGIN, headTop, { width: 260 });
    }
  } else {
    pdf.font("Inter-bold").fontSize(15).fillColor(accentHex).text(opts.productName, PAGE_MARGIN, headTop, { width: 260 });
  }

  pdf.font("Inter-bold").fontSize(13).fillColor(INK).text("Statement of Account", PAGE_MARGIN, headTop + 2, { width: CONTENT_WIDTH, align: "right" });
  pdf
    .font("Inter-regular")
    .fontSize(8.5)
    .fillColor(SUBTLE)
    .text(`${shortDate(doc.dateFrom)} – ${shortDate(doc.dateTo)}`, PAGE_MARGIN, headTop + 18, { width: CONTENT_WIDTH, align: "right" });

  pdf.y = headTop + 44;
  pdf.moveTo(PAGE_MARGIN, pdf.y).lineTo(PAGE_MARGIN + CONTENT_WIDTH, pdf.y).lineWidth(1).strokeColor(INK).stroke();
  pdf.y += 20;

  // --- Account details: three plain columns, no boxed card — a real letterhead states these
  // facts, it doesn't put them in a UI widget. ---
  const infoY = pdf.y;
  const infoColWidth = CONTENT_WIDTH / 3;
  const infoCols: [string, string][] = [
    ["Account Holder", opts.customerName],
    ["Account", opts.accountLabel],
    ["Currency", doc.currencyCode],
  ];
  infoCols.forEach(([text, value], i) => {
    const x = PAGE_MARGIN + i * infoColWidth;
    label(text, x, infoY, infoColWidth - 12);
    pdf.font("Inter-semibold").fontSize(10.5).fillColor(INK).text(value, x, infoY + 12, { width: infoColWidth - 12, ellipsis: true });
  });
  pdf.y = infoY + 38;

  // --- Balance summary bar: one even row of four tiles inside a single panel — Opening, Money
  // In, Money Out, Closing — the numbers a statement summary actually leads with. ---
  const summaryY = pdf.y;
  const summaryHeight = 62;
  pdf.roundedRect(PAGE_MARGIN, summaryY, CONTENT_WIDTH, summaryHeight, 8).fill(PANEL_BG);
  const tiles: [string, string, string][] = [
    ["Opening Balance", fmt(doc, doc.openingBalanceMinor), INK],
    ["Money In", `+${fmt(doc, totalCreditMinor.toString())}`, POSITIVE],
    ["Money Out", totalDebitMinor > 0n ? `-${fmt(doc, totalDebitMinor.toString())}` : fmt(doc, "0"), INK],
    ["Closing Balance", fmt(doc, doc.closingBalanceMinor), INK],
  ];
  const tileColWidth = CONTENT_WIDTH / 4;
  tiles.forEach(([text, value, color], i) => {
    const x = PAGE_MARGIN + 18 + i * tileColWidth;
    if (i > 0) pdf.moveTo(PAGE_MARGIN + i * tileColWidth, summaryY + 14).lineTo(PAGE_MARGIN + i * tileColWidth, summaryY + summaryHeight - 14).strokeColor(HAIRLINE).stroke();
    label(text, x, summaryY + 16, tileColWidth - 26);
    pdf.font("Inter-bold").fontSize(12).fillColor(color).text(value, x, summaryY + 30, { width: tileColWidth - 26, ellipsis: true });
  });
  pdf.y = summaryY + summaryHeight + 26;

  // --- Transaction table ---
  const HEADER_HEIGHT = 24;

  function drawTableHeader() {
    const y = pdf.y;
    pdf.moveTo(PAGE_MARGIN, y).lineTo(PAGE_MARGIN + CONTENT_WIDTH, y).strokeColor(INK).lineWidth(1).stroke();
    const textY = y + 8;
    label("Date", PAGE_MARGIN + COLS.date + CELL_PADDING_X, textY, COL_WIDTHS.date - CELL_PADDING_X);
    label("Description", PAGE_MARGIN + COLS.desc + CELL_PADDING_X, textY, COL_WIDTHS.desc - CELL_PADDING_X);
    label("Type", PAGE_MARGIN + COLS.type + CELL_PADDING_X, textY, COL_WIDTHS.type - CELL_PADDING_X);
    label("Debit", PAGE_MARGIN + COLS.debit, textY, COL_WIDTHS.debit - CELL_PADDING_X, "right");
    label("Credit", PAGE_MARGIN + COLS.credit, textY, COL_WIDTHS.credit - CELL_PADDING_X, "right");
    label("Balance", PAGE_MARGIN + COLS.balance, textY, COL_WIDTHS.balance - CELL_PADDING_X, "right");
    pdf.moveTo(PAGE_MARGIN, y + HEADER_HEIGHT).lineTo(PAGE_MARGIN + CONTENT_WIDTH, y + HEADER_HEIGHT).strokeColor(HAIRLINE).stroke();
    pdf.y = y + HEADER_HEIGHT;
  }

  drawTableHeader();

  if (doc.lines.length === 0) {
    pdf.font("Inter-regular").fontSize(9).fillColor(MUTED).text("No transactions in this period.", PAGE_MARGIN, pdf.y + 14, { width: CONTENT_WIDTH, align: "center" });
    pdf.y += 40;
  }

  doc.lines.forEach((line, i) => {
    pdf.font("Inter-regular").fontSize(8.5);
    const descWidth = COL_WIDTHS.desc - CELL_PADDING_X * 2;
    const descHeight = pdf.heightOfString(line.description, { width: descWidth });
    const rowHeight = Math.max(ROW_MIN_HEIGHT, descHeight + ROW_PADDING_Y);

    if (pdf.y + rowHeight > PAGE_BOTTOM) {
      pdf.addPage();
      pdf.y = PAGE_MARGIN;
      drawTableHeader();
    }

    const y = pdf.y;
    if (i % 2 === 1) pdf.rect(PAGE_MARGIN, y, CONTENT_WIDTH, rowHeight).fill(PANEL_BG);

    const textY = y + ROW_PADDING_Y / 2;
    pdf.font("Inter-regular").fontSize(8.5).fillColor(SUBTLE);
    pdf.text(shortDate(line.date), PAGE_MARGIN + COLS.date + CELL_PADDING_X, textY, { width: COL_WIDTHS.date - CELL_PADDING_X });
    pdf.font("Inter-medium").fillColor(INK).text(line.description, PAGE_MARGIN + COLS.desc + CELL_PADDING_X, textY, { width: descWidth });
    pdf.font("Inter-regular").fillColor(SUBTLE).text(humanizeType(line.type), PAGE_MARGIN + COLS.type + CELL_PADDING_X, textY, { width: COL_WIDTHS.type - CELL_PADDING_X });
    pdf
      .font("Inter-semibold")
      .fillColor(line.direction === "DEBIT" ? INK : "#c4c7d1")
      .text(line.direction === "DEBIT" ? formatMinorAmount(line.amountMinor, doc.decimals) : "–", PAGE_MARGIN + COLS.debit, textY, {
        width: COL_WIDTHS.debit - CELL_PADDING_X,
        align: "right",
      });
    pdf
      .font("Inter-semibold")
      .fillColor(line.direction === "CREDIT" ? POSITIVE : "#c4c7d1")
      .text(line.direction === "CREDIT" ? formatMinorAmount(line.amountMinor, doc.decimals) : "–", PAGE_MARGIN + COLS.credit, textY, {
        width: COL_WIDTHS.credit - CELL_PADDING_X,
        align: "right",
      });
    pdf
      .font("Inter-medium")
      .fillColor(INK)
      .text(formatMinorAmount(line.balanceAfterMinor, doc.decimals), PAGE_MARGIN + COLS.balance, textY, { width: COL_WIDTHS.balance - CELL_PADDING_X, align: "right" });

    pdf.moveTo(PAGE_MARGIN, y + rowHeight).lineTo(PAGE_MARGIN + CONTENT_WIDTH, y + rowHeight).strokeColor(HAIRLINE).stroke();
    pdf.y = y + rowHeight;
  });

  // --- Running footer on every page: disclaimer + page numbers, stamped now that the total
  // page count is known (bufferPages above holds every page open until we do this). ---
  const footerY = PAGE_HEIGHT - PAGE_MARGIN - 18;
  const { count } = pdf.bufferedPageRange();
  for (let i = 0; i < count; i++) {
    pdf.switchToPage(i);
    pdf.moveTo(PAGE_MARGIN, footerY - 10).lineTo(PAGE_MARGIN + CONTENT_WIDTH, footerY - 10).strokeColor(HAIRLINE).stroke();
    pdf.font("Inter-regular").fontSize(7.5).fillColor(MUTED);
    pdf.text(`This is a system-generated statement from ${opts.productName}.`, PAGE_MARGIN, footerY, { width: CONTENT_WIDTH * 0.7, lineBreak: false });
    pdf.text(`Page ${i + 1} of ${count}`, PAGE_MARGIN, footerY, { width: CONTENT_WIDTH, align: "right", lineBreak: false });
  }

  pdf.end();
  return result;
}

const EXCEL_HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF14161F" } };
const EXCEL_STRIPE_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8F9FB" } };
const EXCEL_THIN_BORDER: Partial<ExcelJS.Borders> = { bottom: { style: "thin", color: { argb: "FFE4E6EC" } } };

export async function renderStatementExcel(doc: StatementDocument, opts: StatementRenderOptions): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = opts.productName;
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Statement", { views: [{ state: "frozen", ySplit: 9 }] });

  // No `header` on these — ExcelJS's `worksheet.columns` setter writes each column's `header`
  // straight into row 1 the moment it's assigned, which would jump the header row ahead of the
  // letterhead below. The header row is added manually, in its intended position, instead.
  const columns = [
    { header: "Date", key: "date", width: 14 },
    { header: "Description", key: "description", width: 42 },
    { header: "Type", key: "type", width: 16 },
    { header: "Direction", key: "direction", width: 12 },
    { header: "Credit", key: "credit", width: 16 },
    { header: "Debit", key: "debit", width: 16 },
    { header: "Balance", key: "balance", width: 16 },
  ];
  sheet.columns = columns.map(({ key, width }) => ({ key, width }));

  // --- Letterhead block (rows 1-7): merged title rows read like a document header rather than
  // stray text dropped in column A. ---
  const lastCol = columns.length;
  function mergedTitleRow(text: string, opts2?: { bold?: boolean; size?: number; color?: string }) {
    const row = sheet.addRow([text]);
    sheet.mergeCells(row.number, 1, row.number, lastCol);
    row.getCell(1).font = { name: "Calibri", bold: opts2?.bold ?? false, size: opts2?.size ?? 11, color: { argb: opts2?.color ?? "FF14161F" } };
    return row;
  }

  mergedTitleRow(opts.productName, { bold: true, size: 16, color: "FF14161F" });
  mergedTitleRow("Statement of Account", { size: 11, color: "FF4B5060" });
  sheet.addRow([]);
  mergedTitleRow(`Account holder: ${opts.customerName}`);
  mergedTitleRow(`Account: ${opts.accountLabel} (${doc.currencyCode})`);
  mergedTitleRow(`Period: ${shortDate(doc.dateFrom)} – ${shortDate(doc.dateTo)}`);
  mergedTitleRow(`Opening balance: ${fmt(doc, doc.openingBalanceMinor)}    Closing balance: ${fmt(doc, doc.closingBalanceMinor)}`, { bold: true });
  sheet.addRow([]);

  const headerRow = sheet.addRow(columns.map((c) => c.header));
  headerRow.eachCell((cell, colNumber) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    cell.fill = EXCEL_HEADER_FILL;
    cell.alignment = { vertical: "middle", horizontal: colNumber >= 5 ? "right" : "left" };
  });
  headerRow.height = 20;

  doc.lines.forEach((line, i) => {
    const row = sheet.addRow({
      date: shortDate(line.date),
      description: line.description,
      type: humanizeType(line.type),
      direction: line.direction === "CREDIT" ? "Credit" : "Debit",
      credit: line.direction === "CREDIT" ? toNumber(line.amountMinor, doc.decimals) : null,
      debit: line.direction === "DEBIT" ? toNumber(line.amountMinor, doc.decimals) : null,
      balance: toNumber(line.balanceAfterMinor, doc.decimals),
    });
    row.eachCell((cell, colNumber) => {
      cell.font = { size: 9.5, color: { argb: "FF14161F" } };
      cell.border = EXCEL_THIN_BORDER;
      if (colNumber >= 5) {
        cell.numFmt = "#,##0.00";
        cell.alignment = { horizontal: "right" };
      }
      if (i % 2 === 1) cell.fill = EXCEL_STRIPE_FILL;
    });
    row.getCell("credit").font = { size: 9.5, color: { argb: "FF15803D" }, bold: true };
    row.getCell("balance").font = { size: 9.5, color: { argb: "FF14161F" }, bold: true };
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

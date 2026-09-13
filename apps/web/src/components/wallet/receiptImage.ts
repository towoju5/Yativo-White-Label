import type { TransactionDetail } from "@white-label/shared-types";
import { formatMinorAmount } from "@white-label/shared-types";

export function humanizeType(type: string): string {
  return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export type ReceiptRow = [string, string];

/**
 * Fee/rate breakdown rows shared by the on-screen detail list, the printed receipt, and the
 * shared image. The headline amount (from the customer's own ledger entry) is always the NET
 * figure they actually received/paid — these rows only ever add a single combined "Fee" plus,
 * for deposits, the rate/local-amount context. Never split into provider-vs-platform pieces, and
 * never names the upstream payments provider — same posture as transactionDetailDepositSchema's
 * own doc comment (totalFeeMinor).
 */
export function feeDetailRows(data: TransactionDetail): ReceiptRow[] {
  const rows: ReceiptRow[] = [];
  if (data.deposit) {
    const d = data.deposit;
    if (Number(d.totalFeeMinor) > 0) {
      rows.push(["Fee", `${formatMinorAmount(d.totalFeeMinor, 2)} ${d.currencyCode}`]);
    }
    if (d.exchangeRate) rows.push(["Exchange rate", d.exchangeRate]);
    if (d.localAmount && d.localCurrency) rows.push(["Amount paid", `${d.localAmount} ${d.localCurrency}`]);
  } else if (data.payout && Number(data.payout.platformFeeMinor) > 0) {
    rows.push(["Fee", `${formatMinorAmount(data.payout.platformFeeMinor, 2)} ${data.payout.currencyCode}`]);
  }
  return rows;
}

/** The full label/value row list for one transaction's receipt — one source of truth for the printed receipt and the shared image, so they can never drift apart. */
export function buildReceiptRows(data: TransactionDetail): ReceiptRow[] {
  return [
    ["Type", humanizeType(data.type)],
    ["Status", data.status],
    ...(data.description ? ([["Description", data.description]] as ReceiptRow[]) : []),
    ...(data.payout ? ([["Recipient", data.payout.beneficiaryName]] as ReceiptRow[]) : []),
    ...feeDetailRows(data),
    ["Transaction ID", data.id],
    ["Date", new Date(data.createdAt).toLocaleString()],
    ...(data.postedAt ? ([["Posted", new Date(data.postedAt).toLocaleString()]] as ReceiptRow[]) : []),
    ...(data.reversedAt ? ([["Reversed", new Date(data.reversedAt).toLocaleString()]] as ReceiptRow[]) : []),
  ];
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && ctx.measureText(candidate).width > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [""];
}

const CANVAS_WIDTH = 640;
const PADDING = 40;
const LABEL_HEIGHT = 16;
const LINE_HEIGHT = 19;
const ROW_SPACING = 16;
const HEADER_HEIGHT = 148;
const FOOTER_HEIGHT = 40;
// Retina-quality export regardless of the viewing device's own pixel ratio — this is a file
// that gets shared/downloaded and viewed elsewhere, not rendered live on this screen.
const EXPORT_SCALE = 2;

const FONT_STACK = "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const LABEL_FONT = `600 11px ${FONT_STACK}`;
const VALUE_FONT = `500 14px ${FONT_STACK}`;

/**
 * Renders one transaction's receipt as a PNG image — same content as the printed receipt
 * (buildReceiptRows) and nothing else, so what gets shared is exactly what the customer already
 * sees on screen. Used instead of a plain-text share so the receipt travels as an actual
 * attachment (image, not a wall of text) wherever it's shared or downloaded.
 */
export async function renderReceiptPng(
  data: TransactionDetail,
  opts: { productName: string; primaryColor?: string | null; amountLabel: string; isCredit: boolean },
): Promise<Blob> {
  const rows = buildReceiptRows(data);
  const contentWidth = CANVAS_WIDTH - PADDING * 2;

  // A throwaway 1x context purely for text metrics — the real canvas can't be sized until this
  // measuring pass tells us how tall the wrapped rows will actually be.
  const measureCtx = document.createElement("canvas").getContext("2d");
  if (!measureCtx) throw new Error("Canvas rendering isn't supported in this browser");
  measureCtx.font = VALUE_FONT;
  const rowLines = rows.map(([, value]) => wrapText(measureCtx, value, contentWidth));
  const rowHeights = rowLines.map((lines) => LABEL_HEIGHT + lines.length * LINE_HEIGHT + ROW_SPACING);
  const height = HEADER_HEIGHT + rowHeights.reduce((a, b) => a + b, 0) + FOOTER_HEIGHT;

  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_WIDTH * EXPORT_SCALE;
  canvas.height = height * EXPORT_SCALE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas rendering isn't supported in this browser");
  ctx.scale(EXPORT_SCALE, EXPORT_SCALE);

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, CANVAS_WIDTH, height);

  const accent = opts.primaryColor && /^#[0-9a-fA-F]{6}$/.test(opts.primaryColor) ? opts.primaryColor : "#4f46e5";

  let y = PADDING;
  ctx.fillStyle = accent;
  ctx.font = `700 19px ${FONT_STACK}`;
  ctx.fillText(opts.productName, PADDING, y + 16);
  y += 26;

  ctx.fillStyle = "#6b7280";
  ctx.font = `400 12px ${FONT_STACK}`;
  ctx.fillText("Transaction receipt", PADDING, y + 12);
  y += 32;

  ctx.fillStyle = opts.isCredit ? "#15803d" : "#111111";
  ctx.font = `700 30px ${FONT_STACK}`;
  ctx.fillText(opts.amountLabel, PADDING, y + 26);
  y += 48;

  ctx.strokeStyle = "#e5e7eb";
  ctx.beginPath();
  ctx.moveTo(PADDING, y);
  ctx.lineTo(CANVAS_WIDTH - PADDING, y);
  ctx.stroke();
  y += 20;

  rows.forEach(([label], i) => {
    ctx.fillStyle = "#8b90a0";
    ctx.font = LABEL_FONT;
    ctx.fillText(label.toUpperCase(), PADDING, y + 10);
    y += LABEL_HEIGHT;

    ctx.fillStyle = "#111111";
    ctx.font = VALUE_FONT;
    for (const line of rowLines[i]!) {
      ctx.fillText(line, PADDING, y + 12);
      y += LINE_HEIGHT;
    }
    y += ROW_SPACING;
  });

  ctx.fillStyle = "#9ca3af";
  ctx.font = `400 10px ${FONT_STACK}`;
  ctx.textAlign = "center";
  ctx.fillText(`Generated ${new Date().toLocaleString()}`, CANVAS_WIDTH / 2, height - PADDING / 2);
  ctx.textAlign = "left";

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Couldn't generate the receipt image"))), "image/png");
  });
}

export function receiptFileName(transactionId: string): string {
  return `receipt-${transactionId}.png`;
}

import { formatMinorAmount } from "@white-label/shared-types";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STATUS_VARIANT: Record<string, BadgeProps["variant"]> = {
  POSTED: "success",
  PENDING: "warning",
  REVERSED: "destructive",
};

const MOBILE_DESCRIPTION_LIMIT = 20;

/** Hard character cap, not just a CSS pixel-width clip — a guaranteed-short label regardless of font/zoom, since the full text is always one tap away via the row's own onClick (opens the transaction detail dialog). */
function truncateChars(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

interface TransactionCardRowProps {
  date: string;
  description: string;
  type?: string;
  status?: string;
  direction: string | null;
  amountMinor?: string | null;
  decimals?: number;
  currencyCode?: string;
  balanceMinor?: string;
  onClick?: () => void;
}

/** Mobile stand-in for a transaction/statement `<Table>` row — the same columns re-flowed into a
 * card so a 5-6 column table doesn't force horizontal scrolling on a phone-width screen. */
export function TransactionCardRow({ date, description, type, status, direction, amountMinor, decimals = 2, currencyCode, balanceMinor, onClick }: TransactionCardRowProps) {
  return (
    <div
      className={cn("flex w-full max-w-full items-start justify-between gap-3 overflow-hidden border-b border-border px-4 py-3 last:border-0", onClick && "cursor-pointer active:bg-muted/40")}
      onClick={onClick}
    >
      <div className="min-w-0 flex-1 overflow-hidden">
        <p className="truncate text-sm font-medium">
          <span className="sm:hidden">{truncateChars(description, MOBILE_DESCRIPTION_LIMIT)}</span>
          <span className="hidden sm:inline">{description}</span>
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">{new Date(date).toLocaleString()}</p>
        {(status || type) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {status && (
              <Badge variant={STATUS_VARIANT[status] ?? "secondary"} className="text-[10px]">
                {status}
              </Badge>
            )}
            {type && <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{type}</span>}
          </div>
        )}
      </div>
      <div className="max-w-[45%] shrink-0 text-right">
        {amountMinor !== null && amountMinor !== undefined ? (
          <p className={cn("truncate font-mono text-sm font-medium", direction === "CREDIT" ? "text-success" : "text-foreground")}>
            {direction === "CREDIT" ? "+" : direction === "DEBIT" ? "-" : ""}
            {formatMinorAmount(amountMinor, decimals)} {currencyCode ?? ""}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">—</p>
        )}
        {balanceMinor !== undefined && <p className="mt-0.5 truncate text-xs text-muted-foreground">Bal {formatMinorAmount(balanceMinor, decimals)}</p>}
      </div>
    </div>
  );
}

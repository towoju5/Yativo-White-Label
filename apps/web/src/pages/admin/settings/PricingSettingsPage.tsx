import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  updatePricingDefaultSchema,
  type PricingRule,
  type PricingService,
  type FeeType,
  type PricingMode,
  type UpdatePricingDefaultInput,
} from "@white-label/shared-types";
import { DollarSign, Pencil } from "lucide-react";
import { staffApi, ApiError } from "@/lib/api-client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const SERVICE_LABELS: Record<PricingService, string> = {
  PAYIN: "Payin (deposit)",
  PAYOUT: "Payout",
  VIRTUAL_ACCOUNT_DEPOSIT: "Virtual account deposit",
  CARD_CREATE: "Virtual card — create",
  CARD_FUND: "Virtual card — fund",
  CARD_WITHDRAW: "Virtual card — withdraw",
  CARD_TERMINATE: "Virtual card — terminate",
  BUSINESS_SPEND_CARD_CREATE: "Business Spend Card — create",
  BUSINESS_SPEND_CARD_FUND: "Business Spend Card — fund",
  BUSINESS_SPEND_CARD_WITHDRAW: "Business Spend Card — withdraw",
  BUSINESS_SPEND_CARD_TERMINATE: "Business Spend Card — terminate",
  BUSINESS_SPEND_CARD_ACTIVATE: "Business Spend Card — activate",
  BUSINESS_SPEND_CARD_SUSPEND: "Business Spend Card — suspend",
  BUSINESS_SPEND_CARD_PIN_UPDATE: "Business Spend Card — PIN update",
  BUSINESS_SPEND_CARD_LIMITS_UPDATE: "Business Spend Card — limits update",
};

// Only PAYIN carries a fee number reported by Yativo itself (quoted at deposit-initiation time) —
// for every other service, including PAYOUT (confirmed against Yativo's webhook guide: the real
// payout.updated payload has no fee field at all), "markup" has nothing to add on top of, so it
// behaves identically to standalone.
const SERVICES_WITH_UPSTREAM_FEE: PricingService[] = ["PAYIN"];

export const FEE_TYPE_LABELS: Record<FeeType, string> = {
  FIXED: "Fixed",
  PERCENTAGE: "Percentage",
  COMBINED: "Fixed + percentage",
};

export const PRICING_MODE_LABELS: Record<PricingMode, string> = {
  STANDALONE: "Standalone — ignore Yativo's fee",
  MARKUP: "Add on top of Yativo's fee",
};

export function formatFeeSummary(rule: { feeType: FeeType; fixedAmountMinor: string; percentageBps: number }): string {
  const fixed = `${rule.fixedAmountMinor} minor units`;
  const pct = `${(rule.percentageBps / 100).toFixed(2)}%`;
  if (rule.feeType === "FIXED") return fixed;
  if (rule.feeType === "PERCENTAGE") return pct;
  return `${fixed} + ${pct}`;
}

export default function PricingSettingsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<PricingRule | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "pricing"],
    queryFn: () => staffApi.get<PricingRule[]>("/admin/pricing"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ service, input }: { service: PricingService; input: UpdatePricingDefaultInput }) =>
      staffApi.patch<PricingRule>(`/admin/pricing/${service}`, input),
    onSuccess: () => {
      toast({ title: "Pricing updated" });
      queryClient.invalidateQueries({ queryKey: ["admin", "pricing"] });
      setEditing(null);
    },
    onError: (e) => toast({ variant: "destructive", title: "Couldn't update pricing", description: e instanceof ApiError ? e.message : undefined }),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Pricing</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Platform-wide default fees for each service — override per customer from their detail page.</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">Default fees</CardTitle>
          </div>
          <CardDescription>Applied to every customer unless they have a custom override for that service.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Service</TableHead>
                  <TableHead>Fee type</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Pricing mode</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data ?? []).map((rule) => (
                  <TableRow key={rule.service}>
                    <TableCell className="font-medium">{SERVICE_LABELS[rule.service]}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{FEE_TYPE_LABELS[rule.feeType]}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatFeeSummary(rule)}</TableCell>
                    <TableCell>
                      <Badge variant={rule.pricingMode === "MARKUP" ? "warning" : "secondary"}>{PRICING_MODE_LABELS[rule.pricingMode]}</Badge>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" aria-label={`Edit ${SERVICE_LABELS[rule.service]} pricing`} onClick={() => setEditing(rule)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <PricingRuleDialog
        rule={editing}
        onOpenChange={(v) => !v && setEditing(null)}
        onSubmit={(input) => editing && updateMutation.mutate({ service: editing.service, input })}
        isPending={updateMutation.isPending}
        hasUpstreamFee={editing ? SERVICES_WITH_UPSTREAM_FEE.includes(editing.service) : false}
        title={editing ? `Edit pricing — ${SERVICE_LABELS[editing.service]}` : ""}
      />
    </div>
  );
}

export function PricingRuleDialog({
  rule,
  onOpenChange,
  onSubmit,
  isPending,
  hasUpstreamFee,
  title,
}: {
  rule: { feeType: FeeType; pricingMode: PricingMode; fixedAmountMinor: string; percentageBps: number } | null;
  onOpenChange: (v: boolean) => void;
  onSubmit: (input: UpdatePricingDefaultInput) => void;
  isPending: boolean;
  hasUpstreamFee: boolean;
  title: string;
}) {
  const form = useForm<UpdatePricingDefaultInput>({
    resolver: zodResolver(updatePricingDefaultSchema),
    values: rule ? { feeType: rule.feeType, pricingMode: rule.pricingMode, fixedAmountMinor: rule.fixedAmountMinor, percentageBps: rule.percentageBps } : undefined,
  });
  const feeType = form.watch("feeType");
  const pricingMode = form.watch("pricingMode");

  return (
    <Dialog open={!!rule} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {rule && (
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Fee type</Label>
              <Select value={feeType} onValueChange={(v) => form.setValue("feeType", v as FeeType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(FEE_TYPE_LABELS) as FeeType[]).map((t) => (
                    <SelectItem key={t} value={t}>
                      {FEE_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {feeType !== "PERCENTAGE" && (
              <div className="space-y-1.5">
                <Label htmlFor="fixedAmountMinor">Fixed amount (minor units)</Label>
                <Input id="fixedAmountMinor" {...form.register("fixedAmountMinor")} />
                {form.formState.errors.fixedAmountMinor && <p className="text-xs text-destructive">{form.formState.errors.fixedAmountMinor.message}</p>}
              </div>
            )}
            {feeType !== "FIXED" && (
              <div className="space-y-1.5">
                <Label htmlFor="percentageBps">Percentage (basis points — 100 = 1%)</Label>
                <Input id="percentageBps" type="number" {...form.register("percentageBps", { valueAsNumber: true })} />
                {form.formState.errors.percentageBps && <p className="text-xs text-destructive">{form.formState.errors.percentageBps.message}</p>}
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Pricing mode</Label>
              <Select value={pricingMode} onValueChange={(v) => form.setValue("pricingMode", v as PricingMode)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(PRICING_MODE_LABELS) as PricingMode[]).map((m) => (
                    <SelectItem key={m} value={m}>
                      {PRICING_MODE_LABELS[m]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {hasUpstreamFee
                  ? "Yativo reports a fee for this service, so markup is additive."
                  : "Yativo doesn't report a fee for this service, so markup behaves the same as standalone."}
              </p>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={isPending}>
                Save changes
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

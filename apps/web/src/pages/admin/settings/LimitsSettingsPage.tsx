import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { WalletCurrencySettings, PlatformLimitDefaultDto } from "@white-label/shared-types";
import { Gauge, Plus, Trash2 } from "lucide-react";
import { staffApi, ApiError } from "@/lib/api-client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/** Minor-unit string <-> a display-friendly major-unit string, e.g. "50000" @ 2 decimals <-> "500.00". Null/empty means "no limit". */
function minorToMajorInput(minor: string | null, decimals: number): string {
  if (minor === null) return "";
  return (Number(minor) / 10 ** decimals).toFixed(decimals);
}
function majorInputToMinor(major: string, decimals: number): string | null {
  const trimmed = major.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 10 ** decimals).toString();
}

export default function LimitsSettingsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [addCurrency, setAddCurrency] = useState("");
  const [drafts, setDrafts] = useState<Record<string, { daily: string; monthly: string }>>({});

  const { data: currencySettings, isLoading: currenciesLoading } = useQuery({
    queryKey: ["admin", "settings", "wallet-currencies"],
    queryFn: () => staffApi.get<WalletCurrencySettings>("/admin/settings/wallet-currencies"),
  });

  const { data: limits, isLoading: limitsLoading } = useQuery({
    queryKey: ["admin", "settings", "limits"],
    queryFn: () => staffApi.get<PlatformLimitDefaultDto[]>("/admin/settings/limits"),
  });

  const decimalsByCode = new Map((currencySettings?.currencies ?? []).map((c) => [c.code, c.decimals]));
  const configuredCodes = new Set((limits ?? []).map((l) => l.currencyCode));
  const availableToAdd = (currencySettings?.currencies ?? []).filter((c) => c.isEnabledForCustomers && !configuredCodes.has(c.code));

  const saveMutation = useMutation({
    mutationFn: ({ currencyCode, dailyLimitMinor, monthlyLimitMinor }: { currencyCode: string; dailyLimitMinor: string | null; monthlyLimitMinor: string | null }) =>
      staffApi.put<PlatformLimitDefaultDto>(`/admin/settings/limits/${currencyCode}`, { dailyLimitMinor, monthlyLimitMinor }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "settings", "limits"] });
      toast({ title: "Limit saved" });
    },
    onError: (e) => toast({ variant: "destructive", title: "Couldn't save limit", description: e instanceof ApiError ? e.message : undefined }),
  });

  const removeMutation = useMutation({
    mutationFn: (currencyCode: string) => staffApi.put<PlatformLimitDefaultDto>(`/admin/settings/limits/${currencyCode}`, { dailyLimitMinor: null, monthlyLimitMinor: null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "settings", "limits"] });
      toast({ title: "Limit removed" });
    },
    onError: (e) => toast({ variant: "destructive", title: "Couldn't remove limit", description: e instanceof ApiError ? e.message : undefined }),
  });

  const draftFor = (l: PlatformLimitDefaultDto) => {
    const decimals = decimalsByCode.get(l.currencyCode) ?? 2;
    return drafts[l.currencyCode] ?? { daily: minorToMajorInput(l.dailyLimitMinor, decimals), monthly: minorToMajorInput(l.monthlyLimitMinor, decimals) };
  };

  const updateDraft = (code: string, field: "daily" | "monthly", value: string, l: PlatformLimitDefaultDto) => {
    setDrafts((d) => ({ ...d, [code]: { ...draftFor(l), [field]: value } }));
  };

  const save = (l: PlatformLimitDefaultDto) => {
    const decimals = decimalsByCode.get(l.currencyCode) ?? 2;
    const draft = draftFor(l);
    saveMutation.mutate({
      currencyCode: l.currencyCode,
      dailyLimitMinor: majorInputToMinor(draft.daily, decimals),
      monthlyLimitMinor: majorInputToMinor(draft.monthly, decimals),
    });
  };

  const addMutation = useMutation({
    mutationFn: (currencyCode: string) => staffApi.put<PlatformLimitDefaultDto>(`/admin/settings/limits/${currencyCode}`, { dailyLimitMinor: null, monthlyLimitMinor: null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "settings", "limits"] });
      setAddCurrency("");
    },
    onError: (e) => toast({ variant: "destructive", title: "Couldn't add currency", description: e instanceof ApiError ? e.message : undefined }),
  });

  const isLoading = currenciesLoading || limitsLoading;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Withdrawal limits</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Platform-wide default payout limits per currency. A currency with no daily/monthly value set has no limit at all — this is opt-in.
          Per-customer overrides can be set from a customer's detail page.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Gauge className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">Default limits by currency</CardTitle>
          </div>
          <CardDescription>Leave a field blank for no limit on that window.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : (
            <>
              {(limits ?? []).length > 0 && (
                <div className="rounded-lg border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Currency</TableHead>
                        <TableHead>Daily limit</TableHead>
                        <TableHead>Monthly limit</TableHead>
                        <TableHead className="w-20" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(limits ?? []).map((l) => {
                        const draft = draftFor(l);
                        return (
                          <TableRow key={l.currencyCode}>
                            <TableCell className="font-medium">{l.currencyCode}</TableCell>
                            <TableCell>
                              <Input
                                className="w-32"
                                placeholder="No limit"
                                value={draft.daily}
                                onChange={(e) => updateDraft(l.currencyCode, "daily", e.target.value, l)}
                                onBlur={() => save(l)}
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                className="w-32"
                                placeholder="No limit"
                                value={draft.monthly}
                                onChange={(e) => updateDraft(l.currencyCode, "monthly", e.target.value, l)}
                                onBlur={() => save(l)}
                              />
                            </TableCell>
                            <TableCell>
                              <Button variant="ghost" size="icon" onClick={() => removeMutation.mutate(l.currencyCode)} disabled={removeMutation.isPending}>
                                <Trash2 className="h-4 w-4 text-muted-foreground" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}

              <div className="flex items-end gap-2">
                <div className="space-y-1.5">
                  <Label>Add a currency</Label>
                  <Select value={addCurrency} onValueChange={setAddCurrency}>
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="Select currency" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableToAdd.map((c) => (
                        <SelectItem key={c.code} value={c.code}>
                          {c.code} — {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button variant="outline" disabled={!addCurrency || addMutation.isPending} onClick={() => addMutation.mutate(addCurrency)}>
                  <Plus className="h-4 w-4" /> Add
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

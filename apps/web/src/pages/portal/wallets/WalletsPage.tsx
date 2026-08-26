import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import type { WalletBalance, PortalWalletCurrencyOptions } from "@white-label/shared-types";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { portalApi, ApiError } from "@/lib/api-client";
import { useToast } from "@/hooks/use-toast";
import { useTemplate } from "@/templates/useTemplate";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function PortalWalletsPage() {
  const T = useTemplate();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [addingCurrency, setAddingCurrency] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["portal", "wallets"],
    queryFn: () => portalApi.get<WalletBalance[]>("/portal/wallets"),
  });

  const currencyOptionsQuery = useQuery({
    queryKey: ["portal", "wallets", "currencies"],
    queryFn: () => portalApi.get<PortalWalletCurrencyOptions>("/portal/wallets/currencies"),
  });

  const addMutation = useMutation({
    mutationFn: (currencyCode: string) => portalApi.post<WalletBalance>("/portal/wallets", { currencyCode }),
    onSuccess: () => {
      toast({ title: t("wallets.walletAdded", "Wallet added") });
      queryClient.invalidateQueries({ queryKey: ["portal", "wallets"] });
      queryClient.invalidateQueries({ queryKey: ["portal", "wallets", "currencies"] });
      setAddingCurrency("");
    },
    onError: (e) => toast({ variant: "destructive", title: t("wallets.addWalletError", "Couldn't add wallet"), description: e instanceof ApiError ? e.message : undefined }),
  });

  const addable = currencyOptionsQuery.data?.mode === "SELF_SERVICE" ? currencyOptionsQuery.data.addable : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">{t("wallets.title", "Wallets")}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{t("wallets.subtitle", "Your balances across every currency")}</p>
        </div>
        {addable.length > 0 && (
          <div className="flex items-center gap-2">
            <Select value={addingCurrency} onValueChange={setAddingCurrency}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder={t("wallets.addCurrencyPlaceholder", "Add currency")} />
              </SelectTrigger>
              <SelectContent>
                {addable.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    {c.code} — {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" disabled={!addingCurrency || addMutation.isPending} onClick={() => addMutation.mutate(addingCurrency)}>
              <Plus className="h-4 w-4" /> {t("wallets.add", "Add")}
            </Button>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : !data || data.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          {t("wallets.empty", "No wallets yet. They'll appear here once you have a balance.")}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((w) => (
            <T.WalletBalanceCard
              key={w.walletId}
              currencyCode={w.currencyCode}
              decimals={w.decimals}
              symbol={w.symbol}
              availableMinor={w.availableMinor}
              pendingMinor={w.pendingMinor}
              label={t("wallets.walletLabel", "Wallet")}
              onClick={() => navigate(`/portal/wallets/${w.walletId}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { AdminPaymentGateway, DepositCountry, PayoutCountry, PaymentGatewayKind } from "@white-label/shared-types";
import { Banknote } from "lucide-react";
import { staffApi, ApiError } from "@/lib/api-client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function GatewayTab({ kind }: { kind: PaymentGatewayKind }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [country, setCountry] = useState<string>("");
  const path = kind === "PAYIN" ? "payin" : "payout";

  const { data: countries, isLoading: countriesLoading } = useQuery({
    queryKey: ["admin", "payment-gateways", path, "countries"],
    queryFn: () => staffApi.get<(DepositCountry | PayoutCountry)[]>(`/admin/settings/payment-gateways/${path}/countries`),
  });

  const { data: gateways, isLoading: gatewaysLoading } = useQuery({
    queryKey: ["admin", "payment-gateways", path, country],
    queryFn: () => staffApi.get<AdminPaymentGateway[]>(`/admin/settings/payment-gateways/${path}`, { country }),
    enabled: !!country,
  });

  const toggleMutation = useMutation({
    mutationFn: ({ gatewayId, isEnabledForCustomers }: { gatewayId: string; isEnabledForCustomers: boolean }) =>
      staffApi.patch(`/admin/settings/payment-gateways/${kind}/${gatewayId}`, { isEnabledForCustomers }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "payment-gateways", path, country] }),
    onError: (e) => toast({ variant: "destructive", title: "Couldn't update", description: e instanceof ApiError ? e.message : undefined }),
  });

  return (
    <div className="space-y-4">
      <div className="max-w-xs space-y-1.5">
        <Select value={country} onValueChange={setCountry} disabled={countriesLoading}>
          <SelectTrigger>
            <SelectValue placeholder="Select a country" />
          </SelectTrigger>
          <SelectContent>
            {countries?.map((c) => (
              <SelectItem key={c.iso3} value={c.iso3}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!country ? (
        <p className="text-sm text-muted-foreground">Pick a country to see its payment rails.</p>
      ) : gatewaysLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Method</TableHead>
              <TableHead>Currency</TableHead>
              <TableHead>Yativo status</TableHead>
              <TableHead className="text-right">Enabled for customers</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(gateways ?? []).map((g) => (
              <TableRow key={g.gatewayId}>
                <TableCell className="font-medium">{g.methodName}</TableCell>
                <TableCell className="text-muted-foreground">{g.currency ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant={g.active ? "secondary" : "outline"}>{g.active ? "Active" : "Inactive on Yativo"}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Switch
                    checked={g.isEnabledForCustomers}
                    disabled={toggleMutation.isPending}
                    onCheckedChange={(checked) => toggleMutation.mutate({ gatewayId: g.gatewayId, isEnabledForCustomers: checked })}
                  />
                </TableCell>
              </TableRow>
            ))}
            {gateways?.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                  No payment rails for this country.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

export default function PaymentGatewaysSettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Payment gateways</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Turn a rail off to hide it from customers regardless of whether Yativo reports it as active — this is this platform's own product
          decision, not Yativo's.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Banknote className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">Rails by country</CardTitle>
          </div>
          <CardDescription>Off by default only where an admin has explicitly disabled a rail — everything else stays available.</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="deposit">
            <TabsList>
              <TabsTrigger value="deposit">Deposits</TabsTrigger>
              <TabsTrigger value="payout">Payouts</TabsTrigger>
            </TabsList>
            <TabsContent value="deposit" className="pt-4">
              <GatewayTab kind="PAYIN" />
            </TabsContent>
            <TabsContent value="payout" className="pt-4">
              <GatewayTab kind="PAYOUT" />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

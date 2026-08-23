import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Customer, CustomerEndorsement } from "@white-label/shared-types";
import { Search, User } from "lucide-react";
import { staffApi, ApiError } from "@/lib/api-client";
import type { Paginated } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EndorsementsTable } from "@/components/endorsements/EndorsementsTable";

const KYC_VARIANT: Record<string, "success" | "warning" | "destructive" | "secondary"> = {
  APPROVED: "success",
  PENDING: "warning",
  REJECTED: "destructive",
  NOT_STARTED: "secondary",
};

export default function EndorsementsPage() {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const customersQuery = useQuery({
    queryKey: ["admin", "customers", { search, forEndorsements: true }],
    queryFn: () => staffApi.get<Paginated<Customer>>("/admin/customers", { search: search || undefined, page: 1, pageSize: 20 }),
  });

  const endorsementsQuery = useQuery({
    queryKey: ["admin", "customers", selectedId, "endorsements"],
    queryFn: () => staffApi.get<CustomerEndorsement[]>(`/admin/customers/${selectedId}/endorsements`),
    enabled: !!selectedId,
    retry: (failureCount, error) => !(error instanceof ApiError && error.status === 409) && failureCount < 2,
  });

  const customers = customersQuery.data?.items ?? [];
  const selected = customers.find((c) => c.id === selectedId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Endorsements</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Look up a customer's Yativo verification checklist by service.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-sm">Find a customer</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search name or email…"
                className="pl-8"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {customersQuery.isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12" />
                ))}
              </div>
            ) : customers.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No customers match this search.</p>
            ) : (
              <div className="max-h-[28rem] space-y-1 overflow-y-auto">
                {customers.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedId(c.id)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left transition-colors",
                      c.id === selectedId ? "border-primary bg-primary/5" : "border-transparent hover:bg-muted/50",
                    )}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{c.fullName ?? c.businessName ?? c.email}</p>
                      <p className="truncate text-xs text-muted-foreground">{c.email}</p>
                    </div>
                    <Badge variant={KYC_VARIANT[c.kycStatus] ?? "secondary"} className="ml-2 shrink-0 text-[10px]">
                      {c.kycStatus.replace("_", " ")}
                    </Badge>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-primary" />
              <CardTitle className="text-sm">{selected ? (selected.fullName ?? selected.businessName ?? selected.email) : "Select a customer"}</CardTitle>
            </div>
            <CardDescription>{selected ? selected.email : "Pick someone from the list to view their endorsement checklist."}</CardDescription>
          </CardHeader>
          <CardContent>
            {!selectedId ? (
              <p className="py-10 text-center text-sm text-muted-foreground">No customer selected yet.</p>
            ) : (
              <EndorsementsTable
                endorsements={endorsementsQuery.data}
                isLoading={endorsementsQuery.isLoading}
                errorMessage={endorsementsQuery.isError ? (endorsementsQuery.error instanceof ApiError ? endorsementsQuery.error.message : "Couldn't load endorsements.") : null}
                onGenerateLink={(service) => staffApi.post<CustomerEndorsement[]>(`/admin/customers/${selectedId}/endorsements/${service}/link`)}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import type { CustomerEndorsement } from "@white-label/shared-types";
import { BadgeCheck, ShieldCheck } from "lucide-react";
import { portalApi, ApiError } from "@/lib/api-client";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EndorsementsTable } from "@/components/endorsements/EndorsementsTable";

const STATUS_VARIANT: Record<string, "success" | "warning" | "destructive" | "secondary"> = {
  APPROVED: "success",
  PENDING: "warning",
  REJECTED: "destructive",
  NOT_STARTED: "secondary",
};

const STATUS_COPY: Record<string, string> = {
  NOT_STARTED: "Required before you can send money, hold a virtual account, or get a card.",
  PENDING: "We've received your details and are reviewing them — we'll notify you once it's decided.",
  APPROVED: "You're verified. Full access to sending, cards, and virtual accounts.",
  REJECTED: "Your last submission wasn't approved — start a new one below.",
};

export default function ProfilePage() {
  const { user } = useCustomerAuth();
  const navigate = useNavigate();

  const kycQuery = useQuery({
    queryKey: ["portal", "kyc"],
    queryFn: () => portalApi.get<{ kycStatus: string; kycSubmittedAt: string | null }>("/portal/kyc"),
  });

  const status = kycQuery.data?.kycStatus ?? user?.kycStatus ?? "NOT_STARTED";
  const canStart = status === "NOT_STARTED" || status === "REJECTED";

  const endorsementsQuery = useQuery({
    queryKey: ["portal", "kyc", "endorsements"],
    queryFn: () => portalApi.get<CustomerEndorsement[]>("/portal/kyc/endorsements"),
    // Only skip retries for the one genuinely non-transient case (not registered on Yativo yet,
    // 409) — everything else is worth a couple of retries rather than sticking on a one-off
    // network blip against this endpoint's live upstream call to Yativo.
    retry: (failureCount, error) => !(error instanceof ApiError && error.status === 409) && failureCount < 2,
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Profile &amp; verification</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Manage your identity details</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Email</span>
            <span>{user?.email}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Type</span>
            <span>{user?.type}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">Identity verification</CardTitle>
            <Badge variant={STATUS_VARIANT[status] ?? "secondary"} className="ml-auto">
              {status.replace("_", " ")}
            </Badge>
          </div>
          <CardDescription>{STATUS_COPY[status] ?? STATUS_COPY.NOT_STARTED}</CardDescription>
        </CardHeader>
        {canStart && (
          <CardContent>
            <Button onClick={() => navigate("/portal/verify")}>{status === "REJECTED" ? "Restart verification" : "Start verification"}</Button>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <BadgeCheck className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">Endorsements</CardTitle>
          </div>
          <CardDescription>Per-service verification required for certain features, like local bank transfers or virtual cards.</CardDescription>
        </CardHeader>
        <CardContent>
          <EndorsementsTable
            endorsements={endorsementsQuery.data}
            isLoading={endorsementsQuery.isLoading}
            errorMessage={
              endorsementsQuery.isError ? (endorsementsQuery.error instanceof ApiError ? endorsementsQuery.error.message : "Couldn't load endorsements.") : null
            }
            onGenerateLink={(service) => portalApi.post<CustomerEndorsement[]>(`/portal/kyc/endorsements/${service}/link`)}
          />
        </CardContent>
      </Card>
    </div>
  );
}

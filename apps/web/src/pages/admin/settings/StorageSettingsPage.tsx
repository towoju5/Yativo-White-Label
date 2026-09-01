import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { STORAGE_PROVIDER_LABELS, STORAGE_PROVIDERS, type StorageProviderId } from "@white-label/shared-types";
import { staffApi, ApiError } from "@/lib/api-client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

type S3LikeConfig = { bucket: string; region: string; endpoint: string; publicBaseUrl: string; accessKeyId?: string; accessKeyIdConfigured: boolean; secretAccessKey?: string; secretAccessKeyConfigured: boolean };
type BunnyConfig = { storageZone: string; region: string; publicBaseUrl: string; apiKey?: string; apiKeyConfigured: boolean };
type GcsConfig = { projectId: string; bucket: string; clientEmail: string; publicBaseUrl: string; privateKey?: string; privateKeyConfigured: boolean };

type Config = {
  provider: StorageProviderId;
  s3: S3LikeConfig;
  r2: S3LikeConfig;
  spaces: S3LikeConfig;
  b2: S3LikeConfig;
  bunny: BunnyConfig;
  gcs: GcsConfig;
};

const emptyS3: S3LikeConfig = { bucket: "", region: "", endpoint: "", publicBaseUrl: "", accessKeyIdConfigured: false, secretAccessKeyConfigured: false };
const emptyConfig: Config = {
  provider: "local",
  s3: { ...emptyS3 },
  r2: { ...emptyS3 },
  spaces: { ...emptyS3 },
  b2: { ...emptyS3 },
  bunny: { storageZone: "", region: "", publicBaseUrl: "", apiKeyConfigured: false },
  gcs: { projectId: "", bucket: "", clientEmail: "", publicBaseUrl: "", privateKeyConfigured: false },
};

function secretHint(configured: boolean) {
  return configured ? "Currently set — leave blank to keep it" : "Not set";
}

function S3LikeFields({ value, onChange, endpointHint }: { value: S3LikeConfig; onChange: (next: S3LikeConfig) => void; endpointHint: string }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Bucket</Label>
          <Input value={value.bucket} onChange={(e) => onChange({ ...value, bucket: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>Region</Label>
          <Input value={value.region} onChange={(e) => onChange({ ...value, region: e.target.value })} />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Access key ID</Label>
          <Input type="password" placeholder={secretHint(value.accessKeyIdConfigured)} value={value.accessKeyId ?? ""} onChange={(e) => onChange({ ...value, accessKeyId: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>Secret access key</Label>
          <Input
            type="password"
            placeholder={secretHint(value.secretAccessKeyConfigured)}
            value={value.secretAccessKey ?? ""}
            onChange={(e) => onChange({ ...value, secretAccessKey: e.target.value })}
          />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Endpoint</Label>
          <Input placeholder={endpointHint} value={value.endpoint} onChange={(e) => onChange({ ...value, endpoint: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>Public base URL (optional)</Label>
          <Input placeholder="https://cdn.example.com" value={value.publicBaseUrl} onChange={(e) => onChange({ ...value, publicBaseUrl: e.target.value })} />
        </div>
      </div>
    </div>
  );
}

export default function StorageSettingsPage() {
  const { toast } = useToast();
  const [config, setConfig] = useState<Config>(emptyConfig);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "storage-settings"],
    queryFn: () => staffApi.get<Config>("/admin/settings/storage"),
  });

  useEffect(() => {
    if (data) setConfig(data);
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () => staffApi.put<Config>("/admin/settings/storage", config),
    onSuccess: (saved) => {
      setConfig(saved);
      toast({ title: "Storage settings saved" });
    },
    onError: (e) => toast({ variant: "destructive", title: "Couldn't save settings", description: e instanceof ApiError ? e.message : undefined }),
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Storage</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Where uploaded assets (like the statement stamp) are stored. Secret values are encrypted at rest and never shown again after saving.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Active provider</CardTitle>
          <CardDescription>Local disk works out of the box with no setup — switch to a bucket/CDN provider for a multi-server or production deployment.</CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={config.provider} onValueChange={(v) => setConfig((c) => ({ ...c, provider: v as StorageProviderId }))}>
            <SelectTrigger className="w-72">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STORAGE_PROVIDERS.map((id) => (
                <SelectItem key={id} value={id}>
                  {STORAGE_PROVIDER_LABELS[id]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {config.provider === "s3" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Amazon S3</CardTitle>
            <CardDescription>Leave endpoint blank to use AWS's standard regional endpoint.</CardDescription>
          </CardHeader>
          <CardContent>
            <S3LikeFields value={config.s3} onChange={(s3) => setConfig((c) => ({ ...c, s3 }))} endpointHint="Leave blank for real AWS S3" />
          </CardContent>
        </Card>
      )}

      {config.provider === "r2" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cloudflare R2</CardTitle>
            <CardDescription>Endpoint is your R2 account's S3 API endpoint, e.g. https://&lt;account-id&gt;.r2.cloudflarestorage.com.</CardDescription>
          </CardHeader>
          <CardContent>
            <S3LikeFields value={config.r2} onChange={(r2) => setConfig((c) => ({ ...c, r2 }))} endpointHint="https://<account-id>.r2.cloudflarestorage.com" />
          </CardContent>
        </Card>
      )}

      {config.provider === "spaces" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">DigitalOcean Spaces</CardTitle>
            <CardDescription>Endpoint is your Space's regional endpoint, e.g. https://nyc3.digitaloceanspaces.com.</CardDescription>
          </CardHeader>
          <CardContent>
            <S3LikeFields value={config.spaces} onChange={(spaces) => setConfig((c) => ({ ...c, spaces }))} endpointHint="https://nyc3.digitaloceanspaces.com" />
          </CardContent>
        </Card>
      )}

      {config.provider === "b2" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Backblaze B2</CardTitle>
            <CardDescription>Use B2's S3-compatible endpoint, e.g. https://s3.us-west-004.backblazeb2.com.</CardDescription>
          </CardHeader>
          <CardContent>
            <S3LikeFields value={config.b2} onChange={(b2) => setConfig((c) => ({ ...c, b2 }))} endpointHint="https://s3.us-west-004.backblazeb2.com" />
          </CardContent>
        </Card>
      )}

      {config.provider === "bunny" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Bunny.net Storage</CardTitle>
            <CardDescription>Public base URL is your pull zone's domain (or a custom domain in front of it).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Storage zone</Label>
                <Input value={config.bunny.storageZone} onChange={(e) => setConfig((c) => ({ ...c, bunny: { ...c.bunny, storageZone: e.target.value } }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Region (optional)</Label>
                <Input placeholder="ny, la, sg, de…" value={config.bunny.region} onChange={(e) => setConfig((c) => ({ ...c, bunny: { ...c.bunny, region: e.target.value } }))} />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Access key (API key)</Label>
                <Input
                  type="password"
                  placeholder={secretHint(config.bunny.apiKeyConfigured)}
                  value={config.bunny.apiKey ?? ""}
                  onChange={(e) => setConfig((c) => ({ ...c, bunny: { ...c.bunny, apiKey: e.target.value } }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Public base URL</Label>
                <Input
                  placeholder="https://my-zone.b-cdn.net"
                  value={config.bunny.publicBaseUrl}
                  onChange={(e) => setConfig((c) => ({ ...c, bunny: { ...c.bunny, publicBaseUrl: e.target.value } }))}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {config.provider === "gcs" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Google Cloud Storage</CardTitle>
            <CardDescription>Service-account credentials from a GCP JSON key file.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Project ID</Label>
                <Input value={config.gcs.projectId} onChange={(e) => setConfig((c) => ({ ...c, gcs: { ...c.gcs, projectId: e.target.value } }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Bucket</Label>
                <Input value={config.gcs.bucket} onChange={(e) => setConfig((c) => ({ ...c, gcs: { ...c.gcs, bucket: e.target.value } }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Client email</Label>
              <Input value={config.gcs.clientEmail} onChange={(e) => setConfig((c) => ({ ...c, gcs: { ...c.gcs, clientEmail: e.target.value } }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Private key</Label>
              <Input
                type="password"
                placeholder={secretHint(config.gcs.privateKeyConfigured)}
                value={config.gcs.privateKey ?? ""}
                onChange={(e) => setConfig((c) => ({ ...c, gcs: { ...c.gcs, privateKey: e.target.value } }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Public base URL (optional)</Label>
              <Input
                placeholder="https://cdn.example.com"
                value={config.gcs.publicBaseUrl}
                onChange={(e) => setConfig((c) => ({ ...c, gcs: { ...c.gcs, publicBaseUrl: e.target.value } }))}
              />
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end">
        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
          {saveMutation.isPending ? "Saving…" : "Save storage settings"}
        </Button>
      </div>
    </div>
  );
}

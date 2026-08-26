import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { startRegistration, browserSupportsWebAuthn } from "@simplewebauthn/browser";
import { KeyRound, Trash2 } from "lucide-react";
import type { BrandingConfig, PasskeyDto } from "@white-label/shared-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { staffApi, ApiError } from "@/lib/api-client";
import { useToast } from "@/hooks/use-toast";
import { fetchBranding } from "@/theme/branding";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------
type Config = {
  apple: {
    enabled: boolean;
    clientId: string;
    teamId: string;
    keyId: string;
    privateKeyConfigured?: boolean;
    privateKey?: string;
  };
  facebook: {
    enabled: boolean;
    clientId: string;
    clientSecretConfigured?: boolean;
    clientSecret?: string;
  };
  twitter: {
    enabled: boolean;
    clientId: string;
    clientSecretConfigured?: boolean;
    clientSecret?: string;
  };
};

type ProviderName = "apple" | "facebook" | "twitter";

const emptyConfig: Config = {
  apple: { enabled: false, clientId: "", teamId: "", keyId: "" },
  facebook: { enabled: false, clientId: "" },
  twitter: { enabled: false, clientId: "" },
};

// -----------------------------------------------------------------------------
// Sub-components
// -----------------------------------------------------------------------------
interface ProviderSectionProps {
  name: ProviderName;
  title: string;
  fields: Array<[string, string, boolean?]>;
  config: Config[ProviderName];
  onUpdate: (field: string, value: string | boolean) => void;
}

function ProviderSection({ name, title, fields, config, onUpdate }: ProviderSectionProps) {
  return (
    <section className="space-y-3 rounded-lg border p-4">
      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={config.enabled}
          onChange={(e) => onUpdate("enabled", e.target.checked)}
          className="h-4 w-4 rounded border-gray-300"
        />
        <h2 className="font-medium">{title}</h2>
      </div>
      {fields.map(([field, label, secret]) => (
        <div key={field} className="space-y-1">
          <Label>
            {label}
            {secret && (
              <span className="text-xs text-muted-foreground">
                {" "}
                (leave blank to keep current value)
              </span>
            )}
          </Label>
          <Input
            type={secret ? "password" : "text"}
            value={(config as unknown as Record<string, string>)[field] ?? ""}
            onChange={(e) => onUpdate(field, e.target.value)}
          />
        </div>
      ))}
    </section>
  );
}

// -----------------------------------------------------------------------------
// Passkeys — manage the currently signed-in staff member's own registered passkeys.
// -----------------------------------------------------------------------------
function PasskeysSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [registering, setRegistering] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const { data: passkeys, isLoading } = useQuery({
    queryKey: ["admin", "passkeys"],
    queryFn: () => staffApi.get<PasskeyDto[]>("/admin/passkeys"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => staffApi.del(`/admin/passkeys/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "passkeys"] }),
    onError: (e) => toast({ variant: "destructive", title: "Couldn't remove passkey", description: e instanceof ApiError ? e.message : undefined }),
  });

  const addPasskey = async () => {
    setAddError(null);
    setRegistering(true);
    try {
      const options = await staffApi.post<Record<string, unknown>>("/admin/passkeys/register/options");
      const response = await startRegistration({ optionsJSON: options as unknown as Parameters<typeof startRegistration>[0]["optionsJSON"] });
      await staffApi.post("/admin/passkeys/register/verify", { response, name: name.trim() || "Passkey" });
      queryClient.invalidateQueries({ queryKey: ["admin", "passkeys"] });
      setAddOpen(false);
      setName("");
    } catch (e) {
      // A cancelled prompt or an already-registered authenticator throws a plain DOMException, not an ApiError.
      setAddError(e instanceof ApiError ? e.message : "Couldn't register that passkey.");
    } finally {
      setRegistering(false);
    }
  };

  return (
    <section className="space-y-3 rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-medium">Your passkeys</h2>
          <p className="text-xs text-muted-foreground">Sign in without a password using Face ID, Touch ID, Windows Hello, or a security key.</p>
        </div>
        {browserSupportsWebAuthn() && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setAddError(null);
              setAddOpen(true);
            }}
          >
            <KeyRound className="h-4 w-4" /> Add a passkey
          </Button>
        )}
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : passkeys && passkeys.length > 0 ? (
        <ul className="divide-y divide-border rounded-md border">
          {passkeys.map((p) => (
            <li key={p.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <div>
                <p className="font-medium">{p.name}</p>
                <p className="text-xs text-muted-foreground">
                  Added {new Date(p.createdAt).toLocaleDateString()}
                  {p.lastUsedAt ? ` · last used ${new Date(p.lastUsedAt).toLocaleDateString()}` : ""}
                </p>
              </div>
              <button
                type="button"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => deleteMutation.mutate(p.id)}
                disabled={deleteMutation.isPending}
                aria-label={`Remove ${p.name}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">No passkeys registered yet.</p>
      )}

      <Dialog open={addOpen} onOpenChange={(v) => !registering && setAddOpen(v)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a passkey</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              addPasskey();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="passkeyName">Name this device</Label>
              <Input id="passkeyName" autoFocus placeholder="e.g. MacBook Touch ID" value={name} onChange={(e) => setName(e.target.value)} />
              {addError && <p className="text-xs text-destructive">{addError}</p>}
            </div>
            <Button type="submit" className="w-full" disabled={registering}>
              {registering ? "Waiting for browser…" : "Continue"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}

// -----------------------------------------------------------------------------
// Main Component
// -----------------------------------------------------------------------------
export default function AuthenticationSettingsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [config, setConfig] = useState<Config>(emptyConfig);
  const [adminLoginPath, setAdminLoginPath] = useState("");

  const { data } = useQuery({
    queryKey: ["admin", "authentication-settings"],
    queryFn: () => staffApi.get<Config>("/admin/settings/authentication"),
  });

  const { data: branding } = useQuery({ queryKey: ["branding"], queryFn: fetchBranding });

  useEffect(() => {
    if (data) {
      setConfig(data);
    }
  }, [data]);

  useEffect(() => {
    if (branding) setAdminLoginPath(branding.adminLoginPath);
  }, [branding]);

  const saveMutation = useMutation({
    mutationFn: () => staffApi.put<Config>("/admin/settings/authentication", config),
    onSuccess: (saved) => {
      setConfig(saved);
      toast({ title: "Authentication settings saved" });
    },
    onError: (e) =>
      toast({
        variant: "destructive",
        title: "Couldn't save settings",
        description: e instanceof ApiError ? e.message : undefined,
      }),
  });

  const saveLoginPathMutation = useMutation({
    mutationFn: () => staffApi.patch<BrandingConfig>("/admin/branding", { adminLoginPath }),
    onSuccess: (updated) => {
      queryClient.setQueryData(["branding"], updated);
      toast({ title: "Admin login URL saved", description: `Staff now sign in at ${updated.adminLoginPath}` });
    },
    onError: (e) =>
      toast({
        variant: "destructive",
        title: "Couldn't save admin login URL",
        description: e instanceof ApiError ? e.message : undefined,
      }),
  });

  const update = (provider: keyof Config, field: string, value: string | boolean) => {
    setConfig((c) => ({
      ...c,
      [provider]: {
        ...c[provider],
        [field]: value,
      },
    } as Config));
  };

  return (
    <div className="max-w-5xl space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="font-heading text-2xl font-semibold">Authentication</h1>
        <p className="text-sm text-muted-foreground">
          OAuth credentials are encrypted at rest. Secret values are never shown after saving.
        </p>
      </div>

      {/* Admin login URL */}
      <section className="space-y-3 rounded-lg border p-4">
        <div>
          <h2 className="font-medium">Admin login URL</h2>
          <p className="text-xs text-muted-foreground">
            The path staff use to sign in to this dashboard. Changing it immediately invalidates the old link —
            share the new one with your team before saving.
          </p>
        </div>
        <div className="max-w-sm space-y-1">
          <Label htmlFor="adminLoginPath">Path</Label>
          <Input
            id="adminLoginPath"
            value={adminLoginPath}
            onChange={(e) => setAdminLoginPath(e.target.value)}
            placeholder="/admin/login"
          />
        </div>
        <Button
          onClick={() => saveLoginPathMutation.mutate()}
          disabled={saveLoginPathMutation.isPending || adminLoginPath === branding?.adminLoginPath}
        >
          {saveLoginPathMutation.isPending ? "Saving…" : "Save admin login URL"}
        </Button>
      </section>

      {/* Grid Layout: 1 column on mobile, 2 columns on large screens */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ProviderSection
          name="apple"
          title="Sign in with Apple"
          fields={[
            ["clientId", "Services ID"],
            ["teamId", "Team ID"],
            ["keyId", "Key ID"],
            ["privateKey", "Private key (.p8)", true],
          ]}
          config={config.apple}
          onUpdate={(field, value) => update("apple", field, value)}
        />

        <ProviderSection
          name="facebook"
          title="Facebook Login"
          fields={[
            ["clientId", "App ID"],
            ["clientSecret", "App secret", true],
          ]}
          config={config.facebook}
          onUpdate={(field, value) => update("facebook", field, value)}
        />

        <ProviderSection
          name="twitter"
          title="Twitter / X Login"
          fields={[
            ["clientId", "Client ID"],
            ["clientSecret", "Client secret", true],
          ]}
          config={config.twitter}
          onUpdate={(field, value) => update("twitter", field, value)}
        />

        <PasskeysSection />
      </div>

      {/* Save Button */}
      <div className="flex justify-end pt-4">
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className="w-full sm:w-auto"
        >
          {saveMutation.isPending ? "Saving…" : "Save authentication settings"}
        </Button>
      </div>
    </div>
  );
}
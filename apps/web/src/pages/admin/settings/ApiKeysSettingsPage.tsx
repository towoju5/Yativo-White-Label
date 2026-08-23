import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createApiKeySchema, type ApiKeyDto, type CreateApiKeyInput, type CreateApiKeyResult } from "@white-label/shared-types";
import { Copy, KeyRound, Plus, Trash2 } from "lucide-react";
import { staffApi, ApiError } from "@/lib/api-client";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export default function ApiKeysSettingsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [created, setCreated] = useState<CreateApiKeyResult | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "api-keys"],
    queryFn: () => staffApi.get<ApiKeyDto[]>("/admin/api-keys"),
  });

  const form = useForm<CreateApiKeyInput>({ resolver: zodResolver(createApiKeySchema) });

  const createMutation = useMutation({
    mutationFn: (input: CreateApiKeyInput) => staffApi.post<CreateApiKeyResult>("/admin/api-keys", input),
    onSuccess: (res) => {
      setCreated(res);
      queryClient.invalidateQueries({ queryKey: ["admin", "api-keys"] });
      form.reset();
    },
    onError: (e) => toast({ variant: "destructive", title: "Couldn't create key", description: e instanceof ApiError ? e.message : undefined }),
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => staffApi.del(`/admin/api-keys/${id}`),
    onSuccess: () => {
      toast({ title: "API key revoked" });
      queryClient.invalidateQueries({ queryKey: ["admin", "api-keys"] });
    },
    onError: (e) => toast({ variant: "destructive", title: "Couldn't revoke key", description: e instanceof ApiError ? e.message : undefined }),
  });

  const copy = (value: string) => {
    navigator.clipboard?.writeText(value);
    toast({ title: "Copied to clipboard" });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">API keys</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Keys for your own integrations against this platform</p>
        </div>
        <Dialog
          open={open}
          onOpenChange={(v) => {
            setOpen(v);
            if (!v) setCreated(null);
          }}
        >
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4" /> New key
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create an API key</DialogTitle>
            </DialogHeader>
            {created ? (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Copy this key now — it won't be shown again. Store it somewhere safe.
                </p>
                <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/50 p-3 font-mono text-xs">
                  <span className="truncate">{created.plaintextKey}</span>
                  <button onClick={() => copy(created.plaintextKey)} className="shrink-0 text-muted-foreground hover:text-foreground">
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
                <Button className="w-full" onClick={() => setOpen(false)}>
                  Done
                </Button>
              </div>
            ) : (
              <form onSubmit={form.handleSubmit((v) => createMutation.mutate(v))} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="name">Key name</Label>
                  <Input id="name" placeholder="Production integration" {...form.register("name")} />
                  {form.formState.errors.name && <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>}
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={createMutation.isPending}>
                    Create key
                  </Button>
                </DialogFooter>
              </form>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      ) : !data || data.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <KeyRound className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No API keys yet.</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Key</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((k) => (
              <TableRow key={k.id}>
                <TableCell className="font-medium">{k.name}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">••••{k.last4}</TableCell>
                <TableCell className="text-muted-foreground">{new Date(k.createdAt).toLocaleDateString()}</TableCell>
                <TableCell>
                  <Badge variant={k.revokedAt ? "destructive" : "success"}>{k.revokedAt ? "Revoked" : "Active"}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  {!k.revokedAt && (
                    <Button variant="ghost" size="icon" onClick={() => revokeMutation.mutate(k.id)} disabled={revokeMutation.isPending}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

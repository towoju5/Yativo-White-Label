import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createRoleSchema, PERMISSION_CATALOG, type RoleDto, type CreateRoleInput, type StaffPermission } from "@white-label/shared-types";
import { Plus, Pencil, Trash2, ShieldCheck } from "lucide-react";
import { staffApi, ApiError } from "@/lib/api-client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const GROUPS = Array.from(new Set(PERMISSION_CATALOG.map((p) => p.group)));

export default function RolesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<RoleDto | "new" | null>(null);
  const [deleting, setDeleting] = useState<RoleDto | null>(null);

  const { data, isLoading } = useQuery({ queryKey: ["admin", "roles"], queryFn: () => staffApi.get<RoleDto[]>("/admin/roles") });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin", "roles"] });

  const createMutation = useMutation({
    mutationFn: (input: CreateRoleInput) => staffApi.post<RoleDto>("/admin/roles", input),
    onSuccess: () => {
      toast({ title: "Role created" });
      invalidate();
      setEditing(null);
    },
    onError: (e) => toast({ variant: "destructive", title: "Couldn't create role", description: e instanceof ApiError ? e.message : undefined }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: CreateRoleInput }) => staffApi.patch<RoleDto>(`/admin/roles/${id}`, input),
    onSuccess: () => {
      toast({ title: "Role updated" });
      invalidate();
      setEditing(null);
    },
    onError: (e) => toast({ variant: "destructive", title: "Couldn't update role", description: e instanceof ApiError ? e.message : undefined }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => staffApi.del(`/admin/roles/${id}`),
    onSuccess: () => {
      toast({ title: "Role deleted" });
      invalidate();
      setDeleting(null);
    },
    onError: (e) => toast({ variant: "destructive", title: "Couldn't delete role", description: e instanceof ApiError ? e.message : undefined }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Roles & permissions</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Custom roles narrow what a staff member can do. Owners and admins always have full access.
          </p>
        </div>
        <Button size="sm" onClick={() => setEditing("new")}>
          <Plus className="h-4 w-4" /> New role
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      ) : !data || data.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          No custom roles yet — staff without one get the default STAFF permission set.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((role) => (
            <Card key={role.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-primary" />
                    <CardTitle className="text-base">{role.name}</CardTitle>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button variant="ghost" size="icon" onClick={() => setEditing(role)} aria-label="Edit role">
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeleting(role)} aria-label="Delete role">
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
                <CardDescription>{role.description || "No description"}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-1.5">
                  {role.permissions.length === 0 ? (
                    <span className="text-xs text-muted-foreground">No permissions granted</span>
                  ) : (
                    role.permissions.map((p) => (
                      <Badge key={p} variant="secondary" className="text-[10px]">
                        {PERMISSION_CATALOG.find((c) => c.key === p)?.label ?? p}
                      </Badge>
                    ))
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {role.staffCount} staff member{role.staffCount === 1 ? "" : "s"} assigned
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <RoleFormDialog
        open={!!editing}
        role={editing === "new" ? null : editing}
        onOpenChange={(v) => !v && setEditing(null)}
        onSubmit={(input) => (editing === "new" ? createMutation.mutate(input) : updateMutation.mutate({ id: (editing as RoleDto).id, input }))}
        isPending={createMutation.isPending || updateMutation.isPending}
      />

      <Dialog open={!!deleting} onOpenChange={(v) => !v && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete "{deleting?.name}"?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {deleting && deleting.staffCount > 0
              ? `${deleting.staffCount} staff member(s) are still assigned to this role — reassign them first.`
              : "This can't be undone."}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!!deleting && deleting.staffCount > 0}
              onClick={() => deleting && deleteMutation.mutate(deleting.id)}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RoleFormDialog({
  open,
  role,
  onOpenChange,
  onSubmit,
  isPending,
}: {
  open: boolean;
  role: RoleDto | null;
  onOpenChange: (v: boolean) => void;
  onSubmit: (input: CreateRoleInput) => void;
  isPending: boolean;
}) {
  const form = useForm<CreateRoleInput>({
    resolver: zodResolver(createRoleSchema),
    values: { name: role?.name ?? "", description: role?.description ?? "", permissions: role?.permissions ?? [] },
  });
  const permissions = form.watch("permissions");

  const togglePermission = (key: StaffPermission, checked: boolean) => {
    const next = checked ? [...permissions, key] : permissions.filter((p) => p !== key);
    form.setValue("permissions", next, { shouldDirty: true });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{role ? "Edit role" : "New role"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="roleName">Name</Label>
            <Input id="roleName" {...form.register("name")} placeholder="e.g. Support Agent" />
            {form.formState.errors.name && <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="roleDescription">Description</Label>
            <Textarea id="roleDescription" {...form.register("description")} rows={2} placeholder="What this role is for" />
          </div>
          <div className="space-y-3">
            <Label>Permissions</Label>
            <div className="max-h-72 space-y-4 overflow-y-auto rounded-lg border border-border p-3">
              {GROUPS.map((group) => (
                <div key={group}>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group}</p>
                  <div className="space-y-2">
                    {PERMISSION_CATALOG.filter((p) => p.group === group).map((p) => (
                      <label key={p.key} className="flex items-start gap-2.5 text-sm">
                        <Checkbox
                          checked={permissions.includes(p.key)}
                          onCheckedChange={(v) => togglePermission(p.key, v === true)}
                          className="mt-0.5"
                        />
                        <span>
                          <span className="font-medium">{p.label}</span>
                          <span className="block text-xs text-muted-foreground">{p.description}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {role ? "Save changes" : "Create role"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

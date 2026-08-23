import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  inviteStaffSchema,
  type InviteStaffInput,
  type StaffUserDto,
  type UpdateStaffInput,
  type RoleDto,
  type ResetStaffPasswordResult,
} from "@white-label/shared-types";
import { Copy, Plus, UserPlus, MoreHorizontal, KeyRound, UserX, UserCheck, Trash2 } from "lucide-react";
import { staffApi, ApiError } from "@/lib/api-client";
import { useToast } from "@/hooks/use-toast";
import { useStaffAuth } from "@/hooks/useStaffAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";

interface InviteResult extends StaffUserDto {
  tempPassword?: string;
}

const ROLE_VARIANT: Record<string, "success" | "warning" | "secondary"> = {
  OWNER: "success",
  ADMIN: "warning",
  STAFF: "secondary",
};

export default function TeamPage() {
  const { user } = useStaffAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canManage = user?.role === "OWNER" || user?.role === "ADMIN" || (user?.permissions.includes("team.manage") ?? false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteResult, setInviteResult] = useState<InviteResult | null>(null);
  const [editing, setEditing] = useState<StaffUserDto | null>(null);
  const [removing, setRemoving] = useState<StaffUserDto | null>(null);
  const [passwordResult, setPasswordResult] = useState<{ email: string; tempPassword: string } | null>(null);

  const { data, isLoading } = useQuery({ queryKey: ["staff"], queryFn: () => staffApi.get<StaffUserDto[]>("/staff") });
  const rolesQuery = useQuery({ queryKey: ["admin", "roles"], queryFn: () => staffApi.get<RoleDto[]>("/admin/roles"), enabled: canManage });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["staff"] });

  const form = useForm<InviteStaffInput>({ resolver: zodResolver(inviteStaffSchema), defaultValues: { role: "STAFF", customRoleId: null } });
  const inviteRole = form.watch("role");

  const inviteMutation = useMutation({
    mutationFn: (input: InviteStaffInput) => staffApi.post<InviteResult>("/staff/invite", input),
    onSuccess: (res) => {
      setInviteResult(res);
      invalidate();
      form.reset({ role: "STAFF", customRoleId: null });
    },
    onError: (e) => toast({ variant: "destructive", title: "Couldn't invite", description: e instanceof ApiError ? e.message : undefined }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateStaffInput }) => staffApi.patch<StaffUserDto>(`/admin/staff/${id}`, input),
    onSuccess: () => {
      toast({ title: "Staff member updated" });
      invalidate();
      setEditing(null);
    },
    onError: (e) => toast({ variant: "destructive", title: "Couldn't update", description: e instanceof ApiError ? e.message : undefined }),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, activate }: { id: string; activate: boolean }) =>
      staffApi.post<StaffUserDto>(`/admin/staff/${id}/${activate ? "reactivate" : "deactivate"}`),
    onSuccess: (u) => {
      toast({ title: u.isActive ? "Staff member reactivated" : "Staff member deactivated" });
      invalidate();
    },
    onError: (e) => toast({ variant: "destructive", title: "Couldn't update status", description: e instanceof ApiError ? e.message : undefined }),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: (staff: StaffUserDto) => staffApi.post<ResetStaffPasswordResult>(`/admin/staff/${staff.id}/reset-password`).then((r) => ({ email: staff.email, ...r })),
    onSuccess: (res) => setPasswordResult(res),
    onError: (e) => toast({ variant: "destructive", title: "Couldn't reset password", description: e instanceof ApiError ? e.message : undefined }),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => staffApi.del(`/admin/staff/${id}`),
    onSuccess: () => {
      toast({ title: "Staff member removed" });
      invalidate();
      setRemoving(null);
    },
    onError: (e) => toast({ variant: "destructive", title: "Couldn't remove", description: e instanceof ApiError ? e.message : undefined }),
  });

  const copy = (value: string) => {
    navigator.clipboard?.writeText(value);
    toast({ title: "Copied to clipboard" });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Team</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Your staff and their access levels</p>
        </div>
        {canManage && (
          <Dialog
            open={inviteOpen}
            onOpenChange={(v) => {
              setInviteOpen(v);
              if (!v) setInviteResult(null);
            }}
          >
            <Button size="sm" onClick={() => setInviteOpen(true)}>
              <UserPlus className="h-4 w-4" /> Invite staff
            </Button>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Invite a staff member</DialogTitle>
              </DialogHeader>
              {inviteResult ? (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Share this temporary password with <span className="font-medium text-foreground">{inviteResult.email}</span>. It won't be shown again.
                  </p>
                  <div className="flex items-center justify-between rounded-lg border border-border bg-muted/50 p-3 font-mono text-sm">
                    {inviteResult.tempPassword ?? "(password issued — check invite email)"}
                    {inviteResult.tempPassword && (
                      <button onClick={() => copy(inviteResult.tempPassword!)} className="text-muted-foreground hover:text-foreground">
                        <Copy className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <Button className="w-full" onClick={() => setInviteOpen(false)}>
                    Done
                  </Button>
                </div>
              ) : (
                <form onSubmit={form.handleSubmit((v) => inviteMutation.mutate(v))} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" {...form.register("email")} />
                    {form.formState.errors.email && <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label>Role</Label>
                    <Select
                      value={inviteRole}
                      onValueChange={(v) => {
                        form.setValue("role", v as InviteStaffInput["role"]);
                        if (v !== "STAFF") form.setValue("customRoleId", null);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="STAFF">Staff</SelectItem>
                        <SelectItem value="ADMIN">Admin</SelectItem>
                        <SelectItem value="OWNER">Owner</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {inviteRole === "STAFF" && (
                    <div className="space-y-1.5">
                      <Label>Custom role (optional)</Label>
                      <Select
                        value={form.watch("customRoleId") ?? "__default"}
                        onValueChange={(v) => form.setValue("customRoleId", v === "__default" ? null : v)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Default staff access" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__default">Default staff access</SelectItem>
                          {(rolesQuery.data ?? []).map((r) => (
                            <SelectItem key={r.id} value={r.id}>
                              {r.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <DialogFooter>
                    <Button type="submit" disabled={inviteMutation.isPending}>
                      <Plus className="h-4 w-4" /> Send invite
                    </Button>
                  </DialogFooter>
                </form>
              )}
            </DialogContent>
          </Dialog>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      ) : !data || data.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">No staff yet</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Joined</TableHead>
              {canManage && <TableHead className="w-10" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((s) => {
              const isSelf = s.id === user?.id;
              return (
                <TableRow key={s.id} className={!s.isActive ? "opacity-60" : undefined}>
                  <TableCell className="font-medium">{s.email}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <Badge variant={ROLE_VARIANT[s.role] ?? "secondary"}>{s.role}</Badge>
                      {s.customRoleName && (
                        <Badge variant="outline" className="text-[10px]">
                          {s.customRoleName}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={s.isActive ? "success" : "secondary"}>{s.isActive ? "Active" : "Deactivated"}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{new Date(s.createdAt).toLocaleDateString()}</TableCell>
                  {canManage && (
                    <TableCell>
                      {!isSelf && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label="Staff actions">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setEditing(s)}>Edit role</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => resetPasswordMutation.mutate(s)}>
                              <KeyRound className="mr-2 h-3.5 w-3.5" /> Reset password
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => toggleActiveMutation.mutate({ id: s.id, activate: !s.isActive })}>
                              {s.isActive ? (
                                <>
                                  <UserX className="mr-2 h-3.5 w-3.5" /> Deactivate
                                </>
                              ) : (
                                <>
                                  <UserCheck className="mr-2 h-3.5 w-3.5" /> Reactivate
                                </>
                              )}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => setRemoving(s)} className="text-destructive">
                              <Trash2 className="mr-2 h-3.5 w-3.5" /> Remove
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <EditStaffDialog
        staff={editing}
        roles={rolesQuery.data ?? []}
        onOpenChange={(v) => !v && setEditing(null)}
        onSubmit={(input) => editing && updateMutation.mutate({ id: editing.id, input })}
        isPending={updateMutation.isPending}
      />

      <Dialog open={!!passwordResult} onOpenChange={(v) => !v && setPasswordResult(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New password issued</DialogTitle>
            <DialogDescription>
              Share this with <span className="font-medium text-foreground">{passwordResult?.email}</span>. It won't be shown again — their existing
              sessions have been signed out.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-between rounded-lg border border-border bg-muted/50 p-3 font-mono text-sm">
            {passwordResult?.tempPassword}
            <button onClick={() => passwordResult && copy(passwordResult.tempPassword)} className="text-muted-foreground hover:text-foreground">
              <Copy className="h-4 w-4" />
            </button>
          </div>
          <Button className="w-full" onClick={() => setPasswordResult(null)}>
            Done
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={!!removing} onOpenChange={(v) => !v && setRemoving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {removing?.email}?</DialogTitle>
            <DialogDescription>
              This deletes their account and revokes access immediately. If this fails, deactivate them instead — deactivating keeps their record
              (and anyone they've invited) intact.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={removeMutation.isPending} onClick={() => removing && removeMutation.mutate(removing.id)}>
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EditStaffDialog({
  staff,
  roles,
  onOpenChange,
  onSubmit,
  isPending,
}: {
  staff: StaffUserDto | null;
  roles: RoleDto[];
  onOpenChange: (v: boolean) => void;
  onSubmit: (input: UpdateStaffInput) => void;
  isPending: boolean;
}) {
  const [role, setRole] = useState<StaffUserDto["role"]>("STAFF");
  const [customRoleId, setCustomRoleId] = useState<string | null>(null);

  return (
    <Dialog
      open={!!staff}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (v && staff) {
          setRole(staff.role);
          setCustomRoleId(staff.customRoleId);
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit {staff?.email}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as StaffUserDto["role"])}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="STAFF">Staff</SelectItem>
                <SelectItem value="ADMIN">Admin</SelectItem>
                <SelectItem value="OWNER">Owner</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {role === "STAFF" && (
            <div className="space-y-1.5">
              <Label>Custom role</Label>
              <Select value={customRoleId ?? "__default"} onValueChange={(v) => setCustomRoleId(v === "__default" ? null : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Default staff access" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__default">Default staff access</SelectItem>
                  {roles.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button disabled={isPending} onClick={() => onSubmit({ role, customRoleId: role === "STAFF" ? customRoleId : null })}>
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

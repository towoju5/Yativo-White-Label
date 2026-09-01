import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  inviteTeamMemberSchema,
  PORTAL_PERMISSION_CATALOG,
  type CustomerTeamMemberDto,
  type InviteTeamMemberInput,
  type PortalPermission,
  type UpdateTeamMemberInput,
} from "@white-label/shared-types";
import { MoreHorizontal, Plus, Trash2, UserCheck, UserPlus, UserX } from "lucide-react";
import { portalApi, ApiError } from "@/lib/api-client";
import { useToast } from "@/hooks/use-toast";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";

const GROUPS = Array.from(new Set(PORTAL_PERMISSION_CATALOG.map((p) => p.group)));

const ROLE_VARIANT: Record<string, "success" | "warning" | "secondary"> = {
  OWNER: "success",
  ADMIN: "warning",
  MEMBER: "secondary",
};

function PermissionChecklist({ permissions, onToggle }: { permissions: PortalPermission[]; onToggle: (key: PortalPermission, checked: boolean) => void }) {
  return (
    <div className="max-h-64 space-y-4 overflow-y-auto rounded-lg border border-border p-3">
      {GROUPS.map((group) => (
        <div key={group}>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group}</p>
          <div className="space-y-2">
            {PORTAL_PERMISSION_CATALOG.filter((p) => p.group === group).map((p) => (
              <label key={p.key} className="flex items-start gap-2.5 text-sm">
                <Checkbox checked={permissions.includes(p.key)} onCheckedChange={(v) => onToggle(p.key, v === true)} className="mt-0.5" />
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
  );
}

export default function PortalTeamPage() {
  const { user } = useCustomerAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  // The owner always manages the team; a member needs team.manage explicitly granted.
  const canManage = user?.principalType !== "member" || (user?.permissions?.includes("team.manage") ?? false);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [editing, setEditing] = useState<CustomerTeamMemberDto | null>(null);
  const [removing, setRemoving] = useState<CustomerTeamMemberDto | null>(null);

  const { data, isLoading } = useQuery({ queryKey: ["portal", "team"], queryFn: () => portalApi.get<CustomerTeamMemberDto[]>("/portal/team") });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["portal", "team"] });

  const form = useForm<InviteTeamMemberInput>({
    resolver: zodResolver(inviteTeamMemberSchema),
    defaultValues: { email: "", fullName: "", role: "MEMBER", permissions: [] },
  });
  const inviteRole = form.watch("role");
  const invitePermissions = form.watch("permissions");

  const inviteMutation = useMutation({
    mutationFn: (input: InviteTeamMemberInput) => portalApi.post<CustomerTeamMemberDto>("/portal/team/invite", input),
    onSuccess: () => {
      toast({ title: "Invite sent" });
      invalidate();
      form.reset({ email: "", fullName: "", role: "MEMBER", permissions: [] });
      setInviteOpen(false);
    },
    onError: (e) => toast({ variant: "destructive", title: "Couldn't send invite", description: e instanceof ApiError ? e.message : undefined }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateTeamMemberInput }) => portalApi.patch<CustomerTeamMemberDto>(`/portal/team/${id}`, input),
    onSuccess: () => {
      toast({ title: "Team member updated" });
      invalidate();
      setEditing(null);
    },
    onError: (e) => toast({ variant: "destructive", title: "Couldn't update", description: e instanceof ApiError ? e.message : undefined }),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, activate }: { id: string; activate: boolean }) =>
      portalApi.post<CustomerTeamMemberDto>(`/portal/team/${id}/${activate ? "reactivate" : "deactivate"}`),
    onSuccess: (m) => {
      toast({ title: m.isActive ? "Team member reactivated" : "Team member deactivated" });
      invalidate();
    },
    onError: (e) => toast({ variant: "destructive", title: "Couldn't update status", description: e instanceof ApiError ? e.message : undefined }),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => portalApi.del(`/portal/team/${id}`),
    onSuccess: () => {
      toast({ title: "Team member removed" });
      invalidate();
      setRemoving(null);
    },
    onError: (e) => toast({ variant: "destructive", title: "Couldn't remove", description: e instanceof ApiError ? e.message : undefined }),
  });

  if (user && user.type !== "BUSINESS") {
    return <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">Team members are only available for business accounts.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Team</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Invite teammates and control what each of them can do</p>
        </div>
        {canManage && (
          <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
            <Button size="sm" onClick={() => setInviteOpen(true)}>
              <UserPlus className="h-4 w-4" /> Invite team member
            </Button>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Invite a team member</DialogTitle>
                <DialogDescription>They'll get an email with a link to set their own password.</DialogDescription>
              </DialogHeader>
              <form onSubmit={form.handleSubmit((v) => inviteMutation.mutate(v))} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="fullName">Full name</Label>
                  <Input id="fullName" {...form.register("fullName")} />
                  {form.formState.errors.fullName && <p className="text-xs text-destructive">{form.formState.errors.fullName.message}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" {...form.register("email")} />
                  {form.formState.errors.email && <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label>Role</Label>
                  <Select value={inviteRole} onValueChange={(v) => form.setValue("role", v as InviteTeamMemberInput["role"])}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MEMBER">Member — only the permissions below</SelectItem>
                      <SelectItem value="ADMIN">Admin — full access, like you</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {inviteRole === "MEMBER" && (
                  <div className="space-y-1.5">
                    <Label>Permissions</Label>
                    <PermissionChecklist
                      permissions={invitePermissions}
                      onToggle={(key, checked) =>
                        form.setValue("permissions", checked ? [...invitePermissions, key] : invitePermissions.filter((p) => p !== key))
                      }
                    />
                  </div>
                )}
                <DialogFooter>
                  <Button type="submit" disabled={inviteMutation.isPending}>
                    <Plus className="h-4 w-4" /> Send invite
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      ) : !data || data.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">No team members yet</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Invited</TableHead>
              {canManage && <TableHead className="w-10" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((m) => (
              <TableRow key={m.id} className={!m.isActive ? "opacity-60" : undefined}>
                <TableCell className="font-medium">{m.fullName}</TableCell>
                <TableCell>{m.email}</TableCell>
                <TableCell>
                  <Badge variant={ROLE_VARIANT[m.role] ?? "secondary"}>{m.role}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={m.isActive ? "success" : "secondary"}>
                    {!m.isActive ? "Deactivated" : m.acceptedAt ? "Active" : "Invite pending"}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">{new Date(m.invitedAt).toLocaleDateString()}</TableCell>
                {canManage && (
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label="Team member actions">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setEditing(m)}>Edit access</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => toggleActiveMutation.mutate({ id: m.id, activate: !m.isActive })}>
                          {m.isActive ? (
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
                        <DropdownMenuItem onClick={() => setRemoving(m)} className="text-destructive">
                          <Trash2 className="mr-2 h-3.5 w-3.5" /> Remove
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <EditMemberDialog
        member={editing}
        onOpenChange={(v) => !v && setEditing(null)}
        onSubmit={(input) => editing && updateMutation.mutate({ id: editing.id, input })}
        isPending={updateMutation.isPending}
      />

      <Dialog open={!!removing} onOpenChange={(v) => !v && setRemoving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {removing?.fullName}?</DialogTitle>
            <DialogDescription>This deletes their account and revokes access immediately.</DialogDescription>
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

function EditMemberDialog({
  member,
  onOpenChange,
  onSubmit,
  isPending,
}: {
  member: CustomerTeamMemberDto | null;
  onOpenChange: (v: boolean) => void;
  onSubmit: (input: UpdateTeamMemberInput) => void;
  isPending: boolean;
}) {
  const [role, setRole] = useState<"ADMIN" | "MEMBER">("MEMBER");
  const [permissions, setPermissions] = useState<PortalPermission[]>([]);

  return (
    <Dialog
      open={!!member}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (v && member) {
          setRole(member.role === "ADMIN" ? "ADMIN" : "MEMBER");
          setPermissions(member.permissions);
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit {member?.fullName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as "ADMIN" | "MEMBER")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MEMBER">Member — only the permissions below</SelectItem>
                <SelectItem value="ADMIN">Admin — full access</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {role === "MEMBER" && (
            <div className="space-y-1.5">
              <Label>Permissions</Label>
              <PermissionChecklist
                permissions={permissions}
                onToggle={(key, checked) => setPermissions((prev) => (checked ? [...prev, key] : prev.filter((p) => p !== key)))}
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button disabled={isPending} onClick={() => onSubmit({ role, permissions: role === "MEMBER" ? permissions : [] })}>
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

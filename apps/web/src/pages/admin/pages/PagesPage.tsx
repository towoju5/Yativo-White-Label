import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import type { StaticPage } from "@white-label/shared-types";
import { FileText, Plus, Pencil, Trash2, ExternalLink } from "lucide-react";
import { staffApi, ApiError } from "@/lib/api-client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

export default function PagesPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [deleting, setDeleting] = useState<StaticPage | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "pages"],
    queryFn: () => staffApi.get<StaticPage[]>("/admin/pages"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => staffApi.del(`/admin/pages/${id}`),
    onSuccess: () => {
      toast({ title: "Page deleted" });
      queryClient.invalidateQueries({ queryKey: ["admin", "pages"] });
      setDeleting(null);
    },
    onError: (e) => toast({ variant: "destructive", title: "Couldn't delete page", description: e instanceof ApiError ? e.message : undefined }),
  });

  const pages = data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Pages</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Manage Terms, Privacy Policy, and any custom pages on your site.</p>
        </div>
        <Button onClick={() => navigate("/admin/pages/new")}>
          <Plus className="h-4 w-4" /> New page
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">All pages</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-6 pt-0">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : pages.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">No pages yet.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>In footer</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pages.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.title}</TableCell>
                    <TableCell>
                      <span className="font-mono text-xs text-muted-foreground">/{p.slug}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={p.kind === "SYSTEM" ? "secondary" : "outline"}>{p.kind === "SYSTEM" ? "Built-in" : "Custom"}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={p.isPublished ? "success" : "secondary"}>{p.isPublished ? "Published" : "Draft"}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{p.showInFooter ? "Yes" : "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{new Date(p.updatedAt).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        {p.isPublished && (
                          <Button variant="ghost" size="icon" asChild title="View live">
                            <a href={`/${p.slug}`} target="_blank" rel="noreferrer">
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" asChild title="Edit">
                          <Link to={`/admin/pages/${p.id}`}>
                            <Pencil className="h-4 w-4" />
                          </Link>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title={p.kind === "SYSTEM" ? "Built-in pages can't be deleted" : "Delete"}
                          disabled={p.kind === "SYSTEM"}
                          onClick={() => setDeleting(p)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!deleting} onOpenChange={(v) => !v && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete "{deleting?.title}"?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">This page will be permanently removed and any links to /{deleting?.slug} will stop working.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={deleteMutation.isPending} onClick={() => deleting && deleteMutation.mutate(deleting.id)}>
              Delete page
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import type { StaticPage } from "@white-label/shared-types";
import { ArrowLeft, Save, Trash2 } from "lucide-react";
import { staffApi, ApiError } from "@/lib/api-client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function PageEditorPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === "new";
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [title, setTitle] = useState("");
  const [contentHtml, setContentHtml] = useState("");
  const [isPublished, setIsPublished] = useState(true);
  const [showInFooter, setShowInFooter] = useState(true);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const pageQuery = useQuery({
    queryKey: ["admin", "pages", id],
    queryFn: () => staffApi.get<StaticPage>(`/admin/pages/${id}`),
    enabled: !isNew,
  });

  useEffect(() => {
    if (pageQuery.data) {
      setSlug(pageQuery.data.slug);
      setTitle(pageQuery.data.title);
      setContentHtml(pageQuery.data.contentHtml);
      setIsPublished(pageQuery.data.isPublished);
      setShowInFooter(pageQuery.data.showInFooter);
    }
  }, [pageQuery.data]);

  const page = pageQuery.data;
  const isSystem = page?.kind === "SYSTEM";

  const createMutation = useMutation({
    mutationFn: () => staffApi.post<StaticPage>("/admin/pages", { slug, title, contentHtml, isPublished, showInFooter }),
    onSuccess: (created) => {
      toast({ title: "Page created" });
      queryClient.invalidateQueries({ queryKey: ["admin", "pages"] });
      navigate(`/admin/pages/${created.id}`, { replace: true });
    },
    onError: (e) => toast({ variant: "destructive", title: "Couldn't create page", description: e instanceof ApiError ? e.message : undefined }),
  });

  const updateMutation = useMutation({
    mutationFn: () => staffApi.patch<StaticPage>(`/admin/pages/${id}`, { title, contentHtml, isPublished, showInFooter }),
    onSuccess: () => {
      toast({ title: "Page saved" });
      queryClient.invalidateQueries({ queryKey: ["admin", "pages"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "pages", id] });
    },
    onError: (e) => toast({ variant: "destructive", title: "Couldn't save page", description: e instanceof ApiError ? e.message : undefined }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => staffApi.del(`/admin/pages/${id}`),
    onSuccess: () => {
      toast({ title: "Page deleted" });
      queryClient.invalidateQueries({ queryKey: ["admin", "pages"] });
      navigate("/admin/pages");
    },
    onError: (e) => toast({ variant: "destructive", title: "Couldn't delete page", description: e instanceof ApiError ? e.message : undefined }),
  });

  const save = () => (isNew ? createMutation.mutate() : updateMutation.mutate());
  const saving = createMutation.isPending || updateMutation.isPending;
  const canSave = title.trim().length > 0 && (isNew ? slug.trim().length > 0 && contentHtml.trim().length > 0 : true);

  if (!isNew && pageQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/admin/pages")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="font-heading text-2xl font-semibold tracking-tight">{isNew ? "New page" : title || "Edit page"}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">{isNew ? "Create a custom page with your own HTML content." : `/${slug}`}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isNew && !isSystem && (
            <Button variant="outline" onClick={() => setConfirmingDelete(true)}>
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          )}
          <Button onClick={save} disabled={!canSave || saving}>
            <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  if (isNew && !slugTouched) setSlug(slugify(e.target.value));
                }}
                placeholder="About us"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="slug">URL slug</Label>
              <div className="flex items-center gap-1.5">
                <span className="text-sm text-muted-foreground">/</span>
                <Input
                  id="slug"
                  value={slug}
                  disabled={!isNew}
                  onChange={(e) => {
                    setSlugTouched(true);
                    setSlug(slugify(e.target.value));
                  }}
                  placeholder="about-us"
                  className="font-mono"
                />
              </div>
              {!isNew && <p className="text-xs text-muted-foreground">The URL can't be changed after a page is created.</p>}
            </div>
          </div>

          <div className="flex flex-wrap gap-8 border-t border-border pt-4">
            <label className="flex items-center gap-2.5 text-sm">
              <Switch checked={isPublished} onCheckedChange={setIsPublished} />
              Published
            </label>
            <label className="flex items-center gap-2.5 text-sm">
              <Switch checked={showInFooter} onCheckedChange={setShowInFooter} />
              Show link in footer
            </label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Content</CardTitle>
          <CardDescription>Write raw HTML — headings, paragraphs, lists, links, images, and tables are supported.</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="edit">
            <TabsList>
              <TabsTrigger value="edit">HTML</TabsTrigger>
              <TabsTrigger value="preview">Preview</TabsTrigger>
            </TabsList>
            <TabsContent value="edit">
              <Textarea
                value={contentHtml}
                onChange={(e) => setContentHtml(e.target.value)}
                placeholder="<h2>About us</h2>&#10;<p>Write your content here…</p>"
                className="min-h-[420px] font-mono text-sm"
              />
            </TabsContent>
            <TabsContent value="preview">
              <iframe
                title="Content preview"
                sandbox=""
                srcDoc={`<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:ui-sans-serif,system-ui,sans-serif;line-height:1.6;padding:24px;color:#1e293b;max-width:720px;margin:0 auto}h1,h2,h3{font-weight:700;margin-top:1.5em}img{max-width:100%}table{border-collapse:collapse;width:100%}td,th{border:1px solid #e2e8f0;padding:8px;text-align:left}a{color:#4f46e5}</style></head><body>${contentHtml}</body></html>`}
                className="min-h-[420px] w-full rounded-lg border border-border bg-white"
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Dialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete "{title}"?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">This page will be permanently removed and any links to /{slug} will stop working.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmingDelete(false)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate()}>
              Delete page
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

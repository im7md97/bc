import { useState } from "react";
import { Plus, Archive, Pencil, FolderOpen } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useApi, useApiMutation } from "@/hooks/use-api";
import { apiRequest } from "@/lib/api";
import { useAuth, can } from "@/hooks/use-auth";
import { useLanguage } from "@/contexts/LanguageContext";

interface Project {
  id: number;
  nameAr: string;
  nameEn: string;
  description: string;
  status: string;
  managerUserId: number | null;
  managerNameAr: string | null;
  managerNameEn: string | null;
}

interface SupervisorOrManager {
  id: number;
  username: string;
  displayNameAr: string;
  displayNameEn: string;
  role: string;
}

export default function ProjectsPage() {
  const { t, lang, dir } = useLanguage();
  const { data: me } = useAuth();
  const [editProj, setEditProj] = useState<Project | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [archiveProj, setArchiveProj] = useState<Project | null>(null);

  const { data: projects, isLoading } = useApi<Project[]>("/api/projects");
  const { data: users } = useApi<SupervisorOrManager[]>("/api/users",
    { enabled: can(me, "user.list_all") });

  const managerCandidates = (users ?? []).filter((u) =>
    ["project_manager", "admin", "wfm"].includes(u.role));

  const canCreate = can(me, "project.create");
  const canEditAny = can(me, "project.edit");

  const create = useApiMutation(
    (data: any) => apiRequest("POST", "/api/projects", data),
    { invalidate: [["/api/projects"]], onSuccess: () => setAddOpen(false), successMessage: t("createSuccess") },
  );
  const update = useApiMutation(
    ({ id, data }: { id: number; data: any }) => apiRequest("PUT", `/api/projects/${id}`, data),
    { invalidate: [["/api/projects"]], onSuccess: () => setEditProj(null), successMessage: t("saveSuccess") },
  );
  const archive = useApiMutation(
    (id: number) => apiRequest("DELETE", `/api/projects/${id}`),
    { invalidate: [["/api/projects"]], onSuccess: () => setArchiveProj(null), successMessage: t("saveSuccess") },
  );

  const submit = (e: React.FormEvent<HTMLFormElement>, isEdit: boolean) => {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    const data: any = {
      nameAr: fd.get("nameAr"),
      nameEn: fd.get("nameEn"),
      description: fd.get("description") || "",
    };
    const mgr = fd.get("managerUserId");
    if (mgr && mgr !== "_none") data.managerUserId = Number(mgr);
    else if (mgr === "_none") data.managerUserId = null;
    if (isEdit && editProj) update.mutate({ id: editProj.id, data });
    else create.mutate(data);
  };

  return (
    <PageShell
      title={t("projTitle")}
      subtitle={t("projSubtitle")}
      actions={canCreate && (
        <Button onClick={() => setAddOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" /> {t("projAdd")}
        </Button>
      )}
    >
      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}
        </div>
      )}
      {!isLoading && projects?.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">{t("noData")}</div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {projects?.map((p) => {
          const isOwnProject = p.managerUserId === me?.id;
          const canEdit = canEditAny || (can(me, "project.edit_own") && isOwnProject);
          return (
            <Card key={p.id} className="rounded-2xl">
              <CardContent className="pt-5">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <FolderOpen className="w-5 h-5 text-primary shrink-0" />
                    <h3 className="font-bold truncate">{lang === "ar" ? p.nameAr : p.nameEn}</h3>
                  </div>
                  <Badge variant={p.status === "active" ? "default" : "secondary"}>
                    {p.status === "active" ? t("statusActive") : t("statusArchived")}
                  </Badge>
                </div>
                {p.description && (
                  <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{p.description}</p>
                )}
                <div className="text-xs text-muted-foreground mb-3">
                  {t("projManager")}: {p.managerNameAr ? (lang === "ar" ? p.managerNameAr : p.managerNameEn) : t("projNoManager")}
                </div>
                <div className="flex gap-2">
                  {canEdit && p.status === "active" && (
                    <Button variant="outline" size="sm" className="gap-1" onClick={() => setEditProj(p)}>
                      <Pencil className="w-3.5 h-3.5" /> {t("edit")}
                    </Button>
                  )}
                  {canEditAny && p.status === "active" && (
                    <Button variant="ghost" size="sm" className="gap-1 text-red-600" onClick={() => setArchiveProj(p)}>
                      <Archive className="w-3.5 h-3.5" /> {t("projArchive")}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Add / Edit dialog */}
      <Dialog open={addOpen || !!editProj} onOpenChange={(o) => { if (!o) { setAddOpen(false); setEditProj(null); } }}>
        <DialogContent dir={dir} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editProj ? t("edit") : t("projAdd")}</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => submit(e, !!editProj)} className="space-y-3">
            <div className="space-y-1.5">
              <Label>{t("projNameAr")}</Label>
              <Input name="nameAr" defaultValue={editProj?.nameAr} required />
            </div>
            <div className="space-y-1.5">
              <Label>{t("projNameEn")}</Label>
              <Input name="nameEn" defaultValue={editProj?.nameEn} required dir="ltr" />
            </div>
            <div className="space-y-1.5">
              <Label>{t("projDescription")}</Label>
              <Textarea name="description" defaultValue={editProj?.description} rows={3} />
            </div>
            {(canEditAny || canCreate) && (
              <div className="space-y-1.5">
                <Label>{t("projManager")}</Label>
                <Select name="managerUserId" defaultValue={editProj?.managerUserId ? String(editProj.managerUserId) : "_none"}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">{t("projNoManager")}</SelectItem>
                    {managerCandidates.map((u) => (
                      <SelectItem key={u.id} value={String(u.id)}>
                        {lang === "ar" ? u.displayNameAr : u.displayNameEn} ({u.username})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setAddOpen(false); setEditProj(null); }}>{t("cancel")}</Button>
              <Button type="submit" disabled={create.isPending || update.isPending}>{t("save")}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!archiveProj} onOpenChange={(o) => !o && setArchiveProj(null)}>
        <AlertDialogContent dir={dir}>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("projArchiveTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("projArchiveDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => archiveProj && archive.mutate(archiveProj.id)}>
              {t("projArchive")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}

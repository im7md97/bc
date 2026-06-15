import { useState } from "react";
import { Plus, Trash2, Search, Pencil, KeyRound, Link2 } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useApi, useApiMutation } from "@/hooks/use-api";
import { apiRequest } from "@/lib/api";
import { useAuth, can } from "@/hooks/use-auth";
import { useLanguage } from "@/contexts/LanguageContext";

interface Agent {
  id: number;
  employeeId: string;
  nameAr: string;
  nameEn: string;
  inboundId: string | null;
  supervisorUserId: number | null;
  supervisorNameAr: string | null;
  supervisorNameEn: string | null;
  projectId: number;
  projectNameAr: string | null;
  projectNameEn: string | null;
  isActive: boolean;
  userId: number | null;
}

interface SupervisorOption {
  id: number;
  displayNameAr: string;
  displayNameEn: string;
  username: string;
}

interface ProjectOption { id: number; nameAr: string; nameEn: string; }

export default function AgentsPage() {
  const { t, lang, dir } = useLanguage();
  const { data: me } = useAuth();
  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState<string>("_all");
  const [addOpen, setAddOpen] = useState(false);
  const [editAgent, setEditAgent] = useState<Agent | null>(null);
  const [delAgent, setDelAgent] = useState<Agent | null>(null);
  const [withLogin, setWithLogin] = useState(false);
  const [createLoginAgent, setCreateLoginAgent] = useState<Agent | null>(null);
  const [linkAgent, setLinkAgent] = useState<Agent | null>(null);

  const query = new URLSearchParams();
  if (search) query.set("search", search);
  if (projectFilter !== "_all") query.set("projectId", projectFilter);

  const { data: agents, isLoading } = useApi<Agent[]>(
    `/api/agents?${query.toString()}`,
    { queryKey: ["/api/agents", search, projectFilter] },
  );
  const { data: supervisors } = useApi<SupervisorOption[]>("/api/users/supervisors");
  const { data: projects } = useApi<ProjectOption[]>("/api/projects");

  const canCreate = can(me, "agent.create");
  const canDelete = can(me, "agent.delete");

  const create = useApiMutation(
    (data: any) => apiRequest("POST", "/api/agents", data),
    { invalidate: [["/api/agents"]], onSuccess: () => { setAddOpen(false); setWithLogin(false); }, successMessage: t("createSuccess") },
  );
  const update = useApiMutation(
    ({ id, data }: { id: number; data: any }) => apiRequest("PUT", `/api/agents/${id}`, data),
    { invalidate: [["/api/agents"]], onSuccess: () => setEditAgent(null), successMessage: t("saveSuccess") },
  );
  const remove = useApiMutation(
    (id: number) => apiRequest("DELETE", `/api/agents/${id}`),
    { invalidate: [["/api/agents"]], onSuccess: () => setDelAgent(null), successMessage: t("deleteSuccess") },
  );
  const createLogin = useApiMutation(
    ({ id, ...data }: { id: number; username: string; password: string; email?: string }) =>
      apiRequest("POST", `/api/agents/${id}/create-login`, data),
    { invalidate: [["/api/agents"]], onSuccess: () => setCreateLoginAgent(null), successMessage: t("agLinkedSuccess") },
  );
  const linkExisting = useApiMutation(
    ({ id, userId }: { id: number; userId: number }) =>
      apiRequest("PUT", `/api/agents/${id}`, { userId }),
    { invalidate: [["/api/agents"]], onSuccess: () => setLinkAgent(null), successMessage: t("agLinkedSuccess") },
  );

  const submit = (e: React.FormEvent<HTMLFormElement>, isEdit: boolean) => {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    const data: any = {
      employeeId: fd.get("employeeId"),
      nameAr: fd.get("nameAr"),
      nameEn: fd.get("nameEn"),
      inboundId: fd.get("inboundId") || null,
      projectId: Number(fd.get("projectId")),
    };
    const sup = fd.get("supervisorUserId");
    if (sup && sup !== "_none") data.supervisorUserId = Number(sup);
    else data.supervisorUserId = null;

    if (!isEdit && withLogin && fd.get("loginUsername") && fd.get("loginPassword")) {
      data.login = {
        username: fd.get("loginUsername"),
        password: fd.get("loginPassword"),
        email: fd.get("loginEmail") || undefined,
      };
    }

    if (isEdit && editAgent) update.mutate({ id: editAgent.id, data });
    else create.mutate(data);
  };

  const activeProjects = (projects ?? []).filter((p) => true);

  return (
    <PageShell
      title={t("agTitle")}
      subtitle={t("agSubtitle")}
      actions={canCreate && (
        <Button onClick={() => setAddOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" /> {t("agAdd")}
        </Button>
      )}
    >
      <div className="flex gap-2 mb-4 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className={`absolute ${dir === "rtl" ? "right-3" : "left-3"} top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground`} />
          <Input
            placeholder={t("search")}
            className={dir === "rtl" ? "pr-10" : "pl-10"}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={projectFilter} onValueChange={setProjectFilter}>
          <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">{t("all")} {t("agProject")}</SelectItem>
            {projects?.map((p) => (
              <SelectItem key={p.id} value={String(p.id)}>
                {lang === "ar" ? p.nameAr : p.nameEn}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="bg-card border border-border/60 rounded-2xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("agEmployeeId")}</TableHead>
              <TableHead>{lang === "ar" ? t("agNameAr") : t("agNameEn")}</TableHead>
              <TableHead>{t("agInboundId")}</TableHead>
              <TableHead>{t("agProject")}</TableHead>
              <TableHead>{t("agSupervisor")}</TableHead>
              <TableHead>{t("agLogin")}</TableHead>
              <TableHead>{t("usersStatus")}</TableHead>
              <TableHead className={dir === "rtl" ? "text-left" : "text-right"}>{t("actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={8}><Skeleton className="h-12 w-full" /></TableCell></TableRow>}
            {!isLoading && agents?.length === 0 && (
              <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">{t("noData")}</TableCell></TableRow>
            )}
            {agents?.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="font-semibold" dir="ltr">{a.employeeId}</TableCell>
                <TableCell>{lang === "ar" ? a.nameAr : a.nameEn}</TableCell>
                <TableCell dir="ltr">{a.inboundId || "—"}</TableCell>
                <TableCell>{lang === "ar" ? a.projectNameAr : a.projectNameEn}</TableCell>
                <TableCell>{a.supervisorUserId ? (lang === "ar" ? a.supervisorNameAr : a.supervisorNameEn) : t("agNoSupervisor")}</TableCell>
                <TableCell>
                  {a.userId
                    ? <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 border-emerald-300 text-xs">{t("agLinked")}</Badge>
                    : <Badge variant="outline" className="bg-amber-500/10 text-amber-700 border-amber-300 text-xs">{t("agNoLogin")}</Badge>}
                </TableCell>
                <TableCell>
                  <Badge variant={a.isActive ? "default" : "secondary"}>
                    {a.isActive ? t("statusActive") : t("statusInactive")}
                  </Badge>
                </TableCell>
                <TableCell className={dir === "rtl" ? "text-left" : "text-right"}>
                  <div className="flex gap-1 justify-end">
                    {canCreate && !a.userId && (
                      <>
                        <Button variant="ghost" size="sm" onClick={() => setCreateLoginAgent(a)} className="gap-1 text-xs">
                          <KeyRound className="w-3.5 h-3.5" /> {t("agCreateLoginAction")}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setLinkAgent(a)} className="gap-1 text-xs">
                          <Link2 className="w-3.5 h-3.5" />
                        </Button>
                      </>
                    )}
                    {canCreate && (
                      <Button variant="ghost" size="sm" onClick={() => setEditAgent(a)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                    )}
                    {canDelete && a.isActive && (
                      <Button variant="ghost" size="sm" className="text-red-600" onClick={() => setDelAgent(a)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Add / Edit */}
      <Dialog open={addOpen || !!editAgent} onOpenChange={(o) => { if (!o) { setAddOpen(false); setEditAgent(null); setWithLogin(false); } }}>
        <DialogContent dir={dir} className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editAgent ? t("edit") : t("agAdd")}</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => submit(e, !!editAgent)} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t("agEmployeeId")}</Label>
                <Input name="employeeId" defaultValue={editAgent?.employeeId} required dir="ltr" disabled={!!editAgent} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("agInboundId")}</Label>
                <Input name="inboundId" defaultValue={editAgent?.inboundId ?? ""} dir="ltr" />
              </div>
              <div className="space-y-1.5">
                <Label>{t("agNameAr")}</Label>
                <Input name="nameAr" defaultValue={editAgent?.nameAr} required />
              </div>
              <div className="space-y-1.5">
                <Label>{t("agNameEn")}</Label>
                <Input name="nameEn" defaultValue={editAgent?.nameEn} required dir="ltr" />
              </div>
              <div className="space-y-1.5">
                <Label>{t("agProject")}</Label>
                <Select name="projectId" defaultValue={editAgent ? String(editAgent.projectId) : undefined} required>
                  <SelectTrigger><SelectValue placeholder={t("select")} /></SelectTrigger>
                  <SelectContent>
                    {activeProjects.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>{lang === "ar" ? p.nameAr : p.nameEn}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("agSupervisor")}</Label>
                <Select name="supervisorUserId" defaultValue={editAgent?.supervisorUserId ? String(editAgent.supervisorUserId) : "_none"}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">{t("agNoSupervisor")}</SelectItem>
                    {supervisors?.map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        {lang === "ar" ? s.displayNameAr : s.displayNameEn}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {!editAgent && (
              <>
                <div className="flex items-center gap-2 pt-2 border-t">
                  <Switch checked={withLogin} onCheckedChange={setWithLogin} id="withLogin" />
                  <Label htmlFor="withLogin">{t("agCreateLogin")}</Label>
                </div>
                {withLogin && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>{t("agLoginUsername")}</Label>
                      <Input name="loginUsername" dir="ltr" required={withLogin} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>{t("agLoginPassword")}</Label>
                      <Input name="loginPassword" type="password" minLength={6} dir="ltr" required={withLogin} />
                    </div>
                    <div className="space-y-1.5 col-span-2">
                      <Label>{t("usersEmail")} ({t("optional")})</Label>
                      <Input name="loginEmail" type="email" dir="ltr" />
                    </div>
                  </div>
                )}
              </>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setAddOpen(false); setEditAgent(null); setWithLogin(false); }}>{t("cancel")}</Button>
              <Button type="submit" disabled={create.isPending || update.isPending}>{t("save")}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {createLoginAgent && (
        <CreateLoginDialog
          agent={createLoginAgent}
          onClose={() => setCreateLoginAgent(null)}
          onSubmit={(data) => createLogin.mutate({ id: createLoginAgent.id, ...data })}
          busy={createLogin.isPending}
        />
      )}

      {linkAgent && (
        <LinkExistingDialog
          agent={linkAgent}
          onClose={() => setLinkAgent(null)}
          onSubmit={(userId) => linkExisting.mutate({ id: linkAgent.id, userId })}
          busy={linkExisting.isPending}
        />
      )}

      <AlertDialog open={!!delAgent} onOpenChange={(o) => !o && setDelAgent(null)}>
        <AlertDialogContent dir={dir}>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("agDeleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("agDeleteDesc")}<br /><strong>{delAgent && (lang === "ar" ? delAgent.nameAr : delAgent.nameEn)}</strong> ({delAgent?.employeeId})
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => delAgent && remove.mutate(delAgent.id)}>
              {t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}

// ── Quick create login dialog ────────────────────────────────────────────────

function CreateLoginDialog({ agent, onClose, onSubmit, busy }: {
  agent: Agent;
  onClose: () => void;
  onSubmit: (data: { username: string; password: string; email?: string }) => void;
  busy: boolean;
}) {
  const { t, lang, dir } = useLanguage();
  // Suggest username from employeeId; lowercase, no spaces.
  const [username, setUsername] = useState(agent.employeeId.toLowerCase().replace(/\s+/g, ""));
  const [password, setPassword] = useState(`Pwd_${agent.employeeId}_2026!`);
  const [email, setEmail] = useState("");
  return (
    <Dialog open={true} onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir={dir} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("agCreateLoginTitle")}</DialogTitle>
          <DialogDescription>
            {lang === "ar" ? agent.nameAr : agent.nameEn} <span dir="ltr">({agent.employeeId})</span>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>{t("agLoginUsername")}</Label>
            <Input dir="ltr" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label>{t("agLoginPassword")}</Label>
            <Input dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} />
            <p className="text-[10px] text-muted-foreground">{t("agCreateLoginHint")}</p>
          </div>
          <div className="space-y-1.5">
            <Label>{t("usersEmail")} ({t("optional")})</Label>
            <Input type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("cancel")}</Button>
          <Button
            disabled={!username.trim() || password.length < 6 || busy}
            onClick={() => onSubmit({ username: username.trim(), password, email: email || undefined })}
          >
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Link existing user dialog ────────────────────────────────────────────────

interface UnlinkedUser {
  id: number;
  username: string;
  displayNameAr: string;
  displayNameEn: string;
}

function LinkExistingDialog({ agent, onClose, onSubmit, busy }: {
  agent: Agent;
  onClose: () => void;
  onSubmit: (userId: number) => void;
  busy: boolean;
}) {
  const { t, lang, dir } = useLanguage();
  const { data: available, isLoading } = useApi<UnlinkedUser[]>("/api/agents/available-logins");
  const [userId, setUserId] = useState<string>("");
  return (
    <Dialog open={true} onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir={dir} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("agLinkExisting")}</DialogTitle>
          <DialogDescription>
            {lang === "ar" ? agent.nameAr : agent.nameEn} <span dir="ltr">({agent.employeeId})</span>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label>{t("agAvailableUsers")}</Label>
          <Select value={userId} onValueChange={setUserId}>
            <SelectTrigger><SelectValue placeholder={t("select")} /></SelectTrigger>
            <SelectContent>
              {isLoading && <SelectItem value="_loading" disabled>{t("loading")}</SelectItem>}
              {!isLoading && (available ?? []).length === 0 && <SelectItem value="_empty" disabled>{t("noData")}</SelectItem>}
              {(available ?? []).map((u) => (
                <SelectItem key={u.id} value={String(u.id)}>
                  {lang === "ar" ? u.displayNameAr : u.displayNameEn} <span className="text-xs text-muted-foreground ms-1" dir="ltr">({u.username})</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("cancel")}</Button>
          <Button disabled={!userId || userId.startsWith("_") || busy} onClick={() => onSubmit(Number(userId))}>
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

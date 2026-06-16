import { useState } from "react";
import { Plus, Trash2, KeyRound, Search, ShieldAlert, Download, Upload } from "lucide-react";
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
import { apiRequest, downloadFile, parseError } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useAuth, can } from "@/hooks/use-auth";
import { useLanguage } from "@/contexts/LanguageContext";
import { ROLE_LABEL_KEYS } from "@/lib/i18n";

interface SystemUser {
  id: number;
  username: string;
  email: string;
  role: string;
  displayNameAr: string;
  displayNameEn: string;
  isActive: boolean;
  forcePasswordChange: boolean;
  createdAt: string;
}

const CREATABLE_ROLES_ALL = ["wfm", "project_manager", "supervisor", "quality", "agent", "admin"];
const CREATABLE_ROLES_AGENT_ONLY = ["agent"];

export default function UsersPage() {
  const { t, lang, dir } = useLanguage();
  const { toast } = useToast();
  const { data: me } = useAuth();
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [pwUser, setPwUser] = useState<SystemUser | null>(null);
  const [delUser, setDelUser] = useState<SystemUser | null>(null);
  const [promoteUser, setPromoteUser] = useState<SystemUser | null>(null);

  const { data: users, isLoading } = useApi<SystemUser[]>(
    `/api/users${search ? `?search=${encodeURIComponent(search)}` : ""}`,
    { queryKey: ["/api/users", search] },
  );

  const isFullCreator = can(me, "user.create");
  const isAgentOnlyCreator = can(me, "user.create_agent") && !isFullCreator;
  const canPromote = can(me, "permission.grant");

  const creatableRoles = isFullCreator ? CREATABLE_ROLES_ALL : CREATABLE_ROLES_AGENT_ONLY;

  const create = useApiMutation(
    (data: any) => apiRequest("POST", "/api/users", data),
    { invalidate: [["/api/users"]], onSuccess: () => setAddOpen(false), successMessage: t("createSuccess") },
  );
  const remove = useApiMutation(
    (id: number) => apiRequest("DELETE", `/api/users/${id}`),
    { invalidate: [["/api/users"]], onSuccess: () => setDelUser(null), successMessage: t("deleteSuccess") },
  );
  const changePw = useApiMutation(
    ({ id, password }: { id: number; password: string }) =>
      apiRequest("PATCH", `/api/users/${id}/password`, { password }),
    { invalidate: [["/api/users"]], onSuccess: () => setPwUser(null), successMessage: t("saveSuccess") },
  );
  const promote = useApiMutation(
    (id: number) => apiRequest("POST", `/api/users/${id}/promote-super-admin`),
    { invalidate: [["/api/users"]], onSuccess: () => setPromoteUser(null), successMessage: t("saveSuccess") },
  );

  return (
    <PageShell
      title={t("usersTitle")}
      subtitle={t("usersSubtitle")}
      actions={
        <>
          {(isFullCreator || isAgentOnlyCreator) && (
            <Button variant="outline" size="sm"
              onClick={() => downloadFile("/api/users/template", "users-template.xlsx")} className="gap-1.5">
              <Download className="w-4 h-4" /> {t("usersTemplate")}
            </Button>
          )}
          {isFullCreator && (
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)} className="gap-1.5">
              <Upload className="w-4 h-4" /> {t("usersImport")}
            </Button>
          )}
          {(isFullCreator || isAgentOnlyCreator) && (
            <Button onClick={() => setAddOpen(true)} className="gap-2" data-testid="button-add-user">
              <Plus className="w-4 h-4" /> {t("usersAdd")}
            </Button>
          )}
        </>
      }
    >
      <div className="flex gap-2 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className={`absolute ${dir === "rtl" ? "right-3" : "left-3"} top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground`} />
          <Input
            placeholder={t("search")}
            className={dir === "rtl" ? "pr-10" : "pl-10"}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="input-users-search"
          />
        </div>
      </div>

      <div className="bg-card border border-border/60 rounded-2xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("usersUsername")}</TableHead>
              <TableHead>{lang === "ar" ? t("usersDisplayNameAr") : t("usersDisplayNameEn")}</TableHead>
              <TableHead>{t("usersEmail")}</TableHead>
              <TableHead>{t("usersRole")}</TableHead>
              <TableHead>{t("usersStatus")}</TableHead>
              <TableHead className={dir === "rtl" ? "text-left" : "text-right"}>{t("actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={6}><Skeleton className="h-12 w-full" /></TableCell></TableRow>
            )}
            {!isLoading && users?.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">{t("noData")}</TableCell></TableRow>
            )}
            {users?.map((u) => (
              <TableRow key={u.id} data-testid={`row-user-${u.id}`}>
                <TableCell className="font-semibold" dir="ltr">{u.username}</TableCell>
                <TableCell>{lang === "ar" ? u.displayNameAr : u.displayNameEn}</TableCell>
                <TableCell dir="ltr">{u.email}</TableCell>
                <TableCell>
                  <Badge variant="outline">{t(ROLE_LABEL_KEYS[u.role] || "roleAgent")}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={u.isActive ? "default" : "secondary"}>
                    {u.isActive ? t("statusActive") : t("statusInactive")}
                  </Badge>
                </TableCell>
                <TableCell className={dir === "rtl" ? "text-left" : "text-right"}>
                  <div className="flex gap-1 justify-end">
                    {isFullCreator && (
                      <Button variant="ghost" size="sm" onClick={() => setPwUser(u)} className="gap-1.5">
                        <KeyRound className="w-3.5 h-3.5" /> {t("usersChangePassword")}
                      </Button>
                    )}
                    {canPromote && u.role !== "super_admin" && u.role !== "agent" && (
                      <Button variant="ghost" size="sm" onClick={() => setPromoteUser(u)} className="gap-1.5 text-red-600 hover:text-red-700">
                        <ShieldAlert className="w-3.5 h-3.5" /> {t("saPromote")}
                      </Button>
                    )}
                    {(isFullCreator || (isAgentOnlyCreator && u.role === "agent")) && me?.id !== u.id && u.role !== "super_admin" && (
                      <Button variant="ghost" size="sm" onClick={() => setDelUser(u)} className="text-red-600 hover:text-red-700">
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

      {/* Add user dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent dir={dir} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("usersAdd")}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.target as HTMLFormElement);
              create.mutate(Object.fromEntries(fd.entries()));
            }}
            className="space-y-3"
          >
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t("usersUsername")}</Label>
                <Input name="username" required dir="ltr" />
              </div>
              <div className="space-y-1.5">
                <Label>{t("usersEmail")}</Label>
                <Input name="email" type="email" required dir="ltr" />
              </div>
              <div className="space-y-1.5">
                <Label>{t("usersDisplayNameAr")}</Label>
                <Input name="displayNameAr" required />
              </div>
              <div className="space-y-1.5">
                <Label>{t("usersDisplayNameEn")}</Label>
                <Input name="displayNameEn" required dir="ltr" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t("usersRole")}</Label>
              <Select name="role" defaultValue={creatableRoles[0]}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {creatableRoles.map((r) => (
                    <SelectItem key={r} value={r}>{t(ROLE_LABEL_KEYS[r])}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("usersPassword")}</Label>
              <Input name="password" type="password" minLength={6} required dir="ltr" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>{t("cancel")}</Button>
              <Button type="submit" disabled={create.isPending}>{t("save")}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Change password dialog */}
      <Dialog open={!!pwUser} onOpenChange={(o) => !o && setPwUser(null)}>
        <DialogContent dir={dir} className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("usersChangePassword")} — {pwUser?.username}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!pwUser) return;
              const fd = new FormData(e.target as HTMLFormElement);
              changePw.mutate({ id: pwUser.id, password: String(fd.get("password") || "") });
            }}
            className="space-y-3"
          >
            <div className="space-y-1.5">
              <Label>{t("usersNewPassword")}</Label>
              <Input name="password" type="password" minLength={6} required dir="ltr" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPwUser(null)}>{t("cancel")}</Button>
              <Button type="submit" disabled={changePw.isPending}>{t("save")}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Excel import */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent dir={dir} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("usersImport")}</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">{t("usersImportHint")}</p>
          <Button variant="outline" size="sm" className="gap-1.5 self-start"
            onClick={() => downloadFile("/api/users/template", "users-template.xlsx")}>
            <Download className="w-4 h-4" /> {t("usersTemplate")}
          </Button>
          <Input type="file" accept=".xlsx" dir="ltr"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                const fd = new FormData();
                fd.append("file", file);
                const res = await fetch("/api/users/import", { method: "POST", body: fd, credentials: "include" });
                if (!res.ok) throw await parseError(res);
                const body = await res.json();
                toast({ title: `${t("usersImportDone")} ${body.created}${body.errors?.length ? ` · ${body.errors.length} ${t("error")}` : ""}` });
                setImportOpen(false);
                window.location.reload();
              } catch (err: any) {
                toast({ title: err.message, variant: "destructive" });
              }
            }} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)}>{t("close")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!delUser} onOpenChange={(o) => !o && setDelUser(null)}>
        <AlertDialogContent dir={dir}>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("usersDeleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("usersDeleteDesc")}<br /><strong>{delUser?.username}</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => delUser && remove.mutate(delUser.id)}>
              {t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Promote to super admin */}
      <AlertDialog open={!!promoteUser} onOpenChange={(o) => !o && setPromoteUser(null)}>
        <AlertDialogContent dir={dir}>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("saPromote")} — {promoteUser?.username}</AlertDialogTitle>
            <AlertDialogDescription>{t("saPromoteConfirm")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => promoteUser && promote.mutate(promoteUser.id)}>
              {t("confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}

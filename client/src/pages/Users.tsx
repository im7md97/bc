import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useSystemUsers, useCreateSystemUser, useDeleteSystemUser, useChangeUserPassword, useChangeUserRole } from "@/hooks/use-users";
import { UserPlus, Trash2, Users, Loader2, User, AlertCircle, KeyRound, Edit2 } from "lucide-react";
import { format } from "date-fns";
import { ar, enUS } from "date-fns/locale";
import type { SystemUserResponse } from "@shared/schema";
import { useLanguage } from "@/contexts/LanguageContext";

export default function UsersPage() {
  const { data: users, isLoading, isError } = useSystemUsers();
  const createMutation = useCreateSystemUser();
  const deleteMutation = useDeleteSystemUser();
  const changePasswordMutation = useChangeUserPassword();
  const changeRoleMutation = useChangeUserRole();
  const { t, dir, lang } = useLanguage();

  const ROLES = [
    { value: "quality", label: t("roleQuality"), color: "bg-blue-500/10 text-blue-700 border-blue-300" },
    { value: "supervisor", label: t("roleSupervisor"), color: "bg-purple-500/10 text-purple-700 border-purple-300" },
    { value: "agent", label: t("roleAgent"), color: "bg-green-500/10 text-green-700 border-green-300" },
    { value: "manager", label: t("roleManager"), color: "bg-orange-500/10 text-orange-700 border-orange-300" },
    { value: "admin", label: t("roleAdmin"), color: "bg-red-500/10 text-red-700 border-red-300" },
  ];

  const roleInfo = (role: string) =>
    ROLES.find(r => r.value === role) || { value: role, label: role, color: "bg-secondary text-foreground border-border" };

  const RoleBadge = ({ role }: { role: string }) => {
    const info = roleInfo(role);
    return (
      <Badge variant="outline" className={`${info.color} px-3 py-1 font-medium text-xs`}>
        {info.label}
      </Badge>
    );
  };

  const formSchema = z.object({
    username: z.string().min(2, t("usersUsernameMinLength")),
    email: z.string().email(t("usersEmailInvalid")),
    role: z.enum(["quality", "supervisor", "agent", "admin", "manager"]),
    password: z.string().min(6, t("usersPasswordMinLength")),
  });

  type FormValues = z.infer<typeof formSchema>;

  const changePwSchema = z.object({
    password: z.string().min(6, t("usersPasswordMinLength")),
    confirm: z.string(),
  }).refine((d) => d.password === d.confirm, { message: t("usersPasswordNoMatch"), path: ["confirm"] });

  type ChangePwValues = z.infer<typeof changePwSchema>;

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SystemUserResponse | null>(null);
  const [changePwTarget, setChangePwTarget] = useState<SystemUserResponse | null>(null);
  const [changeRoleTarget, setChangeRoleTarget] = useState<SystemUserResponse | null>(null);
  const [newRole, setNewRole] = useState("");

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { username: "", email: "", role: "quality", password: "" },
  });

  const changePwForm = useForm<ChangePwValues>({
    resolver: zodResolver(changePwSchema),
    defaultValues: { password: "", confirm: "" },
  });

  const onSubmit = async (values: FormValues) => {
    try {
      const { password, ...rest } = values;
      await (createMutation as any).mutateAsync({ ...rest, password } as any);
      form.reset({ username: "", email: "", role: "quality", password: "" });
      setIsFormOpen(false);
    } catch {}
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try { await deleteMutation.mutateAsync(deleteTarget.id); setDeleteTarget(null); } catch {}
  };

  const handleChangePw = async (values: ChangePwValues) => {
    if (!changePwTarget) return;
    try {
      await changePasswordMutation.mutateAsync({ id: changePwTarget.id, password: values.password });
      changePwForm.reset();
      setChangePwTarget(null);
    } catch {}
  };

  const handleChangeRole = async () => {
    if (!changeRoleTarget || !newRole) return;
    try {
      await changeRoleMutation.mutateAsync({ id: changeRoleTarget.id, role: newRole });
      setChangeRoleTarget(null);
      setNewRole("");
    } catch {}
  };

  const roleCounts = ROLES.reduce((acc, r) => {
    acc[r.value] = users?.filter(u => u.role === r.value).length ?? 0;
    return acc;
  }, {} as Record<string, number>);

  const dateLocale = lang === "ar" ? ar : enUS;
  const dateFormat = lang === "ar" ? "dd MMMM yyyy" : "MMM dd, yyyy";

  return (
    <div className="min-h-screen bg-background flex flex-col font-sans" dir={dir}>
      <Navbar />

      <main className="flex-1 container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <div>
            <h2 className="text-3xl font-extrabold text-foreground tracking-tight">{t("usersTitle")}</h2>
            <p className="text-muted-foreground mt-1 text-lg">{t("usersSubtitle")}</p>
          </div>
          <Button
            onClick={() => setIsFormOpen(true)}
            className="bg-gradient-to-r from-primary to-blue-600 text-white shadow-lg shadow-primary/25 rounded-xl px-6 h-12 text-base font-bold w-full sm:w-auto"
            data-testid="button-add-user"
          >
            <UserPlus className="w-5 h-5 mr-2" />
            {t("usersAddBtn")}
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
          {ROLES.map(r => (
            <div key={r.value} className="bg-card border border-border/60 rounded-2xl p-4 flex items-center gap-3 shadow-sm">
              <div className={`p-2.5 rounded-xl ${r.color.split(" ").find(c => c.startsWith("bg-")) || "bg-secondary/50"}`}>
                <User className={`w-5 h-5 ${r.color.split(" ").find(c => c.startsWith("text-")) || "text-foreground"}`} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground leading-tight">{r.label}</p>
                <p className="text-2xl font-extrabold">{roleCounts[r.value]}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Table */}
        <div className="bg-card rounded-2xl border border-border/60 shadow-xl shadow-black/5 overflow-hidden">
          {isLoading ? (
            <div className="p-8 space-y-4">
              <Skeleton className="h-12 w-full rounded-lg" />
              <Skeleton className="h-14 w-full rounded-lg" />
              <Skeleton className="h-14 w-full rounded-lg" />
            </div>
          ) : isError ? (
            <div className="p-12 text-center flex flex-col items-center">
              <AlertCircle className="w-12 h-12 text-destructive mb-4" />
              <h3 className="text-xl font-bold">{t("usersErrorFetch")}</h3>
            </div>
          ) : users?.length === 0 ? (
            <div className="p-16 text-center flex flex-col items-center bg-secondary/10">
              <div className="bg-primary/10 p-4 rounded-full mb-4"><Users className="w-10 h-10 text-primary" /></div>
              <h3 className="text-2xl font-bold">{t("usersNoUsers")}</h3>
              <Button onClick={() => setIsFormOpen(true)} variant="outline" className="mt-6 border-primary/20 text-primary rounded-xl">
                {t("usersAddBtn")}
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-secondary/50">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className={`${dir === "rtl" ? "text-right" : "text-left"} font-bold text-foreground py-5`}>{t("usersColUsername")}</TableHead>
                    <TableHead className={`${dir === "rtl" ? "text-right" : "text-left"} font-bold text-foreground py-5 hidden sm:table-cell`}>{t("usersColEmail")}</TableHead>
                    <TableHead className={`${dir === "rtl" ? "text-right" : "text-left"} font-bold text-foreground py-5`}>{t("usersColRole")}</TableHead>
                    <TableHead className={`${dir === "rtl" ? "text-right" : "text-left"} font-bold text-foreground py-5 hidden md:table-cell`}>{t("usersColCreated")}</TableHead>
                    <TableHead className={`${dir === "rtl" ? "text-left" : "text-right"} font-bold text-foreground py-5`}>{t("actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users?.map((user) => (
                    <TableRow key={user.id} className="group hover:bg-secondary/20">
                      <TableCell className="py-4">
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary border border-primary/20 flex-shrink-0">
                            <span className="font-bold text-xs">{user.username.charAt(0).toUpperCase()}</span>
                          </div>
                          <span className="font-bold">{user.username}</span>
                        </div>
                      </TableCell>
                      <TableCell className="py-4 text-muted-foreground hidden sm:table-cell">{user.email}</TableCell>
                      <TableCell className="py-4"><RoleBadge role={user.role} /></TableCell>
                      <TableCell className="py-4 text-sm text-muted-foreground whitespace-nowrap hidden md:table-cell">
                        {format(new Date(user.createdAt), dateFormat, { locale: dateLocale })}
                      </TableCell>
                      <TableCell className={`py-4 ${dir === "rtl" ? "text-left" : "text-right"}`}>
                        <div className="flex justify-end gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                          <Button variant="ghost" size="icon"
                            onClick={() => { setChangeRoleTarget(user); setNewRole(user.role); }}
                            className="h-9 w-9 text-primary hover:bg-primary/10 bg-primary/5 sm:bg-transparent"
                            title={t("usersChangeRoleTitle")} data-testid={`button-change-role-${user.id}`}>
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon"
                            onClick={() => { setChangePwTarget(user); changePwForm.reset(); }}
                            className="h-9 w-9 text-amber-600 hover:bg-amber-50 bg-amber-50/50 sm:bg-transparent"
                            title={t("usersChangePwTitle")} data-testid={`button-change-pw-${user.id}`}>
                            <KeyRound className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon"
                            onClick={() => setDeleteTarget(user)}
                            className="h-9 w-9 text-red-600 hover:bg-red-50 bg-red-50/50 sm:bg-transparent"
                            title={t("delete")} data-testid={`button-delete-user-${user.id}`}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </main>

      {/* Add User Dialog */}
      <Dialog open={isFormOpen} onOpenChange={(open) => !open && setIsFormOpen(false)}>
        <DialogContent className="sm:max-w-[450px]" dir={dir}>
          <DialogHeader className={dir === "rtl" ? "text-right" : "text-left"}>
            <DialogTitle className="text-2xl font-bold text-primary">{t("usersAddTitle")}</DialogTitle>
            <DialogDescription className="text-muted-foreground">{t("usersAddDesc")}</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-2">
              <FormField control={form.control} name="username" render={({ field }) => (
                <FormItem className={dir === "rtl" ? "text-right" : "text-left"}>
                  <FormLabel className="font-semibold">{t("usersFieldUsername")}</FormLabel>
                  <FormControl>
                    <Input placeholder={t("usersUsernamePlaceholder")} className="bg-secondary/30 border-secondary h-11" {...field} data-testid="input-username" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="email" render={({ field }) => (
                <FormItem className={dir === "rtl" ? "text-right" : "text-left"}>
                  <FormLabel className="font-semibold">{t("usersFieldEmail")}</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="user@example.com" className="bg-secondary/30 border-secondary h-11" {...field} data-testid="input-email" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="password" render={({ field }) => (
                <FormItem className={dir === "rtl" ? "text-right" : "text-left"}>
                  <FormLabel className="font-semibold">{t("usersFieldPassword")}</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder={t("usersPwMinLength")} className="bg-secondary/30 border-secondary h-11" {...field} data-testid="input-password" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="role" render={({ field }) => (
                <FormItem className={dir === "rtl" ? "text-right" : "text-left"}>
                  <FormLabel className="font-semibold">{t("usersFieldRole")}</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger className="bg-secondary/30 border-secondary h-11" data-testid="select-role">
                        <SelectValue placeholder={t("usersSelectRole")} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent dir={dir}>
                      {ROLES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="flex gap-3 pt-3 border-t border-border/50">
                <Button type="submit" className="flex-1 bg-primary font-bold h-11" disabled={createMutation.isPending} data-testid="button-submit-user">
                  {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t("usersAddSubmit")}
                </Button>
                <Button type="button" variant="outline" onClick={() => setIsFormOpen(false)} className="h-11 px-6" disabled={createMutation.isPending}>
                  {t("cancel")}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Change Role Dialog */}
      <Dialog open={!!changeRoleTarget} onOpenChange={(open) => !open && setChangeRoleTarget(null)}>
        <DialogContent className="sm:max-w-[400px]" dir={dir}>
          <DialogHeader className={dir === "rtl" ? "text-right" : "text-left"}>
            <div className="flex items-center gap-3 mb-1">
              <div className="p-2 bg-primary/10 rounded-xl"><Edit2 className="w-5 h-5 text-primary" /></div>
              <DialogTitle className="text-xl font-bold">{t("usersChangeRoleTitle")}</DialogTitle>
            </div>
            <DialogDescription>
              {t("usersChangeRoleDesc")} <span className="font-bold text-foreground">"{changeRoleTarget?.username}"</span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground">{t("usersNewRole")}</label>
              <Select value={newRole} onValueChange={setNewRole}>
                <SelectTrigger className="bg-secondary/30 border-secondary h-11" data-testid="select-new-role">
                  <SelectValue placeholder={t("usersSelectRole")} />
                </SelectTrigger>
                <SelectContent dir={dir}>
                  {ROLES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-3 pt-3 border-t border-border/50">
              <Button onClick={handleChangeRole} className="flex-1 bg-primary font-bold h-11" disabled={changeRoleMutation.isPending || !newRole} data-testid="button-submit-role">
                {changeRoleMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("usersSaveRole")}
              </Button>
              <Button variant="outline" onClick={() => setChangeRoleTarget(null)} className="h-11 px-6" disabled={changeRoleMutation.isPending}>
                {t("cancel")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Change Password Dialog */}
      <Dialog open={!!changePwTarget} onOpenChange={(open) => !open && setChangePwTarget(null)}>
        <DialogContent className="sm:max-w-[420px]" dir={dir}>
          <DialogHeader className={dir === "rtl" ? "text-right" : "text-left"}>
            <div className="flex items-center gap-3 mb-1">
              <div className="p-2 bg-amber-500/10 rounded-xl"><KeyRound className="w-5 h-5 text-amber-600" /></div>
              <DialogTitle className="text-xl font-bold">{t("usersChangePwTitle")}</DialogTitle>
            </div>
            <DialogDescription>
              {t("usersChangePwDesc")} <span className="font-bold text-foreground">"{changePwTarget?.username}"</span>
            </DialogDescription>
          </DialogHeader>
          <Form {...changePwForm}>
            <form onSubmit={changePwForm.handleSubmit(handleChangePw)} className="space-y-4 mt-2">
              <FormField control={changePwForm.control} name="password" render={({ field }) => (
                <FormItem className={dir === "rtl" ? "text-right" : "text-left"}>
                  <FormLabel className="font-semibold">{t("usersNewPw")}</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder={t("usersPwMinLength")} className="bg-secondary/30 border-secondary h-11" {...field} data-testid="input-new-password" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={changePwForm.control} name="confirm" render={({ field }) => (
                <FormItem className={dir === "rtl" ? "text-right" : "text-left"}>
                  <FormLabel className="font-semibold">{t("usersConfirmPw")}</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder={t("usersConfirmPwPlaceholder")} className="bg-secondary/30 border-secondary h-11" {...field} data-testid="input-confirm-password" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="flex gap-3 pt-3 border-t border-border/50">
                <Button type="submit" className="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-bold h-11" disabled={changePasswordMutation.isPending} data-testid="button-submit-change-pw">
                  {changePasswordMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t("usersSavePw")}
                </Button>
                <Button type="button" variant="outline" onClick={() => setChangePwTarget(null)} className="h-11 px-6">
                  {t("cancel")}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent dir={dir} className="sm:max-w-[400px]">
          <AlertDialogHeader className={dir === "rtl" ? "text-right" : "text-left"}>
            <div className="p-3 bg-destructive/10 rounded-full w-fit mb-2"><Trash2 className="w-6 h-6 text-destructive" /></div>
            <AlertDialogTitle className="text-xl font-bold">{t("usersDeleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("usersDeleteDesc")} <span className="font-bold text-foreground">"{deleteTarget?.username}"</span> {t("usersDeletePermanent")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 mt-4">
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDeleteConfirm(); }}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground flex-1"
            >
              {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("usersDeleteConfirm")}
            </AlertDialogAction>
            <AlertDialogCancel disabled={deleteMutation.isPending} className="flex-1 mt-0">
              {t("usersDeleteCancel")}
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

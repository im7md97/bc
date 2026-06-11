import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import {
  useProjects, useCreateProject, useUpdateProject, useDeleteProject, type Project,
} from "@/hooks/use-wfm";
import { FolderOpen, Plus, Trash2, Edit2, AlertCircle, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { format } from "date-fns";
import { ar, enUS } from "date-fns/locale";
import { useLanguage } from "@/contexts/LanguageContext";

export default function ProjectsPage() {
  const { data: projects, isLoading, isError } = useProjects();
  const createMutation = useCreateProject();
  const updateMutation = useUpdateProject();
  const deleteMutation = useDeleteProject();
  const { t, dir, lang } = useLanguage();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Project | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);

  const formSchema = z.object({
    name: z.string().min(1, t("projectsNameRequired")),
    description: z.string().optional(),
    status: z.enum(["active", "inactive"]),
  });

  type FormValues = z.infer<typeof formSchema>;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "", description: "", status: "active" },
  });

  const openCreate = () => {
    setEditTarget(null);
    form.reset({ name: "", description: "", status: "active" });
    setIsFormOpen(true);
  };

  const openEdit = (project: Project) => {
    setEditTarget(project);
    form.reset({ name: project.name, description: project.description, status: project.status as "active" | "inactive" });
    setIsFormOpen(true);
  };

  const onSubmit = async (values: FormValues) => {
    try {
      if (editTarget) {
        await updateMutation.mutateAsync({ id: editTarget.id, ...values });
      } else {
        await createMutation.mutateAsync(values);
      }
      form.reset();
      setIsFormOpen(false);
      setEditTarget(null);
    } catch {}
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
    } catch {}
  };

  const dateLocale = lang === "ar" ? ar : enUS;
  const dateFormat = lang === "ar" ? "dd MMMM yyyy" : "MMM dd, yyyy";

  const activeCount = projects?.filter(p => p.status === "active").length ?? 0;
  const inactiveCount = projects?.filter(p => p.status === "inactive").length ?? 0;

  return (
    <div className="min-h-screen bg-background flex flex-col font-sans" dir={dir}>
      <Navbar />

      <main className="flex-1 container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <div>
            <h2 className="text-3xl font-extrabold text-foreground tracking-tight">{t("projectsTitle")}</h2>
            <p className="text-muted-foreground mt-1 text-lg">{t("projectsSubtitle")}</p>
          </div>
          <Button
            onClick={openCreate}
            className="bg-gradient-to-r from-primary to-blue-600 text-white shadow-lg shadow-primary/25 rounded-xl px-6 h-12 text-base font-bold w-full sm:w-auto"
          >
            <Plus className="w-5 h-5 mr-2" />
            {t("projectsAddBtn")}
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-card border border-border/60 rounded-2xl p-4 flex items-center gap-3 shadow-sm">
            <div className="bg-primary/10 p-2.5 rounded-xl"><FolderOpen className="w-5 h-5 text-primary" /></div>
            <div>
              <p className="text-xs text-muted-foreground">{t("dashTotalProjects")}</p>
              <p className="text-2xl font-extrabold">{projects?.length ?? 0}</p>
            </div>
          </div>
          <div className="bg-card border border-border/60 rounded-2xl p-4 flex items-center gap-3 shadow-sm">
            <div className="bg-green-500/10 p-2.5 rounded-xl"><CheckCircle2 className="w-5 h-5 text-green-600" /></div>
            <div>
              <p className="text-xs text-muted-foreground">{t("projectsStatusActive")}</p>
              <p className="text-2xl font-extrabold">{activeCount}</p>
            </div>
          </div>
          <div className="bg-card border border-border/60 rounded-2xl p-4 flex items-center gap-3 shadow-sm">
            <div className="bg-slate-500/10 p-2.5 rounded-xl"><XCircle className="w-5 h-5 text-slate-500" /></div>
            <div>
              <p className="text-xs text-muted-foreground">{t("projectsStatusInactive")}</p>
              <p className="text-2xl font-extrabold">{inactiveCount}</p>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-card rounded-2xl border border-border/60 shadow-xl shadow-black/5 overflow-hidden">
          {isLoading ? (
            <div className="p-8 space-y-4">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
            </div>
          ) : isError ? (
            <div className="p-12 text-center flex flex-col items-center">
              <AlertCircle className="w-12 h-12 text-destructive mb-4" />
              <h3 className="text-xl font-bold">{t("projectsErrorFetch")}</h3>
            </div>
          ) : projects?.length === 0 ? (
            <div className="p-16 text-center flex flex-col items-center bg-secondary/10">
              <div className="bg-primary/10 p-4 rounded-full mb-4">
                <FolderOpen className="w-10 h-10 text-primary" />
              </div>
              <h3 className="text-2xl font-bold">{t("projectsNoProjects")}</h3>
              <Button onClick={openCreate} variant="outline" className="mt-6 border-primary/20 text-primary rounded-xl">
                {t("projectsAddBtn")}
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-secondary/50">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className={`${dir === "rtl" ? "text-right" : "text-left"} font-bold text-foreground py-5`}>{t("projectsColName")}</TableHead>
                    <TableHead className={`${dir === "rtl" ? "text-right" : "text-left"} font-bold text-foreground py-5 hidden md:table-cell`}>{t("projectsColDesc")}</TableHead>
                    <TableHead className={`${dir === "rtl" ? "text-right" : "text-left"} font-bold text-foreground py-5`}>{t("projectsColStatus")}</TableHead>
                    <TableHead className={`${dir === "rtl" ? "text-right" : "text-left"} font-bold text-foreground py-5 hidden sm:table-cell`}>{t("projectsColCreated")}</TableHead>
                    <TableHead className={`${dir === "rtl" ? "text-left" : "text-right"} font-bold text-foreground py-5`}>{t("actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {projects?.map((project) => (
                    <TableRow key={project.id} className="group hover:bg-secondary/20">
                      <TableCell className="py-4 font-bold">
                        <div className="flex items-center gap-2">
                          <div className="bg-primary/10 p-1.5 rounded-lg">
                            <FolderOpen className="w-4 h-4 text-primary" />
                          </div>
                          {project.name}
                        </div>
                      </TableCell>
                      <TableCell className="py-4 text-muted-foreground hidden md:table-cell max-w-xs truncate">
                        {project.description || "—"}
                      </TableCell>
                      <TableCell className="py-4">
                        <Badge
                          variant="outline"
                          className={project.status === "active"
                            ? "bg-green-500/10 text-green-700 border-green-300"
                            : "bg-slate-500/10 text-slate-600 border-slate-300"}
                        >
                          {project.status === "active" ? t("projectsStatusActive") : t("projectsStatusInactive")}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-4 text-sm text-muted-foreground whitespace-nowrap hidden sm:table-cell">
                        {format(new Date(project.createdAt), dateFormat, { locale: dateLocale })}
                      </TableCell>
                      <TableCell className={`py-4 ${dir === "rtl" ? "text-left" : "text-right"}`}>
                        <div className="flex justify-end gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="ghost" size="icon"
                            onClick={() => openEdit(project)}
                            className="h-9 w-9 text-primary hover:bg-primary/10 bg-primary/5 sm:bg-transparent"
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost" size="icon"
                            onClick={() => setDeleteTarget(project)}
                            className="h-9 w-9 text-red-600 hover:bg-red-50 bg-red-50/50 sm:bg-transparent"
                          >
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

      {/* Create / Edit Dialog */}
      <Dialog open={isFormOpen} onOpenChange={(open) => { if (!open) { setIsFormOpen(false); setEditTarget(null); } }}>
        <DialogContent className="sm:max-w-[480px]" dir={dir}>
          <DialogHeader className={dir === "rtl" ? "text-right" : "text-left"}>
            <DialogTitle className="text-2xl font-bold text-primary">
              {editTarget ? t("projectsEditTitle") : t("projectsAddTitle")}
            </DialogTitle>
            <DialogDescription>{t("projectsAddDesc")}</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-2">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem className={dir === "rtl" ? "text-right" : "text-left"}>
                  <FormLabel className="font-semibold">{t("projectsFieldName")}</FormLabel>
                  <FormControl>
                    <Input placeholder={t("projectsNamePlaceholder")} className="bg-secondary/30 border-secondary h-11" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="description" render={({ field }) => (
                <FormItem className={dir === "rtl" ? "text-right" : "text-left"}>
                  <FormLabel className="font-semibold">{t("projectsFieldDesc")}</FormLabel>
                  <FormControl>
                    <Textarea placeholder={t("projectsDescPlaceholder")} className="bg-secondary/30 border-secondary resize-none h-24" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="status" render={({ field }) => (
                <FormItem className={dir === "rtl" ? "text-right" : "text-left"}>
                  <FormLabel className="font-semibold">{t("projectsColStatus")}</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="bg-secondary/30 border-secondary h-11">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent dir={dir}>
                      <SelectItem value="active">{t("projectsStatusActive")}</SelectItem>
                      <SelectItem value="inactive">{t("projectsStatusInactive")}</SelectItem>
                    </SelectContent>
                  </Select>
                </FormItem>
              )} />
              <div className="flex gap-3 pt-3 border-t border-border/50">
                <Button
                  type="submit"
                  className="flex-1 bg-primary font-bold h-11"
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  {(createMutation.isPending || updateMutation.isPending) && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {editTarget ? t("projectsEditSubmit") : t("projectsAddSubmit")}
                </Button>
                <Button type="button" variant="outline" onClick={() => { setIsFormOpen(false); setEditTarget(null); }} className="h-11 px-6">
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
            <div className="p-3 bg-destructive/10 rounded-full w-fit mb-2">
              <Trash2 className="w-6 h-6 text-destructive" />
            </div>
            <AlertDialogTitle className="text-xl font-bold">{t("projectsDeleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("projectsDeleteDesc")} <span className="font-bold text-foreground">"{deleteTarget?.name}"</span> {t("projectsDeletePermanent")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 mt-4">
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDeleteConfirm(); }}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground flex-1"
            >
              {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("projectsDeleteConfirm")}
            </AlertDialogAction>
            <AlertDialogCancel disabled={deleteMutation.isPending} className="flex-1 mt-0">
              {t("projectsDeleteCancel")}
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

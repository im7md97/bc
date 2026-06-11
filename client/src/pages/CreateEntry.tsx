import { useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocation } from "wouter";
import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { insertEntrySchema } from "@shared/schema";
import { useCreateEntry } from "@/hooks/use-entries";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, ArrowRight, ArrowLeft, CheckCircle2, XCircle, ShieldCheck,
  Mic, Upload, Trash2, Music,
} from "lucide-react";
import { z } from "zod";
import { useLanguage } from "@/contexts/LanguageContext";

const formSchema = insertEntrySchema;
type FormValues = z.infer<typeof formSchema>;

function QualityBadge({ value }: { value: string }) {
  if (value === "Pass") return (
    <span className="inline-flex items-center gap-1 text-green-600 font-bold">
      <CheckCircle2 className="w-4 h-4" /> Pass
    </span>
  );
  if (value === "Fail") return (
    <span className="inline-flex items-center gap-1 text-red-600 font-bold">
      <XCircle className="w-4 h-4" /> Fail
    </span>
  );
  return <span className="text-muted-foreground">—</span>;
}

function AudioUploader({ onUpload, audioUrl, onClear }: {
  onUpload: (url: string) => void;
  audioUrl: string | null;
  onClear: () => void;
}) {
  const { toast } = useToast();
  const { t } = useLanguage();
  const fileRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [uploading, setUploading] = useState(false);
  const [fileName, setFileName] = useState<string>("");

  const handleFile = async (file: File) => {
    if (!file) return;
    setFileName(file.name);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("audio", file);
      const res = await fetch("/api/upload/audio", {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Upload failed" }));
        throw new Error(err.message);
      }
      const { url } = await res.json();
      onUpload(url);
      toast({ title: t("createAudioSection"), description: "✓" });
    } catch (err: any) {
      toast({ title: t("error"), description: err.message, variant: "destructive" });
      setFileName("");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-3">
      {!audioUrl ? (
        <div
          className="border-2 border-dashed border-border/60 rounded-2xl p-6 text-center cursor-pointer hover:border-primary/40 hover:bg-primary/5 transition-all group"
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer.files[0];
            if (file) handleFile(file);
          }}
        >
          {uploading ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
              <p className="text-sm text-muted-foreground">{t("createAudioUploading")}</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <div className="bg-primary/10 p-3 rounded-full group-hover:bg-primary/20 transition-colors">
                <Upload className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-foreground">{t("createAudioDrop")}</p>
                <p className="text-sm text-muted-foreground mt-1">{t("createAudioTypes")}</p>
              </div>
              <Button type="button" variant="outline" size="sm" className="border-primary/20 text-primary rounded-xl" data-testid="button-browse-audio">
                <Mic className="w-4 h-4 ml-1" /> {t("createAudioBrowse")}
              </Button>
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="audio/*"
            className="hidden"
            data-testid="input-audio-file"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
        </div>
      ) : (
        <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4 flex items-center gap-4">
          <div className="bg-primary/10 p-2 rounded-xl flex-shrink-0">
            <Music className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-foreground text-sm truncate">{fileName || t("createAudioSection")}</p>
            <audio
              ref={audioRef}
              src={audioUrl}
              onEnded={() => {}}
              className="w-full mt-2 h-8"
              controls
              style={{ height: "32px" }}
            />
          </div>
          <Button
            type="button" variant="ghost" size="icon"
            onClick={() => { onClear(); setFileName(""); }}
            className="h-8 w-8 text-red-500 hover:bg-red-50 flex-shrink-0"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

export default function CreateEntry() {
  const [, setLocation] = useLocation();
  const createMutation = useCreateEntry();
  const { t, dir } = useLanguage();
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingValues, setPendingValues] = useState<FormValues | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      employeeName: "",
      nationalId: "",
      callDate: new Date().toISOString().split('T')[0],
      contactNumber: "",
      caseNumber: "",
      employeeId: "",
      actionRequired: "",
      qualityInternal: "",
      qualityExternal: "",
      customerSatisfaction: "",
      defectReason: "",
      requiredActionDetail: "",
      status: "pending",
      audioUrl: undefined,
    },
  });

  const onSubmit = (values: FormValues) => {
    setPendingValues({ ...values, audioUrl: audioUrl ?? undefined });
    setShowConfirm(true);
  };

  const handleConfirm = async () => {
    if (!pendingValues) return;
    try {
      await createMutation.mutateAsync(pendingValues);
      setShowConfirm(false);
      setLocation("/");
    } catch (error) {}
  };

  const handleCancel = () => {
    setShowConfirm(false);
    setPendingValues(null);
  };

  const BackIcon = dir === "rtl" ? ArrowRight : ArrowLeft;

  return (
    <div className="min-h-screen bg-background flex flex-col font-sans" dir={dir}>
      <Navbar />

      <main className="flex-1 container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-4 mb-8">
            <Button variant="ghost" size="icon" onClick={() => setLocation("/")} className="rounded-full">
              <BackIcon className="w-5 h-5" />
            </Button>
            <h1 className="text-3xl font-extrabold text-foreground tracking-tight">{t("createTitle")}</h1>
          </div>

          <div className="bg-card rounded-2xl border border-border/60 shadow-xl p-6 sm:p-10">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField control={form.control} name="employeeName" render={({ field }) => (
                    <FormItem className={dir === "rtl" ? "text-right" : "text-left"}>
                      <FormLabel className="font-semibold text-foreground">{t("createEmployeeName")}</FormLabel>
                      <FormControl>
                        <Input placeholder={t("createEmployeeName")} className="bg-secondary/30 border-secondary h-11" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="nationalId" render={({ field }) => (
                    <FormItem className={dir === "rtl" ? "text-right" : "text-left"}>
                      <FormLabel className="font-semibold text-foreground">{t("createNationalId")}</FormLabel>
                      <FormControl>
                        <Input placeholder={t("createNationalId")} className="bg-secondary/30 border-secondary h-11" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="callDate" render={({ field }) => (
                    <FormItem className={dir === "rtl" ? "text-right" : "text-left"}>
                      <FormLabel className="font-semibold text-foreground">{t("createCallDate")}</FormLabel>
                      <FormControl>
                        <Input type="date" className="bg-secondary/30 border-secondary h-11" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="contactNumber" render={({ field }) => (
                    <FormItem className={dir === "rtl" ? "text-right" : "text-left"}>
                      <FormLabel className="font-semibold text-foreground">{t("createContactNumber")}</FormLabel>
                      <FormControl>
                        <Input placeholder={t("createContactNumber")} className="bg-secondary/30 border-secondary h-11" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="caseNumber" render={({ field }) => (
                    <FormItem className={dir === "rtl" ? "text-right" : "text-left"}>
                      <FormLabel className="font-semibold text-foreground">{t("createCaseNumber")}</FormLabel>
                      <FormControl>
                        <Input placeholder={t("createCaseNumber")} className="bg-secondary/30 border-secondary h-11" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="employeeId" render={({ field }) => (
                    <FormItem className={dir === "rtl" ? "text-right" : "text-left"}>
                      <FormLabel className="font-semibold text-foreground">{t("createEmployeeId")}</FormLabel>
                      <FormControl>
                        <Input placeholder={t("createEmployeeId")} className="bg-secondary/30 border-secondary h-11" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                {/* Audio Upload Section */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="bg-primary/10 p-1.5 rounded-lg">
                      <Mic className="w-4 h-4 text-primary" />
                    </div>
                    <h3 className="font-semibold text-foreground">{t("createAudioSection")}</h3>
                    <span className="text-xs text-muted-foreground bg-secondary/50 px-2 py-0.5 rounded-full">{t("createAudioOptional")}</span>
                  </div>
                  <AudioUploader
                    audioUrl={audioUrl}
                    onUpload={(url) => setAudioUrl(url)}
                    onClear={() => setAudioUrl(null)}
                  />
                </div>

                <div className="border-t border-border/40 pt-6">
                  <h3 className="text-base font-bold text-foreground mb-4">{t("createRequiredActions")}</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <FormField control={form.control} name="actionRequired" render={({ field }) => (
                      <FormItem className={dir === "rtl" ? "text-right" : "text-left"}>
                        <FormLabel className="font-semibold text-foreground">{t("createActionRequired")}</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger className="bg-secondary/30 border-secondary h-11">
                              <SelectValue placeholder={t("confirm")} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent dir={dir}>
                            <SelectItem value="Yes">{t("createYes")}</SelectItem>
                            <SelectItem value="No">{t("createNo")}</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />

                    <FormField control={form.control} name="status" render={({ field }) => (
                      <FormItem className={dir === "rtl" ? "text-right" : "text-left"}>
                        <FormLabel className="font-semibold text-foreground">{t("createStatus")}</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger className="bg-secondary/30 border-secondary h-11">
                              <SelectValue placeholder={t("createStatus")} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent dir={dir}>
                            <SelectItem value="pending">{t("createStatusPending")}</SelectItem>
                            <SelectItem value="in-progress">{t("createStatusInProgress")}</SelectItem>
                            <SelectItem value="completed">{t("createStatusCompleted")}</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                </div>

                <div className="border-t border-border/40 pt-6">
                  <h3 className="text-base font-bold text-foreground mb-4">{t("createQualitySection")}</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <FormField control={form.control} name="qualityInternal" render={({ field }) => (
                      <FormItem className={dir === "rtl" ? "text-right" : "text-left"}>
                        <FormLabel className="font-semibold text-foreground">{t("createQualityInternal")}</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger className="bg-secondary/30 border-secondary h-11">
                              <SelectValue placeholder="—" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent dir={dir}>
                            <SelectItem value="Pass">Pass</SelectItem>
                            <SelectItem value="Fail">Fail</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />

                    <FormField control={form.control} name="qualityExternal" render={({ field }) => (
                      <FormItem className={dir === "rtl" ? "text-right" : "text-left"}>
                        <FormLabel className="font-semibold text-foreground">{t("createQualityExternal")}</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger className="bg-secondary/30 border-secondary h-11">
                              <SelectValue placeholder="—" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent dir={dir}>
                            <SelectItem value="Pass">Pass</SelectItem>
                            <SelectItem value="Fail">Fail</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />

                    <FormField control={form.control} name="customerSatisfaction" render={({ field }) => (
                      <FormItem className={dir === "rtl" ? "text-right" : "text-left"}>
                        <FormLabel className="font-semibold text-foreground">{t("createCustomerSat")}</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger className="bg-secondary/30 border-secondary h-11">
                              <SelectValue placeholder="—" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent dir={dir}>
                            <SelectItem value="Pass">Pass</SelectItem>
                            <SelectItem value="Fail">Fail</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                </div>

                <FormField control={form.control} name="defectReason" render={({ field }) => (
                  <FormItem className={dir === "rtl" ? "text-right" : "text-left"}>
                    <FormLabel className="font-semibold text-foreground">{t("createDefectReason")}</FormLabel>
                    <FormControl>
                      <Textarea placeholder={t("createDefectPlaceholder")} className="bg-secondary/30 border-secondary resize-none h-24" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="requiredActionDetail" render={({ field }) => (
                  <FormItem className={dir === "rtl" ? "text-right" : "text-left"}>
                    <FormLabel className="font-semibold text-foreground">{t("createRequiredActionDetail")}</FormLabel>
                    <FormControl>
                      <Textarea placeholder={t("createRequiredActionPlaceholder")} className="bg-secondary/30 border-secondary resize-none h-24" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <div className="flex gap-4 pt-6 border-t border-border/50">
                  <Button type="submit" className="flex-1 bg-primary text-primary-foreground font-bold h-12 text-lg">
                    {t("createSave")}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setLocation("/")} className="px-8 h-12 text-lg">
                    {t("cancel")}
                  </Button>
                </div>
              </form>
            </Form>
          </div>
        </div>
      </main>

      {/* Confirmation Dialog */}
      <AlertDialog open={showConfirm} onOpenChange={(open) => !open && handleCancel()}>
        <AlertDialogContent dir={dir} className="max-w-md">
          <AlertDialogHeader className={dir === "rtl" ? "text-right" : "text-left"}>
            <div className="flex items-center justify-center mb-3">
              <div className="bg-primary/10 p-3 rounded-full">
                <ShieldCheck className="w-8 h-8 text-primary" />
              </div>
            </div>
            <AlertDialogTitle className="text-center text-xl font-bold">{t("createConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription className="text-center text-muted-foreground">
              {t("createConfirmDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {pendingValues && (
            <div className="my-2 rounded-xl border border-border bg-secondary/20 p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-border/50 pb-2">
                <span className="text-sm text-muted-foreground">{t("createConfirmEmployee")}</span>
                <span className="font-semibold text-sm">{pendingValues.employeeName}</span>
              </div>
              <div className="flex items-center justify-between border-b border-border/50 pb-2">
                <span className="text-sm text-muted-foreground">{t("createConfirmCase")}</span>
                <span className="font-semibold text-sm">{pendingValues.caseNumber}</span>
              </div>
              <div className="flex items-center justify-between border-b border-border/50 pb-2">
                <span className="text-sm text-muted-foreground">{t("createQualityInternal")}</span>
                <QualityBadge value={pendingValues.qualityInternal} />
              </div>
              <div className="flex items-center justify-between border-b border-border/50 pb-2">
                <span className="text-sm text-muted-foreground">{t("createQualityExternal")}</span>
                <QualityBadge value={pendingValues.qualityExternal} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{t("createCustomerSat")}</span>
                <QualityBadge value={pendingValues.customerSatisfaction} />
              </div>
              {pendingValues.audioUrl && (
                <div className="flex items-center gap-2 pt-2 border-t border-border/50">
                  <Music className="w-4 h-4 text-primary flex-shrink-0" />
                  <span className="text-sm text-primary font-medium">{t("createConfirmAudio")}</span>
                </div>
              )}
            </div>
          )}

          <AlertDialogFooter className="flex-row-reverse gap-3 sm:flex-row-reverse">
            <AlertDialogAction
              onClick={handleConfirm}
              disabled={createMutation.isPending}
              className="flex-1 bg-primary text-primary-foreground font-bold h-11"
            >
              {createMutation.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              {t("createConfirmYes")}
            </AlertDialogAction>
            <AlertDialogCancel onClick={handleCancel} disabled={createMutation.isPending} className="flex-1 h-11">
              {t("createConfirmReview")}
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

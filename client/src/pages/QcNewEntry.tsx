import { useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Upload, Music, Search, ChevronLeft } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem,
} from "@/components/ui/command";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { useApi, useApiMutation } from "@/hooks/use-api";
import { apiRequest, parseError } from "@/lib/api";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/hooks/use-toast";

interface Agent { id: number; employeeId: string; nameAr: string; nameEn: string; projectNameAr: string | null; projectNameEn: string | null; }

const PASS_FAIL = ["Pass", "Fail", "N/A"];

export default function QcNewEntryPage() {
  const { t, lang, dir } = useLanguage();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [agentPickerOpen, setAgentPickerOpen] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [agentSearch, setAgentSearch] = useState("");

  const { data: agents } = useApi<Agent[]>(
    `/api/agents${agentSearch ? `?search=${encodeURIComponent(agentSearch)}` : ""}`,
    { queryKey: ["/api/agents", agentSearch] },
  );

  const schema = z.object({
    callDate: z.string().min(1),
    contactNumber: z.string().min(1),
    caseNumber: z.string().min(1),
    actionRequired: z.string().min(1),
    qualityInternal: z.string().min(1),
    qualityExternal: z.string().min(1),
    customerSatisfaction: z.string().min(1),
    defectReason: z.string().min(1),
    requiredActionDetail: z.string().min(1),
  });
  type FormValues = z.infer<typeof schema>;

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      callDate: new Date().toISOString().slice(0, 10),
      contactNumber: "",
      caseNumber: "",
      actionRequired: "",
      qualityInternal: "Pass",
      qualityExternal: "Pass",
      customerSatisfaction: "Pass",
      defectReason: "",
      requiredActionDetail: "",
    },
  });

  const create = useApiMutation(
    (data: any) => apiRequest("POST", "/api/qc/entries", data),
    { successMessage: t("qcCreated"), onSuccess: () => setLocation("/qc/dashboard") },
  );

  const uploadAudio = async (file: File) => {
    const fd = new FormData();
    fd.append("audio", file);
    try {
      const res = await fetch("/api/upload/audio", { method: "POST", body: fd, credentials: "include" });
      if (!res.ok) throw await parseError(res);
      const data = await res.json();
      setAudioUrl(data.url);
      toast({ title: t("saveSuccess") });
    } catch (err: any) {
      toast({ title: err.message, variant: "destructive" });
    }
  };

  const onSubmit = (values: FormValues) => {
    if (!selectedAgent) {
      toast({ title: t("qcAgentPicker"), variant: "destructive" });
      return;
    }
    create.mutate({ ...values, agentId: selectedAgent.id, audioUrl });
  };

  return (
    <PageShell
      title={t("qcNewEntry")}
      actions={
        <Button variant="ghost" onClick={() => setLocation("/qc/dashboard")} className="gap-1">
          <ChevronLeft className={`w-4 h-4 ${dir === "rtl" ? "rotate-180" : ""}`} /> {t("back")}
        </Button>
      }
    >
      <Card className="rounded-2xl">
        <CardContent className="pt-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {/* Agent picker */}
              <div className="space-y-1.5">
                <Label>{t("qcAgentPicker")}</Label>
                <Popover open={agentPickerOpen} onOpenChange={setAgentPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-between font-normal h-11">
                      {selectedAgent
                        ? <span>{lang === "ar" ? selectedAgent.nameAr : selectedAgent.nameEn} <span className="text-xs text-muted-foreground" dir="ltr">({selectedAgent.employeeId})</span></span>
                        : <span className="text-muted-foreground gap-2 flex items-center"><Search className="w-4 h-4" /> {t("qcAgentSearch")}</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[400px] p-0" align="start" dir={dir}>
                    <Command shouldFilter={false}>
                      <CommandInput placeholder={t("qcAgentSearch")} value={agentSearch} onValueChange={setAgentSearch} />
                      <CommandList>
                        <CommandEmpty>{t("noData")}</CommandEmpty>
                        <CommandGroup>
                          {(agents ?? []).map((a) => (
                            <CommandItem
                              key={a.id}
                              value={a.employeeId}
                              onSelect={() => { setSelectedAgent(a); setAgentPickerOpen(false); }}
                              className="flex justify-between"
                            >
                              <span>{lang === "ar" ? a.nameAr : a.nameEn}</span>
                              <span className="text-xs text-muted-foreground" dir="ltr">{a.employeeId}</span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <FormField control={form.control} name="callDate" render={({ field }) => (
                  <FormItem><FormLabel>{t("qcCallDate")}</FormLabel><FormControl><Input type="date" {...field} dir="ltr" /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="contactNumber" render={({ field }) => (
                  <FormItem><FormLabel>{t("qcContactNumber")}</FormLabel><FormControl><Input {...field} dir="ltr" /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="caseNumber" render={({ field }) => (
                  <FormItem><FormLabel>{t("qcCaseNumber")}</FormLabel><FormControl><Input {...field} dir="ltr" /></FormControl><FormMessage /></FormItem>
                )} />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {(["qualityInternal", "qualityExternal", "customerSatisfaction"] as const).map((field) => (
                  <FormField key={field} control={form.control} name={field} render={({ field: f }) => (
                    <FormItem>
                      <FormLabel>{t(field === "qualityInternal" ? "qcQualityInternal" : field === "qualityExternal" ? "qcQualityExternal" : "qcCsat")}</FormLabel>
                      <Select value={f.value} onValueChange={f.onChange}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {PASS_FAIL.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                ))}
              </div>

              <FormField control={form.control} name="actionRequired" render={({ field }) => (
                <FormItem><FormLabel>{t("qcActionRequired")}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="defectReason" render={({ field }) => (
                <FormItem><FormLabel>{t("qcDefectReason")}</FormLabel><FormControl><Textarea rows={2} {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="requiredActionDetail" render={({ field }) => (
                <FormItem><FormLabel>{t("qcRequiredActionDetail")}</FormLabel><FormControl><Textarea rows={3} {...field} /></FormControl><FormMessage /></FormItem>
              )} />

              <div className="space-y-1.5">
                <Label>{t("qcAudio")}</Label>
                <div className="flex items-center gap-3">
                  <Input type="file" accept="audio/*,video/mp4" dir="ltr"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadAudio(f); }} />
                  {audioUrl && (
                    <a href={audioUrl} target="_blank" rel="noreferrer" className="text-xs text-primary inline-flex items-center gap-1">
                      <Music className="w-3.5 h-3.5" /> {t("view")}
                    </a>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <Button type="button" variant="outline" onClick={() => setLocation("/qc/dashboard")}>{t("cancel")}</Button>
                <Button type="submit" disabled={create.isPending} className="gap-2">
                  <Upload className="w-4 h-4" /> {t("save")}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </PageShell>
  );
}

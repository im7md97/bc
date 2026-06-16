import { useState } from "react";
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, Save } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  RadioGroup, RadioGroupItem,
} from "@/components/ui/radio-group";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useApi } from "@/hooks/use-api";
import { apiRequest, parseError, downloadFile } from "@/lib/api";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/hooks/use-toast";

interface ProjectOption { id: number; nameAr: string; nameEn: string; }
interface SupervisorOption { id: number; displayNameAr: string; displayNameEn: string; }

interface PreviewResult {
  empHeader: string;
  mappedColumns: { header: string; key: string; labelAr: string; labelEn: string }[];
  unmappedColumns: string[];
  recognized: { employeeId: string; agentId: number; nameAr: string; nameEn: string; metrics: Record<string, unknown> }[];
  unknown: { employeeId: string; metrics: Record<string, unknown> }[];
  totals: { rows: number; recognized: number; unknown: number };
}

type UnknownDecision = { mode: "add" | "skip"; nameAr?: string; nameEn?: string; inboundId?: string; supervisorUserId?: string };

export default function AprUploadPage() {
  const { t, lang, dir } = useLanguage();
  const { toast } = useToast();

  const [projectId, setProjectId] = useState<string>("");
  const [asOfDate, setAsOfDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [timeFormat, setTimeFormat] = useState<"hh_mm_ss" | "seconds">("hh_mm_ss");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [decisions, setDecisions] = useState<Record<string, UnknownDecision>>({});
  const [parsing, setParsing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [result, setResult] = useState<{ added: number; skipped: number; new_agents: number } | null>(null);

  const { data: projects } = useApi<ProjectOption[]>("/api/projects");
  const { data: supervisors } = useApi<SupervisorOption[]>("/api/users/supervisors");

  const doPreview = async () => {
    if (!file || !projectId) return;
    setParsing(true);
    setPreview(null);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("projectId", projectId);
      const res = await fetch("/api/apr/upload/preview", { method: "POST", body: fd, credentials: "include" });
      if (!res.ok) throw await parseError(res);
      const data: PreviewResult = await res.json();
      setPreview(data);
      const initial: Record<string, UnknownDecision> = {};
      for (const u of data.unknown) initial[u.employeeId] = { mode: "skip" };
      setDecisions(initial);
    } catch (err: any) {
      toast({ title: err.message, variant: "destructive" });
    } finally {
      setParsing(false);
    }
  };

  const doCommit = async () => {
    if (!preview) return;
    setCommitting(true);
    try {
      const newAgents: any[] = [];
      const skipped: string[] = [];
      for (const u of preview.unknown) {
        const d = decisions[u.employeeId];
        if (d?.mode === "add") {
          if (!d.nameAr?.trim() && !d.nameEn?.trim()) {
            toast({ title: t("aprFillNames"), variant: "destructive" });
            setCommitting(false);
            return;
          }
          newAgents.push({
            employeeId: u.employeeId,
            nameAr: d.nameAr || d.nameEn,
            nameEn: d.nameEn || d.nameAr,
            inboundId: d.inboundId || null,
            supervisorUserId: d.supervisorUserId && d.supervisorUserId !== "_none" ? Number(d.supervisorUserId) : null,
          });
        } else {
          skipped.push(u.employeeId);
        }
      }

      const allRows = [
        ...preview.recognized.map((r) => ({ employeeId: r.employeeId, metrics: r.metrics })),
        ...preview.unknown
          .filter((u) => decisions[u.employeeId]?.mode === "add")
          .map((u) => ({ employeeId: u.employeeId, metrics: u.metrics })),
      ];

      const res = await apiRequest<{ added: number; skipped: number; new_agents: number }>(
        "POST", "/api/apr/upload/commit",
        {
          projectId: Number(projectId),
          asOfDate,
          timeFormat,
          fileName: file?.name,
          rows: allRows,
          newAgents,
          skipped,
        },
      );
      setResult(res);
      setPreview(null);
      setFile(null);
      toast({ title: t("aprCommitDone") });
    } catch (err: any) {
      toast({ title: err.message, variant: "destructive" });
    } finally {
      setCommitting(false);
    }
  };

  return (
    <PageShell title={t("aprUploadTitle")} actions={
      <Button variant="outline" size="sm" className="gap-1.5"
        onClick={() => downloadFile("/api/apr/template", "apr-template.xlsx")}>
        <Upload className="w-4 h-4 rotate-180" /> {t("aprTemplate")}
      </Button>
    }>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="rounded-2xl">
          <CardContent className="pt-6 space-y-4">
            <div className="space-y-1.5">
              <Label>{t("aprUploadStep1")}</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger><SelectValue placeholder={t("select")} /></SelectTrigger>
                <SelectContent>
                  {projects?.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>{lang === "ar" ? p.nameAr : p.nameEn}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("aprUploadStep2")}</Label>
              <Input type="date" value={asOfDate} max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setAsOfDate(e.target.value)} dir="ltr" />
            </div>
            <div className="space-y-1.5">
              <Label>{t("aprUploadStep3")}</Label>
              <RadioGroup value={timeFormat} onValueChange={(v) => setTimeFormat(v as any)}>
                <div className="flex items-center gap-2">
                  <RadioGroupItem id="hms" value="hh_mm_ss" />
                  <Label htmlFor="hms" className="font-normal cursor-pointer">{t("aprTimeHms")}</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem id="secs" value="seconds" />
                  <Label htmlFor="secs" className="font-normal cursor-pointer">{t("aprTimeSeconds")}</Label>
                </div>
              </RadioGroup>
            </div>
            <div className="space-y-1.5">
              <Label>{t("aprUploadStep4")}</Label>
              <Input type="file" accept=".xlsx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} dir="ltr" />
              {file && <p className="text-xs text-muted-foreground flex items-center gap-1"><FileSpreadsheet className="w-3.5 h-3.5" />{file.name}</p>}
            </div>
            <Button onClick={doPreview} disabled={!file || !projectId || parsing} className="w-full gap-2">
              <Upload className="w-4 h-4" /> {parsing ? t("loading") : t("aprParse")}
            </Button>
          </CardContent>
        </Card>

        {result && (
          <Card className="rounded-2xl bg-emerald-500/5 border-emerald-500/20">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-3 text-emerald-700">
                <CheckCircle2 className="w-5 h-5" />
                <h3 className="font-bold">{t("aprCommitDone")}</h3>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-card rounded-xl py-3">
                  <div className="text-2xl font-extrabold text-emerald-700">{result.added}</div>
                  <div className="text-xs text-muted-foreground">{t("aprAdded")}</div>
                </div>
                <div className="bg-card rounded-xl py-3">
                  <div className="text-2xl font-extrabold text-amber-600">{result.skipped}</div>
                  <div className="text-xs text-muted-foreground">{t("aprSkipped")}</div>
                </div>
                <div className="bg-card rounded-xl py-3">
                  <div className="text-2xl font-extrabold text-primary">{result.new_agents}</div>
                  <div className="text-xs text-muted-foreground">{t("aprNewAgents")}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {preview && (
        <div className="mt-6 space-y-4">
          <Card className="rounded-2xl">
            <CardContent className="pt-5">
              <h3 className="font-bold mb-3">{t("aprPreviewTitle")}</h3>
              <div className="flex flex-wrap gap-2 mb-4">
                <Badge variant="default">{t("aprRecognizedRows")}: {preview.totals.recognized}</Badge>
                <Badge variant="outline" className="bg-amber-500/10 text-amber-700 border-amber-300">{t("aprUnknownRows")}: {preview.totals.unknown}</Badge>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div>
                  <h4 className="font-semibold mb-1">{t("aprMappedColumns")}</h4>
                  <ul className="text-xs space-y-1">
                    {preview.mappedColumns.map((c) => (
                      <li key={c.header} className="flex justify-between bg-secondary/30 rounded px-2 py-1">
                        <span dir="ltr">{c.header}</span>
                        <span className="text-muted-foreground">→ {lang === "ar" ? c.labelAr : c.labelEn}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                {preview.unmappedColumns.length > 0 && (
                  <div>
                    <h4 className="font-semibold mb-1">{t("aprUnmappedColumns")}</h4>
                    <ul className="text-xs space-y-1">
                      {preview.unmappedColumns.map((h) => (
                        <li key={h} dir="ltr" className="bg-amber-500/10 text-amber-700 rounded px-2 py-1">{h}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {preview.unknown.length > 0 && (
            <Card className="rounded-2xl border-amber-300/40">
              <CardContent className="pt-5">
                <div className="flex items-center gap-2 mb-3 text-amber-700">
                  <AlertTriangle className="w-5 h-5" />
                  <h3 className="font-bold">{t("aprUnknownRows")} ({preview.unknown.length})</h3>
                </div>
                <p className="text-xs text-muted-foreground mb-3">{t("aprUnknownHint")}</p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("agEmployeeId")}</TableHead>
                      <TableHead>{t("actions")}</TableHead>
                      <TableHead>{t("aprFillNames")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.unknown.map((u) => {
                      const d = decisions[u.employeeId] ?? { mode: "skip" };
                      const setD = (next: UnknownDecision) =>
                        setDecisions((s) => ({ ...s, [u.employeeId]: next }));
                      return (
                        <TableRow key={u.employeeId}>
                          <TableCell className="font-semibold" dir="ltr">{u.employeeId}</TableCell>
                          <TableCell>
                            <RadioGroup value={d.mode} onValueChange={(v) => setD({ ...d, mode: v as any })} className="flex gap-3">
                              <div className="flex items-center gap-1">
                                <RadioGroupItem id={`add-${u.employeeId}`} value="add" />
                                <Label htmlFor={`add-${u.employeeId}`} className="font-normal cursor-pointer text-xs">{t("aprAddToSystem")}</Label>
                              </div>
                              <div className="flex items-center gap-1">
                                <RadioGroupItem id={`skip-${u.employeeId}`} value="skip" />
                                <Label htmlFor={`skip-${u.employeeId}`} className="font-normal cursor-pointer text-xs">{t("aprSkipRow")}</Label>
                              </div>
                            </RadioGroup>
                          </TableCell>
                          <TableCell>
                            {d.mode === "add" && (
                              <div className="grid grid-cols-2 gap-1.5">
                                <Input className="h-8 text-xs" placeholder={t("agNameAr")} value={d.nameAr ?? ""} onChange={(e) => setD({ ...d, nameAr: e.target.value })} />
                                <Input className="h-8 text-xs" placeholder={t("agNameEn")} dir="ltr" value={d.nameEn ?? ""} onChange={(e) => setD({ ...d, nameEn: e.target.value })} />
                                <Input className="h-8 text-xs" placeholder={t("agInboundId")} dir="ltr" value={d.inboundId ?? ""} onChange={(e) => setD({ ...d, inboundId: e.target.value })} />
                                <Select value={d.supervisorUserId ?? "_none"} onValueChange={(v) => setD({ ...d, supervisorUserId: v })}>
                                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder={t("agSupervisor")} /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="_none">{t("agNoSupervisor")}</SelectItem>
                                    {supervisors?.map((s) => (
                                      <SelectItem key={s.id} value={String(s.id)}>{lang === "ar" ? s.displayNameAr : s.displayNameEn}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          <div className="flex justify-end">
            <Button size="lg" onClick={doCommit} disabled={committing} className="gap-2">
              <Save className="w-4 h-4" /> {committing ? t("loading") : t("aprCommit")}
            </Button>
          </div>
        </div>
      )}
    </PageShell>
  );
}

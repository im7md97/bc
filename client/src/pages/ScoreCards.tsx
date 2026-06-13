import { useState } from "react";
import { Link } from "wouter";
import { Sparkles, Download, ChevronRight } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useApi, useApiMutation } from "@/hooks/use-api";
import { apiRequest, downloadFile } from "@/lib/api";
import { useAuth, can, featureOn } from "@/hooks/use-auth";
import { useLanguage } from "@/contexts/LanguageContext";
import { MONTH_KEYS } from "@/lib/i18n";

interface ScoreCard {
  id: number;
  projectId: number;
  agentId: number;
  periodYear: number;
  periodMonth: number;
  status: "draft" | "awaiting_agent" | "confirmed";
  finalScore: string | null;
  rankInTeam: number | null;
  agentNameAr: string | null;
  agentNameEn: string | null;
  employeeId: string | null;
  projectNameAr: string | null;
  projectNameEn: string | null;
  sentToAgentAt: string | null;
  confirmedAt: string | null;
}

interface ProjectOption { id: number; nameAr: string; nameEn: string; }

const NOW = new Date();
const YEARS = Array.from({ length: 5 }, (_, i) => NOW.getFullYear() - i);
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

function statusBadge(status: string, t: any) {
  const map: Record<string, { className: string; key: string }> = {
    draft: { className: "bg-slate-500/10 text-slate-700 border-slate-300", key: "statusDraft" },
    awaiting_agent: { className: "bg-amber-500/10 text-amber-700 border-amber-300", key: "statusAwaitingAgent" },
    confirmed: { className: "bg-emerald-500/10 text-emerald-700 border-emerald-300", key: "statusConfirmed" },
  };
  const cfg = map[status] ?? map.draft;
  return <Badge variant="outline" className={`${cfg.className} text-xs`}>{t(cfg.key)}</Badge>;
}

export default function ScoreCardsPage() {
  const { t, lang, dir } = useLanguage();
  const { data: me } = useAuth();
  const [genOpen, setGenOpen] = useState(false);
  const [genProject, setGenProject] = useState<string>("");
  const [genYear, setGenYear] = useState(String(NOW.getFullYear()));
  const [genMonth, setGenMonth] = useState(String(NOW.getMonth() + 1));

  const { data: cards, isLoading } = useApi<ScoreCard[]>("/api/scorecards");
  const { data: projects } = useApi<ProjectOption[]>("/api/projects");

  const canGenerate = can(me, "scorecard.generate");
  const canExport = can(me, "scorecard.export") && featureOn(me, "scorecard.export");

  const generate = useApiMutation(
    () => apiRequest<{ created: number; regenerated: number; agents: number }>("POST", "/api/scorecards/generate", {
      projectId: Number(genProject), periodYear: Number(genYear), periodMonth: Number(genMonth),
    }),
    {
      invalidate: [["/api/scorecards"]],
      onSuccess: (r) => {
        setGenOpen(false);
      },
      successMessage: t("saveSuccess"),
    },
  );

  return (
    <PageShell
      title={t("scTitle")}
      actions={
        <>
          {canGenerate && (
            <Button onClick={() => setGenOpen(true)} className="gap-2">
              <Sparkles className="w-4 h-4" /> {t("scGenerate")}
            </Button>
          )}
          {canExport && (
            <Button variant="outline" onClick={() => downloadFile("/api/scorecards/export", "scorecards.xlsx")} className="gap-2">
              <Download className="w-4 h-4" /> {t("export")}
            </Button>
          )}
        </>
      }
    >
      {isLoading && <Skeleton className="h-40 rounded-2xl" />}
      {!isLoading && cards?.length === 0 && (
        <Card className="rounded-2xl">
          <CardContent className="py-16 text-center text-muted-foreground">{t("scNoCards")}</CardContent>
        </Card>
      )}

      <div className="bg-card border border-border/60 rounded-2xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("scAgent")}</TableHead>
              <TableHead>{t("scProject")}</TableHead>
              <TableHead>{t("scPeriod")}</TableHead>
              <TableHead>{t("scFinalScore")}</TableHead>
              <TableHead>{t("scRank")}</TableHead>
              <TableHead>{t("scStatus")}</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cards?.map((c) => (
              <TableRow key={c.id} data-testid={`row-scorecard-${c.id}`}>
                <TableCell className="font-semibold">
                  <div>{lang === "ar" ? c.agentNameAr : c.agentNameEn}</div>
                  <div className="text-[10px] text-muted-foreground" dir="ltr">{c.employeeId}</div>
                </TableCell>
                <TableCell className="text-sm">{lang === "ar" ? c.projectNameAr : c.projectNameEn}</TableCell>
                <TableCell dir="ltr" className="text-sm">{c.periodYear}-{String(c.periodMonth).padStart(2, "0")}</TableCell>
                <TableCell className="font-bold" dir="ltr">
                  {c.finalScore ? `${(Number(c.finalScore) * 100).toFixed(1)}%` : "—"}
                </TableCell>
                <TableCell dir="ltr">{c.rankInTeam ?? "—"}</TableCell>
                <TableCell>{statusBadge(c.status, t)}</TableCell>
                <TableCell className={dir === "rtl" ? "text-left" : "text-right"}>
                  <Link href={`/scorecards/${c.id}`}>
                    <Button variant="ghost" size="sm" className="gap-1">
                      {t("view")} <ChevronRight className={`w-4 h-4 ${dir === "rtl" ? "rotate-180" : ""}`} />
                    </Button>
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Generate dialog */}
      <Dialog open={genOpen} onOpenChange={setGenOpen}>
        <DialogContent dir={dir} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("scGenerateTitle")}</DialogTitle>
            <DialogDescription>{t("scGenerateHint")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>{t("scProject")}</Label>
              <Select value={genProject} onValueChange={setGenProject}>
                <SelectTrigger><SelectValue placeholder={t("select")} /></SelectTrigger>
                <SelectContent>
                  {projects?.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>{lang === "ar" ? p.nameAr : p.nameEn}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t("scYear")}</Label>
                <Select value={genYear} onValueChange={setGenYear}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {YEARS.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("scMonth")}</Label>
                <Select value={genMonth} onValueChange={setGenMonth}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((m) => (
                      <SelectItem key={m} value={String(m)}>{t(MONTH_KEYS[m - 1])}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGenOpen(false)}>{t("cancel")}</Button>
            <Button disabled={!genProject || generate.isPending} onClick={() => generate.mutate(undefined as any)}>
              {generate.isPending ? t("loading") : t("scGenerate")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

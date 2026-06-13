import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import { Send, CheckCircle2, ArrowLeft, Trophy, Save } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useApi, useApiMutation } from "@/hooks/use-api";
import { apiRequest } from "@/lib/api";
import { useAuth, can, featureOn } from "@/hooks/use-auth";
import { useLanguage } from "@/contexts/LanguageContext";
import { MONTH_KEYS } from "@/lib/i18n";
import { formatHms } from "@/lib/duration";

interface ScoreCardLine {
  id: number;
  metricKey: string;
  labelAr: string;
  labelEn: string;
  rawValue: string | null;
  gridScore: string;
  weightedScore: string;
  weight: string | null;
  issues: string | null;
  solution: string | null;
  tierDirection: string;
}

interface ScoreCardDetail {
  card: {
    id: number;
    agentId: number;
    projectId: number;
    periodYear: number;
    periodMonth: number;
    status: "draft" | "awaiting_agent" | "confirmed";
    finalScore: string | null;
    rankInTeam: number | null;
    agentComment: string | null;
    sentToAgentAt: string | null;
    confirmedAt: string | null;
    agentNameAr: string | null;
    agentNameEn: string | null;
    employeeId: string | null;
  };
  lines: ScoreCardLine[];
}

function formatRaw(metricKey: string, raw: string | null) {
  if (raw === null || raw === undefined || raw === "") return "—";
  const num = Number(raw);
  if (isNaN(num)) return raw;
  if (metricKey.endsWith("_pct")) return `${(num * 100).toFixed(1)}%`;
  if (metricKey.includes("seconds") || metricKey === "aht_seconds") return formatHms(num);
  return num.toFixed(2);
}

export default function ScoreCardDetailPage() {
  const { id } = useParams<{ id: string }>();
  const cardId = Number(id);
  const [, setLocation] = useLocation();
  const { t, lang, dir } = useLanguage();
  const { data: me } = useAuth();

  const { data, isLoading } = useApi<ScoreCardDetail>(`/api/scorecards/${cardId}`,
    { enabled: !isNaN(cardId), queryKey: ["/api/scorecards", cardId] });

  const [lineEdits, setLineEdits] = useState<Record<number, { issues: string; solution: string }>>({});
  const [agentComment, setAgentComment] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);

  useEffect(() => {
    if (data) {
      const next: Record<number, any> = {};
      for (const l of data.lines) next[l.id] = { issues: l.issues ?? "", solution: l.solution ?? "" };
      setLineEdits(next);
      setAgentComment(data.card.agentComment ?? "");
    }
  }, [data]);

  const canWrite = can(me, "scorecard.write_issues") && data?.card.status !== "confirmed";
  const canSend = can(me, "scorecard.send_to_agent") && data?.card.status === "draft";
  const canConfirm = can(me, "scorecard.confirm") && data?.card.status === "awaiting_agent";
  const commentEnabled = featureOn(me, "scorecard.agent_comment");

  const saveLine = useApiMutation(
    ({ lineId, issues, solution }: { lineId: number; issues: string; solution: string }) =>
      apiRequest("PUT", `/api/scorecards/lines/${lineId}`, { issues, solution }),
    { invalidate: [["/api/scorecards", cardId]], successMessage: t("saveSuccess") },
  );
  const send = useApiMutation(
    () => apiRequest("POST", `/api/scorecards/${cardId}/send`),
    { invalidate: [["/api/scorecards", cardId], ["/api/scorecards"]], onSuccess: () => setSendOpen(false), successMessage: t("scSendDone") },
  );
  const confirm = useApiMutation(
    () => apiRequest("POST", `/api/scorecards/${cardId}/confirm`, { comment: commentEnabled ? agentComment : undefined }),
    { invalidate: [["/api/scorecards", cardId], ["/api/scorecards"]], onSuccess: () => setConfirmOpen(false), successMessage: t("scConfirmDone") },
  );

  if (isLoading || !data) {
    return (
      <PageShell title={t("scTitle")}>
        <Skeleton className="h-72 rounded-2xl" />
      </PageShell>
    );
  }

  const { card, lines } = data;
  const periodLabel = `${t(MONTH_KEYS[card.periodMonth - 1])} ${card.periodYear}`;
  const finalPct = card.finalScore ? `${(Number(card.finalScore) * 100).toFixed(1)}%` : "—";

  return (
    <PageShell
      title={`${lang === "ar" ? card.agentNameAr : card.agentNameEn} — ${periodLabel}`}
      actions={
        <Button variant="ghost" onClick={() => setLocation("/scorecards")} className="gap-1">
          <ArrowLeft className={`w-4 h-4 ${dir === "rtl" ? "rotate-180" : ""}`} /> {t("back")}
        </Button>
      }
    >
      {/* Header card */}
      <Card className="rounded-2xl mb-4">
        <CardContent className="pt-5">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-center">
            <div className="sm:col-span-2">
              <div className="flex items-baseline gap-2 mb-1">
                <h2 className="text-xl font-bold">{lang === "ar" ? card.agentNameAr : card.agentNameEn}</h2>
                <span className="text-sm text-muted-foreground" dir="ltr">{card.employeeId}</span>
              </div>
              <p className="text-sm text-muted-foreground">{periodLabel}</p>
            </div>
            <div className="text-center">
              <Trophy className="w-5 h-5 text-amber-500 mx-auto mb-1" />
              <div className="text-2xl font-extrabold" dir="ltr">{finalPct}</div>
              <div className="text-[11px] text-muted-foreground">{t("scFinalScore")}</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-extrabold" dir="ltr">{card.rankInTeam ?? "—"}</div>
              <div className="text-[11px] text-muted-foreground">{t("scRank")}</div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            {card.status === "draft" && <Badge variant="outline" className="bg-slate-500/10 text-slate-700">{t("statusDraft")}</Badge>}
            {card.status === "awaiting_agent" && <Badge variant="outline" className="bg-amber-500/10 text-amber-700">{t("statusAwaitingAgent")}</Badge>}
            {card.status === "confirmed" && <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700">{t("statusConfirmed")}</Badge>}
            {card.sentToAgentAt && <span className="text-muted-foreground">{t("scSentAt")}: <span dir="ltr">{new Date(card.sentToAgentAt).toLocaleString(lang === "ar" ? "ar-SA" : "en-US")}</span></span>}
            {card.confirmedAt && <span className="text-muted-foreground">{t("scConfirmedAt")}: <span dir="ltr">{new Date(card.confirmedAt).toLocaleString(lang === "ar" ? "ar-SA" : "en-US")}</span></span>}
          </div>
        </CardContent>
      </Card>

      {/* Metric lines */}
      <div className="space-y-3">
        {lines.map((line) => {
          const edit = lineEdits[line.id] ?? { issues: "", solution: "" };
          const setEdit = (next: { issues: string; solution: string }) =>
            setLineEdits((s) => ({ ...s, [line.id]: next }));
          const dirty = edit.issues !== (line.issues ?? "") || edit.solution !== (line.solution ?? "");
          return (
            <Card key={line.id} className="rounded-2xl">
              <CardContent className="pt-5">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-3">
                  <div className="md:col-span-2">
                    <div className="font-bold">{lang === "ar" ? line.labelAr : line.labelEn}</div>
                    <div className="text-xs text-muted-foreground">
                      {t("scWeight")}: <span dir="ltr">{line.weight ? `${(Number(line.weight) * 100).toFixed(0)}%` : "—"}</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground">{t("scRawValue")}</div>
                    <div className="font-bold text-base" dir="ltr">{formatRaw(line.metricKey, line.rawValue)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground">{t("scGridScore")}</div>
                    <div className="font-bold text-base" dir="ltr">{(Number(line.gridScore) * 100).toFixed(0)}%</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground">{t("scWeightedScore")}</div>
                    <div className="font-bold text-base" dir="ltr">{(Number(line.weightedScore) * 100).toFixed(1)}%</div>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">{t("scIssues")}</Label>
                    {canWrite ? (
                      <Textarea
                        rows={3}
                        placeholder={t("scIssuesPlaceholder")}
                        value={edit.issues}
                        onChange={(e) => setEdit({ ...edit, issues: e.target.value })}
                      />
                    ) : (
                      <div className="bg-secondary/30 rounded-md px-3 py-2 text-sm min-h-[60px] whitespace-pre-wrap">{line.issues || "—"}</div>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t("scSolution")}</Label>
                    {canWrite ? (
                      <Textarea
                        rows={3}
                        placeholder={t("scSolutionPlaceholder")}
                        value={edit.solution}
                        onChange={(e) => setEdit({ ...edit, solution: e.target.value })}
                      />
                    ) : (
                      <div className="bg-secondary/30 rounded-md px-3 py-2 text-sm min-h-[60px] whitespace-pre-wrap">{line.solution || "—"}</div>
                    )}
                  </div>
                </div>
                {canWrite && dirty && (
                  <div className="flex justify-end mt-2">
                    <Button size="sm" variant="outline" className="gap-1"
                      onClick={() => saveLine.mutate({ lineId: line.id, issues: edit.issues, solution: edit.solution })}>
                      <Save className="w-3.5 h-3.5" /> {t("save")}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Agent confirmation block */}
      {(canConfirm || card.status === "confirmed") && (
        <Card className="rounded-2xl mt-4">
          <CardContent className="pt-5">
            <Label className="font-semibold">{t("scAgentCommentLabel")}</Label>
            {canConfirm && commentEnabled ? (
              <Textarea
                className="mt-1"
                rows={3}
                placeholder={t("scAgentComment")}
                value={agentComment}
                onChange={(e) => setAgentComment(e.target.value)}
              />
            ) : (
              <div className="bg-secondary/30 rounded-md px-3 py-2 text-sm mt-1 min-h-[60px] whitespace-pre-wrap">{card.agentComment || "—"}</div>
            )}
            {canConfirm && (
              <Button onClick={() => setConfirmOpen(true)} className="mt-3 gap-2">
                <CheckCircle2 className="w-4 h-4" /> {t("scConfirmCard")}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Supervisor send button */}
      {canSend && (
        <div className="flex justify-end mt-4">
          <Button size="lg" onClick={() => setSendOpen(true)} className="gap-2">
            <Send className="w-4 h-4" /> {t("scSendToAgent")}
          </Button>
        </div>
      )}

      <AlertDialog open={sendOpen} onOpenChange={setSendOpen}>
        <AlertDialogContent dir={dir}>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("scSendToAgent")}</AlertDialogTitle>
            <AlertDialogDescription>{t("confirm")}?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => send.mutate(undefined as any)}>{t("confirm")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent dir={dir}>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("scConfirmCard")}</AlertDialogTitle>
            <AlertDialogDescription>{t("confirm")}?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirm.mutate(undefined as any)}>{t("confirm")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}

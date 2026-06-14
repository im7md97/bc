import { useState, useMemo } from "react";
import { Link } from "wouter";
import {
  Plus, Search, ThumbsUp, ThumbsDown, Music, Trash2, Eye, MessageSquare, SendHorizonal,
  CheckCircle2, XCircle, Clock, FileText,
} from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
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
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
} from "recharts";
import { useApi, useApiMutation } from "@/hooks/use-api";
import { apiRequest } from "@/lib/api";
import { useAuth, can } from "@/hooks/use-auth";
import { useLanguage } from "@/contexts/LanguageContext";

interface QcEntry {
  id: number;
  agentId: number;
  agentNameAr: string | null;
  agentNameEn: string | null;
  employeeId: string | null;
  callDate: string;
  contactNumber: string;
  caseNumber: string;
  actionRequired: string;
  qualityInternal: string;
  qualityExternal: string;
  customerSatisfaction: string;
  defectReason: string;
  requiredActionDetail: string;
  status: "pending_supervisor" | "approved" | "rejected";
  audioUrl: string | null;
  supervisorComment: string | null;
  qualityNote: string | null;
  createdByUserId: number;
  createdAt: string;
}

function statusBadge(status: string, t: any) {
  switch (status) {
    case "pending_supervisor":
      return <Badge variant="outline" className="bg-amber-500/10 text-amber-700 border-amber-300 gap-1"><Clock className="w-3 h-3" />{t("statusPending")}</Badge>;
    case "approved":
      return <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 border-emerald-300 gap-1"><CheckCircle2 className="w-3 h-3" />{t("statusApproved")}</Badge>;
    case "rejected":
      return <Badge variant="outline" className="bg-red-500/10 text-red-700 border-red-300 gap-1"><XCircle className="w-3 h-3" />{t("statusRejected")}</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function PassFailBadge({ value }: { value: string }) {
  if (value === "Pass") return <span className="inline-flex items-center gap-1 text-emerald-600 font-semibold text-xs"><CheckCircle2 className="w-3 h-3" />Pass</span>;
  if (value === "Fail") return <span className="inline-flex items-center gap-1 text-red-600 font-semibold text-xs"><XCircle className="w-3 h-3" />Fail</span>;
  return <span className="text-muted-foreground text-xs">—</span>;
}

interface QcStats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  internal: { pass: number; fail: number };
  external: { pass: number; fail: number };
  csat: { pass: number; fail: number };
}

function KpiCard({ label, value, icon: Icon, accent }: {
  label: string; value: number; icon: React.ComponentType<{ className?: string }>; accent: string;
}) {
  return (
    <Card className="rounded-2xl">
      <CardContent className="pt-5 pb-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-semibold">{label}</p>
            <p className="text-2xl font-extrabold mt-0.5" dir="ltr">{value}</p>
          </div>
          <span className={`w-11 h-11 rounded-2xl flex items-center justify-center ${accent}`}>
            <Icon className="w-5 h-5" />
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function PassRateDonut({ title, pass, fail }: { title: string; pass: number; fail: number }) {
  const { t } = useLanguage();
  const total = pass + fail;
  const passRate = total > 0 ? Math.round((pass / total) * 100) : null;
  const data = total === 0
    ? [{ name: "empty", value: 1 }]
    : [{ name: "Pass", value: pass }, { name: "Fail", value: fail }];
  const colors = total === 0 ? ["#e2e8f0"] : ["#22c55e", "#ef4444"];

  return (
    <Card className="rounded-2xl">
      <CardContent className="pt-5 pb-4">
        <p className="text-sm font-semibold text-center mb-2">{title}</p>
        <div className="relative w-full" style={{ height: 150 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} cx="50%" cy="50%" innerRadius={42} outerRadius={62} dataKey="value" strokeWidth={2} stroke="transparent">
                {data.map((_, i) => <Cell key={i} fill={colors[i]} />)}
              </Pie>
              {total > 0 && <Tooltip contentStyle={{ fontFamily: "inherit", borderRadius: "10px" }} />}
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            {passRate !== null ? (
              <>
                <span className="text-2xl font-extrabold" dir="ltr">{passRate}%</span>
                <span className="text-[10px] text-muted-foreground">{t("qcPassRate")}</span>
              </>
            ) : (
              <span className="text-xs text-muted-foreground">{t("qcNoEvaluations")}</span>
            )}
          </div>
        </div>
        <div className="flex items-center justify-center gap-4 mt-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />Pass: <span dir="ltr">{pass}</span></span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />Fail: <span dir="ltr">{fail}</span></span>
        </div>
      </CardContent>
    </Card>
  );
}

export default function QcDashboardPage() {
  const { t, lang, dir } = useLanguage();
  const { data: me } = useAuth();
  const [search, setSearch] = useState("");
  const [reviewEntry, setReviewEntry] = useState<QcEntry | null>(null);
  const [resubmitEntry, setResubmitEntry] = useState<QcEntry | null>(null);
  const [delEntry, setDelEntry] = useState<QcEntry | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [reviewComment, setReviewComment] = useState("");
  const [resubmitNote, setResubmitNote] = useState("");

  const { data: entries, isLoading } = useApi<QcEntry[]>("/api/qc/entries");
  const { data: stats } = useApi<QcStats>("/api/qc/stats");

  const filtered = useMemo(() => {
    if (!entries) return [];
    if (!search) return entries;
    const s = search.toLowerCase();
    return entries.filter((e) =>
      (e.agentNameAr ?? "").toLowerCase().includes(s) ||
      (e.agentNameEn ?? "").toLowerCase().includes(s) ||
      (e.employeeId ?? "").toLowerCase().includes(s) ||
      e.caseNumber.toLowerCase().includes(s) ||
      e.contactNumber.includes(s));
  }, [entries, search]);

  const canCreate = can(me, "qc.evaluate");
  const canApprove = can(me, "qc.approve", "qc.approve_team");
  const isAgentView = can(me, "qc.view_own") && !canCreate && !canApprove;

  const review = useApiMutation(
    ({ id, action }: { id: number; action: "approved" | "rejected" }) =>
      apiRequest("PATCH", `/api/qc/entries/${id}/review`, { action, comment: reviewComment }),
    {
      invalidate: [["/api/qc/entries"]],
      onSuccess: () => { setReviewEntry(null); setReviewComment(""); },
      successMessage: t("saveSuccess"),
    },
  );
  const resubmit = useApiMutation(
    (id: number) => apiRequest("PATCH", `/api/qc/entries/${id}/resubmit`, { qualityNote: resubmitNote }),
    {
      invalidate: [["/api/qc/entries"]],
      onSuccess: () => { setResubmitEntry(null); setResubmitNote(""); },
      successMessage: t("saveSuccess"),
    },
  );
  const remove = useApiMutation(
    (id: number) => apiRequest("DELETE", `/api/qc/entries/${id}`),
    { invalidate: [["/api/qc/entries"]], onSuccess: () => setDelEntry(null), successMessage: t("deleteSuccess") },
  );

  return (
    <PageShell
      title={isAgentView ? t("qcMineTitle") : t("qcTitle")}
      subtitle={isAgentView ? t("qcMineSubtitle") : t("qcSubtitle")}
      actions={canCreate && (
        <Link href="/qc/new-entry">
          <Button className="gap-2"><Plus className="w-4 h-4" /> {t("qcNewEntry")}</Button>
        </Link>
      )}
    >
      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <KpiCard label={t("qcTotal")}    value={stats?.total ?? 0}    icon={FileText}     accent="bg-indigo-500/10 text-indigo-600" />
        <KpiCard label={t("qcPending")}  value={stats?.pending ?? 0}  icon={Clock}        accent="bg-amber-500/10 text-amber-600" />
        <KpiCard label={t("qcApproved")} value={stats?.approved ?? 0} icon={CheckCircle2} accent="bg-emerald-500/10 text-emerald-600" />
        <KpiCard label={t("qcRejected")} value={stats?.rejected ?? 0} icon={XCircle}      accent="bg-red-500/10 text-red-600" />
      </div>

      {/* Donut charts */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <PassRateDonut title={t("qcInternalRate")} pass={stats?.internal.pass ?? 0} fail={stats?.internal.fail ?? 0} />
        <PassRateDonut title={t("qcExternalRate")} pass={stats?.external.pass ?? 0} fail={stats?.external.fail ?? 0} />
        <PassRateDonut title={t("qcCsatRate")}     pass={stats?.csat.pass ?? 0}     fail={stats?.csat.fail ?? 0} />
      </div>

      <div className="flex gap-2 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className={`absolute ${dir === "rtl" ? "right-3" : "left-3"} top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground`} />
          <Input
            placeholder={t("search")}
            className={dir === "rtl" ? "pr-10" : "pl-10"}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="bg-card border border-border/60 rounded-2xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("qcAgentPicker")}</TableHead>
              <TableHead>{t("qcCallDate")}</TableHead>
              <TableHead>{t("qcCaseNumber")}</TableHead>
              <TableHead>{t("qcQualityInternal")}</TableHead>
              <TableHead>{t("qcQualityExternal")}</TableHead>
              <TableHead>{t("qcCsat")}</TableHead>
              <TableHead>{t("qcStatus")}</TableHead>
              <TableHead className={dir === "rtl" ? "text-left" : "text-right"}>{t("actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={8}><Skeleton className="h-12 w-full" /></TableCell></TableRow>}
            {!isLoading && filtered.length === 0 && (
              <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">{t("noData")}</TableCell></TableRow>
            )}
            {filtered.map((e) => (
              <TableRow key={e.id}>
                <TableCell>
                  <div className="font-semibold">{lang === "ar" ? e.agentNameAr : e.agentNameEn}</div>
                  <div className="text-[10px] text-muted-foreground" dir="ltr">{e.employeeId}</div>
                </TableCell>
                <TableCell dir="ltr" className="text-xs">{e.callDate}</TableCell>
                <TableCell dir="ltr" className="text-xs">{e.caseNumber}</TableCell>
                <TableCell><PassFailBadge value={e.qualityInternal} /></TableCell>
                <TableCell><PassFailBadge value={e.qualityExternal} /></TableCell>
                <TableCell><PassFailBadge value={e.customerSatisfaction} /></TableCell>
                <TableCell>{statusBadge(e.status, t)}</TableCell>
                <TableCell className={dir === "rtl" ? "text-left" : "text-right"}>
                  <div className="flex gap-1 justify-end">
                    {e.audioUrl && (
                      <Button variant="ghost" size="sm" onClick={() => setAudioUrl(e.audioUrl!)}>
                        <Music className="w-4 h-4" />
                      </Button>
                    )}
                    {canApprove && e.status === "pending_supervisor" && (
                      <Button variant="ghost" size="sm" onClick={() => { setReviewEntry(e); setReviewComment(""); }} className="gap-1">
                        <Eye className="w-4 h-4" /> {t("qcReviewTitle")}
                      </Button>
                    )}
                    {canCreate && e.status === "rejected" && e.createdByUserId === me?.id && (
                      <Button variant="ghost" size="sm" className="text-amber-600 gap-1"
                        onClick={() => { setResubmitEntry(e); setResubmitNote(""); }}>
                        <SendHorizonal className="w-4 h-4" /> {t("qcResubmit")}
                      </Button>
                    )}
                    {(can(me, "qc.approve") || (canCreate && e.createdByUserId === me?.id)) && (
                      <Button variant="ghost" size="sm" className="text-red-600" onClick={() => setDelEntry(e)}>
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

      {/* Review dialog */}
      <Dialog open={!!reviewEntry} onOpenChange={(o) => !o && setReviewEntry(null)}>
        <DialogContent dir={dir} className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("qcReviewTitle")}</DialogTitle>
            <DialogDescription>
              {reviewEntry && (lang === "ar" ? reviewEntry.agentNameAr : reviewEntry.agentNameEn)} — {reviewEntry?.caseNumber}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <div><span className="text-muted-foreground">{t("qcCallDate")}: </span><span dir="ltr">{reviewEntry?.callDate}</span></div>
              <div><span className="text-muted-foreground">{t("qcContactNumber")}: </span><span dir="ltr">{reviewEntry?.contactNumber}</span></div>
              <div><span className="text-muted-foreground">{t("qcQualityInternal")}: </span><PassFailBadge value={reviewEntry?.qualityInternal ?? ""} /></div>
              <div><span className="text-muted-foreground">{t("qcQualityExternal")}: </span><PassFailBadge value={reviewEntry?.qualityExternal ?? ""} /></div>
              <div><span className="text-muted-foreground">{t("qcCsat")}: </span><PassFailBadge value={reviewEntry?.customerSatisfaction ?? ""} /></div>
            </div>
            <div>
              <span className="text-muted-foreground">{t("qcActionRequired")}: </span>
              <p className="bg-secondary/30 rounded px-3 py-2 mt-1">{reviewEntry?.actionRequired}</p>
            </div>
            <div>
              <span className="text-muted-foreground">{t("qcDefectReason")}: </span>
              <p className="bg-secondary/30 rounded px-3 py-2 mt-1">{reviewEntry?.defectReason}</p>
            </div>
            <div>
              <span className="text-muted-foreground">{t("qcRequiredActionDetail")}: </span>
              <p className="bg-secondary/30 rounded px-3 py-2 mt-1">{reviewEntry?.requiredActionDetail}</p>
            </div>
            {reviewEntry?.qualityNote && (
              <div className="bg-amber-500/10 rounded px-3 py-2 text-xs">
                <MessageSquare className="w-3 h-3 inline me-1" />
                <strong>{t("qcQualityNote")}:</strong> {reviewEntry.qualityNote}
              </div>
            )}
            <div>
              <label className="text-xs font-semibold">{t("qcSupervisorComment")} {t("qcRejectCommentRequired")}</label>
              <Textarea rows={3} value={reviewComment} onChange={(e) => setReviewComment(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewEntry(null)}>{t("cancel")}</Button>
            <Button
              variant="destructive"
              className="gap-1"
              disabled={!reviewComment.trim() || review.isPending}
              onClick={() => reviewEntry && review.mutate({ id: reviewEntry.id, action: "rejected" })}
            >
              <ThumbsDown className="w-4 h-4" /> {t("qcReject")}
            </Button>
            <Button
              className="gap-1"
              disabled={review.isPending}
              onClick={() => reviewEntry && review.mutate({ id: reviewEntry.id, action: "approved" })}
            >
              <ThumbsUp className="w-4 h-4" /> {t("qcApprove")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Resubmit dialog */}
      <Dialog open={!!resubmitEntry} onOpenChange={(o) => !o && setResubmitEntry(null)}>
        <DialogContent dir={dir} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("qcResubmit")}</DialogTitle>
            <DialogDescription>{resubmitEntry?.supervisorComment}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-xs font-semibold">{t("qcResubmitNote")}</label>
            <Textarea rows={3} value={resubmitNote} onChange={(e) => setResubmitNote(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResubmitEntry(null)}>{t("cancel")}</Button>
            <Button disabled={!resubmitNote.trim() || resubmit.isPending}
              onClick={() => resubmitEntry && resubmit.mutate(resubmitEntry.id)}>
              {t("qcResubmit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!delEntry} onOpenChange={(o) => !o && setDelEntry(null)}>
        <AlertDialogContent dir={dir}>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("qcDeleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("qcDeleteDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => delEntry && remove.mutate(delEntry.id)}>{t("delete")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!audioUrl} onOpenChange={(o) => !o && setAudioUrl(null)}>
        <DialogContent dir={dir} className="sm:max-w-md">
          <DialogHeader><DialogTitle className="gap-2 flex items-center"><Music className="w-5 h-5" /> {t("qcAudioTitle")}</DialogTitle></DialogHeader>
          {audioUrl && <audio src={audioUrl} controls className="w-full mt-2" autoPlay />}
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

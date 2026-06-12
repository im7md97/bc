import { useState, useMemo } from "react";
import {
  Trash2, Search, FileText, Activity, AlertCircle, Plus, Music,
  BarChart3, Users, CheckCircle2, XCircle, Clock, MessageSquare,
  ThumbsUp, ThumbsDown, Eye, ShieldCheck, SendHorizonal,
  TrendingUp, Calendar, FolderOpen, Star,
} from "lucide-react";
import { Navbar } from "@/components/layout/Navbar";
import { DeleteAlertModal } from "@/components/entries/EntryFormModal";
import { useEntries, useReviewEntry, useResubmitEntry } from "@/hooks/use-entries";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
  LineChart, Line,
} from "recharts";
import type { EntryResponse } from "@shared/routes";
import { useLocation } from "wouter";
import { useLanguage } from "@/contexts/LanguageContext";

const PASS_COLOR = "#22c55e";
const FAIL_COLOR = "#ef4444";
const NA_COLOR = "#cbd5e1";
const PRIMARY_COLOR = "#6366f1";

function WorkflowBadge({ status }: { status: string }) {
  const { t } = useLanguage();
  switch (status) {
    case "pending_supervisor":
      return <Badge variant="outline" className="bg-amber-500/10 text-amber-700 border-amber-300 gap-1 text-xs"><Clock className="w-3 h-3" />{t("statusPending")}</Badge>;
    case "approved":
      return <Badge variant="outline" className="bg-green-500/10 text-green-700 border-green-300 gap-1 text-xs"><CheckCircle2 className="w-3 h-3" />{t("statusApproved")}</Badge>;
    case "rejected":
      return <Badge variant="outline" className="bg-red-500/10 text-red-700 border-red-300 gap-1 text-xs"><XCircle className="w-3 h-3" />{t("statusRejected")}</Badge>;
    default:
      return <Badge variant="outline" className="text-xs">{status}</Badge>;
  }
}

function PassFailBadge({ value }: { value: string }) {
  if (value === "Pass") return <span className="inline-flex items-center gap-1 text-green-600 font-semibold text-xs"><CheckCircle2 className="w-3 h-3" />Pass</span>;
  if (value === "Fail") return <span className="inline-flex items-center gap-1 text-red-600 font-semibold text-xs"><XCircle className="w-3 h-3" />Fail</span>;
  return <span className="text-muted-foreground text-xs">—</span>;
}

const RADIAN = Math.PI / 180;
function CustomLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) {
  if (percent < 0.05) return null;
  const r = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + r * Math.cos(-midAngle * RADIAN);
  const y = cy + r * Math.sin(-midAngle * RADIAN);
  return <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={700}>{`${(percent * 100).toFixed(0)}%`}</text>;
}

function DonutChart({ title, pass, fail }: { title: string; pass: number; fail: number }) {
  const { t } = useLanguage();
  const total = pass + fail;
  const data = total === 0 ? [{ name: t("dashNoData"), value: 1 }] : [{ name: "Pass", value: pass }, { name: "Fail", value: fail }];
  const colors = total === 0 ? [NA_COLOR] : [PASS_COLOR, FAIL_COLOR];
  const passRate = total > 0 ? Math.round((pass / total) * 100) : null;
  return (
    <div className="bg-card border border-border/60 rounded-2xl p-5 flex flex-col items-center shadow-sm">
      <p className="text-sm font-semibold text-foreground mb-1 text-center">{title}</p>
      <div className="relative w-full" style={{ height: 150 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" innerRadius={40} outerRadius={62} dataKey="value" labelLine={false} label={total > 0 ? CustomLabel : undefined} strokeWidth={2} stroke="transparent">
              {data.map((_, i) => <Cell key={i} fill={colors[i]} />)}
            </Pie>
            <Tooltip formatter={(v: number, n: string) => [v, n]} contentStyle={{ fontFamily: "inherit", borderRadius: "10px" }} />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          {passRate !== null
            ? <><span className="text-xl font-extrabold text-foreground">{passRate}%</span><span className="text-[10px] text-muted-foreground">Pass</span></>
            : <span className="text-xs text-muted-foreground">{t("dashNoData")}</span>}
        </div>
      </div>
      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />Pass: {pass}</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />Fail: {fail}</span>
      </div>
    </div>
  );
}

function AudioPlayerDialog({ url, open, onClose }: { url: string; open: boolean; onClose: () => void }) {
  const { t, dir } = useLanguage();
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir={dir} className="sm:max-w-[440px]">
        <DialogHeader className={dir === "rtl" ? "text-right" : "text-left"}>
          <DialogTitle className="flex items-center gap-2"><Music className="w-5 h-5 text-primary" />{t("audioTitle")}</DialogTitle>
        </DialogHeader>
        <div className="mt-2 bg-secondary/30 rounded-2xl p-4">
          <audio src={url} controls className="w-full" autoPlay />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ReviewDialog({ entry, open, onClose }: { entry: EntryResponse | null; open: boolean; onClose: () => void }) {
  const [comment, setComment] = useState("");
  const reviewMutation = useReviewEntry();
  const { t, dir } = useLanguage();

  const handle = async (action: "approved" | "rejected") => {
    if (!entry) return;
    await reviewMutation.mutateAsync({ id: entry.id, action, comment });
    setComment("");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setComment(""); onClose(); } }}>
      <DialogContent dir={dir} className="sm:max-w-[520px]">
        <DialogHeader className={dir === "rtl" ? "text-right" : "text-left"}>
          <DialogTitle className="text-lg font-bold flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" />{t("reviewTitle")}
          </DialogTitle>
          <DialogDescription>{t("reviewRecord")}: {entry?.employeeName} — {entry?.caseNumber}</DialogDescription>
        </DialogHeader>
        {entry && (
          <div className="space-y-4 my-2">
            <div className="bg-secondary/20 rounded-xl p-4 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">{t("reviewContactNumber")}</span><span className="font-medium">{entry.contactNumber}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t("reviewCallDate")}</span><span className="font-medium">{entry.callDate}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t("reviewCompliance")}</span><PassFailBadge value={entry.qualityInternal} /></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t("reviewBusiness")}</span><PassFailBadge value={entry.qualityExternal} /></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t("reviewCSAT")}</span><PassFailBadge value={entry.customerSatisfaction} /></div>
              {entry.defectReason && <div className="pt-2 border-t border-border/40"><p className="text-muted-foreground text-xs mb-1">{t("reviewDefect")}</p><p className="text-foreground">{entry.defectReason}</p></div>}
            </div>
            {entry.qualityNote && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-start gap-2">
                <MessageSquare className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <div><p className="text-xs font-semibold text-blue-700 mb-0.5">{t("reviewQualityNote")}</p><p className="text-sm text-blue-800">{entry.qualityNote}</p></div>
              </div>
            )}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground">{t("reviewCommentLabel")}</label>
              <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t("reviewCommentPlaceholder")} className="bg-secondary/30 border-secondary resize-none h-24" data-testid="input-review-comment" />
            </div>
            <div className="flex gap-3 pt-2">
              <Button onClick={() => handle("approved")} disabled={reviewMutation.isPending} className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold h-11" data-testid="button-approve-entry">
                <ThumbsUp className="w-4 h-4 ml-2" />{t("reviewApprove")}
              </Button>
              <Button onClick={() => handle("rejected")} disabled={reviewMutation.isPending || !comment.trim()} variant="outline" className="flex-1 border-red-300 text-red-600 hover:bg-red-50 font-bold h-11" data-testid="button-reject-entry">
                <ThumbsDown className="w-4 h-4 ml-2" />{t("reviewReject")}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ResubmitDialog({ entry, open, onClose }: { entry: EntryResponse | null; open: boolean; onClose: () => void }) {
  const [note, setNote] = useState("");
  const resubmitMutation = useResubmitEntry();
  const { t, dir } = useLanguage();

  const handle = async () => {
    if (!entry || !note.trim()) return;
    await resubmitMutation.mutateAsync({ id: entry.id, qualityNote: note.trim() });
    setNote("");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setNote(""); onClose(); } }}>
      <DialogContent dir={dir} className="sm:max-w-[480px]">
        <DialogHeader className={dir === "rtl" ? "text-right" : "text-left"}>
          <DialogTitle className="text-lg font-bold flex items-center gap-2">
            <SendHorizonal className="w-5 h-5 text-primary" />{t("resubmitTitle")}
          </DialogTitle>
          <DialogDescription>{t("reviewRecord")}: {entry?.employeeName} — {entry?.caseNumber}</DialogDescription>
        </DialogHeader>
        {entry && (
          <div className="space-y-4 my-2">
            {entry.supervisorComment && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2">
                <MessageSquare className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                <div><p className="text-xs font-semibold text-red-700 mb-0.5">{t("resubmitSupervisorComment")}</p><p className="text-sm text-red-800">{entry.supervisorComment}</p></div>
              </div>
            )}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground">{t("resubmitNoteLabel")} <span className="text-red-500">*</span></label>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("resubmitNotePlaceholder")} className="bg-secondary/30 border-secondary resize-none h-28" data-testid="input-resubmit-note" />
              <p className="text-xs text-muted-foreground">{t("resubmitNoteHint")}</p>
            </div>
            <div className="flex gap-3 pt-2">
              <Button onClick={handle} disabled={resubmitMutation.isPending || !note.trim()} className="flex-1 bg-primary text-white font-bold h-11" data-testid="button-resubmit-entry">
                <SendHorizonal className="w-4 h-4 ml-2" />{t("resubmitButton")}
              </Button>
              <Button variant="outline" onClick={() => { setNote(""); onClose(); }} className="px-6 h-11">{t("cancel")}</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Analytics Section ────────────────────────────────────────────────────────
function AnalyticsSection({ entries, role, t, dir }: { entries: EntryResponse[]; role: string; t: any; dir: string }) {
  const isAdmin = role === "admin" || role === "manager";
  const isSupervisor = role === "supervisor";

  const stats = useMemo(() => {
    const count = (arr: EntryResponse[], field: keyof EntryResponse, val: string) =>
      arr.filter(e => e[field] === val).length;
    return {
      total: entries.length,
      internalPass: count(entries, "qualityInternal", "Pass"),
      internalFail: count(entries, "qualityInternal", "Fail"),
      externalPass: count(entries, "qualityExternal", "Pass"),
      externalFail: count(entries, "qualityExternal", "Fail"),
      csatPass: count(entries, "customerSatisfaction", "Pass"),
      csatFail: count(entries, "customerSatisfaction", "Fail"),
      approved: count(entries, "status", "approved"),
      rejected: count(entries, "status", "rejected"),
      pending: count(entries, "status", "pending_supervisor"),
    };
  }, [entries]);

  // Bar chart: agent performance
  const agentPerf = useMemo(() => {
    const map: Record<string, { name: string; pass: number; fail: number; total: number }> = {};
    entries.forEach(e => {
      if (!e.employeeName) return;
      if (!map[e.employeeName]) map[e.employeeName] = { name: e.employeeName, pass: 0, fail: 0, total: 0 };
      map[e.employeeName].total++;
      if (e.qualityInternal === "Pass") map[e.employeeName].pass++;
      else map[e.employeeName].fail++;
    });
    return Object.values(map).sort((a, b) => b.total - a.total).slice(0, 8);
  }, [entries]);

  // Line chart: trend by date
  const trendData = useMemo(() => {
    const map: Record<string, { date: string; total: number; approved: number }> = {};
    entries.forEach(e => {
      const d = e.callDate?.slice(0, 7) || "unknown";
      if (!map[d]) map[d] = { date: d, total: 0, approved: 0 };
      map[d].total++;
      if (e.status === "approved") map[d].approved++;
    });
    return Object.values(map).sort((a, b) => a.date.localeCompare(b.date)).slice(-6);
  }, [entries]);

  if (entries.length === 0) return null;

  return (
    <div className="space-y-6">
      {/* Donut Charts Row */}
      <div>
        <h3 className="text-lg font-bold text-foreground mb-3 flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-primary" />{t("dashChartsTitle")}
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <DonutChart title={t("dashComplianceTitle")} pass={stats.internalPass} fail={stats.internalFail} />
          <DonutChart title={t("dashBusinessTitle")} pass={stats.externalPass} fail={stats.externalFail} />
          <DonutChart title={t("dashCSATTitle")} pass={stats.csatPass} fail={stats.csatFail} />
        </div>
      </div>

      {/* Bar Chart: Agent Performance */}
      {(isAdmin || isSupervisor) && agentPerf.length > 0 && (
        <div className="bg-card border border-border/60 rounded-2xl p-5 shadow-sm">
          <h3 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />{t("dashPerformanceTitle")}
          </h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={agentPerf} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} tickLine={false} />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ fontFamily: "inherit", borderRadius: "10px", border: "1px solid #e2e8f0" }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="pass" name="Pass" fill={PASS_COLOR} radius={[4, 4, 0, 0]} />
              <Bar dataKey="fail" name="Fail" fill={FAIL_COLOR} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Line Chart: Trend */}
      {(isAdmin || isSupervisor) && trendData.length > 1 && (
        <div className="bg-card border border-border/60 rounded-2xl p-5 shadow-sm">
          <h3 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />{t("dashTrendTitle")}
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={trendData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ fontFamily: "inherit", borderRadius: "10px", border: "1px solid #e2e8f0" }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="total" name="Total" stroke={PRIMARY_COLOR} strokeWidth={2} dot={{ fill: PRIMARY_COLOR, r: 4 }} />
              <Line type="monotone" dataKey="approved" name="Approved" stroke={PASS_COLOR} strokeWidth={2} dot={{ fill: PASS_COLOR, r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ─── Agent Personal Dashboard ─────────────────────────────────────────────────
function AgentDashboard({ entries, user, t, dir }: { entries: EntryResponse[]; user: any; t: any; dir: string }) {
  const myEntries = entries.filter(e => e.status === "approved");
  const total = myEntries.length;
  const intPass = myEntries.filter(e => e.qualityInternal === "Pass").length;
  const extPass = myEntries.filter(e => e.qualityExternal === "Pass").length;
  const csatPass = myEntries.filter(e => e.customerSatisfaction === "Pass").length;
  const overallScore = total > 0 ? Math.round(((intPass + extPass + csatPass) / (total * 3)) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Personal Score */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-primary to-blue-600 text-white rounded-2xl p-5 shadow-lg shadow-primary/25 col-span-2 sm:col-span-1">
          <div className="flex items-center gap-2 mb-2">
            <Star className="w-5 h-5 opacity-80" />
            <p className="text-sm font-medium opacity-80">{t("dashMyScore")}</p>
          </div>
          <p className="text-4xl font-extrabold">{overallScore}%</p>
        </div>
        <div className="bg-card border border-border/60 rounded-2xl p-4 shadow-sm">
          <p className="text-xs text-muted-foreground mb-1">{t("dashTotalEntries")}</p>
          <p className="text-2xl font-extrabold">{total}</p>
        </div>
        <div className="bg-card border border-border/60 rounded-2xl p-4 shadow-sm">
          <p className="text-xs text-muted-foreground mb-1">{t("dashComplianceTitle")}</p>
          <p className="text-2xl font-extrabold text-green-600">{total > 0 ? Math.round((intPass / total) * 100) : 0}%</p>
        </div>
        <div className="bg-card border border-border/60 rounded-2xl p-4 shadow-sm">
          <p className="text-xs text-muted-foreground mb-1">{t("dashCSATTitle")}</p>
          <p className="text-2xl font-extrabold text-blue-600">{total > 0 ? Math.round((csatPass / total) * 100) : 0}%</p>
        </div>
      </div>

      {/* Charts */}
      {total > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <DonutChart title={t("dashComplianceTitle")} pass={intPass} fail={total - intPass} />
          <DonutChart title={t("dashBusinessTitle")} pass={extPass} fail={total - extPass} />
          <DonutChart title={t("dashCSATTitle")} pass={csatPass} fail={total - csatPass} />
        </div>
      )}
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { data: user } = useAuth();
  const { data: entries, isLoading, isError } = useEntries();
  const { t, dir } = useLanguage();

  const [searchQuery, setSearchQuery] = useState("");
  const [filterEmployee, setFilterEmployee] = useState("all");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<EntryResponse | null>(null);
  const [audioEntry, setAudioEntry] = useState<EntryResponse | null>(null);
  const [reviewEntry, setReviewEntry] = useState<EntryResponse | null>(null);
  const [resubmitEntry, setResubmitEntry] = useState<EntryResponse | null>(null);

  const role = user?.role || "";
  const isQuality = role === "quality";
  const isSupervisor = role === "supervisor";
  const isAgent = role === "agent";
  const isAdminOrManager = role === "admin" || role === "manager";

  const employeeNames = useMemo(() => {
    if (!entries) return [];
    return Array.from(new Set(entries.map(e => e.employeeName).filter(Boolean))).sort();
  }, [entries]);

  const filteredEntries = useMemo(() => {
    if (!entries) return [];
    return entries.filter(entry => {
      const matchSearch = entry.employeeName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        entry.caseNumber.toLowerCase().includes(searchQuery.toLowerCase());
      const matchEmployee = filterEmployee === "all" || entry.employeeName === filterEmployee;
      const matchFrom = !filterDateFrom || entry.callDate >= filterDateFrom;
      const matchTo = !filterDateTo || entry.callDate <= filterDateTo;
      return matchSearch && matchEmployee && matchFrom && matchTo;
    });
  }, [entries, searchQuery, filterEmployee, filterDateFrom, filterDateTo]);

  const stats = useMemo(() => {
    const count = (arr: EntryResponse[], field: keyof EntryResponse, val: string) =>
      arr.filter(e => e[field] === val).length;
    return {
      total: filteredEntries.length,
      internalPass: count(filteredEntries, "qualityInternal", "Pass"),
      internalFail: count(filteredEntries, "qualityInternal", "Fail"),
      externalPass: count(filteredEntries, "qualityExternal", "Pass"),
      externalFail: count(filteredEntries, "qualityExternal", "Fail"),
      csatPass: count(filteredEntries, "customerSatisfaction", "Pass"),
      csatFail: count(filteredEntries, "customerSatisfaction", "Fail"),
      approved: count(filteredEntries, "status", "approved"),
      rejected: count(filteredEntries, "status", "rejected"),
      pending: count(filteredEntries, "status", "pending_supervisor"),
    };
  }, [filteredEntries]);

  const employeeTable = useMemo(() => {
    const map: Record<string, { name: string; total: number; intPass: number; extPass: number; csatPass: number }> = {};
    filteredEntries.forEach(e => {
      if (!e.employeeName) return;
      if (!map[e.employeeName]) map[e.employeeName] = { name: e.employeeName, total: 0, intPass: 0, extPass: 0, csatPass: 0 };
      const r = map[e.employeeName];
      r.total++;
      if (e.qualityInternal === "Pass") r.intPass++;
      if (e.qualityExternal === "Pass") r.extPass++;
      if (e.customerSatisfaction === "Pass") r.csatPass++;
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [filteredEntries]);

  const pct = (n: number, total: number) => total > 0 ? `${Math.round((n / total) * 100)}%` : "—";
  const clearFilters = () => { setSearchQuery(""); setFilterEmployee("all"); setFilterDateFrom(""); setFilterDateTo(""); };
  const hasFilters = searchQuery || filterEmployee !== "all" || filterDateFrom || filterDateTo;

  const pageTitle = () => {
    if (isQuality) return t("dashEntriesTitleQuality");
    if (isSupervisor) return t("dashEntriesTitleSupervisor");
    if (isAgent) return t("dashEntriesTitleAgent");
    if (isAdminOrManager) return t("dashTitle");
    return t("dashTitle");
  };

  const pageDesc = () => {
    if (isQuality) return t("dashSubtitleQuality");
    if (isSupervisor) return t("dashSubtitleSupervisor");
    if (isAgent) return t("dashSubtitleAgent");
    if (role === "admin") return t("dashSubtitleAdmin");
    if (role === "manager") return t("dashSubtitleManager");
    return "";
  };

  const searchIcon = dir === "rtl"
    ? "absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4"
    : "absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4";

  const searchPadding = dir === "rtl" ? "pr-9" : "pl-9";

  return (
    <div className="min-h-screen bg-background flex flex-col font-sans" dir={dir}>
      <Navbar />

      <main className="flex-1 container mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-3xl font-extrabold text-foreground tracking-tight">{pageTitle()}</h2>
            <p className="text-muted-foreground mt-1">{pageDesc()}</p>
          </div>
          {isQuality && (
            <Button
              onClick={() => setLocation("/create")}
              className="bg-gradient-to-r from-primary to-blue-600 text-white shadow-lg shadow-primary/25 rounded-xl px-6 h-12 text-base font-bold w-full sm:w-auto"
              data-testid="button-create-entry"
            >
              <Plus className="w-5 h-5 ml-2" />{t("dashAddEntry")}
            </Button>
          )}
        </div>

        {/* Agent personal dashboard */}
        {isAgent && !isLoading && !isError && entries && (
          <AgentDashboard entries={entries} user={user} t={t} dir={dir} />
        )}

        {/* Summary Cards for non-agent */}
        {!isAgent && !isLoading && !isError && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-card border border-border/60 rounded-2xl p-4 flex items-center gap-3 shadow-sm">
              <div className="bg-primary/10 p-2.5 rounded-xl"><FileText className="w-5 h-5 text-primary" /></div>
              <div><p className="text-xs text-muted-foreground">{t("dashTotalEntries")}</p><p className="text-2xl font-extrabold">{stats.total}</p></div>
            </div>
            <div className="bg-card border border-border/60 rounded-2xl p-4 flex items-center gap-3 shadow-sm">
              <div className="bg-amber-500/10 p-2.5 rounded-xl"><Clock className="w-5 h-5 text-amber-600" /></div>
              <div><p className="text-xs text-muted-foreground">{t("dashPending")}</p><p className="text-2xl font-extrabold">{stats.pending}</p></div>
            </div>
            <div className="bg-card border border-border/60 rounded-2xl p-4 flex items-center gap-3 shadow-sm">
              <div className="bg-green-500/10 p-2.5 rounded-xl"><CheckCircle2 className="w-5 h-5 text-green-600" /></div>
              <div><p className="text-xs text-muted-foreground">{t("dashApproved")}</p><p className="text-2xl font-extrabold">{stats.approved}</p></div>
            </div>
            <div className="bg-card border border-border/60 rounded-2xl p-4 flex items-center gap-3 shadow-sm">
              <div className="bg-red-500/10 p-2.5 rounded-xl"><XCircle className="w-5 h-5 text-red-600" /></div>
              <div><p className="text-xs text-muted-foreground">{t("dashRejected")}</p><p className="text-2xl font-extrabold">{stats.rejected}</p></div>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-48 rounded-2xl" />)}
          </div>
        ) : isError ? (
          <div className="p-12 text-center flex flex-col items-center bg-card rounded-2xl border border-border/60">
            <AlertCircle className="w-12 h-12 text-destructive mb-4" />
            <h3 className="text-xl font-bold">{t("error")}</h3>
          </div>
        ) : (
          <>
            {/* Analytics */}
            {!isAgent && filteredEntries.length > 0 && (
              <AnalyticsSection entries={filteredEntries} role={role} t={t} dir={dir} />
            )}

            {/* Employee Performance Table for admin/manager/supervisor */}
            {(isAdminOrManager || isSupervisor) && employeeTable.length > 0 && (
              <div className="bg-card border border-border/60 rounded-2xl shadow-sm overflow-hidden">
                <div className="p-4 border-b border-border/40">
                  <h3 className="font-bold text-foreground flex items-center gap-2">
                    <Users className="w-4 h-4 text-primary" />{t("dashEmployeeTable")}
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-secondary/30">
                      <TableRow className="hover:bg-transparent">
                        <TableHead className={`${dir === "rtl" ? "text-right" : "text-left"} font-bold py-3`}>{t("dashEmployee")}</TableHead>
                        <TableHead className={`${dir === "rtl" ? "text-right" : "text-left"} font-bold py-3`}>{t("dashTotal")}</TableHead>
                        <TableHead className={`${dir === "rtl" ? "text-right" : "text-left"} font-bold py-3 hidden sm:table-cell`}>{t("dashCompliance")}</TableHead>
                        <TableHead className={`${dir === "rtl" ? "text-right" : "text-left"} font-bold py-3 hidden sm:table-cell`}>{t("dashBusiness")}</TableHead>
                        <TableHead className={`${dir === "rtl" ? "text-right" : "text-left"} font-bold py-3 hidden md:table-cell`}>{t("dashCSAT")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {employeeTable.map(emp => (
                        <TableRow key={emp.name} className="hover:bg-secondary/20">
                          <TableCell className="py-3 font-semibold">{emp.name}</TableCell>
                          <TableCell className="py-3">{emp.total}</TableCell>
                          <TableCell className="py-3 hidden sm:table-cell">
                            <span className={`font-semibold ${emp.intPass / emp.total >= 0.7 ? "text-green-600" : "text-red-600"}`}>{pct(emp.intPass, emp.total)}</span>
                          </TableCell>
                          <TableCell className="py-3 hidden sm:table-cell">
                            <span className={`font-semibold ${emp.extPass / emp.total >= 0.7 ? "text-green-600" : "text-red-600"}`}>{pct(emp.extPass, emp.total)}</span>
                          </TableCell>
                          <TableCell className="py-3 hidden md:table-cell">
                            <span className={`font-semibold ${emp.csatPass / emp.total >= 0.7 ? "text-green-600" : "text-red-600"}`}>{pct(emp.csatPass, emp.total)}</span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {/* Filters */}
            <div className="bg-card border border-border/60 rounded-2xl p-4 shadow-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
                <div className="relative">
                  <Search className={searchIcon} />
                  <Input placeholder={t("dashSearchPlaceholder")} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                    className={`${searchPadding} rounded-xl bg-secondary/40 border-transparent h-10`} data-testid="input-search" />
                </div>
                <Select value={filterEmployee} onValueChange={setFilterEmployee}>
                  <SelectTrigger className="h-10 rounded-xl bg-secondary/40 border-transparent" data-testid="select-employee-filter">
                    <SelectValue placeholder={t("dashFilterEmployee")} />
                  </SelectTrigger>
                  <SelectContent dir={dir}>
                    <SelectItem value="all">{t("dashFilterEmployee")}</SelectItem>
                    {employeeNames.map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                  </SelectContent>
                </Select>
                <div>
                  <p className="text-xs text-muted-foreground mb-1 font-medium">{t("dashFilterFrom")}</p>
                  <Input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} className="h-10 rounded-xl bg-secondary/40 border-transparent" />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs text-muted-foreground font-medium">{t("dashFilterTo")}</p>
                    {hasFilters && <button onClick={clearFilters} className="text-xs text-primary hover:underline">{t("delete")}</button>}
                  </div>
                  <Input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} className="h-10 rounded-xl bg-secondary/40 border-transparent" />
                </div>
              </div>
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/40">
                <Activity className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">{filteredEntries.length} {t("dashTotalEntries")}</span>
              </div>
            </div>

            {/* Entries Table */}
            <div className="bg-card border border-border/60 rounded-2xl shadow-sm overflow-hidden">
              {filteredEntries.length === 0 ? (
                <div className="p-12 text-center flex flex-col items-center">
                  <FileText className="w-12 h-12 text-muted-foreground/40 mb-4" />
                  <h3 className="text-lg font-semibold text-muted-foreground">{t("dashNoEntries")}</h3>
                  {isQuality && (
                    <Button onClick={() => setLocation("/create")} variant="outline" className="mt-4 rounded-xl border-primary/20 text-primary">
                      <Plus className="w-4 h-4 mr-2" />{t("dashAddFirst")}
                    </Button>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-secondary/50">
                      <TableRow className="hover:bg-transparent">
                        <TableHead className={`${dir === "rtl" ? "text-right" : "text-left"} font-bold text-foreground py-4`}>{t("dashColEmployee")}</TableHead>
                        <TableHead className={`${dir === "rtl" ? "text-right" : "text-left"} font-bold text-foreground py-4 hidden sm:table-cell`}>{t("dashColCase")}</TableHead>
                        <TableHead className={`${dir === "rtl" ? "text-right" : "text-left"} font-bold text-foreground py-4 hidden md:table-cell`}>{t("dashColDate")}</TableHead>
                        <TableHead className={`${dir === "rtl" ? "text-right" : "text-left"} font-bold text-foreground py-4 hidden lg:table-cell`}>{t("dashColCompliance")}</TableHead>
                        <TableHead className={`${dir === "rtl" ? "text-right" : "text-left"} font-bold text-foreground py-4 hidden lg:table-cell`}>{t("dashColBusiness")}</TableHead>
                        <TableHead className={`${dir === "rtl" ? "text-right" : "text-left"} font-bold text-foreground py-4 hidden xl:table-cell`}>{t("dashColCSAT")}</TableHead>
                        <TableHead className={`${dir === "rtl" ? "text-right" : "text-left"} font-bold text-foreground py-4`}>{t("dashColStatus")}</TableHead>
                        <TableHead className={`${dir === "rtl" ? "text-left" : "text-right"} font-bold text-foreground py-4`}>{t("actions")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredEntries.map(entry => (
                        <TableRow key={entry.id} className="group hover:bg-secondary/20">
                          <TableCell className="py-3.5 font-semibold">{entry.employeeName}</TableCell>
                          <TableCell className="py-3.5 text-muted-foreground font-mono text-sm hidden sm:table-cell">{entry.caseNumber}</TableCell>
                          <TableCell className="py-3.5 text-muted-foreground text-sm hidden md:table-cell">{entry.callDate}</TableCell>
                          <TableCell className="py-3.5 hidden lg:table-cell"><PassFailBadge value={entry.qualityInternal} /></TableCell>
                          <TableCell className="py-3.5 hidden lg:table-cell"><PassFailBadge value={entry.qualityExternal} /></TableCell>
                          <TableCell className="py-3.5 hidden xl:table-cell"><PassFailBadge value={entry.customerSatisfaction} /></TableCell>
                          <TableCell className="py-3.5"><WorkflowBadge status={entry.status} /></TableCell>
                          <TableCell className={`py-3.5 ${dir === "rtl" ? "text-left" : "text-right"}`}>
                            <div className="flex justify-end gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                              {entry.audioUrl && (
                                <Button variant="ghost" size="icon" onClick={() => setAudioEntry(entry)} className="h-8 w-8 text-primary hover:bg-primary/10 bg-primary/5 sm:bg-transparent">
                                  <Music className="w-3.5 h-3.5" />
                                </Button>
                              )}
                              {isSupervisor && entry.status === "pending_supervisor" && (
                                <Button variant="ghost" size="icon" onClick={() => setReviewEntry(entry)} className="h-8 w-8 text-purple-600 hover:bg-purple-50 bg-purple-50/50 sm:bg-transparent" data-testid={`button-review-${entry.id}`}>
                                  <Eye className="w-3.5 h-3.5" />
                                </Button>
                              )}
                              {isQuality && entry.status === "rejected" && (
                                <Button variant="ghost" size="icon" onClick={() => setResubmitEntry(entry)} className="h-8 w-8 text-blue-600 hover:bg-blue-50 bg-blue-50/50 sm:bg-transparent" data-testid={`button-resubmit-${entry.id}`}>
                                  <SendHorizonal className="w-3.5 h-3.5" />
                                </Button>
                              )}
                              {(isQuality || isAdminOrManager) && (
                                <Button variant="ghost" size="icon" onClick={() => { setSelectedEntry(entry); setIsDeleteOpen(true); }} className="h-8 w-8 text-red-600 hover:bg-red-50 bg-red-50/50 sm:bg-transparent" data-testid={`button-delete-${entry.id}`}>
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </>
        )}
      </main>

      <DeleteAlertModal
        isOpen={isDeleteOpen}
        onClose={() => { setIsDeleteOpen(false); setSelectedEntry(null); }}
        entryId={selectedEntry?.id ?? null}
      />
      {audioEntry && (
        <AudioPlayerDialog url={audioEntry.audioUrl!} open={!!audioEntry} onClose={() => setAudioEntry(null)} />
      )}
      <ReviewDialog entry={reviewEntry} open={!!reviewEntry} onClose={() => setReviewEntry(null)} />
      <ResubmitDialog entry={resubmitEntry} open={!!resubmitEntry} onClose={() => setResubmitEntry(null)} />
    </div>
  );
}

// Coaching Sessions page. One entry point for everyone:
//   • Supervisors see a dashboard + "New session" button + list they authored
//   • Agents see their sessions + can acknowledge
//   • Admins/managers see the same list scoped to their reach
//
// Detail view is a Dialog to keep navigation lean.

import { useMemo, useState } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Users2, Clock, CheckCircle2, GraduationCap, Plus, X, MessageSquare,
} from "lucide-react";
import { useApi, useApiMutation } from "@/hooks/use-api";
import { apiRequest } from "@/lib/api";
import { useAuth, can } from "@/hooks/use-auth";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";

interface Session {
  id: number;
  agentId: number;
  agentNameAr: string; agentNameEn: string;
  supervisorUserId: number;
  supervisorName: string | null;
  sessionType: "side_by_side" | "dsat" | "qa";
  status: "pending_agent" | "acknowledged" | "completed" | "cancelled";
  positivePoints: string | null;
  mistakes: string | null;
  improvementPlan: string | null;
  targetMetric: string | null;
  deadline: string | null;
  agentAcknowledgedAt: string | null;
  agentComment: string | null;
  completedAt: string | null;
  createdAt: string;
}

interface Summary { total: number; pending: number; ack: number; completed: number }

interface AgentOpt { id: number; nameAr: string; nameEn: string; employeeId: string }

const TYPE_LABEL = {
  side_by_side: { ar: "جنب بجنب", en: "Side by Side" },
  dsat:         { ar: "DSAT", en: "DSAT" },
  qa:           { ar: "QA", en: "QA" },
} as const;

const STATUS_STYLE: Record<string, string> = {
  pending_agent: "bg-amber-100 text-amber-800 border-amber-200",
  acknowledged:  "bg-blue-100 text-blue-800 border-blue-200",
  completed:     "bg-emerald-100 text-emerald-800 border-emerald-200",
  cancelled:     "bg-slate-100 text-slate-600 border-slate-200",
};
const STATUS_LABEL = {
  pending_agent: { ar: "بانتظار الوكيل", en: "Pending agent" },
  acknowledged:  { ar: "أقرّها الوكيل",  en: "Acknowledged" },
  completed:     { ar: "مكتملة",         en: "Completed" },
  cancelled:     { ar: "ملغاة",         en: "Cancelled" },
} as const;

export default function CoachingPage() {
  const { data: user } = useAuth();
  const { lang } = useLanguage();
  const { data, refetch } = useApi<{ sessions: Session[]; summary: Summary }>("/api/coaching");
  const { data: agents = [] } = useApi<AgentOpt[]>("/api/agents");

  const canCreate = can(user, "coaching.create");
  const isAgent = user?.role === "agent";

  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<Session | null>(null);

  const sessions = data?.sessions ?? [];
  const summary = data?.summary ?? { total: 0, pending: 0, ack: 0, completed: 0 };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="max-w-[1400px] mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-primary font-bold tracking-wider">
              {lang === "ar" ? "الجودة" : "QUALITY"}
            </div>
            <h1 className="text-2xl font-bold mt-1 flex items-center gap-2">
              <GraduationCap className="w-6 h-6 text-primary" />
              {lang === "ar" ? "الجلسات التدريبية" : "Coaching Sessions"}
            </h1>
          </div>
          {canCreate && (
            <Button onClick={() => setCreateOpen(true)} className="gap-2">
              <Plus className="w-4 h-4" />
              {lang === "ar" ? "جلسة جديدة" : "New session"}
            </Button>
          )}
        </div>

        {/* Dashboard cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard color="text-primary"       icon={Users2}         value={summary.total}
            label={lang === "ar" ? "إجمالي الجلسات" : "Total sessions"} />
          <KpiCard color="text-amber-500"      icon={Clock}          value={summary.pending}
            label={lang === "ar" ? "بانتظار الإقرار" : "Pending acknowledge"} />
          <KpiCard color="text-blue-500"       icon={MessageSquare}  value={summary.ack}
            label={lang === "ar" ? "أقرّها الوكيل" : "Acknowledged"} />
          <KpiCard color="text-emerald-500"    icon={CheckCircle2}   value={summary.completed}
            label={lang === "ar" ? "مكتملة" : "Completed"} />
        </div>

        {/* List */}
        <Card>
          <CardContent className="p-0">
            {sessions.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground">
                <GraduationCap className="w-10 h-10 mx-auto mb-3 opacity-50" />
                {lang === "ar" ? "لا توجد جلسات بعد" : "No coaching sessions yet"}
              </div>
            ) : (
              <div className="divide-y">
                {sessions.map((s) => {
                  const name = lang === "ar" ? s.agentNameAr : s.agentNameEn;
                  const typeLabel = TYPE_LABEL[s.sessionType][lang];
                  const statusLabel = STATUS_LABEL[s.status][lang];
                  return (
                    <button key={s.id} onClick={() => setDetail(s)}
                      className="w-full text-start p-4 hover:bg-accent/40 transition-colors flex items-center gap-4">
                      <div className="w-11 h-11 rounded-full bg-primary/10 text-primary font-bold grid place-items-center">
                        {name.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">{name}</span>
                          <Badge variant="outline" className="text-[10px]">{typeLabel}</Badge>
                          <Badge className={cn("text-[10px]", STATUS_STYLE[s.status])} variant="outline">
                            {statusLabel}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {lang === "ar" ? "المشرف: " : "Supervisor: "}
                          {s.supervisorName ?? "—"}
                          {s.deadline && ` · ${lang === "ar" ? "الموعد النهائي" : "Deadline"}: ${s.deadline}`}
                        </div>
                      </div>
                      <div className="text-[10px] text-muted-foreground whitespace-nowrap">
                        {new Date(s.createdAt).toLocaleDateString()}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {createOpen && canCreate && (
        <CreateDialog
          agents={agents}
          onClose={() => setCreateOpen(false)}
          onCreated={() => { setCreateOpen(false); refetch(); }}
        />
      )}
      {detail && (
        <DetailDialog
          session={detail}
          isAgent={isAgent}
          canComplete={canCreate}
          onClose={() => setDetail(null)}
          onChanged={() => { setDetail(null); refetch(); }}
        />
      )}
    </div>
  );
}

function KpiCard({ icon: Icon, color, value, label }: {
  icon: any; color: string; value: number; label: string;
}) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={cn("w-11 h-11 rounded-xl bg-accent/50 grid place-items-center", color)}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <div className="text-2xl font-bold">{value}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Create dialog
// ═══════════════════════════════════════════════════════════════════════════

function CreateDialog({ agents, onClose, onCreated }: {
  agents: AgentOpt[]; onClose: () => void; onCreated: () => void;
}) {
  const { lang } = useLanguage();
  const [form, setForm] = useState({
    agentId: "", sessionType: "side_by_side",
    positivePoints: "", mistakes: "", improvementPlan: "",
    targetMetric: "", deadline: "",
  });
  const create = useApiMutation<typeof form, Session>(
    (input) => apiRequest<Session>("POST", "/api/coaching", input),
    { onSuccess: () => onCreated() },
  );

  const submit = () => {
    if (!form.agentId || !form.sessionType) return;
    create.mutate({ ...form, agentId: Number(form.agentId) as any });
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{lang === "ar" ? "جلسة تدريبية جديدة" : "New coaching session"}</DialogTitle>
          <DialogDescription>
            {lang === "ar"
              ? "املأ التفاصيل — ستُرسل للوكيل ليقرّها"
              : "Fill the details — will be sent to the agent for acknowledgment"}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label={lang === "ar" ? "الموظف" : "Agent"} required>
            <Select value={form.agentId} onValueChange={(v) => setForm({ ...form, agentId: v })}>
              <SelectTrigger><SelectValue placeholder={lang === "ar" ? "اختر موظفاً" : "Pick an agent"} /></SelectTrigger>
              <SelectContent>
                {agents.map((a) => (
                  <SelectItem key={a.id} value={String(a.id)}>
                    {lang === "ar" ? a.nameAr : a.nameEn} <span className="text-xs text-muted-foreground ms-2">({a.employeeId})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label={lang === "ar" ? "نوع الجلسة" : "Session type"} required>
            <Select value={form.sessionType} onValueChange={(v) => setForm({ ...form, sessionType: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="side_by_side">{TYPE_LABEL.side_by_side[lang]}</SelectItem>
                <SelectItem value="dsat">{TYPE_LABEL.dsat[lang]}</SelectItem>
                <SelectItem value="qa">{TYPE_LABEL.qa[lang]}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>

        <Field label={lang === "ar" ? "النقاط الإيجابية" : "Positive points"}>
          <Textarea rows={3} value={form.positivePoints}
            onChange={(e) => setForm({ ...form, positivePoints: e.target.value })}
            placeholder={lang === "ar" ? "ما الذي أحسنه الموظف..." : "What the agent did well…"} />
        </Field>

        <Field label={lang === "ar" ? "الأخطاء ونقاط التحسين" : "Mistakes / gaps"}>
          <Textarea rows={3} value={form.mistakes}
            onChange={(e) => setForm({ ...form, mistakes: e.target.value })}
            placeholder={lang === "ar" ? "ما الذي أخطأ فيه أو يحتاج تطوير..." : "What went wrong or needs improvement…"} />
        </Field>

        <Field label={lang === "ar" ? "خطة التحسين" : "Improvement plan"}>
          <Textarea rows={3} value={form.improvementPlan}
            onChange={(e) => setForm({ ...form, improvementPlan: e.target.value })}
            placeholder={lang === "ar" ? "الخطوات المطلوبة من الموظف..." : "Steps the agent should take…"} />
        </Field>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label={lang === "ar" ? "الهدف / المتوقع" : "Target metric"}>
            <Input value={form.targetMetric}
              onChange={(e) => setForm({ ...form, targetMetric: e.target.value })}
              placeholder={lang === "ar" ? "مثال: رفع CSAT إلى 90%" : "e.g., raise CSAT to 90%"} />
          </Field>

          <Field label={lang === "ar" ? "الموعد النهائي" : "Deadline"}>
            <Input type="date" value={form.deadline}
              onChange={(e) => setForm({ ...form, deadline: e.target.value })} />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {lang === "ar" ? "إلغاء" : "Cancel"}
          </Button>
          <Button onClick={submit} disabled={!form.agentId || create.isPending}>
            {create.isPending ? (lang === "ar" ? "جاري الحفظ…" : "Saving…") : (lang === "ar" ? "حفظ وإرسال للوكيل" : "Save & send")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Detail dialog (view + acknowledge + complete)
// ═══════════════════════════════════════════════════════════════════════════

function DetailDialog({ session, isAgent, canComplete, onClose, onChanged }: {
  session: Session; isAgent: boolean; canComplete: boolean;
  onClose: () => void; onChanged: () => void;
}) {
  const { lang } = useLanguage();
  const [comment, setComment] = useState("");
  const ack = useApiMutation<{ comment?: string }, unknown>(
    (input) => apiRequest("POST", `/api/coaching/${session.id}/acknowledge`, input),
    { onSuccess: onChanged },
  );
  const complete = useApiMutation<void, unknown>(
    () => apiRequest("POST", `/api/coaching/${session.id}/complete`),
    { onSuccess: onChanged },
  );

  const name = lang === "ar" ? session.agentNameAr : session.agentNameEn;
  const canAgentAck = isAgent && session.status === "pending_agent";
  const canMarkComplete = canComplete && session.status === "acknowledged";

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GraduationCap className="w-5 h-5 text-primary" />
            {TYPE_LABEL[session.sessionType][lang]} · {name}
          </DialogTitle>
          <DialogDescription>
            {lang === "ar" ? "المشرف: " : "Supervisor: "}{session.supervisorName ?? "—"}
            {" · "}
            <Badge className={cn("text-[10px]", STATUS_STYLE[session.status])} variant="outline">
              {STATUS_LABEL[session.status][lang]}
            </Badge>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Section label={lang === "ar" ? "النقاط الإيجابية" : "Positive points"}
                   value={session.positivePoints} tone="emerald" />
          <Section label={lang === "ar" ? "الأخطاء ونقاط التحسين" : "Mistakes / gaps"}
                   value={session.mistakes} tone="amber" />
          <Section label={lang === "ar" ? "خطة التحسين" : "Improvement plan"}
                   value={session.improvementPlan} tone="blue" />
          {(session.targetMetric || session.deadline) && (
            <div className="grid grid-cols-2 gap-3">
              {session.targetMetric && (
                <MetaBox label={lang === "ar" ? "الهدف" : "Target"} value={session.targetMetric} />
              )}
              {session.deadline && (
                <MetaBox label={lang === "ar" ? "الموعد النهائي" : "Deadline"} value={session.deadline} />
              )}
            </div>
          )}
          {session.agentComment && (
            <Section label={lang === "ar" ? "تعليق الموظف" : "Agent comment"}
                     value={session.agentComment} tone="slate" />
          )}
        </div>

        {canAgentAck && (
          <div className="space-y-2 border-t pt-4">
            <Label className="text-sm">{lang === "ar" ? "تعليقك (اختياري)" : "Your comment (optional)"}</Label>
            <Textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} />
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="gap-1">
            <X className="w-4 h-4" />
            {lang === "ar" ? "إغلاق" : "Close"}
          </Button>
          {canAgentAck && (
            <Button onClick={() => ack.mutate({ comment })} disabled={ack.isPending}>
              <CheckCircle2 className="w-4 h-4 me-1" />
              {ack.isPending ? "…" : (lang === "ar" ? "إقرار الجلسة" : "Acknowledge")}
            </Button>
          )}
          {canMarkComplete && (
            <Button onClick={() => complete.mutate()} disabled={complete.isPending}>
              <CheckCircle2 className="w-4 h-4 me-1" />
              {complete.isPending ? "…" : (lang === "ar" ? "وضع علامة مكتملة" : "Mark complete")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
    </div>
  );
}

function Section({ label, value, tone }: {
  label: string; value: string | null; tone: "emerald" | "amber" | "blue" | "slate";
}) {
  if (!value) return null;
  const toneClass = {
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-900",
    amber:   "bg-amber-50 border-amber-200 text-amber-900",
    blue:    "bg-blue-50 border-blue-200 text-blue-900",
    slate:   "bg-slate-50 border-slate-200 text-slate-900",
  }[tone];
  return (
    <div>
      <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">{label}</div>
      <div className={cn("border rounded-lg p-3 text-sm whitespace-pre-wrap", toneClass)}>{value}</div>
    </div>
  );
}

function MetaBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="border rounded-lg p-3 bg-accent/30">
      <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">{label}</div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}

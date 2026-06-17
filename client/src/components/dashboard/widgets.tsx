import { Link } from "wouter";
import { Bell, Clock, BarChart3, ListChecks, Trophy, CheckCircle2, XCircle, Star } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  PieChart, Pie, Cell, ResponsiveContainer,
} from "recharts";
import { useApi } from "@/hooks/use-api";
import { useLanguage } from "@/contexts/LanguageContext";
import { formatMetric, type MetricDef } from "@/lib/duration";
import { MONTH_KEYS } from "@/lib/i18n";

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

function todayKey(): string {
  return DAY_KEYS[new Date().getDay()];
}

function weekStartFor(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d.toISOString().slice(0, 10);
}

// ─── Notifications widget ────────────────────────────────────────────────────

export function NotificationsWidget() {
  const { t, lang } = useLanguage();
  const { data, isLoading } = useApi<{ items: any[]; unreadCount: number }>("/api/notifications?limit=5");
  return (
    <WidgetShell title={t("widNotificationsTitle")} icon={Bell}>
      {isLoading && <Skeleton className="h-24 w-full" />}
      {!isLoading && (data?.items.length ?? 0) === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">{t("widNotificationsEmpty")}</p>
      )}
      <div className="space-y-2">
        {data?.items.slice(0, 5).map((n) => (
          <div key={n.id} className={`p-2.5 rounded-xl text-sm ${n.isRead ? "bg-secondary/30" : "bg-primary/5 border border-primary/15"}`}>
            <div className="font-semibold mb-0.5">{lang === "ar" ? n.titleAr : n.titleEn}</div>
            {(lang === "ar" ? n.bodyAr : n.bodyEn) && (
              <div className="text-xs text-muted-foreground">{lang === "ar" ? n.bodyAr : n.bodyEn}</div>
            )}
          </div>
        ))}
      </div>
    </WidgetShell>
  );
}

// ─── Today's shift widget ────────────────────────────────────────────────────

export function ScheduleTodayWidget() {
  const { t } = useLanguage();
  const ws = weekStartFor(new Date());
  const { data, isLoading } = useApi<any>(`/api/schedules?weekStart=${ws}`,
    { queryKey: ["/api/schedules", ws] });
  const row = data?.schedules?.[0];
  const today = row?.shifts?.[todayKey()];
  const breaks: { start: string; end: string }[] = Array.isArray(today?.breaks)
    ? today.breaks
    : (today?.breakStart && today?.breakEnd ? [{ start: today.breakStart, end: today.breakEnd }] : []);
  return (
    <WidgetShell title={t("widScheduleTodayTitle")} icon={Clock}>
      {isLoading && <Skeleton className="h-20 w-full" />}
      {!isLoading && !today && (
        <p className="text-sm text-muted-foreground text-center py-4">{t("widScheduleTodayNoData")}</p>
      )}
      {today?.isOff && <Badge variant="secondary" className="text-sm">{t("widScheduleTodayOff")}</Badge>}
      {today && !today.isOff && today.start && (
        <div className="space-y-2" dir="ltr">
          <div className="text-3xl font-extrabold text-primary">
            {today.start} – {today.end}
          </div>
          {breaks.length > 0 && (
            <div className="text-xs text-muted-foreground">
              {breaks.map((b, i) => <div key={i}>Break {i + 1}: {b.start} – {b.end}</div>)}
            </div>
          )}
        </div>
      )}
    </WidgetShell>
  );
}

// ─── This week widget ────────────────────────────────────────────────────────

export function ScheduleWeekWidget() {
  const { t, lang, dir } = useLanguage();
  const ws = weekStartFor(new Date());
  const { data, isLoading } = useApi<any>(`/api/schedules?weekStart=${ws}`,
    { queryKey: ["/api/schedules", ws] });
  return (
    <WidgetShell title={t("widScheduleWeekTitle")} icon={Clock}>
      {isLoading && <Skeleton className="h-32 w-full" />}
      {!isLoading && (
        <div className="grid grid-cols-7 gap-1.5">
          {DAY_KEYS.map((day, i) => {
            const dayLabelKey = `schDay${day.charAt(0).toUpperCase() + day.slice(1)}` as any;
            const row = data?.schedules?.[0];
            const shift = row?.shifts?.[day];
            return (
              <div key={day} className="bg-secondary/30 rounded-lg p-2 text-center">
                <div className="text-[10px] text-muted-foreground font-bold">{t(dayLabelKey)}</div>
                {shift?.isOff ? (
                  <div className="text-[10px] mt-1">{t("widScheduleTodayOff")}</div>
                ) : shift?.start ? (
                  <div className="text-[10px] mt-1 font-semibold" dir="ltr">{shift.start}<br />{shift.end}</div>
                ) : (
                  <div className="text-[10px] mt-1 text-muted-foreground">—</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </WidgetShell>
  );
}

// ─── APR latest snapshot widget ──────────────────────────────────────────────

export function AprLatestWidget() {
  const { t, lang } = useLanguage();
  const { data, isLoading } = useApi<{ rows: any[]; metricDefs: MetricDef[] }>("/api/apr/latest");
  const row = data?.rows?.[0];
  const defs = (data?.metricDefs ?? []).filter((d) => d.isVisible).slice(0, 8);
  return (
    <WidgetShell title={t("widAprLatestTitle")} icon={BarChart3} linkTo="/apr">
      {isLoading && <Skeleton className="h-24 w-full" />}
      {!isLoading && !row && (
        <p className="text-sm text-muted-foreground text-center py-4">{t("widAprNoData")}</p>
      )}
      {row && (
        <>
          {row.asOfDate && (
            <p className="text-xs text-muted-foreground mb-2" dir="ltr">{row.asOfDate}</p>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {defs.map((d) => (
              <div key={d.key} className="bg-secondary/30 rounded-lg px-2.5 py-2">
                <div className="text-[10px] text-muted-foreground font-semibold truncate">{lang === "ar" ? d.labelAr : d.labelEn}</div>
                <div className="text-sm font-bold mt-0.5" dir="ltr">{formatMetric(d, row.metrics?.[d.key])}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </WidgetShell>
  );
}

// ─── QC summary widget ──────────────────────────────────────────────────────

export function QcSummaryWidget() {
  const { t } = useLanguage();
  const now = new Date();
  const qs = `?year=${now.getFullYear()}&month=${now.getMonth() + 1}`;
  const { data, isLoading } = useApi<any>(`/api/qc/stats${qs}`, { queryKey: ["/api/qc/stats", "widget"] });
  return (
    <WidgetShell title={t("widQcSummaryTitle")} icon={ListChecks} linkTo="/qc/dashboard">
      {isLoading && <Skeleton className="h-20 w-full" />}
      {!isLoading && data && (
        <div className="grid grid-cols-2 gap-2">
          <Stat label={t("qcTotal")} value={data.total} color="text-indigo-600" />
          <Stat label={t("qcPending")} value={data.pending} color="text-amber-600" />
          <Stat label={t("qcApproved")} value={data.approved} color="text-emerald-600" />
          <Stat label={t("qcRejected")} value={data.rejected} color="text-red-600" />
        </div>
      )}
    </WidgetShell>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-secondary/30 rounded-xl px-3 py-2.5">
      <div className="text-xs text-muted-foreground font-semibold">{label}</div>
      <div className={`text-2xl font-extrabold ${color}`} dir="ltr">{value}</div>
    </div>
  );
}

// ─── QC pass rate donuts widget ─────────────────────────────────────────────

export function QcPassRatesWidget() {
  const { t } = useLanguage();
  const now = new Date();
  const qs = `?year=${now.getFullYear()}&month=${now.getMonth() + 1}`;
  const { data, isLoading } = useApi<any>(`/api/qc/stats${qs}`, { queryKey: ["/api/qc/stats", "rates-widget"] });
  return (
    <WidgetShell title={t("widQcPassRatesTitle")} icon={CheckCircle2} linkTo="/qc/dashboard">
      {isLoading && <Skeleton className="h-32 w-full" />}
      {!isLoading && data && (
        <div className="grid grid-cols-3 gap-2">
          <MiniDonut title={t("qcInternalRate")} pass={data.internal.pass} fail={data.internal.fail} />
          <MiniDonut title={t("qcExternalRate")} pass={data.external.pass} fail={data.external.fail} />
          <MiniDonut title={t("qcCsatRate")} pass={data.csat.pass} fail={data.csat.fail} />
        </div>
      )}
    </WidgetShell>
  );
}

function MiniDonut({ title, pass, fail }: { title: string; pass: number; fail: number }) {
  const total = pass + fail;
  const rate = total > 0 ? Math.round((pass / total) * 100) : null;
  const chartData = total === 0
    ? [{ name: "empty", value: 1 }]
    : [{ name: "Pass", value: pass }, { name: "Fail", value: fail }];
  const colors = total === 0 ? ["#e2e8f0"] : ["#22c55e", "#ef4444"];
  return (
    <div className="text-center">
      <div className="text-[10px] font-semibold text-muted-foreground mb-1 line-clamp-2 min-h-[26px]">{title}</div>
      <div className="relative" style={{ height: 90 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={chartData} cx="50%" cy="50%" innerRadius={26} outerRadius={40} dataKey="value" strokeWidth={1} stroke="transparent">
              {chartData.map((_, i) => <Cell key={i} fill={colors[i]} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-sm font-extrabold" dir="ltr">{rate !== null ? `${rate}%` : "—"}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Score cards recent widget ──────────────────────────────────────────────

export function ScoreCardsRecentWidget() {
  const { t, lang } = useLanguage();
  const { data, isLoading } = useApi<any[]>("/api/scorecards");
  const top = (data ?? []).slice(0, 3);
  return (
    <WidgetShell title={t("widScoreCardsRecentTitle")} icon={Star} linkTo="/scorecards">
      {isLoading && <Skeleton className="h-24 w-full" />}
      {!isLoading && top.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">{t("widScoreCardsEmpty")}</p>
      )}
      <div className="space-y-2">
        {top.map((c) => (
          <Link key={c.id} href={`/scorecards/${c.id}`}>
            <div className="flex items-center justify-between bg-secondary/30 rounded-xl px-3 py-2.5 cursor-pointer hover:bg-secondary/50">
              <div>
                <div className="font-semibold text-sm">{lang === "ar" ? c.agentNameAr : c.agentNameEn}</div>
                <div className="text-xs text-muted-foreground" dir="ltr">
                  {t(MONTH_KEYS[c.periodMonth - 1])} {c.periodYear}
                </div>
              </div>
              <div className="text-end">
                <div className="text-base font-extrabold" dir="ltr">
                  {c.finalScore ? `${(Number(c.finalScore) * 100).toFixed(0)}%` : "—"}
                </div>
                {c.rankInTeam && <div className="text-[10px] text-muted-foreground">#{c.rankInTeam}</div>}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </WidgetShell>
  );
}

// ─── Shared widget shell ────────────────────────────────────────────────────

function WidgetShell({ title, icon: Icon, linkTo, children }: {
  title: string; icon: React.ComponentType<{ className?: string }>; linkTo?: string; children: React.ReactNode;
}) {
  return (
    <Card className="rounded-2xl h-full">
      <CardContent className="pt-5 pb-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Icon className="w-4 h-4 text-primary" />
            <h3 className="font-bold text-sm">{title}</h3>
          </div>
          {linkTo && <Link href={linkTo}><span className="text-xs text-primary font-semibold cursor-pointer">→</span></Link>}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

// ─── Registry: widget key → component + grid span ────────────────────────────

export const WIDGET_RENDERERS: Record<string, { component: React.ComponentType; col: string }> = {
  notifications_recent: { component: NotificationsWidget,   col: "lg:col-span-2" },
  schedule_today:       { component: ScheduleTodayWidget,   col: "lg:col-span-1" },
  schedule_week:        { component: ScheduleWeekWidget,    col: "lg:col-span-4" },
  apr_latest:           { component: AprLatestWidget,       col: "lg:col-span-4" },
  qc_summary:           { component: QcSummaryWidget,       col: "lg:col-span-2" },
  qc_pass_rates:        { component: QcPassRatesWidget,     col: "lg:col-span-3" },
  scorecards_recent:    { component: ScoreCardsRecentWidget, col: "lg:col-span-2" },
};

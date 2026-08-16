import { Sparkles, BarChart3, ListChecks, Clock, Type, Square, Image as ImageIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi } from "@/hooks/use-api";
import { useLanguage } from "@/contexts/LanguageContext";
import { formatMetric, formatHms, type MetricDef } from "@/lib/duration";
import type { CustomWidget, TextSize, TextAlign } from "@shared/dashboard";

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
function todayKey() { return DAY_KEYS[new Date().getDay()]; }
function weekStartFor(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d.toISOString().slice(0, 10);
}

interface Props { widget: CustomWidget }

// ─── Router ─────────────────────────────────────────────────────────────────

export function CustomWidgetCard({ widget }: Props) {
  // Free-form widgets skip the standard card chrome so they can render
  // full-bleed backgrounds and custom typography.
  if (widget.source === "text") return <TextBlock widget={widget} />;
  if (widget.source === "shape") return <ShapeBlock widget={widget} />;
  if (widget.source === "image") return <ImageBlock widget={widget} />;

  const { lang } = useLanguage();
  const title = lang === "ar" ? widget.titleAr : widget.titleEn;
  const Icon = widget.source === "apr" ? BarChart3
            : widget.source === "qc" ? ListChecks
            : widget.source === "schedule" ? Clock
            : Sparkles;
  return (
    <Card className="rounded-2xl h-full border-primary/20">
      <CardContent className="pt-5 pb-5">
        <div className="flex items-center gap-2 mb-3">
          <Icon className="w-4 h-4 text-primary" />
          <h3 className="font-bold text-sm">{title || "—"}</h3>
        </div>
        {widget.source === "apr" && <AprValue widget={widget} />}
        {widget.source === "qc" && <QcValue widget={widget} />}
        {widget.source === "schedule" && <ScheduleValue widget={widget} />}
      </CardContent>
    </Card>
  );
}

// ─── Free-form blocks ───────────────────────────────────────────────────────

const SIZE_CLASS: Record<TextSize, string> = {
  sm: "text-sm",
  md: "text-base",
  lg: "text-xl",
  xl: "text-3xl",
  "2xl": "text-5xl",
};

const ALIGN_CLASS: Record<TextAlign, string> = {
  start: "text-start",
  center: "text-center",
  end: "text-end",
};

function TextBlock({ widget }: Props) {
  const { lang } = useLanguage();
  const t = widget.text ?? { ar: "", en: "" };
  const content = (lang === "ar" ? t.ar : t.en) || (lang === "ar" ? t.en : t.ar) || "";
  const size = SIZE_CLASS[t.size ?? "lg"];
  const align = ALIGN_CLASS[t.align ?? "start"];
  const bold = t.bold !== false ? "font-bold" : "font-normal";
  return (
    <Card className="rounded-2xl h-full" style={{ backgroundColor: t.bg || undefined }}>
      <CardContent className={`h-full flex items-center justify-center py-5 whitespace-pre-wrap ${align}`}>
        <span
          className={`${size} ${bold} leading-tight`}
          style={{ color: t.color || undefined }}
        >
          {content || "…"}
        </span>
      </CardContent>
    </Card>
  );
}

function ShapeBlock({ widget }: Props) {
  const s = widget.shape ?? { kind: "rectangle", color: "#3b82f6" };
  if (s.kind === "divider") {
    return (
      <div className="h-full flex items-center">
        <div className="w-full h-1 rounded-full" style={{ backgroundColor: s.color }} />
      </div>
    );
  }
  if (s.kind === "circle") {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="aspect-square h-full max-h-32 rounded-full" style={{ backgroundColor: s.color }} />
      </div>
    );
  }
  return (
    <div
      className="h-full rounded-2xl min-h-24 border border-black/5"
      style={{ backgroundColor: s.color }}
    />
  );
}

function ImageBlock({ widget }: Props) {
  const img = widget.image;
  if (!img?.url) {
    return (
      <div className="h-full min-h-24 rounded-2xl border-2 border-dashed border-slate-300 flex items-center justify-center text-slate-400">
        <ImageIcon className="w-8 h-8" />
      </div>
    );
  }
  return (
    <div className="h-full min-h-24 rounded-2xl overflow-hidden bg-slate-100">
      <img
        src={img.url}
        alt={img.alt ?? ""}
        className={`w-full h-full ${img.fit === "cover" ? "object-cover" : "object-contain"}`}
        loading="lazy"
      />
    </div>
  );
}

// ─── Data-source blocks (unchanged) ─────────────────────────────────────────

function BigKpi({ value, hint }: { value: string; hint?: string }) {
  return (
    <div>
      <div className="text-3xl font-extrabold text-primary" dir="ltr">{value}</div>
      {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
    </div>
  );
}

function AprValue({ widget }: Props) {
  const { data, isLoading } = useApi<{ rows: any[]; metricDefs: MetricDef[] }>("/api/apr/latest");
  if (isLoading) return <Skeleton className="h-12 w-full" />;
  if (!widget.aprMetric) return <p className="text-xs text-muted-foreground">—</p>;
  const def = (data?.metricDefs ?? []).find((d) => d.key === widget.aprMetric);
  const aggregation = widget.aprAggregation ?? "latest";
  if (aggregation === "latest") {
    const row = data?.rows?.[0];
    return <BigKpi value={formatMetric(def, row?.metrics?.[widget.aprMetric])} />;
  }
  const nums = (data?.rows ?? [])
    .map((r) => Number(r.metrics?.[widget.aprMetric!]))
    .filter((n) => !isNaN(n));
  if (nums.length === 0) return <BigKpi value="—" />;
  const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
  return <BigKpi value={def ? formatMetric(def, avg) : avg.toFixed(2)} hint={`n=${nums.length}`} />;
}

function QcValue({ widget }: Props) {
  const now = new Date();
  const qs = widget.qcPeriod === "all" ? "" : `?year=${now.getFullYear()}&month=${now.getMonth() + 1}`;
  const { data, isLoading } = useApi<any>(`/api/qc/stats${qs}`,
    { queryKey: ["/api/qc/stats", "custom", widget.id, widget.qcPeriod] });
  if (isLoading) return <Skeleton className="h-12 w-full" />;
  if (!widget.qcMetric || !data) return <BigKpi value="—" />;
  const m = widget.qcMetric;
  if (m === "total" || m === "approved" || m === "rejected" || m === "pending") {
    return <BigKpi value={String(data[m] ?? 0)} />;
  }
  const rate = (group: any) => {
    const total = (group?.pass ?? 0) + (group?.fail ?? 0);
    return total > 0 ? `${Math.round((group.pass / total) * 100)}%` : "—";
  };
  if (m === "internal_rate") return <BigKpi value={rate(data.internal)} />;
  if (m === "external_rate") return <BigKpi value={rate(data.external)} />;
  if (m === "csat_rate") return <BigKpi value={rate(data.csat)} />;
  return <BigKpi value="—" />;
}

function ScheduleValue({ widget }: Props) {
  const ws = weekStartFor(new Date());
  const { data, isLoading } = useApi<any>(`/api/schedules?weekStart=${ws}`,
    { queryKey: ["/api/schedules", ws, "custom", widget.id] });
  if (isLoading) return <Skeleton className="h-12 w-full" />;
  const row = data?.schedules?.[0];
  if (!row) return <BigKpi value="—" />;
  const today = row.shifts?.[todayKey()];
  if (widget.scheduleMetric === "today_shift") {
    if (today?.isOff) return <BigKpi value="OFF" />;
    return <BigKpi value={today?.start && today?.end ? `${today.start}–${today.end}` : "—"} />;
  }
  if (widget.scheduleMetric === "today_break") {
    const breaks: { start: string; end: string }[] = Array.isArray(today?.breaks) ? today.breaks
      : (today?.breakStart && today?.breakEnd ? [{ start: today.breakStart, end: today.breakEnd }] : []);
    if (breaks.length === 0) return <BigKpi value="—" />;
    return <BigKpi value={`${breaks[0].start}–${breaks[0].end}`}
      hint={breaks.length > 1 ? `+${breaks.length - 1}` : undefined} />;
  }
  if (widget.scheduleMetric === "week_offs") {
    const offs = DAY_KEYS.filter((d) => row.shifts?.[d]?.isOff).length;
    return <BigKpi value={String(offs)} />;
  }
  if (widget.scheduleMetric === "week_working_days") {
    const working = DAY_KEYS.filter((d) => row.shifts?.[d]?.start && !row.shifts?.[d]?.isOff).length;
    return <BigKpi value={String(working)} />;
  }
  return <BigKpi value="—" />;
}

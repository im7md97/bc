// Semantic-layer chart editor.
//
// The user picks a business KPI (Metric) and a Dimension — never raw columns.
// Metrics live in the server-side catalog and are computed via SQL that joins
// the operational tables (QC, APR, Scorecard, Schedule, Attendance).
//
// Layout is Excel-Pivot inspired but dropdown-only:
//   Left  → chart type, titles, metric list (searchable), dimension picker,
//           filters, sort, limit, colour, refresh
//   Right → live preview inside a Grafana-style mockup.

import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { useLanguage } from "@/contexts/LanguageContext";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  SelectGroup, SelectLabel, SelectSeparator,
} from "@/components/ui/select";
import {
  Search, Plus, Trash2, X,
  BarChart3, PieChart as PieIcon, Activity, Table as TableIcon,
} from "lucide-react";
import { WIDGET_REGISTRY } from "@/widgets/registry";
import type {
  WidgetInstance, MetricSpec, MetricFilter, FilterOp,
} from "@shared/dashboard-v2";

interface CatalogDimension { key: string; labelAr: string; labelEn: string }
interface CatalogMetric {
  key: string; labelAr: string; labelEn: string;
  category: string; format: "integer" | "percent" | "decimal";
  dimensions: CatalogDimension[];
}
interface CatalogCategory { key: string; labelAr: string; labelEn: string }
interface MetricsCatalog { metrics: CatalogMetric[]; categories: CatalogCategory[] }

const CHART_TYPES = [
  { type: "bar-chart", icon: BarChart3, labelAr: "أعمدة", labelEn: "Bar" },
  { type: "pie-chart", icon: PieIcon,   labelAr: "دائري", labelEn: "Pie" },
  { type: "kpi",       icon: Activity,  labelAr: "KPI",    labelEn: "KPI" },
  { type: "table",     icon: TableIcon, labelAr: "جدول",   labelEn: "Table" },
];

const FILTER_OPS: { value: FilterOp; label: string; needsValue: boolean }[] = [
  { value: "eq",       label: "=",         needsValue: true },
  { value: "neq",      label: "≠",         needsValue: true },
  { value: "gt",       label: ">",         needsValue: true },
  { value: "gte",      label: "≥",         needsValue: true },
  { value: "lt",       label: "<",         needsValue: true },
  { value: "lte",      label: "≤",         needsValue: true },
  { value: "contains", label: "contains",  needsValue: true },
  { value: "is_null",  label: "is null",   needsValue: false },
  { value: "not_null", label: "not null",  needsValue: false },
];

const LIMITS = [10, 20, 50, 100, 0];

interface Props {
  open: boolean;
  onClose: () => void;
  instance: WidgetInstance;
  onSave: (updated: WidgetInstance) => void;
  onDelete: (id: string) => void;
}

export function ChartEditor({ open, onClose, instance, onSave, onDelete }: Props) {
  const { lang } = useLanguage();
  const [draft, setDraft] = useState<WidgetInstance>(instance);
  const [search, setSearch] = useState("");

  useEffect(() => { setDraft(instance); setSearch(""); }, [instance.id, open]);

  const { data: catalog } = useQuery<MetricsCatalog>({
    queryKey: ["dashboard.metrics"],
    queryFn: () => apiRequest("GET", "/api/dashboard/metrics"),
    enabled: open,
  });

  const metrics = catalog?.metrics ?? [];
  const categories = catalog?.categories ?? [];

  // Filter by search string.
  const filteredMetrics = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return metrics;
    return metrics.filter((m) =>
      m.labelAr.toLowerCase().includes(q) ||
      m.labelEn.toLowerCase().includes(q) ||
      m.key.toLowerCase().includes(q));
  }, [metrics, search]);

  // Group metrics by category for the searchable list.
  const groupedMetrics = useMemo(() => {
    const map = new Map<string, CatalogMetric[]>();
    for (const m of filteredMetrics) {
      const arr = map.get(m.category) ?? [];
      arr.push(m);
      map.set(m.category, arr);
    }
    return Array.from(map.entries());
  }, [filteredMetrics]);

  const spec: MetricSpec = draft.metricSpec ?? {
    metric: "", filters: [], sort: "desc", limit: 20,
  };
  const setSpec = (patch: Partial<MetricSpec>) =>
    setDraft({ ...draft, metricSpec: { ...spec, ...patch } });

  const activeMetric = metrics.find((m) => m.key === spec.metric);
  const availableDims = activeMetric?.dimensions ?? [];

  // ─── live preview ─────────────────────────────────────────────
  const previewMutation = useMutation({
    mutationFn: (s: MetricSpec) =>
      apiRequest<{ rows: { x: any; y: any }[] }>("POST", "/api/dashboard/run-metric", s),
  });
  useEffect(() => {
    if (open && spec.metric) {
      const t = setTimeout(() => previewMutation.mutate(spec), 250);
      return () => clearTimeout(t);
    }
  }, [open, JSON.stringify(spec)]);

  const previewRows = previewMutation.data?.rows ?? [];
  const previewInstance: WidgetInstance = {
    ...draft,
    config: {
      ...draft.config,
      xKey: "x", yKey: "y", nameKey: "x", valueKey: "y",
      titleAr: draft.config.titleAr ?? activeMetric?.labelAr ?? "",
      titleEn: draft.config.titleEn ?? activeMetric?.labelEn ?? "",
      suffix: activeMetric?.format === "percent" ? "%" : (draft.config.suffix ?? ""),
      decimals: activeMetric?.format === "decimal" || activeMetric?.format === "percent" ? 1 : 0,
    },
  };
  const previewDef = WIDGET_REGISTRY[draft.type];
  const PreviewComp = previewDef?.component;
  const previewData = spec.metric ? {
    columns: [
      { key: "x", type: "string" as const, labelAr: "X", labelEn: "X" },
      { key: "y", type: "number" as const, labelAr: "Y", labelEn: "Y" },
    ],
    rows: previewRows.map((r) => ({ x: r.x, y: r.y, value: r.y, label: r.x })),
  } : undefined;

  const pickMetric = (key: string) => {
    // Reset dimension + filters when switching metrics (dimension keys are metric-scoped).
    setSpec({ metric: key, dimension: undefined, filters: [] });
  };

  const addFilter = () => {
    if (!availableDims.length) return;
    setSpec({ filters: [...spec.filters, { dimensionKey: availableDims[0].key, op: "eq", value: "" }] });
  };
  const updateFilter = (i: number, patch: Partial<MetricFilter>) =>
    setSpec({ filters: spec.filters.map((f, idx) => idx === i ? { ...f, ...patch } : f) });
  const removeFilter = (i: number) =>
    setSpec({ filters: spec.filters.filter((_, idx) => idx !== i) });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-[95vw] w-[95vw] h-[92vh] p-0 overflow-hidden flex flex-col">
        <div className="flex-1 flex overflow-hidden">
          {/* ═══ LEFT ═══════════════════════════════════════════════ */}
          <div className="w-[440px] border-e flex flex-col bg-muted/20">
            {/* header */}
            <div className="px-4 py-3 border-b bg-card">
              <div className="text-sm font-bold">
                {lang === "ar" ? "محرر البطاقة" : "Widget editor"}
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                {lang === "ar" ? "اختر مؤشراً محسوباً من بيانات الموقع" : "Pick a computed KPI from your site's data"}
              </div>
            </div>

            {/* chart type */}
            <div className="px-4 py-3 border-b bg-card">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {lang === "ar" ? "نوع العرض" : "Chart type"}
              </Label>
              <div className="grid grid-cols-4 gap-1.5 mt-1.5">
                {CHART_TYPES.map((c) => (
                  <button
                    key={c.type}
                    onClick={() => setDraft({ ...draft, type: c.type })}
                    className={`flex flex-col items-center gap-0.5 p-1.5 rounded-md border text-[10px] transition
                      ${draft.type === c.type ? "border-primary bg-primary/10" : "hover:bg-accent"}`}
                  >
                    <c.icon className="h-4 w-4" />
                    <span>{lang === "ar" ? c.labelAr : c.labelEn}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* titles */}
            <div className="px-4 py-3 border-b bg-card grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-[10px] uppercase text-muted-foreground">
                  {lang === "ar" ? "العنوان (ع)" : "Title (Ar)"}
                </Label>
                <Input className="h-8" value={draft.config.titleAr ?? ""}
                  onChange={(e) => setDraft({ ...draft, config: { ...draft.config, titleAr: e.target.value } })} />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] uppercase text-muted-foreground">
                  {lang === "ar" ? "العنوان (En)" : "Title (En)"}
                </Label>
                <Input className="h-8" value={draft.config.titleEn ?? ""}
                  onChange={(e) => setDraft({ ...draft, config: { ...draft.config, titleEn: e.target.value } })} />
              </div>
            </div>

            {/* metric browser */}
            <div className="px-4 py-3 border-b bg-card">
              <Label className="text-[10px] uppercase text-muted-foreground">
                {lang === "ar" ? "المؤشر" : "Metric"}
              </Label>
              <div className="relative mt-1.5">
                <Search className="h-3.5 w-3.5 absolute top-1/2 -translate-y-1/2 start-2 text-muted-foreground" />
                <Input className="h-8 ps-8"
                  placeholder={lang === "ar" ? "بحث في المؤشرات" : "Search metrics"}
                  value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-2 py-2 border-b">
              {groupedMetrics.length === 0 ? (
                <div className="text-center text-xs text-muted-foreground py-6">
                  {lang === "ar" ? "لا توجد نتائج" : "No results"}
                </div>
              ) : groupedMetrics.map(([catKey, list]) => {
                const cat = categories.find((c) => c.key === catKey);
                return (
                  <div key={catKey} className="mb-2">
                    <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground bg-muted/40 rounded-sm">
                      {cat ? (lang === "ar" ? cat.labelAr : cat.labelEn) : catKey}
                    </div>
                    {list.map((m) => {
                      const selected = spec.metric === m.key;
                      return (
                        <button
                          key={m.key}
                          onClick={() => pickMetric(m.key)}
                          className={`w-full text-start px-2 py-1.5 rounded-sm text-xs flex items-center justify-between transition
                            ${selected ? "bg-primary/10 border border-primary/30" : "hover:bg-accent"}`}
                        >
                          <span className="truncate">
                            {lang === "ar" ? m.labelAr : m.labelEn}
                          </span>
                          <span className="text-[9px] text-muted-foreground uppercase">{m.format}</span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            {/* dimension picker */}
            <div className="px-4 py-3 border-b bg-card space-y-1">
              <Label className="text-[10px] uppercase text-muted-foreground">
                {lang === "ar" ? "المحور (تجميع حسب)" : "Dimension (group by)"}
              </Label>
              <div className="flex items-center gap-1">
                <Select
                  value={spec.dimension ?? ""}
                  onValueChange={(v) => setSpec({ dimension: v })}
                  disabled={!activeMetric}
                >
                  <SelectTrigger className="h-8">
                    <SelectValue placeholder={lang === "ar" ? "بدون تجميع" : "No grouping"} />
                  </SelectTrigger>
                  <SelectContent>
                    {availableDims.map((d) => (
                      <SelectItem key={d.key} value={d.key}>
                        {lang === "ar" ? d.labelAr : d.labelEn}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {spec.dimension && (
                  <button onClick={() => setSpec({ dimension: undefined })}
                    className="p-0.5 text-muted-foreground hover:text-destructive">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* filters */}
            <div className="px-4 py-3 border-b bg-card">
              <div className="flex items-center justify-between mb-1.5">
                <Label className="text-[10px] uppercase text-muted-foreground">
                  {lang === "ar" ? "الفلاتر" : "Filters"}
                </Label>
                <button onClick={addFilter} disabled={!activeMetric}
                  className="text-[10px] text-primary hover:underline disabled:opacity-40 inline-flex items-center gap-0.5">
                  <Plus className="h-3 w-3" /> {lang === "ar" ? "إضافة" : "Add"}
                </button>
              </div>
              {spec.filters.length === 0 ? (
                <div className="text-[10px] text-muted-foreground py-1">
                  {lang === "ar" ? "لا فلاتر" : "No filters"}
                </div>
              ) : spec.filters.map((f, i) => {
                const op = FILTER_OPS.find((o) => o.value === f.op);
                return (
                  <div key={i} className="flex gap-1 items-center mb-1">
                    <Select value={f.dimensionKey} onValueChange={(v) => updateFilter(i, { dimensionKey: v })}>
                      <SelectTrigger className="h-7 text-[11px] flex-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {availableDims.map((d) => (
                          <SelectItem key={d.key} value={d.key}>
                            {lang === "ar" ? d.labelAr : d.labelEn}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={f.op} onValueChange={(v) => updateFilter(i, { op: v as FilterOp })}>
                      <SelectTrigger className="h-7 text-[11px] w-16"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {FILTER_OPS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {op?.needsValue && (
                      <Input className="h-7 text-[11px] w-20" value={String(f.value ?? "")}
                        onChange={(e) => updateFilter(i, { value: e.target.value })} />
                    )}
                    <button onClick={() => removeFilter(i)}
                      className="p-0.5 text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                );
              })}
            </div>

            {/* sort / limit / color / refresh */}
            <div className="grid grid-cols-2 gap-2 px-4 py-3">
              <div className="space-y-1">
                <Label className="text-[10px] uppercase text-muted-foreground">
                  {lang === "ar" ? "الترتيب" : "Sort"}
                </Label>
                <Select value={spec.sort ?? ""} onValueChange={(v) => setSpec({ sort: v as any })}>
                  <SelectTrigger className="h-8"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="desc">{lang === "ar" ? "تنازلي" : "Descending"}</SelectItem>
                    <SelectItem value="asc">{lang === "ar" ? "تصاعدي" : "Ascending"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] uppercase text-muted-foreground">
                  {lang === "ar" ? "الحد" : "Limit"}
                </Label>
                <Select value={String(spec.limit ?? 20)} onValueChange={(v) => setSpec({ limit: Number(v) })}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LIMITS.map((v) => (
                      <SelectItem key={v} value={String(v)}>
                        {v === 0 ? (lang === "ar" ? "الكل" : "All") : v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] uppercase text-muted-foreground">
                  {lang === "ar" ? "اللون" : "Color"}
                </Label>
                <Input type="color" className="h-8" value={draft.config.color ?? "#3b82f6"}
                  onChange={(e) => setDraft({ ...draft, config: { ...draft.config, color: e.target.value } })} />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] uppercase text-muted-foreground">
                  {lang === "ar" ? "تحديث (ث)" : "Refresh (s)"}
                </Label>
                <Input type="number" className="h-8" min={0}
                  value={draft.refreshMs ? draft.refreshMs / 1000 : 0}
                  onChange={(e) => {
                    const s = Number(e.target.value);
                    setDraft({ ...draft, refreshMs: s > 0 ? s * 1000 : undefined });
                  }} />
              </div>
            </div>
          </div>

          {/* ═══ RIGHT: live preview ═══════════════════════════════ */}
          <div className="flex-1 bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-900 dark:to-slate-950 p-8 overflow-auto">
            <div className="max-w-4xl mx-auto">
              <div className="bg-card rounded-2xl shadow-2xl border overflow-hidden">
                <div className="px-6 py-4 border-b bg-muted/30 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full bg-red-400" />
                    <div className="h-3 w-3 rounded-full bg-amber-400" />
                    <div className="h-3 w-3 rounded-full bg-emerald-400" />
                  </div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wider">
                    {lang === "ar" ? "معاينة حية" : "Live preview"}
                    {previewMutation.isPending && <span className="ms-2 opacity-60">•••</span>}
                  </div>
                  <div className="w-16" />
                </div>
                <div className="p-6 bg-background">
                  <div className="h-[500px] rounded-lg border bg-card shadow-sm overflow-hidden">
                    {!spec.metric ? (
                      <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                        {lang === "ar" ? "اختر مؤشراً لبدء المعاينة" : "Pick a metric to start"}
                      </div>
                    ) : previewMutation.isError ? (
                      <div className="h-full flex items-center justify-center text-destructive text-sm p-4 text-center">
                        {String((previewMutation.error as any)?.messageEn ?? previewMutation.error)}
                      </div>
                    ) : PreviewComp && previewData ? (
                      <PreviewComp instance={previewInstance} data={previewData}
                        isLoading={previewMutation.isPending} lang={lang} />
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* footer */}
        <div className="border-t px-4 py-3 flex items-center justify-between bg-card">
          <Button variant="destructive" size="sm" onClick={() => { onDelete(draft.id); onClose(); }}>
            {lang === "ar" ? "حذف" : "Delete"}
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              {lang === "ar" ? "إلغاء" : "Cancel"}
            </Button>
            <Button size="sm" onClick={() => { onSave(draft); onClose(); }}>
              {lang === "ar" ? "حفظ" : "Save"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

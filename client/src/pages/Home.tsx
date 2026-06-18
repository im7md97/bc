import { useEffect, useState } from "react";
import { Plus, X, Pencil, ChevronUp, ChevronDown, Check, Sparkles, Maximize2 } from "lucide-react";
import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useApi, useApiMutation } from "@/hooks/use-api";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/contexts/LanguageContext";
import { ROLE_LABEL_KEYS, type TranslationKey } from "@/lib/i18n";
import { WIDGET_RENDERERS } from "@/components/dashboard/widgets";
import { CustomWidgetCard } from "@/components/dashboard/custom-widget";
import { SIZE_TO_COL, type WidgetSize, type PinnedWidget, type CustomWidget } from "@shared/dashboard";

interface DashboardResponse {
  pinned: PinnedWidget[];
  customs: CustomWidget[];
  catalog: { key: string; titleAr: string; titleEn: string; descriptionAr: string; descriptionEn: string; size: WidgetSize }[];
  customSources: ("apr" | "qc" | "schedule")[];
}

const SIZE_LABEL: Record<WidgetSize, TranslationKey> = {
  sm: "homeSizeSm", md: "homeSizeMd", lg: "homeSizeLg", xl: "homeSizeXl",
};

function randomId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export default function HomePage() {
  const { data: user } = useAuth();
  const { t, lang, dir } = useLanguage();
  const { data, refetch } = useApi<DashboardResponse>("/api/me/dashboard");

  const [editing, setEditing] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [pinned, setPinned] = useState<PinnedWidget[]>([]);
  const [customs, setCustoms] = useState<CustomWidget[]>([]);

  useEffect(() => {
    if (data) {
      setPinned(data.pinned ?? []);
      setCustoms(data.customs ?? []);
    }
  }, [data]);

  const save = useApiMutation(
    (payload: { pinned: PinnedWidget[]; customs: CustomWidget[] }) =>
      apiRequest<DashboardResponse>("PUT", "/api/me/dashboard", payload),
    { onSuccess: () => refetch() },
  );

  const persist = (nextPinned: PinnedWidget[], nextCustoms: CustomWidget[] = customs) => {
    setPinned(nextPinned);
    setCustoms(nextCustoms);
    save.mutate({ pinned: nextPinned, customs: nextCustoms });
  };
  const addCatalogWidget = (key: string) => persist([...pinned, { key }]);
  const addCustomWidget = (w: CustomWidget) => persist([...pinned, { key: `custom:${w.id}` }], [...customs, w]);
  const removeWidget = (i: number) => {
    const p = pinned[i];
    const nextPinned = pinned.filter((_, j) => j !== i);
    if (p.key.startsWith("custom:")) {
      const customId = p.key.slice("custom:".length);
      const nextCustoms = customs.filter((c) => c.id !== customId);
      persist(nextPinned, nextCustoms);
    } else {
      persist(nextPinned);
    }
  };
  const moveUp = (i: number) => {
    if (i <= 0) return;
    const next = [...pinned];
    [next[i - 1], next[i]] = [next[i], next[i - 1]];
    persist(next);
  };
  const moveDown = (i: number) => {
    if (i >= pinned.length - 1) return;
    const next = [...pinned];
    [next[i + 1], next[i]] = [next[i], next[i + 1]];
    persist(next);
  };
  const setSize = (i: number, size: WidgetSize) => {
    const next = pinned.map((p, j) => (j === i ? { ...p, size } : p));
    persist(next);
  };

  const displayName = lang === "ar" ? user?.displayNameAr : user?.displayNameEn;
  const roleKey = user ? ROLE_LABEL_KEYS[user.role] : undefined;

  const pinnedKeys = new Set(pinned.map((p) => p.key));
  const available = (data?.catalog ?? []).filter((w) => !pinnedKeys.has(w.key));

  // Resolve each pinned entry to either a catalog widget or a custom widget.
  const renderItems = pinned.map((p) => {
    if (p.key.startsWith("custom:")) {
      const customId = p.key.slice("custom:".length);
      const custom = customs.find((c) => c.id === customId);
      if (!custom) return null;
      const size = p.size ?? "sm";
      return { key: p.key, size, kind: "custom" as const, custom };
    }
    const renderer = WIDGET_RENDERERS[p.key];
    if (!renderer) return null;
    const catalogDef = data?.catalog.find((c) => c.key === p.key);
    const size = p.size ?? catalogDef?.size ?? "md";
    return { key: p.key, size, kind: "catalog" as const, renderer };
  });

  return (
    <div className="min-h-screen bg-background" dir={dir}>
      <Navbar />
      <main className="max-w-[1400px] mx-auto px-4 py-8">
        <div className="flex items-baseline justify-between flex-wrap gap-3 mb-8">
          <div>
            <h1 className="text-3xl font-extrabold mb-1">
              {t("homeWelcome")}, {displayName} 👋
            </h1>
            <p className="text-muted-foreground">{roleKey ? t(roleKey) : ""}</p>
          </div>
          <div className="flex gap-2">
            {editing && (
              <>
                <Button onClick={() => setCatalogOpen(true)} className="gap-2">
                  <Plus className="w-4 h-4" /> {t("homeAddWidget")}
                </Button>
                {(data?.customSources?.length ?? 0) > 0 && (
                  <Button variant="outline" onClick={() => setBuilderOpen(true)} className="gap-2">
                    <Sparkles className="w-4 h-4" /> {t("homeCustomCreate")}
                  </Button>
                )}
              </>
            )}
            <Button
              variant={editing ? "default" : "outline"}
              onClick={() => setEditing((e) => !e)}
              className="gap-2"
              data-testid="button-customize-dashboard"
            >
              {editing ? <><Check className="w-4 h-4" /> {t("homeDone")}</> : <><Pencil className="w-4 h-4" /> {t("homeCustomize")}</>}
            </Button>
          </div>
        </div>

        {pinned.length === 0 && (
          <Card className="rounded-2xl">
            <CardContent className="py-16 text-center">
              <p className="text-muted-foreground mb-4">{t("homeEmptyState")}</p>
              <Button onClick={() => { setEditing(true); setCatalogOpen(true); }} className="gap-2">
                <Plus className="w-4 h-4" /> {t("homeAddWidget")}
              </Button>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4 auto-rows-min">
          {renderItems.map((item, i) => {
            if (!item) return null;
            return (
              <div key={item.key} className={`relative ${SIZE_TO_COL[item.size]}`}>
                {editing && (
                  <div className="absolute -top-2 -end-2 z-10 flex gap-1 bg-card border border-border rounded-full p-1 shadow-lg">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost" className="w-7 h-7" title={t("homeSize")}>
                          <Maximize2 className="w-3.5 h-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-32">
                        {(Object.keys(SIZE_LABEL) as WidgetSize[]).map((s) => (
                          <DropdownMenuItem key={s} onClick={() => setSize(i, s)}
                            className={item.size === s ? "bg-primary/10 text-primary font-bold" : ""}>
                            {t(SIZE_LABEL[s])}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <Button size="icon" variant="ghost" className="w-7 h-7" onClick={() => moveUp(i)} disabled={i === 0}>
                      <ChevronUp className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="w-7 h-7" onClick={() => moveDown(i)} disabled={i === pinned.length - 1}>
                      <ChevronDown className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="w-7 h-7 text-red-600 hover:text-red-700" onClick={() => removeWidget(i)}>
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                )}
                {item.kind === "catalog" ? <item.renderer.component /> : <CustomWidgetCard widget={item.custom!} />}
              </div>
            );
          })}
        </div>
      </main>

      {/* Catalog dialog */}
      <Dialog open={catalogOpen} onOpenChange={setCatalogOpen}>
        <DialogContent dir={dir} className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("homeCatalog")}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {available.length === 0 && (
              <p className="col-span-full text-center text-muted-foreground py-8">{t("noData")}</p>
            )}
            {available.map((w) => (
              <Card key={w.key} className="rounded-2xl hover:shadow-md cursor-pointer"
                onClick={() => { addCatalogWidget(w.key); setCatalogOpen(false); }}>
                <CardContent className="pt-4 pb-4">
                  <div className="font-bold mb-1">{lang === "ar" ? w.titleAr : w.titleEn}</div>
                  <div className="text-xs text-muted-foreground">{lang === "ar" ? w.descriptionAr : w.descriptionEn}</div>
                </CardContent>
              </Card>
            ))}
            {data?.catalog
              .filter((w) => pinnedKeys.has(w.key))
              .map((w) => (
                <Card key={w.key} className="rounded-2xl opacity-50">
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-baseline justify-between mb-1">
                      <div className="font-bold">{lang === "ar" ? w.titleAr : w.titleEn}</div>
                      <Badge variant="secondary" className="text-[10px]">{t("homeWidgetExists")}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">{lang === "ar" ? w.descriptionAr : w.descriptionEn}</div>
                  </CardContent>
                </Card>
              ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Custom widget builder */}
      {builderOpen && data && (
        <CustomBuilder
          sources={data.customSources}
          aprMetrics={[]}
          onClose={() => setBuilderOpen(false)}
          onCreate={(w) => { addCustomWidget(w); setBuilderOpen(false); }}
        />
      )}
    </div>
  );
}

// ─── Builder ────────────────────────────────────────────────────────────────

interface BuilderProps {
  sources: ("apr" | "qc" | "schedule")[];
  aprMetrics: { key: string; labelAr: string; labelEn: string }[];
  onClose: () => void;
  onCreate: (w: CustomWidget) => void;
}

function CustomBuilder({ sources, onClose, onCreate }: BuilderProps) {
  const { t, lang, dir } = useLanguage();
  const [titleAr, setTitleAr] = useState("");
  const [titleEn, setTitleEn] = useState("");
  const [source, setSource] = useState<"apr" | "qc" | "schedule">(sources[0] ?? "qc");
  const [aprMetric, setAprMetric] = useState("");
  const [aprAggregation, setAprAggregation] = useState<"latest" | "average">("latest");
  const [qcMetric, setQcMetric] = useState<CustomWidget["qcMetric"]>("total");
  const [qcPeriod, setQcPeriod] = useState<"current_month" | "all">("current_month");
  const [scheduleMetric, setScheduleMetric] = useState<CustomWidget["scheduleMetric"]>("today_shift");

  // Pull APR metrics from /api/apr/latest when source=apr
  const { data: aprData } = useApi<{ metricDefs: { key: string; labelAr: string; labelEn: string; isVisible: boolean }[] }>(
    "/api/apr/latest", { enabled: source === "apr" });

  const aprMetricOptions = (aprData?.metricDefs ?? []).filter((d) => d.isVisible);

  const QC_OPTIONS: { value: NonNullable<CustomWidget["qcMetric"]>; labelKey: TranslationKey }[] = [
    { value: "total", labelKey: "qcMetricTotal" },
    { value: "approved", labelKey: "qcMetricApproved" },
    { value: "rejected", labelKey: "qcMetricRejected" },
    { value: "pending", labelKey: "qcMetricPending" },
    { value: "internal_rate", labelKey: "qcMetricInternalRate" },
    { value: "external_rate", labelKey: "qcMetricExternalRate" },
    { value: "csat_rate", labelKey: "qcMetricCsatRate" },
  ];
  const SCH_OPTIONS: { value: NonNullable<CustomWidget["scheduleMetric"]>; labelKey: TranslationKey }[] = [
    { value: "today_shift", labelKey: "schMetricTodayShift" },
    { value: "today_break", labelKey: "schMetricTodayBreak" },
    { value: "week_offs", labelKey: "schMetricWeekOffs" },
    { value: "week_working_days", labelKey: "schMetricWeekWorking" },
  ];

  const canSave = (titleAr.trim() || titleEn.trim())
    && (source === "qc" ? !!qcMetric : source === "schedule" ? !!scheduleMetric : !!aprMetric);

  const submit = () => {
    const w: CustomWidget = {
      id: randomId(),
      titleAr: titleAr.trim() || titleEn.trim(),
      titleEn: titleEn.trim() || titleAr.trim(),
      source,
      aprMetric: source === "apr" ? aprMetric : undefined,
      aprAggregation: source === "apr" ? aprAggregation : undefined,
      qcMetric: source === "qc" ? qcMetric : undefined,
      qcPeriod: source === "qc" ? qcPeriod : undefined,
      scheduleMetric: source === "schedule" ? scheduleMetric : undefined,
    };
    onCreate(w);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir={dir} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("homeCustomTitle")}</DialogTitle>
          <DialogDescription>{t("homeCustomCreate")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>عربي</Label>
              <Input value={titleAr} onChange={(e) => setTitleAr(e.target.value)} dir="rtl" />
            </div>
            <div className="space-y-1.5">
              <Label>English</Label>
              <Input value={titleEn} onChange={(e) => setTitleEn(e.target.value)} dir="ltr" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t("homeCustomSource")}</Label>
            <Select value={source} onValueChange={(v) => setSource(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {sources.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s === "apr" ? t("homeCustomSrcApr") : s === "qc" ? t("homeCustomSrcQc") : t("homeCustomSrcSchedule")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {source === "apr" && (
            <>
              <div className="space-y-1.5">
                <Label>{t("homeCustomMetric")}</Label>
                <Select value={aprMetric} onValueChange={setAprMetric}>
                  <SelectTrigger><SelectValue placeholder={t("select")} /></SelectTrigger>
                  <SelectContent>
                    {aprMetricOptions.map((m) => (
                      <SelectItem key={m.key} value={m.key}>
                        {lang === "ar" ? m.labelAr : m.labelEn}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("homeCustomAgg")}</Label>
                <Select value={aprAggregation} onValueChange={(v) => setAprAggregation(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="latest">{t("homeCustomAggLatest")}</SelectItem>
                    <SelectItem value="average">{t("homeCustomAggAverage")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {source === "qc" && (
            <>
              <div className="space-y-1.5">
                <Label>{t("homeCustomMetric")}</Label>
                <Select value={qcMetric} onValueChange={(v) => setQcMetric(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {QC_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{t(o.labelKey)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("homeCustomPeriod")}</Label>
                <Select value={qcPeriod} onValueChange={(v) => setQcPeriod(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="current_month">{t("homeCustomPeriodMonth")}</SelectItem>
                    <SelectItem value="all">{t("homeCustomPeriodAll")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {source === "schedule" && (
            <div className="space-y-1.5">
              <Label>{t("homeCustomMetric")}</Label>
              <Select value={scheduleMetric} onValueChange={(v) => setScheduleMetric(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SCH_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{t(o.labelKey)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("cancel")}</Button>
          <Button onClick={submit} disabled={!canSave} className="gap-2">
            <Sparkles className="w-4 h-4" /> {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

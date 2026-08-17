// Professional home dashboard.
//
// - Filter bar: period + project + search (user-scoped, persisted in URL/localStorage)
// - Grid: react-grid-layout with drag + resize handles (edit mode)
// - Save button persists per-user layout (positions + sizes) via /api/me/dashboard
// - Widget catalog: pick what to pin
//
// Every widget renders through the existing WIDGET_RENDERERS registry, so
// adding a new type stays a one-line change (see components/dashboard/widgets.tsx).

import { useEffect, useMemo, useRef, useState, useLayoutEffect } from "react";
import {
  Plus, X, Pencil, Check, Sparkles, Search, Filter, RotateCcw, GripVertical,
  ChevronDown, Calendar,
} from "lucide-react";
import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useApi } from "@/hooks/use-api";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/contexts/LanguageContext";
import { WIDGET_RENDERERS } from "@/components/dashboard/widgets";
import { CustomWidgetCard } from "@/components/dashboard/custom-widget";
import { cn } from "@/lib/utils";
import type { PinnedWidget, CustomWidget, WidgetSize } from "@shared/dashboard";
// @ts-ignore — RGL v2 type exports vary by build
import { GridLayout as GridLayoutRaw } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
const GridLayout = GridLayoutRaw as any;

interface DashboardResponse {
  pinned: PinnedWidget[];
  customs: CustomWidget[];
  catalog: { key: string; titleAr: string; titleEn: string; descriptionAr: string; descriptionEn: string; size: WidgetSize }[];
}
interface Project { id: number; nameAr: string; nameEn: string }

// Default grid dimensions per size-bucket (kept for widgets without explicit x/y/w/h).
const SIZE_TO_WH: Record<WidgetSize, { w: number; h: number }> = {
  sm: { w: 3, h: 4 },
  md: { w: 4, h: 4 },
  lg: { w: 6, h: 5 },
  xl: { w: 12, h: 5 },
};

const PERIODS = [
  { value: "today",     ar: "اليوم",       en: "Today" },
  { value: "week",      ar: "هذا الأسبوع", en: "This week" },
  { value: "month",     ar: "هذا الشهر",   en: "This month" },
  { value: "quarter",   ar: "هذا الربع",    en: "This quarter" },
  { value: "year",      ar: "هذه السنة",   en: "This year" },
];

// ─── container-width hook (no WidthProvider in RGL v2) ────────────────────
function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [w, setW] = useState(1200);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const update = () => setW(el.getBoundingClientRect().width);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

// ─── build a canonical layout from PinnedWidget[] + catalog ───────────────
type RglItem = { i: string; x: number; y: number; w: number; h: number };
function autoLayout(pinned: PinnedWidget[], customs: CustomWidget[], catalog: DashboardResponse["catalog"]): RglItem[] {
  let cursorX = 0, cursorY = 0, rowMax = 0;
  const items: RglItem[] = [];
  const push = (id: string, w: number, h: number, pin?: PinnedWidget) => {
    if (pin && pin.x !== undefined && pin.y !== undefined && pin.w && pin.h) {
      items.push({ i: id, x: pin.x, y: pin.y, w: pin.w, h: pin.h });
      return;
    }
    if (cursorX + w > 12) { cursorX = 0; cursorY += rowMax; rowMax = 0; }
    items.push({ i: id, x: cursorX, y: cursorY, w, h });
    cursorX += w; rowMax = Math.max(rowMax, h);
  };
  for (const p of pinned) {
    const def = catalog.find((c) => c.key === p.key);
    const size = SIZE_TO_WH[p.size ?? def?.size ?? "md"];
    push(p.key, p.w ?? size.w, p.h ?? size.h, p);
  }
  for (const c of customs) push(`custom:${c.id}`, 4, 4);
  return items;
}

export default function HomePage() {
  const { data: user } = useAuth();
  const { lang, dir } = useLanguage();
  const { data, refetch } = useApi<DashboardResponse>("/api/me/dashboard");
  const { data: projects = [] } = useApi<Project[]>("/api/projects");

  const [editing, setEditing] = useState(false);
  const [pinned, setPinned] = useState<PinnedWidget[]>([]);
  const [customs, setCustoms] = useState<CustomWidget[]>([]);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Filters — persisted per user in localStorage.
  const [period, setPeriod] = useState(() => localStorage.getItem("bc.dash.period") ?? "month");
  const [projectId, setProjectId] = useState(() => localStorage.getItem("bc.dash.projectId") ?? "all");
  const [search, setSearch] = useState("");

  useEffect(() => { localStorage.setItem("bc.dash.period", period); }, [period]);
  useEffect(() => { localStorage.setItem("bc.dash.projectId", projectId); }, [projectId]);

  useEffect(() => {
    if (data) { setPinned(data.pinned); setCustoms(data.customs); }
  }, [data]);

  const [gridRef, width] = useElementWidth<HTMLDivElement>();
  const layout = useMemo(
    () => data ? autoLayout(pinned, customs, data.catalog) : [],
    [pinned, customs, data?.catalog],
  );

  if (!data) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="text-center py-24 text-muted-foreground">…</div>
      </div>
    );
  }

  const isPinned = (key: string) => pinned.some((p) => p.key === key);
  const togglePin = (key: string) => {
    setPinned((prev) => isPinned(key)
      ? prev.filter((p) => p.key !== key)
      : [...prev, { key }]);
  };
  const removePin = (key: string) => setPinned((prev) => prev.filter((p) => p.key !== key));
  const removeCustom = (id: string) => setCustoms((prev) => prev.filter((c) => c.id !== id));

  // Persist layout coordinates back onto pinned widgets when the user drags.
  const applyLayoutChange = (next: readonly RglItem[]) => {
    setPinned((prev) => prev.map((p) => {
      const l = next.find((n) => n.i === p.key);
      return l ? { ...p, x: l.x, y: l.y, w: l.w, h: l.h } : p;
    }));
    setCustoms((prev) => prev.map((c) => {
      const l = next.find((n) => n.i === `custom:${c.id}`);
      return l ? { ...c, x: l.x, y: l.y, w: l.w, h: l.h } as any : c;
    }));
  };

  const save = async () => {
    setSaving(true);
    try {
      await apiRequest("PUT", "/api/me/dashboard", { pinned, customs });
      await refetch();
      setEditing(false);
    } finally { setSaving(false); }
  };
  const cancel = () => {
    setPinned(data.pinned); setCustoms(data.customs); setEditing(false);
  };

  const displayName = lang === "ar"
    ? (user?.displayNameAr ?? user?.username ?? "")
    : (user?.displayNameEn ?? user?.username ?? "");

  const periodLabel = PERIODS.find((p) => p.value === period)?.[lang] ?? period;

  return (
    <div className="min-h-screen bg-background" dir={dir}>
      <Navbar />

      <div className="max-w-[1600px] mx-auto px-4 py-6 space-y-4">
        {/* ── Hero header ──────────────────────────────────────────────── */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <div className="text-xs text-primary font-bold tracking-widest uppercase">
              {lang === "ar" ? "لوحة التحكم" : "DASHBOARD"}
            </div>
            <h1 className="text-3xl font-extrabold mt-1">
              {lang === "ar" ? `مرحباً، ${displayName}` : `Welcome, ${displayName}`}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {lang === "ar"
                ? `عرض بيانات ${periodLabel} · قم بالسحب لإعادة الترتيب أو تغيير الحجم`
                : `Showing data for ${periodLabel} · Drag to reorder or resize`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {editing ? (
              <>
                <Button size="sm" variant="ghost" onClick={cancel}>
                  {lang === "ar" ? "إلغاء" : "Cancel"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setCatalogOpen(true)} className="gap-1.5">
                  <Plus className="w-4 h-4" />
                  {lang === "ar" ? "إضافة بطاقة" : "Add widget"}
                </Button>
                <Button size="sm" onClick={save} disabled={saving} className="gap-1.5">
                  <Check className="w-4 h-4" />
                  {saving ? (lang === "ar" ? "جاري الحفظ…" : "Saving…") : (lang === "ar" ? "حفظ التخطيط" : "Save layout")}
                </Button>
              </>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setEditing(true)} className="gap-1.5">
                <Pencil className="w-4 h-4" />
                {lang === "ar" ? "تخصيص" : "Customize"}
              </Button>
            )}
          </div>
        </div>

        {/* ── Filter bar ───────────────────────────────────────────────── */}
        <Card className="border-primary/20">
          <CardContent className="p-3 flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground uppercase tracking-wider me-2">
              <Filter className="w-3.5 h-3.5" />
              {lang === "ar" ? "الفلاتر" : "Filters"}
            </div>

            {/* Period */}
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="h-9 w-40 gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-primary" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERIODS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p[lang]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Project */}
            {projects.length > 0 && (
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger className="h-9 w-52">
                  <SelectValue placeholder={lang === "ar" ? "المشروع" : "Project"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    {lang === "ar" ? "كل المشاريع" : "All projects"}
                  </SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {lang === "ar" ? p.nameAr : p.nameEn}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {/* Search */}
            <div className="relative flex-1 min-w-[180px] max-w-xs">
              <Search className="w-4 h-4 absolute top-1/2 -translate-y-1/2 start-2.5 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder={lang === "ar" ? "بحث…" : "Search…"}
                className="h-9 ps-8" />
            </div>

            <div className="flex-1" />

            {(period !== "month" || projectId !== "all" || search) && (
              <Button size="sm" variant="ghost" onClick={() => {
                setPeriod("month"); setProjectId("all"); setSearch("");
              }} className="gap-1 text-muted-foreground">
                <RotateCcw className="w-3.5 h-3.5" />
                {lang === "ar" ? "إعادة تعيين" : "Reset"}
              </Button>
            )}
          </CardContent>
        </Card>

        {/* ── Grid ─────────────────────────────────────────────────────── */}
        {pinned.length === 0 && customs.length === 0 ? (
          <EmptyState onAdd={() => { setEditing(true); setCatalogOpen(true); }} lang={lang} />
        ) : (
          <div ref={gridRef}>
            <GridLayout
              className="layout"
              layout={layout}
              cols={12}
              rowHeight={80}
              width={width}
              margin={[16, 16]}
              containerPadding={[0, 0]}
              isDraggable={editing}
              isResizable={editing}
              draggableHandle=".widget-drag-handle"
              draggableCancel=".widget-action,.react-resizable-handle,input,select,textarea,button"
              resizeHandles={["se"]}
              onLayoutChange={applyLayoutChange}
              compactType="vertical"
            >
              {pinned.map((p) => {
                const R = WIDGET_RENDERERS[p.key];
                if (!R) return <div key={p.key} />;
                const meta = data.catalog.find((c) => c.key === p.key);
                return (
                  <div key={p.key} className="group">
                    <WidgetFrame
                      title={meta ? (lang === "ar" ? meta.titleAr : meta.titleEn) : ""}
                      editing={editing}
                      onRemove={() => removePin(p.key)}
                      lang={lang}
                    >
                      <R.component />
                    </WidgetFrame>
                  </div>
                );
              })}
              {customs.map((c) => (
                <div key={`custom:${c.id}`} className="group">
                  <WidgetFrame
                    title={lang === "ar" ? c.titleAr : c.titleEn}
                    editing={editing}
                    onRemove={() => removeCustom(c.id)}
                    lang={lang}
                  >
                    <CustomWidgetCard widget={c} />
                  </WidgetFrame>
                </div>
              ))}
            </GridLayout>
          </div>
        )}
      </div>

      {/* Widget catalog dialog */}
      <Dialog open={catalogOpen} onOpenChange={setCatalogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{lang === "ar" ? "كتالوج البطاقات" : "Widget catalog"}</DialogTitle>
            <DialogDescription>
              {lang === "ar" ? "اختر البطاقات لإضافتها إلى لوحتك" : "Pick widgets to pin to your dashboard"}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[60vh] overflow-y-auto p-1">
            {data.catalog.map((w) => {
              const on = isPinned(w.key);
              return (
                <button key={w.key} onClick={() => togglePin(w.key)}
                  className={cn("text-start p-3 rounded-lg border transition",
                    on ? "border-primary bg-primary/10" : "hover:bg-accent")}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm flex items-center gap-2">
                        <Sparkles className="w-3.5 h-3.5 text-primary" />
                        {lang === "ar" ? w.titleAr : w.titleEn}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {lang === "ar" ? w.descriptionAr : w.descriptionEn}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge variant="outline" className="text-[10px]">{w.size}</Badge>
                      {on && <Check className="w-4 h-4 text-primary" />}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════

function WidgetFrame({ title, editing, onRemove, lang, children }: {
  title: string; editing: boolean; onRemove: () => void; lang: "ar" | "en"; children: React.ReactNode;
}) {
  return (
    <div className="h-full w-full flex flex-col bg-card border rounded-2xl shadow-sm overflow-hidden">
      {editing && (
        <div className="widget-drag-handle flex items-center justify-between px-2 py-1 bg-primary/5 border-b cursor-move">
          <div className="flex items-center gap-1 text-[11px] text-primary font-bold">
            <GripVertical className="w-3.5 h-3.5" />
            {lang === "ar" ? "اسحب لتحريك" : "Drag to move"}
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className="widget-action w-6 h-6 rounded-md hover:bg-destructive/10 text-destructive grid place-items-center"
            title={lang === "ar" ? "إزالة" : "Remove"}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-auto">
        {children}
      </div>
    </div>
  );
}

function EmptyState({ onAdd, lang }: { onAdd: () => void; lang: "ar" | "en" }) {
  return (
    <Card>
      <CardContent className="py-20 text-center space-y-4">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-primary/10 grid place-items-center">
          <Sparkles className="w-8 h-8 text-primary" />
        </div>
        <div>
          <div className="text-lg font-bold">
            {lang === "ar" ? "لوحتك فارغة" : "Your dashboard is empty"}
          </div>
          <div className="text-sm text-muted-foreground mt-1">
            {lang === "ar" ? "أضف بطاقات لبدء عرض بياناتك" : "Add widgets to start seeing your data"}
          </div>
        </div>
        <Button onClick={onAdd} className="gap-1.5">
          <Plus className="w-4 h-4" />
          {lang === "ar" ? "إضافة بطاقة" : "Add widget"}
        </Button>
      </CardContent>
    </Card>
  );
}

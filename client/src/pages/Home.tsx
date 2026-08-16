import { useEffect, useState } from "react";
import { Plus, X, Pencil, Check, Sparkles } from "lucide-react";
import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { useApi } from "@/hooks/use-api";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/contexts/LanguageContext";
import { WIDGET_RENDERERS } from "@/components/dashboard/widgets";
import { CustomWidgetCard } from "@/components/dashboard/custom-widget";
import {
  SIZE_TO_COL, type WidgetSize, type PinnedWidget, type CustomWidget,
} from "@shared/dashboard";

interface DashboardResponse {
  pinned: PinnedWidget[];
  customs: CustomWidget[];
  catalog: {
    key: string; titleAr: string; titleEn: string;
    descriptionAr: string; descriptionEn: string; size: WidgetSize;
  }[];
}

export default function HomePage() {
  const { data: user } = useAuth();
  const { t, lang, dir } = useLanguage();
  const { data, refetch } = useApi<DashboardResponse>("/api/me/dashboard");

  const [editing, setEditing] = useState(false);
  const [pinned, setPinned] = useState<PinnedWidget[]>([]);
  const [customs, setCustoms] = useState<CustomWidget[]>([]);
  const [catalogOpen, setCatalogOpen] = useState(false);

  useEffect(() => {
    if (data) {
      setPinned(data.pinned);
      setCustoms(data.customs);
    }
  }, [data]);

  if (!data) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="text-center py-24 text-muted-foreground">جاري التحميل…</div>
      </div>
    );
  }

  const isPinned = (key: string) => pinned.some((p) => p.key === key);
  const toggle = (key: string) => {
    setPinned((prev) => isPinned(key)
      ? prev.filter((p) => p.key !== key)
      : [...prev, { key }]);
  };
  const removePin = (key: string) => setPinned((prev) => prev.filter((p) => p.key !== key));
  const removeCustom = (id: string) => setCustoms((prev) => prev.filter((c) => c.id !== id));

  const commit = async () => {
    await apiRequest("PUT", "/api/me/dashboard", { pinned, customs });
    await refetch();
    setEditing(false);
  };
  const cancel = () => {
    setPinned(data.pinned);
    setCustoms(data.customs);
    setEditing(false);
  };

  const displayName = lang === "ar"
    ? (user?.displayNameAr ?? user?.username ?? "")
    : (user?.displayNameEn ?? user?.username ?? "");
  const greeting = lang === "ar" ? `مرحباً، ${displayName}` : `Welcome, ${displayName}`;

  return (
    <div className="min-h-screen bg-background" dir={dir}>
      <Navbar />

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">{greeting}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {lang === "ar" ? "نظرة عامة على أنشطتك ومؤشراتك" : "Your overview and KPIs"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {editing ? (
              <>
                <Button size="sm" variant="outline" onClick={() => setCatalogOpen(true)} className="gap-1">
                  <Plus className="h-4 w-4" />
                  {lang === "ar" ? "إضافة بطاقة" : "Add widget"}
                </Button>
                <Button size="sm" variant="ghost" onClick={cancel}>
                  {lang === "ar" ? "إلغاء" : "Cancel"}
                </Button>
                <Button size="sm" onClick={commit} className="gap-1">
                  <Check className="h-4 w-4" />
                  {lang === "ar" ? "حفظ" : "Save"}
                </Button>
              </>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setEditing(true)} className="gap-1">
                <Pencil className="h-4 w-4" />
                {lang === "ar" ? "تعديل" : "Edit"}
              </Button>
            )}
          </div>
        </div>

        {/* grid */}
        {pinned.length === 0 && customs.length === 0 ? (
          <EmptyState onAdd={() => { setEditing(true); setCatalogOpen(true); }} lang={lang} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
            {pinned.map((p) => {
              const def = data.catalog.find((d) => d.key === p.key);
              const R = WIDGET_RENDERERS[p.key];
              if (!R) return null;
              const span = SIZE_TO_COL[p.size ?? def?.size ?? "md"] ?? R.col;
              return (
                <div key={p.key} className={`${span} relative group`}>
                  {editing && (
                    <button
                      onClick={() => removePin(p.key)}
                      className="absolute -top-2 -end-2 z-10 h-6 w-6 rounded-full bg-destructive text-destructive-foreground grid place-items-center shadow-md opacity-0 group-hover:opacity-100 transition"
                      title={lang === "ar" ? "إزالة" : "Remove"}>
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <R.component />
                </div>
              );
            })}

            {customs.map((c) => {
              const span = SIZE_TO_COL["md"];
              return (
                <div key={c.id} className={`${span} relative group`}>
                  {editing && (
                    <button
                      onClick={() => removeCustom(c.id)}
                      className="absolute -top-2 -end-2 z-10 h-6 w-6 rounded-full bg-destructive text-destructive-foreground grid place-items-center shadow-md opacity-0 group-hover:opacity-100 transition"
                      title={lang === "ar" ? "إزالة" : "Remove"}>
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <CustomWidgetCard widget={c} />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* catalog dialog */}
      <Dialog open={catalogOpen} onOpenChange={setCatalogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{lang === "ar" ? "كتالوج البطاقات" : "Widget catalog"}</DialogTitle>
            <DialogDescription>
              {lang === "ar" ? "اختر البطاقات التي تريد تثبيتها في لوحتك" : "Pick widgets to pin to your dashboard"}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[60vh] overflow-y-auto pr-1">
            {data.catalog.map((w) => {
              const on = isPinned(w.key);
              return (
                <button
                  key={w.key}
                  onClick={() => toggle(w.key)}
                  className={`text-start p-3 rounded-lg border transition ${
                    on ? "border-primary bg-primary/10" : "hover:bg-accent"
                  }`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm flex items-center gap-2">
                        <Sparkles className="h-3.5 w-3.5 text-primary" />
                        {lang === "ar" ? w.titleAr : w.titleEn}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {lang === "ar" ? w.descriptionAr : w.descriptionEn}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge variant="outline" className="text-[10px]">{w.size}</Badge>
                      {on && <Check className="h-4 w-4 text-primary" />}
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

function EmptyState({ onAdd, lang }: { onAdd: () => void; lang: "ar" | "en" }) {
  return (
    <Card>
      <CardContent className="py-16 text-center space-y-4">
        <Sparkles className="h-12 w-12 mx-auto text-primary/60" />
        <div>
          <div className="font-bold">
            {lang === "ar" ? "لوحتك فارغة" : "Your dashboard is empty"}
          </div>
          <div className="text-sm text-muted-foreground mt-1">
            {lang === "ar" ? "أضف بطاقات من الكتالوج لبدء العرض" : "Add widgets from the catalog to get started"}
          </div>
        </div>
        <Button onClick={onAdd} className="gap-1">
          <Plus className="h-4 w-4" />
          {lang === "ar" ? "إضافة بطاقة" : "Add widget"}
        </Button>
      </CardContent>
    </Card>
  );
}

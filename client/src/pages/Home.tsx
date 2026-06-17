import { useState, useEffect } from "react";
import { Plus, X, Pencil, ChevronUp, ChevronDown, Check } from "lucide-react";
import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useApi, useApiMutation } from "@/hooks/use-api";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/contexts/LanguageContext";
import { ROLE_LABEL_KEYS } from "@/lib/i18n";
import { WIDGET_RENDERERS } from "@/components/dashboard/widgets";

interface DashboardConfig {
  pinned: string[];
  catalog: { key: string; titleAr: string; titleEn: string; descriptionAr: string; descriptionEn: string; size: string }[];
}

export default function HomePage() {
  const { data: user } = useAuth();
  const { t, lang, dir } = useLanguage();
  const { data, refetch } = useApi<DashboardConfig>("/api/me/dashboard");

  const [editing, setEditing] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [pinned, setPinned] = useState<string[]>([]);

  useEffect(() => {
    if (data?.pinned) setPinned(data.pinned);
  }, [data?.pinned]);

  const save = useApiMutation(
    (widgets: string[]) => apiRequest<{ pinned: string[] }>("PUT", "/api/me/dashboard", { widgets }),
    { onSuccess: () => refetch() },
  );

  const persist = (next: string[]) => {
    setPinned(next);
    save.mutate(next);
  };
  const addWidget = (key: string) => persist([...pinned, key]);
  const removeWidget = (key: string) => persist(pinned.filter((k) => k !== key));
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

  const displayName = lang === "ar" ? user?.displayNameAr : user?.displayNameEn;
  const roleKey = user ? ROLE_LABEL_KEYS[user.role] : undefined;

  const available = (data?.catalog ?? []).filter((w) => !pinned.includes(w.key));

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
              <Button onClick={() => setCatalogOpen(true)} className="gap-2">
                <Plus className="w-4 h-4" /> {t("homeAddWidget")}
              </Button>
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
          {pinned.map((key, i) => {
            const renderer = WIDGET_RENDERERS[key];
            if (!renderer) return null;
            const Widget = renderer.component;
            return (
              <div key={key} className={`relative ${renderer.col}`}>
                {editing && (
                  <div className="absolute -top-2 -end-2 z-10 flex gap-1 bg-card border border-border rounded-full p-1 shadow-lg">
                    <Button size="icon" variant="ghost" className="w-7 h-7" onClick={() => moveUp(i)} disabled={i === 0}>
                      <ChevronUp className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="w-7 h-7" onClick={() => moveDown(i)} disabled={i === pinned.length - 1}>
                      <ChevronDown className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="w-7 h-7 text-red-600 hover:text-red-700" onClick={() => removeWidget(key)}>
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                )}
                <Widget />
              </div>
            );
          })}
        </div>
      </main>

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
                onClick={() => { addWidget(w.key); setCatalogOpen(false); }}>
                <CardContent className="pt-4 pb-4">
                  <div className="font-bold mb-1">{lang === "ar" ? w.titleAr : w.titleEn}</div>
                  <div className="text-xs text-muted-foreground">{lang === "ar" ? w.descriptionAr : w.descriptionEn}</div>
                </CardContent>
              </Card>
            ))}
            {data?.catalog
              .filter((w) => pinned.includes(w.key))
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
    </div>
  );
}

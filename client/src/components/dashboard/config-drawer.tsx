import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLanguage } from "@/contexts/LanguageContext";
import type { WidgetInstance, DataSourceDef, ConfigField } from "@shared/dashboard-v2";
import type { WidgetTypeReg } from "@/widgets/types";

interface Props {
  open: boolean;
  onClose: () => void;
  instance: WidgetInstance | null;
  widgetDef: WidgetTypeReg | null;
  sources: DataSourceDef[];
  onSave: (updated: WidgetInstance) => void;
  onDelete: (id: string) => void;
}

export function ConfigDrawer({ open, onClose, instance, widgetDef, sources, onSave, onDelete }: Props) {
  const { lang } = useLanguage();
  const [draft, setDraft] = useState<WidgetInstance | null>(instance);

  // Re-sync when the caller opens with a different instance.
  if (instance && draft?.id !== instance.id) setDraft(instance);
  if (!instance || !widgetDef || !draft) return null;

  const setConfig = (key: string, v: any) =>
    setDraft({ ...draft, config: { ...draft.config, [key]: v } });

  const sourceDef = draft.dataSource?.source
    ? sources.find((s) => s.key === draft.dataSource!.source)
    : null;

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side={lang === "ar" ? "left" : "right"} className="w-[420px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{lang === "ar" ? widgetDef.labelAr : widgetDef.labelEn}</SheetTitle>
        </SheetHeader>

        <div className="space-y-4 py-4">
          {widgetDef.needsDataSource && (
            <section className="space-y-2 border-b pb-4">
              <Label>{lang === "ar" ? "مصدر البيانات" : "Data source"}</Label>
              <Select
                value={draft.dataSource?.source ?? ""}
                onValueChange={(v) => setDraft({ ...draft, dataSource: { source: v, params: {} } })}
              >
                <SelectTrigger><SelectValue placeholder={lang === "ar" ? "اختر مصدر" : "Pick a source"} /></SelectTrigger>
                <SelectContent>
                  {sources.map((s) => (
                    <SelectItem key={s.key} value={s.key}>
                      {lang === "ar" ? s.labelAr : s.labelEn}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {sourceDef && sourceDef.params.map((p) => (
                <div key={p.key} className="space-y-1">
                  <Label className="text-xs">{lang === "ar" ? p.labelAr : p.labelEn}</Label>
                  {p.type === "select" ? (
                    <Select
                      value={String(draft.dataSource?.params?.[p.key] ?? p.defaultValue ?? "")}
                      onValueChange={(v) => setDraft({
                        ...draft,
                        dataSource: { source: draft.dataSource!.source, params: { ...draft.dataSource!.params, [p.key]: v } },
                      })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(p.options ?? []).map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {lang === "ar" ? o.labelAr : o.labelEn}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      type={p.type === "number" || p.type === "month" || p.type === "year" ? "number" : "text"}
                      value={String(draft.dataSource?.params?.[p.key] ?? p.defaultValue ?? "")}
                      onChange={(e) => setDraft({
                        ...draft,
                        dataSource: { source: draft.dataSource!.source, params: { ...draft.dataSource!.params, [p.key]: e.target.value } },
                      })}
                    />
                  )}
                </div>
              ))}
            </section>
          )}

          <section className="space-y-3">
            {widgetDef.configSchema.map((f) => (
              <ConfigInput key={f.key} field={f} lang={lang}
                value={draft.config[f.key] ?? f.defaultValue}
                onChange={(v) => setConfig(f.key, v)} />
            ))}
          </section>

          <section className="border-t pt-4 space-y-2">
            <Label>{lang === "ar" ? "التحديث التلقائي (ثواني)" : "Auto-refresh (seconds)"}</Label>
            <Input type="number" min={0}
              value={draft.refreshMs ? draft.refreshMs / 1000 : 0}
              onChange={(e) => {
                const s = Number(e.target.value);
                setDraft({ ...draft, refreshMs: s > 0 ? s * 1000 : undefined });
              }} />
          </section>
        </div>

        <SheetFooter className="gap-2">
          <Button variant="destructive" onClick={() => { onDelete(draft.id); onClose(); }}>
            {lang === "ar" ? "حذف" : "Delete"}
          </Button>
          <Button onClick={() => { onSave(draft); onClose(); }}>
            {lang === "ar" ? "حفظ" : "Save"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function ConfigInput({ field, value, onChange, lang }: {
  field: ConfigField; value: any; onChange: (v: any) => void; lang: "ar" | "en";
}) {
  const label = lang === "ar" ? field.labelAr : field.labelEn;
  switch (field.type) {
    case "textarea":
      return (
        <div className="space-y-1">
          <Label className="text-xs">{label}</Label>
          <Textarea rows={4} value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
        </div>
      );
    case "boolean":
      return (
        <div className="flex items-center justify-between">
          <Label className="text-xs">{label}</Label>
          <Switch checked={!!value} onCheckedChange={onChange} />
        </div>
      );
    case "number":
      return (
        <div className="space-y-1">
          <Label className="text-xs">{label}</Label>
          <Input type="number" value={value ?? ""} onChange={(e) => onChange(Number(e.target.value))} />
        </div>
      );
    case "color":
      return (
        <div className="space-y-1">
          <Label className="text-xs">{label}</Label>
          <Input type="color" value={value ?? "#000000"} onChange={(e) => onChange(e.target.value)} />
        </div>
      );
    case "select":
      return (
        <div className="space-y-1">
          <Label className="text-xs">{label}</Label>
          <Select value={value ?? ""} onValueChange={onChange}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {field.options.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {lang === "ar" ? o.labelAr : o.labelEn}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );
    default:
      return (
        <div className="space-y-1">
          <Label className="text-xs">{label}</Label>
          <Input value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
        </div>
      );
  }
}

import type { WidgetProps, WidgetTypeReg } from "./types";

function KpiWidget({ instance, data, isLoading, error, lang }: WidgetProps) {
  const cfg = instance.config;
  const title = lang === "ar" ? (cfg.titleAr ?? cfg.title ?? "") : (cfg.titleEn ?? cfg.title ?? "");
  const valueKey: string = cfg.valueKey ?? "y";
  const prefix: string = cfg.prefix ?? "";
  const suffix: string = cfg.suffix ?? "";
  const decimals: number = Number(cfg.decimals ?? 0);

  let display = "—";
  if (isLoading) display = "…";
  else if (error) display = "!";
  else if (data && data.rows.length > 0) {
    const raw = data.rows[0]?.[valueKey];
    if (typeof raw === "number") display = raw.toFixed(decimals);
    else if (raw != null) display = String(raw);
  }

  return (
    <div className="h-full w-full flex flex-col justify-between p-4">
      <div className="text-sm text-muted-foreground">{title}</div>
      <div className="text-4xl font-bold text-foreground truncate">
        {prefix}{display}{suffix}
      </div>
    </div>
  );
}

export const kpiDef: WidgetTypeReg = {
  type: "kpi",
  labelAr: "مؤشر KPI",
  labelEn: "KPI",
  icon: "TrendingUp",
  category: "metric",
  defaultSize: { w: 3, h: 3 },
  needsDataSource: true,
  configSchema: [
    { key: "titleAr", type: "string", labelAr: "العنوان (عربي)", labelEn: "Title (Arabic)" },
    { key: "titleEn", type: "string", labelAr: "العنوان (إنجليزي)", labelEn: "Title (English)" },
    { key: "valueKey", type: "string", labelAr: "مفتاح القيمة", labelEn: "Value key", defaultValue: "value" },
    { key: "prefix", type: "string", labelAr: "بادئة", labelEn: "Prefix" },
    { key: "suffix", type: "string", labelAr: "لاحقة", labelEn: "Suffix", defaultValue: "" },
    { key: "decimals", type: "number", labelAr: "عدد الخانات العشرية", labelEn: "Decimals", defaultValue: 0 },
  ],
  component: KpiWidget,
};

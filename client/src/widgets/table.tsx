import type { WidgetProps, WidgetTypeReg } from "./types";

function TableWidget({ instance, data, isLoading, lang }: WidgetProps) {
  const cfg = instance.config;
  const title = lang === "ar" ? (cfg.titleAr ?? "") : (cfg.titleEn ?? "");
  return (
    <div className="h-full w-full flex flex-col p-3">
      {title && <div className="text-sm font-medium mb-2">{title}</div>}
      <div className="flex-1 min-h-0 overflow-auto">
        {isLoading || !data ? (
          <div className="text-muted-foreground text-sm">…</div>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-muted sticky top-0">
              <tr>
                {data.columns.map((c) => (
                  <th key={c.key} className="text-start p-2 font-medium">
                    {lang === "ar" ? c.labelAr : c.labelEn}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r, i) => (
                <tr key={i} className="border-b hover:bg-muted/30">
                  {data.columns.map((c) => (
                    <td key={c.key} className="p-2">{formatCell(r[c.key], c.type)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function formatCell(v: any, type: string) {
  if (v == null) return "—";
  if (type === "date" && v) return new Date(v).toLocaleDateString();
  return String(v);
}

export const tableDef: WidgetTypeReg = {
  type: "table",
  labelAr: "جدول",
  labelEn: "Table",
  icon: "Table",
  category: "data",
  defaultSize: { w: 8, h: 5 },
  needsDataSource: true,
  configSchema: [
    { key: "titleAr", type: "string", labelAr: "العنوان (عربي)", labelEn: "Title (Arabic)" },
    { key: "titleEn", type: "string", labelAr: "العنوان (إنجليزي)", labelEn: "Title (English)" },
  ],
  component: TableWidget,
};

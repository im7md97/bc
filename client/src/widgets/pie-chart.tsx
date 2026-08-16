import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import type { WidgetProps, WidgetTypeReg } from "./types";

const PALETTE = ["#3b82f6", "#22c55e", "#f97316", "#ef4444", "#a855f7", "#eab308", "#06b6d4"];

function PieChartWidget({ instance, data, isLoading, lang }: WidgetProps) {
  const cfg = instance.config;
  const title = lang === "ar" ? (cfg.titleAr ?? "") : (cfg.titleEn ?? "");
  const nameKey: string = cfg.nameKey ?? "x";
  const valueKey: string = cfg.valueKey ?? "y";
  const donut: boolean = cfg.donut ?? true;

  return (
    <div className="h-full w-full flex flex-col p-3">
      {title && <div className="text-sm font-medium mb-2">{title}</div>}
      <div className="flex-1 min-h-0">
        {isLoading || !data ? (
          <div className="h-full flex items-center justify-center text-muted-foreground text-sm">…</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data.rows}
                dataKey={valueKey}
                nameKey={nameKey}
                innerRadius={donut ? "55%" : 0}
                outerRadius="85%"
                paddingAngle={2}
              >
                {data.rows.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

export const pieChartDef: WidgetTypeReg = {
  type: "pie-chart",
  labelAr: "رسم دائري",
  labelEn: "Pie Chart",
  icon: "PieChart",
  category: "chart",
  defaultSize: { w: 5, h: 5 },
  needsDataSource: true,
  configSchema: [
    { key: "titleAr", type: "string", labelAr: "العنوان (عربي)", labelEn: "Title (Arabic)" },
    { key: "titleEn", type: "string", labelAr: "العنوان (إنجليزي)", labelEn: "Title (English)" },
    { key: "nameKey", type: "string", labelAr: "مفتاح الاسم", labelEn: "Name key", defaultValue: "label" },
    { key: "valueKey", type: "string", labelAr: "مفتاح القيمة", labelEn: "Value key", defaultValue: "value" },
    { key: "donut", type: "boolean", labelAr: "دائرة مفرغة", labelEn: "Donut", defaultValue: true },
  ],
  component: PieChartWidget,
};

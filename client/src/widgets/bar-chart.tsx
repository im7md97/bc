import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import type { WidgetProps, WidgetTypeReg } from "./types";

function BarChartWidget({ instance, data, isLoading, lang }: WidgetProps) {
  const cfg = instance.config;
  const title = lang === "ar" ? (cfg.titleAr ?? "") : (cfg.titleEn ?? "");
  const xKey: string = cfg.xKey ?? "x";
  const yKey: string = cfg.yKey ?? "y";
  const color: string = cfg.color ?? "#3b82f6";

  return (
    <div className="h-full w-full flex flex-col p-3">
      {title && <div className="text-sm font-medium mb-2">{title}</div>}
      <div className="flex-1 min-h-0">
        {isLoading || !data ? (
          <div className="h-full flex items-center justify-center text-muted-foreground text-sm">…</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.rows}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey={xKey} />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey={yKey} fill={color} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

export const barChartDef: WidgetTypeReg = {
  type: "bar-chart",
  labelAr: "رسم أعمدة",
  labelEn: "Bar Chart",
  icon: "BarChart3",
  category: "chart",
  defaultSize: { w: 6, h: 5 },
  needsDataSource: true,
  configSchema: [
    { key: "titleAr", type: "string", labelAr: "العنوان (عربي)", labelEn: "Title (Arabic)" },
    { key: "titleEn", type: "string", labelAr: "العنوان (إنجليزي)", labelEn: "Title (English)" },
    { key: "xKey", type: "string", labelAr: "المحور X", labelEn: "X key", defaultValue: "label" },
    { key: "yKey", type: "string", labelAr: "المحور Y", labelEn: "Y key", defaultValue: "value" },
    { key: "color", type: "color", labelAr: "اللون", labelEn: "Color", defaultValue: "#3b82f6" },
  ],
  component: BarChartWidget,
};

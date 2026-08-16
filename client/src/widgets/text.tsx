import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { WidgetProps, WidgetTypeReg } from "./types";

function TextWidget({ instance, lang }: WidgetProps) {
  const cfg = instance.config;
  const body = lang === "ar" ? (cfg.bodyAr ?? cfg.body ?? "") : (cfg.bodyEn ?? cfg.body ?? "");
  return (
    <div
      className="h-full w-full overflow-auto p-4 prose prose-sm dark:prose-invert max-w-none"
      style={{
        textAlign: cfg.align ?? "start",
        color: cfg.color || undefined,
        background: cfg.background || undefined,
        fontSize: cfg.fontSize ? `${cfg.fontSize}px` : undefined,
      }}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
    </div>
  );
}

export const textDef: WidgetTypeReg = {
  type: "text",
  labelAr: "نص / Markdown",
  labelEn: "Text / Markdown",
  icon: "Type",
  category: "content",
  defaultSize: { w: 4, h: 3 },
  needsDataSource: false,
  configSchema: [
    { key: "bodyAr", type: "textarea", labelAr: "النص (عربي)", labelEn: "Body (Arabic)" },
    { key: "bodyEn", type: "textarea", labelAr: "النص (إنجليزي)", labelEn: "Body (English)" },
    { key: "align", type: "select", labelAr: "المحاذاة", labelEn: "Align", defaultValue: "start",
      options: [
        { value: "start", labelAr: "بداية", labelEn: "Start" },
        { value: "center", labelAr: "وسط", labelEn: "Center" },
        { value: "end", labelAr: "نهاية", labelEn: "End" },
      ] },
    { key: "fontSize", type: "number", labelAr: "حجم الخط", labelEn: "Font size", defaultValue: 14 },
    { key: "color", type: "color", labelAr: "لون النص", labelEn: "Text color" },
    { key: "background", type: "color", labelAr: "لون الخلفية", labelEn: "Background" },
  ],
  component: TextWidget,
};

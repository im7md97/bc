import type { WidgetProps, WidgetTypeReg } from "./types";

function ImageWidget({ instance }: WidgetProps) {
  const cfg = instance.config;
  const url: string = cfg.url ?? "";
  const fit: string = cfg.fit ?? "cover";
  const rounded: boolean = cfg.rounded ?? true;
  if (!url) {
    return <div className="h-full w-full flex items-center justify-center text-muted-foreground text-sm">
      URL?
    </div>;
  }
  return (
    <div className={`h-full w-full overflow-hidden ${rounded ? "rounded-lg" : ""}`}>
      <img src={url} alt={cfg.alt ?? ""} className="w-full h-full" style={{ objectFit: fit as any }} />
    </div>
  );
}

export const imageDef: WidgetTypeReg = {
  type: "image",
  labelAr: "صورة",
  labelEn: "Image",
  icon: "Image",
  category: "content",
  defaultSize: { w: 4, h: 4 },
  needsDataSource: false,
  configSchema: [
    { key: "url", type: "string", labelAr: "رابط الصورة", labelEn: "Image URL" },
    { key: "alt", type: "string", labelAr: "نص بديل", labelEn: "Alt text" },
    { key: "fit", type: "select", labelAr: "أسلوب العرض", labelEn: "Fit", defaultValue: "cover",
      options: [
        { value: "cover", labelAr: "تغطية", labelEn: "Cover" },
        { value: "contain", labelAr: "احتواء", labelEn: "Contain" },
        { value: "fill", labelAr: "تعبئة", labelEn: "Fill" },
      ] },
    { key: "rounded", type: "boolean", labelAr: "زوايا دائرية", labelEn: "Rounded", defaultValue: true },
  ],
  component: ImageWidget,
};

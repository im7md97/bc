import { useLanguage } from "@/contexts/LanguageContext";
import { Settings2, GripVertical } from "lucide-react";
import { useWidgetData } from "@/hooks/use-widget-data";
import type { WidgetInstance } from "@shared/dashboard-v2";
import type { WidgetTypeReg } from "@/widgets/types";

interface Props {
  instance: WidgetInstance;
  widgetDef: WidgetTypeReg;
  editing: boolean;
  onOpenConfig: () => void;
}

export function WidgetFrame({ instance, widgetDef, editing, onOpenConfig }: Props) {
  const { lang } = useLanguage();
  const { data, isLoading, error } = useWidgetData(instance);
  const Component = widgetDef.component;

  return (
    <div className={`h-full w-full bg-card border rounded-lg shadow-sm flex flex-col relative group ${editing ? "overflow-visible" : "overflow-hidden"}`}>
      {editing && (
        <div className="absolute top-1.5 start-1.5 z-20 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onOpenConfig(); }}
            title={lang === "ar" ? "إعدادات" : "Settings"}
            className="widget-action h-7 w-7 inline-flex items-center justify-center rounded-md bg-background/95 backdrop-blur border shadow-sm hover:bg-accent hover:text-accent-foreground"
          >
            <Settings2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title={lang === "ar" ? "اسحب" : "Drag"}
            className="drag-handle h-7 w-7 inline-flex items-center justify-center rounded-md bg-background/95 backdrop-blur border shadow-sm cursor-move hover:bg-accent hover:text-accent-foreground"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      <div className="flex-1 min-h-0">
        <Component
          instance={instance}
          data={data}
          isLoading={isLoading}
          error={error ? String((error as any)?.messageEn ?? error) : undefined}
          lang={lang}
        />
      </div>
    </div>
  );
}

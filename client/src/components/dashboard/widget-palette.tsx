import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Plus, BarChart3, PieChart, Table, Type, Image, TrendingUp } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { WIDGET_LIST } from "@/widgets/registry";
import type { WidgetTypeReg } from "@/widgets/types";

const ICONS: Record<string, any> = {
  TrendingUp, BarChart3, PieChart, Table, Type, Image,
};

interface Props {
  onAdd: (def: WidgetTypeReg) => void;
}

export function WidgetPalette({ onAdd }: Props) {
  const { lang } = useLanguage();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" className="gap-2">
          <Plus className="h-4 w-4" />
          {lang === "ar" ? "إضافة widget" : "Add widget"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2" align={lang === "ar" ? "end" : "start"}>
        <div className="grid grid-cols-2 gap-2">
          {WIDGET_LIST.map((w) => {
            const Icon = ICONS[w.icon] ?? Plus;
            return (
              <button
                key={w.type}
                onClick={() => onAdd(w)}
                className="flex flex-col items-center gap-1 p-3 rounded-md border hover:bg-accent transition-colors text-xs"
              >
                <Icon className="h-5 w-5" />
                <span>{lang === "ar" ? w.labelAr : w.labelEn}</span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

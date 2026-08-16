// Shared widget-facing types. Each widget receives a WidgetProps with its
// instance config + resolved data + a language switcher.

import type { WidgetInstance, WidgetTypeDef } from "@shared/dashboard-v2";

export interface QueryColumn {
  key: string;
  type: "string" | "number" | "date";
  labelAr: string;
  labelEn: string;
}

export interface QueryResult {
  columns: QueryColumn[];
  rows: Record<string, any>[];
}

export interface WidgetProps {
  instance: WidgetInstance;
  data?: QueryResult;
  isLoading: boolean;
  error?: string;
  lang: "ar" | "en";
}

export interface WidgetTypeReg extends WidgetTypeDef {
  component: React.ComponentType<WidgetProps>;
}

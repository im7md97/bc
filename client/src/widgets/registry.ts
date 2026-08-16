// Client-side widget registry. Add a new widget = drop a file in this folder
// and add one line here. No changes to Home.tsx / grid layout / config drawer.
import type { WidgetTypeReg } from "./types";
import { kpiDef } from "./kpi";
import { barChartDef } from "./bar-chart";
import { pieChartDef } from "./pie-chart";
import { tableDef } from "./table";
import { textDef } from "./text";
import { imageDef } from "./image";

export const WIDGET_REGISTRY: Record<string, WidgetTypeReg> = {
  [kpiDef.type]: kpiDef,
  [barChartDef.type]: barChartDef,
  [pieChartDef.type]: pieChartDef,
  [tableDef.type]: tableDef,
  [textDef.type]: textDef,
  [imageDef.type]: imageDef,
};

export const WIDGET_LIST: WidgetTypeReg[] = Object.values(WIDGET_REGISTRY);

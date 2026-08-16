// New dashboard v2 shape: grid layout + widget-type registry + data-source
// registry. Every widget on the page is a "WidgetInstance" that ties a type
// (kpi, bar-chart, table, …) to a saved layout position and per-instance
// config. Data-driven widgets additionally reference a "DataSourceRef" that
// resolves — on the server — to a permission-checked query.

export interface GridPos {
  x: number;    // column index (0..cols-1)
  y: number;    // row index (0..∞)
  w: number;    // width in columns
  h: number;    // height in rows
  minW?: number;
  minH?: number;
}

export interface DataSourceRef {
  source: string;                             // key from server-side registry
  params?: Record<string, string | number | null>;
}

// ─── query-builder shape (used by chart widgets) ─────────────────────────────

export type Aggregation = "count" | "sum" | "avg" | "min" | "max" | "none";
export type FilterOp = "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains" | "is_null" | "not_null";
export type SortDir = "asc" | "desc";

export interface QueryFilter {
  column: string;
  op: FilterOp;
  value?: string | number | null;
}

export interface QuerySpec {
  table: string;
  xColumn?: string;          // Rows
  seriesColumn?: string;     // Columns (secondary grouping)
  yColumn?: string;          // Values column
  aggregation: Aggregation;
  filters: QueryFilter[];
  sort?: SortDir;
  limit?: number;
}

// ─── metric-catalog spec (business KPIs) ─────────────────────────────────────

export interface MetricFilter {
  dimensionKey: string;
  op: FilterOp;
  value?: string | number | null;
}

export interface MetricSpec {
  metric: string;                        // catalog key, e.g. "qc.total_evaluations"
  dimension?: string;                    // catalog dimension key, e.g. "call_month"
  filters: MetricFilter[];
  sort?: SortDir;
  limit?: number;
}

export interface WidgetInstance {
  id: string;
  type: string;                               // key from client-side registry
  layout: GridPos;
  config: Record<string, any>;                // widget-specific settings
  dataSource?: DataSourceRef;                 // legacy — still supported
  query?: QuerySpec;                          // raw pivot spec
  metricSpec?: MetricSpec;                    // curated metric spec (preferred)
  refreshMs?: number;                         // optional auto-refresh
  collapsed?: boolean;
}

export interface DashboardLayout {
  cols: number;                               // grid columns (default 12)
  rowHeight: number;                          // px per grid row
  instances: WidgetInstance[];
}

export const DEFAULT_LAYOUT: DashboardLayout = {
  cols: 12,
  rowHeight: 60,
  instances: [],
};

/** A data source is a curated query on the server. It advertises its params
 *  and required permissions; the client picks it by key. Users NEVER write
 *  raw SQL — this closes the SQL-injection door. */
export interface DataSourceDef {
  key: string;
  labelAr: string;
  labelEn: string;
  requiredPerms: string[];
  params: DataSourceParam[];
  // shape of the returned rows — advertised for widget mapping
  columns: { key: string; type: "string" | "number" | "date"; labelAr: string; labelEn: string }[];
}

export interface DataSourceParam {
  key: string;
  type: "string" | "number" | "month" | "year" | "date" | "select";
  labelAr: string;
  labelEn: string;
  required?: boolean;
  defaultValue?: any;
  options?: { value: string; labelAr: string; labelEn: string }[];
}

export interface WidgetTypeDef {
  type: string;
  labelAr: string;
  labelEn: string;
  icon: string;                                // lucide icon name
  category: "data" | "chart" | "content" | "metric";
  defaultSize: { w: number; h: number };
  minSize?: { w: number; h: number };
  needsDataSource?: boolean;
  configSchema: ConfigField[];
}

export type ConfigField =
  | { key: string; type: "text" | "string"; labelAr: string; labelEn: string; defaultValue?: string }
  | { key: string; type: "color"; labelAr: string; labelEn: string; defaultValue?: string }
  | { key: string; type: "number"; labelAr: string; labelEn: string; defaultValue?: number }
  | { key: string; type: "boolean"; labelAr: string; labelEn: string; defaultValue?: boolean }
  | { key: string; type: "select"; labelAr: string; labelEn: string; options: { value: string; labelAr: string; labelEn: string }[]; defaultValue?: string }
  | { key: string; type: "column"; labelAr: string; labelEn: string; defaultValue?: string }
  | { key: string; type: "textarea"; labelAr: string; labelEn: string; defaultValue?: string };

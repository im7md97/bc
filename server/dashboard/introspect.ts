// Live schema introspection + safe query executor.
//
// Every table and column exposed to the UI is discovered from
// information_schema at runtime — no hardcoded lists. New tables/columns
// appear automatically.
//
// The executor accepts a QueryBuilder spec (table + x + y + aggregation +
// filters + sort + limit), validates every identifier against the introspected
// catalog, then builds a parameterised SQL statement. Users never send raw
// SQL, and identifiers that aren't in the catalog are rejected — closing the
// SQL-injection door.

import { pool } from "../db";

export interface CatalogColumn {
  key: string;             // physical column name
  labelAr: string;
  labelEn: string;
  dataType: string;        // pg type name
  category: "text" | "numeric" | "date" | "boolean" | "other";
}

export interface CatalogTable {
  name: string;
  labelAr: string;
  labelEn: string;
  columns: CatalogColumn[];
}

let CACHED: CatalogTable[] | null = null;
let CACHED_AT = 0;
const TTL_MS = 30_000;

// Tables we hide from the builder. Only session storage — everything else is
// fair game so users see the full data model in the dropdowns.
const HIDDEN_TABLES = new Set<string>([
  "session", "sessions", "__drizzle_migrations",
]);

const NUMERIC_TYPES = new Set([
  "integer", "bigint", "smallint", "numeric", "real", "double precision",
  "decimal", "money",
]);
const DATE_TYPES = new Set([
  "date", "timestamp", "timestamp without time zone", "timestamp with time zone", "time",
]);
const TEXT_TYPES = new Set([
  "text", "character varying", "varchar", "character", "char", "uuid",
]);

function classify(pgType: string): CatalogColumn["category"] {
  if (NUMERIC_TYPES.has(pgType)) return "numeric";
  if (DATE_TYPES.has(pgType)) return "date";
  if (TEXT_TYPES.has(pgType)) return "text";
  if (pgType === "boolean") return "boolean";
  return "other";
}

const ARABIC_LABELS: Record<string, string> = {
  // ── tables ────────────────────────────────────────────────
  users: "المستخدمون", agents: "الموظفون", projects: "المشاريع",
  qc_entries: "تقييمات الجودة", qc_forms: "نماذج الجودة",
  qc_form_sections: "أقسام النماذج", qc_form_items: "بنود النماذج",
  qc_entry_answers: "إجابات التقييم", qc_calibrations: "جلسات المعايرة",
  qc_disputes: "اعتراضات الجودة",
  apr_snapshots: "لقطات APR", apr_rows: "صفوف APR",
  agent_latest_apr: "آخر APR", apr_metric_definitions: "تعريفات APR",
  apr_uploads: "رفعات APR", apr_targets: "أهداف APR",
  scorecards: "بطاقات الأداء", scorecard_metrics: "بنود بطاقة الأداء",
  scorecard_scores: "درجات بطاقة الأداء",
  schedules: "الجداول", schedule_breaks: "البريكات",
  schedule_shifts: "الشفتات", schedule_templates: "قوالب الجداول",
  shift_swap_requests: "طلبات تبادل الشفت",
  attendance: "الحضور", attendance_events: "أحداث الحضور",
  notifications: "الإشعارات", feature_flags: "الخصائص",
  permission_grants: "الصلاحيات", role_permissions: "صلاحيات الأدوار",
  // ── common columns ────────────────────────────────────────
  id: "المعرّف", user_id: "المستخدم", agent_id: "الموظف",
  project_id: "المشروع", supervisor_id: "المشرف",
  reviewer_id: "المُقيِّم", form_id: "النموذج",
  name: "الاسم", full_name: "الاسم الكامل",
  employee_id: "الرقم الوظيفي", role: "الدور", city: "المدينة",
  status: "الحالة", type: "النوع", date: "التاريخ",
  created_at: "تاريخ الإنشاء", updated_at: "تاريخ التحديث",
  submitted_at: "تاريخ الإرسال", approved_at: "تاريخ الاعتماد",
  // qc
  metric_key: "المؤشر", value: "القيمة", score: "الدرجة",
  final_score: "الدرجة النهائية", pass: "نجاح", pass_fail: "نتيجة",
  is_critical: "خطأ حرج", critical_error: "خطأ حرج",
  section_name: "القسم", item_name: "البند", weight: "الوزن",
  answer: "الإجابة", comment: "التعليق", agent_ack: "إقرار الوكيل",
  interaction_id: "رقم التفاعل", interaction_date: "تاريخ التفاعل",
  channel: "القناة", disposition: "الإجراء",
  // apr
  metric: "المؤشر", period: "الفترة",
  target_value: "القيمة المستهدفة", actual_value: "القيمة الفعلية",
  achievement: "التحقق", weight_pct: "الوزن %",
  snapshot_id: "رقم اللقطة", row_id: "رقم الصف",
  uploaded_at: "تاريخ الرفع", uploader_id: "الرافع",
  // schedule
  duration_seconds: "المدة (ث)", duration_minutes: "المدة (د)",
  shift_start: "بداية الشفت", shift_end: "نهاية الشفت",
  break_start: "بداية البريك", break_end: "نهاية البريك",
  break_type: "نوع البريك", is_off: "إجازة",
  week_start: "بداية الأسبوع", month: "الشهر", year: "السنة", day: "اليوم",
  // attendance
  clock_in: "تسجيل الدخول", clock_out: "تسجيل الخروج",
  minutes_late: "دقائق التأخر", absent: "غياب",
  // notifications
  title_ar: "العنوان (ع)", title_en: "العنوان (En)",
  body_ar: "النص (ع)", body_en: "النص (En)",
  read_at: "تاريخ القراءة", link: "الرابط",
};

function label(name: string) {
  return name
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Read information_schema and build a catalog. Cached for 30 seconds so
 *  common lookups are cheap. */
export async function getCatalog(force = false): Promise<CatalogTable[]> {
  const now = Date.now();
  if (!force && CACHED && now - CACHED_AT < TTL_MS) return CACHED;

  const result = await pool.query<{
    table_name: string;
    column_name: string;
    data_type: string;
  }>(`
    SELECT table_name, column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position
  `);

  const byTable = new Map<string, CatalogColumn[]>();
  for (const r of result.rows) {
    if (HIDDEN_TABLES.has(r.table_name)) continue;
    const cols = byTable.get(r.table_name) ?? [];
    cols.push({
      key: r.column_name,
      labelAr: ARABIC_LABELS[r.column_name] ?? label(r.column_name),
      labelEn: label(r.column_name),
      dataType: r.data_type,
      category: classify(r.data_type),
    });
    byTable.set(r.table_name, cols);
  }

  const catalog: CatalogTable[] = Array.from(byTable.entries()).map(([name, columns]) => ({
    name,
    labelAr: ARABIC_LABELS[name] ?? label(name),
    labelEn: label(name),
    columns,
  }));

  CACHED = catalog;
  CACHED_AT = now;
  return catalog;
}

// ─── query executor ─────────────────────────────────────────────────────────

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
  xColumn?: string;           // Rows / group-by
  seriesColumn?: string;      // Columns / secondary group-by
  yColumn?: string;           // Values column
  aggregation: Aggregation;
  filters: QueryFilter[];
  sort?: SortDir;
  limit?: number;             // 0 or missing = no limit
}

function quoteIdent(id: string) {
  // Whitelist already validated the id — this is belt-and-braces.
  return `"${id.replace(/"/g, '""')}"`;
}

/** Build + run the query. Throws with a clear message if any identifier is
 *  not in the catalog. */
export async function runQuery(spec: QuerySpec): Promise<{ rows: { x: any; series?: any; y: any }[] }> {
  const catalog = await getCatalog();
  const tbl = catalog.find((t) => t.name === spec.table);
  if (!tbl) throw new Error(`unknown_table:${spec.table}`);

  const colByKey = new Map(tbl.columns.map((c) => [c.key, c]));
  const requireCol = (key: string) => {
    const c = colByKey.get(key);
    if (!c) throw new Error(`unknown_column:${key}`);
    return c;
  };

  const yCol = spec.yColumn ? requireCol(spec.yColumn) : null;
  const xCol = spec.xColumn ? requireCol(spec.xColumn) : null;
  const sCol = spec.seriesColumn ? requireCol(spec.seriesColumn) : null;

  // ---- SELECT ----
  const params: any[] = [];
  const pph = (v: any) => { params.push(v); return `$${params.length}`; };

  let ySelect: string;
  const agg = spec.aggregation ?? "count";
  if (agg === "count") {
    ySelect = yCol ? `COUNT(${quoteIdent(yCol.key)})` : `COUNT(*)`;
  } else if (yCol) {
    const fn = agg === "avg" ? "AVG" : agg.toUpperCase();
    ySelect = `${fn}(${quoteIdent(yCol.key)}::numeric)`;
  } else {
    throw new Error(`aggregation_needs_y:${agg}`);
  }

  const parts: string[] = [];
  if (xCol) parts.push(`${quoteIdent(xCol.key)} AS "x"`);
  else parts.push(`'total' AS "x"`);
  if (sCol) parts.push(`${quoteIdent(sCol.key)} AS "series"`);
  parts.push(`${ySelect} AS "y"`);

  let sqlStr = `SELECT ${parts.join(", ")} FROM ${quoteIdent(tbl.name)}`;

  // ---- WHERE ----
  const whereParts: string[] = [];
  for (const f of spec.filters ?? []) {
    const c = requireCol(f.column);
    const id = quoteIdent(c.key);
    switch (f.op) {
      case "eq":       whereParts.push(`${id} = ${pph(f.value)}`); break;
      case "neq":      whereParts.push(`${id} <> ${pph(f.value)}`); break;
      case "gt":       whereParts.push(`${id} > ${pph(f.value)}`); break;
      case "gte":      whereParts.push(`${id} >= ${pph(f.value)}`); break;
      case "lt":       whereParts.push(`${id} < ${pph(f.value)}`); break;
      case "lte":      whereParts.push(`${id} <= ${pph(f.value)}`); break;
      case "contains": whereParts.push(`${id}::text ILIKE ${pph(`%${f.value}%`)}`); break;
      case "is_null":  whereParts.push(`${id} IS NULL`); break;
      case "not_null": whereParts.push(`${id} IS NOT NULL`); break;
    }
  }
  if (whereParts.length) sqlStr += ` WHERE ${whereParts.join(" AND ")}`;

  // ---- GROUP BY / ORDER BY / LIMIT ----
  if (agg !== "none") {
    const groupCols: string[] = [];
    if (xCol) groupCols.push(quoteIdent(xCol.key));
    if (sCol) groupCols.push(quoteIdent(sCol.key));
    if (groupCols.length) sqlStr += ` GROUP BY ${groupCols.join(", ")}`;
  }
  if (spec.sort) sqlStr += ` ORDER BY "y" ${spec.sort === "asc" ? "ASC" : "DESC"}`;
  if (spec.limit && spec.limit > 0) sqlStr += ` LIMIT ${Math.min(10000, Math.floor(spec.limit))}`;

  const result = await pool.query(sqlStr, params);
  return {
    rows: result.rows.map((r: any) => ({
      x: r.x, series: r.series, y: Number(r.y),
    })),
  };
}

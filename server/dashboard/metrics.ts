// Business-metric catalog. Each metric is a *computed* KPI over the site's
// operational data (QC, APR, Scorecard, Schedule, Attendance) rather than a
// raw column. Every metric declares:
//
//   • baseSql   — the FROM/JOIN chain
//   • ySql      — the aggregation expression that becomes the "y" value
//   • dimensions — a whitelist of group-by dimensions this metric accepts,
//                   each with its own SQL expression + label
//
// This gives users a semantic layer: "متوسط تقييم الجودة حسب الشهر" instead
// of picking raw columns off qc_entries.
//
// New metric = one entry in METRICS. New dimension = one entry in the metric's
// dimensions map. No changes to the query endpoint or the client.

import { pool } from "../db";

export type Category = "qc" | "apr" | "scorecard" | "schedule" | "attendance";

export interface MetricDimension {
  key: string;
  labelAr: string;
  labelEn: string;
  /** Raw SQL expression evaluated against the metric's baseSql context. */
  sqlExpr: string;
}

export interface MetricDef {
  key: string;
  labelAr: string;
  labelEn: string;
  category: Category;
  /** The FROM (+ optional JOINs) that ySql/dimensions are evaluated against. */
  baseSql: string;
  /** Aggregation expression that becomes "y". */
  ySql: string;
  /** Optional static WHERE. Runtime filters are AND-ed on top. */
  whereSql?: string;
  dimensions: MetricDimension[];
  /** Column category — used by the UI to pick a suitable default chart type. */
  format?: "integer" | "percent" | "decimal";
}

// ────────────────────────────────────────────────────────────────────────────
// Common dimensions reused across metrics.
// ────────────────────────────────────────────────────────────────────────────

const DIM_AGENT_NAME_AR: MetricDimension = {
  key: "agent_name_ar", labelAr: "اسم الموظف (عربي)", labelEn: "Agent (Arabic)",
  sqlExpr: "a.name_ar",
};
const DIM_AGENT_NAME_EN: MetricDimension = {
  key: "agent_name_en", labelAr: "اسم الموظف (إنجليزي)", labelEn: "Agent (English)",
  sqlExpr: "a.name_en",
};
const DIM_PROJECT: MetricDimension = {
  key: "project", labelAr: "المشروع", labelEn: "Project",
  sqlExpr: "p.name",
};
const DIM_SUPERVISOR: MetricDimension = {
  key: "supervisor", labelAr: "المشرف", labelEn: "Supervisor",
  sqlExpr: "COALESCE(sup.full_name, '—')",
};

// ────────────────────────────────────────────────────────────────────────────
// METRICS
// ────────────────────────────────────────────────────────────────────────────

export const METRICS: MetricDef[] = [
  // ═══ QC ═════════════════════════════════════════════════════════════════
  {
    key: "qc.total_evaluations",
    labelAr: "إجمالي التقييمات",
    labelEn: "Total QC evaluations",
    category: "qc",
    format: "integer",
    baseSql: `qc_entries qc
              JOIN agents a ON a.id = qc.agent_id
              JOIN projects p ON p.id = a.project_id
              LEFT JOIN users sup ON sup.id = a.supervisor_user_id`,
    ySql: "COUNT(*)",
    dimensions: [
      DIM_AGENT_NAME_AR, DIM_AGENT_NAME_EN, DIM_PROJECT, DIM_SUPERVISOR,
      { key: "status",    labelAr: "الحالة", labelEn: "Status", sqlExpr: "qc.status" },
      { key: "call_date", labelAr: "تاريخ المكالمة", labelEn: "Call date", sqlExpr: "qc.call_date" },
      { key: "call_month", labelAr: "الشهر", labelEn: "Month", sqlExpr: "to_char(qc.call_date::date, 'YYYY-MM')" },
      { key: "action_required", labelAr: "الإجراء المطلوب", labelEn: "Action required", sqlExpr: "qc.action_required" },
      { key: "defect_reason",   labelAr: "سبب الخطأ",       labelEn: "Defect reason",   sqlExpr: "qc.defect_reason" },
    ],
  },
  {
    key: "qc.pass_count",
    labelAr: "عدد التقييمات الناجحة (داخلي)",
    labelEn: "Passed evaluations (internal)",
    category: "qc",
    format: "integer",
    baseSql: `qc_entries qc
              JOIN agents a ON a.id = qc.agent_id
              JOIN projects p ON p.id = a.project_id
              LEFT JOIN users sup ON sup.id = a.supervisor_user_id`,
    whereSql: "qc.quality_internal ILIKE 'pass%' OR qc.quality_internal = 'ناجح'",
    ySql: "COUNT(*)",
    dimensions: [
      DIM_AGENT_NAME_AR, DIM_AGENT_NAME_EN, DIM_PROJECT, DIM_SUPERVISOR,
      { key: "call_month", labelAr: "الشهر", labelEn: "Month", sqlExpr: "to_char(qc.call_date::date, 'YYYY-MM')" },
    ],
  },
  {
    key: "qc.critical_error_accuracy",
    labelAr: "دقة الأخطاء الحرجة %",
    labelEn: "Critical error accuracy %",
    category: "qc",
    format: "percent",
    baseSql: `qc_entries qc
              JOIN agents a ON a.id = qc.agent_id
              JOIN projects p ON p.id = a.project_id
              LEFT JOIN users sup ON sup.id = a.supervisor_user_id`,
    ySql: `100.0 * SUM(CASE WHEN qc.defect_reason IN ('none','no_defect','لا يوجد') THEN 1 ELSE 0 END) / NULLIF(COUNT(*),0)`,
    dimensions: [
      DIM_AGENT_NAME_AR, DIM_AGENT_NAME_EN, DIM_PROJECT, DIM_SUPERVISOR,
      { key: "call_month", labelAr: "الشهر", labelEn: "Month", sqlExpr: "to_char(qc.call_date::date, 'YYYY-MM')" },
    ],
  },
  {
    key: "qc.pending_count",
    labelAr: "التقييمات المعلّقة",
    labelEn: "Pending QC evaluations",
    category: "qc",
    format: "integer",
    baseSql: `qc_entries qc
              JOIN agents a ON a.id = qc.agent_id
              JOIN projects p ON p.id = a.project_id`,
    whereSql: "qc.status LIKE 'pending%'",
    ySql: "COUNT(*)",
    dimensions: [
      DIM_AGENT_NAME_AR, DIM_PROJECT,
      { key: "status", labelAr: "الحالة", labelEn: "Status", sqlExpr: "qc.status" },
    ],
  },

  // ═══ SCORECARD ═══════════════════════════════════════════════════════════
  {
    key: "sc.total_scorecards",
    labelAr: "إجمالي بطاقات الأداء",
    labelEn: "Total scorecards",
    category: "scorecard",
    format: "integer",
    baseSql: `score_cards sc
              JOIN agents a ON a.id = sc.agent_id
              JOIN projects p ON p.id = a.project_id
              LEFT JOIN users sup ON sup.id = a.supervisor_user_id`,
    ySql: "COUNT(*)",
    dimensions: [
      DIM_AGENT_NAME_AR, DIM_AGENT_NAME_EN, DIM_PROJECT, DIM_SUPERVISOR,
      { key: "status", labelAr: "الحالة", labelEn: "Status", sqlExpr: "sc.status" },
      { key: "period", labelAr: "الشهر",  labelEn: "Period",
        sqlExpr: "sc.period_year || '-' || LPAD(sc.period_month::text, 2, '0')" },
      { key: "year",   labelAr: "السنة",  labelEn: "Year",  sqlExpr: "sc.period_year::text" },
    ],
  },
  {
    key: "sc.avg_final_score",
    labelAr: "متوسط الدرجة النهائية",
    labelEn: "Average final score",
    category: "scorecard",
    format: "decimal",
    baseSql: `score_cards sc
              JOIN agents a ON a.id = sc.agent_id
              JOIN projects p ON p.id = a.project_id
              LEFT JOIN users sup ON sup.id = a.supervisor_user_id`,
    whereSql: "sc.final_score IS NOT NULL",
    ySql: "AVG(sc.final_score::numeric)",
    dimensions: [
      DIM_AGENT_NAME_AR, DIM_AGENT_NAME_EN, DIM_PROJECT, DIM_SUPERVISOR,
      { key: "period", labelAr: "الشهر", labelEn: "Period",
        sqlExpr: "sc.period_year || '-' || LPAD(sc.period_month::text, 2, '0')" },
    ],
  },
  {
    key: "sc.confirmed_count",
    labelAr: "بطاقات الأداء المعتمدة",
    labelEn: "Confirmed scorecards",
    category: "scorecard",
    format: "integer",
    baseSql: `score_cards sc
              JOIN agents a ON a.id = sc.agent_id
              JOIN projects p ON p.id = a.project_id`,
    whereSql: "sc.status = 'confirmed'",
    ySql: "COUNT(*)",
    dimensions: [
      DIM_AGENT_NAME_AR, DIM_PROJECT,
      { key: "period", labelAr: "الشهر", labelEn: "Period",
        sqlExpr: "sc.period_year || '-' || LPAD(sc.period_month::text, 2, '0')" },
    ],
  },

  // ═══ APR ═════════════════════════════════════════════════════════════════
  {
    key: "apr.total_snapshots",
    labelAr: "إجمالي لقطات APR",
    labelEn: "Total APR snapshots",
    category: "apr",
    format: "integer",
    baseSql: `apr_snapshots snap
              JOIN projects p ON p.id = snap.project_id
              LEFT JOIN users u ON u.id = snap.uploaded_by_user_id`,
    ySql: "COUNT(*)",
    dimensions: [
      DIM_PROJECT,
      { key: "as_of_date", labelAr: "تاريخ اللقطة", labelEn: "As-of date", sqlExpr: "snap.as_of_date::text" },
      { key: "month", labelAr: "الشهر", labelEn: "Month", sqlExpr: "to_char(snap.as_of_date::date, 'YYYY-MM')" },
      { key: "uploader", labelAr: "الرافع", labelEn: "Uploader", sqlExpr: "COALESCE(u.full_name, '—')" },
    ],
  },
  {
    key: "apr.total_rows",
    labelAr: "إجمالي صفوف APR",
    labelEn: "Total APR rows",
    category: "apr",
    format: "integer",
    baseSql: `apr_rows ar
              JOIN apr_snapshots snap ON snap.id = ar.snapshot_id
              JOIN projects p ON p.id = snap.project_id
              JOIN agents a ON a.id = ar.agent_id`,
    ySql: "COUNT(*)",
    dimensions: [
      DIM_AGENT_NAME_AR, DIM_PROJECT,
      { key: "as_of_date", labelAr: "تاريخ اللقطة", labelEn: "As-of date", sqlExpr: "snap.as_of_date::text" },
      { key: "month", labelAr: "الشهر", labelEn: "Month", sqlExpr: "to_char(snap.as_of_date::date, 'YYYY-MM')" },
    ],
  },
  {
    key: "apr.avg_agent_count",
    labelAr: "متوسط عدد الموظفين في اللقطة",
    labelEn: "Average agents per snapshot",
    category: "apr",
    format: "decimal",
    baseSql: `apr_snapshots snap
              JOIN projects p ON p.id = snap.project_id`,
    ySql: "AVG(snap.row_count::numeric)",
    dimensions: [
      DIM_PROJECT,
      { key: "month", labelAr: "الشهر", labelEn: "Month", sqlExpr: "to_char(snap.as_of_date::date, 'YYYY-MM')" },
    ],
  },

  // ═══ ATTENDANCE ══════════════════════════════════════════════════════════
  {
    key: "att.present_count",
    labelAr: "عدد الحضور",
    labelEn: "Present count",
    category: "attendance",
    format: "integer",
    baseSql: `attendance att
              JOIN agents a ON a.id = att.agent_id
              JOIN projects p ON p.id = a.project_id`,
    whereSql: "att.status = 'present'",
    ySql: "COUNT(*)",
    dimensions: [
      DIM_AGENT_NAME_AR, DIM_PROJECT,
      { key: "date",  labelAr: "التاريخ", labelEn: "Date",  sqlExpr: "att.date" },
      { key: "month", labelAr: "الشهر",   labelEn: "Month", sqlExpr: "to_char(att.date::date, 'YYYY-MM')" },
    ],
  },
  {
    key: "att.absent_count",
    labelAr: "عدد الغياب",
    labelEn: "Absent count",
    category: "attendance",
    format: "integer",
    baseSql: `attendance att
              JOIN agents a ON a.id = att.agent_id
              JOIN projects p ON p.id = a.project_id`,
    whereSql: "att.status = 'absent'",
    ySql: "COUNT(*)",
    dimensions: [
      DIM_AGENT_NAME_AR, DIM_PROJECT,
      { key: "date",  labelAr: "التاريخ", labelEn: "Date",  sqlExpr: "att.date" },
      { key: "month", labelAr: "الشهر",   labelEn: "Month", sqlExpr: "to_char(att.date::date, 'YYYY-MM')" },
    ],
  },
  {
    key: "att.late_count",
    labelAr: "عدد المتأخرين",
    labelEn: "Late count",
    category: "attendance",
    format: "integer",
    baseSql: `attendance att
              JOIN agents a ON a.id = att.agent_id
              JOIN projects p ON p.id = a.project_id`,
    whereSql: "att.status = 'late'",
    ySql: "COUNT(*)",
    dimensions: [
      DIM_AGENT_NAME_AR, DIM_PROJECT,
      { key: "date",  labelAr: "التاريخ", labelEn: "Date",  sqlExpr: "att.date" },
      { key: "month", labelAr: "الشهر",   labelEn: "Month", sqlExpr: "to_char(att.date::date, 'YYYY-MM')" },
    ],
  },
  {
    key: "att.attendance_rate",
    labelAr: "نسبة الحضور %",
    labelEn: "Attendance rate %",
    category: "attendance",
    format: "percent",
    baseSql: `attendance att
              JOIN agents a ON a.id = att.agent_id
              JOIN projects p ON p.id = a.project_id`,
    ySql: `100.0 * SUM(CASE WHEN att.status = 'present' THEN 1 ELSE 0 END) / NULLIF(COUNT(*),0)`,
    dimensions: [
      DIM_AGENT_NAME_AR, DIM_PROJECT,
      { key: "month", labelAr: "الشهر", labelEn: "Month", sqlExpr: "to_char(att.date::date, 'YYYY-MM')" },
    ],
  },

  // ═══ SCHEDULE / WFM ══════════════════════════════════════════════════════
  {
    key: "sched.agent_count",
    labelAr: "عدد الموظفين المجدولين",
    labelEn: "Scheduled agents",
    category: "schedule",
    format: "integer",
    baseSql: `schedules s
              JOIN agents a ON a.id = s.agent_id
              JOIN projects p ON p.id = a.project_id`,
    ySql: "COUNT(DISTINCT s.agent_id)",
    dimensions: [
      DIM_PROJECT,
      { key: "week_start", labelAr: "الأسبوع", labelEn: "Week", sqlExpr: "s.week_start" },
    ],
  },
  {
    key: "sched.swap_requests",
    labelAr: "طلبات تبديل الشفت",
    labelEn: "Shift swap requests",
    category: "schedule",
    format: "integer",
    baseSql: `shift_swap_requests sw
              JOIN agents a ON a.id = sw.requester_agent_id
              JOIN projects p ON p.id = a.project_id`,
    ySql: "COUNT(*)",
    dimensions: [
      DIM_PROJECT,
      { key: "status",     labelAr: "الحالة",    labelEn: "Status",     sqlExpr: "sw.status" },
      { key: "week_start", labelAr: "الأسبوع",  labelEn: "Week",       sqlExpr: "sw.week_start" },
      { key: "requester",  labelAr: "الطالب",    labelEn: "Requester",   sqlExpr: "a.name_ar" },
    ],
  },
];

// ────────────────────────────────────────────────────────────────────────────
// Runtime filters — user picks a dimension by key + operator + value.
// ────────────────────────────────────────────────────────────────────────────

export type FilterOp = "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains" | "is_null" | "not_null";
export type SortDir = "asc" | "desc";

export interface MetricFilter {
  dimensionKey: string;
  op: FilterOp;
  value?: string | number | null;
}

export interface MetricRunSpec {
  metric: string;
  dimension?: string;
  filters?: MetricFilter[];
  sort?: SortDir;
  limit?: number;
}

/** Look up + execute a metric. All identifiers are drawn from the catalog, so
 *  no user-supplied SQL reaches the DB. Values go through parameter binding. */
export async function runMetric(spec: MetricRunSpec): Promise<{ rows: { x: any; y: any }[] }> {
  const metric = METRICS.find((m) => m.key === spec.metric);
  if (!metric) throw new Error(`unknown_metric:${spec.metric}`);

  const dim = spec.dimension
    ? metric.dimensions.find((d) => d.key === spec.dimension)
    : null;
  if (spec.dimension && !dim) throw new Error(`unknown_dimension:${spec.dimension}`);

  const params: any[] = [];
  const pph = (v: any) => { params.push(v); return `$${params.length}`; };

  const parts: string[] = [];
  parts.push(dim ? `${dim.sqlExpr} AS "x"` : `'total' AS "x"`);
  parts.push(`${metric.ySql} AS "y"`);

  let sqlStr = `SELECT ${parts.join(", ")} FROM ${metric.baseSql}`;

  const whereParts: string[] = [];
  if (metric.whereSql) whereParts.push(`(${metric.whereSql})`);
  for (const f of spec.filters ?? []) {
    const d = metric.dimensions.find((x) => x.key === f.dimensionKey);
    if (!d) throw new Error(`unknown_filter_dimension:${f.dimensionKey}`);
    const expr = `(${d.sqlExpr})`;
    switch (f.op) {
      case "eq":       whereParts.push(`${expr} = ${pph(f.value)}`); break;
      case "neq":      whereParts.push(`${expr} <> ${pph(f.value)}`); break;
      case "gt":       whereParts.push(`${expr} > ${pph(f.value)}`); break;
      case "gte":      whereParts.push(`${expr} >= ${pph(f.value)}`); break;
      case "lt":       whereParts.push(`${expr} < ${pph(f.value)}`); break;
      case "lte":      whereParts.push(`${expr} <= ${pph(f.value)}`); break;
      case "contains": whereParts.push(`${expr}::text ILIKE ${pph(`%${f.value}%`)}`); break;
      case "is_null":  whereParts.push(`${expr} IS NULL`); break;
      case "not_null": whereParts.push(`${expr} IS NOT NULL`); break;
    }
  }
  if (whereParts.length) sqlStr += ` WHERE ${whereParts.join(" AND ")}`;
  if (dim) sqlStr += ` GROUP BY ${dim.sqlExpr}`;
  if (spec.sort) sqlStr += ` ORDER BY "y" ${spec.sort === "asc" ? "ASC" : "DESC"}`;
  if (spec.limit && spec.limit > 0) sqlStr += ` LIMIT ${Math.min(10000, Math.floor(spec.limit))}`;

  const result = await pool.query(sqlStr, params);
  return { rows: result.rows.map((r: any) => ({ x: r.x, y: Number(r.y) })) };
}

/** Public catalog shape for the client. */
export function publicCatalog() {
  return {
    metrics: METRICS.map((m) => ({
      key: m.key,
      labelAr: m.labelAr,
      labelEn: m.labelEn,
      category: m.category,
      format: m.format ?? "integer",
      dimensions: m.dimensions.map((d) => ({
        key: d.key, labelAr: d.labelAr, labelEn: d.labelEn,
      })),
    })),
    categories: [
      { key: "qc",          labelAr: "الجودة",         labelEn: "Quality" },
      { key: "apr",         labelAr: "APR",           labelEn: "APR" },
      { key: "scorecard",   labelAr: "بطاقة الأداء",   labelEn: "Scorecard" },
      { key: "schedule",    labelAr: "الجداول",        labelEn: "Schedule" },
      { key: "attendance",  labelAr: "الحضور",         labelEn: "Attendance" },
    ],
  };
}

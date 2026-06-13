import type { ScoreTier } from "./schema";

// ─── Default APR metric definitions (§4.5) ───────────────────────────────────
// Seeded for every new project; WFM can edit labels/visibility/mapping later.

export interface DefaultAprMetric {
  key: string;
  labelAr: string;
  labelEn: string;
  valueType: "number" | "percent" | "duration_text" | "duration_seconds" | "integer";
  excelHeader: string;
}

export const DEFAULT_APR_METRICS: DefaultAprMetric[] = [
  { key: "inbound_calls",  labelAr: "المكالمات الواردة",      labelEn: "Inbound Calls",      valueType: "integer",          excelHeader: "Inbound Calls" },
  { key: "outbound_calls", labelAr: "المكالمات الصادرة",      labelEn: "Outbound Calls",     valueType: "integer",          excelHeader: "Outbound Calls" },
  { key: "ticket_handled", labelAr: "التذاكر المعالجة",       labelEn: "Ticket Handled",     valueType: "integer",          excelHeader: "Ticket Handled" },
  { key: "aht",            labelAr: "متوسط زمن المعالجة",     labelEn: "AHT",                valueType: "duration_seconds", excelHeader: "AHT" },
  { key: "talk_time",      labelAr: "زمن التحدث",             labelEn: "Talk Time",          valueType: "duration_seconds", excelHeader: "Talk Time" },
  { key: "hold_time",      labelAr: "زمن الانتظار",           labelEn: "Hold Time",          valueType: "duration_seconds", excelHeader: "Hold Time" },
  { key: "acw_time",       labelAr: "زمن ما بعد المكالمة",    labelEn: "ACW Time",           valueType: "duration_seconds", excelHeader: "ACW Time" },
  { key: "avg_staff_time", labelAr: "متوسط وقت الموظف",       labelEn: "Average Staff Time", valueType: "duration_seconds", excelHeader: "Average Staff Time" },
  { key: "net_login",      labelAr: "صافي تسجيل الدخول",      labelEn: "Net Login",          valueType: "duration_seconds", excelHeader: "Net Login" },
  { key: "break_time",     labelAr: "وقت الاستراحة",          labelEn: "Break Time",         valueType: "duration_seconds", excelHeader: "Break Time" },
  { key: "c_sat",          labelAr: "رضا العملاء",            labelEn: "C-SAT",              valueType: "percent",          excelHeader: "C-SAT" },
  { key: "d_sat",          labelAr: "عدم رضا العملاء",        labelEn: "D-SAT",              valueType: "percent",          excelHeader: "D-SAT" },
  { key: "tagging",        labelAr: "التصنيف",                labelEn: "Tagging",            valueType: "percent",          excelHeader: "Tagging" },
  { key: "schedule",       labelAr: "ساعات الجدول",           labelEn: "Schedule",           valueType: "duration_seconds", excelHeader: "Schedule" },
  { key: "present",        labelAr: "أيام الحضور",            labelEn: "Present",            valueType: "integer",          excelHeader: "Present" },
  { key: "absent",         labelAr: "أيام الغياب",            labelEn: "Absent",             valueType: "integer",          excelHeader: "Absent" },
  { key: "absent_percent", labelAr: "نسبة الغياب",            labelEn: "Absent %",           valueType: "percent",          excelHeader: "Absent %" },
  { key: "total_non_adh",  labelAr: "إجمالي عدم الالتزام",    labelEn: "Total Non Adh",      valueType: "number",           excelHeader: "Total Non Adh" },
];

// ─── Default Score Card grid (§8.6) ──────────────────────────────────────────
// Tier evaluation rule (uniform for both directions): bands are checked in
// order; the first band where value < max (or <= when maxInclusive) wins; the
// final band has no max and is the catch-all.

export interface DefaultGridConfig {
  metricKey: string;
  labelAr: string;
  labelEn: string;
  weight: string;                  // numeric column → string
  scoringType: "tiered" | "binary";
  tierDirection: "higher_better" | "lower_better";
  tiers: ScoreTier[] | null;
  binaryThreshold: string | null;
  binaryDirection: "gte" | "lte" | null;
  aggregation: "average" | "sum";
  sourceMetricKey: string | null;  // APR metric feeding this line (null = derived/manual)
}

export const DEFAULT_GRID_CONFIGS: DefaultGridConfig[] = [
  {
    metricKey: "net_login_pct", labelAr: "صافي ساعات الدخول", labelEn: "Net Login (Hrs)",
    weight: "0.1500", scoringType: "tiered", tierDirection: "higher_better",
    tiers: [
      { max: 0.96, maxInclusive: true, score: 0.2 },
      { max: 0.97, maxInclusive: true, score: 0.4 },
      { max: 0.98, maxInclusive: true, score: 0.6 },
      { max: 1.0, score: 0.8 },
      { score: 1.0 },
    ],
    binaryThreshold: null, binaryDirection: null, aggregation: "average", sourceMetricKey: null,
  },
  {
    metricKey: "attendance_pct", labelAr: "الحضور", labelEn: "Attendance",
    weight: "0.1500", scoringType: "tiered", tierDirection: "higher_better",
    tiers: [
      { max: 0.85, score: 0.2 },
      { max: 0.9, score: 0.4 },
      { max: 0.95, score: 0.6 },
      { max: 1.0, score: 0.8 },
      { score: 1.0 },
    ],
    binaryThreshold: null, binaryDirection: null, aggregation: "average", sourceMetricKey: null,
  },
  {
    metricKey: "aht_seconds", labelAr: "متوسط زمن المعالجة", labelEn: "Average Handle Time (AHT)",
    weight: "0.1000", scoringType: "tiered", tierDirection: "lower_better",
    tiers: [
      { max: 175, maxInclusive: true, score: 1.0 },
      { max: 190, maxInclusive: true, score: 0.8 },
      { max: 205, maxInclusive: true, score: 0.6 },
      { max: 220, maxInclusive: true, score: 0.4 },
      { score: 0.2 },
    ],
    binaryThreshold: null, binaryDirection: null, aggregation: "average", sourceMetricKey: "aht",
  },
  {
    metricKey: "fcr_pct", labelAr: "حل المكالمة من أول مرة", labelEn: "First Call Resolution",
    weight: "0.1000", scoringType: "tiered", tierDirection: "higher_better",
    tiers: [
      { max: 0.6, score: 0.2 },
      { max: 0.65, score: 0.4 },
      { max: 0.7, score: 0.6 },
      { max: 0.75, score: 0.8 },
      { score: 1.0 },
    ],
    binaryThreshold: null, binaryDirection: null, aggregation: "average", sourceMetricKey: null,
  },
  {
    metricKey: "tagging_pct", labelAr: "التصنيف", labelEn: "Tagging",
    weight: "0.1000", scoringType: "tiered", tierDirection: "higher_better",
    tiers: [
      { max: 0.9, score: 0.2 },
      { max: 0.92, score: 0.4 },
      { max: 0.94, score: 0.6 },
      { max: 0.96, score: 0.8 },
      { score: 1.0 },
    ],
    binaryThreshold: null, binaryDirection: null, aggregation: "average", sourceMetricKey: "tagging",
  },
  {
    metricKey: "csat_pct", labelAr: "رضا العملاء", labelEn: "CSAT",
    weight: "0.1000", scoringType: "tiered", tierDirection: "higher_better",
    tiers: [
      { max: 0.75, score: 0.2 },
      { max: 0.85, score: 0.4 },
      { max: 0.9, score: 0.6 },
      { max: 0.95, score: 0.8 },
      { score: 1.0 },
    ],
    binaryThreshold: null, binaryDirection: null, aggregation: "average", sourceMetricKey: "c_sat",
  },
  {
    metricKey: "customer_critical_pct", labelAr: "دقة الأخطاء الحرجة للعميل", labelEn: "Customer Critical Error Accuracy",
    weight: "0.1000", scoringType: "binary", tierDirection: "higher_better",
    tiers: null, binaryThreshold: "0.95", binaryDirection: "gte", aggregation: "average", sourceMetricKey: null,
  },
  {
    metricKey: "business_critical_pct", labelAr: "دقة الأخطاء الحرجة للأعمال", labelEn: "Business Critical Error Accuracy",
    weight: "0.1000", scoringType: "binary", tierDirection: "higher_better",
    tiers: null, binaryThreshold: "0.90", binaryDirection: "gte", aggregation: "average", sourceMetricKey: null,
  },
  {
    metricKey: "compliance_critical_pct", labelAr: "دقة أخطاء الالتزام الحرجة", labelEn: "Compliance Critical Error Accuracy",
    weight: "0.1000", scoringType: "binary", tierDirection: "higher_better",
    tiers: null, binaryThreshold: "0.995", binaryDirection: "gte", aggregation: "average", sourceMetricKey: null,
  },
];

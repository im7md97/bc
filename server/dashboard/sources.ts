// Data source registry. Every source declares:
//   - required permissions (checked before execute)
//   - params it accepts (validated before execute)
//   - the columns it returns (advertised to widgets)
//   - execute() — a plain function that runs a Drizzle query.
//
// Adding a new source = drop a new object in SOURCES. No changes to the
// query endpoint, no changes to widgets.

import { db } from "../db";
import {
  agents, aprSnapshots, aprRows, agentLatestApr, aprMetricDefinitions,
  qcEntries, notifications, schedules, attendance,
} from "@shared/schema";
import type { DataSourceDef } from "@shared/dashboard-v2";
import { eq, desc, and, gte, lte, inArray, sql } from "drizzle-orm";
import type { SessionUser } from "../auth";

export interface QueryContext {
  user: SessionUser;
  grants: Set<string>;
  scopedAgentIds: number[];  // agents the caller may see
}

export interface DataSourceImpl {
  def: DataSourceDef;
  execute: (ctx: QueryContext, params: Record<string, any>) => Promise<Record<string, any>[]>;
}

// ─── Source 1: latest APR metric for scoped agents ──────────────────────────

const aprLatestMetric: DataSourceImpl = {
  def: {
    key: "apr.latest_metric",
    labelAr: "آخر قيمة APR لكل وكيل",
    labelEn: "Latest APR value per agent",
    requiredPerms: ["apr.view_own", "apr.view_team", "apr.view_project", "apr.view_all"],
    params: [
      {
        key: "metricKey", type: "select",
        labelAr: "المقياس", labelEn: "Metric",
        required: true,
        options: [],   // filled in dynamically below
      },
    ],
    columns: [
      { key: "agentName", type: "string", labelAr: "الوكيل", labelEn: "Agent" },
      { key: "value", type: "number", labelAr: "القيمة", labelEn: "Value" },
      { key: "asOfDate", type: "date", labelAr: "التاريخ", labelEn: "As of" },
    ],
  },
  async execute(ctx, params) {
    if (ctx.scopedAgentIds.length === 0) return [];
    const metricKey = String(params.metricKey ?? "");
    if (!metricKey) return [];
    const latest = await db.select().from(agentLatestApr)
      .where(inArray(agentLatestApr.agentId, ctx.scopedAgentIds));
    const rowIds = latest.map((l) => l.rowId);
    if (rowIds.length === 0) return [];
    const rows = await db.select().from(aprRows).where(inArray(aprRows.id, rowIds));
    const rowById = new Map(rows.map((r) => [r.id, r]));
    const agentsRows = await db.select().from(agents).where(inArray(agents.id, ctx.scopedAgentIds));
    const agentById = new Map(agentsRows.map((a) => [a.id, a]));
    return latest.map((l) => ({
      agentName: agentById.get(l.agentId)?.nameAr ?? "—",
      value: Number((rowById.get(l.rowId)?.metrics as any)?.[metricKey] ?? 0),
      asOfDate: l.asOfDate,
    }));
  },
};

// ─── Source 2: monthly QC pass/fail counts ──────────────────────────────────

const qcMonthlyStats: DataSourceImpl = {
  def: {
    key: "qc.monthly_stats",
    labelAr: "إحصاءات الجودة الشهرية",
    labelEn: "Monthly QC counts",
    requiredPerms: ["qc.view_own", "qc.evaluate", "qc.approve", "qc.approve_team"],
    params: [
      { key: "year", type: "year", labelAr: "السنة", labelEn: "Year", defaultValue: new Date().getFullYear() },
      { key: "month", type: "month", labelAr: "الشهر", labelEn: "Month", defaultValue: new Date().getMonth() + 1 },
    ],
    columns: [
      { key: "label", type: "string", labelAr: "الحالة", labelEn: "Status" },
      { key: "count", type: "number", labelAr: "العدد", labelEn: "Count" },
    ],
  },
  async execute(ctx, params) {
    const year = Number(params.year) || new Date().getFullYear();
    const month = Number(params.month) || new Date().getMonth() + 1;
    const prefix = `${year}-${String(month).padStart(2, "0")}`;
    // Scope by role — we replicate scopedEntries lightly here for simplicity.
    const grants = ctx.grants;
    let entries = await db.select().from(qcEntries);
    if (!grants.has("qc.approve")) {
      if (grants.has("qc.approve_team")) {
        const teamAgents = ctx.scopedAgentIds;
        entries = entries.filter((e) => teamAgents.includes(e.agentId));
      } else if (grants.has("qc.evaluate")) {
        entries = entries.filter((e) => e.createdByUserId === ctx.user.id);
      } else if (grants.has("qc.view_own")) {
        entries = entries.filter((e) => ctx.scopedAgentIds.includes(e.agentId) && e.status === "approved");
      } else {
        entries = [];
      }
    }
    entries = entries.filter((e) => (e.callDate ?? "").startsWith(prefix));
    return [
      { label: "approved", count: entries.filter((e) => e.status === "approved").length },
      { label: "rejected", count: entries.filter((e) => e.status === "rejected").length },
      { label: "pending", count: entries.filter((e) => e.status === "pending_supervisor").length },
    ];
  },
};

// ─── Source 3: QC pass-rate trend by month (last N months) ──────────────────

const qcPassRateTrend: DataSourceImpl = {
  def: {
    key: "qc.pass_rate_trend",
    labelAr: "اتجاه نسبة النجاح شهرياً",
    labelEn: "Monthly pass-rate trend",
    requiredPerms: ["qc.view_own", "qc.evaluate", "qc.approve", "qc.approve_team"],
    params: [
      { key: "months", type: "number", labelAr: "عدد الأشهر", labelEn: "Months back", defaultValue: 6 },
      {
        key: "metric", type: "select",
        labelAr: "المقياس", labelEn: "Metric", required: true, defaultValue: "internal",
        options: [
          { value: "internal", labelAr: "الامتثال", labelEn: "Compliance" },
          { value: "external", labelAr: "الأعمال", labelEn: "Business" },
          { value: "csat", labelAr: "العملاء", labelEn: "Customer" },
        ],
      },
    ],
    columns: [
      { key: "month", type: "string", labelAr: "الشهر", labelEn: "Month" },
      { key: "passRate", type: "number", labelAr: "نسبة النجاح", labelEn: "Pass rate %" },
      { key: "total", type: "number", labelAr: "الإجمالي", labelEn: "Total" },
    ],
  },
  async execute(ctx, params) {
    const monthsBack = Math.max(1, Math.min(24, Number(params.months) || 6));
    const metric = String(params.metric ?? "internal");
    const field = metric === "external" ? "qualityExternal"
                : metric === "csat" ? "customerSatisfaction"
                : "qualityInternal";
    const now = new Date();
    // Build the month labels first, from oldest to newest.
    const buckets: { key: string; label: string; pass: number; fail: number; total: number }[] = [];
    for (let i = monthsBack - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      buckets.push({ key, label: key, pass: 0, fail: 0, total: 0 });
    }
    const bucketByKey = new Map(buckets.map((b) => [b.key, b]));

    let entries = await db.select().from(qcEntries);
    const grants = ctx.grants;
    if (!grants.has("qc.approve")) {
      if (grants.has("qc.approve_team")) {
        const t = ctx.scopedAgentIds;
        entries = entries.filter((e) => t.includes(e.agentId));
      } else if (grants.has("qc.evaluate")) {
        entries = entries.filter((e) => e.createdByUserId === ctx.user.id);
      } else if (grants.has("qc.view_own")) {
        entries = entries.filter((e) => ctx.scopedAgentIds.includes(e.agentId) && e.status === "approved");
      } else { entries = []; }
    }
    for (const e of entries) {
      const prefix = String(e.callDate ?? "").slice(0, 7);
      const bucket = bucketByKey.get(prefix);
      if (!bucket) continue;
      const v = (e as any)[field];
      if (v === "Pass") { bucket.pass++; bucket.total++; }
      else if (v === "Fail") { bucket.fail++; bucket.total++; }
    }
    return buckets.map((b) => ({
      month: b.label,
      passRate: b.total > 0 ? Math.round((b.pass / b.total) * 100) : 0,
      total: b.total,
    }));
  },
};

// ─── Source 4: schedule — today's roster ────────────────────────────────────

const scheduleTodayRoster: DataSourceImpl = {
  def: {
    key: "schedule.today_roster",
    labelAr: "جدول اليوم",
    labelEn: "Today's roster",
    requiredPerms: ["schedule.view_own", "schedule.view_team", "schedule.view_project", "schedule.view_all", "schedule.manage"],
    params: [],
    columns: [
      { key: "agent", type: "string", labelAr: "الوكيل", labelEn: "Agent" },
      { key: "shift", type: "string", labelAr: "الشفت", labelEn: "Shift" },
      { key: "breaks", type: "string", labelAr: "البريكات", labelEn: "Breaks" },
    ],
  },
  async execute(ctx) {
    if (ctx.scopedAgentIds.length === 0) return [];
    const today = new Date();
    const dayKeys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
    const dayKey = dayKeys[today.getDay()];
    const ws = new Date(today);
    ws.setDate(ws.getDate() - ws.getDay());
    const weekStart = ws.toISOString().slice(0, 10);
    const rows = await db.select().from(schedules).where(and(
      inArray(schedules.agentId, ctx.scopedAgentIds),
      eq(schedules.weekStart, weekStart),
    ));
    const agentsRows = await db.select().from(agents).where(inArray(agents.id, ctx.scopedAgentIds));
    const agentById = new Map(agentsRows.map((a) => [a.id, a]));
    return rows.map((r) => {
      const shifts = (() => { try { return JSON.parse(r.shiftsJson); } catch { return {}; } })();
      const today = shifts[dayKey];
      if (!today) return null;
      const breaks = Array.isArray(today.breaks) ? today.breaks : [];
      return {
        agent: agentById.get(r.agentId)?.nameAr ?? "—",
        shift: today.isOff ? "OFF" : (today.start && today.end ? `${today.start}-${today.end}` : "—"),
        breaks: breaks.map((b: any) => `${b.start}-${b.end}`).join(", ") || "—",
      };
    }).filter(Boolean) as any;
  },
};

// ─── Source 5: recent notifications ─────────────────────────────────────────

const notificationsRecent: DataSourceImpl = {
  def: {
    key: "notifications.recent",
    labelAr: "آخر الإشعارات",
    labelEn: "Recent notifications",
    requiredPerms: ["notifications.view_own"],
    params: [
      { key: "limit", type: "number", labelAr: "العدد", labelEn: "Count", defaultValue: 10 },
    ],
    columns: [
      { key: "title", type: "string", labelAr: "العنوان", labelEn: "Title" },
      { key: "type", type: "string", labelAr: "النوع", labelEn: "Type" },
      { key: "createdAt", type: "date", labelAr: "التاريخ", labelEn: "Date" },
    ],
  },
  async execute(ctx, params) {
    const limit = Math.max(1, Math.min(100, Number(params.limit) || 10));
    const rows = await db.select().from(notifications)
      .where(eq(notifications.userId, ctx.user.id))
      .orderBy(desc(notifications.createdAt))
      .limit(limit);
    return rows.map((r) => ({
      title: r.titleAr,
      type: r.type,
      createdAt: r.createdAt,
    }));
  },
};

// ─── Registry ───────────────────────────────────────────────────────────────

export const DATA_SOURCES: Record<string, DataSourceImpl> = {
  [aprLatestMetric.def.key]: aprLatestMetric,
  [qcMonthlyStats.def.key]: qcMonthlyStats,
  [qcPassRateTrend.def.key]: qcPassRateTrend,
  [scheduleTodayRoster.def.key]: scheduleTodayRoster,
  [notificationsRecent.def.key]: notificationsRecent,
};

/** Populate options for the APR metric picker at request time — the list of
 *  metrics is project-specific, so we can't hardcode it in the definition. */
export async function enrichSourceDefs(ctx: QueryContext) {
  const defs = Object.values(DATA_SOURCES).map((s) => s.def);
  const projectIds = new Set<number>();
  const agentsRows = ctx.scopedAgentIds.length > 0
    ? await db.select().from(agents).where(inArray(agents.id, ctx.scopedAgentIds))
    : [];
  for (const a of agentsRows) projectIds.add(a.projectId);
  const metrics = projectIds.size > 0
    ? await db.select().from(aprMetricDefinitions)
        .where(inArray(aprMetricDefinitions.projectId, Array.from(projectIds)))
    : [];
  const uniqueMetrics = new Map<string, { labelAr: string; labelEn: string }>();
  for (const m of metrics) uniqueMetrics.set(m.key, { labelAr: m.labelAr, labelEn: m.labelEn });

  return defs.map((def) => ({
    ...def,
    params: def.params.map((p) => {
      if (def.key === "apr.latest_metric" && p.key === "metricKey") {
        return {
          ...p,
          options: Array.from(uniqueMetrics.entries()).map(([k, v]) => ({
            value: k, labelAr: v.labelAr, labelEn: v.labelEn,
          })),
        };
      }
      return p;
    }),
  }));
}

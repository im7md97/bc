// Anas — permission-aware tool registry.
//
// Each entry declares:
//   • name         → sent to OpenAI as the function name
//   • description  → what the agent should call it for
//   • parameters   → JSON-schema for the tool's arguments (OpenAI spec)
//   • execute      → the actual TypeScript that runs, receiving the caller's
//                     session + permission grants so it never returns rows
//                     the user isn't allowed to see.
//
// Add a tool = drop a new entry in TOOLS. No changes to the orchestrator.

import { db } from "../db";
import {
  qcEntries, scoreCards, agents, aprSnapshots, aprRows, schedules,
  attendance, users, notifications,
} from "@shared/schema";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import type { SessionUser } from "../auth";
import { getPermissionsForRole } from "../permissions";
import { getScopedAgents } from "../scoping";

export interface ToolContext {
  user: SessionUser;
  grants: Set<string>;
  scopedAgentIds: number[];        // agents this user may see
  lang: "ar" | "en";
}

export async function buildContext(user: SessionUser, lang: "ar" | "en" = "ar"): Promise<ToolContext> {
  const grants = await getPermissionsForRole(user.role);
  const scopedAgents = await getScopedAgents(user, grants, {
    all: "apr.view_all",
    project: "apr.view_project",
    team: "apr.view_team",
    own: "apr.view_own",
  });
  return { user, grants, scopedAgentIds: scopedAgents.map((a) => a.id), lang };
}

export interface Tool {
  name: string;
  description: string;
  parameters: any;
  execute: (ctx: ToolContext, args: any) => Promise<any>;
}

function monthWindow(period: string | undefined): Date {
  const now = new Date();
  if (period === "week")   return new Date(now.getTime() - 7 * 24 * 3600 * 1000);
  if (period === "month")  return new Date(now.getFullYear(), now.getMonth(), 1);
  if (period === "quarter") return new Date(now.getFullYear(), now.getMonth() - 3, 1);
  if (period === "year")   return new Date(now.getFullYear(), 0, 1);
  return new Date(now.getFullYear(), now.getMonth(), 1); // default: current month
}

export const TOOLS: Tool[] = [
  // ═══ QC ══════════════════════════════════════════════════════════════
  {
    name: "get_qc_summary",
    description: "Returns a summary of QC evaluations for the current user's scope: total, pending, approved, rejected. Period can be 'week', 'month', 'quarter', or 'year'.",
    parameters: {
      type: "object",
      properties: {
        period: { type: "string", enum: ["week", "month", "quarter", "year"], description: "Time window (default: month)" },
      },
    },
    async execute(ctx, args) {
      const since = monthWindow(args?.period);
      if (!ctx.scopedAgentIds.length) return { total: 0, note: "no_scope" };
      const [row] = await db.select({
        total:    sql<number>`count(*)::int`,
        pending:  sql<number>`count(*) filter (where status like 'pending%')::int`,
        approved: sql<number>`count(*) filter (where status like 'approved%')::int`,
        rejected: sql<number>`count(*) filter (where status like 'rejected%')::int`,
      })
      .from(qcEntries)
      .where(and(
        inArray(qcEntries.agentId, ctx.scopedAgentIds),
        gte(qcEntries.createdAt, since),
      ));
      return row;
    },
  },
  {
    name: "list_pending_qc",
    description: "Returns the QC evaluations still awaiting supervisor review or agent acknowledgment.",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "integer", minimum: 1, maximum: 50, description: "Max rows (default 10)" },
      },
    },
    async execute(ctx, args) {
      if (!ctx.scopedAgentIds.length) return [];
      const rows = await db.select({
        id: qcEntries.id, agentId: qcEntries.agentId, status: qcEntries.status,
        callDate: qcEntries.callDate, createdAt: qcEntries.createdAt,
      })
      .from(qcEntries)
      .where(and(
        inArray(qcEntries.agentId, ctx.scopedAgentIds),
        sql`${qcEntries.status} LIKE 'pending%'`,
      ))
      .orderBy(desc(qcEntries.createdAt))
      .limit(Math.min(Number(args?.limit ?? 10), 50));
      return rows;
    },
  },

  // ═══ SCORECARDS ═══════════════════════════════════════════════════════
  {
    name: "get_top_scorecards",
    description: "Returns the top-N scorecards by final score for a given period (year+month).",
    parameters: {
      type: "object",
      properties: {
        year:  { type: "integer", description: "e.g. 2026 (defaults to current year)" },
        month: { type: "integer", minimum: 1, maximum: 12, description: "1-12 (defaults to current month)" },
        limit: { type: "integer", minimum: 1, maximum: 50, description: "Rows to return (default 5)" },
      },
    },
    async execute(ctx, args) {
      const now = new Date();
      const year = Number(args?.year) || now.getFullYear();
      const month = Number(args?.month) || now.getMonth() + 1;
      if (!ctx.scopedAgentIds.length) return [];
      const rows = await db.select({
        agentId: scoreCards.agentId,
        agentName: agents.nameAr,
        finalScore: scoreCards.finalScore,
        rank: scoreCards.rankInTeam,
      })
      .from(scoreCards)
      .innerJoin(agents, eq(agents.id, scoreCards.agentId))
      .where(and(
        inArray(scoreCards.agentId, ctx.scopedAgentIds),
        eq(scoreCards.periodYear, year),
        eq(scoreCards.periodMonth, month),
        sql`${scoreCards.finalScore} IS NOT NULL`,
      ))
      .orderBy(desc(scoreCards.finalScore))
      .limit(Math.min(Number(args?.limit ?? 5), 50));
      return { period: `${year}-${String(month).padStart(2, "0")}`, rows };
    },
  },
  {
    name: "get_agent_scorecard",
    description: "Returns the monthly scorecard for a specific agent — pass either agentId or (part of) their name.",
    parameters: {
      type: "object",
      properties: {
        agentId: { type: "integer" },
        name:    { type: "string", description: "Search text — matches Arabic or English name (partial ok)" },
        year:    { type: "integer" },
        month:   { type: "integer", minimum: 1, maximum: 12 },
      },
    },
    async execute(ctx, args) {
      const now = new Date();
      const year = Number(args?.year) || now.getFullYear();
      const month = Number(args?.month) || now.getMonth() + 1;
      let agentId = Number(args?.agentId) || 0;
      if (!agentId && args?.name) {
        const q = String(args.name).trim();
        const [a] = await db.select().from(agents)
          .where(and(
            inArray(agents.id, ctx.scopedAgentIds.length ? ctx.scopedAgentIds : [0]),
            sql`(${agents.nameAr} ILIKE ${"%" + q + "%"} OR ${agents.nameEn} ILIKE ${"%" + q + "%"})`,
          ))
          .limit(1);
        if (!a) return { note: "agent_not_found" };
        agentId = a.id;
      }
      if (!agentId || !ctx.scopedAgentIds.includes(agentId)) {
        return { note: "not_in_scope" };
      }
      const [sc] = await db.select().from(scoreCards)
        .where(and(
          eq(scoreCards.agentId, agentId),
          eq(scoreCards.periodYear, year),
          eq(scoreCards.periodMonth, month),
        ));
      return sc ?? { note: "no_scorecard_for_period" };
    },
  },

  // ═══ APR ═════════════════════════════════════════════════════════════
  {
    name: "get_apr_summary",
    description: "Returns the most recent APR snapshot info: date, rows uploaded, project.",
    parameters: { type: "object", properties: {} },
    async execute(ctx) {
      const [snap] = await db.select().from(aprSnapshots)
        .orderBy(desc(aprSnapshots.createdAt)).limit(1);
      if (!snap) return { note: "no_snapshots_yet" };
      const [{ n }] = await db.select({
        n: sql<number>`count(*) filter (where agent_id = any(${ctx.scopedAgentIds.length ? ctx.scopedAgentIds : [0]}))::int`,
      }).from(aprRows).where(eq(aprRows.snapshotId, snap.id));
      return {
        snapshotId: snap.id, asOfDate: snap.asOfDate,
        totalRows: snap.rowCount, myScopeRows: Number(n),
      };
    },
  },

  // ═══ SCHEDULE ═════════════════════════════════════════════════════════
  {
    name: "get_today_schedule",
    description: "Returns today's shift + break for the current user's scope.",
    parameters: {
      type: "object",
      properties: {
        agentId: { type: "integer", description: "Optional — specific agent" },
      },
    },
    async execute(ctx, args) {
      if (!ctx.scopedAgentIds.length) return [];
      const ids = args?.agentId ? [Number(args.agentId)] : ctx.scopedAgentIds;
      // Get current week's Sunday
      const now = new Date();
      const sun = new Date(now); sun.setDate(now.getDate() - now.getDay()); sun.setHours(0,0,0,0);
      const weekStart = sun.toISOString().slice(0, 10);
      const dayKey = ["sun","mon","tue","wed","thu","fri","sat"][now.getDay()];

      const rows = await db.select({
        agentId: schedules.agentId, weekStart: schedules.weekStart, shifts: schedules.shiftsJson,
      })
      .from(schedules)
      .where(and(
        inArray(schedules.agentId, ids),
        eq(schedules.weekStart, weekStart),
      ));

      return rows.map((r) => {
        let parsed: any = {};
        try { parsed = JSON.parse(r.shifts); } catch {}
        return { agentId: r.agentId, today: parsed?.[dayKey] ?? null };
      });
    },
  },

  // ═══ ATTENDANCE ══════════════════════════════════════════════════════
  {
    name: "get_attendance_summary",
    description: "Returns attendance counts for the current user's scope this month (present/late/absent).",
    parameters: { type: "object", properties: {} },
    async execute(ctx) {
      if (!ctx.scopedAgentIds.length) return {};
      const since = monthWindow("month");
      const isoSince = since.toISOString().slice(0, 10);
      const [row] = await db.select({
        present: sql<number>`count(*) filter (where status='present')::int`,
        late:    sql<number>`count(*) filter (where status='late')::int`,
        absent:  sql<number>`count(*) filter (where status='absent')::int`,
      })
      .from(attendance)
      .where(and(
        inArray(attendance.agentId, ctx.scopedAgentIds),
        gte(attendance.date, isoSince),
      ));
      return row;
    },
  },

  // ═══ SEARCH ══════════════════════════════════════════════════════════
  {
    name: "search_agent",
    description: "Look up agents by name (Arabic or English) or employee id. Returns matching agents within the user's scope.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Free text — name or employee id" },
      },
      required: ["query"],
    },
    async execute(ctx, args) {
      const q = String(args?.query ?? "").trim();
      if (!q) return [];
      if (!ctx.scopedAgentIds.length) return [];
      const rows = await db.select({
        id: agents.id, employeeId: agents.employeeId,
        nameAr: agents.nameAr, nameEn: agents.nameEn,
      })
      .from(agents)
      .where(and(
        inArray(agents.id, ctx.scopedAgentIds),
        sql`(
          ${agents.nameAr} ILIKE ${"%" + q + "%"} OR
          ${agents.nameEn} ILIKE ${"%" + q + "%"} OR
          ${agents.employeeId} ILIKE ${"%" + q + "%"}
        )`,
      ))
      .limit(20);
      return rows;
    },
  },

  // ═══ NAVIGATION / HELP ═══════════════════════════════════════════════
  {
    name: "navigate_to",
    description: "Suggests a URL inside the portal the user should visit. Use this when they ask how to reach a page (Dashboard, QC, APR, Schedule, Score Cards, Users, Super Admin, Profile).",
    parameters: {
      type: "object",
      properties: {
        page: {
          type: "string",
          enum: ["home", "qc", "apr", "scorecards", "schedule", "attendance", "users", "projects", "super_admin", "profile", "notifications"],
        },
      },
      required: ["page"],
    },
    async execute(_ctx, args) {
      const map: Record<string, string> = {
        home: "/",
        qc: "/qc/dashboard",
        apr: "/apr",
        scorecards: "/scorecards",
        schedule: "/schedule",
        attendance: "/attendance",
        users: "/users",
        projects: "/projects",
        super_admin: "/super-admin",
        profile: "/profile",
        notifications: "/",
      };
      const page = String(args?.page ?? "home");
      return { url: map[page] ?? "/", page };
    },
  },
  {
    name: "list_notifications",
    description: "Returns the current user's most recent notifications.",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "integer", minimum: 1, maximum: 20 },
      },
    },
    async execute(ctx, args) {
      const rows = await db.select().from(notifications)
        .where(eq(notifications.userId, ctx.user.id))
        .orderBy(desc(notifications.createdAt))
        .limit(Math.min(Number(args?.limit ?? 5), 20));
      return rows;
    },
  },
  {
    name: "list_capabilities",
    description: "Lists what Anas can do — services and modules available inside BC Portal.",
    parameters: { type: "object", properties: {} },
    async execute() {
      return {
        modules: [
          { key: "qc",         label: "تقييم الجودة",     description: "تقييمات QC مع مسار مراجعة وإقرار" },
          { key: "apr",        label: "APR",             description: "تقارير أداء الموظفين بتحميل Excel" },
          { key: "scorecards", label: "بطاقات الأداء",   description: "حساب آلي شهري لكل موظف" },
          { key: "schedule",   label: "الجداول (WFM)",   description: "شفتات، بريكات، تبادل شفت" },
          { key: "attendance", label: "الحضور",           description: "حضور/غياب/تأخر مربوط بالجدول" },
          { key: "super_admin", label: "Super Admin",     description: "صلاحيات + خصائص + إشعارات" },
        ],
      };
    },
  },
];

/** OpenAI's tool-schema wrapper — one entry per Tool. */
export function toolsForOpenAI() {
  return TOOLS.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

export function findTool(name: string): Tool | undefined {
  return TOOLS.find((t) => t.name === name);
}

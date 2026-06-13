import type { Express } from "express";
import { db } from "../db";
import { schedules, agents, projects, users, type WeeklyShifts } from "@shared/schema";
import { eq, inArray, and } from "drizzle-orm";
import { requirePermission, requireFeature, grantsOf } from "../permissions";
import { sendError, errInternal, errNotFound, errInvalidId } from "../http-errors";
import { getScopedAgents } from "../scoping";
import type { SessionUser } from "../auth";

const SCHED_SCOPE = {
  all: "schedule.manage",
  project: "schedule.view_project",
  team: "schedule.view_team",
  own: "schedule.view_own",
};

function parseShifts(raw: string | null): WeeklyShifts {
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

export function registerScheduleRoutes(app: Express) {
  // List schedules visible to the caller — optionally filtered by week_start.
  app.get(
    "/api/schedules",
    requireFeature("menu.schedule"),
    requirePermission("schedule.manage", "schedule.view_team", "schedule.view_project", "schedule.view_own"),
    async (req, res) => {
      try {
        const me = req.user as SessionUser;
        const weekStart = typeof req.query.weekStart === "string" ? req.query.weekStart : "";
        const scoped = await getScopedAgents(me, grantsOf(req), SCHED_SCOPE);
        if (scoped.length === 0) return res.json({ agents: [], schedules: [] });
        const agentIds = scoped.map((a) => a.id);

        let rows = await db.select().from(schedules).where(inArray(schedules.agentId, agentIds));
        if (weekStart) rows = rows.filter((r) => r.weekStart === weekStart);

        const projectRows = await db.select().from(projects);
        const projectById = new Map(projectRows.map((p) => [p.id, p]));

        res.json({
          agents: scoped.map((a) => ({
            id: a.id,
            employeeId: a.employeeId,
            nameAr: a.nameAr,
            nameEn: a.nameEn,
            projectNameAr: projectById.get(a.projectId)?.nameAr ?? null,
            projectNameEn: projectById.get(a.projectId)?.nameEn ?? null,
          })),
          schedules: rows.map((r) => ({
            id: r.id,
            agentId: r.agentId,
            weekStart: r.weekStart,
            shifts: parseShifts(r.shiftsJson),
            updatedAt: r.updatedAt,
          })),
        });
      } catch {
        errInternal(res);
      }
    },
  );

  // Upsert a schedule for one agent / one week. Idempotent.
  app.post(
    "/api/schedules",
    requireFeature("menu.schedule"),
    requirePermission("schedule.manage"),
    async (req, res) => {
      try {
        const me = req.user as SessionUser;
        const { agentId, weekStart, shifts } = req.body ?? {};
        if (!agentId || !weekStart) {
          return sendError(res, 400, "missing_fields",
            "الوكيل وتاريخ بداية الأسبوع مطلوبان", "agentId and weekStart are required");
        }
        const [agent] = await db.select().from(agents).where(eq(agents.id, Number(agentId)));
        if (!agent) return sendError(res, 400, "invalid_agent", "الوكيل غير موجود", "Agent not found");

        // Manages-all callers (WFM tier) pass; supervisors are scoped to their own team.
        const managesAll = grantsOf(req).has("agent.list_all");
        if (!managesAll && agent.supervisorUserId !== me.id) {
          return sendError(res, 403, "forbidden",
            "هذا الوكيل ليس ضمن فريقك", "This agent is not in your team");
        }

        const shiftsJson = typeof shifts === "string" ? shifts : JSON.stringify(shifts ?? {});
        const [existing] = await db.select().from(schedules).where(and(
          eq(schedules.agentId, Number(agentId)),
          eq(schedules.weekStart, String(weekStart)),
        ));
        if (existing) {
          const [updated] = await db.update(schedules).set({
            shiftsJson,
            updatedAt: new Date(),
          }).where(eq(schedules.id, existing.id)).returning();
          return res.json(updated);
        }
        const [created] = await db.insert(schedules).values({
          agentId: Number(agentId),
          weekStart: String(weekStart),
          shiftsJson,
          createdByUserId: me.id,
        }).returning();
        res.status(201).json(created);
      } catch {
        errInternal(res);
      }
    },
  );

  app.delete(
    "/api/schedules/:id",
    requireFeature("menu.schedule"),
    requirePermission("schedule.manage"),
    async (req, res) => {
      try {
        const id = Number(req.params.id);
        if (isNaN(id)) return errInvalidId(res);
        const [row] = await db.select().from(schedules).where(eq(schedules.id, id));
        if (!row) return errNotFound(res);
        await db.delete(schedules).where(eq(schedules.id, id));
        res.status(204).end();
      } catch {
        errInternal(res);
      }
    },
  );
}

// Coaching sessions — supervisor creates → agent acknowledges → optionally
// marked complete. Every state change fires a notification.

import type { Express } from "express";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import {
  coachingSessions, agents, users, COACHING_TYPES, COACHING_STATUSES,
} from "@shared/schema";
import { requireAuth, requirePermission, getPermissionsForRole } from "../permissions";
import { errInternal, sendError } from "../http-errors";
import { getScopedAgents } from "../scoping";
import { notifyUser } from "../notify";
import type { SessionUser } from "../auth";

const SCOPE = {
  all: "coaching.view_all",
  project: "coaching.view_project",
  team: "coaching.view_team",
  own: "coaching.view_own",
};

async function scopedIds(user: SessionUser): Promise<number[]> {
  const grants = await getPermissionsForRole(user.role);
  const rows = await getScopedAgents(user, grants, SCOPE);
  return rows.map((r) => r.id);
}

export function registerCoachingRoutes(app: Express) {
  // ── LIST ─────────────────────────────────────────────────────────────
  //   • agent → their own sessions
  //   • supervisor/manager → sessions for scoped agents
  app.get("/api/coaching", requireAuth, async (req, res) => {
    try {
      const me = req.user as SessionUser;
      let where;
      if (me.role === "agent") {
        const [ag] = await db.select().from(agents).where(eq(agents.userId, me.id)).limit(1);
        if (!ag) return res.json({ sessions: [], summary: { total: 0, pending: 0, completed: 0 } });
        where = eq(coachingSessions.agentId, ag.id);
      } else {
        const ids = await scopedIds(me);
        if (!ids.length) return res.json({ sessions: [], summary: { total: 0, pending: 0, completed: 0 } });
        where = inArray(coachingSessions.agentId, ids);
      }
      const rows = await db.select({
        id: coachingSessions.id,
        agentId: coachingSessions.agentId,
        agentNameAr: agents.nameAr,
        agentNameEn: agents.nameEn,
        supervisorUserId: coachingSessions.supervisorUserId,
        supervisorName: users.displayNameAr,
        sessionType: coachingSessions.sessionType,
        status: coachingSessions.status,
        positivePoints: coachingSessions.positivePoints,
        mistakes: coachingSessions.mistakes,
        improvementPlan: coachingSessions.improvementPlan,
        targetMetric: coachingSessions.targetMetric,
        deadline: coachingSessions.deadline,
        agentAcknowledgedAt: coachingSessions.agentAcknowledgedAt,
        agentComment: coachingSessions.agentComment,
        completedAt: coachingSessions.completedAt,
        createdAt: coachingSessions.createdAt,
      })
      .from(coachingSessions)
      .innerJoin(agents, eq(agents.id, coachingSessions.agentId))
      .leftJoin(users, eq(users.id, coachingSessions.supervisorUserId))
      .where(where)
      .orderBy(desc(coachingSessions.createdAt));

      const [summary] = await db.select({
        total:     sql<number>`count(*)::int`,
        pending:   sql<number>`count(*) filter (where status='pending_agent')::int`,
        ack:       sql<number>`count(*) filter (where status='acknowledged')::int`,
        completed: sql<number>`count(*) filter (where status='completed')::int`,
      }).from(coachingSessions).where(where);

      res.json({ sessions: rows, summary });
    } catch (err) {
      console.error("[coaching.list]", err);
      errInternal(res);
    }
  });

  // ── GET one ─────────────────────────────────────────────────────────
  app.get("/api/coaching/:id", requireAuth, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const [row] = await db.select().from(coachingSessions).where(eq(coachingSessions.id, id));
      if (!row) return sendError(res, 404, "not_found", "غير موجود", "Not found");
      res.json(row);
    } catch (err) { console.error("[coaching.get]", err); errInternal(res); }
  });

  // ── CREATE (supervisor) ─────────────────────────────────────────────
  app.post("/api/coaching", requireAuth, requirePermission("coaching.create"), async (req, res) => {
    try {
      const me = req.user as SessionUser;
      const b = req.body ?? {};
      if (!b.agentId || !b.sessionType) {
        return sendError(res, 400, "missing_fields",
          "الموظف ونوع الجلسة مطلوبان", "Agent and session type are required");
      }
      if (!COACHING_TYPES.includes(b.sessionType)) {
        return sendError(res, 400, "bad_type", "نوع جلسة غير صحيح", "Invalid session type");
      }
      // Scope check — supervisor can only coach agents they see.
      const ids = await scopedIds(me);
      if (!ids.includes(Number(b.agentId))) {
        return sendError(res, 403, "out_of_scope",
          "الموظف خارج نطاقك", "Agent is not in your scope");
      }

      const [row] = await db.insert(coachingSessions).values({
        agentId: Number(b.agentId),
        supervisorUserId: me.id,
        sessionType: String(b.sessionType),
        status: "pending_agent",
        positivePoints: b.positivePoints ? String(b.positivePoints) : null,
        mistakes: b.mistakes ? String(b.mistakes) : null,
        improvementPlan: b.improvementPlan ? String(b.improvementPlan) : null,
        targetMetric: b.targetMetric ? String(b.targetMetric) : null,
        deadline: b.deadline ? String(b.deadline) : null,
      }).returning();

      // Notify the agent.
      const [ag] = await db.select().from(agents).where(eq(agents.id, row.agentId));
      if (ag?.userId) {
        await notifyUser({
          userId: ag.userId,
          type: "coaching_new",
          titleAr: "جلسة تدريبية جديدة",
          titleEn: "New coaching session",
          bodyAr: `${typeLabelAr(row.sessionType)} — يرجى المراجعة والإقرار`,
          bodyEn: `${row.sessionType.toUpperCase()} — please review and acknowledge`,
          linkPath: `/coaching/${row.id}`,
        }).catch(() => {});
      }

      res.json(row);
    } catch (err: any) {
      console.error("[coaching.create]", err);
      const detail = err?.message ?? String(err);
      return sendError(res, 500, "coaching_failed",
        `فشل حفظ الجلسة: ${detail}`, `Save failed: ${detail}`);
    }
  });

  // ── ACKNOWLEDGE (agent) ─────────────────────────────────────────────
  app.post("/api/coaching/:id/acknowledge", requireAuth, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const me = req.user as SessionUser;
      const [row] = await db.select().from(coachingSessions).where(eq(coachingSessions.id, id));
      if (!row) return sendError(res, 404, "not_found", "غير موجود", "Not found");
      const [ag] = await db.select().from(agents).where(eq(agents.id, row.agentId));
      if (!ag || ag.userId !== me.id) {
        return sendError(res, 403, "not_yours", "هذي الجلسة ليست لك", "Not your session");
      }
      if (row.status !== "pending_agent") {
        return sendError(res, 409, "already_ack", "تمّ الإقرار مسبقاً", "Already acknowledged");
      }
      const [updated] = await db.update(coachingSessions).set({
        status: "acknowledged",
        agentAcknowledgedAt: new Date(),
        agentComment: req.body?.comment ? String(req.body.comment) : null,
        updatedAt: new Date(),
      }).where(eq(coachingSessions.id, id)).returning();

      // Notify supervisor.
      await notifyUser({
        userId: row.supervisorUserId,
        type: "coaching_ack",
        titleAr: "إقرار جلسة تدريبية",
        titleEn: "Coaching acknowledged",
        bodyAr: `الموظف ${ag.nameAr} أقرّ الجلسة`,
        bodyEn: `${ag.nameEn} acknowledged the session`,
        linkPath: `/coaching/${id}`,
      }).catch(() => {});

      res.json(updated);
    } catch (err) { console.error("[coaching.ack]", err); errInternal(res); }
  });

  // ── COMPLETE (supervisor) ───────────────────────────────────────────
  app.post("/api/coaching/:id/complete", requireAuth, requirePermission("coaching.create"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const [row] = await db.select().from(coachingSessions).where(eq(coachingSessions.id, id));
      if (!row) return sendError(res, 404, "not_found", "غير موجود", "Not found");
      const [updated] = await db.update(coachingSessions).set({
        status: "completed",
        completedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(coachingSessions.id, id)).returning();
      res.json(updated);
    } catch (err) { console.error("[coaching.complete]", err); errInternal(res); }
  });
}

function typeLabelAr(t: string): string {
  switch (t) {
    case "side_by_side": return "جنب بجنب";
    case "dsat": return "DSAT";
    case "qa": return "QA";
    default: return t;
  }
}

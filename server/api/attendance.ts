import type { Express } from "express";
import { db } from "../db";
import { attendance, agents, ATTENDANCE_STATUSES, type AttendanceStatus } from "@shared/schema";
import { eq, inArray, and } from "drizzle-orm";
import { requirePermission, requireAuth, grantsOf } from "../permissions";
import { sendError, errInternal, errInvalidId } from "../http-errors";
import { getScopedAgents } from "../scoping";
import type { SessionUser } from "../auth";

const ATT_SCOPE = {
  all: "attendance.view_all",
  team: "attendance.view_team",
  own: "attendance.view_own",
};

function isStatus(v: any): v is AttendanceStatus {
  return ATTENDANCE_STATUSES.includes(v);
}

export function registerAttendanceRoutes(app: Express) {
  // List: agents the caller may see, with their attendance for the given date.
  app.get(
    "/api/attendance",
    requirePermission("attendance.record", "attendance.view_all", "attendance.view_team", "attendance.view_own"),
    async (req, res) => {
      try {
        const me = req.user as SessionUser;
        const date = typeof req.query.date === "string" ? req.query.date : "";
        if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          return sendError(res, 400, "invalid_date", "تاريخ غير صالح", "Invalid date (YYYY-MM-DD)");
        }
        const scope = grantsOf(req).has("attendance.record")
          ? { all: "attendance.view_all", team: "attendance.view_team", own: "attendance.view_own" }
          : ATT_SCOPE;
        // attendance.record alone (supervisor) implies team scope.
        const grants = grantsOf(req);
        const effectiveGrants = new Set(grants);
        if (grants.has("attendance.record") && !grants.has("attendance.view_team")) {
          effectiveGrants.add("attendance.view_team");
        }
        const scoped = await getScopedAgents(me, effectiveGrants, scope);
        if (scoped.length === 0) return res.json({ agents: [], records: [] });
        const agentIds = scoped.map((a) => a.id);
        const records = await db.select().from(attendance).where(and(
          inArray(attendance.agentId, agentIds),
          eq(attendance.date, date),
        ));
        res.json({
          agents: scoped.map((a) => ({
            id: a.id, employeeId: a.employeeId, nameAr: a.nameAr, nameEn: a.nameEn,
            supervisorUserId: a.supervisorUserId,
          })),
          records: records.map((r) => ({
            agentId: r.agentId, date: r.date, status: r.status, note: r.note,
            recordedByUserId: r.recordedByUserId, updatedAt: r.updatedAt,
          })),
        });
      } catch (err) {
        console.error("[attendance.list]", err);
        errInternal(res);
      }
    },
  );

  // Upsert one row.
  app.post("/api/attendance", requirePermission("attendance.record"), async (req, res) => {
    try {
      const me = req.user as SessionUser;
      const { agentId, date, status, note } = req.body ?? {};
      if (!agentId || !date) {
        return sendError(res, 400, "missing_fields", "الوكيل والتاريخ مطلوبان", "agentId and date are required");
      }
      if (!isStatus(status)) {
        return sendError(res, 400, "invalid_status", "حالة غير صالحة", "Invalid status");
      }
      const [agent] = await db.select().from(agents).where(eq(agents.id, Number(agentId)));
      if (!agent) return sendError(res, 400, "invalid_agent", "الوكيل غير موجود", "Agent not found");
      const managesAll = grantsOf(req).has("agent.list_all");
      if (!managesAll && agent.supervisorUserId !== me.id) {
        return sendError(res, 403, "forbidden", "هذا الوكيل ليس ضمن فريقك", "Not in your team");
      }
      const [existing] = await db.select().from(attendance).where(and(
        eq(attendance.agentId, Number(agentId)),
        eq(attendance.date, String(date)),
      ));
      if (existing) {
        const [updated] = await db.update(attendance).set({
          status,
          note: note ? String(note) : null,
          recordedByUserId: me.id,
          updatedAt: new Date(),
        }).where(eq(attendance.id, existing.id)).returning();
        return res.json(updated);
      }
      const [created] = await db.insert(attendance).values({
        agentId: Number(agentId),
        date: String(date),
        status,
        note: note ? String(note) : null,
        recordedByUserId: me.id,
      }).returning();
      res.status(201).json(created);
    } catch (err) {
      console.error("[attendance.post]", err);
      errInternal(res);
    }
  });

  // Bulk upsert for one date.
  app.post("/api/attendance/bulk", requirePermission("attendance.record"), async (req, res) => {
    try {
      const me = req.user as SessionUser;
      const { date, rows } = req.body ?? {};
      if (!date || !Array.isArray(rows)) {
        return sendError(res, 400, "missing_fields", "التاريخ والصفوف مطلوبة", "date and rows are required");
      }
      const managesAll = grantsOf(req).has("agent.list_all");
      const myAgents = await db.select().from(agents);
      const agentById = new Map(myAgents.map((a) => [a.id, a]));
      let saved = 0;
      for (const r of rows) {
        const agentId = Number(r?.agentId);
        if (!agentId || !isStatus(r?.status)) continue;
        const agent = agentById.get(agentId);
        if (!agent) continue;
        if (!managesAll && agent.supervisorUserId !== me.id) continue;
        const [existing] = await db.select().from(attendance).where(and(
          eq(attendance.agentId, agentId),
          eq(attendance.date, String(date)),
        ));
        if (existing) {
          await db.update(attendance).set({
            status: r.status, note: r.note ? String(r.note) : null,
            recordedByUserId: me.id, updatedAt: new Date(),
          }).where(eq(attendance.id, existing.id));
        } else {
          await db.insert(attendance).values({
            agentId, date: String(date), status: r.status,
            note: r.note ? String(r.note) : null, recordedByUserId: me.id,
          });
        }
        saved++;
      }
      res.json({ saved });
    } catch (err) {
      console.error("[attendance.bulk]", err);
      errInternal(res);
    }
  });

  app.delete("/api/attendance/:id", requirePermission("attendance.record"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) return errInvalidId(res);
      await db.delete(attendance).where(eq(attendance.id, id));
      res.status(204).end();
    } catch {
      errInternal(res);
    }
  });
}

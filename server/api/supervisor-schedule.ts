// Supervisor's own weekly on-duty schedule — same WeeklyShifts shape as agents.
// Supervisors edit their own; admins/WFM can edit anyone.

import type { Express } from "express";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { supervisorSchedules, users } from "@shared/schema";
import { requireAuth } from "../permissions";
import { errInternal, sendError } from "../http-errors";
import type { SessionUser } from "../auth";

export function registerSupervisorScheduleRoutes(app: Express) {
  // GET — current supervisor's schedule for a week (or any user if permitted).
  app.get("/api/supervisor-schedule", requireAuth, async (req, res) => {
    try {
      const me = req.user as SessionUser;
      const weekStart = String(req.query.weekStart ?? "");
      const userId = Number(req.query.userId ?? me.id);
      if (!weekStart) return sendError(res, 400, "missing_week", "weekStart مطلوب", "weekStart is required");

      // Scope guard: non-admin/wfm can only see their own.
      if (userId !== me.id && !["admin", "wfm", "super_admin"].includes(me.role)) {
        return sendError(res, 403, "forbidden", "لا صلاحية", "Not allowed");
      }

      const [row] = await db.select().from(supervisorSchedules)
        .where(and(eq(supervisorSchedules.supervisorUserId, userId), eq(supervisorSchedules.weekStart, weekStart)));

      const shifts = row?.shiftsJson ? safeParse(row.shiftsJson) : {};
      res.json({ id: row?.id ?? null, supervisorUserId: userId, weekStart, shifts });
    } catch (err) {
      console.error("[supervisor-schedule.get]", err);
      errInternal(res);
    }
  });

  // PUT — upsert the week's shifts.
  app.put("/api/supervisor-schedule", requireAuth, async (req, res) => {
    try {
      const me = req.user as SessionUser;
      const weekStart = String(req.body?.weekStart ?? "");
      const userId = Number(req.body?.userId ?? me.id);
      const shifts = req.body?.shifts ?? {};
      if (!weekStart) return sendError(res, 400, "missing_week", "weekStart مطلوب", "weekStart is required");
      if (userId !== me.id && !["admin", "wfm", "super_admin"].includes(me.role)) {
        return sendError(res, 403, "forbidden", "لا صلاحية", "Not allowed");
      }

      const shiftsJson = JSON.stringify(shifts);
      const [existing] = await db.select().from(supervisorSchedules)
        .where(and(eq(supervisorSchedules.supervisorUserId, userId), eq(supervisorSchedules.weekStart, weekStart)));

      let row;
      if (existing) {
        [row] = await db.update(supervisorSchedules).set({
          shiftsJson, updatedAt: new Date(),
        }).where(eq(supervisorSchedules.id, existing.id)).returning();
      } else {
        [row] = await db.insert(supervisorSchedules).values({
          supervisorUserId: userId, weekStart, shiftsJson,
        }).returning();
      }
      res.json({ id: row.id, supervisorUserId: userId, weekStart, shifts });
    } catch (err) {
      console.error("[supervisor-schedule.put]", err);
      errInternal(res);
    }
  });

  // Admin/WFM: list supervisors + latest week they have on file.
  app.get("/api/supervisor-schedule/supervisors", requireAuth, async (req, res) => {
    try {
      const me = req.user as SessionUser;
      if (!["admin", "wfm", "super_admin"].includes(me.role)) {
        return sendError(res, 403, "forbidden", "لا صلاحية", "Not allowed");
      }
      const rows = await db.select({
        id: users.id, fullName: users.displayNameAr, role: users.role,
      }).from(users).where(eq(users.role, "supervisor"));
      res.json(rows);
    } catch (err) { console.error("[supervisor-schedule.list]", err); errInternal(res); }
  });
}

function safeParse(s: string): any {
  try { return JSON.parse(s); } catch { return {}; }
}

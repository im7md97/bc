import type { Express } from "express";
import { db } from "../db";
import { users, agents, projects } from "@shared/schema";
import { eq } from "drizzle-orm";
import { requireAuth } from "../permissions";
import { errInternal, sendError } from "../http-errors";
import type { SessionUser } from "../auth";

export function registerProfileRoutes(app: Express) {
  // GET /api/me/profile — current user's profile + linked agent record (if any).
  app.get("/api/me/profile", requireAuth, async (req, res) => {
    try {
      const me = req.user as SessionUser;
      const [row] = await db.select().from(users).where(eq(users.id, me.id));
      if (!row) return sendError(res, 404, "not_found", "المستخدم غير موجود", "User not found");

      // The agent record, if this user is linked to one.
      const [agentRow] = await db.select().from(agents).where(eq(agents.userId, me.id));
      let project = null as any;
      let supervisor = null as any;
      if (agentRow) {
        const [p] = await db.select().from(projects).where(eq(projects.id, agentRow.projectId));
        project = p ? { id: p.id, nameAr: p.nameAr, nameEn: p.nameEn } : null;
        if (agentRow.supervisorUserId) {
          const [s] = await db.select().from(users).where(eq(users.id, agentRow.supervisorUserId));
          supervisor = s ? { id: s.id, displayNameAr: s.displayNameAr, displayNameEn: s.displayNameEn } : null;
        }
      }

      res.json({
        id: row.id,
        username: row.username,
        email: row.email,
        role: row.role,
        displayNameAr: row.displayNameAr,
        displayNameEn: row.displayNameEn,
        preferredLanguage: row.preferredLanguage,
        isActive: row.isActive,
        forcePasswordChange: row.forcePasswordChange,
        lastLoginAt: row.lastLoginAt,
        createdAt: row.createdAt,
        agent: agentRow ? {
          id: agentRow.id,
          employeeId: agentRow.employeeId,
          nameAr: agentRow.nameAr,
          nameEn: agentRow.nameEn,
          inboundId: agentRow.inboundId,
          project,
          supervisor,
        } : null,
      });
    } catch {
      errInternal(res);
    }
  });

  // PATCH /api/me/profile — let the user edit non-sensitive fields on their own row.
  app.patch("/api/me/profile", requireAuth, async (req, res) => {
    try {
      const me = req.user as SessionUser;
      const { displayNameAr, displayNameEn, email } = req.body ?? {};
      const updates: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };

      if (displayNameAr !== undefined) {
        const v = String(displayNameAr).trim();
        if (!v) return sendError(res, 400, "missing_field", "الاسم العربي مطلوب", "Arabic name required");
        updates.displayNameAr = v;
      }
      if (displayNameEn !== undefined) {
        const v = String(displayNameEn).trim();
        if (!v) return sendError(res, 400, "missing_field", "الاسم الإنجليزي مطلوب", "English name required");
        updates.displayNameEn = v;
      }
      if (email !== undefined) {
        const v = String(email).trim();
        if (!v || !/.+@.+\..+/.test(v)) {
          return sendError(res, 400, "invalid_email", "البريد الإلكتروني غير صالح", "Invalid email");
        }
        updates.email = v;
      }

      const [updated] = await db.update(users).set(updates).where(eq(users.id, me.id)).returning();
      // Reflect changes in the session so the navbar refreshes without re-login.
      const session = req.user as SessionUser;
      if (updates.displayNameAr) session.displayNameAr = updates.displayNameAr;
      if (updates.displayNameEn) session.displayNameEn = updates.displayNameEn;
      if (updates.email) session.email = updates.email;

      res.json({
        id: updated.id,
        username: updated.username,
        email: updated.email,
        displayNameAr: updated.displayNameAr,
        displayNameEn: updated.displayNameEn,
      });
    } catch (err: any) {
      if (err?.code === "23505") {
        return sendError(res, 400, "duplicate_email", "البريد مستخدم بالفعل", "Email already in use");
      }
      console.error("[profile.patch]", err);
      errInternal(res);
    }
  });
}

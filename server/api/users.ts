import type { Express } from "express";
import { db } from "../db";
import { users, agents, ROLES, type SafeUser } from "@shared/schema";
import { eq, desc, and, ne, or, ilike } from "drizzle-orm";
import { requirePermission, grantsOf } from "../permissions";
import { sendError, errInternal, errNotFound, errInvalidId } from "../http-errors";
import { hashPassword } from "../password";
import { notifyRole } from "../notify";
import type { SessionUser } from "../auth";

function safe(u: typeof users.$inferSelect): SafeUser {
  const { passwordHash: _, ...rest } = u;
  return rest;
}

export function registerUserRoutes(app: Express) {
  // List users. super_admin accounts are hidden from normal admin lists (§3).
  app.get("/api/users", requirePermission("user.list_all"), async (req, res) => {
    try {
      const grants = grantsOf(req);
      const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
      const where = search
        ? or(ilike(users.username, `%${search}%`), ilike(users.email, `%${search}%`),
            ilike(users.displayNameAr, `%${search}%`), ilike(users.displayNameEn, `%${search}%`))
        : undefined;
      let rows = await db.select().from(users)
        .where(where)
        .orderBy(desc(users.createdAt));
      if (!grants.has("permission.grant")) {
        rows = rows.filter((u) => u.role !== "super_admin");
      }
      res.json(rows.map(safe));
    } catch {
      errInternal(res);
    }
  });

  app.post("/api/users", requirePermission("user.create", "user.create_agent"), async (req, res) => {
    try {
      const me = req.user as SessionUser;
      const grants = grantsOf(req);
      const { username, email, password, role, displayNameAr, displayNameEn } = req.body ?? {};
      if (!username?.trim() || !email?.trim()) {
        return sendError(res, 400, "missing_fields", "اسم المستخدم والبريد مطلوبان", "Username and email are required");
      }
      if (!password || String(password).length < 6) {
        return sendError(res, 400, "weak_password", "كلمة المرور 6 أحرف على الأقل", "Password must be at least 6 characters");
      }
      if (!ROLES.includes(role)) {
        return sendError(res, 400, "invalid_role", "دور غير صالح", "Invalid role");
      }
      if (role === "super_admin") {
        return sendError(res, 400, "invalid_role",
          "لا يمكن إنشاء مدير أعلى من هنا", "Super admin cannot be created here");
      }
      // Callers holding only the scoped grant may create agent accounts only (§5*).
      if (!grants.has("user.create") && role !== "agent") {
        return sendError(res, 403, "forbidden",
          "صلاحيتك تسمح بإنشاء حسابات وكلاء فقط", "You may only create agent accounts");
      }
      const [created] = await db.insert(users).values({
        username: String(username).trim(),
        email: String(email).trim(),
        passwordHash: hashPassword(String(password)),
        role,
        displayNameAr: String(displayNameAr || username).trim(),
        displayNameEn: String(displayNameEn || username).trim(),
        forcePasswordChange: true,
      }).returning();

      // WFM-style creators (scoped grant only) trigger an admin notification (§5*).
      if (!grants.has("user.create")) {
        await notifyRole("admin", {
          type: "user_created",
          titleAr: "تم إنشاء مستخدم جديد",
          titleEn: "New user created",
          bodyAr: `أنشأ ${me.displayNameAr} حساباً جديداً: ${created.username} (${role})`,
          bodyEn: `${me.displayNameEn} created a new account: ${created.username} (${role})`,
          linkPath: "/users",
        });
      }
      res.status(201).json(safe(created));
    } catch (err: any) {
      if (String(err?.message || "").includes("unique") || err?.code === "23505") {
        return sendError(res, 400, "duplicate", "اسم المستخدم أو البريد مستخدم بالفعل", "Username or email already in use");
      }
      errInternal(res);
    }
  });

  app.patch("/api/users/:id", requirePermission("user.create"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) return errInvalidId(res);
      const [target] = await db.select().from(users).where(eq(users.id, id));
      if (!target) return errNotFound(res);
      if (target.role === "super_admin" && !grantsOf(req).has("permission.grant")) {
        return sendError(res, 403, "forbidden", "لا يمكن تعديل هذا الحساب", "This account cannot be modified");
      }
      const { role, displayNameAr, displayNameEn, email, isActive } = req.body ?? {};
      const updates: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };
      if (role !== undefined) {
        if (!ROLES.includes(role) || role === "super_admin") {
          return sendError(res, 400, "invalid_role", "دور غير صالح", "Invalid role");
        }
        updates.role = role;
      }
      if (displayNameAr !== undefined) updates.displayNameAr = String(displayNameAr);
      if (displayNameEn !== undefined) updates.displayNameEn = String(displayNameEn);
      if (email !== undefined) updates.email = String(email).trim();
      if (isActive !== undefined) updates.isActive = Boolean(isActive);
      const [updated] = await db.update(users).set(updates).where(eq(users.id, id)).returning();
      res.json(safe(updated));
    } catch (err: any) {
      if (err?.code === "23505") {
        return sendError(res, 400, "duplicate", "البريد مستخدم بالفعل", "Email already in use");
      }
      errInternal(res);
    }
  });

  app.patch("/api/users/:id/password", requirePermission("user.create"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) return errInvalidId(res);
      const { password } = req.body ?? {};
      if (!password || String(password).length < 6) {
        return sendError(res, 400, "weak_password", "كلمة المرور 6 أحرف على الأقل", "Password must be at least 6 characters");
      }
      const [target] = await db.select().from(users).where(eq(users.id, id));
      if (!target) return errNotFound(res);
      await db.update(users).set({
        passwordHash: hashPassword(String(password)),
        forcePasswordChange: true,
        updatedAt: new Date(),
      }).where(eq(users.id, id));
      res.json({ message: "ok" });
    } catch {
      errInternal(res);
    }
  });

  // Deactivates (soft delete) — FK references from agents/projects stay valid.
  app.delete("/api/users/:id", requirePermission("user.delete", "user.delete_agent"), async (req, res) => {
    try {
      const me = req.user as SessionUser;
      const grants = grantsOf(req);
      const id = Number(req.params.id);
      if (isNaN(id)) return errInvalidId(res);
      if (id === me.id) {
        return sendError(res, 400, "self_delete", "لا يمكنك حذف حسابك", "You cannot delete your own account");
      }
      const [target] = await db.select().from(users).where(eq(users.id, id));
      if (!target) return errNotFound(res);
      if (target.role === "super_admin") {
        return sendError(res, 403, "forbidden", "لا يمكن حذف هذا الحساب", "This account cannot be deleted");
      }
      if (!grants.has("user.delete") && target.role !== "agent") {
        return sendError(res, 403, "forbidden",
          "صلاحيتك تسمح بحذف حسابات وكلاء فقط", "You may only delete agent accounts");
      }
      await db.update(users).set({ isActive: false, updatedAt: new Date() }).where(eq(users.id, id));
      if (!grants.has("user.delete")) {
        await notifyRole("admin", {
          type: "user_deleted",
          titleAr: "تم حذف مستخدم",
          titleEn: "User deleted",
          bodyAr: `قام ${me.displayNameAr} بحذف الحساب: ${target.username}`,
          bodyEn: `${me.displayNameEn} deleted the account: ${target.username}`,
          linkPath: "/users",
        });
      }
      res.status(204).end();
    } catch {
      errInternal(res);
    }
  });

  // Promote an existing user to super_admin (only super_admins may do this, §11.4).
  app.post("/api/users/:id/promote-super-admin", requirePermission("permission.grant"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) return errInvalidId(res);
      const [target] = await db.select().from(users).where(eq(users.id, id));
      if (!target) return errNotFound(res);
      await db.update(users).set({ role: "super_admin", updatedAt: new Date() }).where(eq(users.id, id));
      res.json({ message: "ok" });
    } catch {
      errInternal(res);
    }
  });

  // Supervisors list — used by agent forms (any caller able to manage agents).
  app.get("/api/users/supervisors", requirePermission("agent.create", "agent.list_all", "agent.list_project", "agent.list_team", "user.list_all"), async (_req, res) => {
    try {
      const rows = await db.select().from(users)
        .where(and(eq(users.role, "supervisor"), eq(users.isActive, true)));
      res.json(rows.map(safe));
    } catch {
      errInternal(res);
    }
  });
}

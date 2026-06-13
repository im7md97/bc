import type { Express } from "express";
import { db } from "../db";
import { permissionGrants, featureFlags, ROLES } from "@shared/schema";
import { PERMISSION_DEFS, ALL_PERMISSION_KEYS } from "@shared/permissions";
import { eq, and } from "drizzle-orm";
import { requirePermission, invalidatePermissionCache, invalidateFlagsCache } from "../permissions";
import { sendError, errInternal } from "../http-errors";
import type { SessionUser } from "../auth";

export function registerSuperAdminRoutes(app: Express) {
  // ── Permission matrix (§11.1) ────────────────────────────────────────────────
  app.get("/api/super/permissions", requirePermission("permission.grant"), async (_req, res) => {
    try {
      const grants = await db.select().from(permissionGrants);
      res.json({
        roles: ROLES,
        definitions: PERMISSION_DEFS,
        grants: grants.map((g) => ({ role: g.role, permissionKey: g.permissionKey })),
      });
    } catch {
      errInternal(res);
    }
  });

  app.put("/api/super/permissions", requirePermission("permission.grant"), async (req, res) => {
    try {
      const me = req.user as SessionUser;
      const { role, permissionKey, granted } = req.body ?? {};
      if (!ROLES.includes(role) || !ALL_PERMISSION_KEYS.includes(permissionKey)) {
        return sendError(res, 400, "invalid_input", "دور أو صلاحية غير صالحة", "Invalid role or permission key");
      }
      // Super admin must never lock itself out of the matrix.
      if (role === "super_admin" && ["permission.grant", "feature_flag.toggle"].includes(permissionKey) && !granted) {
        return sendError(res, 400, "self_lockout",
          "لا يمكن سحب هذه الصلاحية من المدير الأعلى", "This permission cannot be revoked from super admin");
      }
      if (granted) {
        await db.insert(permissionGrants)
          .values({ role, permissionKey, grantedByUserId: me.id })
          .onConflictDoNothing();
      } else {
        await db.delete(permissionGrants)
          .where(and(eq(permissionGrants.role, role), eq(permissionGrants.permissionKey, permissionKey)));
      }
      invalidatePermissionCache(); // effective immediately (§11.1)
      res.json({ message: "ok" });
    } catch {
      errInternal(res);
    }
  });

  // ── Feature flags / kill switches (§11.2) ────────────────────────────────────
  app.get("/api/super/feature-flags", requirePermission("feature_flag.toggle"), async (_req, res) => {
    try {
      res.json(await db.select().from(featureFlags));
    } catch {
      errInternal(res);
    }
  });

  app.patch("/api/super/feature-flags/:key", requirePermission("feature_flag.toggle"), async (req, res) => {
    try {
      const me = req.user as SessionUser;
      const key = String(req.params.key);
      const { isEnabled, appliesToRoles } = req.body ?? {};
      const updates: Partial<typeof featureFlags.$inferInsert> = {
        updatedByUserId: me.id,
        updatedAt: new Date(),
      };
      if (isEnabled !== undefined) updates.isEnabled = Boolean(isEnabled);
      if (appliesToRoles !== undefined) {
        if (appliesToRoles !== null && (!Array.isArray(appliesToRoles) || appliesToRoles.some((r: any) => !ROLES.includes(r)))) {
          return sendError(res, 400, "invalid_roles", "قائمة الأدوار غير صالحة", "Invalid roles list");
        }
        updates.appliesToRoles = appliesToRoles;
      }
      const [updated] = await db.update(featureFlags).set(updates)
        .where(eq(featureFlags.key, key)).returning();
      if (!updated) {
        return sendError(res, 404, "not_found", "المفتاح غير موجود", "Flag not found");
      }
      invalidateFlagsCache(); // effective immediately (§11.2)
      res.json(updated);
    } catch {
      errInternal(res);
    }
  });
}

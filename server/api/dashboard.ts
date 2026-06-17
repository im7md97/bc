import type { Express } from "express";
import { db } from "../db";
import { users } from "@shared/schema";
import { DASHBOARD_WIDGETS, DEFAULT_WIDGETS_BY_ROLE } from "@shared/dashboard";
import { eq } from "drizzle-orm";
import { requireAuth, getPermissionsForRole } from "../permissions";
import { errInternal, sendError } from "../http-errors";
import type { SessionUser } from "../auth";

export function registerDashboardRoutes(app: Express) {
  // Returns the user's pinned widget keys plus the full catalog (filtered to
  // widgets they have permission to see).
  app.get("/api/me/dashboard", requireAuth, async (req, res) => {
    try {
      const me = req.user as SessionUser;
      const [row] = await db.select().from(users).where(eq(users.id, me.id));
      const grants = await getPermissionsForRole(me.role);
      const visible = DASHBOARD_WIDGETS.filter((w) =>
        w.requiredPerms.some((p) => grants.has(p)));

      let pinned = row?.dashboardWidgets ?? null;
      if (!pinned) {
        // First visit — seed from role defaults, intersected with permissions.
        const visibleKeys = new Set(visible.map((w) => w.key));
        pinned = (DEFAULT_WIDGETS_BY_ROLE[me.role] ?? []).filter((k) => visibleKeys.has(k));
      } else {
        // Drop any pinned widget the user can no longer see (perm revoked).
        const visibleKeys = new Set(visible.map((w) => w.key));
        pinned = pinned.filter((k) => visibleKeys.has(k));
      }
      res.json({ pinned, catalog: visible });
    } catch {
      errInternal(res);
    }
  });

  app.put("/api/me/dashboard", requireAuth, async (req, res) => {
    try {
      const me = req.user as SessionUser;
      const { widgets } = req.body ?? {};
      if (!Array.isArray(widgets) || widgets.some((w) => typeof w !== "string")) {
        return sendError(res, 400, "invalid_widgets", "قائمة الـ widgets غير صالحة", "Invalid widgets list");
      }
      const grants = await getPermissionsForRole(me.role);
      const allowed = new Set(DASHBOARD_WIDGETS
        .filter((w) => w.requiredPerms.some((p) => grants.has(p)))
        .map((w) => w.key));
      const cleaned = widgets.filter((k: string) => allowed.has(k));
      await db.update(users).set({
        dashboardWidgets: cleaned.length > 0 ? cleaned : [],
        updatedAt: new Date(),
      }).where(eq(users.id, me.id));
      res.json({ pinned: cleaned });
    } catch {
      errInternal(res);
    }
  });
}

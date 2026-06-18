import type { Express } from "express";
import { db } from "../db";
import { users } from "@shared/schema";
import {
  DASHBOARD_WIDGETS, DEFAULT_WIDGETS_BY_ROLE, CUSTOM_SOURCE_PERMS,
  type PinnedWidget, type CustomWidget, type WidgetSize, type DashboardState,
} from "@shared/dashboard";
import { eq } from "drizzle-orm";
import { requireAuth, getPermissionsForRole } from "../permissions";
import { errInternal, sendError } from "../http-errors";
import type { SessionUser } from "../auth";

const SIZES: WidgetSize[] = ["sm", "md", "lg", "xl"];

/** Accept either the legacy `string[]` shape or the new `DashboardState`. */
function normalizeStored(raw: unknown): DashboardState {
  if (!raw) return { pinned: [], customs: [] };
  // Legacy: just an array of widget keys.
  if (Array.isArray(raw)) {
    return { pinned: raw.map((k) => ({ key: String(k) })), customs: [] };
  }
  const obj = raw as any;
  const pinned: PinnedWidget[] = Array.isArray(obj.pinned)
    ? obj.pinned.map((p: any) => {
        if (typeof p === "string") return { key: p };
        return {
          key: String(p?.key ?? ""),
          size: SIZES.includes(p?.size) ? p.size : undefined,
        };
      }).filter((p: PinnedWidget) => !!p.key)
    : [];
  const customs: CustomWidget[] = Array.isArray(obj.customs) ? obj.customs : [];
  return { pinned, customs };
}

export function registerDashboardRoutes(app: Express) {
  // Returns the user's pinned widgets, their custom widgets, and the catalog
  // (filtered to widgets they have permission to see).
  app.get("/api/me/dashboard", requireAuth, async (req, res) => {
    try {
      const me = req.user as SessionUser;
      const [row] = await db.select().from(users).where(eq(users.id, me.id));
      const grants = await getPermissionsForRole(me.role);
      const visible = DASHBOARD_WIDGETS.filter((w) =>
        w.requiredPerms.some((p) => grants.has(p)));
      const visibleKeys = new Set(visible.map((w) => w.key));

      let state = normalizeStored(row?.dashboardWidgets);

      if (state.pinned.length === 0 && state.customs.length === 0) {
        // First visit — seed from role defaults, intersected with permissions.
        const defaults = (DEFAULT_WIDGETS_BY_ROLE[me.role] ?? [])
          .filter((k) => visibleKeys.has(k));
        state = { pinned: defaults.map((k) => ({ key: k })), customs: [] };
      } else {
        // Drop pinned widgets the user can no longer see (perm revoked).
        state.pinned = state.pinned.filter((p) =>
          p.key.startsWith("custom:") || visibleKeys.has(p.key));
      }

      // Permissions the user holds — the client uses this to decide which
      // custom-widget sources to expose in the builder.
      const customSources = (Object.keys(CUSTOM_SOURCE_PERMS) as (keyof typeof CUSTOM_SOURCE_PERMS)[])
        .filter((src) => CUSTOM_SOURCE_PERMS[src].some((p) => grants.has(p)));

      res.json({
        pinned: state.pinned,
        customs: state.customs,
        catalog: visible,
        customSources,
      });
    } catch {
      errInternal(res);
    }
  });

  app.put("/api/me/dashboard", requireAuth, async (req, res) => {
    try {
      const me = req.user as SessionUser;
      const { pinned, customs } = req.body ?? {};
      if (!Array.isArray(pinned) || !Array.isArray(customs ?? [])) {
        return sendError(res, 400, "invalid_state",
          "تنسيق الداشبورد غير صالح", "Invalid dashboard payload");
      }
      const grants = await getPermissionsForRole(me.role);
      const allowedCatalog = new Set(DASHBOARD_WIDGETS
        .filter((w) => w.requiredPerms.some((p) => grants.has(p)))
        .map((w) => w.key));

      // Validate customs: source must be one the user has permission for.
      const cleanedCustoms: CustomWidget[] = [];
      for (const c of (customs ?? []) as CustomWidget[]) {
        if (!c?.id || !c?.source) continue;
        const sourcePerms = CUSTOM_SOURCE_PERMS[c.source];
        if (!sourcePerms || !sourcePerms.some((p) => grants.has(p))) continue;
        cleanedCustoms.push({
          id: String(c.id),
          titleAr: String(c.titleAr ?? "").slice(0, 80),
          titleEn: String(c.titleEn ?? "").slice(0, 80),
          source: c.source,
          aprMetric: c.aprMetric ? String(c.aprMetric) : undefined,
          aprAggregation: c.aprAggregation === "average" ? "average" : c.aprAggregation === "latest" ? "latest" : undefined,
          qcMetric: c.qcMetric,
          qcPeriod: c.qcPeriod === "all" ? "all" : c.qcPeriod === "current_month" ? "current_month" : undefined,
          scheduleMetric: c.scheduleMetric,
        });
      }
      const customIds = new Set(cleanedCustoms.map((c) => `custom:${c.id}`));

      // Validate pinned: every key must reference an allowed catalog widget
      // or a current custom widget.
      const cleanedPinned: PinnedWidget[] = [];
      for (const p of pinned as PinnedWidget[]) {
        const key = String(p?.key ?? "");
        if (!key) continue;
        const isCustom = key.startsWith("custom:");
        if (isCustom ? !customIds.has(key) : !allowedCatalog.has(key)) continue;
        cleanedPinned.push({
          key,
          size: SIZES.includes(p?.size as WidgetSize) ? p.size : undefined,
        });
      }

      await db.update(users).set({
        dashboardWidgets: { pinned: cleanedPinned, customs: cleanedCustoms } as any,
        updatedAt: new Date(),
      }).where(eq(users.id, me.id));

      res.json({ pinned: cleanedPinned, customs: cleanedCustoms });
    } catch {
      errInternal(res);
    }
  });
}

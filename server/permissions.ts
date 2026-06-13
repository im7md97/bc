import type { RequestHandler } from "express";
import { db } from "./db";
import { permissionGrants, featureFlags } from "@shared/schema";
import { sendError } from "./http-errors";

// ─── Live permission cache ────────────────────────────────────────────────────
// Loaded lazily from permission_grants; invalidated whenever Super Admin
// changes a grant, so toggles take effect immediately without restart.

let grantsCache: Map<string, Set<string>> | null = null;

export async function getGrantsByRole(): Promise<Map<string, Set<string>>> {
  if (!grantsCache) {
    const rows = await db.select().from(permissionGrants);
    const map = new Map<string, Set<string>>();
    for (const row of rows) {
      if (!map.has(row.role)) map.set(row.role, new Set());
      map.get(row.role)!.add(row.permissionKey);
    }
    grantsCache = map;
  }
  return grantsCache;
}

export async function getPermissionsForRole(role: string): Promise<Set<string>> {
  const map = await getGrantsByRole();
  return map.get(role) ?? new Set();
}

export function invalidatePermissionCache() {
  grantsCache = null;
}

// ─── Live feature-flag cache ─────────────────────────────────────────────────

interface FlagState { isEnabled: boolean; appliesToRoles: string[] | null }
let flagsCache: Map<string, FlagState> | null = null;

export async function getFlags(): Promise<Map<string, FlagState>> {
  if (!flagsCache) {
    const rows = await db.select().from(featureFlags);
    flagsCache = new Map(rows.map((r) => [r.key, {
      isEnabled: r.isEnabled,
      appliesToRoles: r.appliesToRoles ?? null,
    }]));
  }
  return flagsCache;
}

export function invalidateFlagsCache() {
  flagsCache = null;
}

/** A flag gates a role when it is disabled globally (appliesToRoles null)
 *  or disabled and the role is listed in appliesToRoles. Unknown keys are ON. */
export async function isFeatureEnabled(key: string, role: string): Promise<boolean> {
  const flags = await getFlags();
  const flag = flags.get(key);
  if (!flag) return true;
  if (flag.isEnabled) return true;
  if (!flag.appliesToRoles || flag.appliesToRoles.length === 0) return false;
  return !flag.appliesToRoles.includes(role);
}

// ─── Middleware ───────────────────────────────────────────────────────────────

export const requireAuth: RequestHandler = (req, res, next) => {
  if (req.isAuthenticated()) return next();
  return sendError(res, 401, "unauthenticated", "يجب تسجيل الدخول أولاً", "Login required");
};

/**
 * Passes when the user's role holds ANY of the given permission keys
 * (per the live permission_grants table — never raw role checks).
 * The matched grant set is attached to req for scoped data decisions.
 */
export function requirePermission(...keys: string[]): RequestHandler {
  return async (req, res, next) => {
    if (!req.isAuthenticated()) {
      return sendError(res, 401, "unauthenticated", "يجب تسجيل الدخول أولاً", "Login required");
    }
    const role = (req.user as any).role as string;
    const grants = await getPermissionsForRole(role);
    (req as any).grants = grants;
    if (keys.some((k) => grants.has(k))) return next();
    return sendError(res, 403, "forbidden", "ليس لديك صلاحية لهذه العملية", "You do not have permission for this action");
  };
}

/** Blocks the request with 403/feature_disabled when the flag is off for the user's role. */
export function requireFeature(key: string): RequestHandler {
  return async (req, res, next) => {
    const role = req.isAuthenticated() ? ((req.user as any).role as string) : "";
    if (await isFeatureEnabled(key, role)) return next();
    return sendError(res, 403, "feature_disabled", "هذه الميزة معطّلة حالياً", "This feature is currently disabled");
  };
}

/** Returns the grant set computed by requirePermission/requireAuth flows. */
export function grantsOf(req: any): Set<string> {
  return (req.grants as Set<string>) ?? new Set();
}

import { db } from "./db";
import {
  users, permissionGrants, featureFlags, aprMetricDefinitions, scoreCardGridConfigs,
} from "@shared/schema";
import { DEFAULT_GRANTS, DEFAULT_FEATURE_FLAGS } from "@shared/permissions";
import { DEFAULT_APR_METRICS, DEFAULT_GRID_CONFIGS } from "@shared/project-defaults";
import { hashPassword } from "./password";
import { eq } from "drizzle-orm";

export const DEFAULT_ADMIN_USERNAME = "admin";

/**
 * Seeds the core system data. Idempotent: only inserts what is missing.
 * Returns the admin credentials when the admin was created in this run.
 */
export async function seedCore(): Promise<{ adminPassword?: string }> {
  const result: { adminPassword?: string } = {};

  // 1. Default admin — one and only one account on first run.
  const existingUsers = await db.select({ id: users.id }).from(users).limit(1);
  if (existingUsers.length === 0) {
    const password = process.env.ADMIN_DEFAULT_PASSWORD || "Qc!Portal_2026_Admin";
    await db.insert(users).values({
      username: DEFAULT_ADMIN_USERNAME,
      email: "admin@quality.portal",
      passwordHash: hashPassword(password),
      role: "admin",
      displayNameAr: "المدير العام",
      displayNameEn: "System Admin",
      forcePasswordChange: true,
    });
    result.adminPassword = password;
    console.log("─".repeat(60));
    console.log("✅ Default admin created:");
    console.log(`   username: ${DEFAULT_ADMIN_USERNAME}`);
    console.log(`   password: ${password}`);
    console.log("   (password change is forced on first login)");
    console.log("─".repeat(60));
  }

  // 2. Default permission grants (§5) — fill any missing role/key pair.
  const existingGrants = await db.select().from(permissionGrants);
  const have = new Set(existingGrants.map((g) => `${g.role}|${g.permissionKey}`));
  const toInsert: { role: string; permissionKey: string }[] = [];
  for (const [role, keys] of Object.entries(DEFAULT_GRANTS)) {
    for (const key of keys) {
      if (!have.has(`${role}|${key}`)) toInsert.push({ role, permissionKey: key });
    }
  }
  if (existingGrants.length === 0 && toInsert.length > 0) {
    await db.insert(permissionGrants).values(toInsert);
    console.log(`✅ Seeded ${toInsert.length} default permission grants`);
  }

  // 3. Default feature flags (§11.2) — insert missing keys only.
  const existingFlags = await db.select({ key: featureFlags.key }).from(featureFlags);
  const flagKeys = new Set(existingFlags.map((f) => f.key));
  const missingFlags = DEFAULT_FEATURE_FLAGS.filter((f) => !flagKeys.has(f.key));
  if (missingFlags.length > 0) {
    await db.insert(featureFlags).values(
      missingFlags.map((f) => ({ key: f.key, labelAr: f.labelAr, labelEn: f.labelEn, isEnabled: true })),
    );
    console.log(`✅ Seeded ${missingFlags.length} feature flags`);
  }

  return result;
}

/**
 * Seeds per-project defaults: APR metric definitions (§4.5) and the
 * Score Card grid (§8.6). Called whenever a project is created.
 */
export async function seedProjectDefaults(projectId: number): Promise<void> {
  const existingMetrics = await db.select({ id: aprMetricDefinitions.id })
    .from(aprMetricDefinitions)
    .where(eq(aprMetricDefinitions.projectId, projectId))
    .limit(1);
  if (existingMetrics.length === 0) {
    await db.insert(aprMetricDefinitions).values(
      DEFAULT_APR_METRICS.map((m, i) => ({
        projectId,
        key: m.key,
        labelAr: m.labelAr,
        labelEn: m.labelEn,
        valueType: m.valueType,
        excelHeader: m.excelHeader,
        displayOrder: i,
        isVisible: true,
      })),
    );
  }

  const existingGrid = await db.select({ id: scoreCardGridConfigs.id })
    .from(scoreCardGridConfigs)
    .where(eq(scoreCardGridConfigs.projectId, projectId))
    .limit(1);
  if (existingGrid.length === 0) {
    await db.insert(scoreCardGridConfigs).values(
      DEFAULT_GRID_CONFIGS.map((g, i) => ({
        projectId,
        metricKey: g.metricKey,
        labelAr: g.labelAr,
        labelEn: g.labelEn,
        weight: g.weight,
        scoringType: g.scoringType,
        tierDirection: g.tierDirection,
        tiers: g.tiers,
        binaryThreshold: g.binaryThreshold,
        binaryDirection: g.binaryDirection,
        aggregation: g.aggregation,
        sourceMetricKey: g.sourceMetricKey,
        displayOrder: i,
        isActive: true,
      })),
    );
  }
}

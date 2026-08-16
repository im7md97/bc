import { db, pool } from "./db";
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

  // Incremental column migration: dashboard_widgets was added later.
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS dashboard_widgets jsonb;`).catch(() => {});

  // 0. Lightweight migration for incremental tables (added after the initial
  //    db:reset). Drizzle-kit push is the canonical path; this CREATE-IF-NOT-EXISTS
  //    is just a safety net so an existing dev database picks up the new table.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schedules (
      id serial PRIMARY KEY,
      agent_id integer NOT NULL REFERENCES agents(id),
      week_start text NOT NULL,
      shifts_json text NOT NULL DEFAULT '{}',
      created_by_user_id integer REFERENCES users(id),
      created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now(),
      UNIQUE (agent_id, week_start)
    );
    CREATE TABLE IF NOT EXISTS schedule_settings (
      id serial PRIMARY KEY,
      project_id integer NOT NULL REFERENCES projects(id),
      week_start text NOT NULL,
      breaks_per_shift integer NOT NULL DEFAULT 1,
      break_duration_min integer NOT NULL DEFAULT 30,
      max_concurrent_breaks integer NOT NULL DEFAULT 2,
      updated_by_user_id integer REFERENCES users(id),
      updated_at timestamp NOT NULL DEFAULT now(),
      UNIQUE (project_id, week_start)
    );
    CREATE TABLE IF NOT EXISTS shift_swap_requests (
      id serial PRIMARY KEY,
      requester_agent_id integer NOT NULL REFERENCES agents(id),
      target_agent_id integer NOT NULL REFERENCES agents(id),
      week_start text NOT NULL,
      day_key text NOT NULL,
      day_keys jsonb,
      status varchar(30) NOT NULL DEFAULT 'pending_supervisor',
      requester_comment text,
      supervisor_comment text,
      wfm_comment text,
      supervisor_user_id integer REFERENCES users(id),
      wfm_user_id integer REFERENCES users(id),
      resolved_at timestamp,
      created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now()
    );
    ALTER TABLE shift_swap_requests ADD COLUMN IF NOT EXISTS day_keys jsonb;
    -- Migration: supervisor no longer edits schedules directly; only WFM does.
    DELETE FROM permission_grants WHERE role='supervisor' AND permission_key='schedule.manage';
    CREATE TABLE IF NOT EXISTS attendance (
      id serial PRIMARY KEY,
      agent_id integer NOT NULL REFERENCES agents(id),
      date text NOT NULL,
      status varchar(20) NOT NULL,
      note text,
      recorded_by_user_id integer REFERENCES users(id),
      created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now(),
      UNIQUE (agent_id, date)
    );
    CREATE TABLE IF NOT EXISTS coaching_sessions (
      id serial PRIMARY KEY,
      agent_id integer NOT NULL REFERENCES agents(id),
      supervisor_user_id integer NOT NULL REFERENCES users(id),
      session_type varchar(20) NOT NULL,
      status varchar(30) NOT NULL DEFAULT 'pending_agent',
      positive_points text,
      mistakes text,
      improvement_plan text,
      target_metric text,
      deadline text,
      agent_acknowledged_at timestamp,
      agent_comment text,
      completed_at timestamp,
      created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS supervisor_schedules (
      id serial PRIMARY KEY,
      supervisor_user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      week_start text NOT NULL,
      shifts_json text NOT NULL DEFAULT '{}',
      created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now(),
      UNIQUE (supervisor_user_id, week_start)
    );
  `);

  // 1. Default admin — one and only one account on first run.
  //    If ADMIN_RESET_PASSWORD=1 is set, the password is force-reset on every
  //    boot so a locked-out operator can log back in. Unset it after login.
  const existingAdmin = await db.select().from(users).where(eq(users.username, DEFAULT_ADMIN_USERNAME)).limit(1);
  const password = process.env.ADMIN_DEFAULT_PASSWORD || "Qc!Portal_2026_Admin";
  if (existingAdmin.length === 0) {
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
  } else if (process.env.ADMIN_RESET_PASSWORD === "1") {
    await db.update(users)
      .set({ passwordHash: hashPassword(password), forcePasswordChange: true })
      .where(eq(users.username, DEFAULT_ADMIN_USERNAME));
    console.log("─".repeat(60));
    console.log("🔑 Admin password RESET (ADMIN_RESET_PASSWORD=1):");
    console.log(`   username: ${DEFAULT_ADMIN_USERNAME}`);
    console.log(`   password: ${password}`);
    console.log("   ⚠️  Remove the ADMIN_RESET_PASSWORD env var after logging in.");
    console.log("─".repeat(60));
  }

  // 2. Default permission grants (§5) — fill any missing role/key pair so that
  //    new permissions added in later releases land on existing databases too.
  const existingGrants = await db.select().from(permissionGrants);
  const have = new Set(existingGrants.map((g) => `${g.role}|${g.permissionKey}`));
  const toInsert: { role: string; permissionKey: string }[] = [];
  for (const [role, keys] of Object.entries(DEFAULT_GRANTS)) {
    for (const key of keys) {
      if (!have.has(`${role}|${key}`)) toInsert.push({ role, permissionKey: key });
    }
  }
  if (toInsert.length > 0) {
    // Safety net: onConflictDoNothing() protects against races between the
    // preceding SELECT and INSERT (parallel deploys, retried containers…).
    await db.insert(permissionGrants).values(toInsert).onConflictDoNothing();
    console.log(`✅ Seeded ${toInsert.length} permission grants`);
  }

  // 3. Default feature flags (§11.2) — insert missing keys only.
  const existingFlags = await db.select({ key: featureFlags.key }).from(featureFlags);
  const flagKeys = new Set(existingFlags.map((f) => f.key));
  const missingFlags = DEFAULT_FEATURE_FLAGS.filter((f) => !flagKeys.has(f.key));
  if (missingFlags.length > 0) {
    await db.insert(featureFlags).values(
      missingFlags.map((f) => ({ key: f.key, labelAr: f.labelAr, labelEn: f.labelEn, isEnabled: true })),
    ).onConflictDoNothing();
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

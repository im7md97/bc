/**
 * Deletes everything from the dev database except the super_admin account
 * and the seeded permission_grants + feature_flags.
 *
 *   npm run db:wipe
 */
import "dotenv/config";
import pg from "pg";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL must be set");
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  console.log("⏳ Wiping non-super-admin data...");

  // Order matters: child tables first so FKs don't block.
  const truncate = [
    "shift_swap_requests",
    "schedule_settings",
    "schedules",
    "qc_entries",
    "score_card_lines",
    "score_cards",
    "agent_latest_apr",
    "apr_rows",
    "apr_snapshots",
    "notifications",
    "agents",
    "supervisors_projects",
    "apr_metric_definitions",
    "score_card_grid_configs",
    "projects",
  ];
  for (const table of truncate) {
    await client.query(`DELETE FROM ${table};`);
  }
  await client.query(`DELETE FROM users WHERE role != 'super_admin';`);
  // Reset sequences
  for (const t of ["projects", "agents", "apr_snapshots", "apr_rows", "schedules", "score_cards", "score_card_lines", "notifications", "qc_entries", "shift_swap_requests", "schedule_settings"]) {
    await client.query(`ALTER SEQUENCE IF EXISTS ${t}_id_seq RESTART WITH 1;`).catch(() => {});
  }
  const { rows } = await client.query("SELECT username, role FROM users");
  console.log("✅ Remaining users:");
  for (const r of rows) console.log(`   ${r.username} (${r.role})`);
  await client.end();
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });

/**
 * Drops EVERYTHING in the public schema, re-creates all tables from
 * shared/schema.ts (via drizzle-kit push), then seeds the default admin,
 * permission grants and feature flags.
 *
 *   npm run db:reset
 */
import "dotenv/config";
import pg from "pg";
import { execSync } from "child_process";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL must be set");

  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  console.log("⏳ Dropping public schema (all tables)...");
  await client.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await client.end();
  console.log("✅ Schema dropped");

  console.log("⏳ Pushing fresh schema (drizzle-kit push)...");
  execSync("npx drizzle-kit push --force", { stdio: "inherit" });

  console.log("⏳ Seeding...");
  const { seedCore } = await import("../server/seed");
  await seedCore();
  console.log("✅ Reset complete");
  process.exit(0);
}

main().catch((err) => {
  console.error("db:reset failed:", err);
  process.exit(1);
});

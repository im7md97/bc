/**
 * Starts a temporary embedded PostgreSQL cluster for local development.
 * Data lives in .pgdata (gitignored). Keep this process running while
 * developing; the app connects via DATABASE_URL in .env.
 *
 *   npm run db:start
 */
import "dotenv/config";
import EmbeddedPostgres from "embedded-postgres";
import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), ".pgdata");
const PORT = Number(process.env.PGPORT || 5433);
const DB_NAME = process.env.PGDATABASE || "qcportal";

async function main() {
  const firstRun = !fs.existsSync(path.join(DATA_DIR, "PG_VERSION"));

  const pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: "postgres",
    password: "postgres",
    port: PORT,
    persistent: true,
  });

  if (firstRun) {
    console.log("⏳ Initialising embedded PostgreSQL cluster...");
    await pg.initialise();
  }

  await pg.start();
  console.log(`✅ PostgreSQL running on port ${PORT}`);

  if (firstRun) {
    await pg.createDatabase(DB_NAME);
    console.log(`✅ Database "${DB_NAME}" created`);
  }

  console.log(`   DATABASE_URL=postgresql://postgres:postgres@localhost:${PORT}/${DB_NAME}`);
  console.log("   Press Ctrl+C to stop.");

  const stop = async () => {
    console.log("\n⏳ Stopping PostgreSQL...");
    await pg.stop();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((err) => {
  console.error("Failed to start embedded PostgreSQL:", err);
  process.exit(1);
});

import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL must be set.");

// Railway / managed Postgres URLs almost always require SSL.
// Detect "rlwy.net", "render.com", "supabase", or an explicit sslmode flag
// and enable SSL automatically. Local dev (localhost) stays plaintext.
function buildPoolConfig(url: string): pg.PoolConfig {
  const lower = url.toLowerCase();
  const wantsSsl =
    lower.includes("sslmode=require") ||
    lower.includes("rlwy.net") ||
    lower.includes("railway.app") ||
    lower.includes("render.com") ||
    lower.includes("supabase.co") ||
    lower.includes("neon.tech") ||
    lower.includes("amazonaws.com");
  return {
    connectionString: url,
    ...(wantsSsl ? { ssl: { rejectUnauthorized: false } } : {}),
  };
}

export const pool = new pg.Pool(buildPoolConfig(process.env.DATABASE_URL));
export const db = drizzle(pool, { schema });

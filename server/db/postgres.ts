/**
 * PostgreSQL connection (production persistence).
 *
 * Local SQLite (src/db/index.ts) remains available for local-only development.
 * Any deployment that sets DATABASE_URL uses this module as the source of
 * truth for users/sessions/subscriptions/entitlements/trades/audit log.
 */

import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../../database/schema";

let pool: Pool | null = null;
let db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function isPostgresConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

export function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL?.trim();
    if (!connectionString) {
      throw new Error("DATABASE_URL is not configured.");
    }
    pool = new Pool({
      connectionString,
      ssl: connectionString.includes("localhost") ? false : { rejectUnauthorized: false },
      max: Number(process.env.PG_POOL_MAX || 10),
    });
  }
  return pool;
}

export function getDb() {
  if (!db) {
    db = drizzle(getPool(), { schema });
  }
  return db;
}

/** Real connectivity check — used by /health/ready. Never throws. */
export async function checkPostgresHealth(): Promise<{ healthy: boolean; error: string | null }> {
  if (!isPostgresConfigured()) {
    return { healthy: false, error: "DATABASE_URL not configured" };
  }
  try {
    await getPool().query("SELECT 1");
    return { healthy: true, error: null };
  } catch (error: any) {
    return { healthy: false, error: error?.message ?? "Unknown Postgres error" };
  }
}

export async function closePostgresPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    db = null;
  }
}

export { schema };

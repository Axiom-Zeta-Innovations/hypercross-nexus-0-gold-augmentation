/**
 * Applies pending PostgreSQL migrations from database/migrations/.
 * Usage: DATABASE_URL=postgres://... npx tsx scripts/migrate.ts
 */
import "dotenv/config";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { getDb, closePostgresPool, isPostgresConfigured } from "../server/db/postgres";

async function run() {
  if (!isPostgresConfigured()) {
    console.error("DATABASE_URL is not set. Refusing to run migrations.");
    process.exit(1);
  }

  console.log("Applying PostgreSQL migrations from database/migrations ...");
  await migrate(getDb(), { migrationsFolder: "./database/migrations" });
  console.log("Migrations applied successfully.");
  await closePostgresPool();
}

run().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});

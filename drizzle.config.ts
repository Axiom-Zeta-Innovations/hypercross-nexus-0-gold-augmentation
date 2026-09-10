import type { Config } from "drizzle-kit";

export default {
  schema: "./database/schema/index.ts",
  out: "./database/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL || "postgres://placeholder:placeholder@localhost:5432/placeholder",
  },
} satisfies Config;

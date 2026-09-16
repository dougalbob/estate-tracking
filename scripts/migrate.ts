import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
const path = process.env.DATABASE_PATH || "./data/estate.sqlite";
mkdirSync(dirname(path), { recursive: true });
const sqlite = new Database(path);
try {
  sqlite.pragma("foreign_keys = ON");
  migrate(drizzle(sqlite), { migrationsFolder: "./drizzle" });
  console.log("Database migrations complete.");
} finally {
  sqlite.close();
}

import "server-only";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import * as schema from "./schema";
let instance: ReturnType<typeof drizzle<typeof schema>> | undefined;
let sqliteInstance: Database.Database | undefined;
export function databasePath() {
  return process.env.NODE_ENV === "development" &&
    process.env.DEV_AUTH_ENABLED === "true"
    ? "./data/demo.sqlite"
    : process.env.DATABASE_PATH || "./data/estate.sqlite";
}
export function database() {
  if (!instance) {
    const path = databasePath();
    mkdirSync(dirname(path), { recursive: true });
    sqliteInstance = new Database(path);
    sqliteInstance.pragma("journal_mode = WAL");
    sqliteInstance.pragma("foreign_keys = ON");
    sqliteInstance.pragma("busy_timeout = 5000");
    instance = drizzle(sqliteInstance, { schema });
  }
  return instance;
}
export function closeDatabase() {
  if (sqliteInstance) sqliteInstance.close();
  sqliteInstance = undefined;
  instance = undefined;
}

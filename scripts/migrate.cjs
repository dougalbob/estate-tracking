const Database = require("better-sqlite3");
const { drizzle } = require("drizzle-orm/better-sqlite3");
const { migrate } = require("drizzle-orm/better-sqlite3/migrator");
const { mkdirSync } = require("node:fs");
const { dirname, join } = require("node:path");

const databasePath = process.env.DATABASE_PATH || "/data/estate.sqlite";
const migrationsFolder = join(__dirname, "..", "drizzle");

mkdirSync(dirname(databasePath), { recursive: true });

const sqlite = new Database(databasePath);
try {
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  migrate(drizzle(sqlite), { migrationsFolder });
  console.log("Database migrations complete.");
} finally {
  sqlite.close();
}

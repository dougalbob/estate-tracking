import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { organisations } from "../src/lib/db/schema";
test("migration can be reapplied and organisation defaults persist", () => {
  const sqlite = new Database(":memory:");
  try {
    const db = drizzle(sqlite);
    migrate(db, { migrationsFolder: "./drizzle" });
    migrate(db, { migrationsFolder: "./drizzle" });
    const now = new Date();
    db.insert(organisations)
      .values({
        id: "test-bank",
        name: "Fictional Bank",
        createdBy: "alex@example.invalid",
        createdAt: now,
        updatedAt: now,
      })
      .run();
    const record = db.select().from(organisations).get();
    assert.equal(record?.status, "not_contacted");
    assert.equal(record?.version, 1);
    assert.deepEqual(record?.phoneNumbers, []);
  } finally {
    sqlite.close();
  }
});

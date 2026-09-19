import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync } from "node:fs";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { organisations, tasks } from "../src/lib/db/schema";
import { taskStatuses } from "../src/lib/records/validation";
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

/**
 * The "waiting" status was renamed to "scheduled" in v0.2.10. The word lives in
 * stored rows, not just on screen, so the rename is a data migration. To prove
 * it, this replays history: migrate up to 0007, write a row in the old spelling,
 * then let 0008 run and check the row came out the other side.
 */
function migrationsUpTo(lastTag: string) {
  const journal = JSON.parse(
    require("node:fs").readFileSync("drizzle/meta/_journal.json", "utf8"),
  ) as { entries: { idx: number; tag: string }[] };
  const keep = journal.entries.filter(
    (e) => e.idx <= journal.entries.find((x) => x.tag === lastTag)!.idx,
  );
  const dir = mkdtempSync(join(tmpdir(), "mig-"));
  mkdirSync(join(dir, "meta"));
  for (const e of keep)
    copyFileSync(`drizzle/${e.tag}.sql`, join(dir, `${e.tag}.sql`));
  writeFileSync(
    join(dir, "meta", "_journal.json"),
    JSON.stringify({ ...journal, entries: keep }),
  );
  return dir;
}

test("renaming Waiting to Scheduled carries stored rows with it", () => {
  // The new spelling is what the app offers; the old spelling must be gone.
  // Cast, because the readonly tuple will not accept a word it cannot hold -
  // which is exactly the point being asserted.
  assert.ok(!(taskStatuses as readonly string[]).includes("waiting"));
  assert.ok(taskStatuses.includes("scheduled"));

  const before = migrationsUpTo("0007_contact_map_link");
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite);
  try {
    migrate(db, { migrationsFolder: before });
    // A row exactly as v0.2.9 would have left it: no type, no outcome, and the
    // old status word. Both new columns really are absent at this point.
    const columns = sqlite.prepare("PRAGMA table_info(tasks)").all() as {
      name: string;
    }[];
    assert.ok(!columns.some((c) => c.name === "kind"));
    assert.ok(!columns.some((c) => c.name === "outcome"));
    // Raw SQL on purpose: the current schema knows about the new columns, so
    // these rows have to be written the way v0.2.9 wrote them.
    const insert = sqlite.prepare(
      "INSERT INTO tasks (id, title, detail, status, version, created_by," +
        " created_at, updated_at) VALUES (?, ?, '', ?, 1, ?, ?, ?)",
    );
    const now = new Date().toISOString();
    insert.run(
      "old-waiting-task",
      "Chase the bank",
      "waiting",
      "alex@example.invalid",
      now,
      now,
    );
    // An open task keeps its own status; only the renamed word may move.
    insert.run(
      "untouched-task",
      "Send the certificate",
      "to_do",
      "alex@example.invalid",
      now,
      now,
    );

    migrate(db, { migrationsFolder: "./drizzle" });

    const rows = db.select().from(tasks).all();
    assert.equal(
      rows.find((r) => r.id === "old-waiting-task")?.status,
      "scheduled",
    );
    assert.equal(rows.find((r) => r.id === "untouched-task")?.status, "to_do");
    // The new optional columns arrive empty rather than filled in.
    assert.equal(rows.find((r) => r.id === "old-waiting-task")?.kind, null);
    assert.equal(rows.find((r) => r.id === "old-waiting-task")?.outcome, null);
  } finally {
    sqlite.close();
    rmSync(before, { recursive: true, force: true });
  }
});

import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import * as schema from "../src/lib/db/schema";
import { recordStore } from "../src/lib/records/store";
import {
  guestSummary,
  guestSummaryLine,
  type Household,
} from "../src/lib/guests/store";
import {
  createEncryptedBackup,
  restoreEncryptedBackup,
} from "../src/lib/backup/backup";

const users = ["alex@example.invalid", "jamie@example.invalid"];

function setup() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle" });
  const store = recordStore(db, users);
  store.seedGatherings();
  return { sqlite, store, db };
}

test("whole-row save and cell save each bump the version and audit", () => {
  const { store } = setup();

  // Initial save
  const id = store.saveHousehold(
    {
      name: "Chris and Dianne and 2 children",
      partySize: 4,
      phone: "07700 900123",
      email: "chris@example.com",
      relationship: "Mum's cousin",
      ringing: users[0],
      funeral: "not_asked",
      wake: "not_asked",
      notes: "Vegetarian dietary requirement",
    },
    users[0],
  );

  let snap = store.snapshot();
  let row = snap.households.find((h) => h.id === id);
  assert.ok(row);
  assert.equal(row.name, "Chris and Dianne and 2 children");
  assert.equal(row.partySize, 4);
  assert.equal(row.version, 1);
  assert.equal(row.createdBy, users[0]);
  assert.equal(row.funeral, "not_asked");

  let revs = snap.revisions.filter((r) => r.entityId === id);
  assert.equal(revs.length, 1);
  assert.equal(revs[0].actor, users[0]);

  // Whole-row update (e.g. updating notes and party size)
  store.saveHousehold(
    {
      ...row,
      partySize: 5,
      notes: "Vegetarian and gluten free",
    },
    users[1],
  );

  snap = store.snapshot();
  row = snap.households.find((h) => h.id === id);
  assert.ok(row);
  assert.equal(row.partySize, 5);
  assert.equal(row.version, 2);
  assert.equal(row.notes, "Vegetarian and gluten free");

  revs = snap.revisions.filter((r) => r.entityId === id);
  assert.equal(revs.length, 2);
  assert.equal(revs[0].actor, users[1]);

  // Cell-level save sending the row
  store.saveHousehold(
    {
      ...row,
      funeral: "coming",
    },
    users[0],
  );

  snap = store.snapshot();
  row = snap.households.find((h) => h.id === id);
  assert.ok(row);
  assert.equal(row.funeral, "coming");
  assert.equal(row.version, 3);
});

test("a stale version is refused and the row is unchanged", () => {
  const { store } = setup();

  const id = store.saveHousehold(
    {
      name: "Uncle Bob",
      partySize: 1,
      phone: "0121 496 0123",
      funeral: "not_asked",
      wake: "not_asked",
    },
    users[0],
  );

  const initial = store.snapshot().households.find((h) => h.id === id)!;
  assert.equal(initial.version, 1);

  // Another user updates the household first
  store.saveHousehold(
    {
      ...initial,
      notes: "Called first",
    },
    users[1],
  );

  const updated = store.snapshot().households.find((h) => h.id === id)!;
  assert.equal(updated.version, 2);
  assert.equal(updated.notes, "Called first");

  // Attempting to save with stale version 1 must throw
  assert.throws(
    () =>
      store.saveHousehold(
        {
          ...initial,
          notes: "My stale overwrite",
        },
        users[0],
      ),
    /This record changed while you were editing/,
  );

  // The database remains unchanged from version 2
  const current = store.snapshot().households.find((h) => h.id === id)!;
  assert.equal(current.version, 2);
  assert.equal(current.notes, "Called first");
});

test("ticking Contacted stamps actor and time, unticking clears both", () => {
  const { store } = setup();

  const id = store.saveHousehold(
    {
      name: "Sarah and Mark",
      partySize: 2,
      phone: "07700 900456",
      ringing: users[0],
    },
    users[0],
  );

  let snap = store.snapshot();
  let row = snap.households.find((h) => h.id === id)!;
  assert.equal(row.contactedAt, null);
  assert.equal(row.contactedBy, null);
  assert.equal(row.version, 1);

  // Tick contacted
  store.setHouseholdContacted(
    {
      id,
      contacted: true,
      version: row.version,
    },
    users[0],
  );

  snap = store.snapshot();
  row = snap.households.find((h) => h.id === id)!;
  assert.ok(row.contactedAt);
  assert.equal(row.contactedBy, users[0]);
  assert.equal(row.version, 2);

  const contactRevs = snap.revisions.filter((r) => r.entityId === id);
  assert.equal(contactRevs[0].action, "contacted");

  // Untick contacted
  store.setHouseholdContacted(
    {
      id,
      contacted: false,
      version: row.version,
    },
    users[1],
  );

  snap = store.snapshot();
  row = snap.households.find((h) => h.id === id)!;
  assert.equal(row.contactedAt, null);
  assert.equal(row.contactedBy, null);
  assert.equal(row.version, 3);

  const untickRevs = snap.revisions.filter((r) => r.entityId === id);
  assert.equal(untickRevs[0].action, "uncontacted");

  // Stale version on contacted toggle is refused
  assert.throws(
    () =>
      store.setHouseholdContacted(
        {
          id,
          contacted: true,
          version: 1,
        },
        users[0],
      ),
    /This record changed while you were editing/,
  );
});

test("bin, restore, and permanent deletion refused while live", () => {
  const { store } = setup();

  const id = store.saveHousehold(
    {
      name: "Temporary Contact",
      partySize: 1,
    },
    users[0],
  );

  let row = store.snapshot().households.find((h) => h.id === id)!;

  // Permanent deletion refused while live
  assert.throws(
    () => store.deleteHousehold(id, row.version, users[0], true),
    /Move this record to the recoverable bin before permanent deletion/,
  );

  // Soft delete to bin
  store.deleteHousehold(id, row.version, users[0], false);

  let snap = store.snapshot();
  assert.ok(!snap.households.some((h) => h.id === id));
  let binned = snap.deletedHouseholds.find((h) => h.id === id);
  assert.ok(binned);
  assert.equal(binned.version, 2);
  assert.ok(binned.deletedAt);

  // Deleting again while already in bin is refused
  assert.throws(
    () => store.deleteHousehold(id, binned!.version, users[0], false),
    /already in the bin/,
  );

  // Restore from bin
  store.restoreHousehold(id, binned.version, users[1]);
  snap = store.snapshot();
  assert.ok(!snap.deletedHouseholds.some((h) => h.id === id));
  row = snap.households.find((h) => h.id === id)!;
  assert.ok(row);
  assert.equal(row.version, 3);
  assert.equal(row.deletedAt, null);

  // Move back to bin then permanently delete
  store.deleteHousehold(id, row.version, users[0], false);
  binned = store.snapshot().deletedHouseholds.find((h) => h.id === id)!;
  store.deleteHousehold(id, binned.version, users[0], true);

  snap = store.snapshot();
  assert.ok(!snap.households.some((h) => h.id === id));
  assert.ok(!snap.deletedHouseholds.some((h) => h.id === id));

  // Permanent deletion was audited
  const finalRevs = snap.revisions.filter((r) => r.entityId === id);
  assert.equal(finalRevs[0].action, "permanently_deleted");
});

test("the seeded gatherings exist and are editable", () => {
  const { store } = setup();

  let snap = store.snapshot();
  const funeral = snap.gatherings.find((g) => g.id === "funeral");
  const wake = snap.gatherings.find((g) => g.id === "wake");
  assert.ok(funeral);
  assert.ok(wake);
  assert.equal(funeral.name, "Funeral");
  assert.equal(wake.name, "Wake");

  // Edit gathering
  store.saveGathering(
    {
      id: "funeral",
      name: "Funeral",
      date: "2026-10-15",
      time: "11:30",
      place: "St Peter's Church, Harborne",
      notes: "Arrive 15 minutes before",
      version: funeral.version,
    },
    users[0],
  );

  snap = store.snapshot();
  const updatedFuneral = snap.gatherings.find((g) => g.id === "funeral")!;
  assert.equal(updatedFuneral.date, "2026-10-15");
  assert.equal(updatedFuneral.time, "11:30");
  assert.equal(updatedFuneral.place, "St Peter's Church, Harborne");
  assert.equal(updatedFuneral.version, 2);

  // Stale version is refused
  assert.throws(
    () =>
      store.saveGathering(
        {
          id: "funeral",
          name: "Funeral",
          date: "2026-10-16",
          version: 1,
        },
        users[1],
      ),
    /This record changed while you were editing/,
  );
});

test("the summary counts against a fixed list", () => {
  const now = new Date();
  const fixedList: Household[] = [
    {
      id: "1",
      name: "Family A",
      partySize: 4,
      phone: "0121 111",
      email: null,
      relationship: "Family",
      ringing: users[0],
      contactedAt: "2026-09-20T10:00:00Z",
      contactedBy: users[0],
      funeral: "coming",
      wake: "coming",
      notes: null,
      version: 1,
      createdBy: users[0],
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    },
    {
      id: "2",
      name: "Family B",
      partySize: 2,
      phone: "0121 222",
      email: null,
      relationship: "Neighbours",
      ringing: users[1],
      contactedAt: "2026-09-20T11:00:00Z",
      contactedBy: users[1],
      funeral: "awaiting_reply",
      wake: "not_asked",
      notes: null,
      version: 1,
      createdBy: users[0],
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    },
    {
      id: "3",
      name: "Family C",
      partySize: 1,
      phone: "0121 333",
      email: null,
      relationship: "Friend",
      ringing: users[0],
      contactedAt: null,
      contactedBy: null,
      funeral: "not_asked",
      wake: "not_asked",
      notes: null,
      version: 1,
      createdBy: users[0],
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    },
    {
      id: "4",
      name: "Family D",
      partySize: 3,
      phone: "0121 444",
      email: null,
      relationship: "Cousin",
      ringing: null,
      contactedAt: "2026-09-20T12:00:00Z",
      contactedBy: users[0],
      funeral: "not_coming",
      wake: "awaiting_reply",
      notes: null,
      version: 1,
      createdBy: users[0],
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    },
    {
      id: "5",
      name: "Family E",
      partySize: 2,
      phone: "0121 555",
      email: null,
      relationship: "Club",
      ringing: users[1],
      contactedAt: "2026-09-20T13:00:00Z",
      contactedBy: users[1],
      funeral: "not_sure",
      wake: "not_sure",
      notes: null,
      version: 1,
      createdBy: users[0],
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    },
    {
      id: "6",
      name: "Binned Family",
      partySize: 5,
      phone: null,
      email: null,
      relationship: null,
      ringing: null,
      contactedAt: null,
      contactedBy: null,
      funeral: "coming",
      wake: "coming",
      notes: null,
      version: 1,
      createdBy: users[0],
      createdAt: now,
      updatedAt: now,
      deletedAt: now, // Binned! Should be ignored
    },
  ];

  const summary = guestSummary(fixedList);

  assert.equal(summary.totalHouseholds, 5);
  // Party sizes: 4 + 2 + 1 + 3 + 2 = 12
  assert.equal(summary.totalPeople, 12);
  // Contacted: 1, 2, 4, 5 = 4
  assert.equal(summary.contactedCount, 4);
  // Still to ring: 3 = 1
  assert.equal(summary.stillToRingCount, 1);
  // Awaiting reply: Family B (funeral) and Family D (wake) = 2
  assert.equal(summary.awaitingReplyCount, 2);
  assert.equal(summary.funeralAwaitingCount, 1);
  assert.equal(summary.wakeAwaitingCount, 1);
  // Coming: Family A (4 people)
  assert.equal(summary.funeralComingCount, 1);
  assert.equal(summary.funeralComingPeople, 4);
  assert.equal(summary.wakeComingCount, 1);
  assert.equal(summary.wakeComingPeople, 4);

  const line = guestSummaryLine(summary);
  assert.equal(
    line,
    "5 households · 12 people · 4 contacted · 2 awaiting reply · 1 coming to the funeral (4 people) · 1 to the wake (4 people) · 1 still to ring",
  );
});

test("backup round-trips households and gatherings", async () => {
  const root = await mkdtemp(join(tmpdir(), "guest-backup-test-"));
  const sourceDatabase = join(root, "source", "estate.sqlite");
  const sourceDocuments = join(root, "source", "documents");
  const backupPath = join(root, "estate.estate-backup");
  const restoredDatabase = join(root, "restored", "estate.sqlite");
  const restoredDocuments = join(root, "restored", "documents");

  await mkdir(join(sourceDocuments), { recursive: true });
  await mkdir(join(root, "source"), { recursive: true });

  let createdId = "";
  const sqlite = new Database(sourceDatabase);
  try {
    const db = drizzle(sqlite, { schema });
    migrate(db, { migrationsFolder: "./drizzle" });
    const store = recordStore(db, users);
    store.seedProjects();
    store.seedGatherings();
    createdId = store.saveHousehold(
      {
        name: "Uncle Arthur & Auntie May",
        partySize: 2,
        phone: "07700 900789",
        email: "arthur@example.com",
        relationship: "Uncle",
        funeral: "coming",
        wake: "coming",
      },
      users[0],
    );
  } finally {
    sqlite.close();
  }

  try {
    const password = "fictional recovery password";
    await createEncryptedBackup(password, backupPath, {
      databasePath: sourceDatabase,
      documentsRoot: sourceDocuments,
    });

    await restoreEncryptedBackup(backupPath, password, {
      databasePath: restoredDatabase,
      documentsRoot: restoredDocuments,
    });

    const restoredSqlite = new Database(restoredDatabase, { readonly: true });
    try {
      const row = restoredSqlite
        .prepare(
          "SELECT name, party_size, funeral FROM households WHERE id = ?",
        )
        .get(createdId) as
        { name: string; party_size: number; funeral: string } | undefined;
      assert.ok(row);
      assert.equal(row.name, "Uncle Arthur & Auntie May");
      assert.equal(row.party_size, 2);
      assert.equal(row.funeral, "coming");

      const gathering = restoredSqlite
        .prepare("SELECT name FROM gatherings WHERE id = ?")
        .get("funeral") as { name: string } | undefined;
      assert.ok(gathering);
      assert.equal(gathering.name, "Funeral");
    } finally {
      restoredSqlite.close();
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("restoring an older backup missing households and gatherings runs migration cleanly", async () => {
  const root = await mkdtemp(join(tmpdir(), "guest-old-backup-test-"));
  const sourceDatabase = join(root, "source", "estate.sqlite");
  const sourceDocuments = join(root, "source", "documents");
  const backupPath = join(root, "estate.estate-backup");
  const restoredDatabase = join(root, "restored", "estate.sqlite");
  const restoredDocuments = join(root, "restored", "documents");

  await mkdir(join(sourceDocuments), { recursive: true });
  await mkdir(join(root, "source"), { recursive: true });

  // Create database at schema 0010 (pre-0011, without households and gatherings)
  const sqlite = new Database(sourceDatabase);
  try {
    // Run migrations 0000 to 0010 manually
    const journal = JSON.parse(
      await import("node:fs").then((fs) =>
        fs.readFileSync("./drizzle/meta/_journal.json", "utf8"),
      ),
    );
    // Create migrations table
    sqlite.exec(
      "CREATE TABLE IF NOT EXISTS `__drizzle_migrations` (`id` integer PRIMARY KEY AUTOINCREMENT, `hash` text NOT NULL, `created_at` numeric)",
    );
    for (const entry of journal.entries) {
      if (entry.tag === "0011_guest_list") continue;
      const sql = await import("node:fs").then((fs) =>
        fs.readFileSync(`./drizzle/${entry.tag}.sql`, "utf8"),
      );
      for (const statement of sql.split("--> statement-breakpoint")) {
        const trimmed = statement.trim();
        if (trimmed) sqlite.exec(trimmed);
      }
      sqlite
        .prepare(
          "INSERT INTO `__drizzle_migrations` (`hash`, `created_at`) VALUES (?, ?)",
        )
        .run(entry.tag, entry.when);
    }

    // Verify households does not exist in source database
    const tables = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all() as { name: string }[];
    const tableNames = new Set(tables.map((t) => t.name));
    assert.ok(!tableNames.has("households"));
    assert.ok(!tableNames.has("gatherings"));
    assert.ok(tableNames.has("organisations"));
  } finally {
    sqlite.close();
  }

  try {
    const password = "fictional recovery password";
    // Create backup of the v0.2.18 database
    await createEncryptedBackup(password, backupPath, {
      databasePath: sourceDatabase,
      documentsRoot: sourceDocuments,
    });

    // Restore into v0.2.19 - should automatically migrate and succeed!
    await restoreEncryptedBackup(backupPath, password, {
      databasePath: restoredDatabase,
      documentsRoot: restoredDocuments,
    });

    const restoredSqlite = new Database(restoredDatabase, { readonly: true });
    try {
      const tables = restoredSqlite
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all() as { name: string }[];
      const names = new Set(tables.map((t) => t.name));
      assert.ok(names.has("households"));
      assert.ok(names.has("gatherings"));
    } finally {
      restoredSqlite.close();
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

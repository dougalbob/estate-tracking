import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import test from "node:test";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "../src/lib/db/schema";
import {
  createEncryptedBackup,
  inspectEncryptedBackup,
  restoreEncryptedBackup,
} from "../src/lib/backup/backup";
import { minimumBackupPasswordLength } from "../src/lib/backup/constants";
import { APP_VERSION } from "../src/lib/version";

test("encrypted backup includes a consistent database and documents and restores cleanly", async () => {
  const root = await mkdtemp(join(tmpdir(), "estate-backup-test-"));
  const sourceDatabase = join(root, "source", "estate.sqlite");
  const sourceDocuments = join(root, "source", "documents");
  const backupPath = join(root, "estate.estate-backup");
  const restoredDatabase = join(root, "restored", "estate.sqlite");
  const restoredDocuments = join(root, "restored", "documents");
  const imageBytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 1, 2, 3]);
  await mkdir(join(sourceDocuments, "nested"), { recursive: true });
  await writeFile(
    join(sourceDocuments, "nested", "certificate.txt"),
    "fictional certificate",
  );
  await writeFile(join(sourceDocuments, "photograph.png"), imageBytes);
  const sqlite = new Database(sourceDatabase);
  try {
    const db = drizzle(sqlite, { schema });
    migrate(db, { migrationsFolder: "./drizzle" });
    db.insert(schema.organisations)
      .values({
        id: "backup-test-org",
        name: "Fictional organisation",
        createdBy: "alex@example.invalid",
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .run();
  } finally {
    sqlite.close();
  }

  try {
    const password = "fictional recovery password";
    const metadata = await createEncryptedBackup(password, backupPath, {
      databasePath: sourceDatabase,
      documentsRoot: sourceDocuments,
    });
    assert.equal(metadata.documentFiles, 2);
    assert.equal(
      metadata.documentBytes,
      "fictional certificate".length + imageBytes.length,
    );
    assert.equal(metadata.appVersion, APP_VERSION);
    assert.ok((await stat(backupPath)).size > metadata.databaseBytes);
    assert.deepEqual(
      await inspectEncryptedBackup(backupPath, password),
      metadata,
    );
    await assert.rejects(
      inspectEncryptedBackup(backupPath, "wrong recovery password"),
      /unable to authenticate|Unsupported state|bad decrypt/i,
    );

    const restored = await restoreEncryptedBackup(backupPath, password, {
      databasePath: restoredDatabase,
      documentsRoot: restoredDocuments,
    });
    assert.deepEqual(restored, metadata);
    assert.equal(restored.appVersion, APP_VERSION);
    const restoredSqlite = new Database(restoredDatabase, { readonly: true });
    try {
      const row = restoredSqlite
        .prepare("SELECT name FROM organisations WHERE id = ?")
        .get("backup-test-org") as { name: string } | undefined;
      assert.equal(row?.name, "Fictional organisation");
    } finally {
      restoredSqlite.close();
    }
    assert.equal(
      await readFile(
        join(restoredDocuments, "nested", "certificate.txt"),
        "utf8",
      ),
      "fictional certificate",
    );
    assert.deepEqual(
      await readFile(join(restoredDocuments, "photograph.png")),
      imageBytes,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("backup passwords have an explicit minimum and backups reject too-short passwords", async () => {
  assert.equal(minimumBackupPasswordLength, 12);
  const root = await mkdtemp(join(tmpdir(), "estate-backup-password-test-"));
  try {
    await assert.rejects(
      createEncryptedBackup("too-short", join(root, "backup"), {
        databasePath: join(root, "missing.sqlite"),
      }),
      /at least 12 characters/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("backup filename includes version and London time", () => {
  // Mirrors logic in src/app/api/backup/download/route.ts – ensures version
  // appears and timestamp uses Europe/London 24h HHmm without colon, sortable.
  const now = new Date("2026-09-20T13:30:00Z"); // 14:30 BST
  const datePart = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const timePart = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(now)
    .replace(":", "");
  const filename = `estate-backup-v${APP_VERSION}-${datePart}-${timePart}.estate-backup`;
  assert.match(
    filename,
    /^estate-backup-v\d+\.\d+\.\d+-\d{4}-\d{2}-\d{2}-\d{4}\.estate-backup$/,
  );
  assert.equal(datePart, "2026-09-20");
  assert.equal(timePart, "1430");
});

test("backup panel preserves the server filename with a versioned London fallback", async () => {
  const panel = await readFile("src/components/backup-panel.tsx", "utf8");
  assert.match(panel, /import \{ APP_VERSION \} from "@\/lib\/version"/);
  assert.ok(panel.includes('response.headers.get("Content-Disposition")'));
  assert.ok(panel.includes("if (match) filename = match[1]"));
  assert.ok(panel.includes("if (!filename)"));
  assert.ok(panel.includes('timeZone: "Europe/London"'));
  assert.ok(panel.includes("hour12: false"));
  assert.ok(
    panel.includes(
      "estate-backup-v${APP_VERSION}-${datePart}-${timePart}.estate-backup",
    ),
  );
  assert.ok(panel.includes("anchor.download = filename"));
  assert.ok(!panel.includes("estate-organiser-backup-"));
  assert.ok(!panel.includes("toISOString"));
});

// Regression test for EXDEV on Unraid (and any other deployment where
// tmpdir() is a different mount from the data directory). The restore
// decrypts into tmpdir(), then copies staged content into a sibling
// temporary path beside the live target before performing atomic
// same-filesystem renames. This test forces that scenario by using
// /tmp (the usual tmpdir()) for the source/backup and /dev/shm for the
// restore targets — those are distinct tmpfs mounts on Linux, so a
// plain rename between them would throw EXDEV.
test("restore handles a temporary directory on a different filesystem", async () => {
  // /dev/shm is a tmpfs and is on a different device from /tmp on Linux.
  // If /dev/shm is not available (e.g. macOS, restricted sandboxes), skip
  // the test rather than failing.
  if (!existsSync("/dev/shm")) return;

  const sourceRoot = await mkdtemp(join("/tmp", "estate-backup-xdev-src-"));
  const targetRoot = await mkdtemp(join("/dev/shm", "estate-backup-xdev-dst-"));
  const sourceDatabase = join(sourceRoot, "source", "estate.sqlite");
  const sourceDocuments = join(sourceRoot, "source", "documents");
  const backupPath = join(sourceRoot, "estate.estate-backup");
  const targetDatabase = join(targetRoot, "live", "estate.sqlite");
  const targetDocuments = join(targetRoot, "live", "documents");

  // Pre-populate "live" data that must be replaced atomically.
  await mkdir(join(targetDocuments, "old"), { recursive: true });
  await writeFile(join(targetDocuments, "old", "stale.txt"), "stale data");
  const liveSqlite = new Database(targetDatabase);
  try {
    const liveDb = drizzle(liveSqlite, { schema });
    migrate(liveDb, { migrationsFolder: "./drizzle" });
    liveDb
      .insert(schema.organisations)
      .values({
        id: "live-before-org",
        name: "Stale live organisation",
        createdBy: "stale@example.invalid",
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .run();
  } finally {
    liveSqlite.close();
  }

  await mkdir(join(sourceDocuments), { recursive: true });
  await writeFile(join(sourceDocuments, "restored.txt"), "restored file");
  const sourceSqlite = new Database(sourceDatabase);
  try {
    const db = drizzle(sourceSqlite, { schema });
    migrate(db, { migrationsFolder: "./drizzle" });
    db.insert(schema.organisations)
      .values({
        id: "xdev-test-org",
        name: "Cross-device restored organisation",
        createdBy: "xdev@example.invalid",
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .run();
  } finally {
    sourceSqlite.close();
  }

  try {
    const password = "fictional xdev password";
    await createEncryptedBackup(password, backupPath, {
      databasePath: sourceDatabase,
      documentsRoot: sourceDocuments,
    });
    await restoreEncryptedBackup(backupPath, password, {
      databasePath: targetDatabase,
      documentsRoot: targetDocuments,
    });

    const restoredSqlite = new Database(targetDatabase, { readonly: true });
    try {
      const row = restoredSqlite
        .prepare("SELECT name FROM organisations WHERE id = ?")
        .get("xdev-test-org") as { name: string } | undefined;
      assert.equal(row?.name, "Cross-device restored organisation");
      const stale = restoredSqlite
        .prepare("SELECT id FROM organisations WHERE id = ?")
        .get("live-before-org");
      assert.equal(stale, undefined);
    } finally {
      restoredSqlite.close();
    }
    assert.equal(
      await readFile(join(targetDocuments, "restored.txt"), "utf8"),
      "restored file",
    );
    assert.ok(!existsSync(join(targetDocuments, "old", "stale.txt")));

    // No leftover *.restore-new-* or *.before-restore-* debris should
    // remain in the live directory after a successful restore.
    const liveDir = join(targetRoot, "live");
    for (const entry of await readdir(liveDir)) {
      assert.ok(
        !entry.includes(".restore-new-") && !entry.includes(".before-restore-"),
        `leftover temp path in live dir: ${entry}`,
      );
    }
  } finally {
    await rm(sourceRoot, { recursive: true, force: true });
    await rm(targetRoot, { recursive: true, force: true });
  }
});

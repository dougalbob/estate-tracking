import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
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

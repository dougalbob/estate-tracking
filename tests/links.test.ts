import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "../src/lib/db/schema";
import { recordStore } from "../src/lib/records/store";
const users = ["alex@example.invalid", "jamie@example.invalid"];
const task = {
  title: "Send certificate",
  detail: "Ask for a receipt",
  organisationId: null,
  interactionId: null,
  projectId: "notifications",
  assignee: users[1],
  status: "to_do",
  dueDate: "2026-10-02",
  followUpDate: null,
  deadline: null,
};
function setup() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle" });
  const store = recordStore(db, users);
  store.seedProjects();
  return { sqlite, store };
}
function makeDoc(store: ReturnType<typeof recordStore>, actor = users[0]) {
  return store.createDocumentFromUpload(
    {
      friendlyName: "Death Certificate",
      originalName: "cert.pdf",
      storageName: "cert-abc.pdf",
      mimeType: "application/pdf",
      size: 1234,
      category: null,
    },
    actor,
  );
}
test("document can be linked to a note and read back from both directions", () => {
  const { sqlite, store } = setup();
  try {
    const docId = makeDoc(store);
    const noteId = store.saveInteraction(
      {
        organisationId: null,
        title: "Call with bank",
        detail: "Discussed the transfer",
        kind: "call",
        occurredAt: new Date().toISOString(),
        followUps: [],
      },
      users[0],
    );
    // Link from the document Edit popup (documentId + interactionId)
    const linkId = store.linkDocument(
      { documentId: docId, interactionId: noteId },
      users[0],
    );
    const snap = store.snapshot();
    assert.equal(snap.documentLinks.length, 1);
    assert.equal(snap.documentLinks[0].id, linkId);
    assert.equal(snap.documentLinks[0].documentId, docId);
    assert.equal(snap.documentLinks[0].interactionId, noteId);
    // Reverse lookup: from the document side
    const fromDoc = snap.documentLinks.filter((l) => l.documentId === docId);
    assert.equal(fromDoc.length, 1);
    assert.equal(fromDoc[0].interactionId, noteId);
    // Reverse lookup: from the note side
    const fromNote = snap.documentLinks.filter(
      (l) => l.interactionId === noteId,
    );
    assert.equal(fromNote.length, 1);
    assert.equal(fromNote[0].documentId, docId);
    // Linking the same pair again is a tolerated duplicate – same row, no second
    const dup = store.linkDocument(
      { documentId: docId, interactionId: noteId },
      users[1],
    );
    assert.equal(dup, linkId);
    assert.equal(store.snapshot().documentLinks.length, 1);
  } finally {
    sqlite.close();
  }
});
test("linking a document to a task from either side shares one document_links row", () => {
  const { sqlite, store } = setup();
  try {
    const docId = makeDoc(store);
    const taskId = store.saveTask(task, users[0]);
    // doc -> task
    const linkId = store.linkDocument({ documentId: docId, taskId }, users[0]);
    let snap = store.snapshot();
    assert.equal(snap.documentLinks.length, 1);
    assert.equal(snap.documentLinks[0].documentId, docId);
    assert.equal(snap.documentLinks[0].taskId, taskId);
    // Linking the same pair from the task Edit popup returns the existing row
    const again = store.linkDocument({ documentId: docId, taskId }, users[1]);
    assert.equal(again, linkId);
    snap = store.snapshot();
    assert.equal(snap.documentLinks.length, 1);
    // After unlink, both directions are empty
    store.unlinkDocument(linkId, users[0]);
    snap = store.snapshot();
    assert.equal(snap.documentLinks.length, 0);
  } finally {
    sqlite.close();
  }
});

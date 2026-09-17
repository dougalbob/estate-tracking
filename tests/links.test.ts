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

const contact = {
  name: "Bank1",
  mainContact: null,
  phoneNumbers: [] as string[],
  email: null,
  reference: null,
  notes: null,
  status: "not_contacted" as const,
  projectIds: [] as string[],
};
test("an unlinked task can be attached to a contact and the change is versioned", () => {
  const { sqlite, store } = setup();
  try {
    const organisationId = store.saveOrganisation(contact, users[0]);
    const taskId = store.saveTask(task, users[0]);
    const before = store.snapshot().tasks.find((t) => t.id === taskId)!;
    const linked = store.linkTaskToOrganisation(
      { taskId, organisationId, version: before.version },
      users[1],
    );
    assert.equal(linked, taskId);
    const after = store.snapshot().tasks.find((t) => t.id === taskId)!;
    assert.equal(after.organisationId, organisationId);
    assert.equal(after.version, before.version + 1);
    // Every other field is untouched by the link
    assert.equal(after.title, before.title);
    assert.equal(after.detail, before.detail);
    assert.equal(after.assignee, before.assignee);
    assert.equal(after.status, before.status);
    assert.equal(after.dueDate, before.dueDate);
    assert.equal(after.projectId, before.projectId);
    // The link is recorded in the history the user reads in the app
    const revisions = store
      .snapshot()
      .revisions.filter((r) => r.entity === "task" && r.entityId === taskId);
    assert.equal(revisions.length, 2);
    const update = revisions.find((r) => r.action === "updated")!;
    assert.equal(update.actor, users[1]);
    assert.equal(update.after.organisationId, organisationId);
  } finally {
    sqlite.close();
  }
});
test("attaching to a contact refuses a stale version instead of overwriting it", () => {
  const { sqlite, store } = setup();
  try {
    const organisationId = store.saveOrganisation(contact, users[0]);
    const taskId = store.saveTask(task, users[0]);
    const stale = store.snapshot().tasks.find((t) => t.id === taskId)!.version;
    // Someone else edits the task after this screen was loaded
    store.saveTask(
      { ...task, id: taskId, version: stale, title: "Renamed" },
      users[1],
    );
    assert.throws(
      () =>
        store.linkTaskToOrganisation(
          { taskId, organisationId, version: stale },
          users[0],
        ),
      /changed|reload|conflict/i,
    );
    const after = store.snapshot().tasks.find((t) => t.id === taskId)!;
    assert.equal(after.organisationId, null);
    assert.equal(after.title, "Renamed");
  } finally {
    sqlite.close();
  }
});
test("a task that already belongs to another contact is not silently moved", () => {
  const { sqlite, store } = setup();
  try {
    const first = store.saveOrganisation(contact, users[0]);
    const second = store.saveOrganisation(
      { ...contact, name: "Bank2" },
      users[0],
    );
    const taskId = store.saveTask({ ...task, organisationId: first }, users[0]);
    const version = store
      .snapshot()
      .tasks.find((t) => t.id === taskId)!.version;
    assert.throws(
      () =>
        store.linkTaskToOrganisation(
          { taskId, organisationId: second, version },
          users[0],
        ),
      /another contact/i,
    );
    assert.equal(
      store.snapshot().tasks.find((t) => t.id === taskId)!.organisationId,
      first,
    );
  } finally {
    sqlite.close();
  }
});
test("attaching refuses a contact in the bin and a task that is already gone", () => {
  const { sqlite, store } = setup();
  try {
    const organisationId = store.saveOrganisation(contact, users[0]);
    const taskId = store.saveTask(task, users[0]);
    const version = store
      .snapshot()
      .tasks.find((t) => t.id === taskId)!.version;
    store.deleteRecord("organisation", organisationId, 1, users[0]);
    assert.throws(
      () =>
        store.linkTaskToOrganisation(
          { taskId, organisationId, version },
          users[0],
        ),
      /no longer available/i,
    );
    assert.throws(
      () =>
        store.linkTaskToOrganisation(
          { taskId: "missing", organisationId, version },
          users[0],
        ),
      /no longer available/i,
    );
  } finally {
    sqlite.close();
  }
});
test("a task created from a note can only be attached to the same contact as its note", () => {
  const { sqlite, store } = setup();
  try {
    const otherContact = store.saveOrganisation(
      { ...contact, name: "Bank2" },
      users[0],
    );
    // A quick note with no contact yet, plus a task that came from it: both are
    // unlinked, but the rule is that a follow-up task belongs where its note does
    const noteId = store.saveInteraction(
      {
        organisationId: null,
        title: "Call",
        detail: "Spoke to the bank",
        kind: "call",
        occurredAt: new Date().toISOString(),
        followUps: [],
      },
      users[0],
    );
    const taskId = store.saveTask(
      { ...task, interactionId: noteId, organisationId: null },
      users[0],
    );
    const version = store
      .snapshot()
      .tasks.find((t) => t.id === taskId)!.version;
    assert.throws(
      () =>
        store.linkTaskToOrganisation(
          { taskId, organisationId: otherContact, version },
          users[0],
        ),
      /same organisation/i,
    );
  } finally {
    sqlite.close();
  }
});
test("a contact created with a task is saved once: both exist and are linked", () => {
  const { sqlite, store } = setup();
  try {
    const result = store.saveRecordWithNewOrganisation(
      "task",
      task,
      {
        ...contact,
        name: "New Solicitor",
        phoneNumbers: ["0121 000 0000"],
        email: "a@example.invalid",
      },
      users[0],
    );
    const snap = store.snapshot();
    assert.equal(snap.organisations.length, 1);
    assert.equal(snap.organisations[0].name, "New Solicitor");
    assert.deepEqual(snap.organisations[0].phoneNumbers, ["0121 000 0000"]);
    assert.equal(snap.organisations[0].email, "a@example.invalid");
    assert.equal(snap.organisations[0].status, "not_contacted");
    const saved = snap.tasks.find((t) => t.id === result.id)!;
    assert.equal(saved.organisationId, snap.organisations[0].id);
  } finally {
    sqlite.close();
  }
});
test("if the task cannot be saved, the new contact is not created either", () => {
  const { sqlite, store } = setup();
  try {
    assert.throws(() =>
      store.saveRecordWithNewOrganisation(
        "task",
        { ...task, assignee: "stranger@example.invalid" },
        { ...contact, name: "Should not exist" },
        users[0],
      ),
    );
    const snap = store.snapshot();
    assert.equal(snap.organisations.length, 0);
    assert.equal(snap.tasks.length, 0);
    assert.equal(snap.revisions.length, 0);
  } finally {
    sqlite.close();
  }
});
test("a note and its follow-up task are both attached to the contact created with them", () => {
  const { sqlite, store } = setup();
  try {
    const result = store.saveRecordWithNewOrganisation(
      "interaction",
      {
        organisationId: null,
        title: "First call",
        detail: "Discussed probate",
        kind: "call",
        occurredAt: new Date().toISOString(),
        followUps: [{ ...task, organisationId: null, interactionId: null }],
      },
      { ...contact, name: "New Bank" },
      users[0],
    );
    const snap = store.snapshot();
    const note = snap.interactions.find((n) => n.id === result.id)!;
    assert.equal(note.organisationId, result.organisationId);
    const followUp = snap.tasks.find((t) => t.interactionId === result.id)!;
    assert.equal(followUp.organisationId, result.organisationId);
  } finally {
    sqlite.close();
  }
});

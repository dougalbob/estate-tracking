import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "../src/lib/db/schema";
import { recordStore, RecordError } from "../src/lib/records/store";
import { attentionDate, londonToday } from "../src/lib/records/validation";
const users = ["alex@example.invalid", "jamie@example.invalid"];
const org = {
  name: "Bank1",
  mainContact: "Taylor",
  phoneNumbers: ["0121 000 0000"],
  email: "test@example.invalid",
  reference: "DEMO-123",
  notes: "Fictional",
  status: "not_contacted",
};
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
test("Bank1 flow persists two follow-ups, relations, attribution and independent call time", () => {
  const { sqlite, store } = setup();
  try {
    const id = store.saveOrganisation(org, users[0]);
    const noteId = store.saveInteraction(
      {
        organisationId: id,
        title: "Called bank about documents",
        detail: "A certificate is required",
        kind: "call",
        occurredAt: "2026-09-01T10:00:00.000Z",
        followUps: [
          task,
          {
            ...task,
            title: "Chase a response",
            assignee: null,
            followUpDate: "2026-10-12",
          },
        ],
      },
      users[0],
    );
    const state = store.snapshot();
    assert.equal(state.organisations[0].reference, "DEMO-123");
    assert.equal(state.tasks.length, 2);
    for (const t of state.tasks) {
      assert.equal(t.interactionId, noteId);
      assert.equal(t.organisationId, id);
      assert.equal(t.createdBy, users[0]);
    }
    assert.equal(state.interactions[0].occurredAt, "2026-09-01T10:00:00.000Z");
    assert.notEqual(
      state.interactions[0].createdAt,
      state.interactions[0].occurredAt,
    );
    assert.equal(state.revisions.length, 4);
  } finally {
    sqlite.close();
  }
});
test("invalid follow-up rolls back the entire interaction transaction", () => {
  const { sqlite, store } = setup();
  try {
    assert.throws(() =>
      store.saveInteraction(
        {
          organisationId: null,
          title: "",
          detail: "Quick capture",
          kind: "note",
          occurredAt: new Date().toISOString(),
          followUps: [task, { ...task, assignee: "stranger@example.invalid" }],
        },
        users[0],
      ),
    );
    assert.equal(store.snapshot().interactions.length, 0);
    assert.equal(store.snapshot().tasks.length, 0);
    assert.equal(store.snapshot().revisions.length, 0);
  } finally {
    sqlite.close();
  }
});
test("both users can edit while retaining original attribution and prior versions", () => {
  const { sqlite, store } = setup();
  try {
    const id = store.saveOrganisation(org, users[0]);
    const before = store.snapshot().organisations[0];
    store.saveOrganisation(
      { ...org, id, version: 1, reference: "CORRECTED" },
      users[1],
    );
    const after = store.snapshot().organisations[0];
    assert.equal(after.version, 2);
    assert.equal(after.createdBy, users[0]);
    assert.deepEqual(after.createdAt, before.createdAt);
    const revision = store
      .snapshot()
      .revisions.find((r) => r.action === "updated")!;
    assert.equal(revision.actor, users[1]);
    assert.equal(revision.before?.reference, "DEMO-123");
    assert.equal(revision.after.reference, "CORRECTED");
    assert.throws(
      () => store.saveOrganisation({ ...org, id, version: 1 }, users[0]),
      (e: unknown) => e instanceof RecordError && e.code === "conflict",
    );
    assert.equal(store.snapshot().revisions.length, 2);
  } finally {
    sqlite.close();
  }
});
test("task and note stale edits are rejected; original authors remain", () => {
  const { sqlite, store } = setup();
  try {
    const note = {
      organisationId: null,
      title: "",
      detail: "Find paperwork",
      kind: "note",
      occurredAt: new Date().toISOString(),
      followUps: [],
    };
    const noteId = store.saveInteraction(note, users[0]);
    store.saveInteraction(
      { ...note, id: noteId, version: 1, detail: "Updated" },
      users[1],
    );
    assert.throws(
      () =>
        store.saveInteraction({ ...note, id: noteId, version: 1 }, users[0]),
      (e: unknown) => e instanceof RecordError && e.code === "conflict",
    );
    const taskId = store.saveTask(task, users[0]);
    store.saveTask(
      { ...task, id: taskId, version: 1, status: "done" },
      users[1],
    );
    assert.throws(
      () => store.saveTask({ ...task, id: taskId, version: 1 }, users[0]),
      (e: unknown) => e instanceof RecordError && e.code === "conflict",
    );
    assert.equal(store.snapshot().tasks[0].createdBy, users[0]);
    assert.equal(store.snapshot().interactions[0].createdBy, users[0]);
  } finally {
    sqlite.close();
  }
});
test("resolution needs confirmation and never closes tasks", () => {
  const { sqlite, store } = setup();
  try {
    const id = store.saveOrganisation(org, users[0]);
    store.saveTask({ ...task, organisationId: id }, users[0]);
    assert.throws(
      () =>
        store.saveOrganisation(
          { ...org, id, version: 1, status: "resolved" },
          users[0],
        ),
      (e: unknown) => e instanceof RecordError && e.code === "confirm_resolve",
    );
    store.saveOrganisation(
      { ...org, id, version: 1, status: "resolved", confirmResolve: true },
      users[0],
    );
    assert.equal(store.snapshot().tasks[0].status, "to_do");
    assert.equal(store.snapshot().organisations[0].status, "resolved");
  } finally {
    sqlite.close();
  }
});
test("validation rejects impossible dates, invalid references and untrusted actors", () => {
  const { sqlite, store } = setup();
  try {
    for (const input of [
      { ...task, dueDate: "2026-02-30" },
      { ...task, organisationId: "missing" },
      { ...task, projectId: "missing" },
      { ...task, interactionId: "missing" },
      { ...task, assignee: "stranger" },
    ])
      assert.throws(() => store.saveTask(input, users[0]));
    assert.throws(() => store.saveTask(task, "intruder"));
    assert.equal(store.snapshot().tasks.length, 0);
  } finally {
    sqlite.close();
  }
});
test("unfiled notes can be linked later unless linked tasks would lose context", () => {
  const { sqlite, store } = setup();
  try {
    const note = {
      organisationId: null,
      title: "",
      detail: "Quick capture",
      kind: "note",
      occurredAt: new Date().toISOString(),
      followUps: [],
    };
    const id = store.saveInteraction(note, users[0]);
    assert.equal(store.snapshot().interactions[0].title, "Quick note");
    const organisationId = store.saveOrganisation(org, users[0]);
    store.saveInteraction(
      { ...note, id, version: 1, organisationId },
      users[0],
    );
    store.saveTask({ ...task, organisationId, interactionId: id }, users[0]);
    assert.throws(() =>
      store.saveInteraction({ ...note, id, version: 2 }, users[0]),
    );
  } finally {
    sqlite.close();
  }
});
test("date priorities and London daylight-saving boundaries", () => {
  assert.equal(
    attentionDate({
      dueDate: "2026-10-01",
      followUpDate: "2026-09-30",
      deadline: "2026-10-02",
    }),
    "2026-09-30",
  );
  assert.equal(
    attentionDate({ dueDate: null, followUpDate: null, deadline: null }),
    null,
  );
  assert.equal(londonToday(new Date("2026-03-29T23:30:00Z")), "2026-03-30");
  assert.equal(londonToday(new Date("2026-10-25T23:30:00Z")), "2026-10-25");
});

// --- New Stage 2 tests: projects and recoverable bin ---

test("project creation, renaming, duplicate prevention and version conflict", () => {
  const { sqlite, store } = setup();
  try {
    const id = store.saveProject({ name: "House Clearance" }, users[0]);
    let snap = store.snapshot();
    assert.equal(
      snap.projects.find((p) => p.id === id)?.name,
      "House Clearance",
    );
    // Duplicate name (case-insensitive) rejected
    assert.throws(() =>
      store.saveProject({ name: "house clearance" }, users[0]),
    );
    // Rename
    store.saveProject({ id, version: 1, name: "House & Garden" }, users[1]);
    snap = store.snapshot();
    assert.equal(
      snap.projects.find((p) => p.id === id)?.name,
      "House & Garden",
    );
    assert.equal(snap.projects.find((p) => p.id === id)?.createdBy, users[0]);
    // Stale version rejected
    assert.throws(
      () => store.saveProject({ id, version: 1, name: "Old" }, users[0]),
      (e: unknown) => e instanceof RecordError && e.code === "conflict",
    );
    // Revision history
    assert.ok(
      snap.revisions.some((r) => r.entity === "project" && r.entityId === id),
    );
  } finally {
    sqlite.close();
  }
});

test("organisation can link to multiple projects; tasks have one optional project", () => {
  const { sqlite, store } = setup();
  try {
    const p1 = store.saveProject({ name: "Project A" }, users[0]);
    const p2 = store.saveProject({ name: "Project B" }, users[0]);
    const orgId = store.saveOrganisation(
      { ...org, projectIds: [p1, p2] },
      users[0],
    );
    let snap = store.snapshot();
    const links = snap.organisationProjects.filter(
      (op) => op.organisationId === orgId,
    );
    assert.equal(links.length, 2);
    // Task with one project
    const taskId = store.saveTask(
      { ...task, organisationId: orgId, projectId: p1 },
      users[0],
    );
    assert.equal(
      store.snapshot().tasks.find((t) => t.id === taskId)?.projectId,
      p1,
    );
    // Update organisation to single project
    store.saveOrganisation(
      { ...org, id: orgId, version: 1, projectIds: [p1] },
      users[0],
    );
    snap = store.snapshot();
    assert.equal(
      snap.organisationProjects.filter((op) => op.organisationId === orgId)
        .length,
      1,
    );
    // Invalid project rejected
    assert.throws(() =>
      store.saveOrganisation(
        { ...org, id: orgId, version: 2, projectIds: ["missing"] },
        users[0],
      ),
    );
  } finally {
    sqlite.close();
  }
});

test("recoverable bin: soft delete moves to bin, restore brings back, no auto purge", () => {
  const { sqlite, store } = setup();
  try {
    const orgId = store.saveOrganisation(org, users[0]);
    const noteId = store.saveInteraction(
      {
        organisationId: orgId,
        title: "Call",
        detail: "Detail",
        kind: "call",
        occurredAt: new Date().toISOString(),
        followUps: [],
      },
      users[0],
    );
    const taskId = store.saveTask({ ...task, organisationId: orgId }, users[0]);
    const projId = store.saveProject({ name: "Temp Project" }, users[0]);

    // Soft delete organisation – should not cascade-delete tasks/interactions
    store.deleteRecord("organisation", orgId, 1, users[0], false);
    let snap = store.snapshot();
    assert.equal(snap.organisations.length, 0);
    assert.equal(snap.deletedOrganisations.length, 1);
    assert.equal(
      snap.tasks.length,
      1,
      "task should remain after org soft delete",
    );
    assert.equal(
      snap.interactions.length,
      1,
      "interaction should remain after org soft delete",
    );

    // Soft delete others
    store.deleteRecord("interaction", noteId, 1, users[0], false);
    store.deleteRecord("task", taskId, 1, users[0], false);
    store.deleteRecord("project", projId, 1, users[0], false);
    snap = store.snapshot();
    assert.equal(snap.deletedInteractions.length, 1);
    assert.equal(snap.deletedTasks.length, 1);
    assert.equal(snap.deletedProjects.length, 1);
    assert.equal(snap.tasks.length, 0);
    assert.equal(snap.interactions.length, 0);

    // Restore
    store.restoreRecord("organisation", orgId, 2, users[0]);
    store.restoreRecord("interaction", noteId, 2, users[0]);
    store.restoreRecord("task", taskId, 2, users[0]);
    store.restoreRecord("project", projId, 2, users[0]);
    snap = store.snapshot();
    assert.equal(snap.organisations.length, 1);
    assert.equal(snap.interactions.length, 1);
    assert.equal(snap.tasks.length, 1);
    assert.equal(
      snap.projects.find((p) => p.id === projId)?.name,
      "Temp Project",
    );
    assert.equal(snap.deletedOrganisations.length, 0);
  } finally {
    sqlite.close();
  }
});

test("permanent deletion requires bin first, retains revision history, does not cascade", () => {
  const { sqlite, store } = setup();
  try {
    const orgId = store.saveOrganisation(org, users[0]);
    const taskId = store.saveTask({ ...task, organisationId: orgId }, users[0]);
    const noteId = store.saveInteraction(
      {
        organisationId: orgId,
        title: "Call",
        detail: "Detail",
        kind: "call",
        occurredAt: new Date().toISOString(),
        followUps: [],
      },
      users[0],
    );

    // Permanent delete without bin should fail
    assert.throws(() =>
      store.deleteRecord("organisation", orgId, 1, users[0], true),
    );

    // Move to bin then permanently delete organisation – tasks/notes must remain (unlinked)
    store.deleteRecord("organisation", orgId, 1, users[0], false);
    store.deleteRecord("organisation", orgId, 2, users[0], true);
    let snap = store.snapshot();
    assert.equal(snap.organisations.length, 0);
    assert.equal(snap.deletedOrganisations.length, 0);
    assert.equal(snap.tasks.length, 1, "task not cascade-deleted");
    assert.equal(
      snap.tasks[0].organisationId,
      null,
      "task unlinked after org permanent deletion",
    );
    assert.equal(snap.interactions.length, 1);
    assert.equal(snap.interactions[0].organisationId, null);

    // Revisions remain
    assert.ok(
      snap.revisions.some(
        (r) => r.entity === "organisation" && r.entityId === orgId,
      ),
      "revision history must remain after permanent deletion",
    );

    // Permanent delete task
    store.deleteRecord("task", taskId, 1, users[0], false);
    store.deleteRecord("task", taskId, 2, users[0], true);
    snap = store.snapshot();
    assert.equal(snap.tasks.length, 0);
    assert.ok(
      snap.revisions.some((r) => r.entity === "task" && r.entityId === taskId),
    );

    // Permanent delete interaction – should unlink its tasks (none left) and keep other records
    store.deleteRecord("interaction", noteId, 1, users[0], false);
    store.deleteRecord("interaction", noteId, 2, users[0], true);
    snap = store.snapshot();
    assert.equal(snap.interactions.length, 0);
  } finally {
    sqlite.close();
  }
});

test("project deletion does not delete tasks or organisation links, only unlinks", () => {
  const { sqlite, store } = setup();
  try {
    const projId = store.saveProject({ name: "House Clearance" }, users[0]);
    const orgId = store.saveOrganisation(
      { ...org, projectIds: [projId] },
      users[0],
    );
    const taskId = store.saveTask({ ...task, projectId: projId }, users[0]);

    store.deleteRecord("project", projId, 1, users[0], false);
    let snap = store.snapshot();
    assert.equal(snap.projects.length, 3, "starter projects remain");
    assert.equal(snap.deletedProjects.length, 1);
    assert.equal(
      snap.tasks.find((t) => t.id === taskId)?.projectId,
      projId,
      "task keeps projectId after soft delete",
    );

    store.deleteRecord("project", projId, 2, users[0], true);
    snap = store.snapshot();
    assert.equal(snap.deletedProjects.length, 0);
    assert.equal(
      snap.tasks.find((t) => t.id === taskId)?.projectId,
      null,
      "task unlinked after permanent project deletion",
    );
    assert.equal(
      snap.organisationProjects.filter((op) => op.projectId === projId).length,
      0,
      "organisation-project links removed",
    );
    assert.equal(snap.organisations.length, 1, "organisation not deleted");
  } finally {
    sqlite.close();
  }
});

test("restore fails if linked organisation or project is in bin", () => {
  const { sqlite, store } = setup();
  try {
    const projId = store.saveProject({ name: "Temp" }, users[0]);
    const orgId = store.saveOrganisation(org, users[0]);
    const taskId = store.saveTask(
      { ...task, organisationId: orgId, projectId: projId },
      users[0],
    );

    // Delete org and proj, then task, then try to restore task before its dependencies
    store.deleteRecord("organisation", orgId, 1, users[0], false);
    store.deleteRecord("project", projId, 1, users[0], false);
    store.deleteRecord("task", taskId, 1, users[0], false);

    assert.throws(() => store.restoreRecord("task", taskId, 2, users[0]));

    // Restore dependencies then task
    store.restoreRecord("organisation", orgId, 2, users[0]);
    store.restoreRecord("project", projId, 2, users[0]);
    store.restoreRecord("task", taskId, 2, users[0]);
    assert.equal(store.snapshot().tasks.length, 1);
  } finally {
    sqlite.close();
  }
});

test("documents: upload, edit friendlyName/category, link reusable, unlink preserves file", () => {
  const { sqlite, store } = setup();
  try {
    const docId = store.createDocumentFromUpload(
      {
        friendlyName: "Death Certificate",
        originalName: "scan.pdf",
        storageName: "abc123.pdf",
        mimeType: "application/pdf",
        size: 1024,
        category: "certificate",
      },
      users[0],
    );
    let snap = store.snapshot();
    assert.equal(snap.documents.length, 1);
    assert.equal(snap.documents[0].friendlyName, "Death Certificate");

    // Edit friendlyName/category via saveDocument
    store.saveDocument(
      {
        id: docId,
        version: 1,
        friendlyName: "Cert - Updated",
        category: "correspondence",
        originalName: "scan.pdf",
        storageName: "abc123.pdf",
        mimeType: "application/pdf",
        size: 1024,
      },
      users[1],
    );
    snap = store.snapshot();
    assert.equal(snap.documents[0].friendlyName, "Cert - Updated");
    assert.equal(snap.documents[0].category, "correspondence");
    assert.equal(snap.documents[0].createdBy, users[0]);
    assert.equal(snap.documents[0].version, 2);

    // Link to organisation and task – reusable
    const orgId = store.saveOrganisation(org, users[0]);
    const taskId = store.saveTask({ ...task, organisationId: orgId }, users[0]);
    const link1 = store.linkDocument(
      { documentId: docId, organisationId: orgId },
      users[0],
    );
    const link2 = store.linkDocument(
      { documentId: docId, taskId },
      users[0],
    );
    snap = store.snapshot();
    assert.equal(snap.documentLinks.length, 2);
    // Idempotent – same link again returns same id
    const link1Dup = store.linkDocument(
      { documentId: docId, organisationId: orgId },
      users[0],
    );
    assert.equal(link1Dup, link1);
    assert.equal(store.snapshot().documentLinks.length, 2);

    // Unlink preserves file
    store.unlinkDocument(link1, users[0]);
    snap = store.snapshot();
    assert.equal(snap.documentLinks.length, 1);
    assert.equal(snap.documents.length, 1);
    assert.equal(snap.documentLinks[0].id, link2);

    // Validation: link to exactly one record
    assert.throws(() =>
      store.linkDocument(
        { documentId: docId, organisationId: orgId, taskId },
        users[0],
      ),
    );
    assert.throws(() =>
      store.linkDocument({ documentId: docId }, users[0] as any),
    );
  } finally {
    sqlite.close();
  }
});

test("documents: bin preserves file and links, permanent delete removes file reference and retains history", () => {
  const { sqlite, store } = setup();
  try {
    const docId = store.createDocumentFromUpload(
      {
        friendlyName: "Will",
        originalName: "will.pdf",
        storageName: "will123.pdf",
        mimeType: "application/pdf",
        size: 2048,
        category: "legal",
      },
      users[0],
    );
    const orgId = store.saveOrganisation(org, users[0]);
    store.linkDocument({ documentId: docId, organisationId: orgId }, users[0]);

    // Soft delete – moves to bin, link still in DB (filtered in UI)
    store.deleteRecord("document", docId, 1, users[0], false);
    let snap = store.snapshot();
    assert.equal(snap.documents.length, 0);
    assert.equal(snap.deletedDocuments.length, 1);
    assert.equal(snap.documentLinks.length, 1, "link remains after soft delete");

    // Restore
    store.restoreRecord("document", docId, 2, users[0]);
    snap = store.snapshot();
    assert.equal(snap.documents.length, 1);
    assert.equal(snap.deletedDocuments.length, 0);

    // Permanent delete requires bin first
    assert.throws(() =>
      store.deleteRecord("document", docId, 3, users[0], true),
    );
    store.deleteRecord("document", docId, 3, users[0], false);
    const res = store.deleteRecord("document", docId, 4, users[0], true) as any;
    assert.equal(res.storageName, "will123.pdf");
    snap = store.snapshot();
    assert.equal(snap.documents.length, 0);
    assert.equal(snap.deletedDocuments.length, 0);
    assert.equal(snap.documentLinks.length, 0, "cascade removes links on permanent delete");
    assert.ok(
      snap.revisions.some((r) => r.entity === "document" && r.entityId === docId),
      "revision history retained",
    );
  } finally {
    sqlite.close();
  }
});

test("documents: deleting linked record does not delete document, only unlinks", () => {
  const { sqlite, store } = setup();
  try {
    const docId = store.createDocumentFromUpload(
      {
        friendlyName: "Bank Letter",
        originalName: "letter.pdf",
        storageName: "letter.pdf",
        mimeType: "application/pdf",
        size: 512,
        category: "correspondence",
      },
      users[0],
    );
    const orgId = store.saveOrganisation(org, users[0]);
    store.linkDocument({ documentId: docId, organisationId: orgId }, users[0]);
    assert.equal(store.snapshot().documentLinks.length, 1);

    // Soft + permanent delete org – document must survive, link removed via cascade
    store.deleteRecord("organisation", orgId, 1, users[0], false);
    store.deleteRecord("organisation", orgId, 2, users[0], true);
    let snap = store.snapshot();
    assert.equal(snap.documents.length, 1, "document not cascade-deleted with org");
    assert.equal(snap.documentLinks.length, 0, "org link removed");
  } finally {
    sqlite.close();
  }
});

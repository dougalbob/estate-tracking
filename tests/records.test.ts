import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "../src/lib/db/schema";
import { recordStore, RecordError } from "../src/lib/records/store";
import {
  attentionDate,
  documentInput,
  everyoneAssignee,
  londonToday,
  organisationInput,
  taskKinds,
  taskStatuses,
} from "../src/lib/records/validation";
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

test("permanently deleting an organisation unlinks its financial records instead of failing", () => {
  const { sqlite, store } = setup();
  try {
    const orgId = store.saveOrganisation(org, users[0]);
    const expenseId = store.saveFinanceRecord(
      {
        kind: "expense",
        title: "Paid for certified copies",
        detail: "",
        category: "administration",
        amount: "25",
        occurredOn: "2026-09-10",
        fundedBy: users[0],
        beneficiary: null,
        organisationId: orgId,
        projectId: null,
      },
      users[0],
    );

    // Before the fix this threw a raw FOREIGN KEY constraint failure (the
    // permanent-delete branch forgot finance_records.organisation_id) and the
    // action turned it into a misleading "check your access" error.
    store.deleteRecord("organisation", orgId, 1, users[0], false);
    store.deleteRecord("organisation", orgId, 2, users[0], true);

    const snap = store.snapshot();
    assert.equal(snap.organisations.length, 0);
    const expense = snap.financeRecords.find((r) => r.id === expenseId);
    assert.ok(expense, "the financial record survives the organisation");
    assert.equal(
      expense.organisationId,
      null,
      "the financial record is unlinked, not deleted",
    );
    assert.equal(expense.amountPence, 2500, "its figures are untouched");
  } finally {
    sqlite.close();
  }
});

test("permanently deleting a project unlinks its financial records instead of failing", () => {
  const { sqlite, store } = setup();
  try {
    const projId = store.saveProject({ name: "House Clearance" }, users[0]);
    const liabilityId = store.saveFinanceRecord(
      {
        kind: "liability",
        title: "Gardener's outstanding invoice",
        detail: "",
        category: "unpaid_bill",
        amount: "120",
        occurredOn: "2026-09-11",
        fundedBy: null,
        beneficiary: null,
        organisationId: null,
        projectId: projId,
      },
      users[1],
    );

    store.deleteRecord("project", projId, 1, users[0], false);
    store.deleteRecord("project", projId, 2, users[0], true);

    const snap = store.snapshot();
    assert.equal(snap.projects.length, 3, "starter projects remain");
    const liability = snap.financeRecords.find((r) => r.id === liabilityId);
    assert.ok(liability, "the financial record survives the project");
    assert.equal(
      liability.projectId,
      null,
      "the financial record is unlinked, not deleted",
    );
    assert.equal(liability.amountPence, 12000, "its figures are untouched");
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
    const link2 = store.linkDocument({ documentId: docId, taskId }, users[0]);
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
    assert.equal(
      snap.documentLinks.length,
      1,
      "link remains after soft delete",
    );

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
    assert.equal(
      snap.documentLinks.length,
      0,
      "cascade removes links on permanent delete",
    );
    assert.ok(
      snap.revisions.some(
        (r) => r.entity === "document" && r.entityId === docId,
      ),
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
    assert.equal(
      snap.documents.length,
      1,
      "document not cascade-deleted with org",
    );
    assert.equal(snap.documentLinks.length, 0, "org link removed");
  } finally {
    sqlite.close();
  }
});

test("interactions: project save, change and clear with history", () => {
  const { sqlite, store } = setup();
  try {
    const p1 = store.saveProject({ name: "Project A" }, users[0]);
    const p2 = store.saveProject({ name: "Project B" }, users[0]);
    const note = {
      organisationId: null,
      title: "Called about the paperwork",
      detail: "Promised to send copies",
      kind: "call",
      occurredAt: new Date().toISOString(),
      followUps: [],
    };
    // Records saved without a project land under No project
    const id = store.saveInteraction(note, users[0]);
    assert.equal(
      store.snapshot().interactions.find((i) => i.id === id)?.projectId,
      null,
    );
    // File it, move it, then clear it again from Edit
    store.saveInteraction({ ...note, id, version: 1, projectId: p1 }, users[0]);
    assert.equal(
      store.snapshot().interactions.find((i) => i.id === id)?.projectId,
      p1,
    );
    store.saveInteraction({ ...note, id, version: 2, projectId: p2 }, users[1]);
    assert.equal(
      store.snapshot().interactions.find((i) => i.id === id)?.projectId,
      p2,
    );
    store.saveInteraction(
      { ...note, id, version: 3, projectId: null },
      users[1],
    );
    assert.equal(
      store.snapshot().interactions.find((i) => i.id === id)?.projectId,
      null,
    );
    // The project link is part of the readable history, like tasks. Found
    // by content rather than by position: the history is newest-first and
    // saves within the same millisecond would make the order unstable.
    const revisions = store
      .snapshot()
      .revisions.filter((r) => r.entity === "interaction" && r.entityId === id);
    assert.equal(revisions.length, 4);
    const updated = revisions.filter((r) => r.action === "updated");
    assert.equal(updated.length, 3);
    assert.ok(
      updated.some(
        (r) => r.before?.projectId == null && r.after.projectId === p1,
      ),
    );
    assert.ok(
      updated.some(
        (r) => r.before?.projectId === p1 && r.after.projectId === p2,
      ),
    );
    assert.ok(
      updated.some(
        (r) => r.before?.projectId === p2 && r.after.projectId == null,
      ),
    );
  } finally {
    sqlite.close();
  }
});

test("interactions: unknown or binned projects are refused on save", () => {
  const { sqlite, store } = setup();
  try {
    const note = {
      organisationId: null,
      title: "Called about the paperwork",
      detail: "Promised to send copies",
      kind: "call",
      occurredAt: new Date().toISOString(),
      followUps: [],
    };
    assert.throws(
      () => store.saveInteraction({ ...note, projectId: "missing" }, users[0]),
      (e: unknown) =>
        e instanceof RecordError && e.message === "Project no longer available",
    );
    const projId = store.saveProject({ name: "Temp" }, users[0]);
    store.deleteRecord("project", projId, 1, users[0], false);
    assert.throws(
      () => store.saveInteraction({ ...note, projectId: projId }, users[0]),
      (e: unknown) =>
        e instanceof RecordError && e.message === "Project no longer available",
    );
    // Same rule when filing an existing interaction from Edit
    const id = store.saveInteraction(note, users[0]);
    assert.throws(
      () =>
        store.saveInteraction(
          { ...note, id, version: 1, projectId: projId },
          users[0],
        ),
      (e: unknown) =>
        e instanceof RecordError && e.message === "Project no longer available",
    );
    assert.equal(
      store.snapshot().interactions.find((i) => i.id === id)?.projectId,
      null,
    );
  } finally {
    sqlite.close();
  }
});

test("project deletion keeps interactions while binned, unlinks on permanent deletion", () => {
  const { sqlite, store } = setup();
  try {
    const projId = store.saveProject({ name: "House Clearance" }, users[0]);
    const id = store.saveInteraction(
      {
        organisationId: null,
        title: "Called the auction house",
        detail: "Valuation visit booked",
        kind: "call",
        occurredAt: new Date().toISOString(),
        projectId: projId,
        followUps: [],
      },
      users[0],
    );
    store.deleteRecord("project", projId, 1, users[0], false);
    let snap = store.snapshot();
    assert.equal(
      snap.interactions.find((i) => i.id === id)?.projectId,
      projId,
      "interaction keeps projectId after soft delete",
    );
    store.deleteRecord("project", projId, 2, users[0], true);
    snap = store.snapshot();
    assert.equal(
      snap.interactions.find((i) => i.id === id)?.projectId,
      null,
      "interaction unlinked after permanent project deletion",
    );
    assert.equal(snap.interactions.length, 1, "interaction not deleted");
  } finally {
    sqlite.close();
  }
});

test("restoring an interaction is refused while its project is in the bin", () => {
  const { sqlite, store } = setup();
  try {
    const projId = store.saveProject({ name: "Temp" }, users[0]);
    const id = store.saveInteraction(
      {
        organisationId: null,
        title: "Called about the paperwork",
        detail: "Promised to send copies",
        kind: "call",
        occurredAt: new Date().toISOString(),
        projectId: projId,
        followUps: [],
      },
      users[0],
    );
    store.deleteRecord("project", projId, 1, users[0], false);
    store.deleteRecord("interaction", id, 1, users[0], false);
    assert.throws(
      () => store.restoreRecord("interaction", id, 2, users[0]),
      (e: unknown) =>
        e instanceof RecordError &&
        e.message === "The linked project is in the bin. Restore it first.",
    );
    store.restoreRecord("project", projId, 2, users[0]);
    store.restoreRecord("interaction", id, 2, users[0]);
    assert.equal(store.snapshot().interactions.length, 1);
    assert.equal(
      store.snapshot().interactions.find((i) => i.id === id)?.projectId,
      projId,
    );
  } finally {
    sqlite.close();
  }
});
// v0.2.9: the map link is typed in by hand, so it is only ever an http(s)
// address. Anything else is refused with a plain message rather than stored as
// a link that would not open when tapped.
test("contact map link accepts a web address and refuses anything else", () => {
  const map = "https://maps.google.com/?q=1+Example+Street";
  const good = organisationInput.safeParse({ ...org, mapUrl: map });
  assert.equal(good.success, true);
  if (good.success) assert.equal(good.data.mapUrl, map);
  // http is allowed as well: not every map link is https.
  assert.equal(
    organisationInput.safeParse({ ...org, mapUrl: "http://example.invalid/m" })
      .success,
    true,
  );
  // Blank, null and nothing at all all mean no map link. The last one is a
  // contact saved before v0.2.9, whose payload has no mapUrl key.
  for (const blank of ["", null, undefined]) {
    const parsed = organisationInput.safeParse({ ...org, mapUrl: blank });
    assert.equal(parsed.success, true);
    if (parsed.success) assert.equal(parsed.data.mapUrl, null);
  }
  const legacy = organisationInput.safeParse(org);
  assert.equal(legacy.success, true);
  if (legacy.success) assert.equal(legacy.data.mapUrl, null);
  for (const bad of [
    "maps.google.com/?q=1+Example+Street",
    "1 Example Street",
    "javascript:alert(1)",
    "ftp://example.invalid/map",
    "https://",
  ]) {
    const refused = organisationInput.safeParse({ ...org, mapUrl: bad });
    assert.equal(refused.success, false, `${bad} must be refused`);
    if (!refused.success)
      assert.equal(
        refused.error.issues[0].message,
        "Enter a link that starts with http:// or https://",
      );
  }
  // A pasted link can be long, but not absurdly so.
  assert.equal(
    organisationInput.safeParse({
      ...org,
      mapUrl: `https://example.invalid/${"a".repeat(2000)}`,
    }).success,
    false,
  );
});

test("contact map link: save, change and clear with history", () => {
  const { sqlite, store } = setup();
  try {
    const map = "https://maps.google.com/?q=1+Example+Street";
    const withMap = store.saveOrganisation({ ...org, mapUrl: map }, users[0]);
    assert.equal(
      store.snapshot().organisations.find((o) => o.id === withMap)?.mapUrl,
      map,
    );
    // A contact saved without one, then given one from Edit, then cleared again
    const id = store.saveOrganisation(org, users[0]);
    assert.equal(
      store.snapshot().organisations.find((o) => o.id === id)?.mapUrl,
      null,
    );
    store.saveOrganisation({ ...org, id, version: 1, mapUrl: map }, users[0]);
    assert.equal(
      store.snapshot().organisations.find((o) => o.id === id)?.mapUrl,
      map,
    );
    const other = "https://maps.google.com/?q=2+Example+Street";
    store.saveOrganisation({ ...org, id, version: 2, mapUrl: other }, users[1]);
    assert.equal(
      store.snapshot().organisations.find((o) => o.id === id)?.mapUrl,
      other,
    );
    store.saveOrganisation({ ...org, id, version: 3, mapUrl: null }, users[1]);
    assert.equal(
      store.snapshot().organisations.find((o) => o.id === id)?.mapUrl,
      null,
    );
    // A refused link is refused before anything is written, so the record and
    // its version are untouched.
    assert.throws(() =>
      store.saveOrganisation(
        { ...org, id, version: 4, mapUrl: "not a link" },
        users[0],
      ),
    );
    assert.equal(
      store.snapshot().organisations.find((o) => o.id === id)?.version,
      4,
    );
    // The map link is part of the readable history, like every other field.
    // Found by content rather than by position: the history is newest-first and
    // saves within the same millisecond would make the order unstable.
    const revisions = store
      .snapshot()
      .revisions.filter(
        (r) => r.entity === "organisation" && r.entityId === id,
      );
    assert.equal(revisions.length, 4);
    const updated = revisions.filter((r) => r.action === "updated");
    assert.equal(updated.length, 3);
    assert.ok(
      updated.some((r) => r.before?.mapUrl == null && r.after.mapUrl === map),
    );
    assert.ok(
      updated.some((r) => r.before?.mapUrl === map && r.after.mapUrl === other),
    );
    assert.ok(
      updated.some((r) => r.before?.mapUrl === other && r.after.mapUrl == null),
    );
  } finally {
    sqlite.close();
  }
});

test("task type: saved, changed and cleared, and refused when unknown", () => {
  const { sqlite, store } = setup();
  try {
    // A task saved with no type at all, exactly as every task before v0.2.10
    // was written, still saves and reads back as no type.
    const untyped = store.saveTask({ ...task, title: "Untyped" }, users[0]);
    assert.equal(
      store.snapshot().tasks.find((t) => t.id === untyped)?.kind,
      null,
    );
    // Choose one, then change it, then clear it again from Edit.
    const id = store.saveTask({ ...task, kind: "call" }, users[0]);
    assert.equal(store.snapshot().tasks.find((t) => t.id === id)?.kind, "call");
    store.saveTask({ ...task, id, version: 1, kind: "meeting" }, users[1]);
    assert.equal(
      store.snapshot().tasks.find((t) => t.id === id)?.kind,
      "meeting",
    );
    store.saveTask({ ...task, id, version: 2, kind: null }, users[1]);
    assert.equal(store.snapshot().tasks.find((t) => t.id === id)?.kind, null);

    // Every type in the list is storable, and nothing outside it is.
    for (const kind of taskKinds) {
      const k = store.saveTask(
        { ...task, title: `Typed ${kind}`, kind },
        users[0],
      );
      assert.equal(store.snapshot().tasks.find((t) => t.id === k)?.kind, kind);
    }
    assert.throws(() =>
      store.saveTask({ ...task, kind: "carrier_pigeon" }, users[0]),
    );

    // The type is part of the readable history, like every other field.
    const revisions = store
      .snapshot()
      .revisions.filter((r) => r.entity === "task" && r.entityId === id);
    const updated = revisions.filter((r) => r.action === "updated");
    assert.equal(updated.length, 2);
    assert.ok(
      updated.some(
        (r) => r.before?.kind === "call" && r.after.kind === "meeting",
      ),
    );
    assert.ok(
      updated.some((r) => r.before?.kind === "meeting" && r.after.kind == null),
    );
  } finally {
    sqlite.close();
  }
});

test("task outcome is kept apart from the detail the task was set with", () => {
  const { sqlite, store } = setup();
  try {
    const id = store.saveTask(
      {
        ...task,
        detail: "Need to discuss floral arrangements and refreshments",
        outcome: "Agreed a simple sheaf and tea for forty in the hall.",
      },
      users[0],
    );
    const saved = store.snapshot().tasks.find((t) => t.id === id);
    // Both survive together: the task keeps what was asked for and records
    // what actually happened, and neither overwrites the other.
    assert.match(saved?.detail ?? "", /floral arrangements/);
    assert.match(saved?.outcome ?? "", /tea for forty/);
    // A task with no outcome yet is null, not an empty string.
    const bare = store.saveTask({ ...task, title: "No outcome yet" }, users[0]);
    assert.equal(
      store.snapshot().tasks.find((t) => t.id === bare)?.outcome,
      null,
    );
  } finally {
    sqlite.close();
  }
});

test("Scheduled is the status the app offers, and Waiting is no longer accepted", () => {
  const { sqlite, store } = setup();
  try {
    assert.ok(taskStatuses.includes("scheduled"));
    assert.ok(!(taskStatuses as readonly string[]).includes("waiting"));
    const id = store.saveTask({ ...task, status: "scheduled" }, users[0]);
    assert.equal(
      store.snapshot().tasks.find((t) => t.id === id)?.status,
      "scheduled",
    );
    // The old word is refused outright, so nothing can write it again.
    assert.throws(() =>
      store.saveTask({ ...task, status: "waiting" }, users[0]),
    );
  } finally {
    sqlite.close();
  }
});

test("a task can be given to everyone, and an unknown person is still refused", () => {
  const { sqlite, store } = setup();
  try {
    // Work the two of you do together - attending a meeting, say - is not
    // work for one of you, and it is not unassigned either.
    const id = store.saveTask(
      { ...task, assignee: everyoneAssignee },
      users[0],
    );
    assert.equal(
      store.snapshot().tasks.find((t) => t.id === id)?.assignee,
      everyoneAssignee,
    );
    // The guard is still there for everyone else: only the two workspace
    // users, or the shared value, may be named.
    assert.throws(() =>
      store.saveTask(
        { ...task, assignee: "stranger@example.invalid" },
        users[0],
      ),
    );
    for (const user of users) {
      const theirs = store.saveTask({ ...task, assignee: user }, users[0]);
      assert.equal(
        store.snapshot().tasks.find((t) => t.id === theirs)?.assignee,
        user,
      );
    }
  } finally {
    sqlite.close();
  }
});

// v0.2.17: the date the document itself is dated. Optional, and blank means
// "the date it was added" — the field only ever adds a choice, so a document
// stored before this release reads and behaves exactly as it did.
test("the date on a document accepts a real day and refuses anything else", () => {
  const base = { friendlyName: "House deed", category: "property" };
  const good = documentInput.safeParse({ ...base, documentDate: "1987-09-03" });
  assert.equal(good.success, true);
  if (good.success) assert.equal(good.data.documentDate, "1987-09-03");
  // Blank, null and nothing at all all mean "the date it was added". The last
  // one is a document stored before v0.2.17, whose payload has no key at all.
  for (const blank of ["", null, undefined]) {
    const parsed = documentInput.safeParse({ ...base, documentDate: blank });
    assert.equal(parsed.success, true);
    if (parsed.success) assert.equal(parsed.data.documentDate, null);
  }
  const legacy = documentInput.safeParse(base);
  assert.equal(legacy.success, true);
  if (legacy.success) assert.equal(legacy.data.documentDate, null);
  for (const bad of [
    "3 September 1987",
    "1987-9-3",
    "1987-13-01",
    "2026-02-30",
  ]) {
    const refused = documentInput.safeParse({ ...base, documentDate: bad });
    assert.equal(refused.success, false, `${bad} must be refused`);
    if (!refused.success)
      assert.equal(refused.error.issues[0].message, "Enter a valid date");
  }
});

test("the date on a document: saved, changed and cleared with history", () => {
  const { sqlite, store } = setup();
  try {
    const upload = {
      friendlyName: "House deed",
      originalName: "deed.pdf",
      storageName: "deed-storage.pdf",
      mimeType: "application/pdf",
      size: 12,
      category: "property",
    };
    const find = (id: string) =>
      store.snapshot().documents.find((d) => d.id === id);
    // Uploaded with the date printed on it.
    const dated = store.createDocumentFromUpload(
      { ...upload, documentDate: "1987-09-03" },
      users[0],
    );
    assert.equal(find(dated)?.documentDate, "1987-09-03");
    // Uploaded without one: null, and nothing else about the document changes.
    const undated = store.createDocumentFromUpload(upload, users[0]);
    assert.equal(find(undated)?.documentDate, null);
    assert.equal(find(undated)?.friendlyName, "House deed");
    // Changed from Edit, then cleared again — each step in the history.
    store.saveDocument(
      { id: dated, version: 1, ...upload, documentDate: "1987-10-01" },
      users[1],
    );
    assert.equal(find(dated)?.documentDate, "1987-10-01");
    store.saveDocument(
      { id: dated, version: 2, ...upload, documentDate: "" },
      users[1],
    );
    assert.equal(find(dated)?.documentDate, null);
    // A date that is not a day is refused before anything is written, so the
    // record and its version are untouched.
    assert.throws(() =>
      store.saveDocument(
        { id: dated, version: 3, ...upload, documentDate: "not a date" },
        users[0],
      ),
    );
    assert.equal(find(dated)?.version, 3);
    // The document date is part of the readable history, like every other
    // field. Found by content rather than by position: the history is
    // newest-first and saves within the same millisecond would make the order
    // unstable.
    const revisions = store
      .snapshot()
      .revisions.filter((r) => r.entity === "document" && r.entityId === dated);
    // The upload, the change and the clear: three revisions, none of them from
    // the refused save.
    assert.equal(revisions.length, 3);
    const updated = revisions.filter((r) => r.action === "updated");
    assert.equal(updated.length, 2);
    assert.ok(
      updated.some(
        (r) =>
          r.before?.documentDate === "1987-09-03" &&
          r.after.documentDate === "1987-10-01",
      ),
    );
    assert.ok(
      updated.some(
        (r) =>
          r.before?.documentDate === "1987-10-01" &&
          r.after.documentDate == null,
      ),
    );
  } finally {
    sqlite.close();
  }
});

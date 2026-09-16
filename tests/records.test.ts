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

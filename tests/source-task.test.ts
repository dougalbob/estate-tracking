import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "../src/lib/db/schema";
import { recordStore } from "../src/lib/records/store";
/**
 * v0.2.18: an interaction created from a task (Create interaction) carries
 * `interactions.source_task_id` and inherits the task's documents as real
 * document_links rows, in the same transaction as the interaction itself.
 * Inheritance only - nothing about the task changes and nothing is enforced.
 */
const users = ["alex@example.invalid", "jamie@example.invalid"];
const task = {
  title: "Call the Co-op about the flowers",
  detail: "Confirm the arrangement",
  outcome: "Lilies confirmed for the Thursday",
  kind: "call",
  organisationId: null,
  interactionId: null,
  projectId: "funeral",
  assignee: users[0],
  status: "done",
  dueDate: null,
  followUpDate: null,
  deadline: null,
};
const interaction = {
  organisationId: null,
  projectId: "funeral",
  title: task.title,
  detail: task.outcome,
  kind: "call",
  occurredAt: "2026-09-19T10:00:00.000Z",
  followUps: [],
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
function makeDoc(store: ReturnType<typeof recordStore>, name: string) {
  return store.createDocumentFromUpload(
    {
      friendlyName: name,
      originalName: `${name}.pdf`,
      storageName: `${name}-abc.pdf`,
      mimeType: "application/pdf",
      size: 1234,
      category: null,
    },
    users[0],
  );
}
test("an interaction created from a task is stamped with the task and inherits its documents", () => {
  const { sqlite, store } = setup();
  try {
    const taskId = store.saveTask(task, users[0]);
    const quote = makeDoc(store, "Quote");
    const receipt = makeDoc(store, "Receipt");
    store.linkDocument({ documentId: quote, taskId }, users[0]);
    store.linkDocument({ documentId: receipt, taskId }, users[0]);
    const before = store.snapshot();
    assert.equal(before.documentLinks.length, 2);
    const noteId = store.saveInteraction(
      { ...interaction, sourceTaskId: taskId },
      users[0],
    );
    const snap = store.snapshot();
    const note = snap.interactions.find((n) => n.id === noteId)!;
    assert.equal(note.sourceTaskId, taskId);
    // Two new rows point the same documents at the interaction; the task's
    // own two links are exactly as they were.
    const toNote = snap.documentLinks.filter((l) => l.interactionId === noteId);
    assert.deepEqual(
      toNote.map((l) => l.documentId).sort(),
      [quote, receipt].sort(),
    );
    assert.equal(
      snap.documentLinks.filter((l) => l.taskId === taskId).length,
      2,
    );
    assert.equal(snap.documentLinks.length, 4);
    // Real links: each one is audited and can be removed by hand.
    assert.equal(
      snap.revisions.filter((r) => r.entity === "document_link").length,
      4,
    );
    store.unlinkDocument(toNote[0].id, users[1]);
    const after = store.snapshot();
    assert.equal(after.documentLinks.length, 3);
    assert.equal(
      after.documentLinks.filter((l) => l.taskId === taskId).length,
      2,
      "unlinking from the interaction leaves the task's link alone",
    );
    // The task itself was not touched by any of this.
    const t = after.tasks.find((x) => x.id === taskId)!;
    assert.equal(t.version, 1);
    assert.equal(t.status, "done");
  } finally {
    sqlite.close();
  }
});
test("a document in the bin is not inherited, and a task with no documents adds no links", () => {
  const { sqlite, store } = setup();
  try {
    const taskId = store.saveTask(task, users[0]);
    const live = makeDoc(store, "Live");
    const binned = makeDoc(store, "Binned");
    store.linkDocument({ documentId: live, taskId }, users[0]);
    store.linkDocument({ documentId: binned, taskId }, users[0]);
    store.deleteRecord("document", binned, 1, users[0]);
    const noteId = store.saveInteraction(
      { ...interaction, sourceTaskId: taskId },
      users[0],
    );
    const snap = store.snapshot();
    assert.deepEqual(
      snap.documentLinks
        .filter((l) => l.interactionId === noteId)
        .map((l) => l.documentId),
      [live],
    );
    const bareTask = store.saveTask({ ...task, title: "Bare" }, users[0]);
    const bareNote = store.saveInteraction(
      { ...interaction, title: "Bare", sourceTaskId: bareTask },
      users[0],
    );
    const again = store.snapshot();
    assert.equal(
      again.documentLinks.filter((l) => l.interactionId === bareNote).length,
      0,
    );
    assert.equal(
      again.interactions.find((n) => n.id === bareNote)!.sourceTaskId,
      bareTask,
    );
  } finally {
    sqlite.close();
  }
});
test("if the save fails after the interaction is written, nothing is left behind", () => {
  const { sqlite, store } = setup();
  try {
    const taskId = store.saveTask(task, users[0]);
    const docId = makeDoc(store, "Quote");
    store.linkDocument({ documentId: docId, taskId }, users[0]);
    const before = store.snapshot();
    // A follow-up with an assignee who is not a workspace user is refused by
    // saveTask - after the interaction row and its inherited links have been
    // written inside the same transaction.
    assert.throws(() =>
      store.saveInteraction(
        {
          ...interaction,
          sourceTaskId: taskId,
          followUps: [
            {
              ...task,
              title: "Follow up",
              status: "to_do",
              assignee: "stranger@example.invalid",
            },
          ],
        },
        users[0],
      ),
    );
    const after = store.snapshot();
    assert.equal(after.interactions.length, 0);
    assert.equal(after.documentLinks.length, 1);
    assert.equal(after.documentLinks[0].taskId, taskId);
    assert.equal(after.revisions.length, before.revisions.length);
  } finally {
    sqlite.close();
  }
});
test("an interaction written by hand has no source task and is left alone", () => {
  const { sqlite, store } = setup();
  try {
    const taskId = store.saveTask(task, users[0]);
    const docId = makeDoc(store, "Quote");
    store.linkDocument({ documentId: docId, taskId }, users[0]);
    // No sourceTaskId at all - a record shaped as it was before v0.2.18.
    const byHand = store.saveInteraction(interaction, users[0]);
    let snap = store.snapshot();
    const note = snap.interactions.find((n) => n.id === byHand)!;
    assert.equal(note.sourceTaskId, null);
    assert.equal(
      snap.documentLinks.filter((l) => l.interactionId === byHand).length,
      0,
    );
    // Editing it later with a sourceTaskId changes nothing: the stamp is set
    // once, at creation, and never by an edit.
    store.saveInteraction(
      {
        ...interaction,
        id: byHand,
        version: note.version,
        detail: "Corrected",
        sourceTaskId: taskId,
      },
      users[0],
    );
    snap = store.snapshot();
    const edited = snap.interactions.find((n) => n.id === byHand)!;
    assert.equal(edited.detail, "Corrected");
    assert.equal(edited.sourceTaskId, null);
    assert.equal(
      snap.documentLinks.filter((l) => l.interactionId === byHand).length,
      0,
    );
  } finally {
    sqlite.close();
  }
});
test("a source task that is in the bin or gone is refused, and a stamped interaction survives its task", () => {
  const { sqlite, store } = setup();
  try {
    assert.throws(
      () =>
        store.saveInteraction(
          { ...interaction, sourceTaskId: "no-such-task" },
          users[0],
        ),
      /source task is no longer available/,
    );
    const taskId = store.saveTask(task, users[0]);
    const noteId = store.saveInteraction(
      { ...interaction, sourceTaskId: taskId },
      users[0],
    );
    store.deleteRecord("task", taskId, 1, users[0]);
    assert.throws(
      () =>
        store.saveInteraction(
          { ...interaction, sourceTaskId: taskId },
          users[0],
        ),
      /source task is no longer available/,
    );
    // Not a foreign key: removing the task for good leaves the interaction,
    // and its stamp, exactly as they were.
    store.deleteRecord("task", taskId, 2, users[0], true);
    const snap = store.snapshot();
    assert.equal(snap.tasks.length, 0);
    assert.equal(snap.deletedTasks.length, 0);
    assert.equal(
      snap.interactions.find((n) => n.id === noteId)!.sourceTaskId,
      taskId,
    );
  } finally {
    sqlite.close();
  }
});

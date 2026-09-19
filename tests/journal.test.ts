import assert from "node:assert/strict";
import test from "node:test";
import { journalDay, journalEntries } from "../src/lib/records/journal";

/**
 * The journal's rules, with no database and no markup: which entries belong to a
 * project, what dates them, how they are ordered, and what Hide Done hides.
 *
 * Nothing here is derived and nothing is inferred — a task sits where it was
 * set, a document sits on the date printed on it (or the day it was added), and
 * an interaction sits when it happened.
 */

const project = "proj-probate";
const otherProject = "proj-funeral";

const interaction = (
  id: string,
  occurredAt: string,
  projectId: string | null = project,
) => ({ id, projectId, occurredAt, title: `${id} title` });

const task = (
  id: string,
  createdAt: string,
  status = "to_do",
  projectId: string | null = project,
) => ({ id, projectId, createdAt, status, title: `${id} title` });

const document = (
  id: string,
  createdAt: string,
  documentDate: string | null = null,
) => ({ id, createdAt, documentDate, friendlyName: `${id} name` });

const link = (documentId: string, projectId: string | null = project) => ({
  documentId,
  projectId,
});

const journal = (input: {
  interactions?: ReturnType<typeof interaction>[];
  tasks?: ReturnType<typeof task>[];
  documents?: ReturnType<typeof document>[];
  documentLinks?: ReturnType<typeof link>[];
  hideDone?: boolean;
}) =>
  journalEntries({
    projectId: project,
    interactions: input.interactions ?? [],
    documents: input.documents ?? [],
    documentLinks: input.documentLinks ?? [],
    tasks: input.tasks ?? [],
    hideDone: input.hideDone ?? false,
  });

test("the journal merges interactions, documents and tasks, most recent first", () => {
  const entries = journal({
    interactions: [interaction("call", "2026-09-18T10:00:00.000Z")],
    tasks: [task("probate-task", "2026-09-14T09:00:00.000Z", "done")],
    documents: [document("deed", "2026-09-20T08:00:00.000Z", "1987-09-03")],
    documentLinks: [link("deed")],
  });
  assert.deepEqual(
    entries.map((e) => e.id),
    ["call", "probate-task", "deed"],
  );
  assert.deepEqual(
    entries.map((e) => e.kind),
    ["interaction", "task", "document"],
  );
});

test("only this project's records are entries, and a document needs its link", () => {
  const entries = journal({
    interactions: [
      interaction("ours", "2026-09-18T10:00:00.000Z"),
      interaction("theirs", "2026-09-19T10:00:00.000Z", otherProject),
      interaction("unfiled", "2026-09-19T10:00:00.000Z", null),
    ],
    tasks: [
      task("our-task", "2026-09-14T09:00:00.000Z"),
      task("their-task", "2026-09-15T09:00:00.000Z", "to_do", otherProject),
      task("loose-task", "2026-09-15T09:00:00.000Z", "to_do", null),
    ],
    documents: [
      document("linked", "2026-09-20T08:00:00.000Z"),
      document("loose", "2026-09-21T08:00:00.000Z"),
    ],
    documentLinks: [link("linked"), link("loose", otherProject)],
  });
  // The linked document (added 20 September) is the most recent entry; the
  // other project's task, the unfiled task and the loosely linked document are
  // not in this journal at all.
  assert.deepEqual(
    entries.map((e) => e.id),
    ["linked", "ours", "our-task"],
  );
});

test("within a day, an entry with a time of day sits above a date-only document", () => {
  // The same calendar day: a call at 10:00 and a document dated that day with no
  // time on it. The document cannot claim to be later than the call.
  const entries = journal({
    interactions: [interaction("call", "2026-09-03T09:00:00.000Z")],
    tasks: [task("later-task", "2026-09-03T14:00:00.000Z")],
    documents: [document("dated", "2026-09-04T08:00:00.000Z", "2026-09-03")],
    documentLinks: [link("dated")],
  });
  assert.deepEqual(
    entries.map((e) => e.id),
    ["later-task", "call", "dated"],
  );
  const datedEntry = entries.find((e) => e.id === "dated");
  assert.equal(datedEntry?.timed, false);
});

test("a document with no date of its own sits where it was added", () => {
  const entries = journal({
    documents: [
      document("added-late", "2026-09-19T12:00:00.000Z"),
      document("added-early", "2026-09-02T12:00:00.000Z"),
    ],
    documentLinks: [link("added-late"), link("added-early")],
  });
  assert.deepEqual(
    entries.map((e) => e.id),
    ["added-late", "added-early"],
  );
  for (const entry of entries) assert.equal(entry.timed, true);
});

test("an ancient document sinks below everything newer, however recently it was added", () => {
  const entries = journal({
    interactions: [interaction("call", "2026-09-18T10:00:00.000Z")],
    documents: [document("deed", "2026-09-19T08:00:00.000Z", "1987-09-03")],
    documentLinks: [link("deed")],
  });
  assert.deepEqual(
    entries.map((e) => e.id),
    ["call", "deed"],
  );
  assert.equal(entries[1].day, "1987-09-03");
});

test("Hide Done hides done tasks and nothing else", () => {
  const tasks = [
    task("done", "2026-09-14T09:00:00.000Z", "done"),
    task("open", "2026-09-15T09:00:00.000Z"),
    task("cancelled", "2026-09-16T09:00:00.000Z", "cancelled"),
  ];
  const shown = journal({ tasks, hideDone: true }).map((e) => e.id);
  // A cancelled task is a "we decided not to" beat, so it stays.
  assert.deepEqual(shown, ["cancelled", "open"]);
  const all = journal({ tasks, hideDone: false }).map((e) => e.id);
  assert.deepEqual(all, ["cancelled", "open", "done"]);
});

test("a completed task and its interaction are two beats, in their own places", () => {
  // The task beat is dated when the task was set; the interaction beat when the
  // work was done. With Hide Done on, the task beat goes and the interaction
  // stays — one control, two readings.
  const interactions = [interaction("outcome", "2026-09-18T15:00:00.000Z")];
  const tasks = [task("chosen-music", "2026-09-14T09:00:00.000Z", "done")];
  assert.deepEqual(
    journal({ interactions, tasks, hideDone: false }).map((e) => e.id),
    ["outcome", "chosen-music"],
  );
  assert.deepEqual(
    journal({ interactions, tasks, hideDone: true }).map((e) => e.id),
    ["outcome"],
  );
});

test("an empty project has an empty journal, and an unknown day is not invented", () => {
  assert.deepEqual(journal({}), []);
  // Dates are read in Europe/London, so a late-evening UTC instant is already
  // the next day here.
  assert.equal(journalDay("2026-09-02T23:30:00.000Z"), "2026-09-03");
  assert.equal(journalDay("2026-09-02T10:00:00.000Z"), "2026-09-02");
});

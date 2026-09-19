/**
 * The project journal.
 *
 * One chronological list of a project's interactions, documents and tasks, most
 * recent first — the whole story of a project rather than just its open tasks.
 * It replaces the task list inside a project panel; the All tasks view is a
 * different surface and is untouched by anything here.
 *
 * The rules live in this module with no markup in them, the same way the
 * calendar's rules live in `calendar.ts`, so the merge, the ordering and the
 * Hide Done filtering can be tested without a database or a browser.
 *
 * Three deliberate decisions, each settled with the user before it was built:
 *  - A task is dated by the day it was set, never by its due date. Its due date
 *    is context on the entry, not where it sits in the story.
 *  - A document is dated by its document date when it has one — the date printed
 *    on the paper — and by the day it was added when it does not.
 *  - Hide Done hides done tasks only. A cancelled task stays in the journal: it
 *    is a "we decided not to" beat, which is part of the story too.
 */

export type JournalInteraction = {
  id: string;
  projectId: string | null;
  occurredAt: string;
};

export type JournalDocument = {
  id: string;
  createdAt: string | number | Date;
  /** The date the document itself is dated, or null for "the date it was added". */
  documentDate: string | null;
};

export type JournalTask = {
  id: string;
  projectId: string | null;
  createdAt: string;
  status: string;
};

export type JournalEntry<
  I extends JournalInteraction = JournalInteraction,
  D extends JournalDocument = JournalDocument,
  T extends JournalTask = JournalTask,
> =
  | {
      kind: "interaction";
      id: string;
      /** The Europe/London calendar day the entry sits on. */
      day: string;
      /** The instant that orders entries sharing a day. */
      at: string;
      /** True when the entry carries a time of day. */
      timed: true;
      record: I;
    }
  | {
      kind: "document";
      id: string;
      day: string;
      at: string;
      timed: boolean;
      record: D;
    }
  | {
      kind: "task";
      id: string;
      day: string;
      at: string;
      timed: true;
      record: T;
    };

/** The calendar day of an instant, read in Europe/London like every other date. */
export function journalDay(instant: string | number | Date): string {
  const date = instant instanceof Date ? instant : new Date(instant);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * When a document belongs in the story: the date it is dated if one was typed
 * in, and the day it was added otherwise. A blank document date is not a gap to
 * be filled in — it means "this entered the story when it was filed".
 */
export function documentJournalDate(doc: JournalDocument) {
  if (doc.documentDate) return { day: doc.documentDate, dateOnly: true };
  const createdAt = instantOf(doc.createdAt);
  return { day: journalDay(createdAt), dateOnly: false };
}

/** The instant behind a stored timestamp, whatever shape it arrives in. */
function instantOf(value: string | number | Date) {
  return value instanceof Date ? value.toISOString() : String(value);
}

/** Only used to keep exact ties in a fixed order, never to group entries. */
const kindOrder: Record<JournalEntry["kind"], number> = {
  interaction: 0,
  task: 1,
  document: 2,
};

function compare(a: JournalEntry, b: JournalEntry) {
  // Most recent day first.
  if (a.day !== b.day) return a.day < b.day ? 1 : -1;
  // Within a day, an entry with a time of day sits above a document dated only
  // by its date: the document has no time, so it cannot claim a later moment.
  if (a.timed !== b.timed) return a.timed ? -1 : 1;
  // Then the timestamps themselves, newest first.
  if (a.at !== b.at) return a.at < b.at ? 1 : -1;
  if (a.kind !== b.kind) return kindOrder[a.kind] - kindOrder[b.kind];
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

/**
 * The journal for one project, most recent first: that project's interactions,
 * documents and tasks merged into one list. Nothing is derived and nothing is
 * inferred — every entry is a recorded fact, and each entry the caller renders
 * opens the record it names.
 */
export function journalEntries<
  I extends JournalInteraction,
  D extends JournalDocument,
  T extends JournalTask,
>(input: {
  projectId: string;
  interactions: I[];
  documents: D[];
  documentLinks: { documentId: string; projectId: string | null }[];
  tasks: T[];
  /** The panel's own Hide Done filter. Done tasks only; cancelled stays. */
  hideDone: boolean;
}): JournalEntry<I, D, T>[] {
  const entries: JournalEntry<I, D, T>[] = [];

  for (const interaction of input.interactions) {
    if (interaction.projectId !== input.projectId) continue;
    entries.push({
      kind: "interaction",
      id: interaction.id,
      day: journalDay(interaction.occurredAt),
      at: interaction.occurredAt,
      timed: true,
      record: interaction,
    });
  }

  // A document is in the journal when it is directly linked to this project.
  const linkedIds = new Set(
    input.documentLinks
      .filter((link) => link.projectId === input.projectId)
      .map((link) => link.documentId),
  );
  for (const document of input.documents) {
    if (!linkedIds.has(document.id)) continue;
    const { day, dateOnly } = documentJournalDate(document);
    entries.push({
      kind: "document",
      id: document.id,
      day,
      at: dateOnly ? `${day}T00:00:00.000Z` : instantOf(document.createdAt),
      timed: !dateOnly,
      record: document,
    });
  }

  for (const task of input.tasks) {
    if (task.projectId !== input.projectId) continue;
    // Hide Done hides done work and nothing else.
    if (input.hideDone && task.status === "done") continue;
    entries.push({
      kind: "task",
      id: task.id,
      day: journalDay(task.createdAt),
      at: task.createdAt,
      timed: true,
      record: task,
    });
  }

  return entries.sort(compare);
}

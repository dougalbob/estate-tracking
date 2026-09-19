import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "../src/lib/db/schema";
import { recordStore, RecordError } from "../src/lib/records/store";
import { everyoneAssignee } from "../src/lib/records/validation";
import {
  addDays,
  addMonths,
  assigneeBox,
  calendarAssigneeBoxes,
  calendarStatuses,
  calendarTasks,
  dayCountLabel,
  dayLabel,
  groupByDueDate,
  lengthOfMonth,
  matchesCalendarFilters,
  monthGrid,
  monthLabel,
  moveDeltaFor,
  projectTones,
  startOfWeek,
  toneClass,
  weekGrid,
  weekLabel,
  weekdayLabels,
  type CalendarFilters,
  type CalendarTask,
} from "../src/lib/records/calendar";

const users = ["alex@example.invalid", "jamie@example.invalid"];
const [alex, jamie] = users;

/** Every box ticked and nothing typed: the calendar as it opens. */
const all: CalendarFilters = {
  statuses: [...calendarStatuses],
  assignees: calendarAssigneeBoxes(users),
  query: "",
};

let sequence = 0;
/**
 * A task shaped the way the calendar reads it. Every field can be overridden,
 * and callers can spread in the dates the calendar does not read (a follow-up
 * date, a confirmed deadline) to prove they change nothing.
 */
function t(overrides: Partial<CalendarTask> = {}): CalendarTask {
  sequence += 1;
  return {
    id: `task-${sequence}`,
    title: `Task ${sequence}`,
    status: "to_do",
    assignee: null,
    projectId: null,
    dueDate: null,
    ...overrides,
  };
}

const task = {
  title: "Send certificate",
  detail: "Ask for a receipt",
  organisationId: null,
  interactionId: null,
  projectId: "notifications",
  assignee: jamie,
  status: "to_do",
  dueDate: "2026-10-02",
  followUpDate: "2026-10-09",
  deadline: "2026-11-30",
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

// --- Which tasks belong on the calendar at all ---

test("the calendar holds tasks with a due date, and nothing without one", () => {
  const dated = t({ title: "Book the venue", dueDate: "2026-09-21" });
  const undated = t({ title: "Sort the paperwork" });
  const shown = calendarTasks([dated, undated], all);
  assert.deepEqual(
    shown.map((task) => task.title),
    ["Book the venue"],
  );
  assert.equal(matchesCalendarFilters(undated, all), false);
  assert.equal(matchesCalendarFilters(dated, all), true);
});

test("a follow-up date or a confirmed deadline does not put a task on a day", () => {
  // The user asked for tasks with a due date entered. A task carries three dates,
  // and the other two stay on the task itself: the calendar leaves them alone.
  const stored = t({ title: "Chase the bank" });
  const followUpOnly = { ...stored, followUpDate: "2026-09-24" };
  const withDeadline = {
    ...stored,
    followUpDate: "2026-09-24",
    deadline: "2026-09-28",
  };
  assert.equal(calendarTasks([followUpOnly], all).length, 0);
  assert.equal(matchesCalendarFilters(withDeadline, all), false);
  // Once a due date is added, the same task appears, on that day only.
  const dated = { ...withDeadline, dueDate: "2026-09-30" };
  const shown = calendarTasks([dated], all);
  assert.equal(shown.length, 1);
  assert.deepEqual([...groupByDueDate(shown).keys()], ["2026-09-30"]);
});

test("in progress and cancelled tasks stay off the calendar whatever is ticked", () => {
  const inProgress = t({ status: "in_progress", dueDate: "2026-09-22" });
  const cancelled = t({ status: "cancelled", dueDate: "2026-09-23" });
  const toDo = t({ status: "to_do", dueDate: "2026-09-24" });
  // Every box the page offers, ticked: the two statuses without a box are still
  // not shown, and the list of boxes is the three the user named.
  assert.deepEqual([...calendarStatuses], ["to_do", "scheduled", "done"]);
  assert.equal(calendarTasks([inProgress, cancelled, toDo], all).length, 1);
  // Nor does ticking "everything the app knows about" let them through.
  const everyStatus = {
    ...all,
    statuses: ["to_do", "in_progress", "scheduled", "done", "cancelled"],
  };
  assert.equal(
    calendarTasks([inProgress, cancelled, toDo], everyStatus).length,
    1,
  );
});

test("each status box hides and shows its own tasks", () => {
  const toDo = t({
    title: "To Do one",
    status: "to_do",
    dueDate: "2026-09-21",
  });
  const scheduled = t({
    title: "Scheduled one",
    status: "scheduled",
    dueDate: "2026-09-22",
  });
  const done = t({ title: "Done one", status: "done", dueDate: "2026-09-23" });
  const tasks = [toDo, scheduled, done];
  assert.equal(calendarTasks(tasks, all).length, 3);

  // Unticking Done leaves the two that are still to come.
  const withoutDone = {
    ...all,
    statuses: all.statuses.filter((status) => status !== "done"),
  };
  assert.deepEqual(
    calendarTasks(tasks, withoutDone).map((task) => task.title),
    ["To Do one", "Scheduled one"],
  );

  // Scheduled only, which is what the calendar looks like the morning of an
  // appointment.
  assert.deepEqual(
    calendarTasks(tasks, { ...all, statuses: ["scheduled"] }).map(
      (task) => task.title,
    ),
    ["Scheduled one"],
  );

  // Nothing ticked shows nothing, rather than everything.
  assert.equal(calendarTasks(tasks, { ...all, statuses: [] }).length, 0);
});

test("the assignee boxes separate the two of you, Everyone and Unassigned", () => {
  assert.deepEqual(calendarAssigneeBoxes(users), [
    alex,
    jamie,
    everyoneAssignee,
    "",
  ]);
  assert.equal(assigneeBox(null), "");
  assert.equal(assigneeBox(everyoneAssignee), everyoneAssignee);

  const forAlex = t({ title: "Alex's", assignee: alex, dueDate: "2026-09-21" });
  const forJamie = t({
    title: "Jamie's",
    assignee: jamie,
    dueDate: "2026-09-21",
  });
  const shared = t({
    title: "Both of you",
    assignee: everyoneAssignee,
    dueDate: "2026-09-22",
  });
  const unassigned = t({ title: "Nobody yet", dueDate: "2026-09-23" });
  const tasks = [forAlex, forJamie, shared, unassigned];
  assert.equal(calendarTasks(tasks, all).length, 4);

  const only = (assignees: string[]) =>
    calendarTasks(tasks, { ...all, assignees }).map((task) => task.title);

  assert.deepEqual(only([alex]), ["Alex's"]);
  assert.deepEqual(only([jamie]), ["Jamie's"]);
  // A task given to both of you sits under Everyone, and not under either name.
  assert.deepEqual(only([everyoneAssignee]), ["Both of you"]);
  assert.deepEqual(only([""]), ["Nobody yet"]);
  assert.deepEqual(only([alex, jamie]), ["Alex's", "Jamie's"]);
  // Nothing ticked shows nothing.
  assert.deepEqual(only([]), []);
});

test("the search narrows the calendar by title and works with the boxes", () => {
  const venue = t({ title: "Book the wake venue", dueDate: "2026-09-21" });
  const flowers = t({
    title: "Order flowers",
    status: "done",
    dueDate: "2026-09-21",
  });
  const tasks = [venue, flowers];

  assert.deepEqual(
    calendarTasks(tasks, { ...all, query: "venue" }).map((task) => task.title),
    ["Book the wake venue"],
  );
  // Case does not matter, nor do spaces either side of what was typed.
  assert.equal(calendarTasks(tasks, { ...all, query: "  WAKE  " }).length, 1);
  // A word nobody typed matches nothing, and an empty box matches everything.
  assert.equal(calendarTasks(tasks, { ...all, query: "solicitor" }).length, 0);
  assert.equal(calendarTasks(tasks, { ...all, query: "   " }).length, 2);
  // Search and the checkboxes compose: this asks for done tasks with "venue" in
  // the title, and there are none.
  assert.equal(
    calendarTasks(tasks, { ...all, query: "venue", statuses: ["done"] }).length,
    0,
  );
  assert.equal(
    calendarTasks(tasks, { ...all, query: "e", statuses: ["done"] }).length,
    1,
  );
});

test("tasks are grouped by day and the days read soonest first", () => {
  const later = t({ title: "Later", dueDate: "2026-09-30" });
  const second = t({ title: "Second on the day", dueDate: "2026-09-21" });
  const first = t({ title: "First on the day", dueDate: "2026-09-21" });
  const undated = t({ title: "No date" });
  const shown = calendarTasks([later, second, first, undated], all);
  assert.deepEqual(
    shown.map((task) => task.title),
    ["First on the day", "Second on the day", "Later"],
  );
  const byDate = groupByDueDate(shown);
  assert.deepEqual([...byDate.keys()], ["2026-09-21", "2026-09-30"]);
  assert.equal(byDate.get("2026-09-21")?.length, 2);
  assert.equal(byDate.get("2026-09-30")?.length, 1);
  // A day holds its tasks in the order they were given, so two calls to the
  // same day always read the same way round.
  assert.deepEqual(
    byDate.get("2026-09-21")?.map((task) => task.title),
    ["First on the day", "Second on the day"],
  );
});

// --- The shape of the month and the week ---

test("the month is drawn in whole weeks, starting on Monday", () => {
  const today = "2026-09-19";
  const weeks = monthGrid(today, today);
  // September 2026 begins on a Tuesday and ends on a Wednesday, so five whole
  // weeks cover it, with the days either side that complete the first and last.
  assert.equal(weeks.length, 5);
  assert.deepEqual(
    weeks.map((week) => week.length),
    [7, 7, 7, 7, 7],
  );
  const days = weeks.flat();
  assert.equal(days[0].date, "2026-08-31");
  assert.equal(days[days.length - 1].date, "2026-10-04");
  // Every day of the month appears exactly once, in order.
  const inMonth = days.filter((day) => day.inMonth).map((day) => day.date);
  assert.equal(inMonth.length, lengthOfMonth(today));
  assert.equal(inMonth[0], "2026-09-01");
  assert.equal(inMonth[inMonth.length - 1], "2026-09-30");
  assert.deepEqual(inMonth, [...inMonth].sort());
  // The days from the neighbouring months are marked, so they can be faded.
  assert.deepEqual(
    days.filter((day) => !day.inMonth).map((day) => day.date),
    ["2026-08-31", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"],
  );
  // Today is marked once, and only on its own day.
  assert.deepEqual(
    days.filter((day) => day.isToday).map((day) => day.date),
    [today],
  );
  assert.equal(days.find((day) => day.date === today)?.dayNumber, 19);
  // Every week starts on a Monday.
  for (const week of weeks)
    assert.equal(startOfWeek(week[0].date), week[0].date);
  // A month that needs six weeks gets six, so nothing is squeezed out: August
  // 2026 begins on a Saturday and has 31 days.
  assert.equal(monthGrid("2026-08-10", today).length, 6);
  assert.equal(
    monthGrid("2026-08-10", today)
      .flat()
      .filter((day) => day.inMonth).length,
    31,
  );
});

test("the week view is the seven days around the day being looked at", () => {
  const today = "2026-09-19";
  const week = weekGrid(today, today);
  assert.equal(week.length, 7);
  assert.deepEqual(
    week.map((day) => day.date),
    [
      "2026-09-14",
      "2026-09-15",
      "2026-09-16",
      "2026-09-17",
      "2026-09-18",
      "2026-09-19",
      "2026-09-20",
    ],
  );
  assert.deepEqual(
    week.filter((day) => day.isToday).map((day) => day.date),
    [today],
  );
  // Nothing is faded in this view, even where the week crosses into October.
  assert.ok(weekGrid("2026-09-30", today).every((day) => day.inMonth));
  assert.equal(weekGrid("2026-09-30", today)[0].date, "2026-09-28");
  assert.equal(weekGrid("2026-09-30", today)[6].date, "2026-10-04");
  // Any day of the week gives the same week, so stepping by seven days keeps
  // the day you are looking at in the same column.
  for (const anchor of week.map((day) => day.date))
    assert.deepEqual(
      weekGrid(anchor, today).map((day) => day.date),
      week.map((day) => day.date),
    );
});

test("stepping through the months keeps its place, and a short month does not spill", () => {
  assert.equal(addMonths("2026-09-19", 1), "2026-10-19");
  assert.equal(addMonths("2026-09-19", -1), "2026-08-19");
  // The 31st of a month with fewer days lands on the last day, not in the next
  // month, so the calendar never jumps two months forward.
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(addMonths("2026-03-31", -1), "2026-02-28");
  assert.equal(addMonths("2028-01-31", 1), "2028-02-29");
  assert.equal(addMonths("2026-09-19", 12), "2027-09-19");
  assert.equal(addMonths("2026-09-19", -12), "2025-09-19");
  // A week steps by seven days, across a month end and a year end.
  assert.equal(addDays("2026-09-30", 7), "2026-10-07");
  assert.equal(addDays("2026-12-28", 7), "2027-01-04");
  assert.equal(addDays("2026-09-19", -7), "2026-09-12");
});

test("the headings and the days read as plain English dates", () => {
  assert.equal(monthLabel("2026-09-19"), "September 2026");
  assert.equal(weekLabel("2026-09-19"), "14 – 20 September 2026");
  // A week that crosses a month, and one that crosses a year, are spelled out in
  // full so neither can be misread.
  assert.equal(weekLabel("2026-09-30"), "28 September – 4 October 2026");
  assert.equal(weekLabel("2026-12-31"), "28 December 2026 – 3 January 2027");
  assert.equal(dayLabel("2026-09-21"), "Monday 21 September 2026");
  // The column headings start on Monday and end on Sunday.
  assert.deepEqual(weekdayLabels("long"), [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ]);
  assert.deepEqual(weekdayLabels("short"), [
    "Mon",
    "Tue",
    "Wed",
    "Thu",
    "Fri",
    "Sat",
    "Sun",
  ]);
  // A day cell counts its tasks in words, and says nothing when it is empty.
  assert.equal(dayCountLabel(0), "");
  assert.equal(dayCountLabel(1), "1 task");
  assert.equal(dayCountLabel(3), "3 tasks");
});

test("each project keeps its own colour, and a task with no project has one too", () => {
  const tones = projectTones([
    { id: "funeral" },
    { id: "notifications" },
    { id: "probate" },
  ]);
  // The starter projects keep the same tone every time the page is opened.
  assert.deepEqual(tones, { funeral: 1, notifications: 2, probate: 3 });
  assert.equal(toneClass("funeral", tones), "tone-1");
  assert.equal(toneClass("probate", tones), "tone-3");
  // A task with no project yet is its own colour, not somebody else's.
  assert.equal(toneClass(null, tones), "tone-0");
  // Projects added later take the next free tone, and cycle once all six are in
  // use, so a seventh project still gets a colour rather than none.
  const many = projectTones([
    { id: "funeral" },
    { id: "notifications" },
    { id: "probate" },
    { id: "house" },
    { id: "car" },
    { id: "pension" },
    { id: "pets" },
  ]);
  assert.deepEqual(
    ["house", "car", "pension", "pets"].map((id) => toneClass(id, many)),
    ["tone-4", "tone-5", "tone-6", "tone-1"],
  );
  // A project that has been binned keeps its name in words on the chip, and
  // falls back to the plain tone rather than taking a stranger's colour.
  assert.equal(toneClass("gone", many), "tone-0");
});

// --- Moving a task to another day ---

test("dragging a task to another day changes its due date and nothing else", () => {
  const { sqlite, store } = setup();
  try {
    const id = store.saveTask(task, alex);
    const before = store.snapshot().tasks.find((t) => t.id === id)!;
    store.setTaskDueDate(
      { taskId: id, dueDate: "2026-10-15", version: before.version },
      jamie,
    );
    const after = store.snapshot().tasks.find((t) => t.id === id)!;
    assert.equal(after.dueDate, "2026-10-15");
    // The rest of the task is untouched: the follow-up date, the confirmed
    // deadline, the person, the project and the status all stay as they were.
    assert.equal(after.followUpDate, task.followUpDate);
    assert.equal(after.deadline, task.deadline);
    assert.equal(after.title, task.title);
    assert.equal(after.detail, task.detail);
    assert.equal(after.assignee, jamie);
    assert.equal(after.projectId, "notifications");
    assert.equal(after.status, "to_do");
    assert.equal(after.organisationId, null);
    assert.equal(after.interactionId, null);
    assert.equal(after.version, before.version + 1);
    // Who moved it, and when, is recorded against the task.
    assert.equal(after.createdBy, alex);
    assert.notEqual(after.updatedAt, before.updatedAt);
  } finally {
    sqlite.close();
  }
});

test("moving a task is written to its history as one change of date", () => {
  const { sqlite, store } = setup();
  try {
    const id = store.saveTask(task, alex);
    const version = store.snapshot().tasks.find((t) => t.id === id)!.version;
    store.setTaskDueDate({ taskId: id, dueDate: "2026-10-15", version }, jamie);
    const revisions = store
      .snapshot()
      .revisions.filter((r) => r.entity === "task" && r.entityId === id);
    const updated = revisions.filter((r) => r.action === "updated");
    assert.equal(updated.length, 1);
    assert.equal(updated[0].actor, jamie);
    assert.equal(updated[0].before?.dueDate, "2026-10-02");
    assert.equal(updated[0].after.dueDate, "2026-10-15");
    // The history shows only the date moving, so nothing else looks changed.
    assert.equal(updated[0].before?.title, updated[0].after.title);
    assert.equal(updated[0].before?.assignee, updated[0].after.assignee);
  } finally {
    sqlite.close();
  }
});

test("a stale calendar cannot move a task the other person has just edited", () => {
  const { sqlite, store } = setup();
  try {
    const id = store.saveTask(task, alex);
    const stale = store.snapshot().tasks.find((t) => t.id === id)!.version;
    // Jamie opens the task and changes it while this calendar is still showing
    // the older copy.
    store.saveTask(
      { ...task, id, version: stale, title: "Renamed by Jamie" },
      jamie,
    );
    assert.throws(
      () =>
        store.setTaskDueDate(
          { taskId: id, dueDate: "2026-10-15", version: stale },
          alex,
        ),
      (error: unknown) =>
        error instanceof RecordError && error.code === "conflict",
    );
    const after = store.snapshot().tasks.find((t) => t.id === id)!;
    // Jamie's edit stands, and the date is where Jamie left it.
    assert.equal(after.title, "Renamed by Jamie");
    assert.equal(after.dueDate, "2026-10-02");
  } finally {
    sqlite.close();
  }
});

test("dropping a task on the day it is already on writes nothing", () => {
  const { sqlite, store } = setup();
  try {
    const id = store.saveTask(task, alex);
    const before = store.snapshot().tasks.find((t) => t.id === id)!;
    const returned = store.setTaskDueDate(
      { taskId: id, dueDate: before.dueDate!, version: before.version },
      jamie,
    );
    assert.equal(returned, id);
    const after = store.snapshot().tasks.find((t) => t.id === id)!;
    // No new version, and nothing added to the history: a jiggle of the mouse
    // that lands a task back where it started leaves no trace.
    assert.equal(after.version, before.version);
    assert.equal(after.updatedAt, before.updatedAt);
    assert.equal(
      store
        .snapshot()
        .revisions.filter(
          (r) =>
            r.entity === "task" && r.entityId === id && r.action === "updated",
        ).length,
      0,
    );
    // And because nothing was written, an out-of-date version is not refused.
    assert.equal(
      store.setTaskDueDate(
        { taskId: id, dueDate: before.dueDate!, version: before.version + 5 },
        jamie,
      ),
      id,
    );
  } finally {
    sqlite.close();
  }
});

test("a task in the bin cannot be moved, and neither can a day that does not exist", () => {
  const { sqlite, store } = setup();
  try {
    const id = store.saveTask(task, alex);
    const version = store.snapshot().tasks.find((t) => t.id === id)!.version;
    assert.throws(
      () =>
        store.setTaskDueDate(
          { taskId: "missing", dueDate: "2026-10-15", version },
          alex,
        ),
      /no longer available/i,
    );
    store.deleteRecord("task", id, version, alex);
    assert.throws(
      () =>
        store.setTaskDueDate(
          { taskId: id, dueDate: "2026-10-15", version: version + 1 },
          alex,
        ),
      /no longer available/i,
    );
    // A binned task is still in the bin, unchanged.
    assert.equal(
      store.snapshot().deletedTasks.find((t) => t.id === id)?.dueDate,
      "2026-10-02",
    );

    // Only a real day can be dropped on: the same rule the date fields use.
    const second = store.saveTask({ ...task, title: "Second" }, alex);
    const secondVersion = store
      .snapshot()
      .tasks.find((t) => t.id === second)!.version;
    for (const dueDate of ["2026-02-30", "2026-13-01", "15/10/2026", "", null])
      assert.throws(() =>
        store.setTaskDueDate(
          { taskId: second, dueDate, version: secondVersion },
          alex,
        ),
      );
    assert.equal(
      store.snapshot().tasks.find((t) => t.id === second)?.dueDate,
      "2026-10-02",
    );
  } finally {
    sqlite.close();
  }
});

test("only the two of you can move a task", () => {
  const { sqlite, store } = setup();
  try {
    const id = store.saveTask(task, alex);
    const version = store.snapshot().tasks.find((t) => t.id === id)!.version;
    assert.throws(
      () =>
        store.setTaskDueDate(
          { taskId: id, dueDate: "2026-10-15", version },
          "intruder@example.invalid",
        ),
      (error: unknown) => error instanceof RecordError && error.code === "auth",
    );
    assert.equal(
      store.snapshot().tasks.find((t) => t.id === id)?.dueDate,
      "2026-10-02",
    );
  } finally {
    sqlite.close();
  }
});

test("the four arrow keys each move a task by their distance, and nothing else does", () => {
  // The keyboard move is the drag's equal: a day sideways, a week up or down.
  assert.equal(moveDeltaFor("ArrowLeft"), -1);
  assert.equal(moveDeltaFor("ArrowRight"), 1);
  assert.equal(moveDeltaFor("ArrowUp"), -7);
  assert.equal(moveDeltaFor("ArrowDown"), 7);
  // Any other key — including the keys a screen reader or the browser itself
  // uses — leaves the task where it is.
  assert.equal(moveDeltaFor("Enter"), null);
  assert.equal(moveDeltaFor("Tab"), null);
  assert.equal(moveDeltaFor("Home"), null);
  assert.equal(moveDeltaFor(""), null);
  // And the distances compose with addDays across a month end, as the grid
  // will apply them.
  assert.equal(
    addDays("2026-09-30", moveDeltaFor("ArrowRight")!),
    "2026-10-01",
  );
  assert.equal(addDays("2026-10-01", moveDeltaFor("ArrowUp")!), "2026-09-24");
});

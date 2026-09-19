/**
 * Fictional tasks with due dates, for the demo database only. Development only –
 * never point this at a real estate database.
 *
 * The Calendar page needs dated work spread over the days: two tasks on one day,
 * one already overdue, some further ahead, and one each of the two statuses the
 * calendar deliberately leaves out (In Progress and Cancelled) so it can be seen
 * that they do not appear. It also needs one task with no due date at all, which
 * stays in the All tasks list and never on the calendar.
 *
 * The dates are counted from today rather than written down, so the demo has
 * something in the current month whenever it is seeded, and the previous and
 * next month buttons both have something to find.
 */
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "../src/lib/db/schema";
import { recordStore } from "../src/lib/records/store";
import { everyoneAssignee, londonToday } from "../src/lib/records/validation";
import { addDays } from "../src/lib/records/calendar";

const path = process.env.DATABASE_PATH || "./data/demo.sqlite";
if (!path.includes("demo")) {
  console.error(
    "Refusing to seed: set DATABASE_PATH to the demo database, for example ./data/demo.sqlite",
  );
  process.exit(1);
}
const sqlite = new Database(path);
sqlite.pragma("foreign_keys = ON");
const db = drizzle(sqlite, { schema });
migrate(db, { migrationsFolder: "./drizzle" });
const users = ["alex@example.invalid", "jamie@example.invalid"];
const [alex, jamie] = users;
const store = recordStore(db, users);
store.seedProjects();

const today = londonToday();
/** A day this many days from today, as the date-only string the database stores. */
const inDays = (days: number) => addDays(today, days);

type DemoTask = {
  title: string;
  detail: string;
  kind: "call" | "email" | "meeting" | "research" | "review" | null;
  status: "to_do" | "in_progress" | "scheduled" | "done" | "cancelled";
  /** Days from today, or null for the task with no due date at all. */
  dueInDays: number | null;
  projectId: string | null;
  assignee: string | null;
};

const tasks: DemoTask[] = [
  {
    // Two tasks on the same day, one with a project and one without, so the
    // colour coding and the unassigned colour sit side by side in one cell.
    title: "Order the funeral flowers (fictional)",
    detail: "A simple sheaf, as agreed with the funeral directors.",
    kind: "call",
    status: "to_do",
    dueInDays: 2,
    projectId: "funeral",
    assignee: jamie,
  },
  {
    title: "Value the contents of the house (fictional)",
    detail: "Room by room, for the probate valuation. Not given to anyone yet.",
    kind: "research",
    status: "to_do",
    dueInDays: 2,
    projectId: null,
    assignee: null,
  },
  {
    // Already overdue and still open: the week view reads "Needs attention"
    // under it, and the month view simply shows it on a past day.
    title: "Check the funeral invoice against the quote (fictional)",
    detail: "The itemised bill has arrived. Compare it line by line.",
    kind: "review",
    status: "to_do",
    dueInDays: -1,
    projectId: "funeral",
    assignee: jamie,
  },
  {
    title: "Tell the council about the empty property (fictional)",
    detail: "They may reduce the council tax while the house is empty.",
    kind: "call",
    status: "to_do",
    dueInDays: -4,
    projectId: "notifications",
    assignee: alex,
  },
  {
    title: "Book the wake venue (fictional)",
    detail: "Tea for forty in the hall afterwards, confirmed by phone.",
    kind: "call",
    status: "scheduled",
    dueInDays: 5,
    projectId: "funeral",
    assignee: alex,
  },
  {
    // A shared appointment: it sits under Everyone, not under either name.
    title: "Apply for the grant of probate (fictional)",
    detail: "Both of you need to sign the declaration.",
    kind: "meeting",
    status: "scheduled",
    dueInDays: 12,
    projectId: "probate",
    assignee: everyoneAssignee,
  },
  {
    title: "Meeting with the solicitor about the will (fictional)",
    detail: "Take the list of questions about the residue of the estate.",
    kind: "meeting",
    status: "to_do",
    dueInDays: 20,
    projectId: "probate",
    assignee: everyoneAssignee,
  },
  {
    // Far enough ahead that the next month button has something to find,
    // whichever day this seed is run.
    title: "Notify HMRC of the estate's income (fictional)",
    detail: "Interest and dividends received since the date of death.",
    kind: "email",
    status: "scheduled",
    dueInDays: 34,
    projectId: "probate",
    assignee: alex,
  },
  {
    // Done, and in the past: it stays on the calendar with no "Needs attention"
    // chasing it, because a finished task awaits nothing.
    title: "Send the death certificate to the pension provider (fictional)",
    detail: "Recorded post, certificate returned afterwards.",
    kind: "email",
    status: "done",
    dueInDays: -9,
    projectId: "notifications",
    assignee: jamie,
  },
  {
    title: "Collect the will from the solicitor (fictional)",
    detail: "Collected and scanned into Documents.",
    kind: null,
    status: "done",
    dueInDays: -16,
    projectId: null,
    assignee: everyoneAssignee,
  },
  {
    // In Progress: the calendar offers To Do, Scheduled and Done as boxes, so
    // this one never appears on it. It stays in the All tasks list.
    title: "Cancel the mobile phone contract (fictional)",
    detail: "Waiting on the final bill before the account can be closed.",
    kind: "call",
    status: "in_progress",
    dueInDays: 3,
    projectId: "notifications",
    assignee: alex,
  },
  {
    // Cancelled, and never on the calendar for the same reason.
    title: "Chase the outstanding utility bill (fictional)",
    detail: "Turned out to be paid by direct debit already.",
    kind: null,
    status: "cancelled",
    dueInDays: 4,
    projectId: null,
    assignee: jamie,
  },
  {
    // No due date at all: it belongs in All tasks and nowhere on the calendar,
    // which is the rule the page is built on.
    title: "Sort through the photo albums (fictional)",
    detail:
      "No rush, and no date. It stays off the calendar until one is added.",
    kind: null,
    status: "to_do",
    dueInDays: null,
    projectId: null,
    assignee: null,
  },
];

let created = 0;
const existing = new Set(store.snapshot().tasks.map((task) => task.title));
for (const demo of tasks) {
  if (existing.has(demo.title)) continue;
  store.saveTask(
    {
      title: demo.title,
      detail: demo.detail,
      kind: demo.kind,
      outcome: demo.status === "done" ? demo.detail : null,
      organisationId: null,
      interactionId: null,
      projectId: demo.projectId,
      assignee: demo.assignee,
      status: demo.status,
      dueDate: demo.dueInDays === null ? null : inDays(demo.dueInDays),
      followUpDate: null,
      deadline: null,
    },
    alex,
  );
  created++;
}
console.log(
  created
    ? `Demo calendar tasks created (${created}).`
    : "Demo calendar tasks already present.",
);
sqlite.close();

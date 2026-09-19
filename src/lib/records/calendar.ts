/**
 * The Calendar page's rules, kept apart from its markup so they can be tested
 * on their own. Everything here works on the date-only strings the database
 * already stores (`YYYY-MM-DD`, read as UTC), so a day on the calendar is the
 * same day for both of you whichever device you are looking at.
 */
import { everyoneAssignee } from "./validation";

/**
 * The statuses the calendar offers as checkboxes: To Do, Scheduled and Done.
 * A task that is In Progress or Cancelled never appears on the calendar at all,
 * however many boxes are ticked — it stays in the All tasks list, where the
 * status menu can still find it. Written down here so the page, the tests and
 * the documents all read the same list.
 */
export const calendarStatuses = ["to_do", "scheduled", "done"] as const;
export type CalendarStatus = (typeof calendarStatuses)[number];

/** Month or week. Month is what the page opens on. */
export const calendarViews = ["month", "week"] as const;
export type CalendarView = (typeof calendarViews)[number];

/**
 * The assignee boxes: one per user, one for the shared Everyone assignment, and
 * one for tasks nobody has been given yet. The empty string is the box value for
 * Unassigned, matching how a task with no assignee is stored.
 */
export const calendarAssigneeBoxes = (users: readonly string[]) => [
  ...users,
  everyoneAssignee,
  "",
];

/** The smallest shape the calendar needs from a task. */
export type CalendarTask = {
  id: string;
  title: string;
  status: string;
  assignee: string | null;
  projectId: string | null;
  dueDate: string | null;
};

export type CalendarFilters = {
  /** The ticked statuses. */
  statuses: readonly string[];
  /** The ticked assignee boxes, as `calendarAssigneeBoxes` values. */
  assignees: readonly string[];
  /** Words typed into Find a task; matched against the title. */
  query: string;
};

/**
 * Which box an assignment belongs to. A task given to both of you sits under
 * Everyone and not under either name, so unticking Everyone hides exactly those
 * tasks and nothing else.
 */
export const assigneeBox = (assignee: string | null) => assignee ?? "";

/**
 * Whether one task belongs on the calendar under these filters. A task needs a
 * due date to appear at all: follow-up dates and confirmed deadlines are shown
 * on the task itself but do not place it on a day.
 */
export function matchesCalendarFilters(
  task: CalendarTask,
  filters: CalendarFilters,
) {
  if (!task.dueDate) return false;
  // In Progress and Cancelled are not offered as boxes, so they never show.
  if (!calendarStatuses.includes(task.status as CalendarStatus)) return false;
  if (!filters.statuses.includes(task.status)) return false;
  if (!filters.assignees.includes(assigneeBox(task.assignee))) return false;
  const query = filters.query.trim().toLowerCase();
  if (query && !task.title.toLowerCase().includes(query)) return false;
  return true;
}

/** Every task the calendar should show, soonest first and then by title. */
export function calendarTasks<T extends CalendarTask>(
  tasks: readonly T[],
  filters: CalendarFilters,
) {
  return tasks
    .filter((task) => matchesCalendarFilters(task, filters))
    .sort(
      (a, b) =>
        (a.dueDate ?? "").localeCompare(b.dueDate ?? "") ||
        a.title.localeCompare(b.title),
    );
}

/** Group already-filtered tasks by day, keeping the order they arrive in. */
export function groupByDueDate<T extends CalendarTask>(tasks: readonly T[]) {
  const byDate = new Map<string, T[]>();
  for (const task of tasks) {
    if (!task.dueDate) continue;
    const day = byDate.get(task.dueDate);
    if (day) day.push(task);
    else byDate.set(task.dueDate, [task]);
  }
  return byDate;
}

export const toDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
export const toIsoDate = (date: Date) => date.toISOString().slice(0, 10);

export function addDays(iso: string, days: number) {
  return toIsoDate(new Date(toDate(iso).getTime() + days * 86_400_000));
}

/**
 * How many days a keyboard move shifts a task by, or null when the key is not
 * one of the four move keys. Left and right move by a day; up and down move by
 * a week, the same distance as dragging a chip to the row above or below. The
 * calendar is the only place this is used, and it is a rule rather than an
 * event handler so it can be tested on its own like the rest of this file.
 */
export function moveDeltaFor(key: string): number | null {
  switch (key) {
    case "ArrowLeft":
      return -1;
    case "ArrowRight":
      return 1;
    case "ArrowUp":
      return -7;
    case "ArrowDown":
      return 7;
    default:
      return null;
  }
}

/** The first day of the month an anchor date falls in. */
export const startOfMonth = (iso: string) => `${iso.slice(0, 7)}-01`;

/**
 * A month on, keeping the same day of the month where one exists: 31 January
 * becomes 28 February rather than spilling into March.
 */
export function addMonths(iso: string, months: number) {
  const date = toDate(iso);
  const day = date.getUTCDate();
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return toIsoDate(new Date(Date.UTC(year, month, Math.min(day, lastDay))));
}

/** Monday, because that is how the week reads in the rest of the app. */
export function startOfWeek(iso: string) {
  return addDays(iso, -((toDate(iso).getUTCDay() + 6) % 7));
}

export type CalendarDay = {
  /** The day itself, as the stored date-only string. */
  date: string;
  /** 1–31, for the cell heading. */
  dayNumber: number;
  /** False for the days shown either side of the month being looked at. */
  inMonth: boolean;
  isToday: boolean;
};

/**
 * The weeks covering the month being looked at, Monday first, with the days from
 * the neighbouring months that complete the first and last week. Always whole
 * weeks, so the grid never has a ragged edge.
 */
export function monthGrid(anchor: string, today: string): CalendarDay[][] {
  const first = startOfMonth(anchor);
  const leading = (toDate(first).getUTCDay() + 6) % 7;
  const total = Math.ceil((leading + lengthOfMonth(first)) / 7) * 7;
  const start = addDays(first, -leading);
  const month = first.slice(0, 7);
  const weeks: CalendarDay[][] = [];
  for (let index = 0; index < total; index += 7) {
    const week: CalendarDay[] = [];
    for (let offset = 0; offset < 7; offset += 1) {
      const date = addDays(start, index + offset);
      week.push({
        date,
        dayNumber: Number(date.slice(8, 10)),
        inMonth: date.slice(0, 7) === month,
        isToday: date === today,
      });
    }
    weeks.push(week);
  }
  return weeks;
}

/** The seven days of the week the anchor falls in, Monday first. */
export function weekGrid(anchor: string, today: string): CalendarDay[] {
  const start = startOfWeek(anchor);
  return Array.from({ length: 7 }, (_, index) => {
    const date = addDays(start, index);
    return {
      date,
      dayNumber: Number(date.slice(8, 10)),
      // A week that straddles two months belongs to neither, so nothing is
      // faded out in this view.
      inMonth: true,
      isToday: date === today,
    };
  });
}

/** How many days the month an anchor falls in has. */
export function lengthOfMonth(iso: string) {
  const first = toDate(startOfMonth(iso));
  return new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
  ).getUTCDate();
}

const utc = (options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", ...options });
const monthYear = utc({ month: "long", year: "numeric" });
const dayOnly = utc({ day: "numeric" });
const dayMonth = utc({ day: "numeric", month: "long" });
const dayMonthYear = utc({ day: "numeric", month: "long", year: "numeric" });
const weekdayName = utc({ weekday: "long" });
const weekdayShort = utc({ weekday: "short" });

/** "September 2026" */
export const monthLabel = (iso: string) => monthYear.format(toDate(iso));

/** "15 – 21 September 2026", spelled out in full when the week crosses a month. */
export function weekLabel(iso: string) {
  const start = startOfWeek(iso);
  const end = addDays(start, 6);
  if (start.slice(0, 7) === end.slice(0, 7))
    return `${dayOnly.format(toDate(start))} – ${dayMonthYear.format(toDate(end))}`;
  if (start.slice(0, 4) === end.slice(0, 4))
    return `${dayMonth.format(toDate(start))} – ${dayMonthYear.format(toDate(end))}`;
  return `${dayMonthYear.format(toDate(start))} – ${dayMonthYear.format(toDate(end))}`;
}

/** "Monday 21 September 2026", the label a day cell is given for a screen reader. */
export const dayLabel = (iso: string) =>
  `${weekdayName.format(toDate(iso))} ${dayMonthYear.format(toDate(iso))}`;

/** The column headings, Monday first. */
export const weekdayLabels = (style: "long" | "short" = "short") => {
  const monday = startOfWeek("2026-01-01");
  const format = style === "long" ? weekdayName : weekdayShort;
  return Array.from({ length: 7 }, (_, index) =>
    format.format(toDate(addDays(monday, index))),
  );
};

/**
 * Project colours. Six calm tones, shared out so the same project keeps the same
 * colour every time the page is opened: the three starter projects have fixed
 * tones, and any project added later takes the next one, cycling back to the
 * start once all six are in use. A task with no project takes the unassigned
 * tone. The colour is never the only cue — every chip also carries the project
 * name in words.
 */
export const calendarTones = [1, 2, 3, 4, 5, 6] as const;
export const unassignedTone = 0;
const starterTones: Record<string, number> = {
  funeral: 1,
  notifications: 2,
  probate: 3,
};

export function projectTones(projects: readonly { id: string }[]) {
  const tones: Record<string, number> = {};
  let custom = 0;
  for (const project of projects) {
    if (starterTones[project.id]) tones[project.id] = starterTones[project.id];
    else {
      tones[project.id] = calendarTones[(custom + 3) % calendarTones.length];
      custom += 1;
    }
  }
  return tones;
}

/** The CSS class carrying a task's colour: `tone-1`…`tone-6`, or `tone-0`. */
export function toneClass(
  projectId: string | null,
  tones: Record<string, number>,
) {
  const tone = projectId ? tones[projectId] : undefined;
  return `tone-${tone ?? unassignedTone}`;
}

/**
 * What a day cell reads out and shows under its number: "3 tasks", "1 task",
 * and nothing at all on an empty day.
 */
export const dayCountLabel = (count: number) =>
  count === 1 ? "1 task" : count > 1 ? `${count} tasks` : "";

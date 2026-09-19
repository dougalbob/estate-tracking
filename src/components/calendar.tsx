"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Button } from "./ui/button";
import { rescheduleTask } from "@/app/actions";
import type { Snapshot } from "@/lib/records/store";
import { label, londonToday } from "@/lib/records/validation";
import {
  addDays,
  addMonths,
  calendarAssigneeBoxes,
  calendarStatuses,
  calendarTasks,
  dayCountLabel,
  dayLabel,
  groupByDueDate,
  monthGrid,
  monthLabel,
  moveDeltaFor,
  projectTones,
  toneClass,
  weekGrid,
  weekLabel,
  weekdayLabels,
  type CalendarView,
} from "@/lib/records/calendar";

type Task = Snapshot["tasks"][number];
type Project = Snapshot["projects"][number];

/**
 * The Calendar page: every task with a due date, laid out by month or by week
 * and colour coded by project. Two groups of checkboxes narrow the list — the
 * three statuses the calendar shows, and who the task is given to — and the
 * search box narrows it again by title. Clicking or tapping a task opens it
 * exactly as the Edit button does in the task list; dragging it onto another day
 * changes its due date and nothing else.
 *
 * In Progress and Cancelled tasks are deliberately not here at all: the boxes
 * offered are To Do, Scheduled and Done, and a task in either of the other two
 * statuses stays in the All tasks list, where the status menu still finds it.
 *
 * The page carries no standing explanation of any of this, and no running count
 * of what is on show: the boxes and the grid say it plainly enough, and the space
 * is better left to the days. It speaks only when a grid would otherwise look
 * empty by mistake — nothing matching the filters, or nothing in the month or
 * week being looked at.
 */
export function CalendarPage({
  tasks,
  projects,
  users,
  displayName,
  projectName,
  onOpenTask,
  onAddTask,
  onMessage,
  onError,
}: {
  tasks: Task[];
  projects: Project[];
  users: string[];
  /** The one rule for reading a stored assignment as a name, shared with the rest of the app. */
  displayName: (email: string | null) => string;
  /** The one rule for reading a stored project id as a name, shared likewise. */
  projectName: (id: string | null) => string | null;
  onOpenTask: (id: string) => void;
  onAddTask: () => void;
  onMessage: (message: string) => void;
  onError: (message: string) => void;
}) {
  const router = useRouter();
  const today = londonToday();
  const [view, setView] = useState<CalendarView>("month");
  const [anchor, setAnchor] = useState(today);
  const [statuses, setStatuses] = useState<string[]>([...calendarStatuses]);
  const [assignees, setAssignees] = useState<string[]>(
    calendarAssigneeBoxes(users),
  );
  const [query, setQuery] = useState("");
  // Drag and drop: the task being dragged, and the day it is hovering over.
  const [dragging, setDragging] = useState<Task | null>(null);
  const [dropDate, setDropDate] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const shown = useMemo(
    () => calendarTasks(tasks, { statuses, assignees, query }),
    [tasks, statuses, assignees, query],
  );
  const byDate = useMemo(() => groupByDueDate(shown), [shown]);
  const tones = useMemo(() => projectTones(projects), [projects]);
  // Every task that could appear on the calendar at all, before the checkboxes
  // and the search are applied. This is what tells "nothing matches your
  // filters" apart from "nothing has a due date yet".
  const datable = tasks.filter(
    (task) =>
      task.dueDate &&
      calendarStatuses.includes(
        task.status as (typeof calendarStatuses)[number],
      ),
  ).length;

  const weeks =
    view === "month" ? monthGrid(anchor, today) : [weekGrid(anchor, today)];
  const days = weeks.flat();
  const inPeriod = days.reduce(
    (total, day) => total + (byDate.get(day.date)?.length ?? 0),
    0,
  );
  const heading = view === "month" ? monthLabel(anchor) : weekLabel(anchor);
  const period = view === "month" ? heading : `the week ${heading}`;
  const step = view === "month" ? "month" : "week";
  const shortWeekdays = weekdayLabels("short");
  const longWeekdays = weekdayLabels("long");
  const filtersDefault =
    query.trim() === "" &&
    statuses.length === calendarStatuses.length &&
    assignees.length === calendarAssigneeBoxes(users).length;

  function toggle(list: string[], value: string) {
    return list.includes(value)
      ? list.filter((item) => item !== value)
      : [...list, value];
  }
  function resetFilters() {
    setQuery("");
    setStatuses([...calendarStatuses]);
    setAssignees(calendarAssigneeBoxes(users));
  }
  function move(direction: number) {
    setAnchor((current) =>
      view === "month"
        ? addMonths(current, direction)
        : addDays(current, direction * 7),
    );
  }

  /**
   * Dropping a task on a day. Only the due date is sent to the server, and the
   * version comes from the task as this page holds it, so a calendar left open
   * while the other person edits that task is refused rather than overwriting
   * their change. Dropping a task back on the day it is already on does nothing.
   */
  async function moveTo(task: Task, dueDate: string) {
    setDragging(null);
    setDropDate(null);
    if (busy || task.dueDate === dueDate) return;
    setBusy(true);
    try {
      const result = await rescheduleTask({
        taskId: task.id,
        dueDate,
        version: task.version,
      });
      if (result.ok) {
        onMessage(
          `“${task.title}” moved to ${dayLabel(dueDate)}. Nothing else about the task changed.`,
        );
        router.refresh();
      } else if (result.code === "conflict") {
        onError(
          `“${task.title}” changed while the calendar was open, so it was not moved. The calendar has been refreshed – check it and try again.`,
        );
        router.refresh();
      } else onError(result.error);
    } catch (error) {
      console.error("[calendar] move failed", error);
      onError(
        error instanceof Error ? error.message : "Unable to move that task",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="list-toolbar">
        <label className="search-label">
          Find a task
          <input
            type="search"
            placeholder="Search tasks…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <Button onClick={onAddTask}>
          <Plus size={16} />
          Add task
        </Button>
      </div>
      <div className="calendar-controls">
        <div className="calendar-nav">
          <Button variant="outline" onClick={() => move(-1)}>
            <ChevronLeft size={16} aria-hidden />
            Previous {step}
          </Button>
          <h2 className="calendar-title">{heading}</h2>
          <Button variant="outline" onClick={() => move(1)}>
            Next {step}
            <ChevronRight size={16} aria-hidden />
          </Button>
          <Button
            variant="outline"
            onClick={() => setAnchor(today)}
            title="Go back to the current month or week"
          >
            <CalendarDays size={16} aria-hidden />
            Today
          </Button>
        </div>
        <div className="calendar-views" role="group" aria-label="Calendar view">
          <Button
            variant={view === "month" ? "default" : "outline"}
            aria-pressed={view === "month"}
            onClick={() => setView("month")}
          >
            Month
          </Button>
          <Button
            variant={view === "week" ? "default" : "outline"}
            aria-pressed={view === "week"}
            onClick={() => setView("week")}
          >
            Week
          </Button>
        </div>
      </div>
      <div className="calendar-filters">
        <fieldset className="calendar-filter-group">
          <legend>Status</legend>
          {calendarStatuses.map((status) => (
            <label className="calendar-check" key={status}>
              <input
                type="checkbox"
                checked={statuses.includes(status)}
                onChange={() =>
                  setStatuses((current) => toggle(current, status))
                }
              />
              {label(status)}
            </label>
          ))}
        </fieldset>
        <fieldset className="calendar-filter-group">
          <legend>Assigned to</legend>
          {calendarAssigneeBoxes(users).map((box) => (
            <label className="calendar-check" key={box || "unassigned"}>
              <input
                type="checkbox"
                checked={assignees.includes(box)}
                onChange={() => setAssignees((current) => toggle(current, box))}
              />
              {displayName(box)}
            </label>
          ))}
        </fieldset>
        <Button
          variant="outline"
          onClick={resetFilters}
          disabled={filtersDefault}
        >
          Reset filters
        </Button>
      </div>
      {datable > 0 && (shown.length === 0 || inPeriod === 0) && (
        <p className="calendar-summary" role="status">
          {shown.length === 0
            ? "No tasks match these filters."
            : `Nothing in ${period}. ${shown.length} ${
                shown.length === 1 ? "task matches" : "tasks match"
              } your filters on other days.`}
        </p>
      )}
      <div
        className={`calendar-grid ${view}`}
        role="grid"
        aria-label={`Tasks with a due date in ${heading}`}
        aria-busy={busy || undefined}
      >
        <div className="calendar-week-row calendar-head-row" role="row">
          {shortWeekdays.map((short, index) => (
            <div
              className="calendar-weekday"
              role="columnheader"
              key={short}
              aria-label={longWeekdays[index]}
            >
              {short}
            </div>
          ))}
        </div>
        {weeks.map((week, weekIndex) => (
          <div className="calendar-week-row" role="row" key={weekIndex}>
            {week.map((day, dayIndex) => {
              const dayTasks = byDate.get(day.date) ?? [];
              return (
                <div
                  className={[
                    "calendar-day",
                    day.inMonth ? "" : "outside",
                    day.isToday ? "today" : "",
                    dropDate === day.date ? "drop-target" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  role="gridcell"
                  key={day.date}
                  onDragOver={(event) => {
                    if (!dragging) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    if (dropDate !== day.date) setDropDate(day.date);
                  }}
                  onDragLeave={(event) => {
                    // Moving between a day cell and the tasks inside it is not
                    // leaving the cell, so the highlight stays put.
                    const next = event.relatedTarget as Node | null;
                    if (next && event.currentTarget.contains(next)) return;
                    if (dropDate === day.date) setDropDate(null);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const id = event.dataTransfer.getData("text/plain");
                    const task = dragging ?? tasks.find((t) => t.id === id);
                    if (task) void moveTo(task, day.date);
                    else setDropDate(null);
                  }}
                >
                  <div className="calendar-day-head">
                    {/* A week on a narrow screen becomes one day per row, so
                        each row names its own day as well as numbering it. */}
                    {view === "week" && (
                      <span className="calendar-day-weekday">
                        {longWeekdays[dayIndex]}
                      </span>
                    )}
                    <span
                      className="calendar-day-number"
                      aria-label={dayLabel(day.date)}
                    >
                      {day.dayNumber}
                    </span>
                    {dayTasks.length > 0 && (
                      <span className="calendar-day-count">
                        {dayCountLabel(dayTasks.length)}
                      </span>
                    )}
                    {day.isToday && <span className="badge">Today</span>}
                  </div>
                  <div className="calendar-day-list">
                    {dayTasks.map((task) => {
                      const project = projectName(task.projectId);
                      const who = displayName(task.assignee);
                      return (
                        <button
                          type="button"
                          key={task.id}
                          className={`calendar-task ${toneClass(task.projectId, tones)}${
                            dragging?.id === task.id ? " dragging" : ""
                          }`}
                          draggable={!busy}
                          title={`${task.title} — ${project ?? "No project"}, ${label(
                            task.status,
                          )}, ${who}. Open the task, or move it by dragging it to another day or with the arrow keys.`}
                          aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown"
                          onClick={() => onOpenTask(task.id)}
                          onKeyDown={(event) => {
                            // A keyboard route for the drag: the four arrow
                            // keys move the focused task by a day or a week.
                            // Modifier combinations are left alone so browser
                            // and screen-reader shortcuts keep working.
                            if (
                              event.ctrlKey ||
                              event.metaKey ||
                              event.altKey ||
                              event.shiftKey
                            )
                              return;
                            const delta = moveDeltaFor(event.key);
                            if (delta === null || busy || !task.dueDate) return;
                            event.preventDefault();
                            void moveTo(task, addDays(task.dueDate, delta));
                          }}
                          onDragStart={(event) => {
                            event.dataTransfer.setData("text/plain", task.id);
                            event.dataTransfer.effectAllowed = "move";
                            setDragging(task);
                          }}
                          onDragEnd={() => {
                            setDragging(null);
                            setDropDate(null);
                          }}
                        >
                          <span className="calendar-task-title">
                            {task.title}
                          </span>
                          <span className="calendar-task-meta">
                            {project ?? "No project"} · {who}
                            {view === "week" && <> · {label(task.status)}</>}
                          </span>
                          {view === "week" &&
                            task.dueDate &&
                            task.dueDate < today &&
                            task.status !== "done" && (
                              <span className="calendar-task-meta">
                                Needs attention
                              </span>
                            )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {datable === 0 && (
        <section className="panel empty-state">
          <CalendarDays size={26} />
          <h2>Nothing dated yet</h2>
          <p>
            Tasks with a due date appear here, by month or by week. Add a due
            date to a task, or add a new task with one, and the calendar fills
            up.
          </p>
        </section>
      )}
    </>
  );
}

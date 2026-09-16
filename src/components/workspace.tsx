"use client";
import { useState, useEffect, useRef } from "react";
import {
  ArrowUpRight,
  BookOpen,
  ChevronRight,
  FolderOpen,
  Home,
  Leaf,
  ListTodo,
  LockKeyhole,
  Plus,
  Users,
  Wallet,
  ArrowLeft,
  Pencil,
  History,
  Phone,
} from "lucide-react";
import { switchDemoUser } from "@/app/actions";
import { RecordSummary } from "./record-summary";
import { useRouter } from "next/navigation";
import { Button } from "./ui/button";
import { RecordForm, type Editor } from "./record-form";
import type { Snapshot } from "@/lib/records/store";
import type { Identity } from "@/lib/auth/verify";
import {
  attentionDate,
  label,
  londonToday,
  taskStatuses,
} from "@/lib/records/validation";
const sections = [
  {
    id: "contacts",
    title: "Contacts",
    icon: Users,
    description:
      "Organisations, reference details, and the conversations that matter.",
  },
  {
    id: "tasks",
    title: "All tasks",
    icon: ListTodo,
    description:
      "A shared place for next steps, follow-ups, and confirmed dates.",
  },
  {
    id: "documents",
    title: "Documents",
    icon: FolderOpen,
    description: "Important paperwork, kept together and easy to find.",
  },
];
const formatTime = (value: string | Date) =>
  new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/London",
  }).format(new Date(value));
const formatDate = (value: string) =>
  new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(value));
export function Workspace({
  user,
  users,
  data,
}: {
  user: Identity;
  users: string[];
  data: Snapshot;
}) {
  const [view, setView] = useState("overview"),
    [selected, setSelected] = useState<string | null>(null),
    [editor, setEditor] = useState<Editor | null>(null),
    [history, setHistory] = useState<{ id: string; kind: string } | null>(null);
  const [query, setQuery] = useState(""),
    [status, setStatus] = useState("open"),
    [owner, setOwner] = useState("all"),
    [message, setMessage] = useState("");
  const router = useRouter();
  useEffect(() => {
    const refresh = () => {
      if (!editor && !history && document.visibilityState === "visible")
        router.refresh();
    };
    const interval = window.setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
    };
  }, [editor, history, router]);
  const organisation = data.organisations.find((o) => o.id === selected);
  const names = (email: string | null) =>
    email ? email.split("@")[0] : "Unassigned";
  const orgName = (id: string | null) =>
    data.organisations.find((o) => o.id === id)?.name ?? "No organisation";
  const openTasks = data.tasks.filter(
    (t) => !["done", "cancelled"].includes(t.status),
  );
  const sorted = [...openTasks].sort(
    (a, b) =>
      (attentionDate(a) ?? "9999").localeCompare(attentionDate(b) ?? "9999") ||
      a.title.localeCompare(b.title),
  );
  function navigate(v: string) {
    setView(v);
    setSelected(null);
    setHistory(null);
    setQuery("");
  }
  function edit(kind: Editor["kind"], id?: string, organisationId?: string) {
    setEditor({ kind, id, organisationId });
    setMessage("");
  }
  function historyButton(kind: string, id: string) {
    return (
      <button
        className="subtle-button"
        onClick={() => setHistory({ kind, id })}
      >
        <History size={14} />
        History
      </button>
    );
  }
  function taskRow(t: Snapshot["tasks"][number]) {
    const date = attentionDate(t),
      source = data.interactions.find((n) => n.id === t.interactionId);
    return (
      <div className="task-row" key={t.id}>
        <span className="task-icon">
          <ListTodo size={19} />
        </span>
        <div className="task-copy">
          <button className="record-title" onClick={() => edit("task", t.id)}>
            {t.title}
          </button>
          <p>
            {orgName(t.organisationId)}
            <span>·</span>
            {names(t.assignee)}
            {t.projectId && (
              <> · {data.projects.find((p) => p.id === t.projectId)?.name}</>
            )}
          </p>
          <p>
            {label(t.status)}
            {date && date < londonToday() && <> · Needs attention</>}
          </p>
          <p>
            {[
              ["Due", t.dueDate],
              ["Follow-up", t.followUpDate],
              ["Confirmed deadline", t.deadline],
            ]
              .filter(([, d]) => d)
              .map(([l, d]) => `${l}: ${formatDate(d!)}`)
              .join(" · ")}
          </p>
          {source && (
            <button
              className="text-link source-link"
              onClick={() => edit("interaction", source.id)}
            >
              From: {source.title}
            </button>
          )}
        </div>
        <div className="row-actions">
          <button
            className="subtle-button"
            aria-label={`Edit task ${t.title}`}
            onClick={() => edit("task", t.id)}
          >
            <Pencil size={14} />
            Edit
          </button>
          {historyButton("task", t.id)}
        </div>
      </div>
    );
  }
  function noteCard(note: Snapshot["interactions"][number]) {
    return (
      <article className="panel note-card" key={note.id}>
        <div className="section-heading">
          <div>
            <span className="badge">{label(note.kind)}</span>
            <h2>{note.title}</h2>
            <p>
              {formatTime(note.occurredAt)} · {names(note.createdBy)} ·{" "}
              {orgName(note.organisationId)}
            </p>
          </div>
          <button
            className="subtle-button"
            onClick={() => edit("interaction", note.id)}
          >
            <Pencil size={14} />
            Edit
          </button>
        </div>
        <p className="note-detail">{note.detail}</p>
        <div className="note-meta">
          <small>
            Recorded {formatTime(note.createdAt)}
            {note.version > 1 ? " · Edited" : ""}
          </small>
          {historyButton("interaction", note.id)}
        </div>
        {data.tasks.filter((t) => t.interactionId === note.id).map(taskRow)}
        <div className="panel-footer">
          <button
            className="text-link"
            onClick={() =>
              setEditor({
                kind: "task",
                organisationId: note.organisationId ?? undefined,
                interactionId: note.id,
              })
            }
          >
            <Plus size={14} />
            Add follow-up
          </button>
        </div>
      </article>
    );
  }
  const title =
    view === "overview"
      ? "Your overview"
      : view === "contacts"
        ? (organisation?.name ?? "Contacts")
        : view === "tasks"
          ? "All tasks"
          : view === "notes"
            ? "Unfiled notes"
            : view === "projects"
              ? "Your projects"
              : view === "finances"
                ? "Estate finances"
                : "Documents";
  return (
    <div className="app-shell">
      <a className="skip" href="#main">
        Skip to content
      </a>
      <aside className="sidebar">
        <a className="brand" href="#main" onClick={() => navigate("overview")}>
          <span className="brand-mark">
            <Leaf size={23} />
          </span>
          <span>
            Estate <br />
            Organiser
          </span>
        </a>
        <p className="sidebar-label">YOUR WORKSPACE</p>
        <nav aria-label="Main navigation">
          {[
            { id: "overview", title: "Overview", icon: Home },
            ...sections,
            { id: "notes", title: "Unfiled notes", icon: Phone },
            { id: "projects", title: "Projects", icon: BookOpen },
            { id: "finances", title: "Estate finances", icon: Wallet },
          ].map((s) => (
            <button
              key={s.id}
              className={`nav-item ${view === s.id ? "selected" : ""}`}
              aria-current={view === s.id ? "page" : undefined}
              onClick={() => navigate(s.id)}
            >
              <s.icon size={19} />
              {s.title}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <LockKeyhole size={17} />
          <span>
            One estate. A shared space.
            <br />
            <small>Built to take things one step at a time.</small>
          </span>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span>Our shared workspace</span>
          <div className="profile">
            <span className="avatar">
              {user.displayName.charAt(0).toUpperCase()}
            </span>
            {user.displayName}
          </div>
        </header>
        <main id="main" className="main-content">
          {user.demo && (
            <div className="preview-banner">
              <span className="demo-dot" />
              <strong>Fictional-data preview</strong>
              <span>
                Changes save to a separate demo database · do not enter real
                estate information
              </span>
              <button
                className="text-link"
                onClick={async () => {
                  await switchDemoUser(
                    user.email.startsWith("alex@") ? "jamie" : "alex",
                  );
                }}
              >
                Try as {user.email.startsWith("alex@") ? "Jamie" : "Alex"}
              </button>
            </div>
          )}
          <div className="page-heading">
            <div>
              <p className="eyebrow">A LITTLE CLARITY, ONE STEP AT A TIME</p>
              <h1>{title}</h1>
              <p>
                {view === "overview"
                  ? "See what needs attention and pick up where you left off."
                  : "Everything you need, shared between the two of you."}
              </p>
            </div>
            <Button onClick={() => edit("interaction")}>
              <Plus size={18} />
              Quick note
            </Button>
          </div>
          {message && (
            <p role="status" className="success-message">
              {message}
            </p>
          )}
          {view === "overview" && (
            <>
              <div className="dashboard-grid">
                <section className="panel attention">
                  <div className="section-heading">
                    <div>
                      <h2>What needs attention</h2>
                      <p>Dated work first, then your next steps.</p>
                    </div>
                    <span className="badge">{openTasks.length} open</span>
                  </div>
                  {sorted.slice(0, 5).map(taskRow)}
                  {!sorted.length && (
                    <div className="empty-state">
                      <ListTodo size={25} />
                      <h3>A clear starting point</h3>
                      <p>
                        Add your first organisation or a task when you’re ready.
                      </p>
                      <Button variant="outline" onClick={() => edit("task")}>
                        Add a task
                      </Button>
                    </div>
                  )}
                  <button
                    className="text-link panel-footer full-width"
                    onClick={() => navigate("tasks")}
                  >
                    View all tasks
                    <ChevronRight size={17} />
                  </button>
                </section>
                <section className="panel activity">
                  <div className="section-heading">
                    <div>
                      <h2>What changed</h2>
                      <p>The other person’s recent activity.</p>
                    </div>
                  </div>
                  {data.revisions
                    .filter((r) => r.actor !== user.email)
                    .slice(0, 5)
                    .map((r) => (
                      <div className="activity-entry" key={r.id}>
                        <span className="avatar secondary">
                          {names(r.actor).charAt(0).toUpperCase()}
                        </span>
                        <div>
                          <p>
                            <strong>{names(r.actor)}</strong> {r.action}{" "}
                            {String(r.after.name ?? r.after.title ?? r.entity)}.
                          </p>
                          <small>{formatTime(r.at)}</small>
                        </div>
                      </div>
                    ))}
                  {!data.revisions.some((r) => r.actor !== user.email) && (
                    <div className="empty-state">
                      <p>
                        Activity from{" "}
                        {names(users.find((u) => u !== user.email) ?? null)}{" "}
                        will appear here. No need to keep it all in your head.
                      </p>
                    </div>
                  )}
                </section>
              </div>
              <div className="shortcut-grid">
                {sections.map((s) => (
                  <button
                    className="panel shortcut"
                    key={s.id}
                    onClick={() => navigate(s.id)}
                  >
                    <div className="shortcut-top">
                      <s.icon size={23} />
                      <ArrowUpRight size={18} />
                    </div>
                    <h2>{s.title}</h2>
                    <p>{s.description}</p>
                    <span className="coming">
                      {s.id === "documents"
                        ? "Document uploads are coming next"
                        : "Open " + s.title.toLowerCase()}
                    </span>
                  </button>
                ))}
              </div>
              <section className="panel project-panel spaced">
                <h2>Your projects</h2>
                <p>Group the work in a way that makes sense to you.</p>
                <div className="project-pills">
                  {data.projects.map((p) => (
                    <span key={p.id}>{p.name}</span>
                  ))}
                </div>
              </section>
            </>
          )}
          {view === "contacts" && !organisation && (
            <>
              <div className="list-toolbar">
                <label className="search-label">
                  Find an organisation
                  <input
                    type="search"
                    placeholder="Search name, contact or reference…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
                <Button onClick={() => edit("organisation")}>
                  <Plus size={16} />
                  Add organisation
                </Button>
              </div>
              <div className="panel">
                {data.organisations
                  .filter((o) =>
                    [o.name, o.mainContact, o.reference]
                      .join(" ")
                      .toLowerCase()
                      .includes(query.toLowerCase()),
                  )
                  .map((o) => (
                    <button
                      key={o.id}
                      className="contact-row"
                      onClick={() => setSelected(o.id)}
                    >
                      <span className="task-icon">
                        <Users size={19} />
                      </span>
                      <span>
                        <strong>{o.name}</strong>
                        <small>
                          {o.mainContact ||
                            o.email ||
                            "Contact details ready to add"}
                        </small>
                      </span>
                      <span className="badge">{label(o.status)}</span>
                      <ChevronRight size={18} />
                    </button>
                  ))}
                {!data.organisations.length && (
                  <div className="empty-state">
                    <Users size={27} />
                    <h2>Start with one organisation</h2>
                    <p>
                      A bank, funeral director, or anyone you need to contact.
                    </p>
                  </div>
                )}
                {data.organisations.length > 0 &&
                  !data.organisations.some((o) =>
                    [o.name, o.mainContact, o.reference]
                      .join(" ")
                      .toLowerCase()
                      .includes(query.toLowerCase()),
                  ) && (
                    <p className="empty-state">
                      No organisations match your search.
                    </p>
                  )}
              </div>
            </>
          )}
          {view === "contacts" && organisation && (
            <>
              <button
                className="text-link back-link"
                onClick={() => setSelected(null)}
              >
                <ArrowLeft size={16} />
                All contacts
              </button>
              <section className="panel contact-details">
                <div className="section-heading">
                  <span className="badge">{label(organisation.status)}</span>
                  <div className="row-actions">
                    <button
                      className="subtle-button"
                      onClick={() => edit("organisation", organisation.id)}
                    >
                      <Pencil size={15} />
                      Edit organisation
                    </button>
                    {historyButton("organisation", organisation.id)}
                  </div>
                </div>
                <dl className="details-grid">
                  {[
                    ["Main contact", organisation.mainContact],
                    ["Phone numbers", organisation.phoneNumbers.join(" · ")],
                    ["Email", organisation.email],
                    ["Account / reference", organisation.reference],
                  ].map(([name, value]) => (
                    <div key={name}>
                      <dt>{name}</dt>
                      <dd>{value || "Not added"}</dd>
                    </div>
                  ))}
                </dl>
                {organisation.notes && (
                  <p className="note-detail">{organisation.notes}</p>
                )}
              </section>
              <div className="list-toolbar">
                <h2>Interaction history</h2>
                <Button
                  onClick={() =>
                    edit("interaction", undefined, organisation.id)
                  }
                >
                  <Plus size={16} />
                  Log interaction
                </Button>
              </div>
              {data.interactions
                .filter((n) => n.organisationId === organisation.id)
                .map(noteCard)}
              {!data.interactions.some(
                (n) => n.organisationId === organisation.id,
              ) && (
                <section className="panel empty-state">
                  <p>
                    No conversations recorded yet. Add a note when you make
                    contact.
                  </p>
                </section>
              )}
              <div className="list-toolbar">
                <h2>Linked tasks</h2>
                <Button
                  variant="outline"
                  onClick={() => edit("task", undefined, organisation.id)}
                >
                  Add task
                </Button>
              </div>
              <section className="panel">
                {data.tasks
                  .filter((t) => t.organisationId === organisation.id)
                  .map(taskRow)}
                {!data.tasks.some(
                  (t) => t.organisationId === organisation.id,
                ) && <p className="empty-state">No linked tasks yet.</p>}
              </section>
            </>
          )}
          {view === "tasks" && (
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
                <Button onClick={() => edit("task")}>
                  <Plus size={16} />
                  Add task
                </Button>
              </div>
              <div className="filter-bar">
                <label>
                  Status
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                  >
                    <option value="open">Open tasks</option>
                    <option value="all">All statuses</option>
                    {taskStatuses.map((s) => (
                      <option key={s} value={s}>
                        {label(s)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Assigned to
                  <select
                    value={owner}
                    onChange={(e) => setOwner(e.target.value)}
                  >
                    <option value="all">Everyone</option>
                    <option value="">Unassigned</option>
                    {users.map((u) => (
                      <option key={u} value={u}>
                        {names(u)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <section className="panel">
                {(() => {
                  const filtered = [...data.tasks]
                    .filter(
                      (t) =>
                        t.title.toLowerCase().includes(query.toLowerCase()) &&
                        (status === "all" ||
                          (status === "open"
                            ? !["done", "cancelled"].includes(t.status)
                            : t.status === status)) &&
                        (owner === "all" || (t.assignee ?? "") === owner),
                    )
                    .sort((a, b) =>
                      (attentionDate(a) ?? "9999").localeCompare(
                        attentionDate(b) ?? "9999",
                      ),
                    );
                  return filtered.length ? (
                    filtered.map(taskRow)
                  ) : (
                    <div className="empty-state">
                      <ListTodo size={26} />
                      <h2>No tasks in this view</h2>
                      <p>Add a next step or adjust your filters.</p>
                    </div>
                  );
                })()}
              </section>
            </>
          )}
          {view === "notes" && (
            <>
              {data.interactions.filter((n) => !n.organisationId).map(noteCard)}
              {!data.interactions.some((n) => !n.organisationId) && (
                <section className="panel empty-state">
                  <h2>A place for thoughts before they’re organised</h2>
                  <p>
                    Quick notes without an organisation appear here. You can
                    link them later.
                  </p>
                  <Button onClick={() => edit("interaction")}>
                    Add quick note
                  </Button>
                </section>
              )}
            </>
          )}
          {view === "projects" &&
            data.projects.map((p) => (
              <section className="panel project-panel spaced" key={p.id}>
                <h2>{p.name}</h2>
                <p>
                  Task grouping is available now. Project editing will follow.
                </p>
                {data.tasks.filter((t) => t.projectId === p.id).map(taskRow)}
                {!data.tasks.some((t) => t.projectId === p.id) && (
                  <p>No tasks assigned to this project yet.</p>
                )}
              </section>
            ))}
          {["documents", "finances"].includes(view) && (
            <section className="panel empty-state">
              <FolderOpen size={28} />
              <h2>
                {view === "documents"
                  ? "Your document space is coming next"
                  : "Financial tracking is a later milestone"}
              </h2>
              <p>
                {view === "documents"
                  ? "Friendly names, reusable attachments, and one central list. Uploads are not available yet."
                  : "Assets, liabilities, expenses, and reimbursements in GBP. No tax or entitlement calculations."}
              </p>
            </section>
          )}
          <footer className="page-footer">
            <Leaf size={15} />
            You don’t need to do everything today.
          </footer>
        </main>
      </div>
      {editor && (
        <RecordForm
          editor={editor}
          data={data}
          users={users}
          onClose={() => setEditor(null)}
          onSaved={(id) => {
            setMessage("Saved. Your shared workspace is up to date.");
            if (editor.kind === "organisation") {
              setView("contacts");
              setSelected(id);
            }
            setEditor(null);
          }}
        />
      )}
      {history && (
        <HistoryDialog
          data={data}
          target={history}
          onClose={() => setHistory(null)}
        />
      )}
    </div>
  );
}
function HistoryDialog({
  data,
  target,
  onClose,
}: {
  data: Snapshot;
  target: { id: string; kind: string };
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.showModal();
    return () => {
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="record-dialog history-panel"
      aria-label="Record history"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="dialog-heading">
        <h2>Record history</h2>
        <Button variant="outline" onClick={onClose}>
          Close history
        </Button>
      </div>
      <p className="form-help">
        Times shown in Europe/London. Earlier versions remain available after
        edits.
      </p>
      {data.revisions
        .filter((r) => r.entity === target.kind && r.entityId === target.id)
        .map((r) => (
          <details key={r.id}>
            <summary>
              {r.action === "created" ? "Created" : "Edited"} by{" "}
              {r.actor.split("@")[0]} · {formatTime(r.at)}
            </summary>
            {r.before && (
              <>
                <h3>Before</h3>
                <RecordSummary record={r.before} data={data} />
              </>
            )}
            <h3>{r.before ? "After" : "Original record"}</h3>
            <RecordSummary record={r.after} data={data} />
          </details>
        ))}
    </dialog>
  );
}

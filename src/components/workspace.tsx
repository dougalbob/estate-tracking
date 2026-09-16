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
  Trash2,
  ArchiveRestore,
  Archive,
  AlertTriangle,
} from "lucide-react";
import { switchDemoUser, deleteRecord, restoreRecord } from "@/app/actions";
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
const formatTime = (value: string | Date | number) =>
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
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
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
  const orgName = (id: string | null) => {
    if (!id) return "No organisation";
    return (
      data.organisations.find((o) => o.id === id)?.name ??
      data.deletedOrganisations.find((o) => o.id === id)?.name ??
      "Linked organisation"
    );
  };
  const projectName = (id: string | null) => {
    if (!id) return null;
    return (
      data.projects.find((p) => p.id === id)?.name ??
      data.deletedProjects.find((p) => p.id === id)?.name ??
      "Linked project"
    );
  };
  const organisationProjectIds = (orgId: string) =>
    data.organisationProjects
      .filter((op) => op.organisationId === orgId)
      .map((op) => op.projectId);
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
    setError("");
  }
  function edit(kind: Editor["kind"], id?: string, organisationId?: string) {
    setEditor({ kind, id, organisationId });
    setMessage("");
    setError("");
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
  async function handleDelete(
    kind: "organisation" | "interaction" | "task" | "project",
    id: string,
    version: number,
    permanent = false,
  ) {
    setError("");
    if (!permanent) {
      if (
        !window.confirm(
          "Move this to the recoverable bin? You can restore it later. Linked notes and tasks will not be deleted.",
        )
      )
        return;
    } else {
      if (
        !window.confirm(
          "Permanently delete this record? This cannot be undone. The edit history will remain, but the record itself will be removed. Linked tasks and notes will be kept but unlinked.",
        )
      )
        return;
      const second = window.prompt(
        "To confirm permanent deletion, type DELETE in capitals",
      );
      if (second !== "DELETE") {
        setError(
          "Permanent deletion cancelled – confirmation text did not match.",
        );
        return;
      }
    }
    const result = await deleteRecord(kind, id, version, permanent);
    if (!result.ok) {
      setError(result.error);
    } else {
      setMessage(
        permanent
          ? "Permanently deleted. The history entry remains for your records."
          : "Moved to the recoverable bin. You can restore it from the bin view.",
      );
      if (selected === id) setSelected(null);
      router.refresh();
    }
  }
  async function handleRestore(
    kind: "organisation" | "interaction" | "task" | "project",
    id: string,
    version: number,
  ) {
    setError("");
    const result = await restoreRecord(kind, id, version);
    if (!result.ok) {
      setError(result.error);
    } else {
      setMessage("Restored from the bin. It is now back in your workspace.");
      router.refresh();
    }
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
            {t.projectId && projectName(t.projectId) && (
              <> · {projectName(t.projectId)}</>
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
          <button
            className="subtle-button"
            aria-label={`Delete task ${t.title}`}
            onClick={() => handleDelete("task", t.id, t.version)}
          >
            <Trash2 size={14} />
            Bin
          </button>
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
          <div className="row-actions">
            <button
              className="subtle-button"
              onClick={() => edit("interaction", note.id)}
            >
              <Pencil size={14} />
              Edit
            </button>
            <button
              className="subtle-button"
              onClick={() => handleDelete("interaction", note.id, note.version)}
            >
              <Trash2 size={14} />
              Bin
            </button>
          </div>
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
              : view === "bin"
                ? "Recoverable bin"
                : view === "finances"
                  ? "Estate finances"
                  : "Documents";
  const binCount =
    data.deletedOrganisations.length +
    data.deletedInteractions.length +
    data.deletedTasks.length +
    data.deletedProjects.length;
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
            {
              id: "bin",
              title: `Recoverable bin${binCount ? ` (${binCount})` : ""}`,
              icon: Archive,
            },
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
                  : view === "bin"
                    ? "Deleted items stay here until you restore or permanently delete them. No automatic purge. Linked notes and tasks are not deleted when you bin an organisation."
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
          {error && (
            <div role="alert" className="form-error spaced-error">
              <p>{error}</p>
            </div>
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
                <div className="section-heading">
                  <div>
                    <h2>Your projects</h2>
                    <p>Group the work in a way that makes sense to you.</p>
                  </div>
                  <Button variant="outline" onClick={() => edit("project")}>
                    <Plus size={14} />
                    Add project
                  </Button>
                </div>
                <div className="project-pills">
                  {data.projects.map((p) => (
                    <button
                      key={p.id}
                      className="project-pill"
                      onClick={() => edit("project", p.id)}
                    >
                      {p.name}
                      <Pencil size={12} />
                    </button>
                  ))}
                </div>
                {!data.projects.length && (
                  <p className="empty-state">
                    No projects yet. Add one to group your work.
                  </p>
                )}
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
                          {organisationProjectIds(o.id).length > 0 && (
                            <>
                              {" "}
                              ·{" "}
                              {organisationProjectIds(o.id)
                                .map((pid) => projectName(pid))
                                .join(", ")}
                            </>
                          )}
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
                    <button
                      className="subtle-button"
                      onClick={() =>
                        handleDelete(
                          "organisation",
                          organisation.id,
                          organisation.version,
                        )
                      }
                    >
                      <Trash2 size={15} />
                      Move to bin
                    </button>
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
                {organisationProjectIds(organisation.id).length > 0 && (
                  <div
                    className="project-pills"
                    style={{ padding: "0 24px 18px" }}
                  >
                    {organisationProjectIds(organisation.id).map((pid) => (
                      <span key={pid}>{projectName(pid)}</span>
                    ))}
                  </div>
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
          {view === "projects" && (
            <>
              <div className="list-toolbar">
                <h2>Manage your projects</h2>
                <Button onClick={() => edit("project")}>
                  <Plus size={16} />
                  Add project
                </Button>
              </div>
              <p className="form-help" style={{ marginBottom: "16px" }}>
                Projects group tasks and organisations. Organisations can belong
                to multiple projects; tasks have one optional project. Rename
                projects any time. Deleting a project does not delete its tasks
                – it just unlinks them.
              </p>
              {data.projects.map((p) => {
                const linkedOrgs = data.organisationProjects
                  .filter((op) => op.projectId === p.id)
                  .map((op) =>
                    data.organisations.find((o) => o.id === op.organisationId),
                  )
                  .filter(Boolean) as Snapshot["organisations"];
                return (
                  <section className="panel project-panel spaced" key={p.id}>
                    <div className="section-heading">
                      <div>
                        <h2>{p.name}</h2>
                        <p>
                          {
                            data.tasks.filter((t) => t.projectId === p.id)
                              .length
                          }{" "}
                          tasks · {linkedOrgs.length} organisations
                        </p>
                      </div>
                      <div className="row-actions">
                        <button
                          className="subtle-button"
                          onClick={() => edit("project", p.id)}
                        >
                          <Pencil size={14} />
                          Rename
                        </button>
                        {historyButton("project", p.id)}
                        <button
                          className="subtle-button"
                          onClick={() =>
                            handleDelete("project", p.id, p.version)
                          }
                        >
                          <Trash2 size={14} />
                          Bin
                        </button>
                      </div>
                    </div>
                    {linkedOrgs.length > 0 && (
                      <div
                        className="project-pills"
                        style={{ padding: "0 24px 12px" }}
                      >
                        {linkedOrgs.map((o) => (
                          <span key={o.id}>{o.name}</span>
                        ))}
                      </div>
                    )}
                    <div style={{ borderTop: "1px solid var(--border)" }}>
                      {data.tasks
                        .filter((t) => t.projectId === p.id)
                        .map(taskRow)}
                      {!data.tasks.some((t) => t.projectId === p.id) && (
                        <p className="empty-state">
                          No tasks assigned to this project yet.
                        </p>
                      )}
                    </div>
                  </section>
                );
              })}
              {!data.projects.length && (
                <section className="panel empty-state">
                  <BookOpen size={26} />
                  <h2>No projects yet</h2>
                  <p>
                    Create Funeral, Notifications, Probate & Estate
                    Administration, or your own such as House Clearance. You can
                    link organisations to multiple projects.
                  </p>
                  <Button onClick={() => edit("project")}>
                    Add your first project
                  </Button>
                </section>
              )}
            </>
          )}
          {view === "bin" && (
            <>
              <div className="panel">
                <div className="section-heading">
                  <div>
                    <h2>How the bin works</h2>
                    <p>
                      Ordinary deletions go here. No automatic purge. Permanent
                      deletion needs explicit confirmation and keeps the history
                      entry. Deleting an organisation never deletes its notes,
                      tasks, or documents.
                    </p>
                  </div>
                  <span className="badge">{binCount} items</span>
                </div>
              </div>
              {[
                {
                  kind: "organisation" as const,
                  items: data.deletedOrganisations,
                  label: "Organisations",
                },
                {
                  kind: "interaction" as const,
                  items: data.deletedInteractions,
                  label: "Notes & interactions",
                },
                {
                  kind: "task" as const,
                  items: data.deletedTasks,
                  label: "Tasks",
                },
                {
                  kind: "project" as const,
                  items: data.deletedProjects,
                  label: "Projects",
                },
              ].map((group) => (
                <section className="panel spaced" key={group.kind}>
                  <div className="section-heading">
                    <h2>{group.label}</h2>
                    <span className="badge">{group.items.length}</span>
                  </div>
                  {group.items.map((item: any) => (
                    <div className="task-row" key={item.id}>
                      <span className="task-icon">
                        {group.kind === "organisation" ? (
                          <Users size={16} />
                        ) : group.kind === "interaction" ? (
                          <Phone size={16} />
                        ) : group.kind === "task" ? (
                          <ListTodo size={16} />
                        ) : (
                          <BookOpen size={16} />
                        )}
                      </span>
                      <div className="task-copy">
                        <strong>{item.name ?? item.title}</strong>
                        <p>
                          {item.detail
                            ? item.detail.slice(0, 120)
                            : item.reference || item.mainContact || ""}
                        </p>
                        <p>
                          <small>
                            Deleted {formatTime(item.deletedAt)} · Version{" "}
                            {item.version} · By {names(item.createdBy)}
                          </small>
                        </p>
                      </div>
                      <div className="row-actions">
                        <button
                          className="subtle-button"
                          onClick={() =>
                            handleRestore(group.kind, item.id, item.version)
                          }
                        >
                          <ArchiveRestore size={14} />
                          Restore
                        </button>
                        {historyButton(group.kind, item.id)}
                        <button
                          className="subtle-button danger"
                          onClick={() =>
                            handleDelete(
                              group.kind,
                              item.id,
                              item.version,
                              true,
                            )
                          }
                        >
                          <AlertTriangle size={14} />
                          Delete permanently
                        </button>
                      </div>
                    </div>
                  ))}
                  {!group.items.length && (
                    <p className="empty-state">
                      No {group.label.toLowerCase()} in the bin.
                    </p>
                  )}
                </section>
              ))}
            </>
          )}
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
            } else if (editor.kind === "project") {
              setView("projects");
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
        edits. Permanent deletions keep this history entry; the record content
        is no longer in the workspace.
      </p>
      {data.revisions
        .filter((r) => r.entity === target.kind && r.entityId === target.id)
        .map((r) => (
          <details key={r.id}>
            <summary>
              {r.action === "created"
                ? "Created"
                : r.action === "deleted"
                  ? "Moved to bin"
                  : r.action === "restored"
                    ? "Restored"
                    : r.action === "permanently_deleted"
                      ? "Permanently deleted"
                      : "Edited"}{" "}
              by {r.actor.split("@")[0]} · {formatTime(r.at)}
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
      {!data.revisions.some(
        (r) => r.entity === target.kind && r.entityId === target.id,
      ) && <p className="empty-state">No history found for this record.</p>}
    </dialog>
  );
}

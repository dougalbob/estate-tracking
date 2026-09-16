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
  Download,
  FileText,
  Link2,
  X,
  Eye,
} from "lucide-react";
import {
  switchDemoUser,
  deleteRecord,
  restoreRecord,
  uploadDocument,
  linkDocument,
  unlinkDocument,
} from "@/app/actions";
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
  documentCategories,
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
const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

type DocUploadInitial = {
  organisationId?: string;
  interactionId?: string;
  taskId?: string;
  projectId?: string;
};
type LinkPickerInitial = {
  documentId?: string;
  organisationId?: string;
  interactionId?: string;
  taskId?: string;
  projectId?: string;
};

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
    [docQuery, setDocQuery] = useState(""),
    [docCategory, setDocCategory] = useState("all"),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [docUpload, setDocUpload] = useState<DocUploadInitial | null>(null),
    [linkPicker, setLinkPicker] = useState<LinkPickerInitial | null>(null);

  const router = useRouter();
  useEffect(() => {
    const refresh = () => {
      if (!editor && !history && !docUpload && !linkPicker && document.visibilityState === "visible")
        router.refresh();
    };
    const interval = window.setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
    };
  }, [editor, history, docUpload, linkPicker, router]);

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

  // Direct links only
  const getLinkedDocuments = (filter: {
    organisationId?: string;
    interactionId?: string;
    taskId?: string;
    projectId?: string;
  }) => {
    const linkIds = data.documentLinks
      .filter((l) => {
        if (filter.organisationId && l.organisationId === filter.organisationId) return true;
        if (filter.interactionId && l.interactionId === filter.interactionId) return true;
        if (filter.taskId && l.taskId === filter.taskId) return true;
        if (filter.projectId && l.projectId === filter.projectId) return true;
        return false;
      })
      .map((l) => l.documentId);
    return data.documents.filter((d) => linkIds.includes(d.id));
  };

  // Enhanced for org detail: direct + via projects + via its notes/tasks
  const getLinkedDocumentsForOrg = (orgId: string) => {
    const directIds = new Set(
      data.documentLinks
        .filter((l) => l.organisationId === orgId)
        .map((l) => l.documentId),
    );
    const projIds = organisationProjectIds(orgId);
    const viaProjectIds = data.documentLinks
      .filter((l) => l.projectId && projIds.includes(l.projectId))
      .map((l) => l.documentId);
    const viaInteractionIds = data.documentLinks
      .filter((l) => {
        if (!l.interactionId) return false;
        const inter = data.interactions.find((i) => i.id === l.interactionId);
        return inter?.organisationId === orgId;
      })
      .map((l) => l.documentId);
    const viaTaskIds = data.documentLinks
      .filter((l) => {
        if (!l.taskId) return false;
        const t = data.tasks.find((t) => t.id === l.taskId);
        return t?.organisationId === orgId;
      })
      .map((l) => l.documentId);
    const all = new Set([...directIds, ...viaProjectIds, ...viaInteractionIds, ...viaTaskIds]);
    return data.documents.filter((d) => all.has(d.id));
  };

  const getDocumentLinks = (docId: string) => data.documentLinks.filter((l) => l.documentId === docId);
  const getDirectLinksForOrg = (docId: string, orgId: string) =>
    data.documentLinks.filter((l) => l.documentId === docId && l.organisationId === orgId);

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
    setDocQuery("");
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
    kind: "organisation" | "interaction" | "task" | "project" | "document",
    id: string,
    version: number,
    permanent = false,
  ) {
    setError("");
    if (!permanent) {
      if (
        !window.confirm(
          kind === "document"
            ? "Move this document to the recoverable bin? You can restore it later. Its links will be kept."
            : "Move this to the recoverable bin? You can restore it later. Linked notes, tasks, and documents will not be deleted.",
        )
      )
        return;
    } else {
      if (
        !window.confirm(
          kind === "document"
            ? "Permanently delete this document and its file? This cannot be undone. The edit history will remain, but the file will be removed."
            : "Permanently delete this record? This cannot be undone. The edit history will remain, but the record itself will be removed. Linked tasks and notes will be kept but unlinked.",
        )
      )
        return;
      const second = window.prompt(
        "To confirm permanent deletion, type DELETE in capitals",
      );
      if (second !== "DELETE") {
        setError("Permanent deletion cancelled – confirmation text did not match.");
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
    kind: "organisation" | "interaction" | "task" | "project" | "document",
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
    const docs = getLinkedDocuments({ taskId: t.id });
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
            {docs.length > 0 && <> · {docs.length} document{docs.length > 1 ? "s" : ""}</>}
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
          {docs.length > 0 && (
            <div className="doc-pills">
              {docs.map((d) => (
                <span key={d.id} className="badge">
                  <FileText size={10} /> {d.friendlyName}
                </span>
              ))}
            </div>
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
    const docs = getLinkedDocuments({ interactionId: note.id });
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
        {docs.length > 0 && (
          <div className="doc-list" style={{ padding: "0 24px 12px" }}>
            {docs.map((d) => (
              <div key={d.id} className="doc-inline">
                <FileText size={14} />
                <span>{d.friendlyName}</span>
                <a
                  href={`/api/documents/${d.id}/download`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="subtle-button"
                  title="View in new tab"
                >
                  <Eye size={12} /> View
                </a>
                <a
                  href={`/api/documents/${d.id}/download?download=1`}
                  className="subtle-button"
                  title="Download file"
                >
                  <Download size={12} /> Download
                </a>
                <span className="badge">{d.category ? label(d.category) : "No category"}</span>
              </div>
            ))}
          </div>
        )}
        <div className="note-meta">
          <small>
            Recorded {formatTime(note.createdAt)}
            {note.version > 1 ? " · Edited" : ""}
          </small>
          <div className="row-actions">
            {historyButton("interaction", note.id)}
            <button
              className="subtle-button"
              onClick={() => setDocUpload({ interactionId: note.id })}
            >
              <FileText size={14} />
              Attach document
            </button>
            <button
              className="subtle-button"
              onClick={() => setLinkPicker({ interactionId: note.id })}
            >
              <Link2 size={14} />
              Link existing
            </button>
          </div>
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

  function documentRow(doc: Snapshot["documents"][number]) {
    const links = getDocumentLinks(doc.id);
    const linkedNames = links
      .map((l) => {
        if (l.organisationId) return orgName(l.organisationId);
        if (l.interactionId) return data.interactions.find((i) => i.id === l.interactionId)?.title ?? "Note";
        if (l.taskId) return data.tasks.find((t) => t.id === l.taskId)?.title ?? "Task";
        if (l.projectId) return projectName(l.projectId);
        return null;
      })
      .filter(Boolean);
    return (
      <div className="task-row" key={doc.id}>
        <span className="task-icon">
          <FileText size={18} />
        </span>
        <div className="task-copy">
          <button className="record-title" onClick={() => edit("document", doc.id)}>
            {doc.friendlyName}
          </button>
          <p>
            {doc.originalName} · {formatSize(doc.size)} · {names(doc.createdBy)}
            {doc.category && <> · {label(doc.category)}</>}
          </p>
          <p>
            {linkedNames.length > 0 ? linkedNames.join(" · ") : "No links yet – reusable across records"}
          </p>
          <p>
            <small>Stored as {doc.storageName.slice(0, 8)}… · {formatTime(doc.createdAt)}</small>
          </p>
        </div>
        <div className="row-actions">
          <a
            href={`/api/documents/${doc.id}/download`}
            target="_blank"
            rel="noopener noreferrer"
            className="subtle-button"
            title="View document in new tab – does not leave this page"
          >
            <Eye size={14} />
            View
          </a>
          <a
            href={`/api/documents/${doc.id}/download?download=1`}
            className="subtle-button"
            title="Download to your computer"
          >
            <Download size={14} />
            Download
          </a>
          <button className="subtle-button" onClick={() => edit("document", doc.id)}>
            <Pencil size={14} />
            Edit
          </button>
          <button className="subtle-button" onClick={() => setLinkPicker({ documentId: doc.id })}>
            <Link2 size={14} />
            Link
          </button>
          {historyButton("document", doc.id)}
          <button className="subtle-button" onClick={() => handleDelete("document", doc.id, doc.version)}>
            <Trash2 size={14} />
            Bin
          </button>
        </div>
      </div>
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
              : view === "documents"
                ? "Documents"
                : view === "bin"
                  ? "Recoverable bin"
                  : view === "finances"
                    ? "Estate finances"
                    : "Documents";
  const binCount =
    data.deletedOrganisations.length +
    data.deletedInteractions.length +
    data.deletedTasks.length +
    data.deletedProjects.length +
    data.deletedDocuments.length;

  const filteredDocs = [...data.documents].filter((d) => {
    const q = docQuery.toLowerCase();
    const matchesQuery =
      !q ||
      [d.friendlyName, d.originalName, d.category ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(q) ||
      getDocumentLinks(d.id).some((l) => {
        if (l.organisationId) return orgName(l.organisationId).toLowerCase().includes(q);
        if (l.interactionId) return (data.interactions.find((i) => i.id === l.interactionId)?.title ?? "").toLowerCase().includes(q);
        if (l.taskId) return (data.tasks.find((t) => t.id === l.taskId)?.title ?? "").toLowerCase().includes(q);
        if (l.projectId) return (projectName(l.projectId) ?? "").toLowerCase().includes(q);
        return false;
      });
    const matchesCategory = docCategory === "all" || (d.category ?? "") === docCategory;
    return matchesQuery && matchesCategory;
  });

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
                    ? "Deleted items stay here until you restore or permanently delete them. No automatic purge. Linked notes and tasks are not deleted when you bin an organisation. Documents stay until you permanently delete them."
                    : view === "documents"
                      ? "Store a file once and link it to many organisations, notes, tasks, or projects. View opens in a new tab so you stay in the app; Download saves a copy to your computer."
                      : "Everything you need, shared between the two of you."}
              </p>
            </div>
            <div className="row-actions">
              {view === "documents" && (
                <Button variant="outline" onClick={() => setDocUpload({})}>
                  <FileText size={16} />
                  Upload document
                </Button>
              )}
              <Button onClick={() => edit("interaction")}>
                <Plus size={18} />
                Quick note
              </Button>
            </div>
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
                            {String(r.after.name ?? r.after.title ?? r.after.friendlyName ?? r.entity)}.
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
                        ? `${data.documents.length} documents · Open list`
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
                          {getLinkedDocumentsForOrg(o.id).length > 0 && (
                            <> · {getLinkedDocumentsForOrg(o.id).length} docs</>
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
                    style={{ padding: "0 24px 12px" }}
                  >
                    {organisationProjectIds(organisation.id).map((pid) => (
                      <span key={pid}>{projectName(pid)}</span>
                    ))}
                  </div>
                )}
                <div className="section-heading" style={{ borderTop: "1px solid var(--border)" }}>
                  <h3>Documents</h3>
                  <div className="row-actions">
                    <Button variant="outline" onClick={() => setDocUpload({ organisationId: organisation.id })}>
                      <FileText size={14} />
                      Upload
                    </Button>
                    <Button variant="outline" onClick={() => setLinkPicker({ organisationId: organisation.id })}>
                      <Link2 size={14} />
                      Link existing
                    </Button>
                  </div>
                </div>
                <div style={{ padding: "0 24px 16px" }}>
                  {getLinkedDocumentsForOrg(organisation.id).map((d) => {
                    const directLinks = getDirectLinksForOrg(d.id, organisation.id);
                    const allLinks = getDocumentLinks(d.id);
                    const isDirect = directLinks.length > 0;
                    const viaProject = allLinks.some((l) => l.projectId && organisationProjectIds(organisation.id).includes(l.projectId));
                    return (
                      <DocumentLinkRow
                        key={d.id}
                        doc={d}
                        directLinks={directLinks}
                        allLinks={allLinks}
                        isDirect={isDirect}
                        viaProject={viaProject}
                        onUnlink={async (linkId) => {
                          const res = await unlinkDocument(linkId);
                          if (!res.ok) setError(res.error);
                          else {
                            setMessage("Link removed – document itself stays.");
                            router.refresh();
                          }
                        }}
                      />
                    );
                  })}
                  {!getLinkedDocumentsForOrg(organisation.id).length && (
                    <p className="form-help">No documents linked yet. Upload a certificate or link an existing file – it can be reused elsewhere. If you linked a document to a project that this organisation belongs to, it will also appear here.</p>
                  )}
                </div>
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
                – it just unlinks them. Documents can be linked to projects too.
              </p>
              {data.projects.map((p) => {
                const linkedOrgs = data.organisationProjects
                  .filter((op) => op.projectId === p.id)
                  .map((op) =>
                    data.organisations.find((o) => o.id === op.organisationId),
                  )
                  .filter(Boolean) as Snapshot["organisations"];
                const docs = getLinkedDocuments({ projectId: p.id });
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
                          tasks · {linkedOrgs.length} organisations · {docs.length} docs
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
                    <div style={{ padding: "0 24px 12px", borderTop: linkedOrgs.length ? "1px solid var(--border)" : "0", display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      {docs.map((d) => (
                        <span key={d.id} className="badge">
                          <FileText size={10} /> {d.friendlyName}
                          <a href={`/api/documents/${d.id}/download`} target="_blank" rel="noopener noreferrer" className="subtle-button" style={{ marginLeft: "4px" }}><Eye size={10} /></a>
                        </span>
                      ))}
                      <button className="subtle-button" onClick={() => setDocUpload({ projectId: p.id })}>
                        <FileText size={12} /> Attach doc
                      </button>
                      <button className="subtle-button" onClick={() => setLinkPicker({ projectId: p.id })}>
                        <Link2 size={12} /> Link existing
                      </button>
                    </div>
                    <div style={{ borderTop: "1px solid var(--border)" }}>
                      {data.tasks.filter((t) => t.projectId === p.id).map(taskRow)}
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
          {view === "documents" && (
            <>
              <div className="list-toolbar">
                <div style={{ display: "flex", gap: "12px", flex: 1, flexWrap: "wrap" }}>
                  <label className="search-label">
                    Search documents
                    <input
                      type="search"
                      placeholder="Search name, category, or linked record…"
                      value={docQuery}
                      onChange={(e) => setDocQuery(e.target.value)}
                    />
                  </label>
                  <label>
                    Category
                    <select
                      value={docCategory}
                      onChange={(e) => setDocCategory(e.target.value)}
                    >
                      <option value="all">All categories</option>
                      {documentCategories.map((c) => (
                        <option key={c} value={c}>
                          {label(c)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <Button onClick={() => setDocUpload({})}>
                  <Plus size={16} />
                  Upload document
                </Button>
              </div>
              <p className="form-help" style={{ marginBottom: "12px" }}>
                Files are stored locally in <code>{user.demo ? "./data/demo-documents" : "DOCUMENTS_PATH"}</code> (production: <code>/mnt/user/appdata/estate-organiser/documents</code> inside container as <code>/data/documents</code>). Stored once, linked many times. View opens in a new tab so you stay in the app; Download saves a copy to your computer. Removing a link does not delete the file. Max 20 MB, PDF/images/text allowed.
              </p>
              <section className="panel">
                {filteredDocs.map(documentRow)}
                {!filteredDocs.length && (
                  <div className="empty-state">
                    <FolderOpen size={26} />
                    <h2>{data.documents.length ? "No matching documents" : "Your document space"}</h2>
                    <p>
                      {data.documents.length
                        ? "Adjust your search or category filter."
                        : "Upload a certificate, screenshot, or scanned letter. Give it a friendly name and link it to organisations, notes, tasks, or projects. One file can be reused everywhere."}
                    </p>
                    {!data.documents.length && (
                      <Button onClick={() => setDocUpload({})}>
                        Upload your first document
                      </Button>
                    )}
                  </div>
                )}
              </section>
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
                      tasks, or documents. Document files stay until permanent deletion.
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
                {
                  kind: "document" as const,
                  items: data.deletedDocuments,
                  label: "Documents",
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
                        ) : group.kind === "document" ? (
                          <FileText size={16} />
                        ) : (
                          <BookOpen size={16} />
                        )}
                      </span>
                      <div className="task-copy">
                        <strong>{item.name ?? item.title ?? item.friendlyName}</strong>
                        <p>
                          {item.detail
                            ? item.detail.slice(0, 120)
                            : item.reference || item.mainContact || item.originalName || ""}
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
          {view === "finances" && (
            <section className="panel empty-state">
              <Wallet size={28} />
              <h2>Financial tracking is a later milestone</h2>
              <p>
                Assets, liabilities, expenses, and reimbursements in GBP. No tax
                or entitlement calculations.
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
            } else if (editor.kind === "document") {
              setView("documents");
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
      {docUpload && (
        <DocumentUploadDialog
          data={data}
          initial={docUpload}
          onClose={() => setDocUpload(null)}
          onUploaded={(id) => {
            setMessage("Document uploaded and linked. Stored once, reusable everywhere.");
            setDocUpload(null);
            router.refresh();
          }}
          onError={setError}
        />
      )}
      {linkPicker && (
        <DocumentLinkPicker
          data={data}
          initial={linkPicker}
          onClose={() => setLinkPicker(null)}
          onLinked={() => {
            setMessage("Document linked – one file, many places.");
            setLinkPicker(null);
            router.refresh();
          }}
          onError={setError}
        />
      )}
    </div>
  );
}

function DocumentLinkRow({
  doc,
  directLinks,
  allLinks,
  isDirect,
  viaProject,
  onUnlink,
}: {
  doc: Snapshot["documents"][number];
  directLinks: Snapshot["documentLinks"];
  allLinks: Snapshot["documentLinks"];
  isDirect: boolean;
  viaProject?: boolean;
  onUnlink: (linkId: string) => void;
}) {
  return (
    <div className="doc-inline-row">
      <FileText size={14} />
      <span style={{ fontWeight: 600 }}>{doc.friendlyName}</span>
      <span className="badge">{doc.category ? label(doc.category) : "No category"}</span>
      <span className="badge">{formatSize(doc.size)}</span>
      {!isDirect && viaProject && <span className="badge">via project</span>}
      <div className="row-actions" style={{ marginLeft: "auto", gap: "6px" }}>
        <a
          href={`/api/documents/${doc.id}/download`}
          target="_blank"
          rel="noopener noreferrer"
          className="subtle-button"
          title="View in new tab – you stay in the app"
        >
          <Eye size={12} /> View
        </a>
        <a
          href={`/api/documents/${doc.id}/download?download=1`}
          className="subtle-button"
          title="Download a copy to your computer"
        >
          <Download size={12} /> Download
        </a>
        {directLinks.map((l) => (
          <button key={l.id} className="subtle-button danger" onClick={() => onUnlink(l.id)}>
            <X size={12} />
            Remove link
          </button>
        ))}
        {!isDirect && (
          <span className="form-help" style={{ fontSize: "10px" }}>
            Linked via {allLinks.map((l) => l.projectId ? `project ${l.projectId}` : l.taskId ? "task" : l.interactionId ? "note" : "other").join(", ")}
          </span>
        )}
      </div>
    </div>
  );
}

function DocumentUploadDialog({
  data,
  initial,
  onClose,
  onUploaded,
  onError,
}: {
  data: Snapshot;
  initial: DocUploadInitial;
  onClose: () => void;
  onUploaded: (id: string) => void;
  onError: (msg: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [friendlyName, setFriendlyName] = useState("");
  const [category, setCategory] = useState("");
  const [linkKind, setLinkKind] = useState<"none" | "organisation" | "interaction" | "task" | "project">(
    initial.organisationId ? "organisation" : initial.interactionId ? "interaction" : initial.taskId ? "task" : initial.projectId ? "project" : "none",
  );
  const [linkId, setLinkId] = useState(
    initial.organisationId ?? initial.interactionId ?? initial.taskId ?? initial.projectId ?? "",
  );
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  // When initial changes, sync linkKind/linkId (for safety)
  useEffect(() => {
    if (initial.organisationId) {
      setLinkKind("organisation");
      setLinkId(initial.organisationId);
    } else if (initial.interactionId) {
      setLinkKind("interaction");
      setLinkId(initial.interactionId);
    } else if (initial.taskId) {
      setLinkKind("task");
      setLinkId(initial.taskId);
    } else if (initial.projectId) {
      setLinkKind("project");
      setLinkId(initial.projectId);
    }
  }, [initial]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      onError("Choose a file first");
      return;
    }
    if (linkKind !== "none" && !linkId) {
      onError("Choose where to link it, or select No link");
      return;
    }
    setBusy(true);
    const fd = new FormData();
    fd.set("file", file);
    fd.set("friendlyName", friendlyName || file.name.replace(/\.[^/.]+$/, ""));
    if (category) fd.set("category", category);
    if (linkKind === "organisation" && linkId) fd.set("organisationId", linkId);
    if (linkKind === "interaction" && linkId) fd.set("interactionId", linkId);
    if (linkKind === "task" && linkId) fd.set("taskId", linkId);
    if (linkKind === "project" && linkId) fd.set("projectId", linkId);
    const res = await uploadDocument(fd);
    setBusy(false);
    if (!res.ok) {
      onError(res.error);
    } else {
      if ((res as any).warning) onError((res as any).warning);
      onUploaded(res.id);
    }
  }

  return (
    <dialog ref={dialog} className="record-dialog" onCancel={(e) => { e.preventDefault(); onClose(); }}>
      <form onSubmit={submit}>
        <div className="dialog-heading">
          <div>
            <p className="eyebrow">STORE ONCE, LINK MANY TIMES</p>
            <h2>Upload document</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} disabled={busy}>
            <X size={21} />
          </button>
        </div>
        <fieldset disabled={busy} className="form-fields">
          <label>
            File <small>PDF, image, or text – max 20 MB</small>
            <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.tiff,.txt,image/*,application/pdf" required onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setFile(f);
              if (f && !friendlyName) setFriendlyName(f.name.replace(/\.[^/.]+$/, ""));
            }} />
          </label>
          <label>
            Friendly name
            <input value={friendlyName} onChange={(e) => setFriendlyName(e.target.value)} required maxLength={200} placeholder="Death certificate – Bank1" />
          </label>
          <label>
            Category
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">No category</option>
              {documentCategories.map((c) => (
                <option key={c} value={c}>{label(c)}</option>
              ))}
            </select>
          </label>
          <p className="form-help">
            In production files go to <code>/mnt/user/appdata/estate-organiser/documents</code> (container path <code>/data/documents</code>). Demo mode uses <code>./data/demo-documents</code>. Storage names are generated safely – original name is kept for download. View opens in a new tab so you stay in the app; Download saves a copy.
          </p>
          <fieldset className="follow-up">
            <legend>Link to (optional – you can link later too)</legend>
            <label>
              Link kind
              <select value={linkKind} onChange={(e) => { const k = e.target.value as any; setLinkKind(k); setLinkId(""); }}>
                <option value="none">No link yet – just store</option>
                <option value="organisation">Organisation (contact)</option>
                <option value="interaction">Interaction / Note</option>
                <option value="task">Task</option>
                <option value="project">Project</option>
              </select>
            </label>
            {linkKind === "organisation" && (
              <label>
                Organisation
                <select value={linkId} onChange={(e) => setLinkId(e.target.value)} required>
                  <option value="">Choose organisation…</option>
                  {data.organisations.map((o) => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
              </label>
            )}
            {linkKind === "interaction" && (
              <label>
                Interaction / Note
                <select value={linkId} onChange={(e) => setLinkId(e.target.value)} required>
                  <option value="">Choose note…</option>
                  {data.interactions.slice(0, 100).map((n) => (
                    <option key={n.id} value={n.id}>{n.title} – {n.detail.slice(0, 40)}</option>
                  ))}
                </select>
              </label>
            )}
            {linkKind === "task" && (
              <label>
                Task
                <select value={linkId} onChange={(e) => setLinkId(e.target.value)} required>
                  <option value="">Choose task…</option>
                  {data.tasks.slice(0, 100).map((t) => (
                    <option key={t.id} value={t.id}>{t.title}</option>
                  ))}
                </select>
              </label>
            )}
            {linkKind === "project" && (
              <label>
                Project
                <select value={linkId} onChange={(e) => setLinkId(e.target.value)} required>
                  <option value="">Choose project…</option>
                  {data.projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </label>
            )}
            <p className="form-help">Pick exactly one place here – after upload you can link the same file to many records from the Documents list. This fixes the earlier issue where picking multiple caused the link to fail.</p>
          </fieldset>
        </fieldset>
        <div className="form-actions">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? "Uploading…" : "Upload"}</Button>
        </div>
      </form>
    </dialog>
  );
}

function DocumentLinkPicker({
  data,
  initial,
  onClose,
  onLinked,
  onError,
}: {
  data: Snapshot;
  initial: LinkPickerInitial;
  onClose: () => void;
  onLinked: () => void;
  onError: (msg: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [docId, setDocId] = useState(initial.documentId ?? "");
  const [linkKind, setLinkKind] = useState<"organisation" | "interaction" | "task" | "project">(
    initial.organisationId ? "organisation" : initial.interactionId ? "interaction" : initial.taskId ? "task" : initial.projectId ? "project" : "organisation",
  );
  const [linkId, setLinkId] = useState(
    initial.organisationId ?? initial.interactionId ?? initial.taskId ?? initial.projectId ?? "",
  );

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!docId) {
      onError("Choose a document first");
      return;
    }
    if (!linkId) {
      onError("Choose where to link it");
      return;
    }
    setBusy(true);
    const input: any = { documentId: docId };
    if (linkKind === "organisation") input.organisationId = linkId;
    if (linkKind === "interaction") input.interactionId = linkId;
    if (linkKind === "task") input.taskId = linkId;
    if (linkKind === "project") input.projectId = linkId;
    const res = await linkDocument(input);
    setBusy(false);
    if (!res.ok) onError(res.error);
    else onLinked();
  }

  return (
    <dialog ref={dialog} className="record-dialog" onCancel={(e) => { e.preventDefault(); onClose(); }}>
      <form onSubmit={submit}>
        <div className="dialog-heading">
          <div>
            <p className="eyebrow">ONE FILE, MANY PLACES</p>
            <h2>Link document</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} disabled={busy}>
            <X size={21} />
          </button>
        </div>
        <fieldset disabled={busy} className="form-fields">
          <label>
            Document
            <select value={docId} onChange={(e) => setDocId(e.target.value)} required>
              <option value="">Choose document</option>
              {data.documents.map((d) => (
                <option key={d.id} value={d.id}>{d.friendlyName} – {d.originalName}</option>
              ))}
            </select>
          </label>
          <p className="form-help">Removing a link never deletes the file or its other links. Store once, reuse everywhere. View opens in new tab; Download saves a copy.</p>
          <label>
            Link to what?
            <select value={linkKind} onChange={(e) => { setLinkKind(e.target.value as any); setLinkId(""); }}>
              <option value="organisation">Organisation (contact)</option>
              <option value="interaction">Interaction / Note</option>
              <option value="task">Task</option>
              <option value="project">Project</option>
            </select>
          </label>
          {linkKind === "organisation" && (
            <label>
              Organisation
              <select value={linkId} onChange={(e) => setLinkId(e.target.value)} required>
                <option value="">Pick organisation…</option>
                {data.organisations.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            </label>
          )}
          {linkKind === "interaction" && (
            <label>
              Interaction / Note
              <select value={linkId} onChange={(e) => setLinkId(e.target.value)} required>
                <option value="">Pick note…</option>
                {data.interactions.slice(0, 100).map((n) => (
                  <option key={n.id} value={n.id}>{n.title}</option>
                ))}
              </select>
            </label>
          )}
          {linkKind === "task" && (
            <label>
              Task
              <select value={linkId} onChange={(e) => setLinkId(e.target.value)} required>
                <option value="">Pick task…</option>
                {data.tasks.slice(0, 100).map((t) => (
                  <option key={t.id} value={t.id}>{t.title}</option>
                ))}
              </select>
            </label>
          )}
          {linkKind === "project" && (
            <label>
              Project
              <select value={linkId} onChange={(e) => setLinkId(e.target.value)} required>
                <option value="">Pick project…</option>
                {data.projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </label>
          )}
          {linkId && <p className="form-help">Will link document to {linkKind}: {linkId}</p>}
        </fieldset>
        <div className="form-actions">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? "Linking…" : "Link"}</Button>
        </div>
      </form>
    </dialog>
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
        is no longer in the workspace. Document files are removed only on permanent deletion.
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

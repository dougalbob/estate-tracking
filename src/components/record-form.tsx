"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X, Plus, Link2Off, Lightbulb, Trash2 } from "lucide-react";
import { RecordSummary } from "./record-summary";
import { Button } from "./ui/button";
import { saveRecord, linkDocument, unlinkDocument } from "@/app/actions";
import type { Snapshot } from "@/lib/records/store";
import {
  label,
  organisationStatuses,
  taskStatuses,
  documentCategories,
} from "@/lib/records/validation";
export type Editor = {
  kind: "organisation" | "interaction" | "task" | "project" | "document";
  id?: string;
  organisationId?: string;
  interactionId?: string;
};
type Props = {
  editor: Editor;
  data: Snapshot;
  users: string[];
  onClose: () => void;
  onSaved: (id: string) => void;
};
export function RecordForm({ editor, data, users, onClose, onSaved }: Props) {
  const router = useRouter();
  const rows =
    editor.kind === "organisation"
      ? data.organisations
      : editor.kind === "interaction"
        ? data.interactions
        : editor.kind === "task"
          ? data.tasks
          : editor.kind === "project"
            ? data.projects
            : data.documents;
  const record = rows.find((r) => r.id === editor.id);
  const initial = (record ?? {}) as unknown as Record<string, unknown>;
  const value = (name: string, fallback = "") =>
    String(initial[name] ?? fallback);
  const [version, setVersion] = useState(record?.version);
  const [error, setError] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [followUps, setFollowUps] = useState<number[]>([]);
  const counter = useRef(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const [dirty, setDirty] = useState(false);
  const linkedProjectIds = editor.id
    ? data.organisationProjects
        .filter((op) => op.organisationId === editor.id)
        .map((op) => op.projectId)
    : [];
  const [selectedProjects, setSelectedProjects] =
    useState<string[]>(linkedProjectIds);

  // Document edit – existing links + quick add selectors for polished UX
  const existingDocLinks =
    editor.kind === "document" && editor.id
      ? data.documentLinks.filter((l) => l.documentId === editor.id)
      : [];
  const [localDocLinks, setLocalDocLinks] = useState(existingDocLinks);
  useEffect(() => {
    setLocalDocLinks(existingDocLinks);
  }, [existingDocLinks.length]);
  const [docLinkOrg, setDocLinkOrg] = useState<string>("");
  const [docLinkProject, setDocLinkProject] = useState<string>("");
  const [docLinkTask, setDocLinkTask] = useState<string>("");
  const [docLinkSaving, setDocLinkSaving] = useState(false);
  function close() {
    if (!dirty || window.confirm("Discard the changes in this form?"))
      onClose();
  }
  useEffect(() => {
    dialog.current?.showModal();
    const previous = document.activeElement;
    return () => {
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const localDateTime = (date: string) => {
    const d = new Date(date);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  };
  function taskFields(prefix = "", defaults: Record<string, unknown> = {}) {
    const v = (key: string) => String(defaults[key] ?? "");
    return (
      <>
        <label>
          Task title
          <input
            name={`${prefix}title`}
            required
            maxLength={300}
            defaultValue={v("title")}
            placeholder="For example, send the death certificate"
          />
        </label>
        <label>
          Detail
          <textarea
            name={`${prefix}detail`}
            defaultValue={v("detail")}
            rows={2}
          />
        </label>
        <div className="form-grid">
          <label>
            Assigned to
            <select name={`${prefix}assignee`} defaultValue={v("assignee")}>
              <option value="">Unassigned</option>
              {users.map((u) => (
                <option key={u} value={u}>
                  {u.split("@")[0]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Project
            <select name={`${prefix}projectId`} defaultValue={v("projectId")}>
              <option value="">No project</option>
              {data.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Status
            <select
              name={`${prefix}status`}
              defaultValue={v("status") || "to_do"}
            >
              {taskStatuses.map((s) => (
                <option key={s} value={s}>
                  {label(s)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="form-grid three">
          <label>
            Due date
            <input
              type="date"
              name={`${prefix}dueDate`}
              defaultValue={v("dueDate")}
            />
          </label>
          <label>
            Follow-up date
            <input
              type="date"
              name={`${prefix}followUpDate`}
              defaultValue={v("followUpDate")}
            />
          </label>
          <label>
            Confirmed deadline
            <input
              type="date"
              name={`${prefix}deadline`}
              defaultValue={v("deadline")}
            />
          </label>
        </div>
      </>
    );
  }
  async function submit(form: FormData) {
    setBusy(true);
    setError("");
    setCode("");
    const get = (key: string) => String(form.get(key) ?? "");
    const nullable = (key: string) => get(key) || null;
    const base = { id: editor.id, version };
    const task = (prefix = "") => ({
      title: get(prefix + "title"),
      detail: get(prefix + "detail"),
      organisationId: nullable("organisationId"),
      interactionId: editor.interactionId ?? null,
      projectId: nullable(prefix + "projectId"),
      assignee: nullable(prefix + "assignee"),
      status: get(prefix + "status"),
      dueDate: nullable(prefix + "dueDate"),
      followUpDate: nullable(prefix + "followUpDate"),
      deadline: nullable(prefix + "deadline"),
    });
    let input: unknown;
    if (editor.kind === "organisation")
      input = {
        ...base,
        name: get("name"),
        mainContact: nullable("mainContact"),
        phoneNumbers: get("phoneNumbers")
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
        email: nullable("email"),
        reference: nullable("reference"),
        notes: get("notes"),
        status: get("status"),
        confirmResolve: form.get("confirmResolve") === "on",
        projectIds: selectedProjects,
      };
    else if (editor.kind === "task")
      input = {
        ...base,
        ...task(),
        interactionId: initial.interactionId ?? editor.interactionId ?? null,
      };
    else if (editor.kind === "project")
      input = {
        ...base,
        name: get("name"),
      };
    else if (editor.kind === "document")
      input = {
        ...base,
        friendlyName: get("friendlyName"),
        category: nullable("category"),
      };
    else
      input = {
        ...base,
        organisationId: nullable("organisationId"),
        title: get("title"),
        detail: get("detail"),
        kind: get("kind"),
        occurredAt: new Date(get("occurredAt")).toISOString(),
        followUps: followUps.map((i) => task(`follow${i}.`)),
      };
    try {
      const result = await saveRecord(editor.kind, input);
      if (result.ok) {
        // For documents, also create optional links selected in the polished edit UI
        if (editor.kind === "document") {
          setDocLinkSaving(true);
          const linksToCreate: Array<{ organisationId?: string | null; projectId?: string | null; taskId?: string | null }> = [];
          if (docLinkOrg) linksToCreate.push({ organisationId: docLinkOrg });
          if (docLinkProject) linksToCreate.push({ projectId: docLinkProject });
          if (docLinkTask) linksToCreate.push({ taskId: docLinkTask });
          for (const link of linksToCreate) {
            try {
              const res = await linkDocument({
                documentId: result.id,
                organisationId: (link as any).organisationId ?? null,
                projectId: (link as any).projectId ?? null,
                taskId: (link as any).taskId ?? null,
                interactionId: null,
              });
              if (!res.ok) {
                // Duplicate link is fine – ignore, but show other errors
                if (!res.error.toLowerCase().includes("already")) {
                  setError(res.error);
                }
              }
            } catch {}
          }
          setDocLinkSaving(false);
        }
        setDirty(false);
        router.refresh();
        onSaved(result.id);
      } else {
        setError(result.error);
        setCode(result.code);
        if (result.code === "conflict") router.refresh();
      }
    } catch {
      setError(
        "The connection was interrupted. Your draft is still here. Check the record before retrying.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="record-dialog"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) close();
      }}
      aria-labelledby="form-title"
    >
      <form
        onChange={() => setDirty(true)}
        onSubmit={(e) => {
          e.preventDefault();
          void submit(new FormData(e.currentTarget));
        }}
      >
        <div className="dialog-heading">
          <div>
            <p className="eyebrow">
              {editor.id ? "UPDATE SHARED RECORD" : "ONE STEP AT A TIME"}
            </p>
            <h2 id="form-title">
              {editor.id ? "Edit" : "Add"}{" "}
              {editor.kind === "organisation"
                ? "organisation"
                : editor.kind === "interaction"
                  ? "interaction or note"
                  : editor.kind === "task"
                    ? "task"
                    : editor.kind === "project"
                      ? "project"
                      : "document"}
            </h2>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Close form"
            onClick={close}
            disabled={busy}
          >
            <X size={21} />
          </button>
        </div>
        <fieldset disabled={busy || docLinkSaving} className="form-fields">
          {editor.kind === "organisation" ? (
            <>
              <label>
                Organisation name
                <input
                  name="name"
                  required
                  maxLength={200}
                  defaultValue={value("name")}
                  autoFocus
                />
              </label>
              <div className="form-grid">
                <label>
                  Main contact
                  <input
                    name="mainContact"
                    defaultValue={value("mainContact")}
                  />
                </label>
                <label>
                  Email address
                  <input
                    type="email"
                    name="email"
                    defaultValue={value("email")}
                  />
                </label>
              </div>
              <label>
                Phone numbers <small>One per line</small>
                <textarea
                  name="phoneNumbers"
                  rows={2}
                  defaultValue={((initial.phoneNumbers as string[]) ?? []).join(
                    "\n",
                  )}
                />
              </label>
              <label>
                Account / reference
                <input name="reference" defaultValue={value("reference")} />
              </label>
              <label>
                Notes
                <textarea name="notes" rows={3} defaultValue={value("notes")} />
              </label>
              <label>
                Status
                <select
                  name="status"
                  defaultValue={value("status", "not_contacted")}
                >
                  {organisationStatuses.map((s) => (
                    <option key={s} value={s}>
                      {label(s)}
                    </option>
                  ))}
                </select>
              </label>
              <fieldset className="follow-up">
                <legend>Projects</legend>
                <p className="form-help">
                  Link this organisation to one or more projects. Tasks have one
                  optional project; organisations can belong to many.
                </p>
                <div className="project-checkboxes">
                  {data.projects.map((p) => (
                    <label key={p.id} className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={selectedProjects.includes(p.id)}
                        onChange={(e) => {
                          setSelectedProjects(
                            e.target.checked
                              ? [...selectedProjects, p.id]
                              : selectedProjects.filter((id) => id !== p.id),
                          );
                          setDirty(true);
                        }}
                      />
                      {p.name}
                    </label>
                  ))}
                  {!data.projects.length && (
                    <p className="form-help">No projects yet.</p>
                  )}
                </div>
              </fieldset>
              {code === "confirm_resolve" && (
                <label className="checkbox-label">
                  <input type="checkbox" name="confirmResolve" />
                  Resolve this organisation while leaving its open tasks
                  unchanged.
                </label>
              )}
            </>
          ) : editor.kind === "project" ? (
            <>
              <label>
                Project name
                <input
                  name="name"
                  required
                  maxLength={200}
                  defaultValue={value("name")}
                  autoFocus
                  placeholder="For example, House Clearance"
                />
              </label>
              <p className="form-help">
                Projects group tasks and organisations. You can rename them at
                any time. Tasks have one optional project; organisations can
                belong to multiple projects.
              </p>
            </>
          ) : editor.kind === "document" ? (
            <>
              <label>
                Friendly name
                <input
                  name="friendlyName"
                  required
                  maxLength={200}
                  defaultValue={value("friendlyName")}
                  autoFocus
                  placeholder="For example, Death certificate – Bank1"
                />
              </label>
              <label>
                Category
                <select
                  name="category"
                  defaultValue={value("category")}
                >
                  <option value="">No category</option>
                  {documentCategories.map((c) => (
                    <option key={c} value={c}>
                      {label(c)}
                    </option>
                  ))}
                </select>
              </label>
              <p className="form-help">
                The file itself isn&apos;t changed here – only name and category. Links can be added below. Null is fine – not every document needs every link.
              </p>

              {localDocLinks.length > 0 && (
                <fieldset className="follow-up">
                  <legend>Current links – this file is reused</legend>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {localDocLinks.map((l) => {
                      const org = l.organisationId ? data.organisations.find((o) => o.id === l.organisationId)?.name : null;
                      const proj = l.projectId ? data.projects.find((p) => p.id === l.projectId)?.name : null;
                      const task = l.taskId ? data.tasks.find((t) => t.id === l.taskId)?.title : null;
                      const note = l.interactionId ? data.interactions.find((i) => i.id === l.interactionId)?.title : null;
                      return (
                        <div key={l.id} style={{ display: "flex", alignItems: "center", gap: "8px", justifyContent: "space-between" }}>
                          <span className="badge" style={{ justifyContent: "flex-start", flex: 1 }}>
                            {org ? `Contact: ${org}` : proj ? `Project: ${proj}` : task ? `Task: ${task}` : note ? `Note: ${note}` : "Link"}
                          </span>
                          <button
                            type="button"
                            className="subtle-button danger"
                            title="Remove this link – file itself stays"
                            disabled={busy || docLinkSaving}
                            onClick={async () => {
                              if (!window.confirm("Remove this link? The file itself will stay and can be reused elsewhere.")) return;
                              setDocLinkSaving(true);
                              setError("");
                              const res = await unlinkDocument(l.id);
                              setDocLinkSaving(false);
                              if (!res.ok) {
                                setError(res.error);
                              } else {
                                setLocalDocLinks((prev) => prev.filter((x) => x.id !== l.id));
                                setDirty(true);
                                router.refresh();
                              }
                            }}
                          >
                            <Link2Off size={14} />
                            Remove
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  <p className="form-help" style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "8px" }}>
                    <Lightbulb size={14} />
                    Tip: removing a link(s) does not delete the file
                  </p>
                </fieldset>
              )}

              <fieldset className="follow-up">
                <legend>Add links – optional, leaner way to reuse</legend>
                <label>
                  Contact (organisation)
                  <select
                    value={docLinkOrg}
                    onChange={(e) => { setDocLinkOrg(e.target.value); setDirty(true); }}
                  >
                    <option value="">No contact link</option>
                    {data.organisations.map((o) => (
                      <option key={o.id} value={o.id}>{o.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Project
                  <select
                    value={docLinkProject}
                    onChange={(e) => { setDocLinkProject(e.target.value); setDirty(true); }}
                  >
                    <option value="">No project link</option>
                    {data.projects.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Task
                  <select
                    value={docLinkTask}
                    onChange={(e) => { setDocLinkTask(e.target.value); setDirty(true); }}
                  >
                    <option value="">No task link</option>
                    {data.tasks.slice(0, 100).map((t) => (
                      <option key={t.id} value={t.id}>{t.title}</option>
                    ))}
                  </select>
                </label>
              </fieldset>

              <dl className="details-grid">
                <div>
                  <dt>File</dt>
                  <dd>{value("friendlyName")} – {value("originalName")}</dd>
                </div>
                <div>
                  <dt>Uploaded</dt>
                  <dd>{initial.createdAt ? new Date(String(initial.createdAt)).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "Unknown"} by {String(initial.createdBy ?? "").split("@")[0] || "Unknown"}</dd>
                </div>
              </dl>
            </>
          ) : (
            <>
              <label>
                Organisation
                <select
                  name="organisationId"
                  defaultValue={value(
                    "organisationId",
                    editor.organisationId ?? "",
                  )}
                >
                  <option value="">
                    {editor.kind === "interaction"
                      ? "Unfiled note / no organisation"
                      : "No organisation"}
                  </option>
                  {data.organisations.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </label>
              {editor.kind === "task" ? (
                taskFields("", initial)
              ) : (
                <>
                  <div className="form-grid">
                    <label>
                      Type
                      <select
                        name="kind"
                        defaultValue={value(
                          "kind",
                          editor.organisationId ? "call" : "note",
                        )}
                      >
                        {["call", "email", "letter", "web_form", "note"].map(
                          (s) => (
                            <option key={s} value={s}>
                              {label(s)}
                            </option>
                          ),
                        )}
                      </select>
                    </label>
                    <label>
                      When it happened <small>Your device’s local time</small>
                      <input
                        type="datetime-local"
                        name="occurredAt"
                        required
                        defaultValue={localDateTime(
                          value("occurredAt", new Date().toISOString()),
                        )}
                      />
                    </label>
                  </div>
                  <label>
                    Title <small>Optional for a quick note</small>
                    <input
                      name="title"
                      maxLength={300}
                      defaultValue={value("title")}
                    />
                  </label>
                  <label>
                    Detail
                    <textarea
                      name="detail"
                      required
                      rows={6}
                      maxLength={20000}
                      defaultValue={value("detail")}
                      placeholder="What was discussed? What needs to happen next?"
                    />
                  </label>
                  <p className="form-help">
                    Recorded by the signed-in user. Attach documents from the organisation or document list after saving.
                  </p>
                  <h3>
                    {editor.id ? "Add more follow-up tasks" : "Follow-up tasks"}
                  </h3>
                  {followUps.map((i, index) => (
                    <fieldset className="follow-up" key={i}>
                      <legend>Follow-up {index + 1}</legend>
                      {taskFields(`follow${i}.`)}
                      <button
                        type="button"
                        className="text-link"
                        onClick={() => {
                          setFollowUps(followUps.filter((n) => n !== i));
                          setDirty(true);
                        }}
                      >
                        Remove this follow-up
                      </button>
                    </fieldset>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setFollowUps([...followUps, counter.current++]);
                      setDirty(true);
                    }}
                  >
                    <Plus size={16} />
                    Add a follow-up task
                  </Button>
                </>
              )}
            </>
          )}
        </fieldset>
        {error && (
          <div className="form-error" role="alert">
            <p>{error}</p>
            {code === "conflict" && record && (
              <>
                <details>
                  <summary>
                    Review latest saved version (version {record.version})
                  </summary>
                  <RecordSummary
                    record={record as unknown as Record<string, unknown>}
                    data={data}
                  />
                </details>
                <button
                  className="text-link"
                  type="button"
                  disabled={record.version === version}
                  onClick={() => {
                    setVersion(record.version);
                    setError("");
                    setCode("");
                  }}
                >
                  I’ve reviewed it — use my draft for the next save
                </button>
                <p>No changes are saved until you press Save again.</p>
              </>
            )}
          </div>
        )}
        <div className="form-actions">
          <Button
            type="button"
            variant="outline"
            disabled={busy || docLinkSaving}
            onClick={close}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={busy || docLinkSaving}>
            {busy ? "Saving…" : docLinkSaving ? "Linking…" : "Save"}
          </Button>
        </div>
      </form>
    </dialog>
  );
}

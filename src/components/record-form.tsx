"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  X,
  Plus,
  Link2Off,
  Lightbulb,
  Trash2,
  FileText,
  MessageSquarePlus,
  Lock,
  LockOpen,
} from "lucide-react";
import { RecordSummary } from "./record-summary";
import { Button } from "./ui/button";
import {
  saveRecord,
  saveRecordWithNewOrganisation,
  linkDocument,
  unlinkDocument,
} from "@/app/actions";
import type { Snapshot } from "@/lib/records/store";
import {
  label,
  organisationStatuses,
  taskStatuses,
  taskKinds,
  everyoneAssignee,
  documentCategories,
} from "@/lib/records/validation";
export type Editor = {
  kind: "organisation" | "interaction" | "task" | "project" | "document";
  id?: string;
  organisationId?: string;
  interactionId?: string;
  /**
   * Values to open the form with, used when one record is started from
   * another - an interaction from a task's outcome, say. Only ever a
   * starting point: everything in it stays editable, and it is ignored
   * entirely when an existing record is being edited.
   */
  initial?: Record<string, unknown>;
};
type Props = {
  editor: Editor;
  data: Snapshot;
  users: string[];
  onClose: () => void;
  onSaved: (id: string, newContactName?: string) => void;
  /** Opens a fresh interaction already filled in from the record being edited. */
  onOpenInteraction: (initial: Record<string, unknown>) => void;
  /** Opens the in-app viewer for a linked document, without leaving the form. */
  onViewDocument: (doc: Snapshot["documents"][number]) => void;
};
/**
 * Sentinel for the extra option in the Organisation list. It never reaches the
 * server: choosing it means "create this contact and save the task together".
 */
const NEW_CONTACT = "__new_contact__";
export function RecordForm({
  editor,
  data,
  users,
  onClose,
  onSaved,
  onOpenInteraction,
  onViewDocument,
}: Props) {
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
  // An existing record wins: a pre-fill only ever fills an empty form.
  const initial = (record ?? editor.initial ?? {}) as unknown as Record<
    string,
    unknown
  >;
  const value = (name: string, fallback = "") =>
    String(initial[name] ?? fallback);
  const [version, setVersion] = useState(record?.version);
  // The Organisation list is controlled so a contact created here can appear as
  // the chosen one straight away. Only the task and note forms render it.
  const [organisationId, setOrganisationId] = useState(
    String(initial.organisationId ?? editor.organisationId ?? ""),
  );
  const [newContact, setNewContact] = useState({
    name: "",
    email: "",
    phone: "",
  });
  const [error, setError] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [followUps, setFollowUps] = useState<number[]>([]);
  const counter = useRef(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const [dirty, setDirty] = useState(false);
  // What a task was set up to do is history once it is saved, so an existing
  // task opens with Task Start locked. It is never hidden, and the padlock
  // beside the label unlocks it when something genuinely needs correcting.
  const [startLocked, setStartLocked] = useState(true);
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
  // Document edit – compact target-type picker that links immediately (like unlink)
  const [docLinkType, setDocLinkType] = useState<
    "" | "contact" | "note" | "project" | "task" | "finance"
  >("");
  const [docLinkTarget, setDocLinkTarget] = useState<string>("");
  const [docLinkSaving, setDocLinkSaving] = useState(false);
  // Task edit – linked documents block
  const existingTaskLinks =
    editor.kind === "task" && editor.id
      ? data.documentLinks.filter((l) => l.taskId === editor.id)
      : [];
  const [localTaskLinks, setLocalTaskLinks] = useState(existingTaskLinks);
  useEffect(() => {
    setLocalTaskLinks(existingTaskLinks);
  }, [existingTaskLinks.length]);
  const [taskLinkDoc, setTaskLinkDoc] = useState<string>("");
  const [taskLinkSaving, setTaskLinkSaving] = useState(false);
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
  /**
   * Reads a field exactly as it is on screen right now. The task form is
   * uncontrolled, so a button that acts on what has been typed has to go and
   * look rather than trust the value the record was last saved with.
   */
  const fieldNow = (name: string) => {
    // Duck-typed rather than checked against HTMLInputElement and friends:
    // this form is server-rendered too, and those globals do not exist there.
    const el = form.current?.elements.namedItem(name) as
      { value?: unknown } | null | undefined;
    return typeof el?.value === "string" ? el.value : "";
  };
  /**
   * A task type is not always an interaction kind. Calls and emails carry
   * straight over; the rest have no kind of their own, so they land as a note
   * with the same words in it.
   */
  const interactionKindFor = (kind: string) =>
    kind === "call" || kind === "email" ? kind : "note";
  /**
   * Saves the task as it stands, then opens an ordinary interaction for the
   * same contact with the title, type and outcome already filled in. Nothing
   * is written to the event log until the interaction itself is saved.
   */
  async function createInteractionFromTask() {
    if (!form.current) return;
    const outcome = fieldNow("outcome").trim();
    if (!outcome) return;
    const prefill = {
      organisationId: organisationId || null,
      projectId: fieldNow("projectId") || null,
      title: fieldNow("title").trim(),
      detail: outcome,
      kind: interactionKindFor(fieldNow("kind")),
      occurredAt: new Date().toISOString(),
    };
    await submit(new FormData(form.current), () => onOpenInteraction(prefill));
  }
  function taskFields(
    prefix = "",
    defaults: Record<string, unknown> = {},
    /** Set for a task that already exists, whose start can be locked. */
    lockable = false,
  ) {
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
          Task Start{" "}
          {lockable && (
            <button
              type="button"
              className="lock-toggle"
              aria-pressed={startLocked}
              title={
                startLocked
                  ? "Task Start is locked so it is not quietly rewritten later. Activate to unlock it for editing."
                  : "Task Start is unlocked and can be edited. Activate to lock it again."
              }
              onClick={() => setStartLocked(!startLocked)}
            >
              {startLocked ? (
                <Lock size={11} aria-hidden />
              ) : (
                <LockOpen size={11} aria-hidden />
              )}
              {/* The word carries the state, not the padlock alone. */}
              {startLocked ? "Locked" : "Unlocked"}
            </button>
          )}
          <small>What is being asked for</small>
          <textarea
            name={`${prefix}detail`}
            defaultValue={v("detail")}
            rows={2}
            // readOnly, never disabled: a disabled field is left out of the
            // submitted form, which would quietly clear the task's start.
            readOnly={lockable && startLocked}
            className={lockable && startLocked ? "locked-field" : undefined}
          />
        </label>
        <label>
          Task Outcome <small>What happened, once it has happened</small>
          <textarea
            name={`${prefix}outcome`}
            defaultValue={v("outcome")}
            rows={2}
            placeholder="For example, what was agreed on the call"
          />
        </label>
        <div className="form-grid">
          <label>
            Type of task <small>Optional</small>
            <select name={`${prefix}kind`} defaultValue={v("kind")}>
              <option value="">No type</option>
              {taskKinds.map((k) => (
                <option key={k} value={k}>
                  {label(k)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Assigned to
            <select name={`${prefix}assignee`} defaultValue={v("assignee")}>
              <option value="">Unassigned</option>
              {/* Work the two of you have to do together, not one of you. */}
              <option value={everyoneAssignee}>Everyone</option>
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
  async function submit(
    form: FormData,
    /** Runs instead of closing the form, once the save has landed. */
    afterSave?: (id: string) => void,
  ) {
    setBusy(true);
    setError("");
    setCode("");
    const get = (key: string) => String(form.get(key) ?? "");
    const nullable = (key: string) => get(key) || null;
    const base = { id: editor.id, version };
    // "+ New contact…" is not an id: the contact is created by the server in the
    // same save, so the record itself is sent with no organisation yet.
    const newContactKind =
      editor.kind === "task" || editor.kind === "interaction"
        ? editor.kind
        : null;
    const createContact =
      organisationId === NEW_CONTACT && newContactKind !== null;
    const chosenOrganisationId = createContact ? null : organisationId || null;
    const task = (prefix = "") => ({
      title: get(prefix + "title"),
      detail: get(prefix + "detail"),
      outcome: nullable(prefix + "outcome"),
      kind: nullable(prefix + "kind"),
      organisationId: chosenOrganisationId,
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
        mapUrl: nullable("mapUrl"),
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
        organisationId: chosenOrganisationId,
        projectId: nullable("projectId"),
        title: get("title"),
        detail: get("detail"),
        kind: get("kind"),
        occurredAt: new Date(get("occurredAt")).toISOString(),
        followUps: followUps.map((i) => task(`follow${i}.`)),
      };
    const organisationForNewContact = {
      name: newContact.name,
      mainContact: null,
      phoneNumbers: newContact.phone.trim() ? [newContact.phone.trim()] : [],
      email: newContact.email.trim() || null,
      reference: null,
      notes: null,
      status: "not_contacted",
      confirmResolve: false,
      projectIds: [],
    };
    try {
      const result =
        createContact && newContactKind
          ? await saveRecordWithNewOrganisation(
              newContactKind,
              input,
              organisationForNewContact,
            )
          : await saveRecord(editor.kind, input);
      if (result.ok) {
        setDirty(false);
        router.refresh();
        if (afterSave) afterSave(result.id);
        else
          onSaved(
            result.id,
            createContact ? newContact.name.trim() : undefined,
          );
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
  // Link a document to a chosen target straight away (matching the instant unlink
  // buttons above). Duplicates are tolerated by the actions layer and ignored here.
  async function addDocLink() {
    if (!editor.id || !docLinkType || !docLinkTarget) return;
    setDocLinkSaving(true);
    setError("");
    const input: Record<string, unknown> = { documentId: editor.id };
    if (docLinkType === "contact") input.organisationId = docLinkTarget;
    if (docLinkType === "note") input.interactionId = docLinkTarget;
    if (docLinkType === "project") input.projectId = docLinkTarget;
    if (docLinkType === "task") input.taskId = docLinkTarget;
    if (docLinkType === "finance") input.financeRecordId = docLinkTarget;
    const res = await linkDocument(input);
    setDocLinkSaving(false);
    if (!res.ok) {
      if (!res.error.toLowerCase().includes("already")) setError(res.error);
    } else {
      setLocalDocLinks((prev) => [
        ...prev,
        {
          id: res.id,
          documentId: editor.id!,
          organisationId: docLinkType === "contact" ? docLinkTarget : null,
          interactionId: docLinkType === "note" ? docLinkTarget : null,
          projectId: docLinkType === "project" ? docLinkTarget : null,
          taskId: docLinkType === "task" ? docLinkTarget : null,
          financeRecordId: docLinkType === "finance" ? docLinkTarget : null,
        } as unknown as Snapshot["documentLinks"][number],
      ]);
      setDocLinkType("");
      setDocLinkTarget("");
      setDirty(true);
      router.refresh();
    }
  }
  // Link a document to the current task straight away (mirror of the doc side).
  async function addTaskDocLink() {
    if (!editor.id || !taskLinkDoc) return;
    setTaskLinkSaving(true);
    setError("");
    const res = await linkDocument({
      documentId: taskLinkDoc,
      taskId: editor.id,
    });
    setTaskLinkSaving(false);
    if (!res.ok) {
      if (!res.error.toLowerCase().includes("already")) setError(res.error);
    } else {
      setLocalTaskLinks((prev) => [
        ...prev,
        {
          id: res.id,
          documentId: taskLinkDoc,
          taskId: editor.id,
          organisationId: null,
          interactionId: null,
          projectId: null,
          financeRecordId: null,
        } as unknown as Snapshot["documentLinks"][number],
      ]);
      setTaskLinkDoc("");
      setDirty(true);
      router.refresh();
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
        ref={form}
        onChange={() => setDirty(true)}
        onSubmit={(e) => {
          e.preventDefault();
          void submit(new FormData(e.currentTarget));
        }}
      >
        <div className="dialog-heading">
          <div>
            <p className="eyebrow">
              {editor.id
                ? editor.kind === "document" || editor.kind === "task"
                  ? "EDIT & LINKS"
                  : "UPDATE SHARED RECORD"
                : "ONE STEP AT A TIME"}
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
                Map link <small>Optional – paste a Google Maps link</small>
                <input
                  type="url"
                  name="mapUrl"
                  maxLength={2000}
                  defaultValue={value("mapUrl")}
                />
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
                <select name="category" defaultValue={value("category")}>
                  <option value="">No category</option>
                  {documentCategories.map((c) => (
                    <option key={c} value={c}>
                      {label(c)}
                    </option>
                  ))}
                </select>
              </label>
              <p className="form-help">
                The file itself isn&apos;t changed here – only name and
                category. Links can be added below. Null is fine – not every
                document needs every link.
              </p>

              {localDocLinks.length > 0 && (
                <fieldset className="follow-up">
                  <legend>Current links – this file is reused</legend>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "8px",
                    }}
                  >
                    {localDocLinks.map((l) => {
                      const org = l.organisationId
                        ? data.organisations.find(
                            (o) => o.id === l.organisationId,
                          )?.name
                        : null;
                      const proj = l.projectId
                        ? data.projects.find((p) => p.id === l.projectId)?.name
                        : null;
                      const task = l.taskId
                        ? data.tasks.find((t) => t.id === l.taskId)?.title
                        : null;
                      const note = l.interactionId
                        ? data.interactions.find(
                            (i) => i.id === l.interactionId,
                          )?.title
                        : null;
                      const finance = l.financeRecordId
                        ? data.financeRecords.find(
                            (f) => f.id === l.financeRecordId,
                          )?.title
                        : null;
                      return (
                        <div
                          key={l.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            justifyContent: "space-between",
                          }}
                        >
                          <span
                            className="badge"
                            style={{ justifyContent: "flex-start", flex: 1 }}
                          >
                            {org
                              ? `Contact: ${org}`
                              : proj
                                ? `Project: ${proj}`
                                : task
                                  ? `Task: ${task}`
                                  : finance
                                    ? `Finance: ${finance}`
                                    : note
                                      ? `Note: ${note}`
                                      : "Link"}
                          </span>
                          <button
                            type="button"
                            className="subtle-button danger"
                            title="Remove this link – file itself stays"
                            disabled={busy || docLinkSaving}
                            onClick={async () => {
                              if (
                                !window.confirm(
                                  "Remove this link? The file itself will stay and can be reused elsewhere.",
                                )
                              )
                                return;
                              setDocLinkSaving(true);
                              setError("");
                              const res = await unlinkDocument(l.id);
                              setDocLinkSaving(false);
                              if (!res.ok) {
                                setError(res.error);
                              } else {
                                setLocalDocLinks((prev) =>
                                  prev.filter((x) => x.id !== l.id),
                                );
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
                  <p
                    className="form-help"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      marginTop: "8px",
                    }}
                  >
                    <Lightbulb size={14} />
                    Tip: removing a link(s) does not delete the file
                  </p>
                </fieldset>
              )}

              <fieldset className="follow-up">
                <legend>Add links – optional, leaner way to reuse</legend>
                <p className="form-help">
                  Pick a target type, choose the record, then Add. The link is
                  saved straight away – no need to press Save. Removing a link
                  is just as instant.
                </p>
                <div className="form-grid">
                  <label>
                    Target type
                    <select
                      value={docLinkType}
                      onChange={(e) => {
                        setDocLinkType(
                          e.target.value as
                            | ""
                            | "contact"
                            | "note"
                            | "project"
                            | "task"
                            | "finance",
                        );
                        setDocLinkTarget("");
                        setDirty(true);
                      }}
                    >
                      <option value="">Choose a target…</option>
                      <option value="contact">Contact</option>
                      <option value="note">Note</option>
                      <option value="project">Project</option>
                      <option value="task">Task</option>
                      <option value="finance">Financial record</option>
                    </select>
                  </label>
                  {docLinkType === "contact" && (
                    <label>
                      Contact
                      <select
                        value={docLinkTarget}
                        onChange={(e) => {
                          setDocLinkTarget(e.target.value);
                          setDirty(true);
                        }}
                      >
                        <option value="">Pick contact…</option>
                        {data.organisations.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {docLinkType === "note" && (
                    <label>
                      Note
                      <select
                        value={docLinkTarget}
                        onChange={(e) => {
                          setDocLinkTarget(e.target.value);
                          setDirty(true);
                        }}
                      >
                        <option value="">Pick note…</option>
                        {data.interactions.slice(0, 100).map((n) => (
                          <option key={n.id} value={n.id}>
                            {n.title}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {docLinkType === "project" && (
                    <label>
                      Project
                      <select
                        value={docLinkTarget}
                        onChange={(e) => {
                          setDocLinkTarget(e.target.value);
                          setDirty(true);
                        }}
                      >
                        <option value="">Pick project…</option>
                        {data.projects.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {docLinkType === "task" && (
                    <label>
                      Task
                      <select
                        value={docLinkTarget}
                        onChange={(e) => {
                          setDocLinkTarget(e.target.value);
                          setDirty(true);
                        }}
                      >
                        <option value="">Pick task…</option>
                        {data.tasks.slice(0, 100).map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.title}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {docLinkType === "finance" && (
                    <label>
                      Financial record
                      <select
                        value={docLinkTarget}
                        onChange={(e) => {
                          setDocLinkTarget(e.target.value);
                          setDirty(true);
                        }}
                      >
                        <option value="">Pick financial record…</option>
                        {data.financeRecords.map((r) => (
                          <option key={r.id} value={r.id}>
                            {label(r.kind)} – {r.title}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
                <div className="row-actions">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={
                      busy || docLinkSaving || !docLinkType || !docLinkTarget
                    }
                    onClick={() => void addDocLink()}
                  >
                    <Plus size={16} /> Add link
                  </Button>
                </div>
              </fieldset>

              <dl className="details-grid">
                <div>
                  <dt>File</dt>
                  <dd>
                    {value("friendlyName")} – {value("originalName")}
                  </dd>
                </div>
                <div>
                  <dt>Uploaded</dt>
                  <dd>
                    {initial.createdAt
                      ? new Date(String(initial.createdAt)).toLocaleDateString(
                          "en-GB",
                          { day: "numeric", month: "short", year: "numeric" },
                        )
                      : "Unknown"}{" "}
                    by{" "}
                    {String(initial.createdBy ?? "").split("@")[0] || "Unknown"}
                  </dd>
                </div>
              </dl>
            </>
          ) : (
            <>
              <label>
                Organisation
                <select
                  name="organisationId"
                  value={organisationId}
                  onChange={(e) => {
                    setOrganisationId(e.target.value);
                    setDirty(true);
                  }}
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
                  <option value={NEW_CONTACT}>+ New contact…</option>
                </select>
              </label>
              {organisationId === NEW_CONTACT && (
                <fieldset className="follow-up">
                  <legend>New contact</legend>
                  <label>
                    Organisation name
                    <input
                      name="newContactName"
                      required
                      maxLength={200}
                      value={newContact.name}
                      onChange={(e) =>
                        setNewContact({ ...newContact, name: e.target.value })
                      }
                      placeholder="For example, Bank1"
                    />
                  </label>
                  <div className="form-grid">
                    <label>
                      Email <small>Optional</small>
                      <input
                        type="email"
                        name="newContactEmail"
                        maxLength={320}
                        value={newContact.email}
                        onChange={(e) =>
                          setNewContact({
                            ...newContact,
                            email: e.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      Phone <small>Optional</small>
                      <input
                        name="newContactPhone"
                        maxLength={80}
                        value={newContact.phone}
                        onChange={(e) =>
                          setNewContact({
                            ...newContact,
                            phone: e.target.value,
                          })
                        }
                      />
                    </label>
                  </div>
                  <p className="form-help">
                    The contact is created and linked in the same save, so
                    nothing is half-finished. If the{" "}
                    {editor.kind === "interaction" ? "note" : "task"} cannot be
                    saved, the contact is not created either, and this form
                    keeps everything you typed. Notes, reference and projects
                    can be filled in later from the Contacts tab.
                  </p>
                </fieldset>
              )}
              {editor.kind === "task" ? (
                taskFields("", initial, !!editor.id)
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
                    Project <small>Optional — like tasks, one at most</small>
                    <select name="projectId" defaultValue={value("projectId")}>
                      <option value="">No project</option>
                      {data.projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
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
                    Recorded by the signed-in user. Attach documents from the
                    organisation or document list after saving.
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
              {editor.kind === "task" && editor.id && (
                <fieldset className="follow-up">
                  <legend>Create an interaction from this task</legend>
                  <p className="form-help">
                    Saves this task, then opens an interaction for the same
                    contact with the title, type and outcome already filled in.
                    Nothing goes in the event log until you save the
                    interaction, and you can change any of it first.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={
                      busy ||
                      !fieldNow("outcome").trim() ||
                      // The contact has to exist before an interaction can
                      // point at it.
                      organisationId === NEW_CONTACT
                    }
                    title={
                      organisationId === NEW_CONTACT
                        ? "Save the new contact first, then create the interaction"
                        : fieldNow("outcome").trim()
                          ? "Save the task, then open an interaction with the outcome filled in"
                          : "Write an outcome first - an interaction needs something to say"
                    }
                    onClick={() => void createInteractionFromTask()}
                  >
                    <MessageSquarePlus size={16} />
                    Create interaction
                  </Button>
                </fieldset>
              )}
              {editor.kind === "task" && editor.id && (
                <fieldset className="follow-up">
                  <legend>Linked documents</legend>
                  {localTaskLinks.length > 0 ? (
                    <div className="doc-pills">
                      {localTaskLinks.map((l) => {
                        const doc = data.documents.find(
                          (d) => d.id === l.documentId,
                        );
                        return (
                          <span
                            key={l.id}
                            className="badge"
                            style={{
                              justifyContent: "flex-start",
                              alignItems: "center",
                              gap: "6px",
                            }}
                          >
                            <button
                              type="button"
                              className="doc-pill-name"
                              title={
                                doc ? `Open ${doc.friendlyName}` : "Document"
                              }
                              aria-label={
                                doc ? `Open ${doc.friendlyName}` : "Document"
                              }
                              disabled={busy || taskLinkSaving || !doc}
                              onClick={() => doc && onViewDocument(doc)}
                            >
                              <FileText size={10} />{" "}
                              {doc ? doc.friendlyName : "Document"}
                            </button>
                            <button
                              type="button"
                              className="subtle-button danger"
                              style={{ padding: "2px 4px", marginLeft: "2px" }}
                              title="Remove this link – file itself stays"
                              disabled={busy || taskLinkSaving}
                              onClick={async () => {
                                if (
                                  !window.confirm(
                                    "Remove this link? The file itself will stay and can be reused elsewhere.",
                                  )
                                )
                                  return;
                                setTaskLinkSaving(true);
                                setError("");
                                const res = await unlinkDocument(l.id);
                                setTaskLinkSaving(false);
                                if (!res.ok) {
                                  setError(res.error);
                                } else {
                                  setLocalTaskLinks((prev) =>
                                    prev.filter((x) => x.id !== l.id),
                                  );
                                  setDirty(true);
                                  router.refresh();
                                }
                              }}
                            >
                              <Link2Off size={12} /> Remove
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="form-help">No documents linked yet.</p>
                  )}
                  <div className="form-grid">
                    <label>
                      Document
                      <select
                        value={taskLinkDoc}
                        onChange={(e) => {
                          setTaskLinkDoc(e.target.value);
                          setDirty(true);
                        }}
                      >
                        <option value="">Pick document…</option>
                        {data.documents.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.friendlyName} – {d.originalName}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="row-actions">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy || taskLinkSaving || !taskLinkDoc}
                      onClick={() => void addTaskDocLink()}
                    >
                      <Plus size={16} /> Add document link
                    </Button>
                  </div>
                  <p
                    className="form-help"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      marginTop: "8px",
                    }}
                  >
                    <Lightbulb size={14} /> Links save straight away – no need
                    to press Save to attach a document.
                  </p>
                </fieldset>
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
          <Button
            type="submit"
            disabled={busy || docLinkSaving || taskLinkSaving}
          >
            {busy
              ? "Saving…"
              : docLinkSaving || taskLinkSaving
                ? "Linking…"
                : "Save"}
          </Button>
        </div>
      </form>
    </dialog>
  );
}

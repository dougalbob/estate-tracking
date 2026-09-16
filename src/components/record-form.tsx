"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X, Plus } from "lucide-react";
import { RecordSummary } from "./record-summary";
import { Button } from "./ui/button";
import { saveRecord } from "@/app/actions";
import type { Snapshot } from "@/lib/records/store";
import {
  label,
  organisationStatuses,
  taskStatuses,
} from "@/lib/records/validation";
export type Editor = {
  kind: "organisation" | "interaction" | "task";
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
        : data.tasks;
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
      };
    else if (editor.kind === "task")
      input = {
        ...base,
        ...task(),
        interactionId: initial.interactionId ?? editor.interactionId ?? null,
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
                  : "task"}
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
        <fieldset disabled={busy} className="form-fields">
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
              {code === "confirm_resolve" && (
                <label className="checkbox-label">
                  <input type="checkbox" name="confirmResolve" />
                  Resolve this organisation while leaving its open tasks
                  unchanged.
                </label>
              )}
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
                    Recorded by the signed-in user. Document uploads will follow
                    in a later milestone.
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
            disabled={busy}
            onClick={close}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    </dialog>
  );
}

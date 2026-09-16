"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X, Plus, Pencil, Trash2, ListChecks, Lightbulb } from "lucide-react";
import { Button } from "./ui/button";
import { applyTemplate, saveTemplateItem, deleteRecord } from "@/app/actions";
import type { Snapshot } from "@/lib/records/store";

type TemplateItem = Snapshot["taskTemplates"][number];

/**
 * The suggestion list inside one project. Nothing is created until an item is
 * ticked and added; no dates or assignments are set, and anything already in the
 * project is shown as already added and cannot be selected twice.
 */
export function ProjectChecklist({
  projectId,
  items,
  tasks,
  onMessage,
  onError,
}: {
  projectId: string;
  items: TemplateItem[];
  tasks: Snapshot["tasks"];
  onMessage: (message: string) => void;
  onError: (message: string) => void;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<{
    id?: string;
    title: string;
    detail: string;
  } | null>(null);

  const normalise = (title: string) =>
    title
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();

  const alreadyInProject = useMemo(() => {
    const titles = new Set(tasks.map((t) => normalise(t.title)));
    const ids = new Set(
      tasks.map((t) => t.templateItemId).filter(Boolean) as string[],
    );
    return (item: TemplateItem) =>
      ids.has(item.id) || titles.has(normalise(item.title));
  }, [tasks]);

  if (!items.length) return null;

  const available = items.filter((item) => !alreadyInProject(item));
  const addedCount = items.length - available.length;

  async function addSelected() {
    if (!selected.length) return;
    setBusy(true);
    try {
      const result = await applyTemplate({ projectId, itemIds: selected });
      if (!result.ok) {
        onError(result.error);
        return;
      }
      const added = result.added.length;
      const skipped = result.skipped.length;
      onMessage(
        `Added ${added} task${added === 1 ? "" : "s"} from the list.` +
          (skipped
            ? ` ${skipped} was already in this project and was skipped.`
            : "") +
          " No dates were set – add them when you know them.",
      );
      setSelected([]);
      router.refresh();
    } catch {
      onError("The connection was interrupted. Nothing was added.");
    } finally {
      setBusy(false);
    }
  }

  async function removeItem(item: TemplateItem) {
    if (
      !window.confirm(
        "Remove this suggestion from the list? Any task already created from it stays exactly as it is.",
      )
    )
      return;
    setBusy(true);
    const result = await deleteRecord("template_item", item.id, item.version);
    setBusy(false);
    if (!result.ok) onError(result.error);
    else {
      onMessage(
        "Suggestion removed from the list. You can restore it from the bin.",
      );
      setSelected((current) => current.filter((id) => id !== item.id));
      router.refresh();
    }
  }

  return (
    <details className="checklist-panel">
      <summary>
        <ListChecks size={15} />
        Starter checklist
        <span className="badge">
          {available.length} suggestion{available.length === 1 ? "" : "s"}
          {addedCount > 0 ? ` · ${addedCount} already added` : ""}
        </span>
      </summary>
      <div className="checklist-body">
        <p className="form-help">
          Suggestions from an England-relevant starter list, written for your
          situation. Nothing is created until you choose it. No dates or
          assignments are set, and anything already in this project is skipped.
          These are organisational prompts – not legal or financial advice, and
          not a complete list of everything that applies.
        </p>
        <div className="checklist-items">
          {items.map((item) => {
            const already = alreadyInProject(item);
            return (
              <div
                className={`checklist-item${already ? " already-added" : ""}`}
                key={item.id}
              >
                <label className="checklist-tick">
                  <input
                    type="checkbox"
                    disabled={already || busy}
                    checked={selected.includes(item.id)}
                    onChange={(e) =>
                      setSelected((current) =>
                        e.target.checked
                          ? [...current, item.id]
                          : current.filter((id) => id !== item.id),
                      )
                    }
                  />
                  <span>
                    <strong>{item.title}</strong>
                    {already && <span className="badge">Already added</span>}
                  </span>
                </label>
                <p className="checklist-detail">{item.detail}</p>
                <div className="row-actions">
                  <button
                    type="button"
                    className="subtle-button"
                    disabled={busy}
                    onClick={() =>
                      setEditing({
                        id: item.id,
                        title: item.title,
                        detail: item.detail,
                      })
                    }
                  >
                    <Pencil size={13} />
                    Edit wording
                  </button>
                  <button
                    type="button"
                    className="subtle-button"
                    disabled={busy}
                    onClick={() => removeItem(item)}
                  >
                    <Trash2 size={13} />
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <div className="row-actions checklist-actions">
          <Button
            type="button"
            disabled={busy || !selected.length}
            onClick={addSelected}
          >
            <Plus size={15} />
            {selected.length
              ? `Add ${selected.length} task${selected.length === 1 ? "" : "s"}`
              : "Add selected"}
          </Button>
          <button
            type="button"
            className="subtle-button"
            disabled={busy || !available.length}
            onClick={() =>
              setSelected(
                selected.length === available.length
                  ? []
                  : available.map((item) => item.id),
              )
            }
          >
            {selected.length === available.length ? "Clear" : "Select all"}
          </button>
          <button
            type="button"
            className="subtle-button"
            disabled={busy}
            onClick={() => setEditing({ title: "", detail: "" })}
          >
            <Plus size={14} />
            Add your own item
          </button>
          <span className="form-help">
            <Lightbulb size={13} /> A suggestion only becomes a task when you
            add it, and you can edit it freely afterwards.
          </span>
        </div>
      </div>
      {editing && (
        <TemplateItemForm
          projectId={projectId}
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={(message) => {
            setEditing(null);
            onMessage(message);
            router.refresh();
          }}
          onError={onError}
        />
      )}
    </details>
  );
}

function TemplateItemForm({
  projectId,
  initial,
  onClose,
  onSaved,
  onError,
}: {
  projectId: string;
  initial: { id?: string; title: string; detail: string };
  onClose: () => void;
  onSaved: (message: string) => void;
  onError: (message: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  async function submit(form: FormData) {
    setBusy(true);
    const result = await saveTemplateItem({
      id: initial.id,
      projectId,
      title: String(form.get("title") ?? ""),
      detail: String(form.get("detail") ?? ""),
    });
    setBusy(false);
    if (!result.ok) {
      onError(result.error);
      return;
    }
    onSaved(
      initial.id
        ? "Suggestion updated. Tasks already created from it are unchanged."
        : "Suggestion added to the list.",
    );
  }

  return (
    <dialog
      ref={dialog}
      className="record-dialog"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      aria-labelledby="template-item-title"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit(new FormData(e.currentTarget));
        }}
      >
        <div className="dialog-heading">
          <div>
            <p className="eyebrow">YOUR LIST, YOUR WORDING</p>
            <h2 id="template-item-title">
              {initial.id ? "Edit suggestion" : "Add a suggestion"}
            </h2>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Close"
            onClick={onClose}
            disabled={busy}
          >
            <X size={21} />
          </button>
        </div>
        <fieldset disabled={busy} className="form-fields">
          <label>
            Short title
            <input
              name="title"
              required
              maxLength={300}
              defaultValue={initial.title}
              placeholder="For example, Gym membership"
            />
          </label>
          <label>
            Why it is on the list
            <textarea
              name="detail"
              rows={3}
              maxLength={2000}
              defaultValue={initial.detail}
              placeholder="A line to help you judge whether it applies."
            />
          </label>
          <p className="form-help">
            Editing a suggestion does not change any task already created from
            it.
          </p>
        </fieldset>
        <div className="form-actions">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={busy}
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

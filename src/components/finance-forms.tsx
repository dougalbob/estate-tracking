"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  X,
  Plus,
  AlertTriangle,
  Eye,
  Download,
  FileText,
  Link2,
} from "lucide-react";
import { Button } from "./ui/button";
import {
  saveFinanceRecord,
  saveFinanceMovement,
  deleteRecord,
  linkDocument,
  unlinkDocument,
} from "@/app/actions";
import {
  formatSize,
  fileTooLarge,
  postDocumentUpload,
  uploadErrorMessage,
} from "./document-upload";
import type { Snapshot } from "@/lib/records/store";
import {
  documentCategories,
  financeCategories,
  financeKinds,
  label,
  londonToday,
  movementKindFor,
  uploadAcceptAttribute,
} from "@/lib/records/validation";
import { formatPence } from "@/lib/finances/money";
import { movementAmountHint } from "@/lib/finances/movement-hint";
import type { FinanceMovement, FinanceRecord } from "@/lib/finances/summary";
import { byContactName } from "@/lib/contacts/sort";

export type FinanceRecordEditor = { id?: string };

const kindTitle: Record<string, string> = {
  asset: "asset",
  liability: "liability",
  income: "money received",
  expense: "expense",
  distribution: "distribution",
};

const movementTitle: Record<string, string> = {
  proceeds: "Sale proceeds",
  payment: "Payments",
  reimbursement: "Reimbursements",
};

const kindBlurb: Record<string, string> = {
  asset:
    "Something the estate owns, with an estimate and later the actual sale proceeds.",
  liability: "Something the estate owes, with payments recorded against it.",
  income: "Money the estate has received, such as interest or a refund.",
  expense:
    "Money paid out, either from the estate or personally by one of you.",
  distribution: "Money paid to a beneficiary. No 50/50 split is assumed.",
};

/** Create or correct a financial record. Amounts are typed in pounds. */
export function FinanceRecordForm({
  editor,
  data,
  users,
  onClose,
  onSaved,
  onAttachDocument,
  onLinkExisting,
}: {
  editor: FinanceRecordEditor;
  data: Snapshot;
  users: string[];
  onClose: () => void;
  /**
   * `note` carries what happened to any receipts, so the workspace can say so
   * plainly – a record that saved without its receipt must never look complete.
   */
  onSaved: (id: string, note?: string) => void;
  onAttachDocument: (recordId: string) => void;
  onLinkExisting: (recordId: string) => void;
}) {
  const router = useRouter();
  const record = editor.id
    ? data.financeRecords.find((r) => r.id === editor.id)
    : undefined;
  const [kind, setKind] = useState<FinanceRecord["kind"]>(
    record?.kind ?? "asset",
  );
  const [version, setVersion] = useState(record?.version);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const name = (email: string) => email.split("@")[0];
  // Receipts on an existing record act immediately; on a new one they are held
  // here and attached straight after the record is created.
  const linkedDocs = editor.id
    ? data.documentLinks
        .filter((l) => l.financeRecordId === editor.id)
        .flatMap((l) => {
          const doc = data.documents.find((d) => d.id === l.documentId);
          return doc
            ? [
                {
                  linkId: l.id,
                  id: doc.id,
                  friendlyName: doc.friendlyName,
                  originalName: doc.originalName,
                  category: doc.category,
                },
              ]
            : [];
        })
    : [];
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingCategory, setPendingCategory] = useState("receipt");
  const [pendingDocIds, setPendingDocIds] = useState<string[]>([]);
  const [pickDocId, setPickDocId] = useState("");
  const [receiptBusy, setReceiptBusy] = useState(false);

  useEffect(() => {
    // Remember what was focused before the dialog opened, so closing it
    // returns the keyboard user to the button that opened it rather than
    // dropping them at the top of the page.
    const previous = document.activeElement;
    dialog.current?.showModal();
    return () => {
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);
  function close() {
    if (!dirty || window.confirm("Discard the changes in this form?"))
      onClose();
  }

  /**
   * Attach everything queued in the form, after the record itself exists.
   * The record is saved first and is never rolled back by a failed attachment:
   * a receipt can be added again from Edit, but a lost money record cannot be
   * recovered by the user. Any failure is reported, never swallowed.
   */
  async function attachQueuedReceipts(recordId: string) {
    const failures: string[] = [];
    for (const documentId of pendingDocIds) {
      try {
        const link = await linkDocument({
          documentId,
          financeRecordId: recordId,
        });
        if (!link.ok)
          failures.push(
            `${data.documents.find((d) => d.id === documentId)?.friendlyName ?? "A document"}: ${link.error}`,
          );
      } catch (err) {
        failures.push(err instanceof Error ? err.message : "linking failed");
      }
    }
    if (pendingFile) {
      const fd = new FormData();
      fd.set("file", pendingFile);
      fd.set(
        "friendlyName",
        pendingFile.name.replace(/\.[^/.]+$/, "") || "Receipt",
      );
      fd.set("category", pendingCategory);
      fd.set("financeRecordId", recordId);
      try {
        const res = await postDocumentUpload(fd);
        if (!res.ok) failures.push(res.error || "the upload failed");
      } catch (err) {
        failures.push(uploadErrorMessage(err));
      }
    }
    const attached = pendingDocIds.length + (pendingFile ? 1 : 0);
    if (!attached) return "";
    if (!failures.length)
      return ` ${attached} document${attached > 1 ? "s" : ""} attached.`;
    return ` The record is saved, but ${failures.length} of ${attached} could not be attached – open the record and use Edit to try again. ${failures[0]}`;
  }

  async function submit(form: FormData) {
    setBusy(true);
    setError("");
    const get = (key: string) => String(form.get(key) ?? "");
    const nullable = (key: string) => get(key) || null;
    const editingKind = record?.kind ?? kind;
    try {
      const result = await saveFinanceRecord({
        id: editor.id,
        version,
        kind: editingKind,
        title: get("title"),
        detail: get("detail"),
        category: nullable("category"),
        amount: get("amount"),
        occurredOn: nullable("occurredOn"),
        fundedBy: editingKind === "expense" ? nullable("fundedBy") : null,
        beneficiary:
          editingKind === "distribution" ? nullable("beneficiary") : null,
        organisationId: nullable("organisationId"),
        projectId: nullable("projectId"),
      });
      if (result.ok) {
        setDirty(false);
        const note = await attachQueuedReceipts(result.id);
        router.refresh();
        onSaved(result.id, note);
      } else {
        setError(result.error);
        if (result.code === "conflict") router.refresh();
      }
    } catch {
      setError(
        "The connection was interrupted. Your draft is still here – check it before retrying.",
      );
    } finally {
      setBusy(false);
    }
  }

  const shownKind = record?.kind ?? kind;
  const categories = financeCategories[shownKind];
  return (
    <dialog
      ref={dialog}
      className="record-dialog"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) close();
      }}
      aria-labelledby="finance-form-title"
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
              {editor.id
                ? "CORRECT A SHARED RECORD"
                : "A FACT, NOT A CALCULATION"}
            </p>
            <h2 id="finance-form-title">
              {editor.id ? "Edit" : "Add"} {kindTitle[record?.kind ?? kind]}
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
          {!record && (
            <label>
              What is this?
              <select
                name="kind"
                value={kind}
                onChange={(e) =>
                  setKind(e.target.value as FinanceRecord["kind"])
                }
              >
                {financeKinds.map((k) => (
                  <option key={k} value={k}>
                    {label(k)}
                  </option>
                ))}
              </select>
              <small className="form-help">{kindBlurb[kind]}</small>
            </label>
          )}
          <label>
            Title
            <input
              name="title"
              required
              maxLength={200}
              defaultValue={record?.title ?? ""}
              placeholder={
                shownKind === "asset"
                  ? "For example, 12 Oakfield Road"
                  : shownKind === "liability"
                    ? "For example, Funeral director balance"
                    : "For example, Funeral costs paid by Alex"
              }
            />
          </label>
          <div className="form-grid">
            <label>
              Amount (£)
              <input
                name="amount"
                inputMode="decimal"
                defaultValue={
                  record?.amountPence === null ||
                  record?.amountPence === undefined
                    ? ""
                    : formatPence(record.amountPence).replace(/[£,]/g, "")
                }
                placeholder={
                  record?.kind === "asset"
                    ? "Leave blank if not valued yet"
                    : "0.00"
                }
              />
              <small className="form-help">
                {shownKind === "asset"
                  ? "Estimated value. Sale proceeds are added later."
                  : "Pounds and pence, for example 500 or 500.25."}
              </small>
            </label>
            <label>
              Date
              <input
                type="date"
                name="occurredOn"
                defaultValue={record?.occurredOn ?? londonToday()}
              />
              <small className="form-help">
                {shownKind === "asset" || shownKind === "liability"
                  ? "Optional – the date this figure was noted."
                  : "The date the money moved."}
              </small>
            </label>
          </div>
          <div className="form-grid">
            <label>
              Category
              <select name="category" defaultValue={record?.category ?? ""}>
                <option value="">No category</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {label(c)}
                  </option>
                ))}
              </select>
            </label>
            {(record?.kind ?? kind) === "expense" && (
              <label>
                Paid by
                <select name="fundedBy" defaultValue={record?.fundedBy ?? ""}>
                  <option value="">The estate</option>
                  {users.map((u) => (
                    <option key={u} value={u}>
                      {name(u)} personally
                    </option>
                  ))}
                </select>
                <small className="form-help">
                  A personal payment can be reimbursed later, in part or in
                  full.
                </small>
              </label>
            )}
            {(record?.kind ?? kind) === "distribution" && (
              <label>
                Beneficiary
                <select
                  name="beneficiary"
                  defaultValue={record?.beneficiary ?? ""}
                  required
                >
                  <option value="">Choose one of the two of you</option>
                  {users.map((u) => (
                    <option key={u} value={u}>
                      {name(u)}
                    </option>
                  ))}
                </select>
                <small className="form-help">
                  Recorded as it happened – no split is assumed.
                </small>
              </label>
            )}
          </div>
          <div className="form-grid">
            <label>
              Organisation
              <select
                name="organisationId"
                defaultValue={record?.organisationId ?? ""}
              >
                <option value="">No organisation</option>
                {[...data.organisations].sort(byContactName).map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Project
              <select name="projectId" defaultValue={record?.projectId ?? ""}>
                <option value="">No project</option>
                {data.projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Notes
            <textarea
              name="detail"
              rows={3}
              defaultValue={record?.detail ?? ""}
              placeholder="Anything worth remembering later."
            />
          </label>
          <fieldset className="follow-up">
            <legend>Receipts and paperwork</legend>
            {record ? (
              <>
                {linkedDocs.map((doc) => (
                  <div className="task-row" key={doc.linkId}>
                    <span className="task-icon">
                      <FileText size={15} />
                    </span>
                    <div className="task-copy">
                      <strong>{doc.friendlyName}</strong>
                      <p>
                        {doc.category ? label(doc.category) : "No category"}
                      </p>
                    </div>
                    <div className="row-actions">
                      <a
                        className="subtle-button"
                        href={`/api/documents/${doc.id}/download`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Eye size={13} /> View
                      </a>
                      <a
                        className="subtle-button"
                        href={`/api/documents/${doc.id}/download?download=1`}
                        download={doc.originalName}
                      >
                        <Download size={13} /> Download
                      </a>
                      <button
                        type="button"
                        className="subtle-button"
                        disabled={receiptBusy}
                        onClick={async () => {
                          setReceiptBusy(true);
                          const res = await unlinkDocument(doc.linkId);
                          setReceiptBusy(false);
                          if (!res.ok) setError(res.error);
                          else router.refresh();
                        }}
                      >
                        Remove link
                      </button>
                    </div>
                  </div>
                ))}
                {!linkedDocs.length && (
                  <p className="form-help">
                    No receipts linked yet. Removing a link never deletes the
                    file or its other links.
                  </p>
                )}
                <div className="row-actions">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={receiptBusy}
                    onClick={() => onAttachDocument(record.id)}
                  >
                    <FileText size={15} />
                    Upload a receipt
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={receiptBusy}
                    onClick={() => onLinkExisting(record.id)}
                  >
                    <Link2 size={15} />
                    Link an existing document
                  </Button>
                </div>
              </>
            ) : (
              <>
                <label>
                  Receipt or invoice{" "}
                  <small>Optional – PDF, image or text</small>
                  <input
                    type="file"
                    accept={uploadAcceptAttribute}
                    onChange={(e) => {
                      const picked = e.target.files?.[0] ?? null;
                      if (!picked) {
                        setPendingFile(null);
                        return;
                      }
                      const problem = fileTooLarge(picked);
                      if (problem) {
                        setError(problem);
                        e.target.value = "";
                        setPendingFile(null);
                        return;
                      }
                      setError("");
                      setPendingFile(picked);
                    }}
                  />
                </label>
                {pendingFile && (
                  <div className="form-grid">
                    <label>
                      Category
                      <select
                        value={pendingCategory}
                        onChange={(e) => setPendingCategory(e.target.value)}
                      >
                        {documentCategories.map((c) => (
                          <option key={c} value={c}>
                            {label(c)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <p className="form-help">
                      {pendingFile.name} · {formatSize(pendingFile.size)} – will
                      be uploaded when you save.
                    </p>
                  </div>
                )}
                <label>
                  Already stored? Link an existing file
                  <div className="row-actions">
                    <select
                      value={pickDocId}
                      onChange={(e) => setPickDocId(e.target.value)}
                    >
                      <option value="">Choose a document…</option>
                      {data.documents
                        .filter((d) => !pendingDocIds.includes(d.id))
                        .map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.friendlyName} – {d.originalName}
                          </option>
                        ))}
                    </select>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!pickDocId}
                      onClick={() => {
                        setPendingDocIds((ids) => [...ids, pickDocId]);
                        setPickDocId("");
                      }}
                    >
                      <Plus size={15} />
                      Add
                    </Button>
                  </div>
                </label>
                {pendingDocIds.length > 0 && (
                  <div className="panel">
                    {pendingDocIds.map((id) => {
                      const doc = data.documents.find((d) => d.id === id);
                      return (
                        <div className="task-row" key={id}>
                          <span className="task-icon">
                            <FileText size={15} />
                          </span>
                          <div className="task-copy">
                            <strong>{doc?.friendlyName ?? "Document"}</strong>
                            <p>{doc?.originalName}</p>
                          </div>
                          <div className="row-actions">
                            <button
                              type="button"
                              className="subtle-button"
                              onClick={() =>
                                setPendingDocIds((ids) =>
                                  ids.filter((x) => x !== id),
                                )
                              }
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                <p className="form-help">
                  The record is saved first, then the receipt is attached. If an
                  attachment fails you are told, and you can add it again from
                  Edit – your saved figures are never affected.
                </p>
              </>
            )}
          </fieldset>
          {record && record.version > 1 && (
            <p className="form-help">
              Saving keeps the previous version in the history, along with who
              changed it and when.
            </p>
          )}
        </fieldset>
        {error && (
          <div role="alert" className="form-error">
            <p>{error}</p>
          </div>
        )}
        <div className="form-actions">
          <Button
            type="button"
            variant="outline"
            onClick={close}
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

/**
 * The money recorded against one record: proceeds, payments, or reimbursements.
 * Adding a reimbursement settles money owed to a person and is never recorded as
 * a second expense.
 */
export function FinanceMovementDialog({
  record,
  movements,
  documents,
  onClose,
  onChanged,
  onVoid,
  onAttach,
  onLinkExisting,
  onUnlink,
}: {
  record: FinanceRecord;
  movements: FinanceMovement[];
  /** Linked receipts and invoices, with the link id so a link can be removed. */
  documents: {
    linkId: string;
    id: string;
    friendlyName: string;
    originalName: string;
    category: string | null;
  }[];
  onClose: () => void;
  onChanged: (message: string) => void;
  onVoid: (target: "record" | "movement", movement?: FinanceMovement) => void;
  onAttach: () => void;
  onLinkExisting: () => void;
  onUnlink: (linkId: string) => void;
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  /** What is in the amount box, so the balance can update while it is typed. */
  const [typed, setTyped] = useState("");
  const kind = movementKindFor(record.kind);
  const live = movements.filter((m) => !m.deletedAt);
  const active = live.filter((m) => !m.voidedAt);
  const total = active.reduce((sum, m) => sum + m.amountPence, 0);
  const name = (email: string | null) => (email ? email.split("@")[0] : "");
  const remaining =
    record.amountPence === null ? null : record.amountPence - total;
  /**
   * The live balance beside the amount. It counts only movements of this kind,
   * which is what the server counts, and it is advice: the server still checks
   * the same rule on save, because this figure can be thirty seconds old.
   */
  const hint = movementAmountHint({
    kind,
    typed,
    recordedPence: record.amountPence,
    alreadyPence: active
      .filter((m) => m.kind === kind)
      .reduce((sum, m) => sum + m.amountPence, 0),
    fundedBy: record.fundedBy,
  });

  useEffect(() => {
    // Remember what was focused before the dialog opened, so closing it
    // returns the keyboard user to the button that opened it rather than
    // dropping them at the top of the page.
    const previous = document.activeElement;
    dialog.current?.showModal();
    return () => {
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);

  async function add(form: FormData) {
    if (!kind) return;
    // The button is already switched off when the amount cannot be recorded;
    // this is the belt to its braces, so an implicit submission cannot slip
    // past the figure on screen.
    if (hint?.blocks) {
      setError(hint.sentence);
      return;
    }
    setBusy(true);
    setError("");
    const get = (key: string) => String(form.get(key) ?? "");
    try {
      const result = await saveFinanceMovement({
        recordId: record.id,
        kind,
        amount: get("amount"),
        occurredOn: get("occurredOn") || londonToday(),
        detail: get("detail"),
      });
      if (result.ok) {
        // The amount is cleared so the next part payment starts from an empty
        // box and the balance beside it reads against nothing. Date and note
        // stay: part payments are usually entered one after another.
        setTyped("");
        onChanged(
          kind === "reimbursement"
            ? "Reimbursement recorded. It settles money already owed – no second expense was created."
            : "Money recorded against this record.",
        );
        router.refresh();
      } else setError(result.error);
    } catch {
      setError("The connection was interrupted. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function binMovement(movement: FinanceMovement) {
    if (
      !window.confirm(
        "Move this movement to the recoverable bin? The record itself stays.",
      )
    )
      return;
    const result = await deleteRecord(
      "finance_movement",
      movement.id,
      movement.version,
    );
    if (!result.ok) setError(result.error);
    else {
      onChanged("Movement moved to the bin. You can restore it later.");
      router.refresh();
    }
  }

  return (
    <dialog
      ref={dialog}
      className="record-dialog"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      aria-labelledby="movement-title"
    >
      <div className="dialog-heading">
        <div>
          <p className="eyebrow">
            {kind ? movementTitle[kind].toUpperCase() : "RECORDED MONEY"}
          </p>
          <h2 id="movement-title">{record.title}</h2>
          <p>
            {record.amountPence === null
              ? "Not valued yet"
              : kind === "payment"
                ? `${formatPence(record.amountPence)} recorded as owed`
                : `${formatPence(record.amountPence)} recorded`}
            {remaining !== null && kind !== "proceeds" && (
              <> · {formatPence(Math.max(0, remaining))} outstanding</>
            )}
            {remaining !== null && kind === "proceeds" && (
              <> · {formatPence(total)} received so far</>
            )}
          </p>
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

      {kind && (
        <form
          className="form-fields"
          onSubmit={(e) => {
            e.preventDefault();
            void add(new FormData(e.currentTarget));
          }}
        >
          <fieldset disabled={busy} className="follow-up">
            <legend>
              {kind === "proceeds"
                ? "Add sale proceeds"
                : kind === "payment"
                  ? "Add a payment"
                  : "Add a reimbursement"}
            </legend>
            <div className="form-grid three">
              <label>
                Amount (£)
                <input
                  name="amount"
                  inputMode="decimal"
                  required
                  placeholder="0.00"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  aria-describedby={hint ? "movement-balance" : undefined}
                />
              </label>
              <label>
                Date
                <input
                  type="date"
                  name="occurredOn"
                  defaultValue={londonToday()}
                />
              </label>
              <label>
                Note
                <input name="detail" maxLength={500} placeholder="Optional" />
              </label>
            </div>
            {hint && (
              <p
                id="movement-balance"
                className="form-help"
                aria-live="polite"
                role={hint.blocks ? "alert" : undefined}
              >
                {hint.sentence}
              </p>
            )}
            {kind === "reimbursement" && (
              <p className="form-help">
                Part payments are fine. A reimbursement only settles money{" "}
                {name(record.fundedBy)} already paid – it is never counted as a
                second expense.
              </p>
            )}
            <div className="row-actions">
              <Button type="submit" disabled={busy || !!hint?.blocks}>
                <Plus size={15} />
                Record
              </Button>
            </div>
          </fieldset>
        </form>
      )}

      {!kind && (
        <div className="form-fields">
          <p className="form-help">
            {record.kind === "income"
              ? "Income is recorded when it arrives. Use Edit to correct the amount."
              : "A distribution is recorded when it is paid. Use Edit to correct it, or void it to take it out of the totals."}
          </p>
        </div>
      )}

      {error && (
        <div role="alert" className="form-error">
          <p>{error}</p>
        </div>
      )}

      <div className="form-fields">
        <h3>Recorded so far</h3>
        {live.map((movement) => (
          <div className="task-row" key={movement.id}>
            <div className="task-copy">
              <strong>
                {formatPence(movement.amountPence)}
                {movement.voidedAt && <span className="badge"> Voided</span>}
              </strong>
              <p>
                {movement.occurredOn} · {name(movement.createdBy)}
                {movement.detail ? ` · ${movement.detail}` : ""}
              </p>
              {movement.voidedAt && movement.voidReason && (
                <p>
                  <small>Void reason: {movement.voidReason}</small>
                </p>
              )}
            </div>
            <div className="row-actions">
              <button
                className="subtle-button"
                onClick={() => onVoid("movement", movement)}
              >
                {movement.voidedAt ? "Reinstate" : "Void"}
              </button>
              <button
                className="subtle-button"
                onClick={() => binMovement(movement)}
              >
                Bin
              </button>
            </div>
          </div>
        ))}
        {!live.length && (
          <p className="empty-state">
            Nothing recorded yet
            {kind
              ? `. Add the first ${movementTitle[kind].toLowerCase()}.`
              : "."}
          </p>
        )}
      </div>

      <div className="form-fields">
        <h3>Receipts and paperwork</h3>
        {documents.map((doc) => (
          <div className="task-row" key={doc.linkId}>
            <span className="task-icon">
              <FileText size={16} />
            </span>
            <div className="task-copy">
              <strong>{doc.friendlyName}</strong>
              <p>{doc.category ? label(doc.category) : "No category"}</p>
            </div>
            <div className="row-actions">
              <a
                className="subtle-button"
                href={`/api/documents/${doc.id}/download`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Eye size={13} /> View
              </a>
              <a
                className="subtle-button"
                href={`/api/documents/${doc.id}/download?download=1`}
                download={doc.originalName}
              >
                <Download size={13} /> Download
              </a>
              <button
                className="subtle-button"
                onClick={() => onUnlink(doc.linkId)}
              >
                Remove link
              </button>
            </div>
          </div>
        ))}
        {!documents.length && (
          <p className="empty-state">
            No receipts linked yet. A file can be linked to several records at
            once, and removing a link never deletes the file.
          </p>
        )}
        <div className="row-actions">
          <Button type="button" variant="outline" onClick={onAttach}>
            <FileText size={15} />
            Attach a receipt
          </Button>
          <Button type="button" variant="outline" onClick={onLinkExisting}>
            <Link2 size={15} />
            Link an existing document
          </Button>
        </div>
      </div>

      <div className="form-actions">
        <Button
          type="button"
          variant="outline"
          onClick={() => onVoid("record")}
        >
          <AlertTriangle size={15} />
          {record.voidedAt ? "Reinstate record" : "Void record"}
        </Button>
        <Button type="button" onClick={onClose}>
          Done
        </Button>
      </div>
    </dialog>
  );
}

/** Voiding asks for a reason; the record stays visible and out of the totals. */
export function FinanceVoidDialog({
  title,
  reinstating,
  onClose,
  onConfirm,
}: {
  title: string;
  reinstating: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    // Remember what was focused before the dialog opened, so closing it
    // returns the keyboard user to the button that opened it rather than
    // dropping them at the top of the page.
    const previous = document.activeElement;
    dialog.current?.showModal();
    return () => {
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="record-dialog"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      aria-labelledby="void-title"
    >
      <div className="dialog-heading">
        <div>
          <p className="eyebrow">KEPT IN THE HISTORY</p>
          <h2 id="void-title">
            {reinstating ? "Reinstate" : "Void"} {title}
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
      <div className="form-fields">
        {reinstating ? (
          <p>
            This record will count in the totals again. The correction history
            is kept either way.
          </p>
        ) : (
          <>
            <p>
              Voiding keeps the record and its history visible, but takes it out
              of the totals. Nothing is erased. Binned records are not counted
              either, so use this when a figure should clearly not count.
            </p>
            <label>
              Reason
              <textarea
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
                minLength={3}
                placeholder="For example, entered twice by mistake"
              />
            </label>
          </>
        )}
      </div>
      <div className="form-actions">
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          disabled={busy}
        >
          Cancel
        </Button>
        <Button
          type="button"
          disabled={busy || (!reinstating && reason.trim().length < 3)}
          onClick={async () => {
            setBusy(true);
            onConfirm(reason.trim());
          }}
        >
          {reinstating ? "Reinstate" : "Void it"}
        </Button>
      </div>
    </dialog>
  );
}

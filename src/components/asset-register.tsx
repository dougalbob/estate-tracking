"use client";

import { Fragment, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Download,
  Eye,
  FileText,
  History,
  Link2,
  Paperclip,
  Pencil,
  Plus,
  PoundSterling,
  StickyNote,
  Trash2,
} from "lucide-react";
import { Button } from "./ui/button";
import { saveRecord } from "@/app/actions";
import type { Snapshot } from "@/lib/records/store";
import type { FinanceRecord } from "@/lib/finances/summary";
import { formatPence } from "@/lib/finances/money";
import {
  financeTab,
  financeTabs,
  registerColumns,
  registerRows,
  registerTotals,
  sortRegisterRows,
  type FinanceTabId,
  type RegisterRow,
  type RegisterSort,
  type RegisterSortKey,
} from "@/lib/finances/register";
import {
  financeCategories,
  label,
  movementKindFor,
} from "@/lib/records/validation";

/** A note carries a time of day, so it is shown with one. */
const formatDateTime = (value: string | Date) =>
  new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/London",
  }).format(new Date(value));

const formatDate = (value: string | Date) =>
  new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(value));

const addLabel: Record<FinanceTabId, string> = {
  assets: "Add asset",
  debts: "Add debt or expense",
  cash: "Add money received",
  distributions: "Add distribution",
};

const emptyCopy: Record<FinanceTabId, { title: string; body: string }> = {
  assets: {
    title: "No assets recorded yet",
    body: "Add what the estate owns — property, accounts, investments, a car, the contents of the house — with a value where you have one and no value where you do not.",
  },
  debts: {
    title: "No debts or expenses recorded yet",
    body: "Record what the estate owes, and anything already paid out. Expenses can be marked as paid personally, so they can be reimbursed later.",
  },
  cash: {
    title: "No money received yet",
    body: "Interest, refunds, rent and other money the estate has received are recorded here. Sale proceeds belong against the asset they came from.",
  },
  distributions: {
    title: "No distributions recorded yet",
    body: "Money given to a beneficiary goes here. No split is assumed — record each distribution as it is decided.",
  },
};

/**
 * The money in one row, right-aligned and using tabular figures so the columns
 * line up the way a spreadsheet does. A dash is honest: the value is not known,
 * not zero.
 */
function Money({
  pence,
  unknown,
  unknownTitle,
}: {
  pence: number | null;
  unknown?: boolean;
  unknownTitle?: string;
}) {
  if (pence === null || unknown)
    return (
      <span className="register-unknown" title={unknownTitle}>
        —
      </span>
    );
  return <>{formatPence(pence)}</>;
}

function StatusCell({ row }: { row: RegisterRow }) {
  return (
    <div className="register-status">
      <span className={`register-badge ${row.status.tone}`}>
        {row.status.label}
      </span>
      {row.progress !== null && (
        <span
          className="register-bar"
          role="img"
          aria-label={`${Math.round(row.progress * 100)} per cent received or paid`}
        >
          <span style={{ width: `${Math.round(row.progress * 100)}%` }} />
        </span>
      )}
    </div>
  );
}

export function AssetRegister({
  records,
  movements,
  documents,
  documentLinks,
  notes,
  nameFor,
  orgName,
  projectName,
  onAdd,
  onEdit,
  onMovement,
  onVoid,
  onBin,
  onHistory,
  onOpenNote,
  onViewDocument,
  onUpload,
  onLinkExisting,
}: {
  records: Snapshot["financeRecords"];
  movements: Snapshot["financeMovements"];
  documents: Snapshot["documents"];
  documentLinks: Snapshot["documentLinks"];
  /** Every live note. Only the ones about a record are shown against it. */
  notes: Snapshot["interactions"];
  nameFor: (email: string | null) => string;
  orgName: (id: string | null) => string;
  projectName: (id: string | null) => string | null;
  onAdd: (kind: FinanceRecord["kind"]) => void;
  onEdit: (id: string) => void;
  onMovement: (id: string) => void;
  onVoid: (record: FinanceRecord) => void;
  onBin: (record: FinanceRecord) => void;
  onHistory: (id: string) => void;
  onOpenNote: (id: string) => void;
  onViewDocument: (doc: Snapshot["documents"][number]) => void;
  onUpload: (recordId: string) => void;
  onLinkExisting: (recordId: string) => void;
}) {
  const [tabId, setTabId] = useState<FinanceTabId>("assets");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [showVoided, setShowVoided] = useState(false);
  const [expanded, setExpanded] = useState<string[]>([]);
  const [sort, setSort] = useState<RegisterSort>({
    key: "value",
    direction: -1,
  });
  // One draft per record, so a half-typed note survives opening another row.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [noteBusy, setNoteBusy] = useState<string | null>(null);
  const [noteError, setNoteError] = useState<{
    id: string;
    text: string;
  } | null>(null);
  const router = useRouter();

  const tab = financeTab(tabId);
  const columns = registerColumns[tabId];

  // Every row of the whole register, derived once. Totals are taken from the
  // rows actually on screen, so the footer never disagrees with what is shown.
  const allRows = useMemo(
    () => registerRows(records, movements),
    [records, movements],
  );

  /**
   * The notes filed against one record, most recent first. A note keeps its
   * link even after the record goes to the bin, so this stays honest about what
   * was written while the record was live.
   */
  const notesFor = (recordId: string) =>
    notes
      .filter((note) => note.financeRecordId === recordId)
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));

  const documentsFor = (recordId: string) =>
    documentLinks
      .filter((link) => link.financeRecordId === recordId)
      .flatMap((link) => {
        const doc = documents.find((d) => d.id === link.documentId);
        return doc ? [{ linkId: link.id, doc }] : [];
      });

  const rowsForTab = allRows.filter((row) =>
    (tab.kinds as readonly string[]).includes(row.record.kind),
  );

  const categories = [
    ...new Set(tab.kinds.flatMap((kind) => financeCategories[kind] ?? [])),
  ].sort();

  const hiddenVoided = rowsForTab.filter((r) => r.record.voidedAt).length;

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matches = rowsForTab.filter((row) => {
      if (!showVoided && row.record.voidedAt) return false;
      if (category !== "all" && (row.record.category ?? "") !== category)
        return false;
      if (!needle) return true;
      const words = [
        row.record.title,
        row.record.detail,
        row.record.category ? label(row.record.category) : "",
        row.status.label,
        row.record.organisationId ? orgName(row.record.organisationId) : "",
        row.record.projectId ? (projectName(row.record.projectId) ?? "") : "",
        row.record.voidReason ?? "",
        ...notesFor(row.record.id).map((n) => n.detail),
        ...documentsFor(row.record.id).map((d) => d.doc.friendlyName),
        ...row.movements.map((m) => m.detail),
        ...row.movements.map((m) => m.sourceLabel ?? ""),
      ];
      return words.join(" ").toLowerCase().includes(needle);
    });
    return sortRegisterRows(matches, sort);
    // documentsFor closes over the same three arrays that are in deps below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    allRows,
    tabId,
    query,
    category,
    showVoided,
    sort,
    records,
    movements,
    documents,
    documentLinks,
    notes,
    orgName,
    projectName,
  ]);

  const totals = registerTotals(visible);
  const hasAnything = rowsForTab.length > 0;

  function toggle(id: string) {
    setExpanded((open) =>
      open.includes(id) ? open.filter((i) => i !== id) : [...open, id],
    );
  }

  function sortHeader(key: RegisterSortKey, text: string, className?: string) {
    const active = sort.key === key;
    const Icon = !active
      ? ChevronDown
      : sort.direction === 1
        ? ChevronUp
        : ChevronDown;
    return (
      <th
        scope="col"
        className={className}
        aria-sort={
          active ? (sort.direction === 1 ? "ascending" : "descending") : "none"
        }
      >
        <button
          type="button"
          className={active ? "register-sort active" : "register-sort"}
          onClick={() =>
            setSort((current) =>
              current.key === key
                ? { key, direction: current.direction === 1 ? -1 : 1 }
                : {
                    key,
                    direction: key === "title" || key === "status" ? 1 : -1,
                  },
            )
          }
        >
          {text}
          <Icon size={12} aria-hidden />
        </button>
      </th>
    );
  }

  function movementVerb(record: FinanceRecord) {
    const kind = movementKindFor(record.kind);
    return kind === "proceeds"
      ? "Add proceeds"
      : kind === "payment"
        ? "Record a payment"
        : kind === "reimbursement"
          ? "Reimburse"
          : null;
  }

  function detailPanel(row: RegisterRow) {
    const record = row.record;
    const docs = documentsFor(record.id);
    const recordNotes = notesFor(record.id);
    const verb = movementVerb(record);

    /**
     * Saves a note against this record. It is an ordinary interaction: the
     * author, the history, the documents and any follow-up tasks all come for
     * free, and the note appears in the Event log like every other note. What
     * it does not do is inherit the record's contact or project — filing a note
     * against an asset is the only link the user asked for.
     */
    async function addNote() {
      const detail = (drafts[record.id] ?? "").trim();
      if (!detail) {
        setNoteError({
          id: record.id,
          text: "Write the note first, then add it.",
        });
        return;
      }
      setNoteBusy(record.id);
      setNoteError(null);
      const result = await saveRecord("interaction", {
        kind: "note",
        title: "",
        detail,
        organisationId: null,
        projectId: null,
        occurredAt: new Date().toISOString(),
        financeRecordId: record.id,
        followUps: [],
      });
      setNoteBusy(null);
      if (!result.ok) {
        setNoteError({ id: record.id, text: result.error });
        return;
      }
      setDrafts((current) => ({ ...current, [record.id]: "" }));
      router.refresh();
    }
    return (
      <div className="register-detail-body">
        <div className="register-detail-main">
          <div className="register-block">
            <div className="register-block-heading">
              <h3>Money movements</h3>
              {verb && !record.voidedAt && (
                <button
                  className="subtle-button"
                  onClick={() => onMovement(record.id)}
                >
                  <PoundSterling size={14} />
                  {verb}
                </button>
              )}
            </div>
            {row.movements.length ? (
              <ul className="register-movement-list">
                {row.movements.map((m) => (
                  <li key={m.id} className={m.voidedAt ? "voided" : undefined}>
                    <span className="register-movement-when">
                      {formatDate(m.occurredOn)}
                    </span>
                    <span className="register-movement-kind">
                      {label(m.kind)}
                    </span>
                    <span className="register-movement-amount">
                      {formatPence(m.amountPence)}
                    </span>
                    <span className="register-movement-detail">
                      {[m.detail, m.sourceLabel ? `via ${m.sourceLabel}` : ""]
                        .filter(Boolean)
                        .join(" · ")}
                      {m.voidedAt && m.voidReason
                        ? ` · voided: ${m.voidReason}`
                        : m.voidedAt
                          ? " · voided"
                          : ""}
                      <small> · {nameFor(m.createdBy)}</small>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="register-empty-line">
                {record.kind === "liability"
                  ? "Nothing paid yet — the whole amount is still outstanding."
                  : record.kind === "expense" && record.fundedBy
                    ? "Nothing reimbursed yet — the whole amount is still owed back."
                    : record.kind === "expense"
                      ? "Paid from estate money, so there is nothing to reimburse."
                      : verb
                        ? "Nothing recorded yet — the full amount is still to come."
                        : "No movements recorded for this kind of record."}
              </p>
            )}
          </div>

          <div className="register-block">
            <div className="register-block-heading">
              <h3>
                Notes
                {recordNotes.length > 0 && (
                  <span className="doc-count">
                    <StickyNote size={11} aria-hidden />
                    {recordNotes.length}
                  </span>
                )}
              </h3>
            </div>
            {recordNotes.length ? (
              <ul className="register-note-list">
                {recordNotes.map((note) => (
                  <li key={note.id}>
                    <div className="register-note-head">
                      <span className="register-note-when">
                        {formatDateTime(note.occurredAt)}
                      </span>
                      <span className="register-note-who">
                        {nameFor(note.createdBy)}
                      </span>
                      <button
                        className="subtle-button"
                        onClick={() => onOpenNote(note.id)}
                      >
                        <Pencil size={13} />
                        Edit
                      </button>
                    </div>
                    {note.title && note.title !== "Quick note" && (
                      <strong className="register-note-title">
                        {note.title}
                      </strong>
                    )}
                    <p className="register-note-text">{note.detail}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="register-empty-line">
                No notes yet. Anything you were told about this one — a balance,
                a valuation, why a sale fell through — is worth a line here.
              </p>
            )}
            <div className="register-note-compose">
              <label>
                <span className="sr-only">Add a note about {record.title}</span>
                <textarea
                  rows={2}
                  placeholder="Add a note about this one…"
                  value={drafts[record.id] ?? ""}
                  onChange={(e) =>
                    setDrafts((current) => ({
                      ...current,
                      [record.id]: e.target.value,
                    }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey))
                      void addNote();
                  }}
                />
              </label>
              <div className="register-note-actions">
                <Button
                  type="button"
                  onClick={() => void addNote()}
                  disabled={noteBusy === record.id}
                >
                  {noteBusy === record.id ? "Saving…" : "Add note"}
                </Button>
                <small>
                  Ctrl or ⌘ and Enter also saves. Notes keep their author and
                  their place in the history.
                </small>
              </div>
              {noteError?.id === record.id && (
                <p className="form-error">{noteError.text}</p>
              )}
            </div>
          </div>

          <div className="register-block">
            <div className="register-block-heading">
              <h3>
                Documents
                {docs.length > 0 && (
                  <span className="doc-count">
                    <Paperclip size={11} aria-hidden />
                    {docs.length}
                  </span>
                )}
              </h3>
              <div className="register-doc-actions">
                <button
                  className="subtle-button"
                  onClick={() => onUpload(record.id)}
                >
                  <Plus size={14} />
                  Upload
                </button>
                <button
                  className="subtle-button"
                  onClick={() => onLinkExisting(record.id)}
                >
                  <Link2 size={14} />
                  Link existing
                </button>
              </div>
            </div>
            {docs.length ? (
              <ul className="register-doc-list">
                {docs.map(({ linkId, doc }) => (
                  <li key={linkId}>
                    <FileText size={14} aria-hidden />
                    <span className="register-doc-name">
                      {doc.friendlyName}
                      <small>
                        {[
                          doc.category ? label(doc.category) : null,
                          formatDate(doc.createdAt),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </small>
                    </span>
                    <span className="register-doc-buttons">
                      <button
                        className="subtle-button"
                        onClick={() => onViewDocument(doc)}
                      >
                        <Eye size={13} />
                        View
                      </button>
                      <a
                        className="subtle-button"
                        href={`/api/documents/${doc.id}/download?download=1`}
                      >
                        <Download size={13} />
                        Download
                      </a>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="register-empty-line">
                No paperwork attached. A valuation, statement or receipt here
                saves hunting for it later.
              </p>
            )}
          </div>
        </div>

        <aside className="register-detail-side">
          {record.detail && (
            <div className="register-block">
              <div className="register-block-heading">
                <h3>Description</h3>
              </div>
              <p className="register-detail-text">{record.detail}</p>
            </div>
          )}
          <dl className="register-facts">
            <div>
              <dt>Category</dt>
              <dd>{record.category ? label(record.category) : "Not set"}</dd>
            </div>
            <div>
              <dt>Organisation</dt>
              <dd>
                {record.organisationId
                  ? orgName(record.organisationId)
                  : "Not linked"}
              </dd>
            </div>
            <div>
              <dt>Project</dt>
              <dd>
                {record.projectId && projectName(record.projectId)
                  ? projectName(record.projectId)
                  : "Not linked"}
              </dd>
            </div>
            <div>
              <dt>Recorded</dt>
              <dd>
                {nameFor(record.createdBy)} · {formatDate(record.createdAt)}
              </dd>
            </div>
            {record.version > 1 && (
              <div>
                <dt>Corrections</dt>
                <dd>
                  Changed {record.version - 1} time
                  {record.version - 1 > 1 ? "s" : ""} since it was first saved
                </dd>
              </div>
            )}
            {record.voidedAt && (
              <div>
                <dt>Voided</dt>
                <dd>
                  {record.voidReason || "No reason recorded"}. Left out of every
                  total and still visible here.
                </dd>
              </div>
            )}
          </dl>
          <div className="register-detail-actions">
            <button className="subtle-button" onClick={() => onEdit(record.id)}>
              <Pencil size={14} />
              Edit
            </button>
            <button
              className="subtle-button"
              onClick={() => onHistory(record.id)}
            >
              <History size={14} />
              History
            </button>
            <button className="subtle-button" onClick={() => onVoid(record)}>
              {record.voidedAt ? "Reinstate" : "Void"}
            </button>
            <button className="subtle-button" onClick={() => onBin(record)}>
              <Trash2 size={14} />
              Bin
            </button>
          </div>
        </aside>
      </div>
    );
  }

  return (
    <section className="asset-register" aria-label="Financial records">
      <div className="register-tabs" role="tablist" aria-label="Register">
        {financeTabs.map((t) => {
          const count = allRows.filter((row) =>
            (t.kinds as readonly string[]).includes(row.record.kind),
          ).length;
          return (
            <button
              key={t.id}
              role="tab"
              id={`register-tab-${t.id}`}
              aria-selected={tabId === t.id}
              aria-controls="register-panel"
              className={
                tabId === t.id ? "register-tab active" : "register-tab"
              }
              onClick={() => {
                setTabId(t.id);
                setCategory("all");
                setExpanded([]);
              }}
            >
              {t.label}
              <span className="register-tab-count">{count}</span>
            </button>
          );
        })}
      </div>

      <div
        className="register-toolbar"
        role="tabpanel"
        id="register-panel"
        aria-labelledby={`register-tab-${tabId}`}
      >
        <label className="search-label">
          Find in {tab.label.toLowerCase()}
          <input
            type="search"
            placeholder="Search titles, notes, contacts, or documents…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        {categories.length > 1 && (
          <label className="register-filter">
            Category
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="all">All categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {label(c)}
                </option>
              ))}
            </select>
          </label>
        )}
        {hiddenVoided > 0 && (
          <label className="register-checkbox">
            <input
              type="checkbox"
              checked={showVoided}
              onChange={(e) => setShowVoided(e.target.checked)}
            />
            Show voided ({hiddenVoided})
          </label>
        )}
        <Button
          onClick={() =>
            onAdd((tab.kinds[0] ?? "asset") as FinanceRecord["kind"])
          }
        >
          <Plus size={16} />
          {addLabel[tabId]}
        </Button>
      </div>

      {visible.length === 0 ? (
        <div className="empty-state register-empty">
          {hasAnything ? (
            <>
              <AlertTriangle size={26} />
              <h2>No records match that search</h2>
              <p>
                Try a different word, clear the category filter, or show voided
                records.
              </p>
            </>
          ) : (
            <>
              <PoundSterling size={26} />
              <h2>{emptyCopy[tabId].title}</h2>
              <p>{emptyCopy[tabId].body}</p>
              <Button
                onClick={() =>
                  onAdd((tab.kinds[0] ?? "asset") as FinanceRecord["kind"])
                }
              >
                <Plus size={16} />
                {addLabel[tabId]}
              </Button>
            </>
          )}
        </div>
      ) : (
        <div className="register-scroll">
          <table className="register-table">
            <caption className="register-caption">
              {totals.count} record{totals.count === 1 ? "" : "s"} · sort by any
              column · select a row to open its movements and paperwork
            </caption>
            <thead>
              <tr>
                <th scope="col" className="register-col-toggle">
                  <span className="sr-only">Open</span>
                </th>
                {sortHeader("title", tabId === "assets" ? "Asset" : "Record")}
                {sortHeader("status", "Status", "register-col-status")}
                {sortHeader("value", columns.value, "register-money")}
                {sortHeader("settled", columns.settled, "register-money")}
                {sortHeader("remaining", columns.remaining, "register-money")}
                <th scope="col" className="register-col-docs">
                  Files
                </th>
                <th scope="col" className="register-col-notes">
                  Notes
                </th>
                <th scope="col" className="register-col-actions">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => {
                const record = row.record;
                const docs = documentsFor(record.id);
                const open = expanded.includes(record.id);
                return (
                  <Fragment key={record.id}>
                    <tr
                      className={[
                        "register-row",
                        open ? "open" : "",
                        record.voidedAt ? "voided" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onClick={() => toggle(record.id)}
                    >
                      <td className="register-col-toggle">
                        <button
                          type="button"
                          className="register-expand"
                          aria-expanded={open}
                          aria-controls={`register-detail-${record.id}`}
                          aria-label={
                            open
                              ? `Close ${record.title}`
                              : `Open ${record.title}`
                          }
                          onClick={(e) => {
                            e.stopPropagation();
                            toggle(record.id);
                          }}
                        >
                          {open ? (
                            <ChevronDown size={16} />
                          ) : (
                            <ChevronRight size={16} />
                          )}
                        </button>
                      </td>
                      <th scope="row" className="register-col-record">
                        <span className="register-title">
                          {record.title}
                          {record.voidedAt && (
                            <span className="register-badge voided">
                              Voided
                            </span>
                          )}
                        </span>
                        <span className="register-meta">
                          {record.category
                            ? label(record.category)
                            : "No category"}
                          {record.organisationId
                            ? ` · ${orgName(record.organisationId)}`
                            : ""}
                          {record.projectId && projectName(record.projectId)
                            ? ` · ${projectName(record.projectId)}`
                            : ""}
                        </span>
                        {record.detail && (
                          <span className="register-snippet">
                            {record.detail.length > 110
                              ? `${record.detail.slice(0, 110).trimEnd()}…`
                              : record.detail}
                          </span>
                        )}
                      </th>
                      <td className="register-col-status">
                        <StatusCell row={row} />
                      </td>
                      <td className="register-money">
                        <Money
                          pence={row.valuePence}
                          unknownTitle="No value recorded yet"
                        />
                      </td>
                      <td className="register-money">
                        <Money pence={row.settledPence} />
                      </td>
                      <td className="register-money register-money-remaining">
                        <Money
                          pence={row.remainingPence}
                          unknown={
                            row.valuePence === null ||
                            (row.remainingPence === 0 && row.extraPence > 0)
                          }
                          unknownTitle={
                            row.valuePence === null
                              ? "Needs a value first"
                              : "Nothing left to collect"
                          }
                        />
                        {row.extraPence > 0 && (
                          <small className="register-extra">
                            {formatPence(row.extraPence)}{" "}
                            {record.kind === "asset"
                              ? "above estimate"
                              : "overpaid"}
                          </small>
                        )}
                      </td>
                      <td className="register-col-docs">
                        {docs.length ? (
                          <span
                            className="doc-count"
                            title={`${docs.length} document${docs.length > 1 ? "s" : ""} attached`}
                          >
                            <Paperclip size={11} aria-hidden />
                            {docs.length}
                          </span>
                        ) : (
                          <span
                            className="register-unknown"
                            title="No documents attached yet"
                          >
                            —
                          </span>
                        )}
                      </td>
                      <td className="register-col-notes">
                        {notesFor(record.id).length ? (
                          <span
                            className="doc-count"
                            title={`${notesFor(record.id).length} note${notesFor(record.id).length > 1 ? "s" : ""} filed against this record`}
                          >
                            <StickyNote size={11} aria-hidden />
                            {notesFor(record.id).length}
                          </span>
                        ) : (
                          <span
                            className="register-unknown"
                            title="No notes filed against this record yet"
                          >
                            —
                          </span>
                        )}
                      </td>
                      <td
                        className="register-col-actions"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          className="subtle-button"
                          onClick={() => onEdit(record.id)}
                        >
                          <Pencil size={13} />
                          Edit
                        </button>
                      </td>
                    </tr>
                    {open && (
                      <tr
                        className="register-detail-row"
                        id={`register-detail-${record.id}`}
                      >
                        <td colSpan={9}>{detailPanel(row)}</td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td className="register-col-toggle" />
                <th scope="row">
                  {totals.count} shown
                  {totals.unvaluedCount > 0 && (
                    <small className="register-footnote">
                      {totals.unvaluedCount} with no value yet
                    </small>
                  )}
                </th>
                <td className="register-col-status" />
                <td className="register-money">
                  {formatPence(totals.valuePence)}
                </td>
                <td className="register-money">
                  {formatPence(totals.settledPence)}
                </td>
                <td className="register-money register-money-remaining">
                  {tabId === "cash" ? "—" : formatPence(totals.remainingPence)}
                </td>
                <td className="register-col-docs" />
                <td className="register-col-notes" />
                <td className="register-col-actions" />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}

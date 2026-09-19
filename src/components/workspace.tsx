"use client";
import { useState, useEffect, useRef, Fragment } from "react";
import {
  ArrowUpRight,
  BookOpen,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  FolderOpen,
  Home,
  Leaf,
  ListTodo,
  LockKeyhole,
  Paperclip,
  Plus,
  Users,
  Wallet,
  ArrowLeft,
  Pencil,
  History,
  Phone,
  Mail,
  Globe,
  MapPin,
  StickyNote,
  ScrollText,
  ArrowUpDown,
  CalendarDays,
  Search,
  ClipboardCheck,
  Copy,
  Check,
  Trash2,
  ArchiveRestore,
  Archive,
  AlertTriangle,
  Download,
  FileText,
  Link2,
  X,
  Eye,
  EyeOff,
  Landmark,
  Receipt,
  TrendingUp,
  TrendingDown,
  HandCoins,
  PoundSterling,
  ListChecks,
} from "lucide-react";
import {
  switchDemoUser,
  deleteRecord,
  restoreRecord,
  uploadDocument,
  linkDocument,
  unlinkDocument,
  linkTaskToOrganisation,
  setFinanceVoid,
} from "@/app/actions";
import { RecordSummary } from "./record-summary";
import { useRouter } from "next/navigation";
import { Button } from "./ui/button";
import { RecordForm, type Editor } from "./record-form";
import {
  FinanceMovementDialog,
  FinanceRecordForm,
  FinanceVoidDialog,
  type FinanceRecordEditor,
} from "./finance-forms";
import { ProjectChecklist } from "./checklist";
import {
  formatSize,
  fileTooLarge,
  postDocumentUpload,
  uploadErrorMessage,
} from "./document-upload";
import { BackupPanel } from "./backup-panel";
import type { Snapshot } from "@/lib/records/store";
import type { Identity } from "@/lib/auth/verify";
import {
  attentionDate,
  label,
  londonToday,
  taskStatuses,
  taskKinds,
  everyoneAssignee,
  documentCategories,
  financeKinds,
  movementKindFor,
} from "@/lib/records/validation";
import { formatPence } from "@/lib/finances/money";
import { financeSummary } from "@/lib/finances/summary";
import { canCopy, copyText, telHref } from "@/lib/contacts/contact-links";
import { documentLinkItems } from "@/lib/contacts/document-links";

/** Records that can sit in the recoverable bin. */
type BinKind =
  | "organisation"
  | "interaction"
  | "task"
  | "project"
  | "document"
  | "finance_record"
  | "finance_movement"
  | "template_item";

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

const financeSection = {
  id: "finances",
  title: "Estate finances",
  icon: Wallet,
  description: "Assets, liabilities, and the money moving in and out.",
};

const formatTime = (value: string | Date | number) =>
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
/**
 * One icon per interaction kind for the Event log rows. The icon is never
 * the only cue: every row also carries the kind as a text badge.
 */
/**
 * One icon per task type. The word is always beside the icon, so the icon is
 * never the only cue - the same rule the Event log rows follow.
 */
const taskKindIcons = {
  call: Phone,
  email: Mail,
  meeting: CalendarDays,
  research: Search,
  review: ClipboardCheck,
};
const eventKindIcons = {
  call: Phone,
  email: Mail,
  letter: FileText,
  web_form: Globe,
  note: StickyNote,
} as const;
const eventKindIcon = (kind: string) =>
  eventKindIcons[kind as keyof typeof eventKindIcons] ?? StickyNote;
/**
 * How many documents are attached. Deliberately a chip rather than a few words
 * in a long line of metadata: a receipt attached to a payment is easy to miss,
 * and missing it leads to the same paperwork being filed twice.
 */
function DocumentCount({ count }: { count: number }) {
  return (
    <span
      className="doc-count"
      title={`${count} document${count > 1 ? "s" : ""} attached`}
    >
      <Paperclip size={11} aria-hidden />
      {count} document{count > 1 ? "s" : ""}
    </span>
  );
}

function viewDocument(id: string) {
  if (typeof window === "undefined") return;
  try {
    const win = window.open(
      `/api/documents/${id}/download`,
      "_blank",
      "noopener,noreferrer",
    );
    if (!win) {
      // Fallback if popup blocked (Arena preview sandbox): navigate in same tab – inline will show image/PDF
      window.location.href = `/api/documents/${id}/download`;
    }
  } catch {
    window.location.href = `/api/documents/${id}/download`;
  }
}
async function downloadDocument(id: string, originalName?: string) {
  if (typeof window === "undefined") return;
  const url = `/api/documents/${id}/download?download=1`;
  const inIframe = (() => {
    try {
      return window.self !== window.top;
    } catch {
      return true;
    }
  })();
  console.log(
    "[download] attempting",
    url,
    originalName,
    inIframe ? "in iframe" : "top",
  );

  // 1) Anchor with download attr – must be synchronous, works if sandbox allows downloads
  try {
    const a = document.createElement("a");
    a.href = url;
    if (originalName) a.setAttribute("download", originalName);
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      try {
        a.remove();
      } catch {}
    }, 1500);
  } catch (e) {
    console.warn("[download] anchor+download failed", e);
  }

  // 2) Hidden iframe – no popup permission needed, only download permission; works in many sandboxed contexts
  try {
    const iframe = document.createElement("iframe");
    iframe.style.display = "none";
    iframe.src = url;
    document.body.appendChild(iframe);
    setTimeout(() => {
      try {
        iframe.remove();
      } catch {}
    }, 6000);
  } catch (e) {
    console.warn("[download] iframe failed", e);
  }

  // 3) Fetch blob + object URL – bypasses most sandbox restrictions, triggers save dialog with original name
  try {
    const res = await fetch(url, { credentials: "same-origin" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = originalName || `document-${id}`;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      try {
        URL.revokeObjectURL(blobUrl);
        a.remove();
      } catch {}
    }, 3000);
    console.log("[download] blob method succeeded");
    return;
  } catch (e) {
    console.warn("[download] blob method failed", e);
  }

  // 4) Only try window.open if not in iframe or popup allowed – Arena preview blocks this (allow-popups not set)
  if (!inIframe) {
    try {
      const win = window.open(url, "_blank", "noopener,noreferrer");
      if (win) {
        console.log("[download] window.open succeeded");
        return;
      }
      console.warn("[download] window.open returned null");
    } catch (e) {
      console.warn("[download] window.open threw", e);
    }
  } else {
    console.log(
      "[download] in iframe – skipping window.open (needs allow-popups, blocked in Arena preview)",
    );
  }

  // 5) Last resort: navigate current frame to download URL – attachment header triggers download without leaving app in most browsers
  // This does NOT need allow-popups, only same-origin navigation which is allowed in sandbox
  try {
    console.log("[download] fallback to location.href");
    window.location.href = url;
  } catch (e) {
    console.warn("[download] location.href failed", e);
  }
}

type DocUploadInitial = {
  organisationId?: string;
  interactionId?: string;
  taskId?: string;
  projectId?: string;
  financeRecordId?: string;
};
type LinkPickerInitial = {
  documentId?: string;
  organisationId?: string;
  interactionId?: string;
  taskId?: string;
  projectId?: string;
  financeRecordId?: string;
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
    // "added" is the list as it comes back from the database, which is the
    // order contacts were added in. Neither sort is on until it is asked for.
    [contactSort, setContactSort] = useState<"added" | "name" | "newest">(
      "added",
    ),
    [hideResolved, setHideResolved] = useState(false),
    [hideDoneScheduled, setHideDoneScheduled] = useState(false),
    [collapsedProjects, setCollapsedProjects] = useState<
      Record<string, boolean>
    >({}),
    [projectHideDone, setProjectHideDone] = useState<Record<string, boolean>>(
      {},
    ),
    [docQuery, setDocQuery] = useState(""),
    [docCategory, setDocCategory] = useState("all"),
    [eventQuery, setEventQuery] = useState(""),
    [eventOrg, setEventOrg] = useState("all"),
    [eventProject, setEventProject] = useState("all"),
    [eventKind, setEventKind] = useState("all"),
    [eventRecorder, setEventRecorder] = useState("all"),
    [eventOrder, setEventOrder] = useState("newest"),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [docUpload, setDocUpload] = useState<DocUploadInitial | null>(null),
    [linkPicker, setLinkPicker] = useState<LinkPickerInitial | null>(null),
    [taskLinkPicker, setTaskLinkPicker] = useState<string | null>(null),
    [contactQuickView, setContactQuickView] = useState<string | null>(null),
    [viewingDoc, setViewingDoc] = useState<
      Snapshot["documents"][number] | null
    >(null),
    [financeEditor, setFinanceEditor] = useState<FinanceRecordEditor | null>(
      null,
    ),
    [movementRecordId, setMovementRecordId] = useState<string | null>(null),
    [voidTarget, setVoidTarget] = useState<{
      target: "record" | "movement";
      id: string;
      version: number;
      reinstating: boolean;
      title: string;
    } | null>(null),
    [financeQuery, setFinanceQuery] = useState(""),
    [financeFilter, setFinanceFilter] = useState<
      "all" | (typeof financeKinds)[number]
    >("all");

  const router = useRouter();
  useEffect(() => {
    const refresh = () => {
      if (
        !editor &&
        !history &&
        !docUpload &&
        !linkPicker &&
        !viewingDoc &&
        !financeEditor &&
        !movementRecordId &&
        !voidTarget &&
        document.visibilityState === "visible"
      )
        router.refresh();
    };
    const interval = window.setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
    };
  }, [
    editor,
    history,
    docUpload,
    linkPicker,
    viewingDoc,
    financeEditor,
    movementRecordId,
    voidTarget,
    router,
  ]);

  const organisation = data.organisations.find((o) => o.id === selected);
  const names = (email: string | null) =>
    !email
      ? "Unassigned"
      : email === everyoneAssignee
        ? "Everyone"
        : email.split("@")[0];
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
  /**
   * Only a live contact has details worth opening. `orgName` also resolves a
   * name from the recoverable bin so a binned contact's tasks still read
   * properly, but there is no live record behind that name, so the row keeps it
   * as plain text and the popup is not offered.
   */
  const liveOrganisation = (id: string | null) =>
    id ? (data.organisations.find((o) => o.id === id) ?? null) : null;
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
        if (filter.organisationId && l.organisationId === filter.organisationId)
          return true;
        if (filter.interactionId && l.interactionId === filter.interactionId)
          return true;
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
    const all = new Set([
      ...directIds,
      ...viaProjectIds,
      ...viaInteractionIds,
      ...viaTaskIds,
    ]);
    return data.documents.filter((d) => all.has(d.id));
  };

  const getDocumentLinks = (docId: string) =>
    data.documentLinks.filter((l) => l.documentId === docId);
  const getDirectLinksForOrg = (docId: string, orgId: string) =>
    data.documentLinks.filter(
      (l) => l.documentId === docId && l.organisationId === orgId,
    );

  // Estate finances: every total comes from one shared calculation.
  const finance = financeSummary(
    data.financeRecords,
    data.financeMovements,
    users,
  );
  const linkedDocsForFinance = (recordId: string) =>
    data.documentLinks
      .filter((l) => l.financeRecordId === recordId)
      .map((l) => {
        const doc = data.documents.find((d) => d.id === l.documentId);
        return doc
          ? {
              linkId: l.id,
              id: doc.id,
              friendlyName: doc.friendlyName,
              originalName: doc.originalName,
              category: doc.category,
            }
          : null;
      })
      .filter((d): d is NonNullable<typeof d> => d !== null);
  const financeRecordName = (id: string | null) =>
    id
      ? (data.financeRecords.find((r) => r.id === id)?.title ??
        data.deletedFinanceRecords.find((r) => r.id === id)?.title ??
        "Financial record")
      : "";
  const movementsFor = (recordId: string, kind?: string) =>
    data.financeMovements.filter(
      (m) => m.recordId === recordId && (!kind || m.kind === kind),
    );
  const activeMovementTotal = (recordId: string) =>
    movementsFor(recordId)
      .filter((m) => !m.voidedAt)
      .reduce((total, m) => total + m.amountPence, 0);

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
    setEventQuery("");
    setEventOrg("all");
    setEventProject("all");
    setEventKind("all");
    setEventRecorder("all");
    setEventOrder("newest");
    setError("");
  }
  function resetEventFilters() {
    setEventQuery("");
    setEventOrg("all");
    setEventProject("all");
    setEventKind("all");
    setEventRecorder("all");
    setEventOrder("newest");
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
    kind: BinKind,
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
            : kind === "finance_record"
              ? "Move this financial record to the recoverable bin? You can restore it later. Its history is kept and it stops counting in the totals."
              : kind === "finance_movement"
                ? "Move this money movement to the recoverable bin? You can restore it later."
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
  async function handleRestore(kind: BinKind, id: string, version: number) {
    setError("");
    const result = await restoreRecord(kind, id, version);
    if (!result.ok) {
      setError(result.error);
    } else {
      setMessage("Restored from the bin. It is now back in your workspace.");
      router.refresh();
    }
  }
  /**
   * Voiding takes a figure out of the totals without hiding or deleting it. The
   * reason and the actor stay in the history, and it can be reinstated.
   */
  async function confirmVoid(reason: string) {
    if (!voidTarget) return;
    const result = await setFinanceVoid({
      target: voidTarget.target,
      id: voidTarget.id,
      version: voidTarget.version,
      voided: !voidTarget.reinstating,
      reason,
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setMessage(
      voidTarget.reinstating
        ? "Reinstated – it counts in the totals again."
        : "Voided. It stays visible with the reason and is left out of the totals.",
    );
    setVoidTarget(null);
    router.refresh();
  }

  function financeRow(record: Snapshot["financeRecords"][number]) {
    const paidOrReceived = activeMovementTotal(record.id);
    const movementKind = movementKindFor(record.kind);
    const docs = linkedDocsForFinance(record.id);
    const Icon =
      record.kind === "asset"
        ? Landmark
        : record.kind === "liability"
          ? Receipt
          : record.kind === "income"
            ? TrendingUp
            : record.kind === "expense"
              ? TrendingDown
              : HandCoins;
    const money =
      record.kind === "asset"
        ? [
            record.amountPence === null
              ? "Estimated value not recorded yet"
              : `Estimated ${formatPence(record.amountPence)}`,
            paidOrReceived > 0
              ? `Proceeds ${formatPence(paidOrReceived)}`
              : null,
            record.amountPence !== null && paidOrReceived < record.amountPence
              ? `${formatPence(record.amountPence - paidOrReceived)} still to realise`
              : null,
          ]
        : record.kind === "liability"
          ? [
              `Recorded ${formatPence(record.amountPence ?? 0)}`,
              `Paid ${formatPence(paidOrReceived)}`,
              (record.amountPence ?? 0) - paidOrReceived > 0
                ? `${formatPence((record.amountPence ?? 0) - paidOrReceived)} outstanding`
                : "Paid in full",
            ]
          : record.kind === "income"
            ? [`Received ${formatPence(record.amountPence ?? 0)}`]
            : record.kind === "expense"
              ? [
                  record.fundedBy
                    ? `${formatPence(record.amountPence ?? 0)} paid personally by ${names(record.fundedBy)}`
                    : `${formatPence(record.amountPence ?? 0)} paid from the estate`,
                  record.fundedBy
                    ? paidOrReceived > 0
                      ? `Reimbursed ${formatPence(paidOrReceived)} · ${formatPence(Math.max(0, (record.amountPence ?? 0) - paidOrReceived))} still owed`
                      : "Not reimbursed yet"
                    : null,
                ]
              : [
                  `${formatPence(record.amountPence ?? 0)} to ${names(record.beneficiary)}`,
                ];
    const movementButton =
      movementKind === "proceeds"
        ? "Proceeds"
        : movementKind === "payment"
          ? "Payments"
          : "Reimburse";
    return (
      <div className="task-row" key={record.id}>
        <span className="task-icon">
          <Icon size={18} />
        </span>
        <div className="task-copy">
          <button
            className="record-title"
            onClick={() => setFinanceEditor({ id: record.id })}
          >
            {record.title}
          </button>
          <p>
            <span className={record.voidedAt ? "badge voided" : "badge"}>
              {record.voidedAt ? "Voided" : label(record.kind)}
            </span>
            {record.category ? ` · ${label(record.category)}` : ""}
            {record.occurredOn ? ` · ${formatDate(record.occurredOn)}` : ""}
            {record.organisationId
              ? ` · ${orgName(record.organisationId)}`
              : ""}
            {record.projectId && projectName(record.projectId)
              ? ` · ${projectName(record.projectId)}`
              : ""}
            {docs.length > 0 && <DocumentCount count={docs.length} />}
          </p>
          <p>{money.filter(Boolean).join(" · ")}</p>
          {record.voidedAt && record.voidReason && (
            <p>
              <small>Voided: {record.voidReason}</small>
            </p>
          )}
          <p>
            <small>
              Recorded by {names(record.createdBy)}
              {record.version > 1 ? " · Corrected since – see history" : ""}
            </small>
          </p>
        </div>
        <div className="row-actions">
          {movementKind && !record.voidedAt && (
            <button
              className="subtle-button"
              onClick={() => setMovementRecordId(record.id)}
            >
              <PoundSterling size={14} />
              {movementButton}
            </button>
          )}
          <button
            className="subtle-button"
            onClick={() => setFinanceEditor({ id: record.id })}
          >
            <Pencil size={14} />
            Edit
          </button>
          {historyButton("finance_record", record.id)}
          <button
            className="subtle-button"
            onClick={() =>
              setVoidTarget({
                target: "record",
                id: record.id,
                version: record.version,
                reinstating: !!record.voidedAt,
                title: record.title,
              })
            }
          >
            {record.voidedAt ? "Reinstate" : "Void"}
          </button>
          <button
            className="subtle-button"
            onClick={() =>
              handleDelete("finance_record", record.id, record.version)
            }
          >
            <Trash2 size={14} />
            Bin
          </button>
        </div>
      </div>
    );
  }

  function taskRow(t: Snapshot["tasks"][number]) {
    const date = attentionDate(t),
      source = data.interactions.find((n) => n.id === t.interactionId);
    const docs = getLinkedDocuments({ taskId: t.id });
    const contact = liveOrganisation(t.organisationId);
    const KindIcon = t.kind
      ? taskKindIcons[t.kind as keyof typeof taskKindIcons]
      : null;
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
            {contact ? (
              <button
                type="button"
                className="task-org"
                aria-label={`Contact details for ${contact.name}`}
                title={`Contact details for ${contact.name}`}
                onClick={() => setContactQuickView(contact.id)}
              >
                <Users size={11} aria-hidden />
                {contact.name}
              </button>
            ) : (
              orgName(t.organisationId)
            )}
            <span>·</span>
            {names(t.assignee)}
            {t.projectId && projectName(t.projectId) && (
              <> · {projectName(t.projectId)}</>
            )}
          </p>
          <p>
            {label(t.status)}
            {KindIcon && (
              <>
                {" · "}
                <span
                  className="badge"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  <KindIcon size={11} aria-hidden />
                  {label(t.kind!)}
                </span>
              </>
            )}
            {/* A task that is done or called off awaits nothing, however far
                into the past its dates have fallen. */}
            {date &&
              date < londonToday() &&
              t.status !== "done" &&
              t.status !== "cancelled" && <> · Needs attention</>}
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
                <button
                  type="button"
                  key={d.id}
                  className="doc-pill"
                  aria-label={`Open ${d.friendlyName}`}
                  title={`Open ${d.friendlyName}`}
                  onClick={() => setViewingDoc(d)}
                >
                  <FileText size={11} />
                  {d.friendlyName}
                </button>
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
    /**
     * The icon the Event log row carries for this kind, from the same map and in
     * the same box, so a call looks like a call in both lists. The kind in words
     * stays in the line under the title: the icon is never the only cue.
     */
    const KindIcon = eventKindIcon(note.kind);
    return (
      <article className="panel note-card" key={note.id}>
        <div className="section-heading">
          <div className="note-head">
            <span className="task-icon">
              <KindIcon size={18} />
            </span>
            <div>
              <h2>{note.title}</h2>
              <p>
                <span className="badge">{label(note.kind)}</span>
                {" · "}
                {formatTime(note.occurredAt)} · {names(note.createdBy)} ·{" "}
                {orgName(note.organisationId)}
              </p>
            </div>
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
                <button
                  type="button"
                  onClick={() => setViewingDoc(d)}
                  className="subtle-button"
                  title="View in app – close button returns you here"
                >
                  <Eye size={12} /> View
                </button>
                <button
                  type="button"
                  onClick={() => downloadDocument(d.id, d.originalName)}
                  className="subtle-button"
                  title="Download a copy – shows save dialog"
                >
                  <Download size={12} /> Download
                </button>
                <span className="badge">
                  {d.category ? label(d.category) : "No category"}
                </span>
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
    // Each directly linked live contact becomes its own tappable item; a note
    // or task by title, a project by name and a binned contact by name stay
    // plain text, so the line reads exactly as before when nothing is a
    // tappable contact. The decision is documentLinkItems, a pure function
    // with its own unit tests, like the popup's dial/copy helpers.
    const linkedItems = documentLinkItems(
      doc.id,
      data.documentLinks,
      data.organisations,
      data.deletedOrganisations,
      data.tasks,
      data.interactions,
      [...data.projects, ...data.deletedProjects],
    );
    return (
      <div className="task-row" key={doc.id}>
        <span className="task-icon">
          <FileText size={18} />
        </span>
        <div className="task-copy">
          <button
            className="record-title"
            onClick={() => edit("document", doc.id)}
          >
            {doc.friendlyName}
          </button>
          <p>
            {doc.category ? label(doc.category) : "No category"}
            {linkedItems.length > 0
              ? linkedItems.map((item, index) => (
                  <Fragment key={index}>
                    {" · "}
                    {item.kind === "contact" ? (
                      <button
                        type="button"
                        className="task-org"
                        aria-label={`Contact details for ${item.name}`}
                        title={`Contact details for ${item.name}`}
                        onClick={() => setContactQuickView(item.organisationId)}
                      >
                        <Users size={11} aria-hidden />
                        {item.name}
                      </button>
                    ) : (
                      item.value
                    )}
                  </Fragment>
                ))
              : " · No links yet – reusable across records"}
          </p>
          <p>
            <small>
              Uploaded on {formatDate(doc.createdAt)} by {names(doc.createdBy)}
            </small>
          </p>
        </div>
        <div className="row-actions">
          <button
            type="button"
            onClick={() => setViewingDoc(doc)}
            className="subtle-button"
            title="View in app – close button returns you here"
          >
            <Eye size={14} />
            View
          </button>
          <button
            type="button"
            onClick={() => downloadDocument(doc.id, doc.originalName)}
            className="subtle-button"
            title="Download a copy – shows save dialog (tries multiple methods)"
          >
            <Download size={14} />
            Download
          </button>
          <a
            href={`/api/documents/${doc.id}/download?download=1`}
            download={doc.originalName}
            rel="noopener noreferrer"
            className="subtle-button"
            title="Direct link – right-click Save link as if button fails (no popup needed)"
          >
            Direct
          </a>
          <button
            className="subtle-button"
            onClick={() => edit("document", doc.id)}
          >
            <Pencil size={14} />
            Edit
          </button>
          {historyButton("document", doc.id)}
          <button
            className="subtle-button"
            onClick={() => handleDelete("document", doc.id, doc.version)}
          >
            <Trash2 size={14} />
            Bin
          </button>
        </div>
      </div>
    );
  }

  function eventRow(event: Snapshot["interactions"][number]) {
    const contact = liveOrganisation(event.organisationId);
    const KindIcon = eventKindIcon(event.kind);
    return (
      <div className="task-row" key={event.id}>
        <span className="task-icon">
          <KindIcon size={18} />
        </span>
        <div className="task-copy">
          <button
            className="record-title"
            onClick={() => edit("interaction", event.id)}
          >
            {event.title}
          </button>
          <p>
            <span className="badge">{label(event.kind)}</span>
            {" · "}
            {contact ? (
              <button
                type="button"
                className="task-org"
                aria-label={`Contact details for ${contact.name}`}
                title={`Contact details for ${contact.name}`}
                onClick={() => setContactQuickView(contact.id)}
              >
                <Users size={11} aria-hidden />
                {contact.name}
              </button>
            ) : (
              orgName(event.organisationId)
            )}
            {" · "}
            {event.projectId
              ? (projectName(event.projectId) ?? "Linked project")
              : "No project"}
          </p>
          <p>
            <small>
              {formatTime(event.occurredAt)} · Recorded by{" "}
              {names(event.createdBy)}
            </small>
          </p>
        </div>
        <div className="row-actions">
          <button
            className="subtle-button"
            aria-label={`Edit event ${event.title}`}
            onClick={() => edit("interaction", event.id)}
          >
            <Pencil size={14} />
            Edit
          </button>
          {historyButton("interaction", event.id)}
          <button
            className="subtle-button"
            aria-label={`Delete event ${event.title}`}
            onClick={() => handleDelete("interaction", event.id, event.version)}
          >
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
                : view === "events"
                  ? "Event log"
                  : view === "bin"
                    ? "Recoverable bin"
                    : view === "finances"
                      ? "Estate finances"
                      : view === "backup"
                        ? "Backup & restore"
                        : "Documents";
  const binCount =
    data.deletedOrganisations.length +
    data.deletedInteractions.length +
    data.deletedTasks.length +
    data.deletedProjects.length +
    data.deletedDocuments.length +
    data.deletedFinanceRecords.length +
    data.deletedFinanceMovements.length +
    data.deletedTaskTemplates.length;

  const financeRecords = [...data.financeRecords]
    .filter((record) => {
      if (financeFilter !== "all" && record.kind !== financeFilter)
        return false;
      const q = financeQuery.trim().toLowerCase();
      if (!q) return true;
      return [
        record.title,
        record.detail,
        record.category ?? "",
        record.voidReason ?? "",
        record.organisationId ? orgName(record.organisationId) : "",
        record.projectId ? (projectName(record.projectId) ?? "") : "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    })
    .sort(
      (a, b) =>
        Number(!!a.voidedAt) - Number(!!b.voidedAt) ||
        (b.occurredOn ?? "").localeCompare(a.occurredOn ?? "") ||
        a.title.localeCompare(b.title),
    );

  const movementRecord = movementRecordId
    ? data.financeRecords.find((r) => r.id === movementRecordId)
    : undefined;

  const filteredDocs = [...data.documents].filter((d) => {
    const q = docQuery.toLowerCase();
    const matchesQuery =
      !q ||
      [d.friendlyName, d.originalName, d.category ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(q) ||
      getDocumentLinks(d.id).some((l) => {
        if (l.organisationId)
          return orgName(l.organisationId).toLowerCase().includes(q);
        if (l.interactionId)
          return (
            data.interactions.find((i) => i.id === l.interactionId)?.title ?? ""
          )
            .toLowerCase()
            .includes(q);
        if (l.taskId)
          return (data.tasks.find((t) => t.id === l.taskId)?.title ?? "")
            .toLowerCase()
            .includes(q);
        if (l.projectId)
          return (projectName(l.projectId) ?? "").toLowerCase().includes(q);
        return false;
      });
    const matchesCategory =
      docCategory === "all" || (d.category ?? "") === docCategory;
    return matchesQuery && matchesCategory;
  });

  const eventFiltersDefault =
    eventQuery.trim() === "" &&
    eventOrg === "all" &&
    eventProject === "all" &&
    eventKind === "all" &&
    eventRecorder === "all" &&
    eventOrder === "newest";
  const filteredEvents = [...data.interactions]
    .filter((event) => {
      const words = eventQuery
        .trim()
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean);
      const haystack = `${event.title} ${event.detail}`.toLowerCase();
      if (!words.every((word) => haystack.includes(word))) return false;
      if (eventOrg === "none") {
        if (event.organisationId) return false;
      } else if (eventOrg !== "all" && event.organisationId !== eventOrg) {
        return false;
      }
      if (eventProject === "none") {
        if (event.projectId) return false;
      } else if (eventProject !== "all" && event.projectId !== eventProject) {
        return false;
      }
      if (eventKind !== "all" && event.kind !== eventKind) return false;
      if (eventRecorder !== "all" && event.createdBy !== eventRecorder)
        return false;
      return true;
    })
    .sort((a, b) =>
      eventOrder === "newest"
        ? b.occurredAt.localeCompare(a.occurredAt) ||
          b.createdAt.localeCompare(a.createdAt)
        : a.occurredAt.localeCompare(b.occurredAt) ||
          a.createdAt.localeCompare(b.createdAt),
    );

  const resolvedContactCount = data.organisations.filter(
    (o) => o.status === "resolved",
  ).length;

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
            { id: "events", title: "Event log", icon: ScrollText },
            { id: "notes", title: "Unfiled notes", icon: Phone },
            { id: "projects", title: "Projects", icon: BookOpen },
            { id: "finances", title: "Estate finances", icon: Wallet },
            { id: "backup", title: "Backup & restore", icon: ArchiveRestore },
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
                      ? "Store a file once and link it to many organisations, notes, tasks, or projects. View opens in-app with a close button; Download shows a save dialog."
                      : view === "events"
                        ? "Every call, email, letter, web form and note in one place, most recent first. Search the title or detail, or filter by contact, project, type and who recorded it."
                        : view === "finances"
                          ? "Recorded facts in GBP, with no tax, debt-priority, or entitlement calculations. Assets, liabilities, cash movements, and personal amounts are summarised separately, and every correction keeps its history."
                          : view === "backup"
                            ? "Create an encrypted recovery copy, or validate one before restoring it."
                            : "Everything you need, shared between the two of you."}
              </p>
            </div>
            <div className="row-actions">
              {view !== "documents" && (
                <Button onClick={() => edit("interaction")}>
                  <Plus size={18} />
                  Quick note
                </Button>
              )}
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
                            {String(
                              r.after.name ??
                                r.after.title ??
                                r.after.friendlyName ??
                                r.entity,
                            )}
                            .
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
                {[...sections, financeSection].map((s) => (
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
              <div className="list-toolbar" style={{ flexWrap: "wrap" }}>
                <label className="search-label">
                  Find an organisation
                  <input
                    type="search"
                    placeholder="Search name, contact or reference…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
                <div
                  style={{
                    display: "flex",
                    gap: "12px",
                    alignItems: "flex-end",
                    flexWrap: "wrap",
                  }}
                >
                  <label style={{ maxWidth: "24ch" }}>
                    Sort
                    <select
                      value={contactSort}
                      onChange={(e) =>
                        setContactSort(
                          e.target.value as "added" | "name" | "newest",
                        )
                      }
                    >
                      {/* Added order is the list as it comes from the database,
                          and is what the list opens in. */}
                      <option value="added">Added order</option>
                      <option value="name">A&gt;Z</option>
                      <option value="newest">Newest first</option>
                    </select>
                  </label>
                  {/*
                    Off it says what pressing it will do; on it says what it is
                    doing and how many contacts that is.
                  */}
                  <Button
                    variant={hideResolved ? "default" : "outline"}
                    aria-pressed={hideResolved}
                    title={
                      hideResolved
                        ? `${resolvedContactCount} resolved contact${resolvedContactCount === 1 ? "" : "s"} hidden - activate to show them again`
                        : "Hide resolved contacts from the list"
                    }
                    aria-label={
                      hideResolved
                        ? `${resolvedContactCount} resolved contact${resolvedContactCount === 1 ? "" : "s"} hidden - activate to show them again`
                        : "Hide resolved contacts from the list"
                    }
                    onClick={() => setHideResolved(!hideResolved)}
                  >
                    {hideResolved ? (
                      <Eye size={16} aria-hidden />
                    ) : (
                      <EyeOff size={16} aria-hidden />
                    )}
                    {hideResolved
                      ? `Show resolved (${resolvedContactCount})`
                      : "Hide resolved"}
                  </Button>
                  <Button onClick={() => edit("organisation")}>
                    <Plus size={16} />
                    Add organisation
                  </Button>
                </div>
              </div>
              <div className="panel">
                {(() => {
                  // One pass over the contacts: the search first, then the
                  // resolved filter, then whichever sort is on. Both filters
                  // return fresh arrays, so sorting never reorders the
                  // snapshot the rest of the screen is reading.
                  const matches = data.organisations.filter((o) =>
                    [o.name, o.mainContact, o.reference]
                      .join(" ")
                      .toLowerCase()
                      .includes(query.toLowerCase()),
                  );
                  const visible = (
                    hideResolved
                      ? matches.filter((o) => o.status !== "resolved")
                      : matches
                  ).sort((a, b) => {
                    if (contactSort === "name")
                      return a.name.localeCompare(b.name);
                    if (contactSort === "newest")
                      return b.createdAt.getTime() - a.createdAt.getTime();
                    return 0;
                  });
                  return (
                    <>
                      {visible.map((o) => (
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
                                <>
                                  {" "}
                                  · {getLinkedDocumentsForOrg(o.id).length} docs
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
                            A bank, funeral director, or anyone you need to
                            contact.
                          </p>
                        </div>
                      )}
                      {data.organisations.length > 0 && !visible.length && (
                        <p className="empty-state">
                          {matches.length
                            ? "Every contact that matches is resolved, so the list is empty while resolved contacts are hidden."
                            : "No organisations match your search."}
                        </p>
                      )}
                    </>
                  );
                })()}
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
                <ContactFieldList contact={organisation} />
                {organisation.notes && (
                  <>
                    <div
                      className="section-heading"
                      style={{ padding: "0 24px 6px" }}
                    >
                      <h3>Notes</h3>
                    </div>
                    <p className="note-detail">{organisation.notes}</p>
                  </>
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
                <div
                  className="section-heading"
                  style={{ borderTop: "1px solid var(--border)" }}
                >
                  <h3>Documents</h3>
                  <div className="row-actions">
                    <Button
                      variant="outline"
                      onClick={() =>
                        setDocUpload({ organisationId: organisation.id })
                      }
                    >
                      <FileText size={14} />
                      Upload
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() =>
                        setLinkPicker({ organisationId: organisation.id })
                      }
                    >
                      <Link2 size={14} />
                      Link existing
                    </Button>
                  </div>
                </div>
                <div style={{ padding: "0 24px 16px" }}>
                  {getLinkedDocumentsForOrg(organisation.id).map((d) => {
                    const directLinks = getDirectLinksForOrg(
                      d.id,
                      organisation.id,
                    );
                    const allLinks = getDocumentLinks(d.id);
                    const isDirect = directLinks.length > 0;
                    const viaProject = allLinks.some(
                      (l) =>
                        l.projectId &&
                        organisationProjectIds(organisation.id).includes(
                          l.projectId,
                        ),
                    );
                    return (
                      <DocumentLinkRow
                        key={d.id}
                        doc={d}
                        directLinks={directLinks}
                        allLinks={allLinks}
                        isDirect={isDirect}
                        viaProject={viaProject}
                        onView={(doc) => setViewingDoc(doc)}
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
                    <p className="form-help">
                      No documents linked yet. Upload a certificate or link an
                      existing file – it can be reused elsewhere. If you linked
                      a document to a project that this organisation belongs to,
                      it will also appear here.
                    </p>
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
                <div className="row-actions">
                  <Button
                    variant="outline"
                    onClick={() => setTaskLinkPicker(organisation.id)}
                  >
                    <Link2 size={14} />
                    Link existing task
                  </Button>
                  <Button
                    onClick={() => edit("task", undefined, organisation.id)}
                  >
                    <Plus size={16} />
                    Add task
                  </Button>
                </div>
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
              <div className="filter-bar" style={{ flexWrap: "wrap" }}>
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
                {(() => {
                  const base = [...data.tasks].filter(
                    (t) =>
                      t.title.toLowerCase().includes(query.toLowerCase()) &&
                      (status === "all" ||
                        (status === "open"
                          ? !["done", "cancelled"].includes(t.status)
                          : t.status === status)) &&
                      (owner === "all" ||
                        (t.assignee ?? "") === owner ||
                        (owner !== "" && t.assignee === everyoneAssignee)),
                  );
                  const hidden = base.filter((t) =>
                    ["done", "scheduled"].includes(t.status),
                  ).length;
                  return (
                    <Button
                      variant={hideDoneScheduled ? "default" : "outline"}
                      aria-pressed={hideDoneScheduled}
                      title={
                        hideDoneScheduled
                          ? `${hidden} done or scheduled task${hidden === 1 ? "" : "s"} hidden - activate to show them again`
                          : "Hide done and scheduled tasks from the list"
                      }
                      aria-label={
                        hideDoneScheduled
                          ? `${hidden} done or scheduled task${hidden === 1 ? "" : "s"} hidden - activate to show them again`
                          : "Hide done and scheduled tasks from the list"
                      }
                      onClick={() => setHideDoneScheduled(!hideDoneScheduled)}
                    >
                      {hideDoneScheduled ? (
                        <Eye size={16} aria-hidden />
                      ) : (
                        <EyeOff size={16} aria-hidden />
                      )}
                      {hideDoneScheduled
                        ? `Show Done/Scheduled (${hidden})`
                        : "Hide Done/Scheduled"}
                    </Button>
                  );
                })()}
              </div>
              <section className="panel">
                {(() => {
                  const base = [...data.tasks].filter(
                    (t) =>
                      t.title.toLowerCase().includes(query.toLowerCase()) &&
                      (status === "all" ||
                        (status === "open"
                          ? !["done", "cancelled"].includes(t.status)
                          : t.status === status)) &&
                      (owner === "all" ||
                        (t.assignee ?? "") === owner ||
                        (owner !== "" && t.assignee === everyoneAssignee)),
                  );
                  const filtered = (
                    hideDoneScheduled
                      ? base.filter(
                          (t) => !["done", "scheduled"].includes(t.status),
                        )
                      : base
                  ).sort((a, b) =>
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
                const allTasks = data.tasks.filter((t) => t.projectId === p.id);
                const doneCount = allTasks.filter(
                  (t) => t.status === "done",
                ).length;
                const isCollapsed = !!collapsedProjects[p.id];
                const isHideDone = !!projectHideDone[p.id];
                const visibleTasks = isHideDone
                  ? allTasks.filter((t) => t.status !== "done")
                  : allTasks;
                return (
                  <section className="panel project-panel spaced" key={p.id}>
                    <div className="section-heading">
                      <div
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: "8px",
                        }}
                      >
                        <button
                          className="subtle-button"
                          aria-label={
                            isCollapsed
                              ? `Expand ${p.name}`
                              : `Collapse ${p.name}`
                          }
                          title={
                            isCollapsed
                              ? `Expand ${p.name}`
                              : `Collapse ${p.name}`
                          }
                          aria-expanded={!isCollapsed}
                          onClick={() =>
                            setCollapsedProjects((prev) => ({
                              ...prev,
                              [p.id]: !prev[p.id],
                            }))
                          }
                        >
                          {isCollapsed ? (
                            <ChevronDown size={16} aria-hidden />
                          ) : (
                            <ChevronUp size={16} aria-hidden />
                          )}
                        </button>
                        <div>
                          <h2>{p.name}</h2>
                          <p>
                            {allTasks.length} tasks · {linkedOrgs.length}{" "}
                            organisations · {docs.length} docs
                          </p>
                        </div>
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
                    {!isCollapsed && (
                      <>
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
                        <div
                          style={{
                            padding: "0 24px 12px",
                            borderTop: linkedOrgs.length
                              ? "1px solid var(--border)"
                              : "0",
                            display: "flex",
                            gap: "8px",
                            flexWrap: "wrap",
                          }}
                        >
                          {docs.map((d) => (
                            <span key={d.id} className="badge">
                              <FileText size={10} /> {d.friendlyName}
                              <button
                                type="button"
                                onClick={() => setViewingDoc(d)}
                                className="subtle-button"
                                style={{ marginLeft: "4px" }}
                                title="View in app"
                              >
                                <Eye size={10} />
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  downloadDocument(d.id, d.originalName)
                                }
                                className="subtle-button"
                                title="Download"
                              >
                                <Download size={10} />
                              </button>
                            </span>
                          ))}
                          <button
                            className="subtle-button"
                            onClick={() => setDocUpload({ projectId: p.id })}
                          >
                            <FileText size={12} /> Attach doc
                          </button>
                          <button
                            className="subtle-button"
                            onClick={() => setLinkPicker({ projectId: p.id })}
                          >
                            <Link2 size={12} /> Link existing
                          </button>
                        </div>
                        {data.taskTemplates.some(
                          (i) => i.projectId === p.id,
                        ) && (
                          <ProjectChecklist
                            projectId={p.id}
                            items={data.taskTemplates.filter(
                              (i) => i.projectId === p.id,
                            )}
                            tasks={allTasks}
                            onMessage={setMessage}
                            onError={setError}
                          />
                        )}
                        <div style={{ borderTop: "1px solid var(--border)" }}>
                          {allTasks.length > 0 && (
                            <div
                              style={{
                                padding: "8px 24px",
                                display: "flex",
                                justifyContent: "flex-end",
                              }}
                            >
                              <Button
                                variant={isHideDone ? "default" : "outline"}
                                aria-pressed={isHideDone}
                                title={
                                  isHideDone
                                    ? `${doneCount} done task${doneCount === 1 ? "" : "s"} hidden - activate to show them again`
                                    : "Hide done tasks from this project"
                                }
                                aria-label={
                                  isHideDone
                                    ? `${doneCount} done task${doneCount === 1 ? "" : "s"} hidden - activate to show them again`
                                    : "Hide done tasks from this project"
                                }
                                onClick={() =>
                                  setProjectHideDone((prev) => ({
                                    ...prev,
                                    [p.id]: !prev[p.id],
                                  }))
                                }
                              >
                                {isHideDone ? (
                                  <Eye size={16} aria-hidden />
                                ) : (
                                  <EyeOff size={16} aria-hidden />
                                )}
                                {isHideDone
                                  ? `Show Done (${doneCount})`
                                  : "Hide Done"}
                              </Button>
                            </div>
                          )}
                          {visibleTasks.map(taskRow)}
                          {allTasks.length === 0 && (
                            <p className="empty-state">
                              No tasks assigned to this project yet.
                            </p>
                          )}
                          {allTasks.length > 0 &&
                            visibleTasks.length === 0 &&
                            isHideDone && (
                              <p className="empty-state">
                                Every task in this project is done, so the list
                                is empty while done tasks are hidden.
                              </p>
                            )}
                        </div>
                      </>
                    )}
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
                <div
                  style={{
                    display: "flex",
                    gap: "12px",
                    flex: 1,
                    flexWrap: "wrap",
                  }}
                >
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
              <section className="panel">
                {filteredDocs.map(documentRow)}
                {!filteredDocs.length && (
                  <div className="empty-state">
                    <FolderOpen size={26} />
                    <h2>
                      {data.documents.length
                        ? "No matching documents"
                        : "Your document space"}
                    </h2>
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
          {view === "events" && (
            <>
              <div className="list-toolbar" style={{ flexWrap: "wrap" }}>
                <label className="search-label" style={{ maxWidth: "22ch" }}>
                  Search the event log
                  <input
                    type="search"
                    placeholder="Title or detail…"
                    value={eventQuery}
                    onChange={(e) => setEventQuery(e.target.value)}
                  />
                </label>
                <div
                  style={{
                    display: "flex",
                    gap: "12px",
                    alignItems: "flex-end",
                    flexWrap: "wrap",
                  }}
                >
                  <Button
                    variant="outline"
                    onClick={() =>
                      setEventOrder(
                        eventOrder === "newest" ? "oldest" : "newest",
                      )
                    }
                    title={
                      eventOrder === "newest"
                        ? "Order: most recent first — activate to show oldest first"
                        : "Order: oldest first — activate to show most recent first"
                    }
                    aria-label={
                      eventOrder === "newest"
                        ? "Order: most recent first — activate to show oldest first"
                        : "Order: oldest first — activate to show most recent first"
                    }
                  >
                    <ArrowUpDown size={16} aria-hidden />
                    {eventOrder === "newest" ? "Z>A" : "A>Z"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={resetEventFilters}
                    disabled={eventFiltersDefault}
                  >
                    Reset filters
                  </Button>
                  <Button onClick={() => edit("interaction")}>
                    <Plus size={16} />
                    Log interaction
                  </Button>
                </div>
              </div>
              <div className="filter-bar" style={{ flexWrap: "wrap" }}>
                <label style={{ maxWidth: "32ch" }}>
                  Organisation
                  <select
                    value={eventOrg}
                    onChange={(e) => setEventOrg(e.target.value)}
                  >
                    <option value="all">All organisations</option>
                    <option value="none">No organisation</option>
                    {data.organisations.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={{ maxWidth: "29ch" }}>
                  Project
                  <select
                    value={eventProject}
                    onChange={(e) => setEventProject(e.target.value)}
                  >
                    <option value="all">All projects</option>
                    <option value="none">No project</option>
                    {data.projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={{ maxWidth: "16ch", minWidth: 0 }}>
                  Type
                  <select
                    value={eventKind}
                    onChange={(e) => setEventKind(e.target.value)}
                  >
                    <option value="all">All types</option>
                    {["call", "email", "letter", "web_form", "note"].map(
                      (k) => (
                        <option key={k} value={k}>
                          {label(k)}
                        </option>
                      ),
                    )}
                  </select>
                </label>
                <label style={{ maxWidth: "15ch", minWidth: 0 }}>
                  Recorded by
                  <select
                    value={eventRecorder}
                    onChange={(e) => setEventRecorder(e.target.value)}
                  >
                    <option value="all">Everyone</option>
                    {users.map((u) => (
                      <option key={u} value={u}>
                        {names(u)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <section className="panel">
                {filteredEvents.map(eventRow)}
                {!filteredEvents.length && (
                  <div className="empty-state">
                    <ScrollText size={26} />
                    <h2>
                      {data.interactions.length
                        ? "No matching events"
                        : "Your event log is empty"}
                    </h2>
                    <p>
                      {data.interactions.length
                        ? "Adjust your search or filters."
                        : "Record a call, email, letter, web form or quick note and it will appear here, most recent first."}
                    </p>
                    {!data.interactions.length && (
                      <Button onClick={() => edit("interaction")}>
                        Log your first interaction
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
                      tasks, or documents. Document files stay until permanent
                      deletion. Financial records are never permanently deleted
                      – correct or void them instead, and they keep their
                      history.
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
                  permanent: true,
                },
                {
                  kind: "interaction" as const,
                  items: data.deletedInteractions,
                  label: "Notes & interactions",
                  permanent: true,
                },
                {
                  kind: "task" as const,
                  items: data.deletedTasks,
                  label: "Tasks",
                  permanent: true,
                },
                {
                  kind: "project" as const,
                  items: data.deletedProjects,
                  label: "Projects",
                  permanent: true,
                },
                {
                  kind: "document" as const,
                  items: data.deletedDocuments,
                  label: "Documents",
                  permanent: true,
                },
                {
                  kind: "finance_record" as const,
                  items: data.deletedFinanceRecords,
                  label: "Financial records",
                  permanent: false,
                },
                {
                  kind: "finance_movement" as const,
                  items: data.deletedFinanceMovements,
                  label: "Payments & reimbursements",
                  permanent: false,
                },
                {
                  kind: "template_item" as const,
                  items: data.deletedTaskTemplates,
                  label: "Checklist suggestions",
                  permanent: true,
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
                        ) : group.kind === "finance_record" ? (
                          <Wallet size={16} />
                        ) : group.kind === "finance_movement" ? (
                          <PoundSterling size={16} />
                        ) : group.kind === "template_item" ? (
                          <ListChecks size={16} />
                        ) : (
                          <BookOpen size={16} />
                        )}
                      </span>
                      <div className="task-copy">
                        <strong>
                          {group.kind === "finance_movement"
                            ? `${formatPence(item.amountPence)} · ${financeRecordName(item.recordId)}`
                            : (item.name ?? item.title ?? item.friendlyName)}
                        </strong>
                        <p>
                          {group.kind === "finance_movement"
                            ? (item.detail ??
                              `Recorded against ${financeRecordName(item.recordId)}`)
                            : item.detail
                              ? item.detail.slice(0, 120)
                              : item.reference ||
                                item.mainContact ||
                                item.originalName ||
                                ""}
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
                        {group.permanent ? (
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
                        ) : (
                          <span className="form-help">
                            Correct or void instead – history is kept
                          </span>
                        )}
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
          {view === "backup" && <BackupPanel />}
          {view === "finances" && (
            <>
              <div className="finance-grid">
                <section className="panel">
                  <div className="section-heading">
                    <div>
                      <h2>Assets and liabilities</h2>
                      <p>What the estate owns and owes, kept separate.</p>
                    </div>
                  </div>
                  <dl className="money-list">
                    <div className="money-row">
                      <dt>Assets – estimated value</dt>
                      <dd>{formatPence(finance.assets.estimatedPence)}</dd>
                    </div>
                    <div className="money-row">
                      <dt>Sale proceeds received</dt>
                      <dd>{formatPence(finance.assets.proceedsPence)}</dd>
                    </div>
                    <div className="money-row">
                      <dt>Estimated still to realise</dt>
                      <dd>{formatPence(finance.assets.stillToRealisePence)}</dd>
                    </div>
                    {finance.assets.aboveEstimatePence > 0 && (
                      <div className="money-row">
                        <dt>Proceeds above estimate</dt>
                        <dd>
                          {formatPence(finance.assets.aboveEstimatePence)}
                        </dd>
                      </div>
                    )}
                    {finance.assets.unvaluedCount > 0 && (
                      <div className="money-row">
                        <dt>Assets not valued yet</dt>
                        <dd>{finance.assets.unvaluedCount}</dd>
                      </div>
                    )}
                    <div className="money-row money-split">
                      <dt>Liabilities – recorded</dt>
                      <dd>{formatPence(finance.liabilities.owedPence)}</dd>
                    </div>
                    <div className="money-row">
                      <dt>Paid so far</dt>
                      <dd>{formatPence(finance.liabilities.paidPence)}</dd>
                    </div>
                    <div className="money-row money-total">
                      <dt>Outstanding</dt>
                      <dd>
                        {formatPence(finance.liabilities.outstandingPence)}
                      </dd>
                    </div>
                  </dl>
                </section>
                <section className="panel">
                  <div className="section-heading">
                    <div>
                      <h2>Cash movements</h2>
                      <p>
                        Estate money in and out. Personal payments are not
                        estate cash.
                      </p>
                    </div>
                  </div>
                  <dl className="money-list">
                    <div className="money-row">
                      <dt>Money in</dt>
                      <dd>{formatPence(finance.cash.moneyInPence)}</dd>
                    </div>
                    <div className="money-row money-sub">
                      <dt>Income received</dt>
                      <dd>{formatPence(finance.cash.incomePence)}</dd>
                    </div>
                    <div className="money-row money-sub">
                      <dt>Sale proceeds</dt>
                      <dd>{formatPence(finance.cash.proceedsPence)}</dd>
                    </div>
                    <div className="money-row money-split">
                      <dt>Money out</dt>
                      <dd>{formatPence(finance.cash.moneyOutPence)}</dd>
                    </div>
                    <div className="money-row money-sub">
                      <dt>Estate expenses</dt>
                      <dd>
                        {formatPence(finance.cash.expensesFromEstatePence)}
                      </dd>
                    </div>
                    <div className="money-row money-sub">
                      <dt>Payments against liabilities</dt>
                      <dd>
                        {formatPence(finance.cash.liabilityPaymentsPence)}
                      </dd>
                    </div>
                    <div className="money-row money-sub">
                      <dt>Reimbursements paid</dt>
                      <dd>{formatPence(finance.cash.reimbursedPence)}</dd>
                    </div>
                    <div className="money-row money-sub">
                      <dt>Distributions paid</dt>
                      <dd>{formatPence(finance.cash.distributionsPence)}</dd>
                    </div>
                    <div className="money-row money-total">
                      <dt>Net movement</dt>
                      <dd>{formatPence(finance.cash.netPence)}</dd>
                    </div>
                  </dl>
                  {finance.cash.personallyFundedPence > 0 && (
                    <p className="form-help">
                      {formatPence(finance.cash.personallyFundedPence)} was paid
                      personally and is tracked separately. Reimbursing it moves
                      estate money – it never creates a second expense.
                    </p>
                  )}
                </section>
                <section className="panel">
                  <div className="section-heading">
                    <div>
                      <h2>Awaiting reimbursement</h2>
                      <p>
                        Money personally paid that the estate still owes back.
                      </p>
                    </div>
                  </div>
                  <dl className="money-list">
                    {finance.reimbursements.map((line) => (
                      <div className="money-row" key={line.user}>
                        <dt>
                          {names(line.user)}
                          <small>
                            {" "}
                            {line.expenseCount === 0
                              ? "nothing paid personally"
                              : `${line.expenseCount} expense${line.expenseCount > 1 ? "s" : ""}`}
                          </small>
                        </dt>
                        <dd>
                          {line.owedPence > 0
                            ? `${formatPence(line.owedPence)} owed`
                            : "Nothing owed"}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <p className="form-help">
                    Settling a reimbursement records money already spent. The
                    original expense is never counted twice.
                  </p>
                </section>
              </div>

              <div className="list-toolbar">
                <label className="search-label">
                  Find a record
                  <input
                    type="search"
                    placeholder="Search title, category, or notes…"
                    value={financeQuery}
                    onChange={(e) => setFinanceQuery(e.target.value)}
                  />
                </label>
                <label>
                  Type
                  <select
                    value={financeFilter}
                    onChange={(e) =>
                      setFinanceFilter(
                        e.target.value as "all" | (typeof financeKinds)[number],
                      )
                    }
                  >
                    <option value="all">All types</option>
                    {financeKinds.map((k) => (
                      <option key={k} value={k}>
                        {label(k)}
                      </option>
                    ))}
                  </select>
                </label>
                <Button onClick={() => setFinanceEditor({})}>
                  <Plus size={16} />
                  Add financial record
                </Button>
              </div>

              <div className="csv-bar">
                <span>Download for a spreadsheet:</span>
                <a
                  className="subtle-button"
                  href="/api/finances/export?view=inventory"
                >
                  <Download size={14} /> Assets &amp; liabilities
                </a>
                <a
                  className="subtle-button"
                  href="/api/finances/export?view=cash"
                >
                  <Download size={14} /> Cash movements
                </a>
                <a
                  className="subtle-button"
                  href="/api/finances/export?view=reimbursements"
                >
                  <Download size={14} /> Reimbursements
                </a>
                <small>
                  CSV files exclude voided and binned records, and protect text
                  from spreadsheet formulas.
                </small>
              </div>

              <section className="panel">
                {financeRecords.map(financeRow)}
                {!financeRecords.length && (
                  <div className="empty-state">
                    <Wallet size={26} />
                    <h2>Estate finances, recorded as facts</h2>
                    <p>
                      Start with what the estate owns, or with an expense you
                      have already paid. Amounts are in pounds, with no tax,
                      debt-priority, or entitlement calculations.
                    </p>
                    <Button onClick={() => setFinanceEditor({})}>
                      Add the first record
                    </Button>
                  </div>
                )}
                {data.financeRecords.length > 0 && !financeRecords.length && (
                  <p className="empty-state">
                    No records match that search or type.
                  </p>
                )}
              </section>

              {finance.reimbursableExpenses.some((e) => e.owedPence > 0) && (
                <section className="panel spaced">
                  <div className="section-heading">
                    <div>
                      <h2>Personally paid expenses</h2>
                      <p>
                        Part payments are fine. Reimbursing settles money owed,
                        and never creates a second expense.
                      </p>
                    </div>
                    <span className="badge">
                      {formatPence(
                        finance.reimbursements.reduce(
                          (total, line) => total + line.owedPence,
                          0,
                        ),
                      )}{" "}
                      owed
                    </span>
                  </div>
                  {finance.reimbursableExpenses.map((expense) => (
                    <div className="task-row" key={expense.id}>
                      <span className="task-icon">
                        <HandCoins size={17} />
                      </span>
                      <div className="task-copy">
                        <strong>{expense.title}</strong>
                        <p>
                          {formatPence(expense.amountPence)} paid by{" "}
                          {names(expense.fundedBy)}
                          {expense.reimbursedPence > 0 &&
                            ` · ${formatPence(expense.reimbursedPence)} reimbursed`}
                          {expense.owedPence > 0
                            ? ` · ${formatPence(expense.owedPence)} still owed`
                            : " · settled"}
                        </p>
                        <p>
                          {expense.organisationId
                            ? orgName(expense.organisationId)
                            : "No organisation"}
                          {expense.projectId && projectName(expense.projectId)
                            ? ` · ${projectName(expense.projectId)}`
                            : ""}
                        </p>
                      </div>
                      <div className="row-actions">
                        {expense.owedPence > 0 && (
                          <button
                            className="subtle-button"
                            onClick={() => setMovementRecordId(expense.id)}
                          >
                            <PoundSterling size={14} />
                            Reimburse
                          </button>
                        )}
                        <button
                          className="subtle-button"
                          onClick={() => setFinanceEditor({ id: expense.id })}
                        >
                          <Pencil size={14} />
                          Edit
                        </button>
                      </div>
                    </div>
                  ))}
                </section>
              )}
            </>
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
          onViewDocument={setViewingDoc}
          onOpenInteraction={(initial) =>
            setEditor({ kind: "interaction", initial })
          }
          onClose={() => setEditor(null)}
          onSaved={(id, newContactName) => {
            setMessage(
              newContactName
                ? `Saved. ${newContactName} is now in Contacts, and this record is linked to it.`
                : "Saved. Your shared workspace is up to date.",
            );
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
            setMessage(
              "Document uploaded and linked. Stored once, reusable everywhere.",
            );
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
      {viewingDoc && (
        <DocumentViewerDialog
          doc={viewingDoc}
          onClose={() => setViewingDoc(null)}
        />
      )}
      {taskLinkPicker &&
        (() => {
          const organisation = data.organisations.find(
            (o) => o.id === taskLinkPicker,
          );
          return organisation ? (
            <TaskLinkPicker
              data={data}
              organisation={organisation}
              onClose={() => setTaskLinkPicker(null)}
              onLinked={(title) => {
                setMessage(
                  `“${title}” is now linked to ${organisation.name}. Nothing else about the task changed.`,
                );
                setTaskLinkPicker(null);
                router.refresh();
              }}
              onError={setError}
              onRefresh={() => router.refresh()}
            />
          ) : null;
        })()}
      {contactQuickView &&
        (() => {
          const contact = data.organisations.find(
            (o) => o.id === contactQuickView,
          );
          return contact ? (
            <ContactQuickViewDialog
              contact={contact}
              onClose={() => setContactQuickView(null)}
              onOpenContact={() => {
                navigate("contacts");
                setSelected(contact.id);
                setContactQuickView(null);
              }}
              closeLabel={
                view === "documents"
                  ? "Back to documents"
                  : view === "events"
                    ? "Back to the event log"
                    : "Back to the task"
              }
            />
          ) : null;
        })()}
      {financeEditor && (
        <FinanceRecordForm
          editor={financeEditor}
          data={data}
          users={users}
          onClose={() => setFinanceEditor(null)}
          onSaved={(id, note) => {
            setMessage(
              note
                ? `Saved. The totals below reflect the new figure.${note}`
                : "Saved. The totals below reflect the new figure.",
            );
            setView("finances");
            setFinanceEditor(null);
            router.refresh();
          }}
          onAttachDocument={(recordId) =>
            setDocUpload({ financeRecordId: recordId })
          }
          onLinkExisting={(recordId) =>
            setLinkPicker({ financeRecordId: recordId })
          }
        />
      )}
      {movementRecord && (
        <FinanceMovementDialog
          record={movementRecord}
          movements={movementsFor(movementRecord.id)}
          documents={linkedDocsForFinance(movementRecord.id)}
          onClose={() => setMovementRecordId(null)}
          onChanged={(text) => {
            setMessage(text);
            router.refresh();
          }}
          onVoid={(target, movement) =>
            setVoidTarget({
              target,
              id: target === "record" ? movementRecord.id : movement!.id,
              version:
                target === "record"
                  ? movementRecord.version
                  : movement!.version,
              reinstating:
                target === "record"
                  ? !!movementRecord.voidedAt
                  : !!movement!.voidedAt,
              title:
                target === "record"
                  ? movementRecord.title
                  : `${formatPence(movement!.amountPence)} on ${movement!.occurredOn}`,
            })
          }
          onAttach={() => setDocUpload({ financeRecordId: movementRecord.id })}
          onLinkExisting={() =>
            setLinkPicker({ financeRecordId: movementRecord.id })
          }
          onUnlink={async (linkId) => {
            const result = await unlinkDocument(linkId);
            if (!result.ok) setError(result.error);
            else {
              setMessage(
                "Link removed. The document and its other links are untouched.",
              );
              router.refresh();
            }
          }}
        />
      )}
      {voidTarget && (
        <FinanceVoidDialog
          title={voidTarget.title}
          reinstating={voidTarget.reinstating}
          onClose={() => setVoidTarget(null)}
          onConfirm={confirmVoid}
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
  onView,
}: {
  doc: Snapshot["documents"][number];
  directLinks: Snapshot["documentLinks"];
  allLinks: Snapshot["documentLinks"];
  isDirect: boolean;
  viaProject?: boolean;
  onUnlink: (linkId: string) => void;
  onView: (doc: Snapshot["documents"][number]) => void;
}) {
  return (
    <div className="doc-inline-row">
      <FileText size={14} />
      <span style={{ fontWeight: 600 }}>{doc.friendlyName}</span>
      <span className="badge">
        {doc.category ? label(doc.category) : "No category"}
      </span>
      <span className="badge">{formatSize(doc.size)}</span>
      {!isDirect && viaProject && <span className="badge">via project</span>}
      <div className="row-actions" style={{ marginLeft: "auto", gap: "6px" }}>
        <button
          type="button"
          onClick={() => onView(doc)}
          className="subtle-button"
          title="View in app – close button returns you here"
        >
          <Eye size={12} /> View
        </button>
        <button
          type="button"
          onClick={() => downloadDocument(doc.id, doc.originalName)}
          className="subtle-button"
          title="Download a copy – shows save dialog"
        >
          <Download size={12} /> Download
        </button>
        {directLinks.map((l) => (
          <button
            key={l.id}
            className="subtle-button danger"
            onClick={() => onUnlink(l.id)}
          >
            <X size={12} />
            Remove link
          </button>
        ))}
        {!isDirect && (
          <span className="form-help" style={{ fontSize: "10px" }}>
            Linked via{" "}
            {allLinks
              .map((l) =>
                l.projectId
                  ? `project ${l.projectId}`
                  : l.taskId
                    ? "task"
                    : l.interactionId
                      ? "note"
                      : "other",
              )
              .join(", ")}
          </span>
        )}
      </div>
    </div>
  );
}

function DocumentViewerDialog({
  doc,
  onClose,
}: {
  doc: Snapshot["documents"][number];
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const isImage = doc.mimeType.startsWith("image/");
  const isPdf = doc.mimeType === "application/pdf";
  const src = `/api/documents/${doc.id}/download`;
  return (
    <dialog
      ref={dialog}
      className="record-dialog"
      style={{ maxWidth: "90vw", width: "900px" }}
      aria-label={`Viewing ${doc.friendlyName}`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="dialog-heading">
        <div>
          <p className="eyebrow">VIEWING DOCUMENT</p>
          <h2>{doc.friendlyName}</h2>
          <p className="form-help" style={{ margin: 0 }}>
            {doc.category ? label(doc.category) : "No category"} · Uploaded on{" "}
            {formatDate(doc.createdAt)} by {doc.createdBy.split("@")[0]}
          </p>
        </div>
        <button
          type="button"
          className="icon-button"
          onClick={onClose}
          aria-label="Close viewer"
        >
          <X size={21} />
        </button>
      </div>
      <div
        style={{
          padding: "16px",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          alignItems: "center",
          background: "var(--muted, #f7f7f5)",
        }}
      >
        {isImage ? (
          <img
            src={src}
            alt={doc.friendlyName}
            style={{
              maxWidth: "100%",
              maxHeight: "70vh",
              objectFit: "contain",
              borderRadius: "8px",
              boxShadow: "0 2px 12px rgba(0,0,0,0.12)",
            }}
          />
        ) : isPdf ? (
          <iframe
            src={src}
            title={doc.friendlyName}
            style={{
              width: "100%",
              height: "70vh",
              border: "1px solid var(--border)",
              borderRadius: "8px",
              background: "white",
            }}
          />
        ) : (
          <div style={{ width: "100%" }}>
            <p className="form-help" style={{ marginBottom: "12px" }}>
              Preview not available for this file type ({doc.mimeType}). You can
              download it or open in a new tab.
            </p>
            <iframe
              src={src}
              title={doc.friendlyName}
              style={{
                width: "100%",
                height: "50vh",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                background: "white",
              }}
            />
          </div>
        )}
      </div>
      <div
        style={{
          padding: "0 16px",
          display: "flex",
          flexDirection: "column",
          gap: "4px",
        }}
      >
        <p className="form-help" style={{ margin: 0, fontSize: "11px" }}>
          If download doesn&apos;t start, use direct link (right-click → Save
          as). In Arena preview, popups are blocked (allow-popups not set) so
          window.open fails – this is preview-only, production will work
          normally:{" "}
          <a
            href={`/api/documents/${doc.id}/download?download=1`}
            download={doc.originalName}
            // No target=_blank to avoid needing allow-popups in sandboxed preview
            rel="noopener noreferrer"
            style={{ textDecoration: "underline" }}
            onClick={(e) => {
              console.log("[download] direct anchor clicked");
              // Don't prevent default – let native download happen, especially for right-click Save as
            }}
          >
            {doc.originalName}
          </a>
        </p>
        <p className="form-help" style={{ margin: 0, fontSize: "11px" }}>
          URL: <code>{`/api/documents/${doc.id}/download?download=1`}</code> –
          production is not sandboxed, so save dialog works. Preview iframe
          needs allow-downloads, not allow-popups.
        </p>
      </div>
      <div className="form-actions" style={{ justifyContent: "space-between" }}>
        <Button type="button" variant="outline" onClick={onClose}>
          <X size={14} /> Close – back to workspace
        </Button>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <Button
            type="button"
            variant="outline"
            onClick={() => viewDocument(doc.id)}
          >
            <Eye size={14} /> Open in new tab (may be blocked in preview – use
            in-app view)
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => downloadDocument(doc.id, doc.originalName)}
          >
            <Download size={14} /> Download – save dialog
          </Button>
          <a
            href={`/api/documents/${doc.id}/download?download=1`}
            download={doc.originalName}
            rel="noopener noreferrer"
            className="button button-outline"
            style={{
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "14px",
            }}
          >
            <Download size={14} /> Direct link (no popup)
          </a>
        </div>
      </div>
    </dialog>
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
  const [linkKind, setLinkKind] = useState<
    "none" | "organisation" | "interaction" | "task" | "project" | "finance"
  >(
    initial.organisationId
      ? "organisation"
      : initial.interactionId
        ? "interaction"
        : initial.taskId
          ? "task"
          : initial.projectId
            ? "project"
            : initial.financeRecordId
              ? "finance"
              : "none",
  );
  const [linkId, setLinkId] = useState(
    initial.organisationId ??
      initial.interactionId ??
      initial.taskId ??
      initial.projectId ??
      initial.financeRecordId ??
      "",
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
    } else if (initial.financeRecordId) {
      setLinkKind("finance");
      setLinkId(initial.financeRecordId);
    }
  }, [initial]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      onError("Choose a file first");
      return;
    }
    const sizeProblem = fileTooLarge(file);
    if (sizeProblem) {
      onError(sizeProblem);
      return;
    }
    if (linkKind !== "none" && !linkId) {
      onError("Choose where to link it, or select No link");
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set(
        "friendlyName",
        friendlyName || file.name.replace(/\.[^/.]+$/, ""),
      );
      if (category) fd.set("category", category);
      if (linkKind === "organisation" && linkId)
        fd.set("organisationId", linkId);
      if (linkKind === "interaction" && linkId) fd.set("interactionId", linkId);
      if (linkKind === "task" && linkId) fd.set("taskId", linkId);
      if (linkKind === "project" && linkId) fd.set("projectId", linkId);
      if (linkKind === "finance" && linkId) fd.set("financeRecordId", linkId);

      const res = await postDocumentUpload(fd);
      if (!res.ok) {
        console.warn(`[upload] server returned error: ${res.error}`);
        onError(res.error || "Upload failed");
      } else if (res.warning) {
        onError(res.warning);
      } else if (res.id) {
        onUploaded(res.id);
      } else {
        onError("Upload succeeded but no id returned – check logs");
      }
    } catch (err) {
      console.error("[upload] failed", err);
      onError(uploadErrorMessage(err));
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
        onClose();
      }}
    >
      <form onSubmit={submit}>
        <div className="dialog-heading">
          <div>
            <p className="eyebrow">STORE ONCE, LINK MANY TIMES</p>
            <h2>Upload document</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            disabled={busy}
          >
            <X size={21} />
          </button>
        </div>
        <fieldset disabled={busy} className="form-fields">
          <label>
            File <small>PDF, image, or text – max 20 MB</small>
            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.tiff,.txt,image/*,application/pdf"
              required
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setFile(f);
                if (f && !friendlyName)
                  setFriendlyName(f.name.replace(/\.[^/.]+$/, ""));
              }}
            />
          </label>
          <label>
            Friendly name
            <input
              value={friendlyName}
              onChange={(e) => setFriendlyName(e.target.value)}
              required
              maxLength={200}
              placeholder="Death certificate – Bank1"
            />
          </label>
          <label>
            Category
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
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
            In production files go to{" "}
            <code>/mnt/user/appdata/estate-organiser/documents</code> (container
            path <code>/data/documents</code>). Demo mode uses{" "}
            <code>./data/demo-documents</code>. Storage names are generated
            safely – original name is kept for download. View opens in-app with
            a close button; Download shows a save dialog.
          </p>
          <fieldset className="follow-up">
            <legend>Link to (optional – you can link later too)</legend>
            <label>
              Link kind
              <select
                value={linkKind}
                onChange={(e) => {
                  const k = e.target.value as any;
                  setLinkKind(k);
                  setLinkId("");
                }}
              >
                <option value="none">No link yet – just store</option>
                <option value="organisation">Organisation (contact)</option>
                <option value="interaction">Interaction / Note</option>
                <option value="task">Task</option>
                <option value="project">Project</option>
                <option value="finance">
                  Financial record (receipt or invoice)
                </option>
              </select>
            </label>
            {linkKind === "organisation" && (
              <label>
                Organisation
                <select
                  value={linkId}
                  onChange={(e) => setLinkId(e.target.value)}
                  required
                >
                  <option value="">Choose organisation…</option>
                  {data.organisations.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {linkKind === "interaction" && (
              <label>
                Interaction / Note
                <select
                  value={linkId}
                  onChange={(e) => setLinkId(e.target.value)}
                  required
                >
                  <option value="">Choose note…</option>
                  {data.interactions.slice(0, 100).map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.title} – {n.detail.slice(0, 40)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {linkKind === "task" && (
              <label>
                Task
                <select
                  value={linkId}
                  onChange={(e) => setLinkId(e.target.value)}
                  required
                >
                  <option value="">Choose task…</option>
                  {data.tasks.slice(0, 100).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {linkKind === "project" && (
              <label>
                Project
                <select
                  value={linkId}
                  onChange={(e) => setLinkId(e.target.value)}
                  required
                >
                  <option value="">Choose project…</option>
                  {data.projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {linkKind === "finance" && (
              <label>
                Financial record
                <select
                  value={linkId}
                  onChange={(e) => setLinkId(e.target.value)}
                  required
                >
                  <option value="">Choose financial record…</option>
                  {data.financeRecords.map((r) => (
                    <option key={r.id} value={r.id}>
                      {label(r.kind)} – {r.title}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <p className="form-help">
              Pick exactly one place here – after upload you can link the same
              file to many records from the Documents list. This fixes the
              earlier issue where picking multiple caused the link to fail.
            </p>
          </fieldset>
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
            {busy ? "Uploading…" : "Upload"}
          </Button>
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
  const [linkKind, setLinkKind] = useState<
    "organisation" | "interaction" | "task" | "project" | "finance"
  >(
    initial.organisationId
      ? "organisation"
      : initial.interactionId
        ? "interaction"
        : initial.taskId
          ? "task"
          : initial.projectId
            ? "project"
            : initial.financeRecordId
              ? "finance"
              : "organisation",
  );
  const [linkId, setLinkId] = useState(
    initial.organisationId ??
      initial.interactionId ??
      initial.taskId ??
      initial.projectId ??
      initial.financeRecordId ??
      "",
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
    try {
      const input: any = { documentId: docId };
      if (linkKind === "organisation") input.organisationId = linkId;
      if (linkKind === "interaction") input.interactionId = linkId;
      if (linkKind === "task") input.taskId = linkId;
      if (linkKind === "project") input.projectId = linkId;
      if (linkKind === "finance") input.financeRecordId = linkId;
      const res = await linkDocument(input);
      if (!res.ok) onError(res.error);
      else onLinked();
    } catch (err) {
      console.error("[link] failed", err);
      onError(err instanceof Error ? err.message : "Unable to link document");
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
        onClose();
      }}
    >
      <form onSubmit={submit}>
        <div className="dialog-heading">
          <div>
            <p className="eyebrow">ONE FILE, MANY PLACES</p>
            <h2>Link document</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            disabled={busy}
          >
            <X size={21} />
          </button>
        </div>
        <fieldset disabled={busy} className="form-fields">
          <label>
            Document
            <select
              value={docId}
              onChange={(e) => setDocId(e.target.value)}
              required
            >
              <option value="">Choose document</option>
              {data.documents.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.friendlyName} – {d.originalName}
                </option>
              ))}
            </select>
          </label>
          <p className="form-help">
            Removing a link never deletes the file or its other links. Store
            once, reuse everywhere. View opens in-app with close button;
            Download shows save dialog.
          </p>
          <label>
            Link to what?
            <select
              value={linkKind}
              onChange={(e) => {
                setLinkKind(e.target.value as any);
                setLinkId("");
              }}
            >
              <option value="organisation">Organisation (contact)</option>
              <option value="interaction">Interaction / Note</option>
              <option value="task">Task</option>
              <option value="project">Project</option>
              <option value="finance">
                Financial record (receipt or invoice)
              </option>
            </select>
          </label>
          {linkKind === "organisation" && (
            <label>
              Organisation
              <select
                value={linkId}
                onChange={(e) => setLinkId(e.target.value)}
                required
              >
                <option value="">Pick organisation…</option>
                {data.organisations.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {linkKind === "interaction" && (
            <label>
              Interaction / Note
              <select
                value={linkId}
                onChange={(e) => setLinkId(e.target.value)}
                required
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
          {linkKind === "task" && (
            <label>
              Task
              <select
                value={linkId}
                onChange={(e) => setLinkId(e.target.value)}
                required
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
          {linkKind === "project" && (
            <label>
              Project
              <select
                value={linkId}
                onChange={(e) => setLinkId(e.target.value)}
                required
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
          {linkKind === "finance" && (
            <label>
              Financial record
              <select
                value={linkId}
                onChange={(e) => setLinkId(e.target.value)}
                required
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
          {linkId && (
            <p className="form-help">
              Will link document to{" "}
              {linkKind === "finance" ? "financial record" : linkKind}:{" "}
              {linkKind === "finance"
                ? (data.financeRecords.find((r) => r.id === linkId)?.title ??
                  linkId)
                : linkId}
            </p>
          )}
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
            {busy ? "Linking…" : "Link"}
          </Button>
        </div>
      </form>
    </dialog>
  );
}

/**
 * The five contact fields — Main contact, Phone numbers, Email, Account /
 * reference and Map link — with tap-to-dial, tap-to-open and copy. The quick
 * popup on a task, document or event row and the contact screen itself both
 * render this one component, so the same information reads the same in both
 * places: same labels, same order, "Not added" for an empty field, and
 * "Copied" only when the browser confirmed the write.
 *
 * Everything here is already in the browser in `data.organisations`, so it
 * costs no request, no server action and no migration. Notes are deliberately
 * not in the popup: reading them is a reason to open the full contact, one
 * tap away.
 */
function ContactFieldList({
  contact,
}: {
  contact: Snapshot["organisations"][number];
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const [clipboardBlocked, setClipboardBlocked] = useState(false);
  // The confirmation is transient by nature: better it clears itself than go on
  // claiming something about a value copied several minutes ago.
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(null), 4000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function copy(key: string, value: string) {
    setClipboardBlocked(false);
    // "Copied" only once the browser has actually taken the text.
    if (await copyText(value)) setCopied(key);
    else setClipboardBlocked(true);
  }
  function copyButton(key: string, value: string, what: string) {
    return (
      <button
        type="button"
        className="subtle-button contact-copy"
        onClick={() => copy(key, value)}
        aria-label={`Copy ${what}`}
      >
        {copied === key ? (
          <Check size={13} aria-hidden />
        ) : (
          <Copy size={13} aria-hidden />
        )}
        {copied === key ? "Copied" : "Copy"}
      </button>
    );
  }
  /** One field, listed as the contact screen lists it. */
  function fieldRow(key: string, caption: string, value: string | null) {
    return (
      <div className="contact-quick-item">
        <dt>{caption}</dt>
        <dd>
          {canCopy(value) ? (
            <>
              <span className="contact-quick-value">{value}</span>
              {copyButton(key, value as string, caption.toLowerCase())}
            </>
          ) : (
            <span className="contact-quick-empty">Not added</span>
          )}
        </dd>
      </div>
    );
  }
  const numbers = contact.phoneNumbers.map((n) => n.trim()).filter(Boolean);
  /**
   * Only ever a reply to the copy the user just tapped: confirmed, or refused
   * with a way round it. No idle help line — a tappable number explains
   * itself, and a line of text where nothing is happening is noise.
   */
  const copyState = clipboardBlocked
    ? "Your browser did not let the app copy. Select the text and copy it yourself."
    : copied
      ? "Copied – paste it wherever you need it."
      : null;

  return (
    <div className="form-fields">
      <dl className="contact-quick-list">
        {fieldRow("main", "Main contact", contact.mainContact)}
        <div className="contact-quick-item">
          <dt>Phone numbers</dt>
          <dd className="contact-quick-phones">
            {numbers.length ? (
              numbers.map((number, index) => {
                const href = telHref(number);
                const many = numbers.length > 1;
                return (
                  <span
                    className="contact-quick-phone"
                    key={`${index}-${number}`}
                  >
                    {href ? (
                      <a
                        className="contact-link"
                        href={href}
                        aria-label={`Call ${number}`}
                      >
                        <Phone size={13} aria-hidden />
                        {number}
                      </a>
                    ) : (
                      <span className="contact-quick-value">{number}</span>
                    )}
                    {copyButton(
                      `phone-${index}`,
                      number,
                      many ? `phone number ${index + 1}` : "phone number",
                    )}
                  </span>
                );
              })
            ) : (
              <span className="contact-quick-empty">Not added</span>
            )}
          </dd>
        </div>
        {fieldRow("email", "Email", contact.email)}
        {fieldRow("reference", "Account / reference", contact.reference)}
        <div className="contact-quick-item">
          <dt>Map link</dt>
          <dd>
            {canCopy(contact.mapUrl) ? (
              <>
                <a
                  className="contact-link"
                  href={contact.mapUrl as string}
                  target="_blank"
                  rel="noreferrer"
                >
                  <MapPin size={13} aria-hidden />
                  Open map
                </a>
                {copyButton("map", contact.mapUrl as string, "map link")}
              </>
            ) : (
              <span className="contact-quick-empty">Not added</span>
            )}
          </dd>
        </div>
      </dl>
      {copyState && (
        <p className="form-help copy-state" role="status">
          {copyState}
        </p>
      )}
    </div>
  );
}

/**
 * The small popup the contact name opens on a task, document or event row: the
 * contact's name and status, then the shared field list, then a way back and
 * a way on to the full contact. It opens over the list rather than navigating
 * away, so the row you were reading stays underneath.
 */
function ContactQuickViewDialog({
  contact,
  onClose,
  onOpenContact,
  closeLabel = "Back to the task",
}: {
  contact: Snapshot["organisations"][number];
  onClose: () => void;
  onOpenContact: () => void;
  closeLabel?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  return (
    <dialog
      ref={dialog}
      className="record-dialog contact-quick-dialog"
      aria-label={`Contact details for ${contact.name}`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="dialog-heading">
        <div>
          <p className="eyebrow">CONTACT DETAILS</p>
          <h2>{contact.name}</h2>
          <span className="badge">{label(contact.status)}</span>
        </div>
        <button
          type="button"
          className="icon-button"
          onClick={onClose}
          aria-label="Close contact details"
        >
          <X size={21} />
        </button>
      </div>
      <ContactFieldList contact={contact} />
      <div className="form-actions">
        <Button type="button" variant="outline" onClick={onClose}>
          <X size={14} /> {closeLabel}
        </Button>
        <Button type="button" onClick={onOpenContact}>
          Open full contact
          <ArrowUpRight size={14} />
        </Button>
      </div>
    </dialog>
  );
}

/**
 * Item 1: attach a task that already exists to this contact.
 *
 * Only tasks with no contact yet are offered. A task that came from a note has
 * to stay with that note's contact, so it appears here only when the note
 * already belongs to this contact (or has no contact of its own).
 */
function TaskLinkPicker({
  data,
  organisation,
  onClose,
  onLinked,
  onError,
  onRefresh,
}: {
  data: Snapshot;
  organisation: Snapshot["organisations"][number];
  onClose: () => void;
  onLinked: (taskTitle: string) => void;
  onError: (msg: string) => void;
  onRefresh: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false),
    [query, setQuery] = useState(""),
    [taskId, setTaskId] = useState("");
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const noteOrganisationId = (noteId: string | null) =>
    data.interactions.find((n) => n.id === noteId)?.organisationId ?? null;
  const projectName = (projectId: string | null) =>
    projectId
      ? (data.projects.find((p) => p.id === projectId)?.name ?? "")
      : "";
  const candidates = data.tasks.filter(
    (t) =>
      !t.organisationId &&
      (!t.interactionId ||
        noteOrganisationId(t.interactionId) === organisation.id),
  );
  const needle = query.trim().toLowerCase();
  const shown = needle
    ? candidates.filter((t) =>
        `${t.title} ${t.detail ?? ""}`.toLowerCase().includes(needle),
      )
    : candidates;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const task = candidates.find((t) => t.id === taskId);
    if (!task) {
      onError("Choose a task to link first");
      return;
    }
    setBusy(true);
    try {
      const res = await linkTaskToOrganisation({
        taskId: task.id,
        organisationId: organisation.id,
        version: task.version,
      });
      if (res.ok) onLinked(task.title);
      else if (res.code === "conflict") {
        onError(
          "That task changed while this list was open, so it was not linked. The list has been refreshed – check it and try again.",
        );
        onRefresh();
      } else onError(res.error);
    } catch (err) {
      console.error("[task link] failed", err);
      onError(err instanceof Error ? err.message : "Unable to link task");
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      className="record-dialog"
      aria-label="Link an existing task"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <form onSubmit={submit}>
        <div className="dialog-heading">
          <div>
            <p className="eyebrow">ATTACH WORK ALREADY LISTED</p>
            <h2>Link an existing task to {organisation.name}</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
          >
            <X size={21} />
          </button>
        </div>
        <fieldset disabled={busy} className="form-fields">
          <label className="search-label">
            Find a task
            <input
              type="search"
              placeholder="Search tasks…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          {candidates.length > 0 && (
            <div className="panel task-picker-list">
              {shown.map((t) => (
                <label className="task-row" key={t.id}>
                  <input
                    type="radio"
                    name="task"
                    value={t.id}
                    checked={taskId === t.id}
                    onChange={() => setTaskId(t.id)}
                    required
                  />
                  <span className="task-copy">
                    <strong>{t.title}</strong>
                    <p>
                      {label(t.status)}
                      {t.projectId && projectName(t.projectId) && (
                        <>
                          <span>·</span>
                          {projectName(t.projectId)}
                        </>
                      )}
                      {attentionDate(t) && (
                        <>
                          <span>·</span>
                          {formatDate(attentionDate(t)!)}
                        </>
                      )}
                    </p>
                  </span>
                </label>
              ))}
              {shown.length === 0 && (
                <p className="empty-state">No task matches that search.</p>
              )}
            </div>
          )}
          {candidates.length === 0 && (
            <p className="form-help">
              Every task already has a contact, or came from a note filed
              elsewhere. Add a task here instead, or move the note to this
              contact first.
            </p>
          )}
          <p className="form-help">
            Only tasks with no contact yet are listed. Attaching one changes
            nothing else about it: its title, dates, notes, project and history
            stay exactly as they are, and the change is recorded in the task
            history.
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
          <Button type="submit" disabled={busy || !taskId}>
            {busy ? "Linking…" : "Link task"}
          </Button>
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
        edits. Voiding and corrections are kept here too: a voided record stays
        visible but out of the totals. Permanent deletions keep this history
        entry; the record content is no longer in the workspace. Document files
        are removed only on permanent deletion, and financial records are never
        permanently deleted.
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
                    : r.action === "voided"
                      ? "Voided – kept out of the totals"
                      : r.action === "reinstated"
                        ? "Reinstated – counts again"
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

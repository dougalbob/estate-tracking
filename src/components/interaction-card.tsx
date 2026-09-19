"use client";
import type { ReactNode } from "react";
import {
  Download,
  Eye,
  FileText,
  Globe,
  History,
  Mail,
  Pencil,
  Phone,
  StickyNote,
  Trash2,
  Users,
} from "lucide-react";
import { label } from "@/lib/records/validation";

/**
 * The readable interaction card.
 *
 * One component renders an interaction on every surface that shows one — the
 * project journal, the Event log, a contact's interaction history and Unfiled
 * notes — the `ContactFieldList` precedent, so the surfaces cannot drift apart.
 *
 * Two settled decisions shape it:
 *  - **The detail leads.** It is the first thing on the card, in full, and it is
 *    the tap target that opens the record. A quick glance down a list reads what
 *    actually happened without a click.
 *  - **The title never appears.** A task's title is written before the work is
 *    done ("Call the Co-op about the flowers"), so by the time an interaction has
 *    been recorded the title describes something that has already happened and
 *    can read as though it has not. The title stays in the data as a quiet
 *    handle — the editor, the pickers, search, the history and the bin — and the
 *    detail, which is required, is what the journal shows.
 *
 * The kind is always an icon *and* the word, never the icon alone.
 */

/** One icon per interaction kind, shared by every surface that lists one. */
export const eventKindIcons = {
  call: Phone,
  email: Mail,
  letter: FileText,
  web_form: Globe,
  note: StickyNote,
} as const;

export const eventKindIcon = (kind: string) =>
  eventKindIcons[kind as keyof typeof eventKindIcons] ?? StickyNote;

export type InteractionCardDocument = {
  id: string;
  friendlyName: string;
  originalName: string;
  category: string | null;
};

export type InteractionCardProps<
  D extends InteractionCardDocument = InteractionCardDocument,
> = {
  note: {
    id: string;
    title: string;
    detail: string;
    kind: string;
    occurredAt: string;
    createdAt: string;
    createdBy: string;
    organisationId: string | null;
    version: number;
  };
  /** Directly linked documents, resolved by the caller from the snapshot. */
  docs: D[];
  /** The live contact behind `organisationId`, or null when there is not one. */
  contact: { id: string; name: string } | null;
  /** What to show when there is no live contact: a binned name, or none. */
  organisationName: string;
  /** The project this interaction belongs to, or null. */
  projectName: string | null;
  displayName: (email: string | null) => string;
  /** Opens the interaction itself (the same dialog the old title button opened). */
  onOpen: () => void;
  onOpenContact: (organisationId: string) => void;
  onHistory: () => void;
  onDelete: () => void;
  onViewDocument: (doc: D) => void;
  onDownloadDocument: (doc: D) => void;
  /**
   * True inside a project panel, where the card is one entry in a list rather
   * than a panel of its own.
   */
  embedded?: boolean;
  /** Extra rows that belong to a surface: a note's follow-up tasks, say. */
  children?: ReactNode;
  /**
   * The buttons that belong under a card on some surfaces (Attach document,
   * Link existing). Nothing is rendered when there are none.
   */
  footer?: ReactNode;
  /** A full-width line under the card, such as "Add follow-up". */
  panelFooter?: ReactNode;
};

export function InteractionCard<
  D extends InteractionCardDocument = InteractionCardDocument,
>({
  note,
  docs,
  contact,
  organisationName,
  projectName,
  displayName,
  onOpen,
  onOpenContact,
  onHistory,
  onDelete,
  onViewDocument,
  onDownloadDocument,
  embedded = false,
  children,
  footer,
  panelFooter,
}: InteractionCardProps<D>) {
  const KindIcon = eventKindIcon(note.kind);
  return (
    <article className={embedded ? "note-card embedded" : "panel note-card"}>
      <div className="section-heading">
        <div className="note-head">
          <span className="task-icon">
            <KindIcon size={18} />
          </span>
          <div>
            <button
              className="record-title note-detail"
              onClick={onOpen}
              title="Open this record"
            >
              {note.detail}
            </button>
            <p className="note-line">
              <span className="badge">{label(note.kind)}</span>
              {" · "}
              {contact ? (
                <button
                  type="button"
                  className="task-org"
                  aria-label={`Contact details for ${contact.name}`}
                  title={`Contact details for ${contact.name}`}
                  onClick={() => onOpenContact(contact.id)}
                >
                  <Users size={11} aria-hidden />
                  {contact.name}
                </button>
              ) : (
                organisationName
              )}
              {" · "}
              {projectName ?? "No project"}
              {" · "}
              {formatTime(note.occurredAt)}
            </p>
            <p className="note-line">
              <small>Recorded by {displayName(note.createdBy ?? null)}</small>
            </p>
          </div>
        </div>
        <div className="row-actions">
          <button
            className="subtle-button"
            aria-label="Edit this interaction"
            onClick={onOpen}
          >
            <Pencil size={14} />
            Edit
          </button>
          <button className="subtle-button" onClick={onHistory}>
            <History size={14} />
            History
          </button>
          <button
            className="subtle-button"
            aria-label="Move this interaction to the bin"
            onClick={onDelete}
          >
            <Trash2 size={14} />
            Bin
          </button>
        </div>
      </div>
      {docs.length > 0 && (
        <div className="note-docs">
          {docs.map((d) => (
            <div key={d.id} className="doc-inline">
              <FileText size={14} />
              <span>{d.friendlyName}</span>
              <button
                type="button"
                onClick={() => onViewDocument(d)}
                className="subtle-button"
                title="View in app – close button returns you here"
              >
                <Eye size={12} /> View
              </button>
              <button
                type="button"
                onClick={() => onDownloadDocument(d)}
                className="subtle-button"
                title="Download a copy"
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
      {footer && (
        <div className="note-meta">
          <small>
            Recorded {formatTime(note.createdAt)}
            {note.version > 1 ? " · Edited" : ""}
          </small>
          <div className="row-actions">{footer}</div>
        </div>
      )}
      {children}
      {panelFooter && <div className="panel-footer">{panelFooter}</div>}
    </article>
  );
}

const formatTime = (value: string | Date | number) =>
  new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/London",
  }).format(new Date(value));

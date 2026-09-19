import { z } from "zod";
export const organisationStatuses = [
  "not_contacted",
  "in_progress",
  "awaiting_response",
  "resolved",
] as const;
export const taskStatuses = [
  "to_do",
  "in_progress",
  "scheduled",
  "done",
  "cancelled",
] as const;
/**
 * What sort of work a task is. Optional: a task saved before v0.2.10 has no
 * type, and that stays valid — "No type" simply means nobody chose one.
 */
export const taskKinds = [
  "call",
  "email",
  "meeting",
  "research",
  "review",
] as const;
/**
 * The stored assignee meaning "both of the workspace users", for work they
 * have to do together - attending a meeting, say. Deliberately not shaped like
 * an email address, so it can never be mistaken for one of the two people,
 * whichever way round the list is read.
 */
export const everyoneAssignee = "__everyone__";
export const documentCategories = [
  "certificate",
  "correspondence",
  "financial",
  "identification",
  "legal",
  "property",
  "receipt",
  "other",
] as const;
const optionalText = z
  .string()
  .trim()
  .max(500)
  .nullable()
  .transform((v) => v || null);
/**
 * A web address typed in by hand, for the map link on a contact. Optional, and
 * only ever http or https: the link is opened in a new tab, so anything else
 * has no business being stored.
 */
const optionalUrl = z
  .string()
  .trim()
  .max(2000, "That link is too long")
  .refine((v) => {
    if (v === "") return true;
    if (!/^https?:\/\//i.test(v)) return false;
    try {
      new URL(v);
      return true;
    } catch {
      return false;
    }
  }, "Enter a link that starts with http:// or https://")
  .nullable()
  .transform((v) => v || null);
/**
 * One calendar day as typed into a date field: `YYYY-MM-DD`, and a day that
 * really exists. Read as UTC, so the day stored is the day shown — the same rule
 * the Calendar page works to.
 */
const requiredDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date")
  .refine(
    (v) =>
      Number.isFinite(Date.parse(v)) &&
      new Date(v).toISOString().slice(0, 10) === v,
    "Enter a valid date",
  );
const date = requiredDate.nullable();
const common = {
  id: z.string().min(1).optional(),
  version: z.number().int().positive().optional(),
};
export const organisationInput = z.object({
  ...common,
  name: z.string().trim().min(1, "An organisation name is required").max(200),
  mainContact: optionalText,
  phoneNumbers: z.array(z.string().trim().min(1).max(80)).max(10),
  email: z
    .union([z.email(), z.literal(""), z.null()])
    .transform((v) => v || null),
  reference: optionalText,
  // Optional so contacts saved before v0.2.9 (and their tests and seeds) still
  // validate: missing means no map link, exactly like a stored null.
  mapUrl: optionalUrl.default(null),
  notes: z.string().max(20000).nullable(),
  status: z.enum(organisationStatuses),
  confirmResolve: z.boolean().optional(),
  projectIds: z.array(z.string().min(1)).max(20).default([]),
});
export const taskInput = z.object({
  ...common,
  title: z.string().trim().min(1, "A task title is required").max(300),
  detail: z.string().max(20000),
  /**
   * What happened, written once it has happened. Optional and separate from
   * `detail`, which keeps what was asked for when the task was set. Nullable
   * with a default so tasks saved before v0.2.10 (and follow-ups built inside
   * an interaction) still validate untouched.
   */
  outcome: z
    .string()
    .max(20000)
    .nullable()
    .transform((v) => (v === "" ? null : v))
    .default(null),
  // Same reasoning as `outcome`: optional, so every task saved before this
  // field existed still validates.
  kind: z
    .enum(taskKinds)
    .nullable()
    .optional()
    .transform((v) => v ?? null)
    .default(null),
  organisationId: optionalText,
  interactionId: optionalText,
  projectId: optionalText,
  assignee: optionalText,
  status: z.enum(taskStatuses),
  dueDate: date,
  followUpDate: date,
  deadline: date,
});
/**
 * Linking a task that already exists to a contact changes exactly one column.
 * The client sends the version it displayed so a stale screen is refused rather
 * than overwriting the task with an older copy of it.
 */
export const taskLinkInput = z.object({
  taskId: z.string().min(1),
  organisationId: z.string().min(1),
  version: z.number().int().positive(),
});
/**
 * Moving a task to another day on the calendar changes exactly one column, and
 * always to a real day: a task on the calendar has a due date by definition. The
 * version comes from the screen that was open, so a calendar left open on a
 * stale page is refused rather than overwriting a task the other person has just
 * edited.
 */
export const taskDueDateInput = z.object({
  taskId: z.string().min(1),
  dueDate: requiredDate,
  version: z.number().int().positive(),
});
export const interactionInput = z
  .object({
    ...common,
    organisationId: optionalText,
    // Optional so records saved before v0.2.8 (and their tests and seeds)
    // still validate: missing means No project, exactly like a stored null.
    projectId: optionalText.default(null),
    title: z.string().trim().max(300),
    detail: z.string().trim().min(1, "Add some detail to your note").max(20000),
    kind: z.enum(["call", "email", "letter", "web_form", "note"]),
    occurredAt: z.iso.datetime(),
    followUps: z
      .array(taskInput.omit({ id: true, version: true }))
      .max(30)
      .default([]),
  })
  .refine(
    (v) => v.kind === "note" || v.title.length > 0,
    "An interaction title is required",
  );
export const projectInput = z.object({
  ...common,
  name: z.string().trim().min(1, "A project name is required").max(200),
});
export const documentInput = z.object({
  ...common,
  friendlyName: z
    .string()
    .trim()
    .min(1, "A friendly name is required")
    .max(200),
  category: z.enum(documentCategories).nullable().default(null),
  // originalName, storageName, mimeType, size are set server-side from upload
});
export const documentLinkInput = z.object({
  documentId: z.string().min(1),
  organisationId: z
    .string()
    .trim()
    .min(1)
    .nullable()
    .optional()
    .transform((v) => (v ? v.trim() : null) || null),
  interactionId: z
    .string()
    .trim()
    .min(1)
    .nullable()
    .optional()
    .transform((v) => (v ? v.trim() : null) || null),
  taskId: z
    .string()
    .trim()
    .min(1)
    .nullable()
    .optional()
    .transform((v) => (v ? v.trim() : null) || null),
  projectId: z
    .string()
    .trim()
    .min(1)
    .nullable()
    .optional()
    .transform((v) => (v ? v.trim() : null) || null),
  /** A receipt or invoice can be linked to the financial record it belongs to. */
  financeRecordId: z
    .string()
    .trim()
    .min(1)
    .nullable()
    .optional()
    .transform((v) => (v ? v.trim() : null) || null),
});
export const templateItemInput = z.object({
  ...common,
  projectId: z.string().min(1),
  title: z.string().trim().min(1, "A short title is required").max(300),
  detail: z.string().trim().max(2000).default(""),
});
export const applyTemplateInput = z.object({
  projectId: z.string().min(1),
  itemIds: z
    .array(z.string().min(1))
    .min(1, "Choose at least one item")
    .max(100),
});
export type TemplateItemInput = z.input<typeof templateItemInput>;
export const deleteInput = z.object({
  ...common,
  permanent: z.boolean().optional().default(false),
});
export const financeKinds = [
  "asset",
  "liability",
  "income",
  "expense",
  "distribution",
] as const;
export const financeMovementKinds = [
  "proceeds",
  "payment",
  "reimbursement",
] as const;
export const financeCategories: Record<
  (typeof financeKinds)[number],
  readonly string[]
> = {
  asset: [
    "property",
    "bank_account",
    "investment",
    "pension",
    "vehicle",
    "household_items",
    "other",
  ],
  liability: [
    "loan",
    "mortgage",
    "credit_card",
    "overdraft",
    "unpaid_bill",
    "other",
  ],
  income: ["interest", "refund", "rent", "sale_deposit", "other"],
  expense: ["funeral", "administration", "property", "travel", "other"],
  distribution: ["interim", "final", "other"],
};
/** Each kind of financial record only accepts its own kind of movement. */
export const movementKindFor = (kind: (typeof financeKinds)[number]) =>
  kind === "asset"
    ? "proceeds"
    : kind === "liability"
      ? "payment"
      : kind === "expense"
        ? "reimbursement"
        : null;
export const financeRecordInput = z.object({
  ...common,
  kind: z.enum(financeKinds),
  title: z.string().trim().min(1, "A title is required").max(200),
  detail: z.string().max(20000).default(""),
  category: optionalText,
  /** Pounds as typed by a person, for example "500" or "500.25". */
  amount: z.string().trim().max(40),
  occurredOn: date,
  /** Expense: the user who paid personally. Money already owed to them. */
  fundedBy: optionalText,
  /** Distribution: the user this money was paid to. */
  beneficiary: optionalText,
  organisationId: optionalText,
  projectId: optionalText,
});
export const financeMovementInput = z.object({
  ...common,
  recordId: z.string().min(1),
  kind: z.enum(financeMovementKinds),
  amount: z.string().trim().min(1, "Enter an amount").max(40),
  occurredOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date")
    .refine(
      (v) =>
        Number.isFinite(Date.parse(v)) &&
        new Date(v).toISOString().slice(0, 10) === v,
      "Enter a valid date",
    ),
  detail: z.string().max(20000).default(""),
});
export const financeVoidInput = z.object({
  target: z.enum(["record", "movement"]),
  id: z.string().min(1),
  version: z.number().int().positive(),
  voided: z.boolean(),
  reason: z.string().max(500).optional(),
});
export type FinanceRecordInput = z.input<typeof financeRecordInput>;
export type FinanceMovementInput = z.input<typeof financeMovementInput>;
export type OrganisationInput = z.input<typeof organisationInput>;
export type TaskInput = z.input<typeof taskInput>;
export type InteractionInput = z.input<typeof interactionInput>;
export type ProjectInput = z.input<typeof projectInput>;
export type DocumentInput = z.input<typeof documentInput>;
export type DocumentLinkInput = z.input<typeof documentLinkInput>;
export type TaskLinkInput = z.input<typeof taskLinkInput>;
export type TaskDueDateInput = z.input<typeof taskDueDateInput>;
export const label = (value: string) =>
  value
    .split("_")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" ");
export function attentionDate(t: {
  dueDate: string | null;
  followUpDate: string | null;
  deadline: string | null;
}) {
  return (
    [t.dueDate, t.followUpDate, t.deadline]
      .filter((v): v is string => !!v)
      .sort()[0] ?? null
  );
}
export function londonToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export const allowedMimeTypes = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/tiff",
  "image/heic",
  "image/heif",
  "text/plain",
] as const;
/**
 * The extensions that go with `allowedMimeTypes`, listed beside them because
 * some Android apps omit the MIME when they share or pick a file, and the
 * manifest's `share_target` `accept` lists both for the same reason. This is
 * the one list the share helper, both upload paths and the file picker's
 * `accept` all read, so they cannot drift apart again (a HEIC share was once
 * accepted and then refused at upload because two hand-copied lists differed).
 */
export const allowedFileExtensions = [
  ".pdf",
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".tiff",
  ".heic",
  ".heif",
  ".txt",
] as const;
/**
 * Whether a file is of a type the app stores, by MIME (lower-cased) or by
 * file-name extension (lower-cased). An SVG image is refused outright however
 * it arrives: an SVG can carry scripts, and the app serves documents from its
 * own origin, so an "image" that is really a program has no business being
 * stored here. Everything else follows the two lists above.
 */
export function isAllowedUploadFile(file: {
  name: string;
  type: string;
}): boolean {
  const mime = (file.type || "").toLowerCase();
  if (mime === "image/svg+xml") return false;
  if ((allowedMimeTypes as readonly string[]).includes(mime)) return true;
  const lowerName = (file.name || "").toLowerCase();
  return allowedFileExtensions.some((ext) => lowerName.endsWith(ext));
}
export const maxDocumentSizeBytes = 20 * 1024 * 1024; // 20 MB

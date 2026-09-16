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
  "waiting",
  "done",
  "cancelled",
] as const;
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
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      Number.isFinite(Date.parse(v)) &&
      new Date(v).toISOString().slice(0, 10) === v,
    "Enter a valid date",
  )
  .nullable();
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
  notes: z.string().max(20000).nullable(),
  status: z.enum(organisationStatuses),
  confirmResolve: z.boolean().optional(),
  projectIds: z.array(z.string().min(1)).max(20).default([]),
});
export const taskInput = z.object({
  ...common,
  title: z.string().trim().min(1, "A task title is required").max(300),
  detail: z.string().max(20000),
  organisationId: optionalText,
  interactionId: optionalText,
  projectId: optionalText,
  assignee: optionalText,
  status: z.enum(taskStatuses),
  dueDate: date,
  followUpDate: date,
  deadline: date,
});
export const interactionInput = z
  .object({
    ...common,
    organisationId: optionalText,
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
export const maxDocumentSizeBytes = 20 * 1024 * 1024; // 20 MB

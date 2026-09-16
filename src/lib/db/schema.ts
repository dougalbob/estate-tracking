import {
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
export const organisations = sqliteTable("organisations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  mainContact: text("main_contact"),
  phoneNumbers: text("phone_numbers", { mode: "json" })
    .$type<string[]>()
    .notNull()
    .default([]),
  email: text("email"),
  reference: text("reference"),
  notes: text("notes"),
  status: text("status", {
    enum: ["not_contacted", "in_progress", "awaiting_response", "resolved"],
  })
    .notNull()
    .default("not_contacted"),
  version: integer("version").notNull().default(1),
  createdBy: text("created_by").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
});

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  version: integer("version").notNull().default(1),
  createdBy: text("created_by"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }),
  deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
});
export const interactions = sqliteTable("interactions", {
  id: text("id").primaryKey(),
  organisationId: text("organisation_id").references(() => organisations.id),
  title: text("title").notNull(),
  detail: text("detail").notNull(),
  kind: text("kind").notNull(),
  occurredAt: text("occurred_at").notNull(),
  version: integer("version").notNull().default(1),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
});
export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  detail: text("detail").notNull().default(""),
  organisationId: text("organisation_id").references(() => organisations.id),
  interactionId: text("interaction_id").references(() => interactions.id),
  projectId: text("project_id").references(() => projects.id),
  assignee: text("assignee"),
  status: text("status").notNull().default("to_do"),
  dueDate: text("due_date"),
  followUpDate: text("follow_up_date"),
  deadline: text("deadline"),
  /**
   * Which checklist suggestion created this task, if any. Deliberately not a
   * foreign key: removing a suggestion from a list must never touch the task.
   */
  templateItemId: text("template_item_id"),
  version: integer("version").notNull().default(1),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
});
export const organisationProjects = sqliteTable(
  "organisation_projects",
  {
    organisationId: text("organisation_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.organisationId, t.projectId] })],
);
export const documents = sqliteTable("documents", {
  id: text("id").primaryKey(),
  friendlyName: text("friendly_name").notNull(),
  originalName: text("original_name").notNull(),
  storageName: text("storage_name").notNull(),
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull(),
  category: text("category"),
  version: integer("version").notNull().default(1),
  createdBy: text("created_by").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
});
export const documentLinks = sqliteTable("document_links", {
  id: text("id").primaryKey(),
  documentId: text("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  organisationId: text("organisation_id").references(() => organisations.id, {
    onDelete: "cascade",
  }),
  interactionId: text("interaction_id").references(() => interactions.id, {
    onDelete: "cascade",
  }),
  taskId: text("task_id").references(() => tasks.id, { onDelete: "cascade" }),
  projectId: text("project_id").references(() => projects.id, {
    onDelete: "cascade",
  }),
  financeRecordId: text("finance_record_id").references(
    () => financeRecords.id,
    { onDelete: "cascade" },
  ),
});
/**
 * Estate finances – GBP only, every amount stored as integer pence.
 * `kind` gives the record its meaning:
 *  - asset:        amountPence is the estimated value (null = not valued yet)
 *  - liability:    amountPence is the amount owed
 *  - income:       money received by the estate
 *  - expense:      money spent; fundedBy names the user who paid personally
 *                  (null means it was paid from estate money)
 *  - distribution: money paid to a beneficiary; beneficiary names the user
 * Corrections keep their history: edits create revisions, and voiding keeps the
 * record visible but out of the summaries. Nothing is permanently erased.
 */
export const financeRecords = sqliteTable("finance_records", {
  id: text("id").primaryKey(),
  kind: text("kind", {
    enum: ["asset", "liability", "income", "expense", "distribution"],
  }).notNull(),
  title: text("title").notNull(),
  detail: text("detail").notNull().default(""),
  category: text("category"),
  amountPence: integer("amount_pence"),
  occurredOn: text("occurred_on"),
  fundedBy: text("funded_by"),
  beneficiary: text("beneficiary"),
  organisationId: text("organisation_id").references(() => organisations.id),
  projectId: text("project_id").references(() => projects.id),
  voidedAt: integer("voided_at", { mode: "timestamp_ms" }),
  voidReason: text("void_reason"),
  version: integer("version").notNull().default(1),
  createdBy: text("created_by").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
});
/**
 * Money movements against a finance record:
 *  - proceeds:      sale proceeds received for an asset
 *  - payment:       money paid against a liability
 *  - reimbursement: estate money repaying a user for an expense they funded
 *                    personally. This settles money owed to that user; it is
 *                    never counted as a second expense.
 */
export const financeMovements = sqliteTable("finance_movements", {
  id: text("id").primaryKey(),
  recordId: text("record_id")
    .notNull()
    .references(() => financeRecords.id),
  kind: text("kind", {
    enum: ["proceeds", "payment", "reimbursement"],
  }).notNull(),
  amountPence: integer("amount_pence").notNull(),
  occurredOn: text("occurred_on").notNull(),
  detail: text("detail").notNull().default(""),
  voidedAt: integer("voided_at", { mode: "timestamp_ms" }),
  voidReason: text("void_reason"),
  version: integer("version").notNull().default(1),
  createdBy: text("created_by").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
});
/**
 * Checklist template items: the editable suggestion lists shown inside a project.
 * They create nothing on their own – a user selects the ones that apply, and the
 * task that results is an ordinary task from then on.
 */
export const taskTemplates = sqliteTable("task_templates", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  detail: text("detail").notNull().default(""),
  sortOrder: integer("sort_order").notNull().default(0),
  version: integer("version").notNull().default(1),
  createdBy: text("created_by").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
});

export const revisions = sqliteTable("revisions", {
  id: text("id").primaryKey(),
  entity: text("entity").notNull(),
  entityId: text("entity_id").notNull(),
  actor: text("actor").notNull(),
  at: text("at").notNull(),
  action: text("action").notNull(),
  before: text("before", { mode: "json" }).$type<Record<string, unknown>>(),
  after: text("after", { mode: "json" })
    .$type<Record<string, unknown>>()
    .notNull(),
});

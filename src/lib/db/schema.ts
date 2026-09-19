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
  /**
   * A link to this contact on a map, typed in by hand. Never derived from
   * anything else on the record: there is no address field, and guessing a
   * location from the notes would be a guess.
   */
  mapUrl: text("map_url"),
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
  projectId: text("project_id").references(() => projects.id),
  title: text("title").notNull(),
  detail: text("detail").notNull(),
  kind: text("kind").notNull(),
  occurredAt: text("occurred_at").notNull(),
  /**
   * The task this interaction was created from, when it was created with
   * Create interaction, and null for one written by hand. Set once at creation
   * and never edited. Like `tasks.template_item_id`, deliberately not a
   * foreign key: permanently deleting the task must never touch the record of
   * what happened, and the hop from the task row simply finds nothing.
   */
  sourceTaskId: text("source_task_id"),
  version: integer("version").notNull().default(1),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
});
export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  /** What was asked for when the task was set. */
  detail: text("detail").notNull().default(""),
  /**
   * What actually happened, written afterwards. Kept apart from `detail` so
   * the two never overwrite each other, and null until there is an outcome.
   */
  outcome: text("outcome"),
  /**
   * What sort of work this is — call, email, meeting, research or review. No
   * database enum: a task saved before v0.2.10 has no type, and adding one is
   * always optional.
   */
  kind: text("kind"),
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
  /**
   * The date the document itself is dated — registration, issue, statement
   * period-end, execution. Optional, and blank means "the date it was added":
   * a house deed from 1987 can be dated 1987 and sink to the bottom of a
   * project's story, or be left blank and sit where it entered that story.
   * It belongs to the document rather than to any one link, because a deed
   * linked to two projects is still the same document.
   */
  documentDate: text("document_date"),
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

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
  /**
   * The financial record this note is about, when it is about one: what the
   * bank said when we asked for the balance, why the sale fell through, what
   * the jeweller thought the rings were worth. Notes reuse this table rather
   * than a `finance_notes` table of their own, so an asset's notes arrive with
   * the author, the history, the documents and the follow-up tasks every other
   * note already has.
   *
   * Deliberately not a foreign key, for the same reason `source_task_id` is
   * not: a note records something that happened, and a financial record going
   * to the bin must never take the note with it. Set when the note is created
   * and never moved by an edit, exactly like the source-task stamp.
   */
  financeRecordId: text("finance_record_id"),
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

/**
 * A family or household to notify, invite, and track for funeral & wake.
 * Distinct from Contacts (which are organisations/institutions): these are
 * people being told, organized one row per household.
 */
export const households = sqliteTable("households", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  partySize: integer("party_size").notNull().default(1),
  phone: text("phone"),
  email: text("email"),
  relationship: text("relationship"),
  ringing: text("ringing"),
  contactedAt: text("contacted_at"),
  contactedBy: text("contacted_by"),
  funeral: text("funeral").notNull().default("not_asked"),
  wake: text("wake").notNull().default("not_asked"),
  notes: text("notes"),
  version: integer("version").notNull().default(1),
  createdBy: text("created_by").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
});

/**
 * The gatherings being held (funeral, wake), recording date, time, place,
 * and notes. Seeded with two rows: 'funeral' and 'wake'.
 */
export const gatherings = sqliteTable("gatherings", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  date: text("date"),
  time: text("time"),
  place: text("place"),
  notes: text("notes"),
  version: integer("version").notNull().default(1),
  createdBy: text("created_by").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
});

/**
 * The probate facts the rest of the app has nowhere else to keep: the person who
 * died, the grant, and the figures behind the two Inheritance Tax allowances,
 * including a share carried over from a late spouse or civil partner.
 *
 * One row, with the fixed id `estate`: this app serves one estate. The figures
 * recorded here are facts the users confirmed — an allowance *calculation* is
 * never stored as though it were one. The arithmetic lives in
 * `src/lib/probate/allowances.ts` and is derived on every read.
 *
 * Deliberately not linked to the `probate` project by a foreign key: the project
 * is the filing cabinet for notes, tasks and documents, and the page finds it by
 * its seeded id. Binning the project must never take the estate's facts with it.
 */
export const probateRecords = sqliteTable("probate_records", {
  id: text("id").primaryKey(),
  /** The person whose estate this is. Optional: the app can be used unnamed. */
  deceasedName: text("deceased_name"),
  dateOfDeath: text("date_of_death"),
  grantType: text("grant_type", {
    enum: ["probate", "letters_of_administration", "not_needed", "not_known"],
  })
    .notNull()
    .default("not_known"),
  grantAppliedOn: text("grant_applied_on"),
  grantIssuedOn: text("grant_issued_on"),
  registry: text("registry"),
  grantReference: text("grant_reference"),
  /** A late spouse or civil partner, whose unused bands may be brought across. */
  lateSpouseName: text("late_spouse_name"),
  lateSpouseDateOfDeath: text("late_spouse_date_of_death"),
  /**
   * The unused share of each band at the first death, in basis points
   * (10000 = 100%). Basis points rather than a float: an IHT402 percentage can
   * be fractional, and money is integer pence everywhere else for the same
   * reason. Null means "not recorded yet", which is different from zero.
   */
  nrbUnusedBp: integer("nrb_unused_bp"),
  rnrbUnusedBp: integer("rnrb_unused_bp"),
  /** The figures the users confirmed, never derived from the live register. */
  netEstateAtDeathPence: integer("net_estate_at_death_pence"),
  qualifyingResidenceValuePence: integer("qualifying_residence_value_pence"),
  residenceToDirectDescendants: text("residence_to_direct_descendants", {
    enum: ["yes", "no", "not_known"],
  })
    .notNull()
    .default("not_known"),
  downsizingAddition: text("downsizing_addition", {
    enum: ["yes", "no", "not_known"],
  })
    .notNull()
    .default("not_known"),
  /** What was filed, and when. A claim is not a fact until it has been sent. */
  iht400Needed: text("iht400_needed", {
    enum: ["yes", "no", "not_known"],
  })
    .notNull()
    .default("not_known"),
  iht400SentOn: text("iht400_sent_on"),
  nrbClaimSentOn: text("nrb_claim_sent_on"),
  rnrbClaimSentOn: text("rnrb_claim_sent_on"),
  claimReference: text("claim_reference"),
  claimedNrbPence: integer("claimed_nrb_pence"),
  claimedRnrbPence: integer("claimed_rnrb_pence"),
  /**
   * The published figures in force when this record was last saved. Kept so the
   * history shows what was claimed against, even after the app is updated with
   * new thresholds.
   */
  rates: text("rates", { mode: "json" }).$type<
    import("../probate/rates").ProbateRates
  >(),
  version: integer("version").notNull().default(1),
  createdBy: text("created_by").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
});

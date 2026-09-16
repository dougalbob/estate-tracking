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

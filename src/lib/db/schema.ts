import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
export const organisations = sqliteTable("organisations", {
  id: text("id").primaryKey(), name: text("name").notNull(), mainContact: text("main_contact"),
  phoneNumbers: text("phone_numbers", { mode: "json" }).$type<string[]>().notNull().default([]),
  email: text("email"), reference: text("reference"), notes: text("notes"),
  status: text("status", { enum: ["not_contacted", "in_progress", "awaiting_response", "resolved"] }).notNull().default("not_contacted"),
  version: integer("version").notNull().default(1), createdBy: text("created_by").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(), deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
});

import { randomUUID } from "node:crypto";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";

const { revisions } = schema;

/**
 * Append one revision row. Records are never overwritten silently: the `before`
 * value keeps the previous version, the actor, and the time for the history
 * view. Financial corrections and voids use the same trail.
 */
export function auditEntry(
  db: BetterSQLite3Database<typeof schema>,
  entry: {
    entity: string;
    entityId: string;
    actor: string;
    before: Record<string, unknown> | null;
    after: Record<string, unknown>;
    action?: string;
  },
) {
  db.insert(revisions)
    .values({
      id: randomUUID(),
      entity: entry.entity,
      entityId: entry.entityId,
      actor: entry.actor,
      at: new Date().toISOString(),
      action: entry.action ?? (entry.before ? "updated" : "created"),
      before: entry.before,
      after: entry.after,
    })
    .run();
}

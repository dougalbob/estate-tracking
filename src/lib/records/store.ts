import { randomUUID } from "node:crypto";
import { eq, and, desc, isNull } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import { organisationInput, interactionInput, taskInput } from "./validation";
const { organisations, interactions, tasks, projects, revisions } = schema;
export class RecordError extends Error {
  constructor(
    message: string,
    public code = "validation",
  ) {
    super(message);
  }
}
export function recordStore(
  db: BetterSQLite3Database<typeof schema>,
  users: string[],
) {
  function actorCheck(actor: string) {
    if (!users.includes(actor))
      throw new RecordError("Unauthorised user", "auth");
  }
  function relations(t: {
    organisationId: string | null;
    projectId?: string | null;
    interactionId?: string | null;
    assignee?: string | null;
  }) {
    if (
      t.organisationId &&
      !db
        .select()
        .from(organisations)
        .where(
          and(
            eq(organisations.id, t.organisationId),
            isNull(organisations.deletedAt),
          ),
        )
        .get()
    )
      throw new RecordError("Organisation no longer available");
    if (
      t.projectId &&
      !db.select().from(projects).where(eq(projects.id, t.projectId)).get()
    )
      throw new RecordError("Project no longer available");
    if (t.assignee && !users.includes(t.assignee))
      throw new RecordError("Choose one of the two workspace users");
    if (t.interactionId) {
      const note = db
        .select()
        .from(interactions)
        .where(eq(interactions.id, t.interactionId))
        .get();
      if (!note || note.organisationId !== t.organisationId)
        throw new RecordError(
          "The source note and task must belong to the same organisation",
        );
    }
  }
  function audit(
    entity: string,
    entityId: string,
    actor: string,
    before: Record<string, unknown> | null,
    after: Record<string, unknown>,
  ) {
    db.insert(revisions)
      .values({
        id: randomUUID(),
        entity,
        entityId,
        actor,
        at: new Date().toISOString(),
        action: before ? "updated" : "created",
        before,
        after,
      })
      .run();
  }
  function conflict() {
    throw new RecordError(
      "This record changed while you were editing. Your draft is still here. Review the latest version before trying again.",
      "conflict",
    );
  }
  function saveTask(raw: unknown, actor: string) {
    actorCheck(actor);
    const input = taskInput.parse(raw);
    return db.transaction(() => {
      relations(input);
      const before = input.id
        ? db.select().from(tasks).where(eq(tasks.id, input.id)).get()
        : undefined;
      if (input.id && (!before || before.version !== input.version)) conflict();
      const { id: suppliedId, version, ...values } = input;
      const id = suppliedId || randomUUID(),
        now = new Date().toISOString();
      const after = {
        ...values,
        id,
        version: (before?.version ?? 0) + 1,
        createdBy: before?.createdBy ?? actor,
        createdAt: before?.createdAt ?? now,
        updatedAt: now,
      };
      if (before) {
        if (
          !db
            .update(tasks)
            .set(after)
            .where(and(eq(tasks.id, id), eq(tasks.version, version!)))
            .run().changes
        )
          conflict();
      } else db.insert(tasks).values(after).run();
      audit("task", id, actor, before ?? null, after);
      return id;
    });
  }
  return {
    snapshot() {
      return {
        organisations: db
          .select()
          .from(organisations)
          .where(isNull(organisations.deletedAt))
          .all(),
        interactions: db
          .select()
          .from(interactions)
          .orderBy(desc(interactions.occurredAt))
          .all(),
        tasks: db.select().from(tasks).all(),
        projects: db.select().from(projects).all(),
        revisions: db
          .select()
          .from(revisions)
          .orderBy(desc(revisions.at))
          .all(),
      };
    },
    seedProjects() {
      for (const [id, name] of [
        ["funeral", "Funeral"],
        ["notifications", "Notifications"],
        ["probate", "Probate & Estate Administration"],
      ])
        db.insert(projects).values({ id, name }).onConflictDoNothing().run();
    },
    saveTask,
    saveOrganisation(raw: unknown, actor: string) {
      actorCheck(actor);
      const input = organisationInput.parse(raw);
      return db.transaction(() => {
        const before = input.id
          ? db
              .select()
              .from(organisations)
              .where(eq(organisations.id, input.id))
              .get()
          : undefined;
        if (
          input.id &&
          (!before || before.deletedAt || before.version !== input.version)
        )
          conflict();
        if (
          input.status === "resolved" &&
          before?.status !== "resolved" &&
          input.id &&
          !input.confirmResolve
        ) {
          const open = db
            .select()
            .from(tasks)
            .where(eq(tasks.organisationId, input.id))
            .all()
            .some((t) => !["done", "cancelled"].includes(t.status));
          if (open)
            throw new RecordError(
              "This organisation has open tasks. Confirm resolution below to leave those tasks open.",
              "confirm_resolve",
            );
        }
        const { id: suppliedId, version, confirmResolve, ...values } = input;
        const id = suppliedId || randomUUID(),
          now = new Date();
        const after = {
          ...values,
          id,
          version: (before?.version ?? 0) + 1,
          createdBy: before?.createdBy ?? actor,
          createdAt: before?.createdAt ?? now,
          updatedAt: now,
          deletedAt: null,
        };
        if (before) {
          if (
            !db
              .update(organisations)
              .set(after)
              .where(
                and(
                  eq(organisations.id, id),
                  eq(organisations.version, version!),
                ),
              )
              .run().changes
          )
            conflict();
        } else db.insert(organisations).values(after).run();
        audit("organisation", id, actor, before ?? null, after);
        return id;
      });
    },
    saveInteraction(raw: unknown, actor: string) {
      actorCheck(actor);
      const input = interactionInput.parse(raw);
      return db.transaction(() => {
        relations(input);
        const before = input.id
          ? db
              .select()
              .from(interactions)
              .where(eq(interactions.id, input.id))
              .get()
          : undefined;
        if (input.id && (!before || before.version !== input.version))
          conflict();
        // Moving a note with linked tasks would silently break their context.
        if (
          before &&
          before.organisationId !== input.organisationId &&
          db
            .select()
            .from(tasks)
            .where(eq(tasks.interactionId, before.id))
            .get()
        )
          throw new RecordError(
            "This note has linked tasks. Keep its organisation unchanged.",
          );
        const { id: suppliedId, version, followUps, ...values } = input;
        const id = suppliedId || randomUUID(),
          now = new Date().toISOString();
        const after = {
          ...values,
          title: values.title || "Quick note",
          id,
          version: (before?.version ?? 0) + 1,
          createdBy: before?.createdBy ?? actor,
          createdAt: before?.createdAt ?? now,
          updatedAt: now,
        };
        if (before) {
          if (
            !db
              .update(interactions)
              .set(after)
              .where(
                and(
                  eq(interactions.id, id),
                  eq(interactions.version, version!),
                ),
              )
              .run().changes
          )
            conflict();
        } else db.insert(interactions).values(after).run();
        audit("interaction", id, actor, before ?? null, after);
        for (const task of followUps)
          saveTask(
            {
              ...task,
              organisationId: input.organisationId,
              interactionId: id,
            },
            actor,
          );
        return id;
      });
    },
  };
}
export type Snapshot = ReturnType<ReturnType<typeof recordStore>["snapshot"]>;

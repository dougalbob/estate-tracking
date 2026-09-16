import { randomUUID } from "node:crypto";
import { and, asc, eq, isNull } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import { RecordError, assertActor, versionConflict } from "./errors";
import { auditEntry } from "./audit";
import { applyTemplateInput, templateItemInput } from "./validation";

const { taskTemplates, tasks, projects } = schema;

/** Titles are compared without case, punctuation, or extra spaces. */
export function normaliseTitle(title: string) {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Checklist suggestion lists. A list never creates work by itself: the user
 * selects the lines that apply, and each resulting task is an ordinary task that
 * can be edited, assigned, dated, or binned like any other.
 */
export function checklistStore(
  db: BetterSQLite3Database<typeof schema>,
  users: string[],
) {
  function audit(
    entity: string,
    entityId: string,
    actor: string,
    before: Record<string, unknown> | null,
    after: Record<string, unknown>,
    action?: string,
  ) {
    auditEntry(db, { entity, entityId, actor, before, after, action });
  }

  function projectCheck(projectId: string) {
    const project = db
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectId), isNull(projects.deletedAt)))
      .get();
    if (!project)
      throw new RecordError("Project no longer available", "validation");
    return project;
  }

  function liveItems(projectId?: string) {
    return db
      .select()
      .from(taskTemplates)
      .where(
        projectId
          ? and(
              eq(taskTemplates.projectId, projectId),
              isNull(taskTemplates.deletedAt),
            )
          : isNull(taskTemplates.deletedAt),
      )
      .orderBy(asc(taskTemplates.sortOrder), asc(taskTemplates.title))
      .all();
  }

  return {
    /**
     * Inserts the starter suggestions once. Existing rows are left alone so that
     * edits, and deliberate removals, are never overwritten by a later start-up.
     */
    seedTemplates(
      seeds: {
        id: string;
        projectId: string;
        title: string;
        detail: string;
        sortOrder: number;
      }[],
    ) {
      const now = new Date();
      for (const seed of seeds) {
        db.insert(taskTemplates)
          .values({
            id: seed.id,
            projectId: seed.projectId,
            title: seed.title,
            detail: seed.detail,
            sortOrder: seed.sortOrder,
            version: 1,
            createdBy: "system",
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
          })
          .onConflictDoNothing()
          .run();
      }
    },

    saveTemplateItem(raw: unknown, actor: string) {
      assertActor(users, actor);
      const input = templateItemInput.parse(raw);
      return db.transaction(() => {
        projectCheck(input.projectId);
        const before = input.id
          ? db
              .select()
              .from(taskTemplates)
              .where(eq(taskTemplates.id, input.id))
              .get()
          : undefined;
        if (
          input.id &&
          (!before || before.deletedAt || before.version !== input.version)
        )
          versionConflict();
        if (before && before.projectId !== input.projectId)
          throw new RecordError("A checklist item stays with its project");

        const duplicate = liveItems(input.projectId).find(
          (item) =>
            normaliseTitle(item.title) === normaliseTitle(input.title) &&
            item.id !== input.id,
        );
        if (duplicate)
          throw new RecordError(
            "This list already has an item with that wording",
            "validation",
          );

        const now = new Date();
        const id = input.id || randomUUID();
        const after = {
          id,
          projectId: input.projectId,
          title: input.title,
          detail: input.detail,
          sortOrder: before?.sortOrder ?? liveItems(input.projectId).length + 1,
          version: (before?.version ?? 0) + 1,
          createdBy: before?.createdBy ?? actor,
          createdAt: before?.createdAt ?? now,
          updatedAt: now,
          deletedAt: null,
        };
        if (before) {
          if (
            !db
              .update(taskTemplates)
              .set(after)
              .where(
                and(
                  eq(taskTemplates.id, id),
                  eq(taskTemplates.version, input.version!),
                ),
              )
              .run().changes
          )
            versionConflict();
        } else {
          db.insert(taskTemplates).values(after).run();
        }
        audit(
          "template_item",
          id,
          actor,
          (before as unknown as Record<string, unknown>) ?? null,
          after as unknown as Record<string, unknown>,
        );
        return id;
      });
    },

    deleteTemplateItem(
      id: string,
      version: number,
      actor: string,
      permanent = false,
    ) {
      assertActor(users, actor);
      return db.transaction(() => {
        const before = db
          .select()
          .from(taskTemplates)
          .where(eq(taskTemplates.id, id))
          .get();
        if (!before) versionConflict();
        if (before.version !== version) versionConflict();
        if (permanent) {
          if (!before.deletedAt)
            throw new RecordError(
              "Move this suggestion to the bin before permanent deletion",
            );
          db.delete(taskTemplates).where(eq(taskTemplates.id, id)).run();
          audit(
            "template_item",
            id,
            actor,
            before as unknown as Record<string, unknown>,
            { id },
            "permanently_deleted",
          );
          return id;
        }
        if (before.deletedAt)
          throw new RecordError("This suggestion is already in the bin");
        const now = new Date();
        const after = {
          ...before,
          version: before.version + 1,
          updatedAt: now,
          deletedAt: now,
        };
        if (
          !db
            .update(taskTemplates)
            .set(after)
            .where(
              and(eq(taskTemplates.id, id), eq(taskTemplates.version, version)),
            )
            .run().changes
        )
          versionConflict();
        audit(
          "template_item",
          id,
          actor,
          before as unknown as Record<string, unknown>,
          after as unknown as Record<string, unknown>,
          "deleted",
        );
        return id;
      });
    },

    restoreTemplateItem(id: string, version: number, actor: string) {
      assertActor(users, actor);
      return db.transaction(() => {
        const before = db
          .select()
          .from(taskTemplates)
          .where(eq(taskTemplates.id, id))
          .get();
        if (!before) versionConflict();
        if (!before.deletedAt || before.version !== version) versionConflict();
        projectCheck(before.projectId);
        const after = {
          ...before,
          version: before.version + 1,
          updatedAt: new Date(),
          deletedAt: null,
        };
        if (
          !db
            .update(taskTemplates)
            .set(after)
            .where(
              and(eq(taskTemplates.id, id), eq(taskTemplates.version, version)),
            )
            .run().changes
        )
          versionConflict();
        audit(
          "template_item",
          id,
          actor,
          before as unknown as Record<string, unknown>,
          after as unknown as Record<string, unknown>,
          "restored",
        );
        return id;
      });
    },

    /**
     * Turns the selected suggestions into tasks. No dates, no assignee, no
     * organisation – just the wording, in the chosen project. Anything already
     * in the project with the same wording, or already created from the same
     * suggestion, is skipped rather than duplicated.
     */
    applyTemplate(raw: unknown, actor: string) {
      assertActor(users, actor);
      const { projectId, itemIds } = applyTemplateInput.parse(raw);
      return db.transaction(() => {
        projectCheck(projectId);
        const existing = db
          .select()
          .from(tasks)
          .where(and(eq(tasks.projectId, projectId), isNull(tasks.deletedAt)))
          .all();
        const seen = new Set(
          existing.flatMap((task) =>
            [
              task.templateItemId ? `item:${task.templateItemId}` : null,
              `title:${normaliseTitle(task.title)}`,
            ].filter((key): key is string => key !== null),
          ),
        );

        const added: string[] = [];
        const skipped: string[] = [];
        const now = new Date().toISOString();
        for (const itemId of itemIds) {
          const item = db
            .select()
            .from(taskTemplates)
            .where(eq(taskTemplates.id, itemId))
            .get();
          if (!item || item.deletedAt) {
            // The suggestion was removed while this list was open.
            skipped.push(itemId);
            continue;
          }
          if (item.projectId !== projectId)
            throw new RecordError(
              "That suggestion belongs to a different project",
              "validation",
            );
          const itemKey = `item:${item.id}`;
          const titleKey = `title:${normaliseTitle(item.title)}`;
          if (seen.has(itemKey) || seen.has(titleKey)) {
            skipped.push(itemId);
            continue;
          }
          const id = randomUUID();
          const task = {
            id,
            title: item.title,
            detail: item.detail,
            organisationId: null,
            interactionId: null,
            projectId,
            assignee: null,
            status: "to_do" as const,
            dueDate: null,
            followUpDate: null,
            deadline: null,
            templateItemId: item.id,
            version: 1,
            createdBy: actor,
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
          };
          db.insert(tasks).values(task).run();
          audit(
            "task",
            id,
            actor,
            null,
            task as unknown as Record<string, unknown>,
          );
          seen.add(itemKey);
          seen.add(titleKey);
          added.push(itemId);
        }
        return { added, skipped };
      });
    },
  };
}

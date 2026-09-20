import { randomUUID } from "node:crypto";
import { eq, and, asc, desc, isNull, isNotNull } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import { RecordError, assertActor, versionConflict } from "./errors";
import { auditEntry } from "./audit";
import { financeStore } from "../finances/store";
import { checklistStore } from "./checklist-store";
import { guestStore } from "../guests/store";
import { templateSeeds } from "./template-seeds";
import {
  organisationInput,
  interactionInput,
  taskInput,
  taskLinkInput,
  taskDueDateInput,
  everyoneAssignee,
  projectInput,
  documentInput,
  documentLinkInput,
} from "./validation";
const {
  organisations,
  interactions,
  tasks,
  projects,
  revisions,
  organisationProjects,
  documents,
  documentLinks,
  financeRecords,
  financeMovements,
  taskTemplates,
  households,
  gatherings,
} = schema;
export { RecordError };
export function recordStore(
  db: BetterSQLite3Database<typeof schema>,
  users: string[],
) {
  const finances = financeStore(db, users);
  const checklist = checklistStore(db, users);
  const guests = guestStore(db, users);
  function actorCheck(actor: string) {
    assertActor(users, actor);
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
      !db
        .select()
        .from(projects)
        .where(and(eq(projects.id, t.projectId), isNull(projects.deletedAt)))
        .get()
    )
      throw new RecordError("Project no longer available");
    // "Everyone" is a real choice, not one of the two people, so it is let
    // through here and read back as a name of its own.
    if (
      t.assignee &&
      t.assignee !== everyoneAssignee &&
      !users.includes(t.assignee)
    )
      throw new RecordError("Choose one of the two workspace users");
    if (t.interactionId) {
      const note = db
        .select()
        .from(interactions)
        .where(eq(interactions.id, t.interactionId))
        .get();
      if (!note || note.deletedAt)
        throw new RecordError("The source note is no longer available");
      if (note.organisationId !== t.organisationId)
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
    action?: string,
  ) {
    auditEntry(db, { entity, entityId, actor, before, after, action });
  }
  const conflict: () => never = versionConflict;
  function saveTask(raw: unknown, actor: string) {
    actorCheck(actor);
    const input = taskInput.parse(raw);
    return db.transaction(() => {
      relations(input);
      const before = input.id
        ? db.select().from(tasks).where(eq(tasks.id, input.id)).get()
        : undefined;
      if (
        input.id &&
        (!before || before.deletedAt || before.version !== input.version)
      )
        conflict();
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
        deletedAt: null,
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
  function saveOrganisation(raw: unknown, actor: string) {
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
          .where(
            and(eq(tasks.organisationId, input.id), isNull(tasks.deletedAt)),
          )
          .all()
          .some((t) => !["done", "cancelled"].includes(t.status));
        if (open)
          throw new RecordError(
            "This organisation has open tasks. Confirm resolution below to leave those tasks open.",
            "confirm_resolve",
          );
      }
      for (const pid of input.projectIds) {
        if (
          !db
            .select()
            .from(projects)
            .where(and(eq(projects.id, pid), isNull(projects.deletedAt)))
            .get()
        )
          throw new RecordError("Project no longer available");
      }
      const {
        id: suppliedId,
        version,
        confirmResolve,
        projectIds,
        ...values
      } = input;
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
      db.delete(organisationProjects)
        .where(eq(organisationProjects.organisationId, id))
        .run();
      for (const pid of projectIds) {
        db.insert(organisationProjects)
          .values({ organisationId: id, projectId: pid })
          .onConflictDoNothing()
          .run();
      }
      audit("organisation", id, actor, before ?? null, {
        ...after,
        projectIds,
      });
      return id;
    });
  }

  /**
   * Saves an interaction. When a new one names a `sourceTaskId` - the Create
   * interaction button on a task - the stamp is kept on the row and the
   * task's linked documents are linked to the new interaction as well, as
   * ordinary `document_links` rows in the same transaction: they show
   * everywhere a link shows and can be unlinked by hand like any other. An
   * inheritance, not a rule - nothing about the task itself changes, and an
   * interaction written by hand has a null stamp and is left alone.
   */
  function saveInteraction(raw: unknown, actor: string) {
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
      if (
        input.id &&
        (!before || before.deletedAt || before.version !== input.version)
      )
        conflict();
      // The source task is fixed at creation. An edit cannot set or move it,
      // and a task that has since gone to the bin does not undo the stamp.
      const sourceTask =
        !before && input.sourceTaskId
          ? db
              .select()
              .from(tasks)
              .where(eq(tasks.id, input.sourceTaskId))
              .get()
          : undefined;
      if (
        !before &&
        input.sourceTaskId &&
        (!sourceTask || sourceTask.deletedAt)
      )
        throw new RecordError("The source task is no longer available");
      if (
        before &&
        before.organisationId !== input.organisationId &&
        db
          .select()
          .from(tasks)
          .where(
            and(eq(tasks.interactionId, before.id), isNull(tasks.deletedAt)),
          )
          .get()
      )
        throw new RecordError(
          "This note has linked tasks. Keep its organisation unchanged.",
        );
      const {
        id: suppliedId,
        version,
        followUps,
        sourceTaskId,
        ...values
      } = input;
      const id = suppliedId || randomUUID(),
        now = new Date().toISOString();
      const after = {
        ...values,
        title: values.title || "Quick note",
        id,
        sourceTaskId: before ? before.sourceTaskId : sourceTaskId,
        version: (before?.version ?? 0) + 1,
        createdBy: before?.createdBy ?? actor,
        createdAt: before?.createdAt ?? now,
        updatedAt: now,
        deletedAt: null,
      };
      if (before) {
        if (
          !db
            .update(interactions)
            .set(after)
            .where(
              and(eq(interactions.id, id), eq(interactions.version, version!)),
            )
            .run().changes
        )
          conflict();
      } else db.insert(interactions).values(after).run();
      audit("interaction", id, actor, before ?? null, after);
      if (sourceTask) {
        // Each of the task's live documents becomes a real link to the new
        // interaction, audited like one made by hand. Nothing on the task's
        // own links changes.
        const inherited = db
          .select({ documentId: documentLinks.documentId })
          .from(documentLinks)
          .innerJoin(documents, eq(documents.id, documentLinks.documentId))
          .where(
            and(
              eq(documentLinks.taskId, sourceTask.id),
              isNull(documents.deletedAt),
            ),
          )
          .all();
        for (const { documentId } of inherited)
          linkDocument({ documentId, interactionId: id }, actor);
      }
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
  }

  function linkDocument(raw: unknown, actor: string) {
    actorCheck(actor);
    const input = documentLinkInput.parse(raw);
    return db.transaction(() => {
      const doc = db
        .select()
        .from(documents)
        .where(eq(documents.id, input.documentId))
        .get();
      if (!doc || doc.deletedAt)
        throw new RecordError("Document no longer available");
      const count = [
        input.organisationId,
        input.interactionId,
        input.taskId,
        input.projectId,
        input.financeRecordId,
      ].filter(Boolean).length;
      if (count !== 1)
        throw new RecordError("Link a document to exactly one record");
      if (input.organisationId) {
        if (
          !db
            .select()
            .from(organisations)
            .where(
              and(
                eq(organisations.id, input.organisationId),
                isNull(organisations.deletedAt),
              ),
            )
            .get()
        )
          throw new RecordError("Organisation no longer available");
      }
      if (input.interactionId) {
        const note = db
          .select()
          .from(interactions)
          .where(eq(interactions.id, input.interactionId))
          .get();
        if (!note || note.deletedAt)
          throw new RecordError("Note no longer available");
      }
      if (input.taskId) {
        const t = db
          .select()
          .from(tasks)
          .where(eq(tasks.id, input.taskId))
          .get();
        if (!t || t.deletedAt)
          throw new RecordError("Task no longer available");
      }
      if (input.projectId) {
        if (
          !db
            .select()
            .from(projects)
            .where(
              and(eq(projects.id, input.projectId), isNull(projects.deletedAt)),
            )
            .get()
        )
          throw new RecordError("Project no longer available");
      }
      if (input.financeRecordId) {
        const finance = db
          .select()
          .from(financeRecords)
          .where(eq(financeRecords.id, input.financeRecordId))
          .get();
        if (!finance || finance.deletedAt)
          throw new RecordError("Financial record no longer available");
      }
      const existing = db
        .select()
        .from(documentLinks)
        .where(
          and(
            eq(documentLinks.documentId, input.documentId),
            input.organisationId
              ? eq(documentLinks.organisationId, input.organisationId)
              : isNull(documentLinks.organisationId),
            input.interactionId
              ? eq(documentLinks.interactionId, input.interactionId)
              : isNull(documentLinks.interactionId),
            input.taskId
              ? eq(documentLinks.taskId, input.taskId)
              : isNull(documentLinks.taskId),
            input.projectId
              ? eq(documentLinks.projectId, input.projectId)
              : isNull(documentLinks.projectId),
            input.financeRecordId
              ? eq(documentLinks.financeRecordId, input.financeRecordId)
              : isNull(documentLinks.financeRecordId),
          ),
        )
        .get();
      if (existing) return existing.id;
      const id = randomUUID();
      db.insert(documentLinks)
        .values({
          id,
          documentId: input.documentId,
          organisationId: input.organisationId,
          interactionId: input.interactionId,
          taskId: input.taskId,
          projectId: input.projectId,
          financeRecordId: input.financeRecordId,
        })
        .run();
      audit("document_link", id, actor, null, {
        documentId: input.documentId,
        organisationId: input.organisationId,
        interactionId: input.interactionId,
        taskId: input.taskId,
        projectId: input.projectId,
        financeRecordId: input.financeRecordId,
      });
      return id;
    });
  }

  return {
    ...finances,
    ...checklist,
    ...guests,
    seedTemplates() {
      checklist.seedTemplates(templateSeeds);
    },
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
          .where(isNull(interactions.deletedAt))
          .orderBy(desc(interactions.occurredAt))
          .all(),
        tasks: db.select().from(tasks).where(isNull(tasks.deletedAt)).all(),
        projects: db
          .select()
          .from(projects)
          .where(isNull(projects.deletedAt))
          .all(),
        organisationProjects: db.select().from(organisationProjects).all(),
        taskTemplates: db
          .select()
          .from(taskTemplates)
          .where(isNull(taskTemplates.deletedAt))
          .orderBy(
            asc(taskTemplates.projectId),
            asc(taskTemplates.sortOrder),
            asc(taskTemplates.title),
          )
          .all(),
        deletedTaskTemplates: db
          .select()
          .from(taskTemplates)
          .where(isNotNull(taskTemplates.deletedAt))
          .all(),
        documents: db
          .select()
          .from(documents)
          .where(isNull(documents.deletedAt))
          .orderBy(desc(documents.createdAt))
          .all(),
        documentLinks: db.select().from(documentLinks).all(),
        financeRecords: db
          .select()
          .from(financeRecords)
          .where(isNull(financeRecords.deletedAt))
          .all(),
        financeMovements: db
          .select()
          .from(financeMovements)
          .where(isNull(financeMovements.deletedAt))
          .all(),
        deletedFinanceRecords: db
          .select()
          .from(financeRecords)
          .where(isNotNull(financeRecords.deletedAt))
          .all(),
        deletedFinanceMovements: db
          .select()
          .from(financeMovements)
          .where(isNotNull(financeMovements.deletedAt))
          .all(),
        households: db
          .select()
          .from(households)
          .where(isNull(households.deletedAt))
          .all(),
        deletedHouseholds: db
          .select()
          .from(households)
          .where(isNotNull(households.deletedAt))
          .all(),
        gatherings: db
          .select()
          .from(gatherings)
          .where(isNull(gatherings.deletedAt))
          .all(),
        deletedOrganisations: db
          .select()
          .from(organisations)
          .where(isNotNull(organisations.deletedAt))
          .all(),
        deletedInteractions: db
          .select()
          .from(interactions)
          .where(isNotNull(interactions.deletedAt))
          .all(),
        deletedTasks: db
          .select()
          .from(tasks)
          .where(isNotNull(tasks.deletedAt))
          .all(),
        deletedProjects: db
          .select()
          .from(projects)
          .where(isNotNull(projects.deletedAt))
          .all(),
        deletedDocuments: db
          .select()
          .from(documents)
          .where(isNotNull(documents.deletedAt))
          .all(),
        revisions: db
          .select()
          .from(revisions)
          .orderBy(desc(revisions.at))
          .all(),
      };
    },
    seedProjects() {
      const now = new Date();
      const starter: [string, string][] = [
        ["funeral", "Funeral"],
        ["notifications", "Notifications"],
        ["probate", "Probate & Estate Administration"],
      ];
      for (const [id, name] of starter) {
        db.insert(projects)
          .values({
            id,
            name,
            version: 1,
            createdBy: "system",
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
          })
          .onConflictDoNothing()
          .run();
        const existing = db
          .select()
          .from(projects)
          .where(eq(projects.id, id))
          .get();
        if (
          existing &&
          (existing.version == null || existing.createdAt == null)
        ) {
          db.update(projects)
            .set({
              version: existing.version ?? 1,
              createdBy: existing.createdBy ?? "system",
              createdAt: existing.createdAt ?? now,
              updatedAt: existing.updatedAt ?? now,
              deletedAt: null,
            })
            .where(eq(projects.id, id))
            .run();
        }
      }
    },
    saveTask,
    saveProject(raw: unknown, actor: string) {
      actorCheck(actor);
      const input = projectInput.parse(raw);
      return db.transaction(() => {
        const before = input.id
          ? db.select().from(projects).where(eq(projects.id, input.id)).get()
          : undefined;
        if (
          input.id &&
          (!before || before.deletedAt || before.version !== input.version)
        )
          conflict();
        const duplicate = db
          .select()
          .from(projects)
          .where(isNull(projects.deletedAt))
          .all()
          .find(
            (p) =>
              p.name.toLowerCase() === input.name.toLowerCase() &&
              p.id !== input.id,
          );
        if (duplicate)
          throw new RecordError(
            "A project with this name already exists",
            "validation",
          );
        const { id: suppliedId, version, ...values } = input;
        const id = suppliedId || randomUUID();
        const now = new Date();
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
              .update(projects)
              .set(after)
              .where(and(eq(projects.id, id), eq(projects.version, version!)))
              .run().changes
          )
            conflict();
        } else db.insert(projects).values(after).run();
        audit("project", id, actor, before ?? null, after);
        return id;
      });
    },
    saveOrganisation,
    saveInteraction,
    saveDocument(raw: unknown, actor: string) {
      actorCheck(actor);
      const input = documentInput.parse(raw);
      return db.transaction(() => {
        const before = input.id
          ? db.select().from(documents).where(eq(documents.id, input.id)).get()
          : undefined;
        if (
          input.id &&
          (!before || before.deletedAt || before.version !== input.version)
        )
          conflict();
        const { id: suppliedId, version, ...values } = input;
        const id = suppliedId || randomUUID();
        const now = new Date();
        if (before) {
          const after = {
            ...before,
            friendlyName: values.friendlyName,
            category: values.category,
            documentDate: values.documentDate,
            version: before.version + 1,
            updatedAt: now,
          };
          if (
            !db
              .update(documents)
              .set(after)
              .where(and(eq(documents.id, id), eq(documents.version, version!)))
              .run().changes
          )
            conflict();
          audit(
            "document",
            id,
            actor,
            before as unknown as Record<string, unknown>,
            after as unknown as Record<string, unknown>,
          );
        } else {
          throw new RecordError(
            "Use the upload action to create documents",
            "validation",
          );
        }
        return id;
      });
    },
    /**
     * Item 1: attach a task that already exists to a contact.
     *
     * A task links to exactly one organisation through `tasks.organisation_id`,
     * so this is an update to the task, not a join row. The current row is read
     * here rather than trusted from the browser: only `organisation_id` can
     * change, and every other field is written back exactly as it already is.
     * The version the user was looking at is still enforced, so a stale screen
     * is refused instead of silently overwriting someone else's edit.
     */
    linkTaskToOrganisation(raw: unknown, actor: string) {
      actorCheck(actor);
      const input = taskLinkInput.parse(raw);
      return db.transaction(() => {
        const task = db
          .select()
          .from(tasks)
          .where(eq(tasks.id, input.taskId))
          .get();
        if (!task || task.deletedAt)
          throw new RecordError("That task is no longer available");
        if (task.organisationId && task.organisationId !== input.organisationId)
          throw new RecordError(
            "That task already belongs to another contact. Open it from the task list to move it.",
          );
        const {
          id,
          version: _version,
          createdBy: _createdBy,
          createdAt: _createdAt,
          updatedAt: _updatedAt,
          deletedAt: _deletedAt,
          ...fields
        } = task;
        return saveTask(
          {
            ...fields,
            id,
            version: input.version,
            organisationId: input.organisationId,
          },
          actor,
        );
      });
    },
    /**
     * Dragging a task to another day on the calendar. One column changes: the
     * follow-up date and the confirmed deadline stay exactly where they were.
     * Dropping a task back on the day it is already on writes nothing at all, so
     * an accidental jiggle does not add a revision to the history.
     */
    setTaskDueDate(raw: unknown, actor: string) {
      actorCheck(actor);
      const input = taskDueDateInput.parse(raw);
      return db.transaction(() => {
        const task = db
          .select()
          .from(tasks)
          .where(eq(tasks.id, input.taskId))
          .get();
        if (!task || task.deletedAt)
          throw new RecordError("That task is no longer available");
        if (task.dueDate === input.dueDate) return task.id;
        if (task.version !== input.version) conflict();
        const {
          id,
          version,
          createdBy: _createdBy,
          createdAt: _createdAt,
          updatedAt: _updatedAt,
          deletedAt: _deletedAt,
          ...fields
        } = task;
        return saveTask(
          {
            ...fields,
            id,
            version,
            dueDate: input.dueDate,
          },
          actor,
        );
      });
    },
    /**
     * Item 2: create a contact and save the record that introduced it in one
     * transaction. If the task or note cannot be saved, the contact is not
     * created either – there is no half-finished save to clean up by hand.
     */
    saveRecordWithNewOrganisation(
      kind: "task" | "interaction",
      raw: unknown,
      rawOrganisation: unknown,
      actor: string,
    ) {
      actorCheck(actor);
      return db.transaction(() => {
        const input =
          kind === "task" ? taskInput.parse(raw) : interactionInput.parse(raw);
        const organisationId = saveOrganisation(rawOrganisation, actor);
        const { id: _id, version: _version, ...values } = input;
        const recordId =
          kind === "task"
            ? saveTask(
                {
                  ...values,
                  id: input.id,
                  version: input.version,
                  organisationId,
                },
                actor,
              )
            : saveInteraction(
                {
                  ...values,
                  id: input.id,
                  version: input.version,
                  organisationId,
                },
                actor,
              );
        return { id: recordId, organisationId };
      });
    },
    createDocumentFromUpload(
      upload: {
        friendlyName: string;
        originalName: string;
        storageName: string;
        mimeType: string;
        size: number;
        category: string | null;
        /** The date the document is dated, or null for "the date it was added". */
        documentDate?: string | null;
      },
      actor: string,
    ) {
      actorCheck(actor);
      return db.transaction(() => {
        const id = randomUUID();
        const now = new Date();
        const record = {
          id,
          friendlyName: upload.friendlyName,
          originalName: upload.originalName,
          storageName: upload.storageName,
          mimeType: upload.mimeType,
          size: upload.size,
          category: upload.category,
          documentDate: upload.documentDate ?? null,
          version: 1,
          createdBy: actor,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        };
        db.insert(documents).values(record).run();
        audit("document", id, actor, null, record);
        return id;
      });
    },
    linkDocument,
    unlinkDocument(linkId: string, actor: string) {
      actorCheck(actor);
      return db.transaction(() => {
        const before = db
          .select()
          .from(documentLinks)
          .where(eq(documentLinks.id, linkId))
          .get();
        if (!before) throw new RecordError("Link no longer available");
        db.delete(documentLinks).where(eq(documentLinks.id, linkId)).run();
        audit(
          "document_link",
          linkId,
          actor,
          before as unknown as Record<string, unknown>,
          { id: linkId, deleted: true },
          "deleted",
        );
        return linkId;
      });
    },
    deleteRecord(
      kind: "organisation" | "interaction" | "task" | "project" | "document",
      id: string,
      version: number,
      actor: string,
      permanent = false,
    ) {
      actorCheck(actor);
      return db.transaction(() => {
        if (kind === "organisation") {
          const before = db
            .select()
            .from(organisations)
            .where(eq(organisations.id, id))
            .get();
          if (!before) conflict();
          if (before.version !== version) conflict();
          if (permanent) {
            if (!before.deletedAt)
              throw new RecordError(
                "Move this record to the recoverable bin before permanent deletion",
                "validation",
              );
            db.update(interactions)
              .set({ organisationId: null })
              .where(eq(interactions.organisationId, id))
              .run();
            db.update(tasks)
              .set({ organisationId: null })
              .where(eq(tasks.organisationId, id))
              .run();
            // A financial record's organisation link is cleared too, exactly
            // like a task's or a note's: the record stays, the link does not.
            // Without this the delete below is refused by the foreign key
            // (finance_records.organisation_id has no ON DELETE rule), which
            // used to surface as a misleading "check your access" error.
            db.update(financeRecords)
              .set({ organisationId: null })
              .where(eq(financeRecords.organisationId, id))
              .run();
            db.delete(organisationProjects)
              .where(eq(organisationProjects.organisationId, id))
              .run();
            db.delete(organisations).where(eq(organisations.id, id)).run();
            audit(
              "organisation",
              id,
              actor,
              before as unknown as Record<string, unknown>,
              { id },
              "permanently_deleted",
            );
          } else {
            if (before.deletedAt)
              throw new RecordError("This record is already in the bin");
            const now = new Date();
            const after = {
              ...before,
              version: before.version + 1,
              updatedAt: now,
              deletedAt: now,
            };
            if (
              !db
                .update(organisations)
                .set(after)
                .where(
                  and(
                    eq(organisations.id, id),
                    eq(organisations.version, version),
                  ),
                )
                .run().changes
            )
              conflict();
            audit(
              "organisation",
              id,
              actor,
              before as unknown as Record<string, unknown>,
              after as unknown as Record<string, unknown>,
              "deleted",
            );
          }
        } else if (kind === "interaction") {
          const before = db
            .select()
            .from(interactions)
            .where(eq(interactions.id, id))
            .get();
          if (!before) conflict();
          if (before.version !== version) conflict();
          if (permanent) {
            if (!before.deletedAt)
              throw new RecordError(
                "Move this record to the recoverable bin before permanent deletion",
              );
            db.update(tasks)
              .set({ interactionId: null })
              .where(eq(tasks.interactionId, id))
              .run();
            db.delete(interactions).where(eq(interactions.id, id)).run();
            audit(
              "interaction",
              id,
              actor,
              before as unknown as Record<string, unknown>,
              { id },
              "permanently_deleted",
            );
          } else {
            if (before.deletedAt)
              throw new RecordError("This record is already in the bin");
            const now = new Date();
            const after = {
              ...before,
              version: before.version + 1,
              updatedAt: new Date().toISOString(),
              deletedAt: now,
            };
            if (
              !db
                .update(interactions)
                .set(after)
                .where(
                  and(
                    eq(interactions.id, id),
                    eq(interactions.version, version),
                  ),
                )
                .run().changes
            )
              conflict();
            audit(
              "interaction",
              id,
              actor,
              before as unknown as Record<string, unknown>,
              after as unknown as Record<string, unknown>,
              "deleted",
            );
          }
        } else if (kind === "task") {
          const before = db.select().from(tasks).where(eq(tasks.id, id)).get();
          if (!before) conflict();
          if (before.version !== version) conflict();
          if (permanent) {
            if (!before.deletedAt)
              throw new RecordError(
                "Move this record to the recoverable bin before permanent deletion",
              );
            db.delete(tasks).where(eq(tasks.id, id)).run();
            audit(
              "task",
              id,
              actor,
              before as unknown as Record<string, unknown>,
              { id },
              "permanently_deleted",
            );
          } else {
            if (before.deletedAt)
              throw new RecordError("This record is already in the bin");
            const now = new Date();
            const after = {
              ...before,
              version: before.version + 1,
              updatedAt: new Date().toISOString(),
              deletedAt: now,
            };
            if (
              !db
                .update(tasks)
                .set(after)
                .where(and(eq(tasks.id, id), eq(tasks.version, version)))
                .run().changes
            )
              conflict();
            audit(
              "task",
              id,
              actor,
              before as unknown as Record<string, unknown>,
              after as unknown as Record<string, unknown>,
              "deleted",
            );
          }
        } else if (kind === "project") {
          const before = db
            .select()
            .from(projects)
            .where(eq(projects.id, id))
            .get();
          if (!before) conflict();
          if (before.version !== version) conflict();
          if (permanent) {
            if (!before.deletedAt)
              throw new RecordError(
                "Move this record to the recoverable bin before permanent deletion",
              );
            db.update(tasks)
              .set({ projectId: null })
              .where(eq(tasks.projectId, id))
              .run();
            db.update(interactions)
              .set({ projectId: null })
              .where(eq(interactions.projectId, id))
              .run();
            // Same rule as tasks and interactions above: a financial record
            // keeps its figures and loses its link, rather than blocking the
            // delete with a foreign-key failure nobody can act on.
            db.update(financeRecords)
              .set({ projectId: null })
              .where(eq(financeRecords.projectId, id))
              .run();
            db.delete(organisationProjects)
              .where(eq(organisationProjects.projectId, id))
              .run();
            db.delete(projects).where(eq(projects.id, id)).run();
            audit(
              "project",
              id,
              actor,
              before as unknown as Record<string, unknown>,
              { id },
              "permanently_deleted",
            );
          } else {
            if (before.deletedAt)
              throw new RecordError("This record is already in the bin");
            const now = new Date();
            const after = {
              ...before,
              version: before.version + 1,
              updatedAt: now,
              deletedAt: now,
            };
            if (
              !db
                .update(projects)
                .set(after)
                .where(and(eq(projects.id, id), eq(projects.version, version)))
                .run().changes
            )
              conflict();
            audit(
              "project",
              id,
              actor,
              before as unknown as Record<string, unknown>,
              after as unknown as Record<string, unknown>,
              "deleted",
            );
          }
        } else if (kind === "document") {
          const before = db
            .select()
            .from(documents)
            .where(eq(documents.id, id))
            .get();
          if (!before) conflict();
          if (before.version !== version) conflict();
          if (permanent) {
            if (!before.deletedAt)
              throw new RecordError(
                "Move this document to the bin before permanent deletion",
              );
            db.delete(documents).where(eq(documents.id, id)).run();
            audit(
              "document",
              id,
              actor,
              before as unknown as Record<string, unknown>,
              { id, storageName: before.storageName },
              "permanently_deleted",
            );
            return { id, storageName: before.storageName };
          } else {
            if (before.deletedAt)
              throw new RecordError("This document is already in the bin");
            const now = new Date();
            const after = {
              ...before,
              version: before.version + 1,
              updatedAt: now,
              deletedAt: now,
            };
            if (
              !db
                .update(documents)
                .set(after)
                .where(
                  and(eq(documents.id, id), eq(documents.version, version)),
                )
                .run().changes
            )
              conflict();
            audit(
              "document",
              id,
              actor,
              before as unknown as Record<string, unknown>,
              after as unknown as Record<string, unknown>,
              "deleted",
            );
          }
        }
        return { id };
      });
    },
    restoreRecord(
      kind: "organisation" | "interaction" | "task" | "project" | "document",
      id: string,
      version: number,
      actor: string,
    ) {
      actorCheck(actor);
      return db.transaction(() => {
        if (kind === "organisation") {
          const before = db
            .select()
            .from(organisations)
            .where(eq(organisations.id, id))
            .get();
          if (!before) conflict();
          if (!before.deletedAt || before.version !== version) conflict();
          const now = new Date();
          const after = {
            ...before,
            version: before.version + 1,
            updatedAt: now,
            deletedAt: null,
          };
          if (
            !db
              .update(organisations)
              .set(after)
              .where(
                and(
                  eq(organisations.id, id),
                  eq(organisations.version, version),
                ),
              )
              .run().changes
          )
            conflict();
          audit(
            "organisation",
            id,
            actor,
            before as unknown as Record<string, unknown>,
            after as unknown as Record<string, unknown>,
            "restored",
          );
        } else if (kind === "interaction") {
          const before = db
            .select()
            .from(interactions)
            .where(eq(interactions.id, id))
            .get();
          if (!before) conflict();
          if (!before.deletedAt || before.version !== version) conflict();
          if (
            before.organisationId &&
            !db
              .select()
              .from(organisations)
              .where(
                and(
                  eq(organisations.id, before.organisationId),
                  isNull(organisations.deletedAt),
                ),
              )
              .get()
          )
            throw new RecordError(
              "The linked organisation is in the bin. Restore it first, or remove the link.",
            );
          if (
            before.projectId &&
            !db
              .select()
              .from(projects)
              .where(
                and(
                  eq(projects.id, before.projectId),
                  isNull(projects.deletedAt),
                ),
              )
              .get()
          )
            throw new RecordError(
              "The linked project is in the bin. Restore it first.",
            );
          const after = {
            ...before,
            version: before.version + 1,
            updatedAt: new Date().toISOString(),
            deletedAt: null,
          };
          if (
            !db
              .update(interactions)
              .set(after)
              .where(
                and(eq(interactions.id, id), eq(interactions.version, version)),
              )
              .run().changes
          )
            conflict();
          audit(
            "interaction",
            id,
            actor,
            before as unknown as Record<string, unknown>,
            after as unknown as Record<string, unknown>,
            "restored",
          );
        } else if (kind === "task") {
          const before = db.select().from(tasks).where(eq(tasks.id, id)).get();
          if (!before) conflict();
          if (!before.deletedAt || before.version !== version) conflict();
          if (
            before.organisationId &&
            !db
              .select()
              .from(organisations)
              .where(
                and(
                  eq(organisations.id, before.organisationId),
                  isNull(organisations.deletedAt),
                ),
              )
              .get()
          )
            throw new RecordError(
              "The linked organisation is in the bin. Restore it first, or remove the link.",
            );
          if (
            before.projectId &&
            !db
              .select()
              .from(projects)
              .where(
                and(
                  eq(projects.id, before.projectId),
                  isNull(projects.deletedAt),
                ),
              )
              .get()
          )
            throw new RecordError(
              "The linked project is in the bin. Restore it first, or remove the link.",
            );
          if (before.interactionId) {
            const note = db
              .select()
              .from(interactions)
              .where(eq(interactions.id, before.interactionId))
              .get();
            if (!note || note.deletedAt)
              throw new RecordError(
                "The source note is in the bin. Restore it first.",
              );
          }
          const after = {
            ...before,
            version: before.version + 1,
            updatedAt: new Date().toISOString(),
            deletedAt: null,
          };
          if (
            !db
              .update(tasks)
              .set(after)
              .where(and(eq(tasks.id, id), eq(tasks.version, version)))
              .run().changes
          )
            conflict();
          audit(
            "task",
            id,
            actor,
            before as unknown as Record<string, unknown>,
            after as unknown as Record<string, unknown>,
            "restored",
          );
        } else if (kind === "project") {
          const before = db
            .select()
            .from(projects)
            .where(eq(projects.id, id))
            .get();
          if (!before) conflict();
          if (!before.deletedAt || before.version !== version) conflict();
          const duplicate = db
            .select()
            .from(projects)
            .where(isNull(projects.deletedAt))
            .all()
            .find(
              (p) =>
                p.name.toLowerCase() === before.name.toLowerCase() &&
                p.id !== id,
            );
          if (duplicate)
            throw new RecordError(
              "A project with this name already exists. Rename before restoring.",
            );
          const now = new Date();
          const after = {
            ...before,
            version: before.version + 1,
            updatedAt: now,
            deletedAt: null,
          };
          if (
            !db
              .update(projects)
              .set(after)
              .where(and(eq(projects.id, id), eq(projects.version, version)))
              .run().changes
          )
            conflict();
          audit(
            "project",
            id,
            actor,
            before as unknown as Record<string, unknown>,
            after as unknown as Record<string, unknown>,
            "restored",
          );
        } else if (kind === "document") {
          const before = db
            .select()
            .from(documents)
            .where(eq(documents.id, id))
            .get();
          if (!before) conflict();
          if (!before.deletedAt || before.version !== version) conflict();
          const now = new Date();
          const after = {
            ...before,
            version: before.version + 1,
            updatedAt: now,
            deletedAt: null,
          };
          if (
            !db
              .update(documents)
              .set(after)
              .where(and(eq(documents.id, id), eq(documents.version, version)))
              .run().changes
          )
            conflict();
          audit(
            "document",
            id,
            actor,
            before as unknown as Record<string, unknown>,
            after as unknown as Record<string, unknown>,
            "restored",
          );
        }
        return id;
      });
    },
  };
}
export type Snapshot = ReturnType<ReturnType<typeof recordStore>["snapshot"]>;

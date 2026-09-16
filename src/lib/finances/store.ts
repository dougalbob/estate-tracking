import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import { RecordError, assertActor, versionConflict } from "../records/errors";
import { auditEntry } from "../records/audit";
import {
  financeMovementInput,
  financeRecordInput,
  financeCategories,
  movementKindFor,
  type financeKinds,
} from "../records/validation";
import { MoneyError, optionalPoundsToPence, formatPence } from "./money";
import type { FinanceMovement, FinanceRecord } from "./summary";

const { financeRecords, financeMovements, organisations, projects } = schema;

type RecordKind = (typeof financeKinds)[number];
type MovementKind = FinanceMovement["kind"];

const movementLabel: Record<MovementKind, string> = {
  proceeds: "Sale proceeds",
  payment: "Payment",
  reimbursement: "Reimbursement",
};

/** Amounts must be entered; only an asset value may be unknown for now. */
function amountPenceFor(amount: string, kind: RecordKind): number | null {
  let pence: number | null;
  try {
    pence = optionalPoundsToPence(amount);
  } catch (error) {
    if (error instanceof MoneyError)
      throw new RecordError(error.message, "validation");
    throw error;
  }
  if (pence === null) {
    if (kind === "asset") return null;
    throw new RecordError(
      kind === "liability" ? "Enter the amount owed" : "Enter an amount",
      "validation",
    );
  }
  if (pence <= 0)
    throw new RecordError("Enter an amount greater than £0.00", "validation");
  return pence;
}

/**
 * Estate finances, stored as integer pence. Records are corrected and voided
 * rather than erased: a void keeps the record visible, out of the totals, with
 * the reason and the actor in the history.
 */
export function financeStore(
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

  function relationCheck(input: {
    organisationId: string | null;
    projectId: string | null;
  }) {
    if (
      input.organisationId &&
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
    if (
      input.projectId &&
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

  function recordById(id: string): FinanceRecord {
    const record = db
      .select()
      .from(financeRecords)
      .where(eq(financeRecords.id, id))
      .get();
    if (!record || record.deletedAt)
      throw new RecordError("Financial record no longer available");
    return record;
  }

  function liveMovements(recordId: string, kind: MovementKind) {
    return db
      .select()
      .from(financeMovements)
      .where(
        and(
          eq(financeMovements.recordId, recordId),
          eq(financeMovements.kind, kind),
          isNull(financeMovements.deletedAt),
          isNull(financeMovements.voidedAt),
        ),
      )
      .all();
  }

  return {
    saveFinanceRecord(raw: unknown, actor: string) {
      assertActor(users, actor);
      const input = financeRecordInput.parse(raw);
      return db.transaction(() => {
        relationCheck(input);
        const before = input.id
          ? db
              .select()
              .from(financeRecords)
              .where(eq(financeRecords.id, input.id))
              .get()
          : undefined;
        if (
          input.id &&
          (!before || before.deletedAt || before.version !== input.version)
        )
          versionConflict();

        if (before && before.kind !== input.kind) {
          const movements = db
            .select()
            .from(financeMovements)
            .where(
              and(
                eq(financeMovements.recordId, before.id),
                isNull(financeMovements.deletedAt),
              ),
            )
            .all();
          if (movements.length)
            throw new RecordError(
              "This record has payments or proceeds recorded against it, so its type cannot change. Remove them first.",
              "validation",
            );
        }

        const amountPence = amountPenceFor(input.amount, input.kind);
        if (
          ["income", "expense", "distribution"].includes(input.kind) &&
          !input.occurredOn
        )
          throw new RecordError(
            "Enter the date this money moved. Assets and liabilities can keep their date blank.",
            "validation",
          );
        if (
          input.category &&
          !financeCategories[input.kind].includes(input.category)
        )
          throw new RecordError("Choose one of the listed categories");

        const fundedBy =
          input.kind === "expense" && input.fundedBy ? input.fundedBy : null;
        const beneficiary =
          input.kind === "distribution" && input.beneficiary
            ? input.beneficiary
            : null;
        if (fundedBy && !users.includes(fundedBy))
          throw new RecordError(
            "Choose Alex or Jamie – the person who paid personally",
          );
        if (beneficiary && !users.includes(beneficiary))
          throw new RecordError("Choose Alex or Jamie as the beneficiary");
        if (input.kind === "distribution" && !beneficiary)
          throw new RecordError(
            "Record which beneficiary received this distribution",
          );
        if (input.kind !== "expense" && input.fundedBy)
          throw new RecordError(
            "Only an expense can be marked as paid personally",
          );
        if (input.kind !== "distribution" && input.beneficiary)
          throw new RecordError(
            "Only a distribution is recorded against a beneficiary",
          );

        const now = new Date();
        const id = input.id || randomUUID();
        const after = {
          id,
          kind: input.kind,
          title: input.title,
          detail: input.detail,
          category: input.category,
          amountPence,
          occurredOn: input.occurredOn,
          fundedBy,
          beneficiary,
          organisationId: input.organisationId,
          projectId: input.projectId,
          voidedAt: before?.voidedAt ?? null,
          voidReason: before?.voidReason ?? null,
          version: (before?.version ?? 0) + 1,
          createdBy: before?.createdBy ?? actor,
          createdAt: before?.createdAt ?? now,
          updatedAt: now,
          deletedAt: null,
        };
        if (before) {
          if (
            !db
              .update(financeRecords)
              .set(after)
              .where(
                and(
                  eq(financeRecords.id, id),
                  eq(financeRecords.version, input.version!),
                ),
              )
              .run().changes
          )
            versionConflict();
        } else {
          db.insert(financeRecords).values(after).run();
        }
        audit(
          "finance_record",
          id,
          actor,
          (before as unknown as Record<string, unknown>) ?? null,
          after as unknown as Record<string, unknown>,
        );
        return id;
      });
    },

    saveFinanceMovement(raw: unknown, actor: string) {
      assertActor(users, actor);
      const input = financeMovementInput.parse(raw);
      return db.transaction(() => {
        const record = recordById(input.recordId);
        if (record.voidedAt)
          throw new RecordError(
            "This record is voided. Reinstate it before adding money against it.",
            "validation",
          );
        const expected = movementKindFor(record.kind);
        if (!expected || expected !== input.kind)
          throw new RecordError(
            expected
              ? `A ${record.kind} records ${movementLabel[expected].toLowerCase()} movements`
              : "Distributions and income are recorded directly, without movements",
            "validation",
          );

        let amountPence: number;
        try {
          const parsed = optionalPoundsToPence(input.amount);
          if (parsed === null) throw new MoneyError("Enter an amount");
          amountPence = parsed;
        } catch (error) {
          if (error instanceof MoneyError)
            throw new RecordError(error.message, "validation");
          throw error;
        }
        if (amountPence <= 0)
          throw new RecordError("Enter an amount greater than £0.00");

        const recorded = record.amountPence ?? 0;
        if (input.kind === "proceeds") {
          // Proceeds are a fact: they may be more or less than the estimate.
        } else {
          const already = liveMovements(record.id, input.kind).reduce(
            (total, movement) => total + movement.amountPence,
            0,
          );
          if (input.kind === "payment" && already + amountPence > recorded)
            throw new RecordError(
              `Payments cannot exceed the ${formatPence(recorded)} recorded as owed. ${formatPence(Math.max(0, recorded - already))} is still outstanding – correct the liability amount first if it has changed.`,
              "validation",
            );
          if (input.kind === "reimbursement") {
            if (!record.fundedBy)
              throw new RecordError(
                "Only an expense that was paid personally can be reimbursed. This one was paid from the estate.",
                "validation",
              );
            const remaining = recorded - already;
            if (remaining <= 0)
              throw new RecordError(
                "This expense has already been reimbursed in full.",
                "validation",
              );
            if (amountPence > remaining)
              throw new RecordError(
                `That is more than the ${formatPence(remaining)} still owed. Enter ${formatPence(remaining)} or less.`,
                "validation",
              );
          }
        }

        const before = input.id
          ? db
              .select()
              .from(financeMovements)
              .where(eq(financeMovements.id, input.id))
              .get()
          : undefined;
        if (
          input.id &&
          (!before ||
            before.deletedAt ||
            before.voidedAt ||
            before.version !== input.version)
        )
          versionConflict();
        if (before && before.recordId !== input.recordId)
          throw new RecordError("This movement belongs to another record");

        const now = new Date();
        const id = input.id || randomUUID();
        const after = {
          id,
          recordId: input.recordId,
          kind: input.kind,
          amountPence,
          occurredOn: input.occurredOn,
          detail: input.detail,
          voidedAt: before?.voidedAt ?? null,
          voidReason: before?.voidReason ?? null,
          version: (before?.version ?? 0) + 1,
          createdBy: before?.createdBy ?? actor,
          createdAt: before?.createdAt ?? now,
          updatedAt: now,
          deletedAt: null,
        };
        if (before) {
          if (
            !db
              .update(financeMovements)
              .set(after)
              .where(
                and(
                  eq(financeMovements.id, id),
                  eq(financeMovements.version, input.version!),
                ),
              )
              .run().changes
          )
            versionConflict();
        } else {
          db.insert(financeMovements).values(after).run();
        }
        audit(
          "finance_movement",
          id,
          actor,
          (before as unknown as Record<string, unknown>) ?? null,
          after as unknown as Record<string, unknown>,
        );
        return id;
      });
    },

    /** Voiding keeps the record visible with a reason; nothing is erased. */
    setFinanceVoid(
      input: {
        target: "record" | "movement";
        id: string;
        version: number;
        voided: boolean;
        reason?: string;
      },
      actor: string,
    ) {
      assertActor(users, actor);
      const reason = (input.reason ?? "").trim();
      if (input.voided && reason.length < 3)
        throw new RecordError(
          "Add a short reason so the void makes sense later",
          "validation",
        );
      return db.transaction(() => {
        const table =
          input.target === "record" ? financeRecords : financeMovements;
        const entity =
          input.target === "record" ? "finance_record" : "finance_movement";
        const before = db
          .select()
          .from(table)
          .where(eq(table.id, input.id))
          .get();
        if (!before || before.deletedAt) versionConflict();
        if (before.version !== input.version) versionConflict();
        const now = new Date();
        const after = {
          ...before,
          voidedAt: input.voided ? now : null,
          voidReason: input.voided ? reason : null,
          version: before.version + 1,
          updatedAt: now,
        } as unknown as Record<string, unknown>;
        if (
          !db
            .update(table)
            .set(after)
            .where(
              and(eq(table.id, input.id), eq(table.version, input.version)),
            )
            .run().changes
        )
          versionConflict();
        audit(
          entity,
          input.id,
          actor,
          before,
          after,
          input.voided ? "voided" : "reinstated",
        );
        return input.id;
      });
    },

    /**
     * Ordinary deletion puts a financial record in the recoverable bin. There is
     * no permanent erasure through the app: correcting or voiding is the way to
     * change what the numbers say.
     */
    deleteFinance(
      target: "record" | "movement",
      id: string,
      version: number,
      actor: string,
      permanent = false,
    ) {
      assertActor(users, actor);
      if (permanent)
        throw new RecordError(
          "Financial records are corrected or voided, not permanently deleted. Move it to the bin instead, or void it to take it out of the totals.",
          "validation",
        );
      return db.transaction(() => {
        const table = target === "record" ? financeRecords : financeMovements;
        const entity =
          target === "record" ? "finance_record" : "finance_movement";
        const before = db.select().from(table).where(eq(table.id, id)).get();
        if (!before) versionConflict();
        if (before.version !== version) versionConflict();
        if (before.deletedAt)
          throw new RecordError("This is already in the bin");
        if (target === "record" && before.voidedAt)
          throw new RecordError(
            "This record is voided. Reinstate it before moving it to the bin.",
          );
        const now = new Date();
        const after = {
          ...before,
          version: before.version + 1,
          updatedAt: now,
          deletedAt: now,
        };
        if (
          !db
            .update(table)
            .set(after)
            .where(and(eq(table.id, id), eq(table.version, version)))
            .run().changes
        )
          versionConflict();
        audit(entity, id, actor, before, after, "deleted");
        return id;
      });
    },

    restoreFinance(
      target: "record" | "movement",
      id: string,
      version: number,
      actor: string,
    ) {
      assertActor(users, actor);
      return db.transaction(() => {
        const table = target === "record" ? financeRecords : financeMovements;
        const entity =
          target === "record" ? "finance_record" : "finance_movement";
        const before = db.select().from(table).where(eq(table.id, id)).get();
        if (!before) versionConflict();
        if (!before.deletedAt || before.version !== version) versionConflict();
        if (target === "movement") {
          const record = db
            .select()
            .from(financeRecords)
            .where(eq(financeRecords.id, (before as FinanceMovement).recordId))
            .get();
          if (!record || record.deletedAt)
            throw new RecordError(
              "The financial record this belongs to is in the bin. Restore it first.",
            );
        }
        if (target === "record") {
          const record = before as FinanceRecord;
          if (record.organisationId) {
            const org = db
              .select()
              .from(organisations)
              .where(eq(organisations.id, record.organisationId))
              .get();
            if (!org || org.deletedAt)
              throw new RecordError(
                "The linked organisation is in the bin. Restore it first, or edit this record to remove the link.",
              );
          }
          if (record.projectId) {
            const project = db
              .select()
              .from(projects)
              .where(eq(projects.id, record.projectId))
              .get();
            if (!project || project.deletedAt)
              throw new RecordError(
                "The linked project is in the bin. Restore it first, or edit this record to remove the link.",
              );
          }
        }
        const now = new Date();
        const after = {
          ...before,
          version: before.version + 1,
          updatedAt: now,
          deletedAt: null,
        };
        if (
          !db
            .update(table)
            .set(after)
            .where(and(eq(table.id, id), eq(table.version, version)))
            .run().changes
        )
          versionConflict();
        audit(entity, id, actor, before, after, "restored");
        return id;
      });
    },
  };
}

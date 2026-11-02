/**
 * The probate record: one row, one estate.
 *
 * Everything here is a fact a person confirmed. The allowance arithmetic is not
 * stored — it is derived on every read from `allowances.ts` — so a figure on the
 * page can never disagree with the facts behind it.
 *
 * The rules that are enforced here, rather than in the browser, are the ones
 * that would otherwise become a quiet lie: a grant cannot be issued before the
 * death, a late spouse must have died first, and a percentage must be a share.
 */
import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import { RecordError, assertActor, versionConflict } from "../records/errors";
import { auditEntry } from "../records/audit";
import { probateRecordInput } from "../records/validation";
import { optionalPoundsToPence, MoneyError } from "../finances/money";
import { probateRates } from "./rates";

const { probateRecords } = schema;

/** The one row. Fixed id, so a second save can never create a second estate. */
export const probateRecordId = "estate";

export type ProbateRecord = typeof probateRecords.$inferSelect;

function moneyOrNull(typed: string, field: string): number | null {
  try {
    return optionalPoundsToPence(typed);
  } catch (error) {
    if (error instanceof MoneyError)
      throw new RecordError(`${field}: ${error.message}`, "validation");
    throw error;
  }
}

function beforeOrEqual(first: string | null, second: string | null) {
  return !first || !second || first <= second;
}

export function probateStore(
  db: BetterSQLite3Database<typeof schema>,
  users: string[],
) {
  function current(): ProbateRecord | undefined {
    return db
      .select()
      .from(probateRecords)
      .where(eq(probateRecords.id, probateRecordId))
      .get();
  }

  return {
    /** The one row, or undefined before anything has been recorded. */
    probateRecord(): ProbateRecord | undefined {
      const record = current();
      return record && !record.deletedAt ? record : undefined;
    },

    saveProbateRecord(raw: unknown, actor: string) {
      assertActor(users, actor);
      const input = probateRecordInput.parse(raw);
      return db.transaction(() => {
        const before = current();
        if (input.id && input.version && before?.version !== input.version)
          versionConflict();
        if (!input.id && before && !before.deletedAt)
          throw new RecordError(
            "There is already a probate record for this estate. Open it and edit it instead.",
            "conflict",
          );

        // The rules that would otherwise produce a confident, wrong page. Each
        // compares what this save will leave stored, not only what it sent, so
        // an edit that touches one field cannot pass a check against a date it
        // happens not to mention.
        const death = input.dateOfDeath ?? before?.dateOfDeath ?? null;
        const lateDeath =
          input.lateSpouseDateOfDeath ?? before?.lateSpouseDateOfDeath ?? null;
        if (!beforeOrEqual(death, input.grantAppliedOn))
          throw new RecordError(
            "The grant cannot have been applied for before the date of death.",
            "validation",
          );
        if (!beforeOrEqual(death, input.grantIssuedOn))
          throw new RecordError(
            "The grant cannot have been issued before the date of death.",
            "validation",
          );
        if (!beforeOrEqual(death, input.iht400SentOn))
          throw new RecordError(
            "The Inheritance Tax account cannot have been sent before the date of death.",
            "validation",
          );
        if (!beforeOrEqual(death, input.nrbClaimSentOn))
          throw new RecordError(
            "The claim cannot have been sent before the date of death.",
            "validation",
          );
        if (!beforeOrEqual(death, input.rnrbClaimSentOn))
          throw new RecordError(
            "The claim cannot have been sent before the date of death.",
            "validation",
          );
        if (lateDeath && death && lateDeath >= death)
          throw new RecordError(
            "The late spouse or civil partner must have died before the person whose estate this is.",
            "validation",
          );
        if (
          (input.nrbUnusedBp !== null || input.rnrbUnusedBp !== null) &&
          !lateDeath
        )
          throw new RecordError(
            "Record the late spouse's date of death before entering a transferred share. It is what the percentage is measured from.",
            "validation",
          );
        if (input.grantType === "not_needed" && input.grantIssuedOn)
          throw new RecordError(
            "No grant was needed, so no grant can have been issued. Clear the issued date, or choose the grant that was issued.",
            "validation",
          );

        const now = new Date();
        const after = {
          id: probateRecordId,
          deceasedName: input.deceasedName,
          dateOfDeath: input.dateOfDeath,
          grantType: input.grantType,
          grantAppliedOn: input.grantAppliedOn,
          grantIssuedOn: input.grantIssuedOn,
          registry: input.registry,
          grantReference: input.grantReference,
          lateSpouseName: input.lateSpouseName,
          lateSpouseDateOfDeath: input.lateSpouseDateOfDeath,
          nrbUnusedBp: input.nrbUnusedBp,
          rnrbUnusedBp: input.rnrbUnusedBp,
          netEstateAtDeathPence: moneyOrNull(
            input.netEstateAtDeath,
            "Net value of the estate at the date of death",
          ),
          qualifyingResidenceValuePence: moneyOrNull(
            input.qualifyingResidenceValue,
            "Value of the home left to direct descendants",
          ),
          residenceToDirectDescendants: input.residenceToDirectDescendants,
          downsizingAddition: input.downsizingAddition,
          iht400Needed: input.iht400Needed,
          iht400SentOn: input.iht400SentOn,
          nrbClaimSentOn: input.nrbClaimSentOn,
          rnrbClaimSentOn: input.rnrbClaimSentOn,
          claimReference: input.claimReference,
          claimedNrbPence: moneyOrNull(
            input.claimedNrb,
            "Nil rate band claimed",
          ),
          claimedRnrbPence: moneyOrNull(
            input.claimedRnrb,
            "Residence band claimed",
          ),
          // The published figures this save was measured against, kept so the
          // history still reads correctly after the app is updated.
          rates: probateRates,
          version: (before?.version ?? 0) + 1,
          createdBy: before?.createdBy ?? actor,
          createdAt: before?.createdAt ?? now,
          updatedAt: now,
          deletedAt: null,
        };

        if (before) {
          if (
            !db
              .update(probateRecords)
              .set(after)
              .where(eq(probateRecords.id, probateRecordId))
              .run().changes
          )
            versionConflict();
        } else {
          db.insert(probateRecords).values(after).run();
        }
        auditEntry(db, {
          entity: "probate_record",
          entityId: probateRecordId,
          actor,
          before: (before as unknown as Record<string, unknown>) ?? null,
          after: after as unknown as Record<string, unknown>,
        });
        return probateRecordId;
      });
    },
  };
}

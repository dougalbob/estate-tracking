import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import { RecordError, assertActor, versionConflict } from "../records/errors";
import { auditEntry } from "../records/audit";
import {
  householdInput,
  householdContactedInput,
  gatheringInput,
  type HouseholdInput,
} from "../records/validation";

const { households, gatherings } = schema;

export type Household = typeof households.$inferSelect;
export type Gathering = typeof gatherings.$inferSelect;

export type GuestSummary = {
  totalHouseholds: number;
  totalPeople: number;
  contactedCount: number;
  stillToRingCount: number;
  awaitingReplyCount: number;
  funeralAwaitingCount: number;
  wakeAwaitingCount: number;
  funeralComingCount: number;
  funeralComingPeople: number;
  wakeComingCount: number;
  wakeComingPeople: number;
};

export function guestSummary(list: Household[]): GuestSummary {
  const live = list.filter((h) => !h.deletedAt);
  const totalHouseholds = live.length;
  let totalPeople = 0;
  let contactedCount = 0;
  let stillToRingCount = 0;
  let awaitingReplyCount = 0;
  let funeralAwaitingCount = 0;
  let wakeAwaitingCount = 0;
  let funeralComingCount = 0;
  let funeralComingPeople = 0;
  let wakeComingCount = 0;
  let wakeComingPeople = 0;

  for (const h of live) {
    const size =
      typeof h.partySize === "number" && h.partySize >= 1 ? h.partySize : 1;
    totalPeople += size;
    if (h.contactedAt) {
      contactedCount += 1;
    } else {
      stillToRingCount += 1;
    }
    const isFuneralAwaiting = h.funeral === "awaiting_reply";
    const isWakeAwaiting = h.wake === "awaiting_reply";
    if (isFuneralAwaiting) funeralAwaitingCount += 1;
    if (isWakeAwaiting) wakeAwaitingCount += 1;
    if (isFuneralAwaiting || isWakeAwaiting) {
      awaitingReplyCount += 1;
    }

    if (h.funeral === "coming") {
      funeralComingCount += 1;
      funeralComingPeople += size;
    }
    if (h.wake === "coming") {
      wakeComingCount += 1;
      wakeComingPeople += size;
    }
  }

  return {
    totalHouseholds,
    totalPeople,
    contactedCount,
    stillToRingCount,
    awaitingReplyCount,
    funeralAwaitingCount,
    wakeAwaitingCount,
    funeralComingCount,
    funeralComingPeople,
    wakeComingCount,
    wakeComingPeople,
  };
}

export function guestSummaryLine(summary: GuestSummary): string {
  const funeralParty =
    summary.funeralComingPeople !== summary.funeralComingCount
      ? ` (${summary.funeralComingPeople} people)`
      : "";
  const wakeParty =
    summary.wakeComingPeople !== summary.wakeComingCount
      ? ` (${summary.wakeComingPeople} people)`
      : "";

  return `${summary.totalHouseholds} households · ${summary.totalPeople} people · ${summary.contactedCount} contacted · ${summary.awaitingReplyCount} awaiting reply · ${summary.funeralComingCount} coming to the funeral${funeralParty} · ${summary.wakeComingCount} to the wake${wakeParty} · ${summary.stillToRingCount} still to ring`;
}

export function guestStore(
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

  return {
    saveHousehold(raw: unknown, actor: string) {
      assertActor(users, actor);
      const input = householdInput.parse(raw);
      if (input.ringing && !users.includes(input.ringing)) {
        throw new RecordError(
          "Choose Alex or Jamie – the person ringing",
          "validation",
        );
      }

      return db.transaction(() => {
        const before = input.id
          ? db
              .select()
              .from(households)
              .where(eq(households.id, input.id))
              .get()
          : undefined;

        if (
          input.id &&
          (!before || before.deletedAt || before.version !== input.version)
        ) {
          versionConflict();
        }

        const now = new Date();
        const id = input.id || randomUUID();
        const after = {
          id,
          name: input.name,
          partySize: input.partySize,
          phone: input.phone,
          email: input.email,
          relationship: input.relationship,
          ringing: input.ringing,
          contactedAt:
            input.contactedAt !== undefined
              ? input.contactedAt
              : (before?.contactedAt ?? null),
          contactedBy:
            input.contactedBy !== undefined
              ? input.contactedBy
              : (before?.contactedBy ?? null),
          funeral: input.funeral,
          wake: input.wake,
          notes: input.notes,
          version: (before?.version ?? 0) + 1,
          createdBy: before?.createdBy ?? actor,
          createdAt: before?.createdAt ?? now,
          updatedAt: now,
          deletedAt: null,
        };

        if (before) {
          if (
            !db
              .update(households)
              .set(after)
              .where(
                and(
                  eq(households.id, id),
                  eq(households.version, input.version!),
                ),
              )
              .run().changes
          ) {
            versionConflict();
          }
        } else {
          db.insert(households).values(after).run();
        }

        audit(
          "household",
          id,
          actor,
          (before as unknown as Record<string, unknown>) ?? null,
          after as unknown as Record<string, unknown>,
        );
        return id;
      });
    },

    setHouseholdContacted(raw: unknown, actor: string) {
      assertActor(users, actor);
      const input = householdContactedInput.parse(raw);

      return db.transaction(() => {
        const before = db
          .select()
          .from(households)
          .where(eq(households.id, input.id))
          .get();

        if (!before || before.deletedAt || before.version !== input.version) {
          versionConflict();
        }

        const now = new Date();
        const contactedAt = input.contacted ? now.toISOString() : null;
        const contactedBy = input.contacted ? actor : null;
        const after = {
          ...before,
          contactedAt,
          contactedBy,
          version: before.version + 1,
          updatedAt: now,
        };

        if (
          !db
            .update(households)
            .set(after)
            .where(
              and(
                eq(households.id, input.id),
                eq(households.version, input.version),
              ),
            )
            .run().changes
        ) {
          versionConflict();
        }

        audit(
          "household",
          input.id,
          actor,
          before as unknown as Record<string, unknown>,
          after as unknown as Record<string, unknown>,
          input.contacted ? "contacted" : "uncontacted",
        );
        return input.id;
      });
    },

    deleteHousehold(
      id: string,
      version: number,
      actor: string,
      permanent = false,
    ) {
      assertActor(users, actor);
      return db.transaction(() => {
        const before = db
          .select()
          .from(households)
          .where(eq(households.id, id))
          .get();

        if (!before || before.version !== version) versionConflict();

        if (permanent) {
          if (!before.deletedAt) {
            throw new RecordError(
              "Move this record to the recoverable bin before permanent deletion",
              "validation",
            );
          }
          db.delete(households)
            .where(and(eq(households.id, id), eq(households.version, version)))
            .run();
          audit(
            "household",
            id,
            actor,
            before as unknown as Record<string, unknown>,
            { id },
            "permanently_deleted",
          );
          return id;
        }

        if (before.deletedAt) {
          throw new RecordError("This record is already in the bin");
        }

        const now = new Date();
        const after = {
          ...before,
          version: before.version + 1,
          updatedAt: now,
          deletedAt: now,
        };

        if (
          !db
            .update(households)
            .set(after)
            .where(and(eq(households.id, id), eq(households.version, version)))
            .run().changes
        ) {
          versionConflict();
        }

        audit(
          "household",
          id,
          actor,
          before as unknown as Record<string, unknown>,
          after as unknown as Record<string, unknown>,
          "deleted",
        );
        return id;
      });
    },

    restoreHousehold(id: string, version: number, actor: string) {
      assertActor(users, actor);
      return db.transaction(() => {
        const before = db
          .select()
          .from(households)
          .where(eq(households.id, id))
          .get();

        if (!before || !before.deletedAt || before.version !== version) {
          versionConflict();
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
            .update(households)
            .set(after)
            .where(and(eq(households.id, id), eq(households.version, version)))
            .run().changes
        ) {
          versionConflict();
        }

        audit(
          "household",
          id,
          actor,
          before as unknown as Record<string, unknown>,
          after as unknown as Record<string, unknown>,
          "restored",
        );
        return id;
      });
    },

    saveGathering(raw: unknown, actor: string) {
      assertActor(users, actor);
      const input = gatheringInput.parse(raw);
      return db.transaction(() => {
        const before = db
          .select()
          .from(gatherings)
          .where(eq(gatherings.id, input.id))
          .get();

        if (
          input.version !== undefined &&
          before &&
          before.version !== input.version
        ) {
          versionConflict();
        }

        const now = new Date();
        const id = input.id;
        const after = {
          id,
          name: input.name,
          date: input.date,
          time: input.time,
          place: input.place,
          notes: input.notes,
          version: (before?.version ?? 0) + 1,
          createdBy: before?.createdBy ?? actor,
          createdAt: before?.createdAt ?? now,
          updatedAt: now,
          deletedAt: null,
        };

        if (before) {
          db.update(gatherings).set(after).where(eq(gatherings.id, id)).run();
        } else {
          db.insert(gatherings).values(after).run();
        }

        audit(
          "gathering",
          id,
          actor,
          (before as unknown as Record<string, unknown>) ?? null,
          after as unknown as Record<string, unknown>,
        );
        return id;
      });
    },

    seedGatherings() {
      const now = new Date();
      const starter: [string, string][] = [
        ["funeral", "Funeral"],
        ["wake", "Wake"],
      ];
      for (const [id, name] of starter) {
        db.insert(gatherings)
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
      }
    },
  };
}

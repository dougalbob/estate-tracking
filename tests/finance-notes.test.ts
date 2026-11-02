import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "../src/lib/db/schema";
import { recordStore, RecordError } from "../src/lib/records/store";

const users = ["alex@example.invalid", "jamie@example.invalid"];
const alex = users[0];

function setup() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle" });
  const store = recordStore(db, users);
  store.seedProjects();
  return { sqlite, store };
}

const assetInput = {
  kind: "asset" as const,
  title: "12 Oakfield Road",
  detail: "",
  category: "property",
  amount: "250000",
  occurredOn: "2026-09-01",
  fundedBy: null,
  beneficiary: null,
  organisationId: null,
  projectId: null,
};

const noteInput = {
  organisationId: null,
  title: "",
  detail: "The estate agent says the roof will need doing before a sale.",
  kind: "note" as const,
  occurredAt: "2026-09-20T09:00:00.000Z",
  followUps: [],
};

test("a note can be filed against a financial record", () => {
  const { sqlite, store } = setup();
  try {
    const asset = store.saveFinanceRecord(assetInput, alex);
    const note = store.saveInteraction(
      { ...noteInput, financeRecordId: asset },
      alex,
    );
    const stored = store.snapshot().interactions.find((n) => n.id === note);
    assert.equal(stored?.financeRecordId, asset);
    assert.equal(stored?.detail, noteInput.detail);
    // It is an ordinary note: it keeps its author and reads as a quick note.
    assert.equal(stored?.createdBy, alex);
    assert.equal(stored?.title, "Quick note");
  } finally {
    sqlite.close();
  }
});

test("editing a note cannot move it to another record, or unfil it", () => {
  const { sqlite, store } = setup();
  try {
    const house = store.saveFinanceRecord(assetInput, alex);
    const car = store.saveFinanceRecord(
      { ...assetInput, title: "The car", category: "vehicle", amount: "8000" },
      alex,
    );
    const note = store.saveInteraction(
      { ...noteInput, financeRecordId: house },
      alex,
    );

    // The note form does not carry the link, so an edit arrives without it.
    store.saveInteraction(
      { ...noteInput, id: note, version: 1, detail: "Corrected wording." },
      alex,
    );
    let stored = store.snapshot().interactions.find((n) => n.id === note);
    assert.equal(stored?.financeRecordId, house);
    assert.equal(stored?.detail, "Corrected wording.");

    // Even an edit that names another record leaves it where it was set.
    store.saveInteraction(
      {
        ...noteInput,
        id: note,
        version: 2,
        financeRecordId: car,
      },
      alex,
    );
    stored = store.snapshot().interactions.find((n) => n.id === note);
    assert.equal(stored?.financeRecordId, house);
  } finally {
    sqlite.close();
  }
});

test("a note cannot be filed against a record that has gone to the bin", () => {
  const { sqlite, store } = setup();
  try {
    const asset = store.saveFinanceRecord(assetInput, alex);
    store.deleteFinance("record", asset, 1, alex);
    assert.throws(
      () =>
        store.saveInteraction({ ...noteInput, financeRecordId: asset }, alex),
      (error: unknown) =>
        error instanceof RecordError &&
        error.message === "The financial record is no longer available",
    );
    // An unknown id is refused in the same words, rather than filing a note
    // against nothing.
    assert.throws(
      () =>
        store.saveInteraction(
          { ...noteInput, financeRecordId: "not-a-record" },
          alex,
        ),
      RecordError,
    );
  } finally {
    sqlite.close();
  }
});

test("binning a record leaves its notes and their link alone", () => {
  const { sqlite, store } = setup();
  try {
    const asset = store.saveFinanceRecord(assetInput, alex);
    const note = store.saveInteraction(
      { ...noteInput, financeRecordId: asset },
      alex,
    );
    store.deleteFinance("record", asset, 1, alex);

    // The note is still a live note about something that happened; only the
    // record moved, and a restore brings it back with its notes attached.
    const live = store.snapshot().interactions.find((n) => n.id === note);
    assert.ok(live);
    assert.equal(live.financeRecordId, asset);

    store.restoreFinance("record", asset, 2, alex);
    assert.equal(
      store.snapshot().interactions.find((n) => n.id === note)?.financeRecordId,
      asset,
    );
  } finally {
    sqlite.close();
  }
});

test("an ordinary quick note is filed against nothing", () => {
  const { sqlite, store } = setup();
  try {
    const note = store.saveInteraction(noteInput, alex);
    assert.equal(
      store.snapshot().interactions.find((n) => n.id === note)?.financeRecordId,
      null,
    );
  } finally {
    sqlite.close();
  }
});

import assert from "node:assert/strict";
import test from "node:test";
import type {
  FinanceMovement,
  FinanceRecord,
} from "../src/lib/finances/summary";
import {
  financeTabs,
  registerRows,
  registerStatus,
  registerTotals,
  sortRegisterRows,
  type RegisterRow,
} from "../src/lib/finances/register";
import { financeKinds } from "../src/lib/records/validation";

const at = new Date("2026-09-01T10:00:00Z");

function record(overrides: Partial<FinanceRecord> = {}): FinanceRecord {
  return {
    id: "rec-1",
    kind: "asset",
    title: "A record",
    detail: "",
    category: null,
    amountPence: 100000,
    occurredOn: "2026-09-01",
    fundedBy: null,
    beneficiary: null,
    organisationId: null,
    projectId: null,
    voidedAt: null,
    voidReason: null,
    version: 1,
    createdBy: "alex@example.invalid",
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
    ...overrides,
  };
}

function movement(overrides: Partial<FinanceMovement> = {}): FinanceMovement {
  return {
    id: `mv-${Math.random().toString(36).slice(2)}`,
    recordId: "rec-1",
    kind: "proceeds",
    amountPence: 50000,
    occurredOn: "2026-09-02",
    detail: "",
    sourceLabel: null,
    voidedAt: null,
    voidReason: null,
    version: 1,
    createdBy: "alex@example.invalid",
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
    ...overrides,
  };
}

const rowOf = (r: FinanceRecord, movements: FinanceMovement[] = []) =>
  registerRows([r], movements)[0];

test("an asset moves from to realise, to part received, to realised", () => {
  const asset = record({ amountPence: 100000 });

  const start = rowOf(asset);
  assert.equal(start.status.key, "to_realise");
  assert.equal(start.valuePence, 100000);
  assert.equal(start.settledPence, 0);
  assert.equal(start.remainingPence, 100000);
  assert.equal(start.progress, 0);

  const part = rowOf(asset, [movement({ amountPence: 40000 })]);
  assert.equal(part.status.key, "part_received");
  assert.equal(part.remainingPence, 60000);
  assert.equal(part.progress, 0.4);

  const sold = rowOf(asset, [
    movement({ amountPence: 40000 }),
    movement({ amountPence: 60000 }),
  ]);
  assert.equal(sold.status.key, "realised");
  assert.equal(sold.status.tone, "good");
  assert.equal(sold.remainingPence, 0);
  assert.equal(sold.progress, 1);
});

test("an asset that sells above its estimate is never minus money", () => {
  const above = rowOf(record({ amountPence: 100000 }), [
    movement({ amountPence: 125000 }),
  ]);
  assert.equal(above.status.key, "above_estimate");
  assert.equal(above.remainingPence, 0);
  assert.equal(above.extraPence, 25000);
  assert.equal(above.progress, 1);
});

test("an asset with no value yet says so, and is never counted as zero", () => {
  const unvalued = rowOf(record({ amountPence: null }));
  assert.equal(unvalued.status.key, "not_valued");
  assert.equal(unvalued.status.tone, "attention");
  assert.equal(unvalued.valuePence, null);
  assert.equal(unvalued.progress, null);

  const totals = registerTotals([unvalued]);
  assert.equal(totals.unvaluedCount, 1);
  assert.equal(totals.valuePence, 0);
});

test("a liability is unpaid, part paid, settled, then overpaid", () => {
  const debt = record({ kind: "liability", amountPence: 90000 });
  assert.equal(rowOf(debt).status.key, "unpaid");
  assert.equal(
    rowOf(debt, [movement({ kind: "payment", amountPence: 9000 })]).status.key,
    "part_paid",
  );
  assert.equal(
    rowOf(debt, [movement({ kind: "payment", amountPence: 90000 })]).status.key,
    "settled",
  );
  const over = rowOf(debt, [
    movement({ kind: "payment", amountPence: 100000 }),
  ]);
  assert.equal(over.status.key, "overpaid");
  assert.equal(over.extraPence, 10000);
  assert.equal(over.remainingPence, 0);
});

test("only the movement kind a record accepts counts towards it", () => {
  // A payment recorded against an asset is not proceeds, so it changes nothing.
  const asset = rowOf(record({ amountPence: 100000 }), [
    movement({ kind: "payment", amountPence: 100000 }),
  ]);
  assert.equal(asset.settledPence, 0);
  assert.equal(asset.status.key, "to_realise");

  // Income and distributions accept no movement at all in this version.
  const income = rowOf(record({ kind: "income", amountPence: 5000 }), [
    movement({ kind: "proceeds", amountPence: 5000 }),
  ]);
  assert.equal(income.settledPence, 0);
  assert.equal(income.status.key, "received");
});

test("a personally paid expense is owed back until a reimbursement settles it", () => {
  const expense = record({
    kind: "expense",
    amountPence: 42000,
    fundedBy: "alex@example.invalid",
  });
  assert.equal(rowOf(expense).status.key, "to_reimburse");
  assert.equal(
    rowOf(expense, [movement({ kind: "reimbursement", amountPence: 42000 })])
      .status.key,
    "reimbursed",
  );

  // Paid from estate money, so nothing is owed to anyone.
  const estateExpense = record({
    kind: "expense",
    amountPence: 42000,
    fundedBy: null,
  });
  assert.equal(rowOf(estateExpense).status.key, "estate_paid");
  assert.equal(
    rowOf(estateExpense, [
      movement({ kind: "reimbursement", amountPence: 42000 }),
    ]).status.key,
    "estate_paid",
  );
});

test("voided records and voided movements stay visible but out of the numbers", () => {
  const voided = rowOf(
    record({ voidedAt: at, voidReason: "Duplicate entry" }),
    [movement({ amountPence: 100000 })],
  );
  assert.equal(voided.status.key, "voided");
  assert.equal(voided.status.label, "Voided");
  assert.equal(voided.remainingPence, 0);

  // A reinstated record with a voided movement: the voided money is not counted.
  const live = rowOf(record({ amountPence: 100000 }), [
    movement({ amountPence: 100000, voidedAt: at, voidReason: "Wrong amount" }),
    movement({ amountPence: 25000 }),
  ]);
  assert.equal(live.settledPence, 25000);
  assert.equal(live.status.key, "part_received");

  const binnedMovement = rowOf(record({ amountPence: 100000 }), [
    movement({ amountPence: 100000, deletedAt: at }),
  ]);
  assert.equal(binnedMovement.settledPence, 0);
});

test("the totals footer describes exactly the rows it is given", () => {
  const rows = registerRows(
    [
      record({ id: "a", title: "House", amountPence: 25000000 }),
      record({ id: "b", title: "Piano", amountPence: null }),
      record({ id: "c", title: "Savings", amountPence: 400000 }),
    ],
    [
      movement({ recordId: "a", amountPence: 25000000 }),
      movement({ recordId: "c", amountPence: 150000 }),
    ],
  );
  const totals = registerTotals(rows);
  assert.equal(totals.count, 3);
  assert.equal(totals.unvaluedCount, 1);
  assert.equal(totals.valuePence, 25400000);
  assert.equal(totals.settledPence, 25150000);
  assert.equal(totals.remainingPence, 250000);
});

test("sorting puts voided records last and keeps the direction you asked for", () => {
  const rows: RegisterRow[] = registerRows(
    [
      record({ id: "a", title: "Alpha", amountPence: 300 }),
      record({ id: "b", title: "Beta", amountPence: 100 }),
      record({
        id: "c",
        title: "Cancelled",
        amountPence: 999,
        voidedAt: at,
      }),
    ],
    [],
  );

  const descending = sortRegisterRows(rows, { key: "value", direction: -1 });
  assert.deepEqual(
    descending.map((r) => r.record.title),
    ["Alpha", "Beta", "Cancelled"],
  );

  const ascending = sortRegisterRows(rows, { key: "value", direction: 1 });
  assert.deepEqual(
    ascending.map((r) => r.record.title),
    ["Beta", "Alpha", "Cancelled"],
  );

  const byTitle = sortRegisterRows(rows, { key: "title", direction: 1 });
  assert.deepEqual(
    byTitle.map((r) => r.record.title),
    ["Alpha", "Beta", "Cancelled"],
  );
});

test("every kind of financial record has exactly one tab", () => {
  const covered = financeTabs.flatMap((tab) => tab.kinds as readonly string[]);
  assert.deepEqual([...covered].sort(), [...financeKinds].sort());
  assert.equal(new Set(covered).size, covered.length);
});

test("the status of a record with no movements reads honestly", () => {
  // Nothing is implied and nothing is hidden: a record with no money against it
  // still says what it is waiting for.
  const keys = financeKinds.map(
    (kind) => registerStatus(record({ kind, amountPence: 1000 }), 0).key,
  );
  assert.deepEqual(keys, [
    "to_realise",
    "unpaid",
    "received",
    "estate_paid",
    "allocated",
  ]);
});

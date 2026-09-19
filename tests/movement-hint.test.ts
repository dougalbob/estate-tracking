import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "../src/lib/db/schema";
import { recordStore, RecordError } from "../src/lib/records/store";
import { movementAmountHint } from "../src/lib/finances/movement-hint";
import { londonToday } from "../src/lib/records/validation";

// The figure beside the amount box is advice, and advice that disagrees with
// the server is worse than none. These tests cover the wording on its own, and
// then pin `blocks` against what the real store does with the same amount.

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

test("nothing is said where there is no balance to show", () => {
  // Distributions and income have no movement form at all.
  assert.equal(
    movementAmountHint({
      kind: null,
      typed: "100",
      recordedPence: 50000,
      alreadyPence: 0,
      fundedBy: null,
    }),
    null,
  );
  // Proceeds are a fact and have no ceiling, so there is nothing to warn about.
  assert.equal(
    movementAmountHint({
      kind: "proceeds",
      typed: "999999",
      recordedPence: 50000,
      alreadyPence: 0,
      fundedBy: null,
    }),
    null,
  );
  // An empty box, half-typed text and a zero are not errors yet: the field and
  // the server both have something to say about a zero, and "0" is usually the
  // start of "0.50".
  for (const typed of ["", "   ", "5.", "abc", "-20", "0", "0.00"])
    assert.equal(
      movementAmountHint({
        kind: "payment",
        typed,
        recordedPence: 50000,
        alreadyPence: 0,
        fundedBy: null,
      }),
      null,
      `expected no hint for "${typed}"`,
    );
});

test("a part payment shows what it leaves still owed", () => {
  const hint = movementAmountHint({
    kind: "payment",
    typed: "300",
    recordedPence: 50000,
    alreadyPence: 0,
    fundedBy: null,
  });
  assert.ok(hint);
  assert.equal(hint.blocks, false);
  assert.equal(
    hint.sentence,
    "£300.00 of the £500.00 still owed – leaves £200.00.",
  );
});

test("the payment that settles a liability says so, and does not block", () => {
  const hint = movementAmountHint({
    kind: "payment",
    typed: "500",
    recordedPence: 50000,
    alreadyPence: 0,
    fundedBy: null,
  });
  assert.ok(hint);
  assert.equal(hint.blocks, false);
  assert.equal(
    hint.sentence,
    "This settles the £500.00 recorded as owed in full.",
  );
});

test("an over-amount is blocked with the figure that is still owed", () => {
  const hint = movementAmountHint({
    kind: "payment",
    typed: "600",
    recordedPence: 50000,
    alreadyPence: 0,
    fundedBy: null,
  });
  assert.ok(hint);
  assert.equal(hint.blocks, true);
  assert.equal(
    hint.sentence,
    "That is more than the £500.00 still owed. Enter £500.00 or less.",
  );
});

test("what is already paid is taken off before the balance is shown", () => {
  // £500 owed, £200 already paid: £400 blocks, £300 does not.
  const over = movementAmountHint({
    kind: "payment",
    typed: "400",
    recordedPence: 50000,
    alreadyPence: 20000,
    fundedBy: null,
  });
  assert.ok(over);
  assert.equal(over.blocks, true);
  assert.match(over.sentence, /£300\.00 still owed/);
  const within = movementAmountHint({
    kind: "payment",
    typed: "250",
    recordedPence: 50000,
    alreadyPence: 20000,
    fundedBy: null,
  });
  assert.ok(within);
  assert.equal(within.blocks, false);
  assert.equal(
    within.sentence,
    "£250.00 of the £300.00 still owed – leaves £50.00.",
  );
  // …and £300 exactly settles it.
  const exact = movementAmountHint({
    kind: "payment",
    typed: "300",
    recordedPence: 50000,
    alreadyPence: 20000,
    fundedBy: null,
  });
  assert.ok(exact);
  assert.equal(exact.blocks, false);
  assert.equal(
    exact.sentence,
    "This settles the £500.00 recorded as owed in full.",
  );
});

test("a liability with nothing left to pay explains where to correct it", () => {
  const hint = movementAmountHint({
    kind: "payment",
    typed: "10",
    recordedPence: 50000,
    alreadyPence: 50000,
    fundedBy: null,
  });
  assert.ok(hint);
  assert.equal(hint.blocks, true);
  assert.equal(
    hint.sentence,
    "Nothing is left to pay on this record. If the amount owed has changed, correct it on the record first.",
  );
});

test("a payment against a record with no amount owed asks for one first", () => {
  const hint = movementAmountHint({
    kind: "payment",
    typed: "10",
    recordedPence: null,
    alreadyPence: 0,
    fundedBy: null,
  });
  assert.ok(hint);
  assert.equal(hint.blocks, true);
  assert.match(hint.sentence, /No amount is recorded as owed/);
});

test("a reimbursement needs an expense that was paid personally", () => {
  const hint = movementAmountHint({
    kind: "reimbursement",
    typed: "10",
    recordedPence: 5000,
    alreadyPence: 0,
    fundedBy: null,
  });
  assert.ok(hint);
  assert.equal(hint.blocks, true);
  assert.equal(
    hint.sentence,
    "Only an expense that was paid personally can be reimbursed. This one was paid from the estate.",
  );
});

test("reimbursements show their own balance, and block the same way", () => {
  const within = movementAmountHint({
    kind: "reimbursement",
    typed: "20",
    recordedPence: 5000,
    alreadyPence: 0,
    fundedBy: alex,
  });
  assert.ok(within);
  assert.equal(within.blocks, false);
  assert.equal(
    within.sentence,
    "£20.00 of the £50.00 still to reimburse – leaves £30.00.",
  );
  const over = movementAmountHint({
    kind: "reimbursement",
    typed: "60",
    recordedPence: 5000,
    alreadyPence: 0,
    fundedBy: alex,
  });
  assert.ok(over);
  assert.equal(over.blocks, true);
  assert.equal(
    over.sentence,
    "That is more than the £50.00 still to reimburse. Enter £50.00 or less.",
  );
  const done = movementAmountHint({
    kind: "reimbursement",
    typed: "10",
    recordedPence: 5000,
    alreadyPence: 5000,
    fundedBy: alex,
  });
  assert.ok(done);
  assert.equal(done.blocks, true);
  assert.equal(
    done.sentence,
    "This expense has already been reimbursed in full.",
  );
});

test("pounds are read the way the money helpers read them", () => {
  const hint = movementAmountHint({
    kind: "payment",
    typed: " £1,200.50 ",
    recordedPence: 200000,
    alreadyPence: 0,
    fundedBy: null,
  });
  assert.ok(hint);
  assert.equal(hint.blocks, false);
  assert.match(hint.sentence, /£1,200\.50 of the £2,000\.00/);
});

test("the hint blocks exactly when the store refuses the same amount", () => {
  const { sqlite, store } = setup();
  try {
    const liabilityId = store.saveFinanceRecord(
      {
        kind: "liability",
        title: "Inheritance tax instalment",
        detail: "",
        category: "unpaid_bill",
        amount: "500",
        occurredOn: "2026-09-01",
        fundedBy: null,
        beneficiary: null,
        organisationId: null,
        projectId: null,
      },
      alex,
    );
    const expenseId = store.saveFinanceRecord(
      {
        kind: "expense",
        title: "Solicitor fee paid personally",
        detail: "",
        category: "administration",
        amount: "50",
        occurredOn: "2026-09-02",
        fundedBy: alex,
        beneficiary: null,
        organisationId: null,
        projectId: null,
      },
      alex,
    );

    const cases: {
      kind: "payment" | "reimbursement";
      recordId: string;
      recordedPence: number;
      fundedBy: string | null;
      amounts: string[];
    }[] = [
      {
        kind: "payment",
        recordId: liabilityId,
        recordedPence: 50000,
        fundedBy: null,
        amounts: ["1", "250", "500", "500.01", "600", "0", "0.00"],
      },
      {
        kind: "reimbursement",
        recordId: expenseId,
        recordedPence: 5000,
        fundedBy: alex,
        amounts: ["1", "25", "50", "50.01", "60", "0", "0.00"],
      },
    ];

    let blocked = 0;
    let allowed = 0;
    for (const c of cases) {
      for (const amount of c.amounts) {
        const hint = movementAmountHint({
          kind: c.kind,
          typed: amount,
          recordedPence: c.recordedPence,
          alreadyPence: 0,
          fundedBy: c.fundedBy,
        });
        let refused: string | null = null;
        try {
          store.saveFinanceMovement(
            {
              recordId: c.recordId,
              kind: c.kind,
              amount,
              occurredOn: londonToday(),
            },
            alex,
          );
        } catch (error) {
          refused =
            error instanceof RecordError ? error.message : "unexpected failure";
        }
        const serverRefusedOverAmount =
          refused !== null && !/greater than £0\.00/.test(refused);
        assert.equal(
          hint?.blocks ?? false,
          serverRefusedOverAmount,
          `${c.kind} of ${amount}: hint said ${hint ? (hint.blocks ? "block" : "allow") : "nothing"}, store said ${refused ?? "saved"}`,
        );
        if (serverRefusedOverAmount) blocked++;
        else allowed++;
        // Nothing is written when the store refuses, so later cases see the
        // same starting balance; when it saves, move the movement to the bin so
        // the next case starts from the same place too. Money records are never
        // permanently deleted, so the bin is the cleanup the app itself offers,
        // and a binned movement no longer counts towards what is already paid.
        if (refused === null) {
          const snap = store.snapshot();
          const written = snap.financeMovements.find(
            (m) => m.recordId === c.recordId,
          );
          assert.ok(written, "a saved movement should be in the snapshot");
          store.deleteFinance("movement", written.id, written.version, alex);
        }
      }
    }
    // Both outcomes must have been exercised, or the comparison above proves
    // nothing: some amounts had to be refused and some saved.
    assert.ok(
      blocked >= 4,
      `expected refusals to be exercised, saw ${blocked}`,
    );
    assert.ok(allowed >= 4, `expected saves to be exercised, saw ${allowed}`);
  } finally {
    sqlite.close();
  }
});

import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "../src/lib/db/schema";
import { recordStore, RecordError } from "../src/lib/records/store";
import {
  calculateAllowances,
  formatShare,
  probateDeadlines,
  shareToBasisPoints,
  shareToInput,
  type AllowanceInput,
} from "../src/lib/probate/allowances";
import { probateRates } from "../src/lib/probate/rates";
import { probateView } from "../src/lib/probate/view";

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

/** A complete, ordinary set of facts: everything unrecorded except the death. */
const blank: AllowanceInput = {
  netEstateAtDeathPence: null,
  nrbUnusedBp: null,
  rnrbUnusedBp: null,
  qualifyingResidenceValuePence: null,
  residenceToDirectDescendants: "not_known",
  downsizingAddition: "not_known",
};

const pence = (pounds: number) => Math.round(pounds * 100);

test("the published figures are the ones this app quotes, and the date is present", () => {
  // 325,000 and 175,000, checked against GOV.UK on 2 November 2026. If the
  // figures ever change, this test is the reminder to update the date with them.
  assert.equal(probateRates.nrbPence, pence(325_000));
  assert.equal(probateRates.rnrbPence, pence(175_000));
  assert.equal(probateRates.taperThresholdPence, pence(2_000_000));
  assert.match(probateRates.checkedOn, /^\d{4}-\d{2}-\d{2}$/);
});

test("the basic band is the band plus the unused share, capped at 100%", () => {
  const none = calculateAllowances({ ...blank, nrbUnusedBp: 0 });
  assert.deepEqual(none.basicBand, { state: "known", pence: pence(325_000) });

  const full = calculateAllowances({ ...blank, nrbUnusedBp: 10_000 });
  assert.deepEqual(full.basicBand, { state: "known", pence: pence(650_000) });

  // A fractional share is honoured to the penny, not rounded to a whole percent.
  const part = calculateAllowances({ ...blank, nrbUnusedBp: 3_750 });
  assert.deepEqual(part.basicBand, {
    state: "known",
    pence: pence(325_000) + pence(121_875),
  });

  // The wire type caps at 100%: a second late spouse cannot take it past that.
  assert.throws(
    () => calculateAllowances({ ...blank, nrbUnusedBp: 12_000 }),
    RangeError,
  );
});

test("the residence band is capped at the home and tapered above £2 million", () => {
  const home = (net: number, value: number) =>
    calculateAllowances({
      ...blank,
      nrbUnusedBp: 10_000,
      rnrbUnusedBp: 10_000,
      netEstateAtDeathPence: pence(net),
      qualifyingResidenceValuePence: pence(value),
      residenceToDirectDescendants: "yes",
    });

  // The demo estate: a £250,000 house, so £100,000 of the combined band is lost.
  const capped = home(285_000, 250_000);
  assert.deepEqual(capped.residenceBand, {
    state: "known",
    pence: pence(250_000),
  });
  assert.deepEqual(capped.basicBand, { state: "known", pence: pence(650_000) });
  assert.equal(capped.totalPence, pence(900_000));
  assert.ok(capped.notes.some((n) => /capped at the value/.test(n)));

  // A house worth more than the band: the band is the limit.
  assert.deepEqual(home(900_000, 700_000).residenceBand, {
    state: "known",
    pence: pence(350_000),
  });

  // Exactly at the threshold, no taper.
  assert.deepEqual(home(2_000_000, 700_000).residenceBand, {
    state: "known",
    pence: pence(350_000),
  });

  // £2.1m: £50,000 of reduction, so £300,000 of combined band.
  const tapered = home(2_100_000, 700_000);
  assert.deepEqual(tapered.residenceBand, {
    state: "known",
    pence: pence(300_000),
  });
  assert.ok(tapered.notes.some((n) => /threshold is not doubled/.test(n)));

  // £2.35m removes one band (£175,000), so £175,000 of the combined band is
  // left — a single band, not zero.
  assert.deepEqual(home(2_350_000, 700_000).residenceBand, {
    state: "known",
    pence: pence(175_000),
  });

  // £2.7m removes the combined band entirely. The couple figure is not £4m.
  assert.deepEqual(home(2_700_000, 700_000).residenceBand, {
    state: "known",
    pence: 0,
  });
});

test("a share of a home is valued as the share, not the whole house", () => {
  const result = calculateAllowances({
    ...blank,
    nrbUnusedBp: 10_000,
    rnrbUnusedBp: 10_000,
    netEstateAtDeathPence: pence(500_000),
    qualifyingResidenceValuePence: pence(120_000),
    residenceToDirectDescendants: "yes",
  });
  assert.deepEqual(result.residenceBand, {
    state: "known",
    pence: pence(120_000),
  });
});

test("no qualifying home means no residence band, and the reason is kept", () => {
  const result = calculateAllowances({
    ...blank,
    nrbUnusedBp: 10_000,
    rnrbUnusedBp: 10_000,
    netEstateAtDeathPence: pence(285_000),
    qualifyingResidenceValuePence: pence(250_000),
    residenceToDirectDescendants: "no",
    downsizingAddition: "no",
  });
  assert.equal(result.residenceBand.state, "not_applicable");
  assert.deepEqual(result.basicBand, { state: "known", pence: pence(650_000) });
  assert.equal(result.totalPence, pence(650_000));
});

test("'not recorded yet' is never treated as zero", () => {
  const result = calculateAllowances(blank);
  assert.equal(result.basicBand.state, "unrecorded");
  assert.equal(result.residenceBand.state, "unrecorded");
  assert.equal(result.totalPence, null);
  assert.equal(result.lowerBoundPence, 0);
  assert.ok(result.unconfirmed.length >= 4);
  assert.ok(
    result.unconfirmed.some((line) => /net value of the estate/.test(line)),
  );

  // A line that does not apply is a settled zero, not a missing figure: with
  // "no home to direct descendants" recorded, the basic band alone is the
  // answer rather than a withheld total.
  const settled = calculateAllowances({
    ...blank,
    nrbUnusedBp: 10_000,
    residenceToDirectDescendants: "no",
    downsizingAddition: "no",
  });
  assert.equal(settled.totalPence, pence(650_000));
  assert.equal(settled.residenceBand.state, "not_applicable");

  // One line genuinely unrecorded: the total is withheld, and the lower bound
  // is the figure the confirmed facts support rather than a guess.
  const half = calculateAllowances({
    ...blank,
    nrbUnusedBp: 10_000,
    residenceToDirectDescendants: "yes",
  });
  assert.equal(half.totalPence, null);
  assert.equal(half.lowerBoundPence, pence(650_000));
});

test("the allowance never includes a tax figure", () => {
  const result = calculateAllowances({
    ...blank,
    nrbUnusedBp: 10_000,
    rnrbUnusedBp: 10_000,
    netEstateAtDeathPence: pence(900_000),
    qualifyingResidenceValuePence: pence(500_000),
    residenceToDirectDescendants: "yes",
    downsizingAddition: "no",
  });
  // The type has no tax field — this is a compile-time guard spelled out as a
  // runtime one, so a future edit that adds one is caught here too.
  const keys = Object.keys(result).sort();
  assert.deepEqual(keys, [
    "basicBand",
    "lowerBoundPence",
    "notes",
    "rates",
    "residenceBand",
    "residenceMaximum",
    "taper",
    "totalPence",
    "unconfirmed",
  ]);
  for (const note of result.notes)
    assert.doesNotMatch(note, /\b(40%|40 per cent|tax due|you will pay)\b/i);
});

test("percentages survive the round trip through an input box", () => {
  assert.equal(shareToBasisPoints("100"), 10_000);
  assert.equal(shareToBasisPoints("37.5"), 3_750);
  assert.equal(shareToBasisPoints("0"), 0);
  assert.equal(shareToBasisPoints(""), null);
  assert.equal(shareToBasisPoints(" 12 % "), 1_200);
  assert.throws(() => shareToBasisPoints("101"), RangeError);
  assert.throws(() => shareToBasisPoints("-1"), RangeError);
  assert.throws(() => shareToBasisPoints("half"), RangeError);
  assert.equal(formatShare(10_000), "100%");
  assert.equal(formatShare(3_750), "37.5%");
  assert.equal(formatShare(1_250), "12.5%");
  assert.equal(shareToInput(3_750), "37.5");
  assert.equal(shareToInput(10_000), "100");
  assert.equal(shareToInput(null), "");
});

test("the deadlines follow the date of death, and are absent without it", () => {
  assert.deepEqual(probateDeadlines(null), []);
  const dates = probateDeadlines("2026-09-12");
  assert.equal(dates.length, 2);
  assert.equal(dates[0].on, "2027-09-12");
  assert.equal(dates[1].on, "2028-09-12");
  assert.match(dates[1].detail, /never carried across automatically/);
  // A month-end date does not roll into the next month by accident.
  assert.equal(probateDeadlines("2026-01-31")[0].on, "2027-01-31");
});

test("the probate record saves once, keeps its history, and refuses a stale edit", () => {
  const { sqlite, store } = setup();
  try {
    assert.equal(store.snapshot().probateRecord, undefined);

    store.saveProbateRecord(
      {
        deceasedName: "Margaret Example",
        dateOfDeath: "2026-09-12",
        grantType: "probate",
        grantAppliedOn: "2026-10-01",
        lateSpouseName: "John Example",
        lateSpouseDateOfDeath: "2010-06-04",
        nrbUnusedBp: 10_000,
        rnrbUnusedBp: 10_000,
        netEstateAtDeath: "285000",
        qualifyingResidenceValue: "250000",
        residenceToDirectDescendants: "yes",
      },
      alex,
    );

    const saved = store.snapshot().probateRecord!;
    assert.equal(saved.id, "estate");
    assert.equal(saved.netEstateAtDeathPence, pence(285_000));
    assert.equal(saved.nrbUnusedBp, 10_000);
    assert.equal(saved.grantType, "probate");
    // The published figures are stamped on the row when it is saved.
    assert.equal(saved.rates?.nrbPence, pence(325_000));

    // A second, unversioned save would create a second estate. It refuses.
    assert.throws(
      () => store.saveProbateRecord({ dateOfDeath: "2026-09-12" }, alex),
      RecordError,
    );

    // A stale version is a conflict, not an overwrite.
    assert.throws(
      () =>
        store.saveProbateRecord(
          {
            id: "estate",
            version: saved.version + 5,
            dateOfDeath: "2026-09-12",
          },
          alex,
        ),
      (error: unknown) =>
        error instanceof RecordError && error.code === "conflict",
    );

    store.saveProbateRecord(
      {
        id: "estate",
        version: saved.version,
        dateOfDeath: "2026-09-12",
        grantType: "probate",
        grantIssuedOn: "2026-11-20",
        claimReference: "HMRC-123",
        nrbUnusedBp: 10_000,
        rnrbUnusedBp: 10_000,
        netEstateAtDeath: "285000",
        qualifyingResidenceValue: "250000",
        residenceToDirectDescendants: "yes",
      },
      users[1],
    );
    const edited = store.snapshot().probateRecord!;
    assert.equal(edited.version, 2);
    assert.equal(edited.grantIssuedOn, "2026-11-20");
    assert.equal(edited.claimReference, "HMRC-123");

    // History: created by Alex, edited by Jamie, with the before value kept.
    const history = store
      .snapshot()
      .revisions.filter((r) => r.entity === "probate_record");
    assert.equal(history.length, 2);
    const latest = history[0];
    assert.equal(latest.actor, users[1]);
    assert.equal(latest.action, "updated");
    assert.equal(
      (latest.before as { claimReference: string | null }).claimReference,
      null,
    );
    assert.equal(
      (latest.after as { claimReference: string }).claimReference,
      "HMRC-123",
    );
  } finally {
    sqlite.close();
  }
});

test("the store refuses facts that would make the page lie", () => {
  const { sqlite, store } = setup();
  const save = (input: Record<string, unknown>) =>
    store.saveProbateRecord(input, alex);
  try {
    // A grant cannot be applied for before the death.
    assert.throws(
      () =>
        save({
          dateOfDeath: "2026-09-12",
          grantType: "probate",
          grantAppliedOn: "2026-09-01",
        }),
      /cannot have been applied for before the date of death/,
    );
    // A late spouse must have died first.
    assert.throws(
      () =>
        save({
          dateOfDeath: "2026-09-12",
          lateSpouseDateOfDeath: "2026-09-12",
          nrbUnusedBp: 10_000,
        }),
      /must have died before/,
    );
    // A transferred share needs the first death to measure from.
    assert.throws(
      () => save({ dateOfDeath: "2026-09-12", nrbUnusedBp: 10_000 }),
      /Record the late spouse's date of death/,
    );
    // No grant needed cannot have issued one.
    assert.throws(
      () =>
        save({
          dateOfDeath: "2026-09-12",
          grantType: "not_needed",
          grantIssuedOn: "2026-10-01",
        }),
      /No grant was needed/,
    );
    // A percentage over 100 is refused by the validator, not stored as if it were.
    assert.throws(() =>
      save({
        dateOfDeath: "2026-09-12",
        lateSpouseDateOfDeath: "2010-06-04",
        nrbUnusedBp: 10_500,
      }),
    );
    // Nothing was written by any of the refusals.
    assert.equal(store.snapshot().probateRecord, undefined);

    // An amount that is not pounds is named rather than swallowed.
    assert.throws(
      () =>
        save({
          dateOfDeath: "2026-09-12",
          netEstateAtDeath: "about three hundred thousand",
        }),
      /Net value of the estate at the date of death/,
    );
  } finally {
    sqlite.close();
  }
});

test("the view brings the record, the allowances and the deadlines together", () => {
  const { sqlite, store } = setup();
  try {
    const empty = probateView(store.snapshot());
    assert.equal(empty.record, undefined);
    assert.equal(empty.allowances.totalPence, null);
    assert.deepEqual(empty.deadlines, []);

    store.saveProbateRecord(
      {
        deceasedName: "Margaret Example",
        dateOfDeath: "2026-09-12",
        grantType: "probate",
        lateSpouseDateOfDeath: "2010-06-04",
        nrbUnusedBp: 10_000,
        rnrbUnusedBp: 10_000,
        netEstateAtDeath: "285000",
        qualifyingResidenceValue: "250000",
        residenceToDirectDescendants: "yes",
      },
      alex,
    );
    const view = probateView(store.snapshot());
    assert.equal(view.record?.deceasedName, "Margaret Example");
    assert.equal(view.allowances.totalPence, pence(900_000));
    assert.equal(view.deadlines[0].on, "2027-09-12");
    // The probation project the page renders underneath is the seeded one.
    assert.equal(view.project?.id, "probate");
    assert.equal(view.project?.name, "Probate & Estate Administration");
  } finally {
    sqlite.close();
  }
});

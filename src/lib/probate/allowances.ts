/**
 * The Inheritance Tax allowances, worked out from facts the users confirmed.
 *
 * What this module does and does not do is deliberate, and the shape of the
 * result enforces it: there is **no tax field**. It works out how much of the
 * estate the two nil rate bands cover, and it stops there. It never decides
 * whether a full account is needed, never says what a claim is worth before HMRC
 * has accepted it, and never multiplies anything by a rate of tax.
 *
 * The rules it follows, checked against GOV.UK on the date in `rates.ts`:
 *
 *  - Basic band: £325,000 plus the unused percentage from a late spouse, applied
 *    to the band in force at the second death. The transfer is capped at 100%.
 *  - Residence band: £175,000 plus the unused percentage from a late spouse,
 *    also capped at 100% in total. Unlike the basic band it is not available on
 *    lifetime gifts and it is only ever set against the estate at death.
 *  - Taper: above £2,000,000 the residence band reduces by £1 for every £2 over,
 *    and the £2,000,000 is **not** doubled for a couple.
 *  - Cap: the residence band is the lower of the tapered figure and the value of
 *    the home (or share) that passed to direct descendants. A house worth less
 *    than the combined band means part of the band is simply not available; it is
 *    never carried across to the savings.
 *  - No qualifying home, no residence band — unless the downsizing rules apply.
 *
 * "Not recorded yet" is never treated as zero. A missing figure makes the line
 * unknown, and the total is then reported as a lower bound with the reason, so a
 * blank can never look like "nothing is due".
 */
import { probateRates, type ProbateRates } from "./rates";

export type YesNoUnknown = "yes" | "no" | "not_known";

export type AllowanceInput = {
  /** Net value of the estate at the date of death, in pence. */
  netEstateAtDeathPence: number | null;
  /** The unused share of the basic band from a late spouse, basis points. */
  nrbUnusedBp: number | null;
  /** The unused share of the residence band from a late spouse, basis points. */
  rnrbUnusedBp: number | null;
  /** The home, or share of it, that passed to direct descendants. */
  qualifyingResidenceValuePence: number | null;
  residenceToDirectDescendants: YesNoUnknown;
  downsizingAddition: YesNoUnknown;
};

/**
 * One line of the worksheet. `known` carries the figure; `unrecorded` says which
 * fact is missing in the words the person will read; `not_applicable` carries the
 * sentence explaining why the line is nil, so nothing is ever silently dropped.
 */
export type AllowanceLine =
  | { state: "known"; pence: number }
  | { state: "unrecorded"; missing: string }
  | { state: "not_applicable"; reason: string };

export type AllowanceResult = {
  rates: ProbateRates;
  basicBand: AllowanceLine;
  residenceMaximum: AllowanceLine;
  taper: AllowanceLine;
  residenceBand: AllowanceLine;
  /** Basic band plus residence band, present only when nothing is unknown. */
  totalPence: number | null;
  /**
   * The lowest figure the confirmed facts support, used when something is
   * missing. Never presented as the answer: the page says "at least".
   */
  lowerBoundPence: number;
  /** Plain sentences naming what is still unconfirmed, in reading order. */
  unconfirmed: string[];
  /** Plain sentences noting what was checked and what the result excludes. */
  notes: string[];
};

const pct = (pence: number, basisPoints: number) =>
  // Basis points of a pence amount, rounded to the nearest penny. Integer maths
  // throughout so a percentage can never drift by a penny across a refresh.
  Math.round((pence * basisPoints) / 10_000);

function transfer(
  unusedBp: number | null,
  missing: string,
): AllowanceLine | number {
  if (unusedBp === null) return { state: "unrecorded", missing };
  if (unusedBp < 0 || unusedBp > 10_000)
    throw new RangeError("A transferred share must be between 0% and 100%");
  return Math.min(unusedBp, 10_000);
}

/**
 * Work out the allowances. Pure: the same input always gives the same output,
 * and nothing is stored.
 */
export function calculateAllowances(
  input: AllowanceInput,
  rates: ProbateRates = probateRates,
): AllowanceResult {
  const unconfirmed: string[] = [];
  const notes: string[] = [];

  // ---- Basic band ---------------------------------------------------------
  const nrbShare = transfer(
    input.nrbUnusedBp,
    "the unused nil rate band from the late spouse",
  );
  let basicBand: AllowanceLine;
  if (typeof nrbShare === "number") {
    if (input.nrbUnusedBp === 10_000)
      notes.push(
        "The whole of the late spouse's nil rate band is carried across. That is the usual position where everything passed to the survivor and no chargeable gifts were made in the seven years before that death — IHT402 confirms it.",
      );
    basicBand = {
      state: "known",
      pence: rates.nrbPence + pct(rates.nrbPence, nrbShare),
    };
  } else {
    basicBand = nrbShare;
    unconfirmed.push(
      "How much of the nil rate band the first death left unused.",
    );
  }

  // ---- Residence maximum, before the home and the taper --------------------
  const rnrbShare = transfer(
    input.rnrbUnusedBp,
    "the unused residence band from the late spouse",
  );
  let residenceMaximum: AllowanceLine;
  if (typeof rnrbShare === "number") {
    residenceMaximum = {
      state: "known",
      pence: rates.rnrbPence + pct(rates.rnrbPence, rnrbShare),
    };
  } else {
    residenceMaximum = rnrbShare;
    unconfirmed.push(
      "How much of the residence band the first death left unused — 100% where that death was before 6 April 2017 and the estate was under £2 million.",
    );
  }

  // ---- Taper --------------------------------------------------------------
  let taper: AllowanceLine;
  if (input.netEstateAtDeathPence === null) {
    taper = {
      state: "unrecorded",
      missing: "the net value of the estate at the date of death",
    };
    unconfirmed.push(
      "The net value of the estate at the date of death, which decides whether the £2 million taper applies.",
    );
  } else {
    const excess = Math.max(
      0,
      input.netEstateAtDeathPence - rates.taperThresholdPence,
    );
    taper = {
      state: "known",
      pence: Math.round(excess / 2),
    };
  }

  // ---- The residence band -------------------------------------------------
  let residenceBand: AllowanceLine;
  const noHome =
    input.residenceToDirectDescendants === "no" &&
    input.downsizingAddition !== "yes";
  if (noHome) {
    residenceBand = {
      state: "not_applicable",
      reason:
        "No home passed to direct descendants, so there is no residence band. The carry-over from a late spouse cannot be used without one unless the downsizing rules apply.",
    };
  } else if (
    input.residenceToDirectDescendants === "not_known" ||
    (input.residenceToDirectDescendants === "no" &&
      input.downsizingAddition === "not_known")
  ) {
    residenceBand = {
      state: "unrecorded",
      missing: "whether a home passed to direct descendants",
    };
    unconfirmed.push(
      "Whether a home, or a share of one, passed to direct descendants.",
    );
  } else if (residenceMaximum.state !== "known") {
    residenceBand = {
      state: "unrecorded",
      missing: "the residence band share",
    };
  } else if (taper.state !== "known") {
    residenceBand = { state: "unrecorded", missing: "the net estate value" };
  } else if (
    input.qualifyingResidenceValuePence === null &&
    input.downsizingAddition !== "yes"
  ) {
    // A downsizing addition can stand in for a home that was sold, so the value
    // field is only strictly required when there was no downsizing.
    residenceBand = {
      state: "unrecorded",
      missing: "the value of the home that passed to direct descendants",
    };
    unconfirmed.push(
      "The value of the home (or share) that passed to direct descendants.",
    );
  } else {
    const afterTaper = Math.max(0, residenceMaximum.pence - taper.pence);
    const homeValue = input.qualifyingResidenceValuePence ?? afterTaper;
    const band = Math.min(afterTaper, homeValue);
    residenceBand = { state: "known", pence: band };
    if (afterTaper < residenceMaximum.pence)
      notes.push(
        "The £2 million taper reduced the residence band. The threshold is not doubled for a couple.",
      );
    if (homeValue < afterTaper)
      notes.push(
        "The residence band is capped at the value of the home left to direct descendants. The rest of the band is not used against the other assets.",
      );
    if (input.downsizingAddition === "yes")
      notes.push(
        "A downsizing addition is recorded. Its amount is worked out on IHT435; this worksheet uses the residence value entered.",
      );
  }

  // ---- Totals -------------------------------------------------------------
  // A line that does not apply is a settled zero, not a missing figure: "no home
  // went to direct descendants" is an answer, even though it leaves the band nil.
  const settled = (line: AllowanceLine) =>
    line.state === "known"
      ? line.pence
      : line.state === "not_applicable"
        ? 0
        : null;
  const basicFigure = settled(basicBand);
  const residenceFigure = settled(residenceBand);
  const totalPence =
    basicFigure === null || residenceFigure === null
      ? null
      : basicFigure + residenceFigure;
  const lowerBoundPence = (basicFigure ?? 0) + (residenceFigure ?? 0);

  return {
    rates,
    basicBand,
    residenceMaximum,
    taper,
    residenceBand,
    totalPence,
    lowerBoundPence,
    unconfirmed,
    notes,
  };
}

/** 10000 → "100%", 3750 → "37.5%". Never a bare float on screen. */
export function formatShare(basisPoints: number): string {
  const whole = Math.floor(basisPoints / 100);
  const fraction = basisPoints % 100;
  if (!fraction) return `${whole}%`;
  return `${whole}.${String(fraction).padStart(2, "0").replace(/0$/, "")}%`;
}

/** A percentage typed by a person ("37.5") as basis points, or null when blank. */
export function shareToBasisPoints(value: string): number | null {
  const cleaned = value.replace(/[%\s]/g, "").trim();
  if (!cleaned) return null;
  if (!/^\d{1,3}(?:\.\d{1,2})?$/.test(cleaned))
    throw new RangeError("Enter a percentage between 0 and 100");
  const [whole, fraction = ""] = cleaned.split(".");
  const basisPoints = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (basisPoints < 0 || basisPoints > 10_000)
    throw new RangeError("Enter a percentage between 0 and 100");
  return basisPoints;
}

/** 10000 basis points typed back into an input box as "100". */
export function shareToInput(basisPoints: number | null): string {
  if (basisPoints === null) return "";
  const whole = Math.floor(basisPoints / 100);
  const fraction = basisPoints % 100;
  if (!fraction) return String(whole);
  return `${whole}.${String(fraction).padStart(2, "0").replace(/0$/, "")}`;
}

/**
 * The dates that follow from the death, as plain Facts with the sentence that
 * explains each. Nothing here is a deadline the app enforces; they are the
 * published windows, shown so nobody has to hold them in their head.
 */
export function probateDeadlines(
  dateOfDeath: string | null,
): { label: string; on: string; detail: string }[] {
  if (!dateOfDeath) return [];
  const day = new Date(`${dateOfDeath}T00:00:00Z`);
  if (Number.isNaN(day.getTime())) return [];
  const addMonths = (months: number) => {
    const next = new Date(day);
    next.setUTCMonth(next.getUTCMonth() + months);
    return next.toISOString().slice(0, 10);
  };
  return [
    {
      label: "Inheritance Tax account (IHT400)",
      on: addMonths(12),
      detail:
        "If full details of the estate are needed, they go to HMRC within 12 months of the death and before applying for probate.",
    },
    {
      label: "Claim a transferred band (IHT402 and IHT436)",
      on: addMonths(24),
      detail:
        "An unused band from a late spouse is never carried across automatically. The claim must reach HMRC within 2 years of the death — the forms put it as 24 months after the end of the month of the death.",
    },
  ];
}

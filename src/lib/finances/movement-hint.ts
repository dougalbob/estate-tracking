/**
 * The figure shown beside the amount box while a payment or a reimbursement is
 * being typed, so the balance is visible before anything is saved.
 *
 * This is advice, not authority. It reads the same rules the server applies in
 * `saveFinanceMovement` and words them the same way, but the numbers it works
 * from come from the snapshot in the browser, which is refreshed every thirty
 * seconds and can be behind the database. The server check stays in place and
 * still refuses an over-amount, so a stale figure here can never let a wrong
 * amount through — it can only fail to warn.
 *
 * Deliberately silent where there is nothing useful to say: sale proceeds have
 * no ceiling ("proceeds are a fact"), a record with no amount valued has no
 * balance to show, and half-typed text such as "5." is not an error yet.
 */
import { MoneyError, formatPence, optionalPoundsToPence } from "./money";

export type MovementKind = "proceeds" | "payment" | "reimbursement";

export type MovementHint = {
  /** True when the amount typed cannot be recorded, so Record is switched off. */
  blocks: boolean;
  /** One calm sentence with the figures in it. Never a code, never a stack. */
  sentence: string;
};

export function movementAmountHint(input: {
  /** The kind of movement the dialog is offering, or null when it offers none. */
  kind: MovementKind | null;
  /** The text in the amount box exactly as typed. */
  typed: string;
  /** The amount on the record itself: owed, spent, or estimated. */
  recordedPence: number | null;
  /** The sum of the live, unvoided movements of this same kind. */
  alreadyPence: number;
  /** Who paid the expense personally; only reimbursements look at it. */
  fundedBy: string | null;
}): MovementHint | null {
  const { kind, typed, recordedPence, alreadyPence, fundedBy } = input;
  // Distributions and income are recorded directly and have no movement form;
  // proceeds are a fact and may be more or less than the estimate.
  if (kind === null || kind === "proceeds") return null;
  if (!typed.trim()) return null;

  let amountPence: number | null;
  try {
    amountPence = optionalPoundsToPence(typed);
  } catch (error) {
    // Still being typed, or not a number at all: say nothing and let the
    // field's own validation and the server have the last word.
    if (error instanceof MoneyError) return null;
    throw error;
  }
  if (amountPence === null) return null;
  // "0" is the start of "0.50" as often as it is a mistake, and the field and
  // the server both refuse it: there is no balance worth showing for it.
  if (amountPence <= 0) return null;

  if (kind === "reimbursement" && !fundedBy)
    return {
      blocks: true,
      sentence:
        "Only an expense that was paid personally can be reimbursed. This one was paid from the estate.",
    };

  if (kind === "payment" && recordedPence === null)
    return {
      blocks: true,
      sentence:
        "No amount is recorded as owed on this record yet. Add the amount owed first, then record the payment against it.",
    };

  const remaining = (recordedPence ?? 0) - alreadyPence;

  if (remaining <= 0)
    return {
      blocks: true,
      sentence:
        kind === "payment"
          ? "Nothing is left to pay on this record. If the amount owed has changed, correct it on the record first."
          : "This expense has already been reimbursed in full.",
    };

  if (amountPence > remaining)
    return {
      blocks: true,
      sentence:
        kind === "payment"
          ? `That is more than the ${formatPence(remaining)} still owed. Enter ${formatPence(remaining)} or less.`
          : `That is more than the ${formatPence(remaining)} still to reimburse. Enter ${formatPence(remaining)} or less.`,
    };

  const left = remaining - amountPence;
  if (left === 0)
    return {
      blocks: false,
      sentence:
        kind === "payment"
          ? `This settles the ${formatPence(recordedPence)} recorded as owed in full.`
          : "This reimburses what was paid personally in full.",
    };
  return {
    blocks: false,
    sentence:
      kind === "payment"
        ? `${formatPence(amountPence)} of the ${formatPence(remaining)} still owed – leaves ${formatPence(left)}.`
        : `${formatPence(amountPence)} of the ${formatPence(remaining)} still to reimburse – leaves ${formatPence(left)}.`,
  };
}

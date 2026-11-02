/**
 * The asset register: one row per financial record, with the few numbers a
 * spreadsheet would show beside it.
 *
 * All of the rules live here, with no markup, so the grid, its totals row and
 * the tests all agree on what a row is worth and what state it is in. Nothing is
 * stored: a status is derived from the record and its live movements, so it can
 * never drift out of step with the money.
 *
 * The rules follow `summary.ts`, deliberately:
 *  - binned and voided records, and voided movements, are ignored when adding up;
 *  - proceeds are not income and payments are not expenses;
 *  - a reimbursement settles money already recorded, so it never creates a
 *    second expense;
 *  - "remaining" is never below zero, because a property that sold above its
 *    estimate is not minus money.
 */

import type { FinanceMovement, FinanceRecord } from "./summary";
import { movementKindFor } from "../records/validation";

/**
 * The page is divided by what the user is trying to answer, not by database
 * kind alone: "what is it worth", "what do we owe", "what has come in", "where
 * is it going". Expenses sit with liabilities because both are money the estate
 * owes or has paid out.
 */
export const financeTabs = [
  { id: "assets", label: "Assets", kinds: ["asset"] },
  { id: "debts", label: "Debts & expenses", kinds: ["liability", "expense"] },
  { id: "cash", label: "Cash", kinds: ["income"] },
  { id: "distributions", label: "Distributions", kinds: ["distribution"] },
] as const;

export type FinanceTabId = (typeof financeTabs)[number]["id"];

export function financeTab(id: FinanceTabId) {
  return financeTabs.find((tab) => tab.id === id) ?? financeTabs[0];
}

/** The column headings, which change with what a row means. */
export type RegisterColumns = {
  value: string;
  settled: string;
  remaining: string;
};

export const registerColumns: Record<FinanceTabId, RegisterColumns> = {
  assets: { value: "Estimate", settled: "Received", remaining: "To realise" },
  debts: { value: "Amount", settled: "Paid", remaining: "Outstanding" },
  cash: { value: "Amount", settled: "Received", remaining: "—" },
  distributions: {
    value: "Allocated",
    settled: "Paid",
    remaining: "Balance",
  },
};

/** How a status should read at a glance. Never the only cue — the word is always there. */
export type StatusTone = "plain" | "good" | "attention";

export type RegisterStatus = {
  key: string;
  label: string;
  tone: StatusTone;
};

export type RegisterRow = {
  id: string;
  record: FinanceRecord;
  /** Estimate, amount owed, amount, or allocation. Null only when an asset has no value yet. */
  valuePence: number | null;
  /** Proceeds received, payments made, reimbursements paid. Never negative. */
  settledPence: number;
  /** What is still to come, never below zero. */
  remainingPence: number;
  /** Proceeds above the estimate, or an overpayment. Zero when there is none. */
  extraPence: number;
  /** 0–1 for the bar under the status, or null when there is nothing to show. */
  progress: number | null;
  status: RegisterStatus;
  /** Every movement on the record, newest first, including voided ones. */
  movements: FinanceMovement[];
};

const status = (
  key: string,
  label: string,
  tone: StatusTone = "plain",
): RegisterStatus => ({ key, label, tone });

/**
 * The state of one record. A voided record always reads as voided, because the
 * reason it is out of the totals matters more than where it had got to.
 */
export function registerStatus(
  record: FinanceRecord,
  settledPence: number,
): RegisterStatus {
  if (record.voidedAt) return status("voided", "Voided");
  const value = record.amountPence;

  if (record.kind === "asset") {
    if (value === null) return status("not_valued", "Not valued", "attention");
    if (settledPence > value)
      return status("above_estimate", "Above estimate", "good");
    if (settledPence === value) return status("realised", "Realised", "good");
    if (settledPence > 0) return status("part_received", "Part received");
    return status("to_realise", "To realise");
  }

  if (record.kind === "liability") {
    const owed = value ?? 0;
    if (settledPence > owed) return status("overpaid", "Overpaid", "attention");
    if (settledPence === owed) return status("settled", "Settled", "good");
    if (settledPence > 0) return status("part_paid", "Part paid");
    return status("unpaid", "Unpaid", "attention");
  }

  if (record.kind === "expense") {
    if (!record.fundedBy) return status("estate_paid", "Paid by estate");
    const cost = value ?? 0;
    if (settledPence >= cost && cost > 0)
      return status("reimbursed", "Reimbursed", "good");
    if (settledPence > 0) return status("part_reimbursed", "Part reimbursed");
    return status("to_reimburse", "To reimburse", "attention");
  }

  if (record.kind === "distribution") {
    if (settledPence >= (value ?? 0) && (value ?? 0) > 0)
      return status("paid", "Paid", "good");
    if (settledPence > 0) return status("part_paid", "Part paid");
    return status("allocated", "Allocated");
  }

  return status("received", "Received", "good");
}

function progressFor(
  record: FinanceRecord,
  valuePence: number | null,
  settledPence: number,
): number | null {
  if (record.kind === "income") return null;
  // Nothing to measure against: an unvalued asset or a record with no amount.
  if (!valuePence || valuePence <= 0) return null;
  // A personally paid expense is only part-way once something is owed back.
  if (record.kind === "expense" && !record.fundedBy) return null;
  return Math.min(1, Math.max(0, settledPence / valuePence));
}

/** The live movements of the one kind a record accepts. */
function settledFor(record: FinanceRecord, movements: FinanceMovement[]) {
  const kind = movementKindFor(record.kind);
  if (!kind) return 0;
  return movements
    .filter(
      (m) =>
        m.recordId === record.id &&
        m.kind === kind &&
        !m.voidedAt &&
        !m.deletedAt,
    )
    .reduce((total, m) => total + m.amountPence, 0);
}

/**
 * One row per record, in the order given. Filtering and sorting are separate so
 * the totals row always describes exactly what is on screen.
 */
export function registerRows(
  records: FinanceRecord[],
  movements: FinanceMovement[],
): RegisterRow[] {
  return records.map((record) => {
    const settledPence = settledFor(record, movements);
    const valuePence = record.amountPence;
    const remainingPence =
      valuePence === null ? 0 : Math.max(0, valuePence - settledPence);
    const extraPence =
      valuePence === null
        ? 0
        : record.kind === "asset"
          ? Math.max(0, settledPence - valuePence)
          : record.kind === "liability"
            ? Math.max(0, settledPence - valuePence)
            : 0;
    return {
      id: record.id,
      record,
      valuePence,
      settledPence,
      remainingPence,
      extraPence,
      progress: progressFor(record, valuePence, settledPence),
      status: registerStatus(record, settledPence),
      movements: movements
        .filter((m) => m.recordId === record.id)
        .sort(
          (a, b) =>
            b.occurredOn.localeCompare(a.occurredOn) ||
            b.createdAt.getTime() - a.createdAt.getTime(),
        ),
    };
  });
}

export type RegisterTotals = {
  count: number;
  /** Records with no value yet, counted separately so a total is never a guess. */
  unvaluedCount: number;
  valuePence: number;
  settledPence: number;
  remainingPence: number;
  extraPence: number;
};

/** The footer of the grid: what the rows on screen add up to. */
export function registerTotals(rows: RegisterRow[]): RegisterTotals {
  let valuePence = 0;
  let unvaluedCount = 0;
  for (const row of rows) {
    if (row.valuePence === null) unvaluedCount += 1;
    else valuePence += row.valuePence;
  }
  return {
    count: rows.length,
    unvaluedCount,
    valuePence,
    settledPence: rows.reduce((t, r) => t + r.settledPence, 0),
    remainingPence: rows.reduce((t, r) => t + r.remainingPence, 0),
    extraPence: rows.reduce((t, r) => t + r.extraPence, 0),
  };
}

export type RegisterSortKey =
  "title" | "status" | "value" | "settled" | "remaining";

export type RegisterSort = {
  key: RegisterSortKey;
  /** 1 = ascending, -1 = descending. */
  direction: 1 | -1;
};

/**
 * Sorting never moves a voided record above a live one: it is out of every total,
 * so mixing it into the money order would mislead. Within that, ties fall back to
 * the title so the order is stable between renders.
 */
export function sortRegisterRows(
  rows: RegisterRow[],
  sort: RegisterSort,
): RegisterRow[] {
  const compare = (a: RegisterRow, b: RegisterRow) => {
    if (sort.key === "title")
      return a.record.title.localeCompare(b.record.title);
    if (sort.key === "status")
      return a.status.label.localeCompare(b.status.label);
    const left =
      sort.key === "value"
        ? (a.valuePence ?? -1)
        : sort.key === "settled"
          ? a.settledPence
          : a.remainingPence;
    const right =
      sort.key === "value"
        ? (b.valuePence ?? -1)
        : sort.key === "settled"
          ? b.settledPence
          : b.remainingPence;
    return left - right;
  };
  return [...rows].sort(
    (a, b) =>
      Number(!!a.record.voidedAt) - Number(!!b.record.voidedAt) ||
      compare(a, b) * sort.direction ||
      a.record.title.localeCompare(b.record.title),
  );
}

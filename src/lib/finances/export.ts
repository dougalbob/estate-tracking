import { formatPencePlain } from "./money";
import { csvFile, csvFilename, type CsvRow } from "./csv";
import {
  financeSummary,
  type FinanceMovement,
  type FinanceRecord,
} from "./summary";

export const exportViews = ["inventory", "cash", "reimbursements"] as const;
export type ExportView = (typeof exportViews)[number];

export type ExportContext = {
  records: FinanceRecord[];
  movements: FinanceMovement[];
  users: string[];
  organisationName: (id: string | null) => string;
  projectName: (id: string | null) => string;
  today: string;
};

const byDateThenTitle = (a: FinanceRecord, b: FinanceRecord) =>
  (a.occurredOn ?? "9999").localeCompare(b.occurredOn ?? "9999") ||
  a.title.localeCompare(b.title);

function isLive(record: FinanceRecord) {
  return !record.deletedAt && !record.voidedAt;
}

export function exportCsv(view: ExportView, context: ExportContext) {
  const rows =
    view === "inventory"
      ? inventoryRows(context)
      : view === "cash"
        ? cashRows(context)
        : reimbursementRows(context);
  return {
    filename: csvFilename(view, context.today),
    csv: csvFile(rows),
  };
}

/** Assets and liabilities: one list, with a List column keeping them apart. */
function inventoryRows(context: ExportContext): CsvRow[] {
  const summary = financeSummary(
    context.records,
    context.movements,
    context.users,
  );
  const live = context.records.filter(isLive);
  const movementsFor = (id: string, kind: FinanceMovement["kind"]) =>
    context.movements
      .filter(
        (m) =>
          m.recordId === id && m.kind === kind && !m.deletedAt && !m.voidedAt,
      )
      .reduce((total, m) => total + m.amountPence, 0);

  const rows: CsvRow[] = [
    [
      "List",
      "Title",
      "Category",
      "Amount (£)",
      "Received or paid so far (£)",
      "Outstanding (£)",
      "Status",
      "Organisation",
      "Project",
      "Date",
      "Notes",
      "Recorded by",
    ],
  ];

  for (const asset of live
    .filter((r) => r.kind === "asset")
    .sort(byDateThenTitle)) {
    const proceeds = movementsFor(asset.id, "proceeds");
    const status =
      asset.amountPence === null
        ? "Not valued yet"
        : proceeds === 0
          ? "Awaiting sale"
          : proceeds < asset.amountPence
            ? "Partly sold"
            : "Proceeds recorded";
    rows.push([
      "Asset",
      asset.title,
      asset.category ?? "",
      formatPencePlain(asset.amountPence),
      formatPencePlain(proceeds),
      "",
      status,
      context.organisationName(asset.organisationId),
      context.projectName(asset.projectId),
      asset.occurredOn ?? "",
      asset.detail,
      asset.createdBy,
    ]);
  }

  for (const liability of live
    .filter((r) => r.kind === "liability")
    .sort(byDateThenTitle)) {
    const paid = movementsFor(liability.id, "payment");
    const owed = liability.amountPence ?? 0;
    const status =
      paid === 0 ? "Unpaid" : paid < owed ? "Partly paid" : "Paid in full";
    rows.push([
      "Liability",
      liability.title,
      liability.category ?? "",
      formatPencePlain(owed),
      formatPencePlain(paid),
      formatPencePlain(Math.max(0, owed - paid)),
      status,
      context.organisationName(liability.organisationId),
      context.projectName(liability.projectId),
      liability.occurredOn ?? "",
      liability.detail,
      liability.createdBy,
    ]);
  }

  rows.push([]);
  rows.push([
    "Totals",
    "",
    "",
    formatPencePlain(
      summary.assets.estimatedPence + summary.liabilities.owedPence,
    ),
    formatPencePlain(
      summary.assets.proceedsPence + summary.liabilities.paidPence,
    ),
    formatPencePlain(summary.liabilities.outstandingPence),
    "",
    "",
    "",
    "",
    "Assets use the estimate; liabilities use the amount owed. Voided and binned records are excluded.",
    "",
  ]);
  return rows;
}

/** Every money movement, with personally paid expenses clearly marked. */
function cashRows(context: ExportContext): CsvRow[] {
  const live = context.records.filter(isLive);
  const liveMovements = context.movements.filter(
    (m) => !m.deletedAt && !m.voidedAt && live.some((r) => r.id === m.recordId),
  );
  const recordById = new Map(live.map((r) => [r.id, r]));

  type CashLine = { sort: string; row: CsvRow };
  const lines: CashLine[] = [];
  const row = (
    record: FinanceRecord,
    type: string,
    amount: number | null,
    moneyIn: number | null,
    moneyOut: number | null,
    extra: Partial<{
      fundedBy: string;
      beneficiary: string;
      notes: string;
    }> = {},
  ): CsvRow => [
    record.occurredOn ?? "",
    type,
    record.title,
    formatPencePlain(amount),
    formatPencePlain(moneyIn),
    formatPencePlain(moneyOut),
    extra.fundedBy ?? record.fundedBy ?? "",
    extra.beneficiary ?? record.beneficiary ?? "",
    context.organisationName(record.organisationId),
    context.projectName(record.projectId),
    extra.notes ?? record.detail,
    record.createdBy,
  ];

  for (const record of live) {
    if (record.kind === "income")
      lines.push({
        sort: `${record.occurredOn ?? "9999"}|${record.title}`,
        row: row(
          record,
          "Income received",
          record.amountPence,
          record.amountPence,
          null,
        ),
      });
    if (record.kind === "expense")
      lines.push({
        sort: `${record.occurredOn ?? "9999"}|${record.title}`,
        row: row(
          record,
          record.fundedBy
            ? `Expense paid personally by ${record.fundedBy.split("@")[0]} (not estate cash)`
            : "Expense paid from the estate",
          record.amountPence,
          null,
          record.fundedBy ? null : record.amountPence,
        ),
      });
    if (record.kind === "distribution")
      lines.push({
        sort: `${record.occurredOn ?? "9999"}|${record.title}`,
        row: row(
          record,
          "Distribution paid to a beneficiary",
          record.amountPence,
          null,
          record.amountPence,
        ),
      });
  }

  for (const movement of liveMovements) {
    const record = recordById.get(movement.recordId);
    if (!record) continue;
    if (movement.kind === "proceeds")
      lines.push({
        sort: `${movement.occurredOn}|${record.title}`,
        row: row(
          { ...record, occurredOn: movement.occurredOn },
          "Sale proceeds received",
          movement.amountPence,
          movement.amountPence,
          null,
          { notes: movement.detail || record.detail },
        ),
      });
    if (movement.kind === "reimbursement")
      lines.push({
        sort: `${movement.occurredOn}|${record.title}`,
        row: row(
          { ...record, occurredOn: movement.occurredOn },
          `Reimbursement paid to ${record.fundedBy?.split("@")[0] ?? "a user"} (settles money owed, not a new expense)`,
          movement.amountPence,
          null,
          movement.amountPence,
          { notes: movement.detail || record.detail },
        ),
      });
    if (movement.kind === "payment")
      lines.push({
        sort: `${movement.occurredOn}|${record.title}`,
        row: row(
          { ...record, occurredOn: movement.occurredOn },
          "Payment against a liability",
          movement.amountPence,
          null,
          movement.amountPence,
          { notes: movement.detail || record.detail },
        ),
      });
  }

  const rows: CsvRow[] = [
    [
      "Date",
      "Type",
      "Description",
      "Amount (£)",
      "Estate money in (£)",
      "Estate money out (£)",
      "Paid personally by",
      "Beneficiary",
      "Organisation",
      "Project",
      "Notes",
      "Recorded by",
    ],
    ...lines.sort((a, b) => a.sort.localeCompare(b.sort)).map((l) => l.row),
  ];
  return rows;
}

/** Personal funding and what is still owed back to each of you. */
function reimbursementRows(context: ExportContext): CsvRow[] {
  const summary = financeSummary(
    context.records,
    context.movements,
    context.users,
  );
  const rows: CsvRow[] = [
    [
      "Expense date",
      "Expense",
      "Paid personally by",
      "Amount (£)",
      "Reimbursed so far (£)",
      "Still owed (£)",
      "Status",
      "Organisation",
      "Project",
      "Notes",
    ],
  ];
  for (const expense of summary.reimbursableExpenses) {
    const record = context.records.find((r) => r.id === expense.id);
    rows.push([
      expense.occurredOn ?? "",
      expense.title,
      expense.fundedBy.split("@")[0],
      formatPencePlain(expense.amountPence),
      formatPencePlain(expense.reimbursedPence),
      formatPencePlain(expense.owedPence),
      expense.owedPence === 0 ? "Settled" : "Owed",
      context.organisationName(expense.organisationId),
      context.projectName(expense.projectId),
      record?.detail ?? "",
    ]);
  }
  rows.push([]);
  for (const line of summary.reimbursements) {
    rows.push([
      "",
      `Total owed to ${line.user.split("@")[0]}`,
      line.user.split("@")[0],
      formatPencePlain(line.fundedPence),
      formatPencePlain(line.reimbursedPence),
      formatPencePlain(line.owedPence),
      "",
      "",
      "",
      "Voided and binned records are excluded.",
    ]);
  }
  return rows;
}

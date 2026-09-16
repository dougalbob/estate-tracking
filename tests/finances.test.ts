import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "../src/lib/db/schema";
import { recordStore, RecordError } from "../src/lib/records/store";
import {
  MoneyError,
  formatPence,
  formatPencePlain,
  parsePoundsToPence,
} from "../src/lib/finances/money";
import { financeSummary } from "../src/lib/finances/summary";
import { exportCsv } from "../src/lib/finances/export";
import { csvCell } from "../src/lib/finances/csv";
import { londonToday } from "../src/lib/records/validation";

const users = ["alex@example.invalid", "jamie@example.invalid"];
const alex = users[0];
const jamie = users[1];

function setup() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle" });
  const store = recordStore(db, users);
  store.seedProjects();
  return { sqlite, store };
}

const summaryOf = (store: ReturnType<typeof setup>["store"]) =>
  financeSummary(
    store.snapshot().financeRecords,
    store.snapshot().financeMovements,
    users,
  );

test("money is stored as integer pence and formatted as GBP", () => {
  assert.equal(parsePoundsToPence("500"), 50000);
  assert.equal(parsePoundsToPence("500.2"), 50020);
  assert.equal(parsePoundsToPence("1,234.56"), 123456);
  assert.equal(parsePoundsToPence("£0.05"), 5);
  assert.equal(parsePoundsToPence("0"), 0);
  assert.throws(() => parsePoundsToPence("12.345"), MoneyError);
  assert.throws(() => parsePoundsToPence("-20"), MoneyError);
  assert.throws(() => parsePoundsToPence("twenty"), MoneyError);
  assert.throws(() => parsePoundsToPence(""), MoneyError);
  assert.equal(formatPence(123456), "£1,234.56");
  assert.equal(formatPence(5), "£0.05");
  assert.equal(formatPence(0), "£0.00");
  assert.equal(formatPence(null), "Not recorded");
  assert.equal(formatPencePlain(123456), "1234.56");
  assert.equal(formatPencePlain(null), "");
  // No floating point drift: 0.1 + 0.2 stays exact in pence.
  assert.equal(parsePoundsToPence("0.10") + parsePoundsToPence("0.20"), 30);
});

test("asset: estimate, sale proceeds, and the difference", () => {
  const { sqlite, store } = setup();
  try {
    const house = store.saveFinanceRecord(
      {
        kind: "asset",
        title: "12 Oakfield Road",
        detail: "",
        category: "property",
        amount: "250000",
        occurredOn: "2026-09-01",
        fundedBy: null,
        beneficiary: null,
        organisationId: null,
        projectId: null,
      },
      alex,
    );
    const unvalued = store.saveFinanceRecord(
      {
        kind: "asset",
        title: "Piano – not valued yet",
        detail: "",
        category: "household_items",
        amount: "",
        occurredOn: null,
        fundedBy: null,
        beneficiary: null,
        organisationId: null,
        projectId: null,
      },
      jamie,
    );
    assert.equal(store.snapshot().financeRecords.length, 2);
    store.saveFinanceMovement(
      {
        recordId: house,
        kind: "proceeds",
        amount: "255000.50",
        occurredOn: "2026-09-10",
        detail: "Sale completed",
      },
      alex,
    );
    const summary = summaryOf(store);
    assert.equal(summary.assets.estimatedPence, 25000000);
    assert.equal(summary.assets.proceedsPence, 25500050);
    assert.equal(summary.assets.aboveEstimatePence, 500050);
    assert.equal(summary.assets.stillToRealisePence, 0);
    assert.equal(summary.assets.unvaluedCount, 1);
    assert.equal(
      store.snapshot().financeRecords.find((r) => r.id === unvalued)
        ?.amountPence,
      null,
    );
  } finally {
    sqlite.close();
  }
});

test("liability: part payments leave the right outstanding amount", () => {
  const { sqlite, store } = setup();
  try {
    const bill = store.saveFinanceRecord(
      {
        kind: "liability",
        title: "Funeral director balance",
        detail: "",
        category: "unpaid_bill",
        amount: "2400",
        occurredOn: "2026-09-02",
        fundedBy: null,
        beneficiary: null,
        organisationId: null,
        projectId: null,
      },
      alex,
    );
    store.saveFinanceMovement(
      {
        recordId: bill,
        kind: "payment",
        amount: "400",
        occurredOn: "2026-09-05",
        detail: "First instalment",
      },
      alex,
    );
    store.saveFinanceMovement(
      {
        recordId: bill,
        kind: "payment",
        amount: "1000",
        occurredOn: "2026-09-12",
        detail: "Second instalment",
      },
      jamie,
    );
    let summary = summaryOf(store);
    assert.equal(summary.liabilities.owedPence, 240000);
    assert.equal(summary.liabilities.paidPence, 140000);
    assert.equal(summary.liabilities.outstandingPence, 100000);
    assert.equal(summary.liabilities.outstandingCount, 1);
    assert.equal(summary.cash.liabilityPaymentsPence, 140000);
    assert.equal(summary.cash.moneyOutPence, 140000);
    assert.equal(summary.cash.netPence, -140000);

    // Paying more than the amount owed is refused, with the amount still due.
    assert.throws(
      () =>
        store.saveFinanceMovement(
          {
            recordId: bill,
            kind: "payment",
            amount: "1200",
            occurredOn: "2026-09-13",
            detail: "",
          },
          alex,
        ),
      /cannot exceed/,
    );
    store.saveFinanceMovement(
      {
        recordId: bill,
        kind: "payment",
        amount: "1000",
        occurredOn: "2026-09-14",
        detail: "Final payment",
      },
      alex,
    );
    summary = summaryOf(store);
    assert.equal(summary.liabilities.outstandingPence, 0);
    assert.equal(summary.liabilities.settledCount, 1);
  } finally {
    sqlite.close();
  }
});

test("a £500 personal expense with £200 reimbursed leaves £300 owed and creates no second expense", () => {
  const { sqlite, store } = setup();
  try {
    const expense = store.saveFinanceRecord(
      {
        kind: "expense",
        title: "Funeral costs paid by Alex",
        detail: "",
        category: "funeral",
        amount: "500",
        occurredOn: "2026-09-03",
        fundedBy: alex,
        beneficiary: null,
        organisationId: null,
        projectId: null,
      },
      alex,
    );
    store.saveFinanceMovement(
      {
        recordId: expense,
        kind: "reimbursement",
        amount: "200",
        occurredOn: "2026-09-15",
        detail: "Part repayment",
      },
      jamie,
    );

    const state = store.snapshot();
    // Exactly one expense: the reimbursement settles money owed instead of
    // adding another expense line.
    assert.equal(state.financeRecords.length, 1);
    assert.equal(
      state.financeRecords.filter((r) => r.kind === "expense").length,
      1,
    );
    assert.equal(state.financeRecords[0].amountPence, 50000);

    const summary = summaryOf(store);
    assert.equal(summary.cash.personallyFundedPence, 50000);
    assert.equal(summary.cash.expensesFromEstatePence, 0);
    assert.equal(summary.cash.reimbursedPence, 20000);
    assert.equal(summary.reimbursements[0].owedPence, 30000);
    assert.equal(summary.reimbursements[0].reimbursedPence, 20000);
    assert.equal(summary.reimbursableExpenses[0].owedPence, 30000);
    // The reimbursement is real money leaving the estate, not an expense.
    assert.equal(summary.cash.moneyOutPence, 20000);
    assert.equal(summary.cash.netPence, -20000);

    // Paying the remainder settles it.
    store.saveFinanceMovement(
      {
        recordId: expense,
        kind: "reimbursement",
        amount: "300",
        occurredOn: "2026-09-16",
        detail: "",
      },
      jamie,
    );
    assert.equal(summaryOf(store).reimbursements[0].owedPence, 0);
    assert.equal(summaryOf(store).cash.reimbursedPence, 50000);
    assert.equal(store.snapshot().financeRecords.length, 1);
  } finally {
    sqlite.close();
  }
});

test("reimbursements are refused when they would overpay or when the estate paid", () => {
  const { sqlite, store } = setup();
  try {
    const personal = store.saveFinanceRecord(
      {
        kind: "expense",
        title: "Headstone deposit",
        detail: "",
        category: "funeral",
        amount: "300",
        occurredOn: "2026-09-04",
        fundedBy: jamie,
        beneficiary: null,
        organisationId: null,
        projectId: null,
      },
      jamie,
    );
    const fromEstate = store.saveFinanceRecord(
      {
        kind: "expense",
        title: "Probate fee",
        detail: "",
        category: "administration",
        amount: "150",
        occurredOn: "2026-09-04",
        fundedBy: null,
        beneficiary: null,
        organisationId: null,
        projectId: null,
      },
      alex,
    );
    assert.throws(
      () =>
        store.saveFinanceMovement(
          {
            recordId: personal,
            kind: "reimbursement",
            amount: "301",
            occurredOn: "2026-09-05",
            detail: "",
          },
          alex,
        ),
      /more than the £300.00 still owed/,
    );
    assert.throws(
      () =>
        store.saveFinanceMovement(
          {
            recordId: fromEstate,
            kind: "reimbursement",
            amount: "50",
            occurredOn: "2026-09-05",
            detail: "",
          },
          alex,
        ),
      /paid personally/,
    );
    // Movements must match the record: no proceeds on a liability, no payment on an asset.
    assert.throws(
      () =>
        store.saveFinanceMovement(
          {
            recordId: fromEstate,
            kind: "payment",
            amount: "10",
            occurredOn: "2026-09-05",
            detail: "",
          },
          alex,
        ),
      /expense records reimbursement movements/,
    );
    assert.equal(store.snapshot().financeMovements.length, 0);
  } finally {
    sqlite.close();
  }
});

test("voiding keeps the record, its reason and its history, and leaves it out of the totals", () => {
  const { sqlite, store } = setup();
  try {
    const income = store.saveFinanceRecord(
      {
        kind: "income",
        title: "Bank interest",
        detail: "",
        category: "interest",
        amount: "12.34",
        occurredOn: "2026-09-06",
        fundedBy: null,
        beneficiary: null,
        organisationId: null,
        projectId: null,
      },
      alex,
    );
    assert.equal(summaryOf(store).cash.moneyInPence, 1234);
    assert.throws(
      () =>
        store.setFinanceVoid(
          {
            target: "record",
            id: income,
            version: 1,
            voided: true,
            reason: "x",
          },
          alex,
        ),
      /short reason/,
    );
    store.setFinanceVoid(
      {
        target: "record",
        id: income,
        version: 1,
        voided: true,
        reason: "Entered twice",
      },
      jamie,
    );
    const voided = store.snapshot().financeRecords[0];
    assert.equal(voided.version, 2);
    assert.ok(voided.voidedAt);
    assert.equal(voided.voidReason, "Entered twice");
    assert.equal(summaryOf(store).cash.moneyInPence, 0);
    assert.equal(summaryOf(store).excluded.voidedRecords, 1);
    const audit = store.snapshot().revisions.find((r) => r.action === "voided");
    assert.equal(audit?.actor, jamie);
    assert.equal(audit?.entity, "finance_record");

    // Reinstate, then correct the amount: the history keeps both versions.
    store.setFinanceVoid(
      {
        target: "record",
        id: income,
        version: 2,
        voided: false,
        reason: "",
      },
      alex,
    );
    assert.equal(summaryOf(store).cash.moneyInPence, 1234);
    store.saveFinanceRecord(
      {
        id: income,
        version: 3,
        kind: "income",
        title: "Bank interest",
        detail: "Corrected after the statement arrived",
        category: "interest",
        amount: "14.10",
        occurredOn: "2026-09-06",
        fundedBy: null,
        beneficiary: null,
        organisationId: null,
        projectId: null,
      },
      alex,
    );
    assert.equal(summaryOf(store).cash.moneyInPence, 1410);
    const updated = store
      .snapshot()
      .revisions.find(
        (r) => r.action === "updated" && r.entity === "finance_record",
      );
    assert.equal(updated?.actor, alex);
    assert.equal(
      (updated?.before as { amountPence?: number } | null)?.amountPence,
      1234,
    );
  } finally {
    sqlite.close();
  }
});

test("financial records go to the bin and are restored, but are never permanently deleted", () => {
  const { sqlite, store } = setup();
  try {
    const liability = store.saveFinanceRecord(
      {
        kind: "liability",
        title: "Credit card balance",
        detail: "",
        category: "credit_card",
        amount: "800",
        occurredOn: "2026-09-07",
        fundedBy: null,
        beneficiary: null,
        organisationId: null,
        projectId: null,
      },
      alex,
    );
    const payment = store.saveFinanceMovement(
      {
        recordId: liability,
        kind: "payment",
        amount: "200",
        occurredOn: "2026-09-08",
        detail: "",
      },
      alex,
    );
    assert.throws(
      () => store.deleteFinance("record", liability, 1, alex, true),
      /never permanently deleted|corrected or voided/,
    );
    store.deleteFinance("record", liability, 1, alex);
    assert.equal(store.snapshot().financeRecords.length, 0);
    assert.equal(store.snapshot().deletedFinanceRecords.length, 1);
    // The movement is still there to restore with its record.
    assert.equal(store.snapshot().financeMovements.length, 1);
    assert.equal(summaryOf(store).liabilities.owedPence, 0);

    store.restoreFinance("record", liability, 2, jamie);
    const restored = store.snapshot().financeRecords[0];
    assert.equal(restored.version, 3);
    assert.equal(restored.deletedAt, null);
    assert.equal(summaryOf(store).liabilities.outstandingPence, 60000);
    assert.equal(
      store.snapshot().financeMovements.find((m) => m.id === payment)
        ?.amountPence,
      20000,
    );

    store.deleteFinance("movement", payment, 1, alex);
    assert.equal(store.snapshot().financeMovements.length, 0);
    assert.equal(summaryOf(store).liabilities.paidPence, 0);
    store.restoreFinance("movement", payment, 2, alex);
    assert.equal(summaryOf(store).liabilities.paidPence, 20000);
  } finally {
    sqlite.close();
  }
});

test("distributions are recorded per beneficiary without assuming a 50/50 split", () => {
  const { sqlite, store } = setup();
  try {
    store.saveFinanceRecord(
      {
        kind: "distribution",
        title: "Interim distribution",
        detail: "",
        category: "interim",
        amount: "5000",
        occurredOn: "2026-09-09",
        fundedBy: null,
        beneficiary: alex,
        organisationId: null,
        projectId: null,
      },
      alex,
    );
    store.saveFinanceRecord(
      {
        kind: "distribution",
        title: "Second distribution",
        detail: "",
        category: "interim",
        amount: "1000",
        occurredOn: "2026-09-10",
        fundedBy: null,
        beneficiary: jamie,
        organisationId: null,
        projectId: null,
      },
      jamie,
    );
    const summary = summaryOf(store);
    assert.equal(summary.cash.distributionsPence, 600000);
    assert.equal(summary.distributions[0].paidPence, 500000);
    assert.equal(summary.distributions[1].paidPence, 100000);
    // Recording a distribution against only one beneficiary is allowed.
    assert.equal(summary.counts.distributions, 2);
    assert.throws(
      () =>
        store.saveFinanceRecord(
          {
            kind: "distribution",
            title: "Unsigned",
            detail: "",
            category: "interim",
            amount: "10",
            occurredOn: "2026-09-10",
            fundedBy: null,
            beneficiary: null,
            organisationId: null,
            projectId: null,
          },
          alex,
        ),
      /which beneficiary/,
    );
  } finally {
    sqlite.close();
  }
});

test("stale financial edits are rejected and nothing is overwritten", () => {
  const { sqlite, store } = setup();
  try {
    const asset = store.saveFinanceRecord(
      {
        kind: "asset",
        title: "Savings account",
        detail: "",
        category: "bank_account",
        amount: "2000",
        occurredOn: "2026-09-01",
        fundedBy: null,
        beneficiary: null,
        organisationId: null,
        projectId: null,
      },
      alex,
    );
    store.saveFinanceRecord(
      {
        id: asset,
        version: 1,
        kind: "asset",
        title: "Savings account",
        detail: "",
        category: "bank_account",
        amount: "2100",
        occurredOn: "2026-09-01",
        fundedBy: null,
        beneficiary: null,
        organisationId: null,
        projectId: null,
      },
      jamie,
    );
    assert.throws(
      () =>
        store.saveFinanceRecord(
          {
            id: asset,
            version: 1,
            kind: "asset",
            title: "Savings account",
            detail: "",
            category: "bank_account",
            amount: "9999",
            occurredOn: "2026-09-01",
            fundedBy: null,
            beneficiary: null,
            organisationId: null,
            projectId: null,
          },
          alex,
        ),
      (error: unknown) =>
        error instanceof RecordError && error.code === "conflict",
    );
    assert.equal(store.snapshot().financeRecords[0].amountPence, 210000);
  } finally {
    sqlite.close();
  }
});

test("receipts can be linked to a financial record and the link can be removed", () => {
  const { sqlite, store } = setup();
  try {
    const expense = store.saveFinanceRecord(
      {
        kind: "expense",
        title: "Removal van hire",
        detail: "",
        category: "property",
        amount: "180.50",
        occurredOn: "2026-09-11",
        fundedBy: alex,
        beneficiary: null,
        organisationId: null,
        projectId: null,
      },
      alex,
    );
    const doc = store.createDocumentFromUpload(
      {
        friendlyName: "Removal van receipt",
        originalName: "receipt.pdf",
        storageName: "11111111-2222-3333-4444-555555555555.pdf",
        mimeType: "application/pdf",
        size: 1024,
        category: "receipt",
      },
      alex,
    );
    const link = store.linkDocument(
      { documentId: doc, financeRecordId: expense },
      alex,
    );
    assert.equal(store.snapshot().documentLinks.length, 1);
    assert.equal(store.snapshot().documentLinks[0].financeRecordId, expense);
    // Linking to two records at once is refused.
    assert.throws(
      () =>
        store.linkDocument(
          { documentId: doc, financeRecordId: expense, projectId: "funeral" },
          alex,
        ),
      /exactly one record/,
    );
    store.unlinkDocument(link, jamie);
    assert.equal(store.snapshot().documentLinks.length, 0);
    assert.equal(store.snapshot().documents.length, 1);
    // Unknown financial records are refused.
    assert.throws(
      () =>
        store.linkDocument({ documentId: doc, financeRecordId: "nope" }, alex),
      /no longer available/,
    );
  } finally {
    sqlite.close();
  }
});

test("CSV exports protect against spreadsheet formulas and keep money as numbers", () => {
  const { sqlite, store } = setup();
  try {
    const expense = store.saveFinanceRecord(
      {
        kind: "expense",
        title: '=cmd|"/c calc"!A1',
        detail: "Paid at the counter, receipt = attached + checked",
        category: "funeral",
        amount: "500",
        occurredOn: "2026-09-03",
        fundedBy: alex,
        beneficiary: null,
        organisationId: null,
        projectId: null,
      },
      alex,
    );
    store.saveFinanceMovement(
      {
        recordId: expense,
        kind: "reimbursement",
        amount: "200",
        occurredOn: "2026-09-15",
        detail: "@SUM(1+1)",
      },
      jamie,
    );
    store.saveFinanceRecord(
      {
        kind: "income",
        title: "Refund, with a comma",
        detail: 'Said "no" at first',
        category: "refund",
        amount: "12.34",
        occurredOn: "2026-09-06",
        fundedBy: null,
        beneficiary: null,
        organisationId: null,
        projectId: null,
      },
      alex,
    );

    const snapshot = store.snapshot();
    const context = {
      records: snapshot.financeRecords,
      movements: snapshot.financeMovements,
      users,
      organisationName: () => "",
      projectName: () => "",
      today: londonToday(),
    };

    // The writer quotes everything and disarms anything a spreadsheet would run.
    assert.equal(csvCell("=1+1"), `"'=1+1"`);
    assert.equal(csvCell("+1"), `"'+1"`);
    assert.equal(csvCell("-1"), `"'-1"`);
    assert.equal(csvCell("@x"), `"'@x"`);
    assert.equal(csvCell("\tcmd"), `"'\tcmd"`);
    assert.equal(csvCell('a "quote", comma'), `"a ""quote"", comma"`);
    assert.equal(csvCell("500"), `"500"`);

    const cash = exportCsv("cash", context);
    assert.match(
      cash.filename,
      /^estate-finances-cash-\d{4}-\d{2}-\d{2}\.csv$/,
    );
    assert.ok(cash.csv.startsWith("\uFEFF"), "BOM helps Excel read £ values");
    assert.match(cash.csv, /"Estate money in \(£\)"/);
    assert.match(cash.csv, /"Estate money out \(£\)"/);
    // Money cells stay plain numbers, invisible to the formula guard.
    assert.match(cash.csv, /"500\.00"/);
    assert.match(cash.csv, /"200\.00"/);
    assert.match(cash.csv, /"12\.34"/);
    // No negative money cells: money in and money out have their own columns.
    assert.doesNotMatch(cash.csv, /"-\d+\.\d{2}"/);
    const rows = cash.csv.split("\r\n").slice(1).filter(Boolean);
    for (const row of rows)
      for (const cell of row.match(/"[^"]*(?:""[^"]*)*"/g) ?? [])
        assert.ok(!/^"[=+\-@]/.test(cell), `unprotected cell ${cell}`);
    assert.match(cash.csv, /Expense paid personally by alex/);
    assert.match(cash.csv, /Reimbursement paid to alex/);
    assert.match(cash.csv, /not a new expense/);

    const reimbursements = exportCsv("reimbursements", context);
    assert.match(reimbursements.csv, /"Still owed \(£\)"/);
    assert.match(reimbursements.csv, /"300\.00"/);
    assert.match(reimbursements.csv, /Total owed to alex/);

    const inventory = exportCsv("inventory", context);
    assert.match(inventory.csv, /"List","Title"/);
    assert.match(inventory.csv, /"Totals"/);

    // Voided and binned records are left out of the exports entirely.
    store.deleteFinance("record", expense, 1, alex);
    const afterBin = exportCsv("cash", {
      ...context,
      records: store.snapshot().financeRecords,
      movements: store.snapshot().financeMovements,
    });
    assert.doesNotMatch(afterBin.csv, /Reimbursement paid/);
  } finally {
    sqlite.close();
  }
});

test("summaries keep assets, liabilities, cash and personal funding apart", () => {
  const { sqlite, store } = setup();
  try {
    store.saveFinanceRecord(
      {
        kind: "asset",
        title: "Current account",
        detail: "",
        category: "bank_account",
        amount: "1000",
        occurredOn: "2026-09-01",
        fundedBy: null,
        beneficiary: null,
        organisationId: null,
        projectId: null,
      },
      alex,
    );
    store.saveFinanceRecord(
      {
        kind: "liability",
        title: "Utility balance",
        detail: "",
        category: "unpaid_bill",
        amount: "120",
        occurredOn: "2026-09-01",
        fundedBy: null,
        beneficiary: null,
        organisationId: null,
        projectId: null,
      },
      alex,
    );
    store.saveFinanceRecord(
      {
        kind: "income",
        title: "Refund from insurer",
        detail: "",
        category: "refund",
        amount: "75",
        occurredOn: "2026-09-02",
        fundedBy: null,
        beneficiary: null,
        organisationId: null,
        projectId: null,
      },
      alex,
    );
    store.saveFinanceRecord(
      {
        kind: "expense",
        title: "Post redirection",
        detail: "",
        category: "administration",
        amount: "40",
        occurredOn: "2026-09-02",
        fundedBy: null,
        beneficiary: null,
        organisationId: null,
        projectId: null,
      },
      jamie,
    );
    const summary = summaryOf(store);
    assert.equal(summary.assets.estimatedPence, 100000);
    assert.equal(summary.liabilities.outstandingPence, 12000);
    assert.equal(summary.cash.moneyInPence, 7500);
    assert.equal(summary.cash.expensesFromEstatePence, 4000);
    assert.equal(summary.cash.personallyFundedPence, 0);
    assert.equal(summary.cash.netPence, 3500);
    assert.equal(summary.counts.assets, 1);
    assert.equal(summary.counts.liabilities, 1);
    assert.equal(summary.counts.income, 1);
    assert.equal(summary.counts.expenses, 1);
    assert.equal(summary.reimbursements.length, 2);
    assert.equal(summary.reimbursements[0].owedPence, 0);
  } finally {
    sqlite.close();
  }
});

test("only the two configured users may record finances, and unreferenced links are refused", () => {
  const { sqlite, store } = setup();
  try {
    assert.throws(
      () =>
        store.saveFinanceRecord(
          {
            kind: "income",
            title: "Interest",
            detail: "",
            category: "interest",
            amount: "1",
            occurredOn: "2026-09-01",
            fundedBy: null,
            beneficiary: null,
            organisationId: null,
            projectId: null,
          },
          "stranger@example.invalid",
        ),
      /Unauthorised/,
    );
    const id = store.saveFinanceRecord(
      {
        kind: "asset",
        title: "Watches",
        detail: "",
        category: "other",
        amount: "300",
        occurredOn: null,
        fundedBy: null,
        beneficiary: null,
        organisationId: null,
        projectId: null,
      },
      alex,
    );
    // An asset may not be marked as personally paid.
    assert.throws(
      () =>
        store.saveFinanceRecord(
          {
            id,
            version: 1,
            kind: "asset",
            title: "Watches",
            detail: "",
            category: "other",
            amount: "300",
            occurredOn: null,
            fundedBy: alex,
            beneficiary: null,
            organisationId: null,
            projectId: null,
          },
          alex,
        ),
      /paid personally/,
    );
    // A record with money against it cannot change type.
    store.saveFinanceMovement(
      {
        recordId: id,
        kind: "proceeds",
        amount: "320",
        occurredOn: "2026-09-20",
        detail: "",
      },
      alex,
    );
    assert.throws(
      () =>
        store.saveFinanceRecord(
          {
            id,
            version: 1,
            kind: "liability",
            title: "Watches",
            detail: "",
            category: "other",
            amount: "300",
            occurredOn: null,
            fundedBy: null,
            beneficiary: null,
            organisationId: null,
            projectId: null,
          },
          alex,
        ),
      /type cannot change/,
    );
    assert.throws(
      () =>
        store.saveFinanceRecord(
          {
            kind: "income",
            title: "Interest",
            detail: "",
            category: "interest",
            amount: "1",
            occurredOn: null,
            fundedBy: null,
            beneficiary: null,
            organisationId: null,
            projectId: null,
          },
          alex,
        ),
      /date this money moved/,
    );
  } finally {
    sqlite.close();
  }
});

import type { financeMovements, financeRecords } from "../db/schema";

export type FinanceRecord = typeof financeRecords.$inferSelect;
export type FinanceMovement = typeof financeMovements.$inferSelect;

export type ReimbursableExpense = {
  id: string;
  title: string;
  fundedBy: string;
  occurredOn: string | null;
  amountPence: number;
  reimbursedPence: number;
  owedPence: number;
  organisationId: string | null;
  projectId: string | null;
  reimbursements: FinanceMovement[];
};

export type FinanceSummary = {
  assets: {
    count: number;
    unvaluedCount: number;
    estimatedPence: number;
    proceedsPence: number;
    /** Estimated value still to come, per asset, never below zero. */
    stillToRealisePence: number;
    /** Proceeds above the estimate, per asset. */
    aboveEstimatePence: number;
    awaitingSaleCount: number;
  };
  liabilities: {
    count: number;
    owedPence: number;
    paidPence: number;
    /** Recorded amount less payments, per liability, never below zero. */
    outstandingPence: number;
    outstandingCount: number;
    settledCount: number;
    overpaidPence: number;
  };
  cash: {
    /** Income received, such as interest or a refund. */
    incomePence: number;
    /** Actual sale proceeds coming in for assets that have sold. */
    proceedsPence: number;
    moneyInPence: number;
    expensesFromEstatePence: number;
    /** Payments recorded against liabilities – estate money out. */
    liabilityPaymentsPence: number;
    /** Personally paid expenses – a fact to track, not estate cash. */
    personallyFundedPence: number;
    /** Estate money repaying a user: cash out, never a second expense. */
    reimbursedPence: number;
    distributionsPence: number;
    moneyOutPence: number;
    netPence: number;
  };
  reimbursements: {
    user: string;
    fundedPence: number;
    reimbursedPence: number;
    owedPence: number;
    expenseCount: number;
    outstandingCount: number;
  }[];
  reimbursableExpenses: ReimbursableExpense[];
  distributions: { user: string; paidPence: number; count: number }[];
  counts: {
    assets: number;
    liabilities: number;
    income: number;
    expenses: number;
    distributions: number;
    outstandingReimbursements: number;
  };
  /** Voided or binned records are excluded; kept for a clear footnote. */
  excluded: {
    voidedRecords: number;
    voidedMovements: number;
    binnedRecords: number;
  };
};

export function isVoided(record: { voidedAt: Date | null }) {
  return record.voidedAt !== null;
}

/**
 * One place where every financial total is worked out, so the screens, the CSV
 * exports and the tests all agree. Rules:
 *  - voided and binned records, and the movements hanging off them, are ignored;
 *  - proceeds are not income, payments are not expenses, and reimbursements
 *    settle money already recorded as a personally paid expense;
 *  - amounts provided by a person stay per-record which keeps part payments and
 *    part reimbursements exact.
 */
export function financeSummary(
  records: FinanceRecord[],
  movements: FinanceMovement[],
  users: string[],
): FinanceSummary {
  const liveRecords = records.filter((r) => !r.deletedAt && !r.voidedAt);
  const byId = new Map(liveRecords.map((r) => [r.id, r]));
  const liveMovements = movements.filter(
    (m) => !m.deletedAt && !m.voidedAt && byId.has(m.recordId),
  );
  const movementsFor = (recordId: string, kind: FinanceMovement["kind"]) =>
    liveMovements.filter((m) => m.recordId === recordId && m.kind === kind);

  const assetRecords = liveRecords.filter((r) => r.kind === "asset");
  const liabilityRecords = liveRecords.filter((r) => r.kind === "liability");
  const incomeRecords = liveRecords.filter((r) => r.kind === "income");
  const expenseRecords = liveRecords.filter((r) => r.kind === "expense");
  const distributionRecords = liveRecords.filter(
    (r) => r.kind === "distribution",
  );

  let estimatedPence = 0;
  let proceedsPence = 0;
  let stillToRealisePence = 0;
  let aboveEstimatePence = 0;
  let unvaluedCount = 0;
  let awaitingSaleCount = 0;
  for (const asset of assetRecords) {
    const proceeds = movementsFor(asset.id, "proceeds").reduce(
      (total, m) => total + m.amountPence,
      0,
    );
    proceedsPence += proceeds;
    if (asset.amountPence === null) {
      unvaluedCount += 1;
    } else {
      estimatedPence += asset.amountPence;
      const difference = proceeds - asset.amountPence;
      if (difference > 0) aboveEstimatePence += difference;
      else stillToRealisePence += -difference;
      if (difference < 0 || proceeds === 0) awaitingSaleCount += 1;
    }
  }

  let owedPence = 0;
  let paidPence = 0;
  let outstandingPence = 0;
  let outstandingCount = 0;
  let settledCount = 0;
  let overpaidPence = 0;
  for (const liability of liabilityRecords) {
    const paid = movementsFor(liability.id, "payment").reduce(
      (total, m) => total + m.amountPence,
      0,
    );
    const owed = liability.amountPence ?? 0;
    owedPence += owed;
    paidPence += paid;
    const remaining = owed - paid;
    if (remaining > 0) {
      outstandingPence += remaining;
      outstandingCount += 1;
    } else {
      settledCount += 1;
      if (remaining < 0) overpaidPence += -remaining;
    }
  }

  const expensesFromEstatePence = expenseRecords
    .filter((r) => !r.fundedBy)
    .reduce((total, r) => total + (r.amountPence ?? 0), 0);
  const personallyFundedPence = expenseRecords
    .filter((r) => r.fundedBy)
    .reduce((total, r) => total + (r.amountPence ?? 0), 0);
  const reimbursedPence = liveMovements
    .filter(
      (m) =>
        m.kind === "reimbursement" && byId.get(m.recordId)?.kind === "expense",
    )
    .reduce((total, m) => total + m.amountPence, 0);
  const incomePence = incomeRecords.reduce(
    (total, r) => total + (r.amountPence ?? 0),
    0,
  );
  const distributionsPence = distributionRecords.reduce(
    (total, r) => total + (r.amountPence ?? 0),
    0,
  );
  // Sale proceeds realised during the period are money coming in; liability
  // payments are money going out. Estimates are never cash.
  const liabilityPaymentsPence = liabilityRecords.reduce(
    (total, liability) =>
      total +
      liveMovements
        .filter((m) => m.recordId === liability.id && m.kind === "payment")
        .reduce((sum, m) => sum + m.amountPence, 0),
    0,
  );
  const moneyInPence = incomePence + proceedsPence;
  const moneyOutPence =
    expensesFromEstatePence +
    liabilityPaymentsPence +
    reimbursedPence +
    distributionsPence;

  const reimbursableExpenses: ReimbursableExpense[] = expenseRecords
    .filter((r) => r.fundedBy)
    .map((record) => {
      const reimbursements = movementsFor(record.id, "reimbursement");
      const reimbursed = reimbursements.reduce(
        (total, m) => total + m.amountPence,
        0,
      );
      const owed = (record.amountPence ?? 0) - reimbursed;
      return {
        id: record.id,
        title: record.title,
        fundedBy: record.fundedBy as string,
        occurredOn: record.occurredOn,
        amountPence: record.amountPence ?? 0,
        reimbursedPence: reimbursed,
        owedPence: Math.max(0, owed),
        organisationId: record.organisationId,
        projectId: record.projectId,
        reimbursements,
      };
    })
    .sort(
      (a, b) => b.owedPence - a.owedPence || a.title.localeCompare(b.title),
    );

  const reimbursements = users.map((user) => {
    const expenses = reimbursableExpenses.filter((e) => e.fundedBy === user);
    const funded = expenses.reduce((total, e) => total + e.amountPence, 0);
    const reimbursed = expenses.reduce(
      (total, e) => total + e.reimbursedPence,
      0,
    );
    const owed = expenses.reduce((total, e) => total + e.owedPence, 0);
    return {
      user,
      fundedPence: funded,
      reimbursedPence: reimbursed,
      owedPence: owed,
      expenseCount: expenses.length,
      outstandingCount: expenses.filter((e) => e.owedPence > 0).length,
    };
  });

  const distributions = users
    .map((user) => {
      const paid = distributionRecords.filter((r) => r.beneficiary === user);
      return {
        user,
        paidPence: paid.reduce((total, r) => total + (r.amountPence ?? 0), 0),
        count: paid.length,
      };
    })
    .filter((line) => line.count > 0);

  return {
    assets: {
      count: assetRecords.length,
      unvaluedCount,
      estimatedPence,
      proceedsPence,
      stillToRealisePence,
      aboveEstimatePence,
      awaitingSaleCount,
    },
    liabilities: {
      count: liabilityRecords.length,
      owedPence,
      paidPence,
      outstandingPence,
      outstandingCount,
      settledCount,
      overpaidPence,
    },
    cash: {
      incomePence,
      proceedsPence,
      moneyInPence,
      expensesFromEstatePence,
      liabilityPaymentsPence,
      personallyFundedPence,
      reimbursedPence,
      distributionsPence,
      moneyOutPence,
      netPence: moneyInPence - moneyOutPence,
    },
    reimbursements,
    reimbursableExpenses,
    distributions,
    counts: {
      assets: assetRecords.length,
      liabilities: liabilityRecords.length,
      income: incomeRecords.length,
      expenses: expenseRecords.length,
      distributions: distributionRecords.length,
      outstandingReimbursements: reimbursableExpenses.filter(
        (e) => e.owedPence > 0,
      ).length,
    },
    excluded: {
      voidedRecords: records.filter((r) => !r.deletedAt && r.voidedAt).length,
      voidedMovements: movements.filter((m) => !m.deletedAt && m.voidedAt)
        .length,
      binnedRecords: records.filter((r) => r.deletedAt).length,
    },
  };
}

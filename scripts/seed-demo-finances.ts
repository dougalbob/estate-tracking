/**
 * Fictional demo rows for the finances screen. Development only – never point
 * this at a real estate database.
 */
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "../src/lib/db/schema";
import { recordStore } from "../src/lib/records/store";

const path = process.env.DATABASE_PATH || "./data/demo.sqlite";
if (!path.includes("demo")) {
  console.error(
    "Refusing to seed: set DATABASE_PATH to the demo database, for example ./data/demo.sqlite",
  );
  process.exit(1);
}
const sqlite = new Database(path);
sqlite.pragma("foreign_keys = ON");
const db = drizzle(sqlite, { schema });
migrate(db, { migrationsFolder: "./drizzle" });
const users = ["alex@example.invalid", "jamie@example.invalid"];
const store = recordStore(db, users);
store.seedProjects();

const existing = store
  .snapshot()
  .financeRecords.find((r) => r.title === "12 Oakfield Road (fictional)");
if (existing) {
  console.log("Demo finance rows already present.");
} else {
  const house = store.saveFinanceRecord(
    {
      kind: "asset",
      title: "12 Oakfield Road (fictional)",
      detail: "Fictional example of an estate property.",
      category: "property",
      amount: "250000",
      occurredOn: "2026-09-01",
      fundedBy: null,
      beneficiary: null,
      organisationId: null,
      projectId: "probate",
    },
    users[0],
  );
  store.saveFinanceMovement(
    {
      recordId: house,
      kind: "proceeds",
      amount: "255000.50",
      occurredOn: "2026-09-10",
      detail: "Fictional sale completed",
    },
    users[0],
  );
  const funeral = store.saveFinanceRecord(
    {
      kind: "liability",
      title: "Funeral director balance (fictional)",
      detail: "",
      category: "unpaid_bill",
      amount: "2400",
      occurredOn: "2026-09-02",
      fundedBy: null,
      beneficiary: null,
      organisationId: null,
      projectId: "funeral",
    },
    users[0],
  );
  store.saveFinanceMovement(
    {
      recordId: funeral,
      kind: "payment",
      amount: "400",
      occurredOn: "2026-09-05",
      detail: "Fictional instalment",
    },
    users[0],
  );
  const expense = store.saveFinanceRecord(
    {
      kind: "expense",
      title: "Funeral costs paid by Alex (fictional)",
      detail: "Personally paid, partly reimbursed.",
      category: "funeral",
      amount: "500",
      occurredOn: "2026-09-03",
      fundedBy: users[0],
      beneficiary: null,
      organisationId: null,
      projectId: "funeral",
    },
    users[0],
  );
  store.saveFinanceMovement(
    {
      recordId: expense,
      kind: "reimbursement",
      amount: "200",
      occurredOn: "2026-09-15",
      detail: "Fictional part repayment",
    },
    users[1],
  );
  store.saveFinanceRecord(
    {
      kind: "income",
      title: "Bank interest (fictional)",
      detail: "",
      category: "interest",
      amount: "12.34",
      occurredOn: "2026-09-06",
      fundedBy: null,
      beneficiary: null,
      organisationId: null,
      projectId: null,
    },
    users[1],
  );
  store.saveFinanceRecord(
    {
      kind: "distribution",
      title: "Interim distribution to Alex (fictional)",
      detail: "",
      category: "interim",
      amount: "5000",
      occurredOn: "2026-09-09",
      fundedBy: null,
      beneficiary: users[0],
      organisationId: null,
      projectId: null,
    },
    users[0],
  );
  // Enough assets and debts to show every state the register can draw: an
  // account not yet collected, something part realised, something with no
  // value at all, and a debt nobody has paid a penny of.
  store.saveFinanceRecord(
    {
      kind: "asset",
      title: "Nationwide savings account (fictional)",
      detail:
        "Balance at the date of death; the money is still to be collected.",
      category: "bank_account",
      amount: "8250.40",
      occurredOn: "2026-09-01",
      fundedBy: null,
      beneficiary: null,
      organisationId: null,
      projectId: "probate",
    },
    users[0],
  );
  store.saveFinanceRecord(
    {
      kind: "asset",
      title: "Premium bonds (fictional)",
      detail: "No valuation yet — NS&I to confirm the holding.",
      category: "investment",
      amount: "",
      occurredOn: null,
      fundedBy: null,
      beneficiary: null,
      organisationId: null,
      projectId: "probate",
    },
    users[0],
  );
  const jewellery = store.saveFinanceRecord(
    {
      kind: "asset",
      title: "Jewellery and watches (fictional)",
      detail: "Partly sold; the rest is still with the family.",
      category: "household_items",
      amount: "1200",
      occurredOn: "2026-09-04",
      fundedBy: null,
      beneficiary: null,
      organisationId: null,
      projectId: null,
    },
    users[1],
  );
  store.saveFinanceMovement(
    {
      recordId: jewellery,
      kind: "proceeds",
      amount: "500",
      occurredOn: "2026-09-12",
      detail: "Fictional part sale to a dealer",
    },
    users[0],
  );
  store.saveFinanceRecord(
    {
      kind: "liability",
      title: "Credit card balance (fictional)",
      detail: "Nothing paid yet — the statement is in Documents.",
      category: "credit_card",
      amount: "850.75",
      occurredOn: "2026-09-01",
      fundedBy: null,
      beneficiary: null,
      organisationId: null,
      projectId: "probate",
    },
    users[1],
  );
  console.log("Demo finance rows created.");
}
sqlite.close();

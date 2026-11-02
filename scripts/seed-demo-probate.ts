/**
 * A fictional probate record for the demo database. Development only — never
 * point this at a real estate database.
 *
 * The figures are the ones in the proposal's worked example: a £250,000 house,
 * which makes the residence band cap against the combined band visible, rather
 * than a round £1,000,000 that would hide the line that matters.
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

const existing = store.snapshot().probateRecord;
if (existing) {
  console.log("Demo probate record already present.");
} else {
  store.saveProbateRecord(
    {
      deceasedName: "Margaret Example (fictional)",
      dateOfDeath: "2026-09-12",
      grantType: "probate",
      grantAppliedOn: "2026-10-14",
      grantIssuedOn: "2026-10-28",
      registry: "Newcastle",
      grantReference: "DEMO-0000000",
      lateSpouseName: "John Example (fictional)",
      lateSpouseDateOfDeath: "2010-06-04",
      nrbUnusedBp: 10_000,
      rnrbUnusedBp: 10_000,
      netEstateAtDeath: "285000",
      qualifyingResidenceValue: "250000",
      residenceToDirectDescendants: "yes",
      downsizingAddition: "no",
      iht400Needed: "no",
      claimReference: "DEMO-HMRC-0000",
    },
    users[0],
  );
  console.log("Demo probate record created.");
}
sqlite.close();

/**
 * Fictional interactions for the demo database only. Development only – never
 * point this at a real estate database.
 *
 * The demo needs a full Event log: nine events covering every kind (call,
 * email, letter, web form, note), every fictional contact plus two with no
 * organisation, every starter project plus two with no project, and both
 * users as the recorder, with occurred times spread over three weeks so the
 * newest-first order and the Oldest first option can be seen.
 *
 * One of the nine shares its title with the note that
 * scripts/seed-demo-documents.ts creates ("Phone call about the itemised bill
 * (fictional)"): whichever seed runs first creates it and the other reuses
 * it, so the full chain still ends with exactly nine rows. Like the other
 * demo seeds it is idempotent and refuses to run against a database path that
 * does not contain "demo".
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

const snapshot = store.snapshot();
const barclays = snapshot.organisations.find(
  (o) => o.name === "Barclays Estate Accounts (fictional)",
);
const hollowBrook = snapshot.organisations.find(
  (o) => o.name === "Hollow Brook Funeral Directors (fictional)",
);
const oakfield = snapshot.organisations.find(
  (o) => o.name === "Oakfield Council Tax (fictional)",
);
if (!barclays || !hollowBrook || !oakfield) {
  console.error(
    "The demo contacts are missing – run scripts/seed-demo-contacts.ts first.",
  );
  process.exit(1);
}

type DemoEvent = {
  title: string;
  detail: string;
  kind: "call" | "email" | "letter" | "web_form" | "note";
  occurredAt: string;
  organisationId: string | null;
  projectId: string | null;
  recordedBy: string;
};

const events: DemoEvent[] = [
  {
    title: "Phone call about the estate balance (fictional)",
    detail:
      "Asked for the balance at the date of death and the closing letter. They will write within ten working days.",
    kind: "call",
    occurredAt: "2026-09-16T10:30:00.000Z",
    organisationId: barclays.id,
    projectId: "probate",
    recordedBy: users[0],
  },
  {
    title: "Email confirming the funeral time (fictional)",
    detail:
      "The crematorium slot is confirmed for Friday at eleven. The celebrant will call to plan the tribute.",
    kind: "email",
    occurredAt: "2026-09-15T14:05:00.000Z",
    organisationId: hollowBrook.id,
    projectId: "funeral",
    recordedBy: users[1],
  },
  {
    title: "Letter about the council tax bill (fictional)",
    detail:
      "Posted the change-of-occupancy form with a copy of the death certificate. Kept the postage receipt.",
    kind: "letter",
    occurredAt: "2026-09-14T09:00:00.000Z",
    organisationId: oakfield.id,
    projectId: null,
    recordedBy: users[0],
  },
  {
    title: "Web form to redirect the post (fictional)",
    detail:
      "Submitted the redirection request online for twelve months. Confirmation reference saved with the paperwork.",
    kind: "web_form",
    occurredAt: "2026-09-12T11:15:00.000Z",
    organisationId: null,
    projectId: "notifications",
    recordedBy: users[1],
  },
  {
    title: "Reminder to ask about the will (fictional)",
    detail:
      "Quick note to self: check the desk drawers for the will before the probate application goes in.",
    kind: "note",
    occurredAt: "2026-09-10T08:45:00.000Z",
    organisationId: null,
    projectId: null,
    recordedBy: users[0],
  },
  {
    // Shared with the documents seed (see above): reused when it exists.
    title: "Phone call about the itemised bill (fictional)",
    detail:
      "Asked for the itemised funeral bill so the costs can be recorded in Estate finances.",
    kind: "call",
    occurredAt: "2026-09-08T16:20:00.000Z",
    organisationId: hollowBrook.id,
    projectId: "funeral",
    recordedBy: users[1],
  },
  {
    title: "Email with the account closure form (fictional)",
    detail:
      "The bank sent the closure form and the list of documents they need with it.",
    kind: "email",
    occurredAt: "2026-09-05T13:05:00.000Z",
    organisationId: barclays.id,
    projectId: "probate",
    recordedBy: users[1],
  },
  {
    title: "Letter confirming probate papers received (fictional)",
    detail:
      "The bank confirmed the grant papers arrived and the account is marked for closure.",
    kind: "letter",
    occurredAt: "2026-09-02T10:00:00.000Z",
    organisationId: barclays.id,
    projectId: "probate",
    recordedBy: users[0],
  },
  {
    title: "First note after the registration appointment (fictional)",
    detail:
      "Registered the death and ordered extra certificates. The Tell Us Once code came through at the appointment.",
    kind: "note",
    occurredAt: "2026-08-30T09:30:00.000Z",
    organisationId: oakfield.id,
    projectId: "notifications",
    recordedBy: users[1],
  },
];

let created = 0;
for (const event of events) {
  if (store.snapshot().interactions.some((i) => i.title === event.title))
    continue;
  store.saveInteraction(
    {
      title: event.title,
      detail: event.detail,
      kind: event.kind,
      occurredAt: event.occurredAt,
      organisationId: event.organisationId,
      projectId: event.projectId,
      followUps: [],
    },
    event.recordedBy,
  );
  created++;
}
console.log(
  created
    ? `Demo events created (${created}).`
    : "Demo events already present.",
);
sqlite.close();

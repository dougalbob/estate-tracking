/**
 * Fictional contacts with details, for the demo database only. Development
 * only – never point this at a real estate database.
 *
 * The demo needs contacts with something in the popup: a main contact name,
 * phone numbers typed in more than one format, an email, an account reference
 * and a map link. Two of the three deliberately show the other cases — one with
 * a couple of fields empty, one with almost nothing filled in, so "Not added"
 * and the copy-only behaviour can be seen without inventing an unrealistic
 * record.
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

type DemoContact = {
  name: string;
  mainContact: string | null;
  phoneNumbers: string[];
  email: string | null;
  reference: string | null;
  mapUrl: string | null;
  notes: string;
  status: "not_contacted" | "in_progress" | "awaiting_response" | "resolved";
  projectIds: string[];
  task: {
    title: string;
    detail: string;
    status: "to_do" | "in_progress" | "waiting" | "done" | "cancelled";
    dueDate: string | null;
    followUpDate: string | null;
    assignee: string | null;
  };
};

const contacts: DemoContact[] = [
  {
    name: "Barclays Estate Accounts (fictional)",
    mainContact: "Ms Adeyemi",
    // Two formats on purpose: one typed with spaces, one international.
    phoneNumbers: ["0121 000 0000", "+44 121 000 0000"],
    email: "estate.accounts@example.invalid",
    reference: "ACC-8891024",
    // The documented Google Maps link format, pointed at a fictional street.
    mapUrl:
      "https://www.google.com/maps/search/?api=1&query=1+Example+Street+Birmingham",
    notes: "Fictional bank contact with every field filled in.",
    status: "awaiting_response",
    projectIds: ["probate"],
    task: {
      title: "Confirm the balance for the estate accounts (fictional)",
      detail:
        "Ask for the balance at the date of death and the closing letter.",
      status: "waiting",
      dueDate: null,
      followUpDate: "2026-09-24",
      assignee: users[0],
    },
  },
  {
    name: "Hollow Brook Funeral Directors (fictional)",
    mainContact: "Mr Okafor",
    phoneNumbers: ["(0121) 000-0000"],
    email: null,
    reference: null,
    mapUrl: null,
    notes: "Fictional funeral director, quoted by phone only.",
    status: "in_progress",
    projectIds: ["funeral"],
    task: {
      title: "Ask for the itemised funeral bill (fictional)",
      detail: "Needed before the costs can be recorded in Estate finances.",
      status: "to_do",
      dueDate: "2026-09-21",
      followUpDate: null,
      assignee: users[1],
    },
  },
  {
    name: "Oakfield Council Tax (fictional)",
    mainContact: null,
    phoneNumbers: [],
    email: null,
    reference: null,
    mapUrl: null,
    notes:
      "Fictional contact with nothing filled in yet, to check empty fields.",
    status: "not_contacted",
    projectIds: [],
    task: {
      title: "Report the change of occupancy (fictional)",
      detail: "",
      status: "to_do",
      dueDate: null,
      followUpDate: null,
      assignee: null,
    },
  },
];

let created = 0;
for (const contact of contacts) {
  if (store.snapshot().organisations.some((o) => o.name === contact.name))
    continue;
  const id = store.saveOrganisation(
    {
      name: contact.name,
      mainContact: contact.mainContact,
      phoneNumbers: contact.phoneNumbers,
      email: contact.email,
      reference: contact.reference,
      mapUrl: contact.mapUrl,
      notes: contact.notes,
      status: contact.status,
      projectIds: contact.projectIds,
    },
    users[0],
  );
  store.saveTask(
    {
      title: contact.task.title,
      detail: contact.task.detail,
      organisationId: id,
      interactionId: null,
      projectId: contact.projectIds[0] ?? null,
      assignee: contact.task.assignee,
      status: contact.task.status,
      dueDate: contact.task.dueDate,
      followUpDate: contact.task.followUpDate,
      deadline: null,
    },
    users[0],
  );
  created++;
}
console.log(
  created
    ? `Demo contacts created (${created}).`
    : "Demo contacts already present.",
);
sqlite.close();

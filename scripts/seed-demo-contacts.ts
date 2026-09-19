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
import { everyoneAssignee } from "../src/lib/records/validation";

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
    /** What sort of work it is. Every kind appears once across the demo. */
    kind: "call" | "email" | "meeting" | "research" | "review";
    /** What happened, for the tasks that have already happened. */
    outcome: string | null;
    status: "to_do" | "in_progress" | "scheduled" | "done" | "cancelled";
    dueDate: string | null;
    followUpDate: string | null;
    /** null is unassigned; everyoneAssignee means the two of you together. */
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
      kind: "call",
      outcome: null,
      status: "scheduled",
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
      kind: "email",
      outcome: null,
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
      kind: "research",
      outcome: null,
      // Deliberately overdue and still open, so "Needs attention" can be seen
      // next to the Done task that no longer says it.
      status: "to_do",
      dueDate: "2026-09-15",
      followUpDate: null,
      assignee: null,
    },
  },
  {
    // Resolved, so the Hide resolved filter has something to count. Its task is
    // done and its due date has passed: it should read plainly as Done, with no
    // "Needs attention" chasing it.
    name: "Co-op Funeral Services (fictional)",
    mainContact: "Ms Whitfield",
    phoneNumbers: ["0121 000 0001"],
    email: "funeralcare@example.invalid",
    reference: "FC-4417",
    mapUrl: null,
    notes: "Fictional resolved contact. The service has been arranged.",
    status: "resolved",
    projectIds: ["funeral"],
    task: {
      title: "Call co-op funeral services (fictional)",
      detail:
        "Need to discuss floral arrangements and refreshments after service",
      kind: "call",
      outcome:
        "Agreed a simple sheaf on the coffin and tea for forty in the hall afterwards. Confirmed in writing on the 18th.",
      status: "done",
      dueDate: "2026-09-18",
      followUpDate: null,
      assignee: users[1],
    },
  },
  {
    // The second resolved contact, so the count beside the filter is a number
    // and not simply one.
    name: "Meridian Probate Registry (fictional)",
    mainContact: null,
    phoneNumbers: ["0121 000 0002"],
    email: null,
    reference: "PR-90211",
    mapUrl: null,
    notes: "Fictional resolved contact. The grant has been issued.",
    status: "resolved",
    projectIds: ["probate"],
    task: {
      title: "Review the grant of probate paperwork (fictional)",
      detail: "Check the grant against the estate accounts once it arrives.",
      kind: "review",
      outcome:
        "Grant matches the figures already recorded. Nothing further to chase.",
      status: "done",
      dueDate: null,
      followUpDate: null,
      assignee: users[0],
    },
  },
  {
    name: "Bramble Lane Solicitors (fictional)",
    mainContact: "Mr Adeyemi",
    phoneNumbers: ["0121 000 0003"],
    email: "wills@example.invalid",
    reference: null,
    mapUrl: null,
    notes: "Fictional solicitor holding the will.",
    status: "in_progress",
    projectIds: ["probate"],
    task: {
      title: "Meeting to go through the will (fictional)",
      detail: "Take the list of questions about the residue of the estate.",
      kind: "meeting",
      outcome: null,
      status: "to_do",
      dueDate: "2026-09-30",
      followUpDate: null,
      // Both of them have to be there, so it belongs to both of them.
      assignee: everyoneAssignee,
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
      kind: contact.task.kind,
      outcome: contact.task.outcome,
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

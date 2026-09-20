/**
 * Fictional demo households and gatherings for the Family & friends call sheet.
 * Development only – never point this at a real estate database.
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

store.seedGatherings();

// Update gatherings with demo details
store.saveGathering(
  {
    id: "funeral",
    name: "Funeral",
    date: "2026-10-15",
    time: "11:30",
    place: "St Peter's Church, Harborne",
    notes: "Service followed by committal at Lodge Hill Crematorium.",
  },
  users[0],
);

store.saveGathering(
  {
    id: "wake",
    name: "Wake",
    date: "2026-10-15",
    time: "13:00",
    place: "The Bell Inn, Harborne",
    notes:
      "Buffet lunch and tea booked for up to 35 guests in the private room.",
  },
  users[0],
);

const existing = store
  .snapshot()
  .households.find((h) => h.name === "Chris and Dianne and 2 children");

if (existing) {
  console.log("Demo guest list already present.");
} else {
  const householdsData = [
    {
      name: "Chris and Dianne and 2 children",
      partySize: 4,
      phone: "07700 900123",
      email: "chris.dianne@example.invalid",
      relationship: "Mum's cousin",
      ringing: users[0],
      contactedAt: "2026-09-18T10:15:00.000Z",
      contactedBy: users[0],
      funeral: "coming" as const,
      wake: "coming" as const,
      notes: "Vegetarian options needed for Dianne and children",
    },
    {
      name: "Uncle Arthur and Auntie May",
      partySize: 2,
      phone: "0121 496 0147",
      email: null,
      relationship: "Mum's brother",
      ringing: users[1],
      contactedAt: "2026-09-18T11:30:00.000Z",
      contactedBy: users[1],
      funeral: "coming" as const,
      wake: "not_coming" as const,
      notes: "May finds stairs difficult – step-free access needed",
    },
    {
      name: "Margaret Fletcher",
      partySize: 1,
      phone: "07700 900234",
      email: "m.fletcher@example.invalid",
      relationship: "Next door neighbour",
      ringing: users[0],
      contactedAt: "2026-09-18T14:20:00.000Z",
      contactedBy: users[0],
      funeral: "awaiting_reply" as const,
      wake: "awaiting_reply" as const,
      notes: "Waiting for daughter to confirm transport",
    },
    {
      name: "David and Susan Taylor",
      partySize: 2,
      phone: "07700 900345",
      email: "taylor.d@example.invalid",
      relationship: "Bowling club friend",
      ringing: users[1],
      contactedAt: "2026-09-18T16:00:00.000Z",
      contactedBy: users[1],
      funeral: "coming" as const,
      wake: "coming" as const,
      notes: "",
    },
    {
      name: "The Wilson Family",
      partySize: 3,
      phone: "0121 496 0258",
      email: null,
      relationship: "Old school friend",
      ringing: users[0],
      contactedAt: "2026-09-19T09:45:00.000Z",
      contactedBy: users[0],
      funeral: "not_coming" as const,
      wake: "not_coming" as const,
      notes: "Currently away in Spain until November; sent condolences card",
    },
    {
      name: "Robert Chen",
      partySize: 1,
      phone: "07700 900567",
      email: "rchen@example.invalid",
      relationship: "Bridge club partner",
      ringing: users[1],
      contactedAt: "2026-09-19T11:00:00.000Z",
      contactedBy: users[1],
      funeral: "coming" as const,
      wake: "not_sure" as const,
      notes: "Will confirm wake attendance closer to the day",
    },
    {
      name: "Pat and Terry Higgins",
      partySize: 2,
      phone: "0121 496 0369",
      email: null,
      relationship: "Gardening club",
      ringing: users[0],
      contactedAt: null,
      contactedBy: null,
      funeral: "not_asked" as const,
      wake: "not_asked" as const,
      notes: "Usually home after 5pm",
    },
    {
      name: "Eileen Davies",
      partySize: 1,
      phone: null,
      email: "eileen.davies@example.invalid",
      relationship: "Cousin (Cardiff)",
      ringing: users[1],
      contactedAt: null,
      contactedBy: null,
      funeral: "not_asked" as const,
      wake: "not_asked" as const,
      notes: "No phone number in book – need to email or post letter",
    },
    {
      name: "George and Barbara Smith",
      partySize: 2,
      phone: "07700 900678",
      email: null,
      relationship: "Allotment friend",
      ringing: users[0],
      contactedAt: "2026-09-19T15:30:00.000Z",
      contactedBy: users[0],
      funeral: "awaiting_reply" as const,
      wake: "not_asked" as const,
      notes: "Barbara recovering from hip replacement",
    },
    {
      name: "Dr Simon Patel",
      partySize: 1,
      phone: "07700 900789",
      email: "spatel@example.invalid",
      relationship: "GP and family friend",
      ringing: users[1],
      contactedAt: "2026-09-19T17:10:00.000Z",
      contactedBy: users[1],
      funeral: "coming" as const,
      wake: "coming" as const,
      notes: "Offered to say a few words at the service",
    },
    {
      name: "Jeanette Murphy",
      partySize: 1,
      phone: "0121 496 0481",
      email: null,
      relationship: "Former colleague",
      ringing: users[0],
      contactedAt: null,
      contactedBy: null,
      funeral: "not_asked" as const,
      wake: "not_asked" as const,
      notes: "Try morning calls",
    },
    {
      name: "Ken and Brenda Wood",
      partySize: 2,
      phone: "07700 900890",
      email: "ken.wood@example.invalid",
      relationship: "Church choir",
      ringing: users[1],
      contactedAt: null,
      contactedBy: null,
      funeral: "not_asked" as const,
      wake: "not_asked" as const,
      notes: "",
    },
  ];

  for (const h of householdsData) {
    store.saveHousehold(h, users[0]);
  }

  console.log(`Demo guest list created (${householdsData.length}).`);
}

sqlite.close();

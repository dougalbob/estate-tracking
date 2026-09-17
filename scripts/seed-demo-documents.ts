/**
 * Fictional documents for the demo database only. Development only – never
 * point this at a real estate database.
 *
 * The demo needs documents so the Documents tab is not empty and the contact
 * names on its rows can be seen: one document linked to a single contact,
 * one linked to two contacts, and one linked only through a note, so a row
 * with no tappable contact can be seen too. Each document gets a small
 * generated PNG in the demo documents folder, and its recorded size matches
 * the bytes actually written.
 *
 * Run scripts/seed-demo-contacts.ts first: this seed links to the fictional
 * contacts that one creates. Like the other demo seeds it is idempotent and
 * refuses to run against a database path that does not contain "demo".
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "../src/lib/db/schema";
import { recordStore } from "../src/lib/records/store";
import { safeStorageName } from "../src/lib/documents/storage";

const path = process.env.DATABASE_PATH || "./data/demo.sqlite";
if (!path.includes("demo")) {
  console.error(
    "Refusing to seed: set DATABASE_PATH to the demo database, for example ./data/demo.sqlite",
  );
  process.exit(1);
}
const documentsDir = process.env.DEMO_DOCUMENTS_PATH || "./data/demo-documents";
if (!documentsDir.includes("demo")) {
  console.error(
    "Refusing to write: DEMO_DOCUMENTS_PATH must contain 'demo', for example ./data/demo-documents",
  );
  process.exit(1);
}
const sqlite = new Database(path);
sqlite.pragma("foreign_keys = ON");
const db = drizzle(sqlite, { schema });
migrate(db, { migrationsFolder: "./drizzle" });
const users = ["alex@example.invalid", "jamie@example.invalid"];
const store = recordStore(db, users);

/**
 * A small solid-colour PNG, generated here rather than committed, so the
 * demo files are real files on disk with a size the app can check. Plain
 * PNG format: signature, IHDR, one deflated IDAT of filter-byte-prefixed
 * scanlines, IEND – each chunk length-prefixed and CRC32-checked.
 */
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++)
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, crc]);
}
function makePng(
  width: number,
  height: number,
  [red, green, blue]: [number, number, number],
): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolour
  const stride = 1 + width * 3;
  const raw = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const row = y * stride;
    raw[row] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const px = row + 1 + x * 3;
      raw[px] = red;
      raw[px + 1] = green;
      raw[px + 2] = blue;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

const barclays = store
  .snapshot()
  .organisations.find((o) => o.name === "Barclays Estate Accounts (fictional)");
const hollowBrook = store
  .snapshot()
  .organisations.find(
    (o) => o.name === "Hollow Brook Funeral Directors (fictional)",
  );
if (!barclays || !hollowBrook) {
  console.error(
    "The demo contacts are missing – run scripts/seed-demo-contacts.ts first.",
  );
  process.exit(1);
}

// The third document is linked through a note rather than a contact, so a
// row with no tappable name can be seen.
const noteTitle = "Phone call about the itemised bill (fictional)";
const note = store
  .snapshot()
  .interactions.find((i) => i.title === noteTitle);
const noteId =
  note?.id ??
  store.saveInteraction(
    {
      title: noteTitle,
      detail:
        "Fictional note, so a demo document can be linked through a note rather than a contact.",
      kind: "call",
      occurredAt: new Date().toISOString(),
      organisationId: hollowBrook.id,
    },
    users[1],
  );

type DemoDocument = {
  friendlyName: string;
  originalName: string;
  category: string;
  colour: [number, number, number];
  links: { organisationId?: string; interactionId?: string }[];
};
const documents: DemoDocument[] = [
  {
    friendlyName: "Estate account statement (fictional)",
    originalName: "estate-account-statement.png",
    category: "financial",
    colour: [44, 102, 85],
    links: [{ organisationId: barclays.id }],
  },
  {
    friendlyName: "Funeral arrangement letter (fictional)",
    originalName: "funeral-arrangement-letter.png",
    category: "correspondence",
    colour: [106, 115, 107],
    links: [
      { organisationId: barclays.id },
      { organisationId: hollowBrook.id },
    ],
  },
  {
    friendlyName: "Quote follow-up (fictional)",
    originalName: "quote-follow-up.png",
    category: "other",
    colour: [97, 68, 35],
    links: [{ interactionId: noteId }],
  },
];

mkdirSync(documentsDir, { recursive: true });
let created = 0;
for (const spec of documents) {
  if (
    store.snapshot().documents.some((d) => d.friendlyName === spec.friendlyName)
  )
    continue;
  const storageName = safeStorageName(spec.originalName);
  const bytes = makePng(120, 80, spec.colour);
  writeFileSync(join(documentsDir, storageName), bytes);
  const documentId = store.createDocumentFromUpload(
    {
      friendlyName: spec.friendlyName,
      originalName: spec.originalName,
      storageName,
      mimeType: "image/png",
      size: bytes.length,
      category: spec.category,
    },
    users[0],
  );
  for (const target of spec.links) {
    const input: Record<string, unknown> = { documentId };
    if (target.organisationId) input.organisationId = target.organisationId;
    if (target.interactionId) input.interactionId = target.interactionId;
    store.linkDocument(input, users[0]);
  }
  created++;
}
console.log(
  created
    ? `Demo documents created (${created}).`
    : "Demo documents already present.",
);
sqlite.close();

import assert from "node:assert/strict";
import test from "node:test";
import { documentLinkItems } from "../src/lib/contacts/document-links";

// A document row can list several linked names at once, and only the directly
// linked *live* contacts become tappable. These tests pin that decision:
// which name is a contact, which stays plain text, and in what order.
// No database is needed; the rows are ordinary objects.

type Link = {
  documentId: string;
  organisationId: string | null;
  interactionId: string | null;
  taskId: string | null;
  projectId: string | null;
  financeRecordId: string | null;
};
const link = (partial: Partial<Link> = {}): Link => ({
  documentId: "doc-1",
  organisationId: null,
  interactionId: null,
  taskId: null,
  projectId: null,
  financeRecordId: null,
  ...partial,
});

const barclays = { id: "org-1", name: "Barclays Estate Accounts (fictional)" };
const hollowBrook = {
  id: "org-2",
  name: "Hollow Brook Funeral Directors (fictional)",
};
const oakfield = { id: "org-3", name: "Oakfield Council Tax (fictional)" };
const funeralTask = {
  id: "task-1",
  title: "Ask for the itemised funeral bill",
};
const bankNote = { id: "note-1", title: "Called about the estate accounts" };
const probate = { id: "proj-1", name: "Probate & Estate Administration" };

test("a document with no links has no items, and other documents' links are ignored", () => {
  assert.deepEqual(
    documentLinkItems(
      "doc-1",
      [link({ documentId: "doc-2", organisationId: "org-1" })],
      [barclays],
      [],
      [],
      [],
      [],
    ),
    [],
  );
  assert.deepEqual(documentLinkItems("doc-1", [], [], [], [], [], []), []);
});

test("a directly linked live contact is a tappable contact item", () => {
  const items = documentLinkItems(
    "doc-1",
    [link({ organisationId: "org-1" })],
    [barclays],
    [],
    [],
    [],
    [],
  );
  assert.deepEqual(items, [
    { kind: "contact", organisationId: "org-1", name: barclays.name },
  ]);
});

test("two directly linked contacts are two tappable items, in link order", () => {
  const items = documentLinkItems(
    "doc-1",
    [link({ organisationId: "org-2" }), link({ organisationId: "org-1" })],
    [barclays, hollowBrook],
    [],
    [],
    [],
    [],
  );
  assert.deepEqual(items, [
    { kind: "contact", organisationId: "org-2", name: hollowBrook.name },
    { kind: "contact", organisationId: "org-1", name: barclays.name },
  ]);
});

test("a contact in the recoverable bin is plain text with its name", () => {
  const items = documentLinkItems(
    "doc-1",
    [link({ organisationId: "org-3" })],
    [barclays],
    [oakfield],
    [],
    [],
    [],
  );
  assert.deepEqual(items, [{ kind: "text", value: oakfield.name }]);
});

test("a contact id known nowhere reads as the app's fallback name", () => {
  const items = documentLinkItems(
    "doc-1",
    [link({ organisationId: "gone" })],
    [],
    [],
    [],
    [],
    [],
  );
  assert.deepEqual(items, [{ kind: "text", value: "Linked organisation" }]);
});

test("a linked note appears by title", () => {
  const items = documentLinkItems(
    "doc-1",
    [link({ interactionId: "note-1" })],
    [],
    [],
    [],
    [bankNote],
    [],
  );
  assert.deepEqual(items, [{ kind: "text", value: bankNote.title }]);
});

test("a binned note reads as the plain fallback, not a contact", () => {
  const items = documentLinkItems(
    "doc-1",
    [link({ interactionId: "gone" })],
    [],
    [],
    [],
    [],
    [],
  );
  assert.deepEqual(items, [{ kind: "text", value: "Note" }]);
});

test("a linked task appears by title", () => {
  const items = documentLinkItems(
    "doc-1",
    [link({ taskId: "task-1" })],
    [],
    [],
    [funeralTask],
    [],
    [],
  );
  assert.deepEqual(items, [{ kind: "text", value: funeralTask.title }]);
});

test("a binned task reads as the plain fallback", () => {
  const items = documentLinkItems(
    "doc-1",
    [link({ taskId: "gone" })],
    [],
    [],
    [],
    [],
    [],
  );
  assert.deepEqual(items, [{ kind: "text", value: "Task" }]);
});

test("a linked project appears by name, live or binned", () => {
  const items = documentLinkItems(
    "doc-1",
    [link({ projectId: "proj-1" })],
    [],
    [],
    [],
    [],
    [probate],
  );
  assert.deepEqual(items, [{ kind: "text", value: probate.name }]);
});

test("an unknown project reads as the plain fallback", () => {
  const items = documentLinkItems(
    "doc-1",
    [link({ projectId: "gone" })],
    [],
    [],
    [],
    [],
    [],
  );
  assert.deepEqual(items, [{ kind: "text", value: "Linked project" }]);
});

test("a link to a financial record only stays invisible, as before", () => {
  // Pre-existing quirk, carried over on purpose: a receipt attached to a
  // payment still reads "No links yet" on the Documents row.
  const items = documentLinkItems(
    "doc-1",
    [link({ financeRecordId: "fin-1" })],
    [],
    [],
    [],
    [],
    [],
  );
  assert.deepEqual(items, []);
});

test("mixed links keep the row's link order with each kind in its place", () => {
  const items = documentLinkItems(
    "doc-1",
    [
      link({ organisationId: "org-1" }),
      link({ interactionId: "note-1" }),
      link({ organisationId: "org-3" }),
      link({ taskId: "task-1" }),
      link({ projectId: "proj-1" }),
    ],
    [barclays],
    [oakfield],
    [funeralTask],
    [bankNote],
    [probate],
  );
  assert.deepEqual(items, [
    { kind: "contact", organisationId: "org-1", name: barclays.name },
    { kind: "text", value: bankNote.title },
    { kind: "text", value: oakfield.name },
    { kind: "text", value: funeralTask.title },
    { kind: "text", value: probate.name },
  ]);
});

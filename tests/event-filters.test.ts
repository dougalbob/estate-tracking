import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultEventFilters,
  isDefaultEventFilters,
  parseEventFilters,
  serialiseEventFilters,
  type EventFilters,
} from "../src/components/event-filters";

// The Event log's filters are the only state the app keeps in the browser, so
// what comes back out of storage is treated as untrusted: it can be damaged, it
// can be from an older version, and it can point at a contact or project that
// has since been deleted.

const options = {
  organisationIds: ["org-solicitor", "org-bank"],
  projectIds: ["probate", "funeral"],
  kinds: ["call", "email", "letter", "web_form", "note"],
  recorders: ["alex@example.invalid", "jamie@example.invalid"],
};

test("nothing stored means the defaults", () => {
  for (const raw of [null, "", "   "])
    assert.deepEqual(parseEventFilters(raw, options), defaultEventFilters);
});

test("damaged or unexpected storage falls back rather than breaking", () => {
  for (const raw of [
    "{not json",
    "[]",
    '"a string"',
    "42",
    "null",
    JSON.stringify([{ query: "x" }]),
  ])
    assert.deepEqual(
      parseEventFilters(raw, options),
      defaultEventFilters,
      `expected defaults for ${raw}`,
    );
});

test("filters survive a trip through storage unchanged", () => {
  const filters: EventFilters = {
    query: "inheritance tax",
    organisationId: "org-solicitor",
    projectId: "none",
    kind: "letter",
    recorder: "jamie@example.invalid",
    order: "oldest",
  };
  assert.deepEqual(
    parseEventFilters(serialiseEventFilters(filters), options),
    filters,
  );
});

test("a filter pointing at something that no longer exists falls back to all", () => {
  // The contact was deleted between visits. Trusting the stored id would hide
  // every event in the log with no way to see why.
  const parsed = parseEventFilters(
    JSON.stringify({
      ...defaultEventFilters,
      organisationId: "org-deleted",
      projectId: "project-deleted",
      recorder: "someone@else.invalid",
      kind: "fax",
      order: "sideways",
    }),
    options,
  );
  assert.equal(parsed.organisationId, "all");
  assert.equal(parsed.projectId, "all");
  assert.equal(parsed.recorder, "all");
  assert.equal(parsed.kind, "all");
  assert.equal(parsed.order, "newest");
});

test('"no organisation" and "no project" are kept', () => {
  const parsed = parseEventFilters(
    JSON.stringify({
      ...defaultEventFilters,
      organisationId: "none",
      projectId: "none",
    }),
    options,
  );
  assert.equal(parsed.organisationId, "none");
  assert.equal(parsed.projectId, "none");
});

test("a field of the wrong type is ignored, and a long search is trimmed", () => {
  const parsed = parseEventFilters(
    JSON.stringify({
      query: "x".repeat(5000),
      organisationId: 42,
      projectId: { id: "probate" },
      kind: null,
      recorder: true,
      order: 7,
    }),
    options,
  );
  assert.equal(parsed.query.length, 200);
  assert.equal(parsed.organisationId, "all");
  assert.equal(parsed.projectId, "all");
  assert.equal(parsed.kind, "all");
  assert.equal(parsed.recorder, "all");
  assert.equal(parsed.order, "newest");
});

test("extra keys in storage are ignored", () => {
  const parsed = parseEventFilters(
    JSON.stringify({
      ...defaultEventFilters,
      kind: "email",
      somethingFromAnOlderVersion: "whatever",
    }),
    options,
  );
  assert.equal(parsed.kind, "email");
  assert.deepEqual(Object.keys(parsed).sort(), [
    "kind",
    "order",
    "organisationId",
    "projectId",
    "query",
    "recorder",
  ]);
});

test("the defaults are recognised, and any single change is not", () => {
  assert.equal(isDefaultEventFilters(defaultEventFilters), true);
  assert.equal(
    isDefaultEventFilters({ ...defaultEventFilters, query: "   " }),
    true,
    "a search of only spaces counts as no search",
  );
  const changes: (keyof EventFilters)[] = [
    "query",
    "organisationId",
    "projectId",
    "kind",
    "recorder",
    "order",
  ];
  for (const key of changes) {
    const value = key === "order" ? "oldest" : "something";
    assert.equal(
      isDefaultEventFilters({ ...defaultEventFilters, [key]: value }),
      false,
      `${key} should count as a change`,
    );
  }
});

import assert from "node:assert/strict";
import test from "node:test";
import { byContactName } from "../src/lib/contacts/sort";

// Every contact picker sorts its own copy with this one comparator, so these
// tests pin the promise all six pickers share: A>Z by name, the same order
// the Contacts tab's A>Z option gives, whatever case the names were typed in.

test("contacts sort A>Z by name, whatever case they were typed in", () => {
  // The six demo contacts in the order the seed writes them, which is the
  // order the pickers used to show.
  const demo = [
    "Barclays Estate Accounts",
    "Hollow Brook Funeral Directors",
    "Oakfield Council Tax",
    "Co-op Funeral Services",
    "Meridian Probate Registry",
    "Bramble Lane Solicitors",
  ].map((name) => ({ name }));
  assert.deepEqual(
    demo.sort(byContactName).map((o) => o.name),
    [
      "Barclays Estate Accounts",
      "Bramble Lane Solicitors",
      "Co-op Funeral Services",
      "Hollow Brook Funeral Directors",
      "Meridian Probate Registry",
      "Oakfield Council Tax",
    ],
  );

  // A lowercase b sorts before an uppercase C — alphabetical by letter, not
  // by character code, which is what a person reading A>Z expects.
  const mixed = ["Zebra Ltd", "bramble lane solicitors", "Acme Funerals"].map(
    (name) => ({ name }),
  );
  assert.deepEqual(
    mixed.sort(byContactName).map((o) => o.name),
    ["Acme Funerals", "bramble lane solicitors", "Zebra Ltd"],
  );
});

test("a single contact sorts to itself", () => {
  const one = [{ name: "Meridian Probate Registry" }];
  assert.deepEqual(one.sort(byContactName), [
    { name: "Meridian Probate Registry" },
  ]);
});

test("an empty list of contacts stays empty", () => {
  assert.deepEqual([].sort(byContactName), []);
});

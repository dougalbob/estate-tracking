import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "../src/lib/db/schema";
import { recordStore, RecordError } from "../src/lib/records/store";
import { templateSeeds } from "../src/lib/records/template-seeds";

const users = ["alex@example.invalid", "jamie@example.invalid"];
const alex = users[0];
const jamie = users[1];

function setup() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle" });
  const store = recordStore(db, users);
  store.seedProjects();
  store.seedTemplates();
  return { sqlite, store };
}

test("the notifications list is seeded once and stays editable afterwards", () => {
  const { sqlite, store } = setup();
  try {
    // Seeding twice, as happens on every page load, does not duplicate the list.
    store.seedTemplates();
    const items = store.snapshot().taskTemplates;
    assert.equal(items.length, templateSeeds.length);
    assert.ok(items.every((i) => i.projectId === "notifications"));
    assert.equal(items[0].title, "Tell Us Once");

    // It is written for this estate: a private pension rather than an employer
    // scheme, no mortgage to notify, one energy supplier for gas and electricity,
    // and broadband and mobile listed separately.
    const titles = items.map((i) => i.title).join(" | ");
    const details = items.map((i) => i.detail).join(" ");
    assert.match(titles, /private pension/i);
    assert.doesNotMatch(titles, /employer|mortgage|landlord/i);
    assert.match(details, /no employer scheme/i);
    assert.match(details, /no mortgage lender to notify/i);
    assert.match(titles, /gas and electricity/i);
    assert.match(details, /same supplier/i);
    assert.match(titles, /broadband/i);
    assert.match(titles, /mobile phone/i);

    // Editing wording keeps the item, and never rewrites existing tasks.
    const item = items[0];
    store.saveTemplateItem(
      {
        id: item.id,
        version: item.version,
        projectId: item.projectId,
        title: "Tell Us Once (registrar reference)",
        detail: item.detail,
      },
      alex,
    );
    const edited = store.snapshot().taskTemplates[0];
    assert.equal(edited.title, "Tell Us Once (registrar reference)");
    assert.equal(edited.version, 2);
    assert.equal(edited.createdBy, "system");
    assert.equal(store.snapshot().taskTemplates.length, templateSeeds.length);
  } finally {
    sqlite.close();
  }
});

test("nothing is created until items are chosen, and no dates or owners are set", () => {
  const { sqlite, store } = setup();
  try {
    assert.equal(store.snapshot().tasks.length, 0);
    const items = store.snapshot().taskTemplates;
    const chosen = items.slice(0, 3).map((i) => i.id);
    const result = store.applyTemplate(
      { projectId: "notifications", itemIds: chosen },
      jamie,
    );
    assert.deepEqual(result.added, chosen);
    assert.deepEqual(result.skipped, []);

    const tasks = store.snapshot().tasks;
    assert.equal(tasks.length, 3);
    for (const task of tasks) {
      assert.equal(task.projectId, "notifications");
      assert.equal(task.organisationId, null);
      assert.equal(task.assignee, null);
      assert.equal(task.status, "to_do");
      assert.equal(task.dueDate, null);
      assert.equal(task.followUpDate, null);
      assert.equal(task.deadline, null);
      assert.equal(task.createdBy, jamie);
      assert.ok(chosen.includes(task.templateItemId!));
      // The task keeps the suggestion's wording and explanation as a starting point.
      assert.ok(task.detail.length > 0);
    }
    // Untouched items stay in the list.
    assert.equal(store.snapshot().taskTemplates.length, templateSeeds.length);
  } finally {
    sqlite.close();
  }
});

test("reapplying the list skips anything already in the project", () => {
  const { sqlite, store } = setup();
  try {
    const items = store.snapshot().taskTemplates;
    const first = items.slice(0, 4).map((i) => i.id);
    store.applyTemplate({ projectId: "notifications", itemIds: first }, alex);

    // Applying everything again adds only what is genuinely new.
    const second = store.applyTemplate(
      { projectId: "notifications", itemIds: items.map((i) => i.id) },
      alex,
    );
    assert.equal(second.added.length, items.length - 4);
    assert.equal(second.skipped.length, 4);
    assert.equal(store.snapshot().tasks.length, items.length);

    // A third run adds nothing at all.
    const third = store.applyTemplate(
      { projectId: "notifications", itemIds: items.map((i) => i.id) },
      alex,
    );
    assert.equal(third.added.length, 0);
    assert.equal(third.skipped.length, items.length);
    assert.equal(store.snapshot().tasks.length, items.length);

    // Wording that matches an existing task by hand is skipped too.
    store.saveTask(
      {
        title: "  BANKS AND BUILDING SOCIETIES  ",
        detail: "",
        organisationId: null,
        interactionId: null,
        projectId: "notifications",
        assignee: null,
        status: "to_do",
        dueDate: null,
        followUpDate: null,
        deadline: null,
      },
      alex,
    );
    const binsItem = items.find(
      (i) => i.title === "Banks and building societies",
    )!;
    const again = store.applyTemplate(
      { projectId: "notifications", itemIds: [binsItem.id] },
      alex,
    );
    assert.deepEqual(again.added, []);
    assert.deepEqual(again.skipped, [binsItem.id]);
  } finally {
    sqlite.close();
  }
});

test("a binned task can be re-added from its suggestion without duplicating the live list", () => {
  const { sqlite, store } = setup();
  try {
    const item = store
      .snapshot()
      .taskTemplates.find((i) => i.title === "TV Licence")!;
    store.applyTemplate(
      { projectId: "notifications", itemIds: [item.id] },
      alex,
    );
    const task = store.snapshot().tasks[0];
    store.deleteRecord("task", task.id, task.version, alex);

    const result = store.applyTemplate(
      { projectId: "notifications", itemIds: [item.id] },
      alex,
    );
    assert.deepEqual(result.added, [item.id]);
    assert.equal(store.snapshot().tasks.length, 1);
    assert.equal(store.snapshot().deletedTasks.length, 1);
  } finally {
    sqlite.close();
  }
});

test("checklist items can be added, removed and restored, and a manual task is left alone", () => {
  const { sqlite, store } = setup();
  try {
    const id = store.saveTemplateItem(
      {
        projectId: "notifications",
        title: "Gym membership",
        detail: "Paid by direct debit, so it keeps going until told otherwise.",
      },
      alex,
    );
    let items = store.snapshot().taskTemplates;
    assert.equal(items.length, templateSeeds.length + 1);
    const custom = items.find((i) => i.id === id)!;
    assert.equal(custom.sortOrder, templateSeeds.length + 1);

    // Duplicate wording in the same list is refused.
    assert.throws(
      () =>
        store.saveTemplateItem(
          {
            projectId: "notifications",
            title: " gym  MEMBERSHIP ",
            detail: "",
          },
          alex,
        ),
      /already has an item with that wording/,
    );

    // Adding from the new item and then removing the item leaves the task alone.
    store.applyTemplate({ projectId: "notifications", itemIds: [id] }, jamie);
    const task = store.snapshot().tasks[0];
    store.deleteTemplateItem(id, custom.version, jamie);
    items = store.snapshot().taskTemplates;
    assert.equal(items.length, templateSeeds.length);
    assert.equal(store.snapshot().deletedTaskTemplates.length, 1);
    assert.equal(store.snapshot().tasks.length, 1);
    assert.equal(store.snapshot().tasks[0].title, "Gym membership");

    // Restore brings the suggestion back without touching the task again.
    const binned = store.snapshot().deletedTaskTemplates[0];
    store.restoreTemplateItem(binned.id, binned.version, alex);
    assert.equal(
      store.snapshot().taskTemplates.length,
      templateSeeds.length + 1,
    );
    assert.equal(store.snapshot().tasks[0].id, task.id);
    assert.equal(store.snapshot().tasks[0].version, 1);
  } finally {
    sqlite.close();
  }
});

test("checklist writes are validated, attributed and confined to their project", () => {
  const { sqlite, store } = setup();
  try {
    const item = store.snapshot().taskTemplates[0];
    assert.throws(
      () =>
        store.applyTemplate({ projectId: "probate", itemIds: [item.id] }, alex),
      (error: unknown) =>
        error instanceof RecordError && error.code === "validation",
    );
    assert.equal(store.snapshot().tasks.length, 0);

    assert.throws(
      () =>
        store.applyTemplate({ projectId: "notifications", itemIds: [] }, alex),
      /Choose at least one item/,
    );
    // An id that no longer exists – for example a suggestion removed in another
    // tab – is skipped rather than failing the whole batch.
    const missing = store.applyTemplate(
      { projectId: "notifications", itemIds: ["not-a-real-item"] },
      alex,
    );
    assert.deepEqual(missing.added, []);
    assert.deepEqual(missing.skipped, ["not-a-real-item"]);
    assert.equal(store.snapshot().tasks.length, 0);
    assert.throws(
      () =>
        store.saveTemplateItem(
          { projectId: "notifications", title: "", detail: "" },
          alex,
        ),
      /short title/,
    );
    assert.throws(
      () =>
        store.saveTemplateItem(
          { projectId: "notifications", title: "Anything", detail: "" },
          "stranger@example.invalid",
        ),
      /Unauthorised/,
    );
    // A stale edit is rejected rather than overwriting the other person's wording.
    store.saveTemplateItem(
      {
        id: item.id,
        version: item.version,
        projectId: item.projectId,
        title: "Tell Us Once (edited)",
        detail: item.detail,
      },
      alex,
    );
    assert.throws(
      () =>
        store.saveTemplateItem(
          {
            id: item.id,
            version: item.version,
            projectId: item.projectId,
            title: "Tell Us Once (stale)",
            detail: item.detail,
          },
          jamie,
        ),
      (error: unknown) =>
        error instanceof RecordError && error.code === "conflict",
    );
    assert.equal(
      store.snapshot().taskTemplates[0].title,
      "Tell Us Once (edited)",
    );
    const audit = store
      .snapshot()
      .revisions.filter((r) => r.entity === "template_item");
    assert.equal(audit.length, 1);
    assert.equal(audit[0].actor, alex);
  } finally {
    sqlite.close();
  }
});

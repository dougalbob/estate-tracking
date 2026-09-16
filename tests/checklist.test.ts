import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "../src/lib/db/schema";
import { recordStore, RecordError } from "../src/lib/records/store";
import {
  funeralTemplateSeeds,
  notificationsTemplateSeeds,
  probateTemplateSeeds,
  templateSeeds,
} from "../src/lib/records/template-seeds";

const users = ["alex@example.invalid", "jamie@example.invalid"];
const notif = notificationsTemplateSeeds;
const probate = probateTemplateSeeds;
const funeral = funeralTemplateSeeds;
const notificationsOf = (store: ReturnType<typeof setup>["store"]) =>
  store.snapshot().taskTemplates.filter((i) => i.projectId === "notifications");
const probateOf = (store: ReturnType<typeof setup>["store"]) =>
  store.snapshot().taskTemplates.filter((i) => i.projectId === "probate");
const funeralOf = (store: ReturnType<typeof setup>["store"]) =>
  store.snapshot().taskTemplates.filter((i) => i.projectId === "funeral");
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
    const items = notificationsOf(store);
    assert.equal(items.length, notif.length);
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
    const edited = notificationsOf(store)[0];
    assert.equal(edited.title, "Tell Us Once (registrar reference)");
    assert.equal(edited.version, 2);
    assert.equal(edited.createdBy, "system");
    assert.equal(notificationsOf(store).length, notif.length);
  } finally {
    sqlite.close();
  }
});

test("nothing is created until items are chosen, and no dates or owners are set", () => {
  const { sqlite, store } = setup();
  try {
    assert.equal(store.snapshot().tasks.length, 0);
    const items = notificationsOf(store);
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
    assert.equal(notificationsOf(store).length, notif.length);
  } finally {
    sqlite.close();
  }
});

test("reapplying the list skips anything already in the project", () => {
  const { sqlite, store } = setup();
  try {
    const items = notificationsOf(store);
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
    let items = notificationsOf(store);
    assert.equal(items.length, notif.length + 1);
    const custom = items.find((i) => i.id === id)!;
    assert.equal(custom.sortOrder, notif.length + 1);

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
    items = notificationsOf(store);
    assert.equal(items.length, notif.length);
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
    const item = notificationsOf(store)[0];
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
    assert.equal(notificationsOf(store)[0].title, "Tell Us Once (edited)");
    const audit = store
      .snapshot()
      .revisions.filter((r) => r.entity === "template_item");
    assert.equal(audit.length, 1);
    assert.equal(audit[0].actor, alex);
  } finally {
    sqlite.close();
  }
});

test("the probate list is seeded, tailored, and states no rules or figures", () => {
  const { sqlite, store } = setup();
  try {
    const items = probateOf(store);
    assert.equal(items.length, probate.length);
    assert.equal(items[0].title, "Confirm whether a grant is needed at all");

    const titles = items.map((i) => i.title).join(" | ");
    const text = items.map((i) => `${i.title} ${i.detail}`).join(" ");

    // Written for an English estate, without a solicitor, and pointed at the
    // authorities rather than quoting rules that change.
    assert.match(titles, /grant is needed/i);
    assert.match(titles, /will/i);
    assert.match(titles, /statement of truth/i);
    assert.match(titles, /Inheritance Tax account/i);
    assert.match(titles, /advertising for unknown creditors/i);
    assert.match(text, /GOV\.UK/);
    assert.match(text, /no solicitor is required|handled without one/i);
    assert.match(text, /deliberately does not calculate tax/i);
    assert.match(
      text,
      /English estate|probate registry|letters of administration/i,
    );

    // No money thresholds, rates or fees are baked in, so nothing goes stale
    // and the app is not offering a calculation.
    assert.doesNotMatch(text, /£|percent|40%|325,000|175,000|500,000/);
    assert.doesNotMatch(text, /\b\d{3,}\b/);

    // It is a list, not work: applying nothing creates nothing.
    assert.equal(store.snapshot().tasks.length, 0);

    // A selection applies to the probate project and skips on a second run.
    const chosen = [
      items.find((i) => i.id === "probate-find-will")!,
      items.find((i) => i.id === "probate-value-estate")!,
      items.find((i) => i.id === "probate-iht-forms")!,
    ].map((i) => i.id);
    const first = store.applyTemplate(
      { projectId: "probate", itemIds: chosen },
      alex,
    );
    assert.deepEqual(first.added, chosen);
    const second = store.applyTemplate(
      { projectId: "probate", itemIds: chosen },
      jamie,
    );
    assert.deepEqual(second.added, []);
    assert.deepEqual(second.skipped, chosen);

    const tasks = store.snapshot().tasks;
    assert.equal(tasks.length, 3);
    assert.ok(tasks.every((t) => t.projectId === "probate"));
    assert.ok(tasks.every((t) => t.assignee === null && t.dueDate === null));

    // The two lists are independent: notifications is untouched by this.
    assert.equal(
      store.snapshot().tasks.filter((t) => t.projectId === "notifications")
        .length,
      0,
    );
    assert.equal(notificationsOf(store).length, notif.length);
  } finally {
    sqlite.close();
  }
});

test("all three starter lists are seeded together and stay independent", () => {
  const { sqlite, store } = setup();
  try {
    store.seedTemplates();
    const all = store.snapshot().taskTemplates;
    assert.equal(all.length, notif.length + probate.length + funeral.length);
    assert.equal(funeralOf(store).length, funeral.length);

    // Items never move between lists.
    const item = probateOf(store)[0];
    assert.throws(
      () =>
        store.saveTemplateItem(
          {
            id: item.id,
            version: item.version,
            projectId: "notifications",
            title: item.title,
            detail: item.detail,
          },
          alex,
        ),
      /stays with its project/,
    );

    // The same wording may exist in two different lists.
    const id = store.saveTemplateItem(
      {
        projectId: "notifications",
        title: "The ashes – nothing to decide yet",
        detail: "Shared wording.",
      },
      jamie,
    );
    assert.ok(id);
    assert.equal(
      store
        .snapshot()
        .taskTemplates.filter(
          (i) => i.title === "The ashes – nothing to decide yet",
        ).length,
      2,
    );
    // A new item goes to the end of its own list, not another list's numbering.
    const added = store.snapshot().taskTemplates.find((i) => i.id === id)!;
    assert.equal(added.sortOrder, notif.length + 1);
  } finally {
    sqlite.close();
  }
});

test("the funeral list is tailored to a cremation, a celebrant and a pub wake", () => {
  const { sqlite, store } = setup();
  try {
    const items = funeralOf(store);
    assert.equal(items.length, funeral.length);
    assert.equal(
      items[0].title,
      "Register the death and collect the certificates",
    );

    const titles = items.map((i) => i.title).join(" | ");
    const text = items.map((i) => `${i.title} ${i.detail}`).join(" ");

    // Written for the agreed plan: non-denominational cremation with a
    // celebrant, wake at a local pub.
    assert.match(titles, /cremation paperwork/i);
    assert.match(titles, /celebrant/i);
    assert.match(titles, /wake at the pub/i);
    assert.match(titles, /catering/i);
    assert.match(titles, /tribute/i);
    assert.match(titles, /ashes/i);
    assert.match(text, /crematorium/i);
    assert.match(text, /non-denominational/i);
    assert.match(text, /separate medical certificate/i);

    // No burial, no church, and no assumption of a religious service.
    assert.doesNotMatch(text, /grave|church|vicar|priest|hymn|burial/i);

    // Nothing is costed, and no figures are quoted anywhere.
    assert.doesNotMatch(text, /£|percent|\b\d{3,}\b/);

    // The funeral costs item points at the finances module rather than deciding
    // how it is paid.
    const costs = items.find((i) => i.id === "fun-costs")!;
    assert.match(costs.detail, /Estate finances/);
    assert.match(costs.detail, /reimbursed/);

    // Applying works the same way as the other lists.
    const chosen = [
      items.find((i) => i.id === "fun-register-death")!,
      items.find((i) => i.id === "fun-celebrant")!,
    ].map((i) => i.id);
    assert.deepEqual(
      store.applyTemplate({ projectId: "funeral", itemIds: chosen }, alex)
        .added,
      chosen,
    );
    assert.deepEqual(
      store.applyTemplate({ projectId: "funeral", itemIds: chosen }, jamie)
        .added,
      [],
    );
    const tasks = store.snapshot().tasks;
    assert.equal(tasks.length, 2);
    assert.ok(tasks.every((t) => t.projectId === "funeral"));
    assert.ok(tasks.every((t) => t.assignee === null && t.dueDate === null));
    assert.equal(notificationsOf(store).length, notif.length);
    assert.equal(probateOf(store).length, probate.length);
  } finally {
    sqlite.close();
  }
});

test("the notifications list now covers the registration appointment", () => {
  const { sqlite, store } = setup();
  try {
    const items = notificationsOf(store);
    assert.equal(items.length, notif.length);
    const certificates = items.find((i) => i.id === "notif-certificates")!;
    assert.equal(
      certificates.title,
      "Order extra death certificates at the appointment",
    );
    assert.equal(certificates.sortOrder, 2);
    const tellUsOnce = items.find((i) => i.id === "notif-tell-us-once")!;
    assert.match(
      tellUsOnce.detail,
      /reference code at the registration appointment/i,
    );
    assert.match(tellUsOnce.detail, /only be used once/i);
    // Ordering is by position, so the appointment items read first.
    assert.deepEqual(
      items.slice(0, 2).map((i) => i.id),
      ["notif-tell-us-once", "notif-certificates"],
    );
  } finally {
    sqlite.close();
  }
});

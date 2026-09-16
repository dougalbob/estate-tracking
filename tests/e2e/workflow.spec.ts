import { test, expect } from "@playwright/test";
test("organisation, call, follow-ups, two-user edits, conflict recovery and mobile", async ({
  page,
  browser,
  baseURL,
}) => {
  test.setTimeout(90000);
  const name = `Bank1 demo ${Date.now()}`;
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await expect(
    page.getByText("Fictional-data preview", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Contacts", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Add organisation", exact: true })
    .click();
  await page.getByLabel("Organisation name").fill(name);
  await page.getByLabel("Account / reference").fill("DEMO-123");
  await page.getByLabel("Main contact").fill("Taylor (fictional)");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Log interaction", exact: true })
    .click();
  await page
    .getByLabel("Title", { exact: false })
    .fill("Called bank about required documents");
  await page
    .getByLabel("Detail", { exact: true })
    .fill(
      "Please send a death certificate and chase next week. Fictional test record.",
    );
  await page.getByRole("button", { name: "Add a follow-up task" }).click();
  const first = page.getByRole("group", { name: "Follow-up 1", exact: true });
  await first.getByLabel("Task title").fill("Send certificate to demo bank");
  await first.getByLabel("Assigned to").selectOption("jamie@example.invalid");
  await first.getByLabel("Due date", { exact: true }).fill("2026-10-01");
  await page.getByRole("button", { name: "Add a follow-up task" }).click();
  const second = page.getByRole("group", { name: "Follow-up 2", exact: true });
  await second.getByLabel("Task title").fill("Chase demo bank response");
  await second.getByLabel("Follow-up date").fill("2026-10-08");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Called bank about required documents" }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("button", {
        name: "Send certificate to demo bank",
        exact: true,
      })
      .first(),
  ).toBeVisible();
  await page.reload();
  await page.waitForLoadState("networkidle");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Contacts", exact: true })
    .click();
  await page.getByRole("button", { name: new RegExp(name) }).click();
  await expect(page.getByText("DEMO-123", { exact: true })).toBeVisible();
  // Two independent browser sessions start editing the same version.
  await page.getByRole("button", { name: "Edit organisation" }).click();
  await page.getByLabel("Account / reference").fill("ALEX-DRAFT");
  const context = await browser.newContext();
  const other = await context.newPage();
  await other.goto(baseURL!);
  await other.waitForLoadState("networkidle");
  await other.getByRole("button", { name: "Try as Jamie" }).click();
  await other
    .getByRole("navigation")
    .getByRole("button", { name: "Contacts", exact: true })
    .click();
  await other.getByRole("button", { name: new RegExp(name) }).click();
  await other.getByRole("button", { name: "Edit organisation" }).click();
  await other.getByLabel("Account / reference").fill("JAMIE-UPDATE");
  await other.getByRole("button", { name: "Save", exact: true }).click();
  await expect(other.getByText("JAMIE-UPDATE", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "changed while you were editing",
  );
  await expect(page.getByLabel("Account / reference")).toHaveValue(
    "ALEX-DRAFT",
  );
  await page.getByText(/Review latest saved version/).click();
  await expect(
    page.getByRole("dialog").locator(".revision-values"),
  ).toContainText("JAMIE-UPDATE");
  await page.getByRole("button", { name: /I’ve reviewed it/ }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("ALEX-DRAFT", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "History", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("dialog", { name: "Record history" }),
  ).toContainText("Edited by jamie");
  await page.getByRole("button", { name: "Close history" }).click();
  // Resolution gives an explicit warning and does not close outstanding tasks.
  await page.getByRole("button", { name: "Edit organisation" }).click();
  await page
    .getByRole("dialog")
    .getByRole("combobox", { name: "Status", exact: true })
    .selectOption("resolved");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "open tasks",
  );
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "All tasks", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Send certificate to demo bank", exact: true })
    .last()
    .click();
  await page
    .getByRole("dialog")
    .getByRole("combobox", { name: "Status", exact: true })
    .selectOption("done");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  // Mobile navigation and quick capture remain usable without horizontal page overflow.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Quick note", exact: true }).click();
  await page
    .getByLabel("Detail", { exact: true })
    .fill("Fictional mobile quick capture");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Unfiled notes", exact: true })
    .click();
  await expect(
    page.getByText("Fictional mobile quick capture", { exact: true }).last(),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/mobile-workflow.png",
    fullPage: true,
  });
  await context.close();
});

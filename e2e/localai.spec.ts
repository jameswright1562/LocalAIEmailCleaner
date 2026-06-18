import { APIRequestContext, expect, test } from "@playwright/test";

const apiBaseUrl = "http://127.0.0.1:18787";

async function resetState(request: APIRequestContext) {
  let lastStatus = 0;
  let lastBody = "";
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await request.post(`${apiBaseUrl}/api/test/reset`, { timeout: 5_000 });
      lastStatus = response.status();
      lastBody = await response.text();
      if (response.ok()) return;
    } catch (error) {
      lastBody = (error as Error).message;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  expect(`status=${lastStatus} body=${lastBody}`).toBe("reset endpoint to return 2xx");
}

test.beforeEach(async ({ request }) => {
  await resetState(request);
});

test("API exposes seeded state, paged emails, and clear Gmail errors", async ({ request }) => {
  const stateResponse = await request.get(`${apiBaseUrl}/api/state`);
  expect(stateResponse.ok()).toBeTruthy();
  const state = await stateResponse.json();
  expect(state.emails).toEqual([]);
  expect(state.settings.gmailAccounts).toHaveLength(2);
  expect(state.settings.activeGmailAccountId).toBe("gmail_primary");

  const emailsResponse = await request.get(`${apiBaseUrl}/api/emails?accountId=gmail_primary&limit=10`);
  expect(emailsResponse.ok()).toBeTruthy();
  const emailPage = await emailsResponse.json();
  expect(emailPage.total).toBe(2);
  expect(emailPage.emails.map((email: { id: string }) => email.id)).toEqual(["msg_001", "msg_002"]);

  const syncResponse = await request.post(`${apiBaseUrl}/api/gmail/sync`);
  expect(syncResponse.status()).toBe(400);
  await expect(syncResponse.json()).resolves.toMatchObject({
    ok: false,
    error: "Missing OAuth credentials for james@example.com."
  });
});

test("dashboard reviews seeded mail and streams one-email cleanup reasoning", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Inbox cleanup" })).toBeVisible();
  await expect(page.getByText("james@example.com")).toBeVisible();
  await expect(page.getByText("2/2 messages")).toBeVisible();
  await expect(page.getByRole("button", { name: /jobs@greenhouse.io/i })).toBeVisible();

  await page.getByRole("button", { name: /deals@wanderly.test/i }).click();
  await expect(page.locator("strong").filter({ hasText: "Summer fares to Lisbon end tonight" })).toBeVisible();
  await expect(page.getByText("Not classified")).toBeVisible();

  await page.getByRole("button", { name: /run cleanup/i }).click();
  await expect(
    page.locator("li").filter({ hasText: /Processing 2 unprocessed active email\(s\) in \d+ batch\(es\)/ })
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Reasoning trace" })).toBeVisible();
  await expect(page.locator("li").filter({ hasText: /Decision reasoning for email 1\/2\./ })).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("li").filter({ hasText: /Decision reasoning for email 2\/2\./ })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/Decision engine chose/).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("li").filter({ hasText: /Cleanup run .* completed\./ })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("0/0 messages")).toBeVisible({ timeout: 10_000 });
});

test("settings covers accounts, validation, model probing, tool probing, and visible errors", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Settings" }).click();

  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.getByText("james@example.com")).toBeVisible();

  await page.getByLabel("Base URL").fill("");
  await expect(page.getByText("Base URL is required.")).toBeVisible();

  await page.getByRole("button", { name: /probe tools/i }).click();
  await expect(page.getByText("Automation tools refreshed.")).toBeVisible();
  await expect(page.getByText("Playwright unsubscribe")).toBeVisible();

  await page.getByRole("button", { name: /add account/i }).click();
  await page.getByLabel("Gmail address").fill("qa@example.com");
  await page.getByLabel("OAuth client ID").fill("not-a-google-client");
  await expect(page.getByText("OAuth client ID looks incomplete")).toBeVisible();

  await page.getByRole("button", { name: /save settings/i }).click();
  await expect(page.getByText("Settings saved.")).toBeVisible();

  await page.getByRole("button", { name: /connect google/i }).click();
  await expect(page.getByText("Something needs attention")).toBeVisible();
  await expect(page.getByRole("main").getByText(/before connecting Google/)).toBeVisible();

  await page.getByRole("button", { name: /sync gmail inbox/i }).click();
  await expect(page.getByRole("main").getByText(/Missing OAuth credentials for qa@example.com\./)).toBeVisible();
});

test("schedule editor creates and deletes scheduled cleanup runs", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Scheduled Runs" }).click();

  await expect(page.getByRole("heading", { name: "Scheduled cleanup runs" })).toBeVisible();
  await expect(page.getByText("Friday inbox reset")).toBeVisible();

  await page.getByRole("button", { name: /new schedule/i }).click();
  await page.getByLabel("Name").fill("Morning triage");
  await page.getByLabel("Cadence").selectOption("weekly");
  await page.getByLabel("Time").fill("09:15");
  await page.getByRole("button", { name: /save schedule/i }).click();

  await expect(page.getByText("Schedule saved.")).toBeVisible();
  await expect(page.getByText("Morning triage")).toBeVisible();
  await expect(page.getByRole("row", { name: /Morning triage weekly/ })).toBeVisible();

  await page.getByRole("row", { name: /Morning triage weekly/ }).getByRole("button", { name: "Delete schedule" }).click();
  await expect(page.getByText("Schedule deleted.")).toBeVisible();
  await expect(page.getByText("Morning triage")).toBeHidden();
});

test("unsubscribe page runs dry-run unsubscribe workflow and records history", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("2/2 messages")).toBeVisible();
  await page.getByRole("button", { name: "Unsubscribe", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Full unsubscribe" })).toBeVisible();
  await expect(page.getByText("deals@wanderly.test")).toBeVisible();

  await page.getByRole("button", { name: /unsubscribe all/i }).click();
  await expect(page.getByText("Unsubscribe run completed.")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("deals@wanderly.test")).toBeHidden();

  await page.getByRole("button", { name: "History" }).click();
  await expect(page.getByText("unsubscribe-all")).toBeVisible();
  await expect(page.getByRole("cell", { name: "completed" }).first()).toBeVisible();
});

test("history page shows empty state and cleanup outcomes", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "History" }).click();
  await expect(page.getByText("No cleanup runs yet.")).toBeVisible();

  await page.getByRole("button", { name: "Dashboard" }).click();
  await page.getByRole("button", { name: /run cleanup/i }).click();
  await expect(page.locator("li").filter({ hasText: /Cleanup run .* completed\./ })).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: "History" }).click();
  await expect(page.getByText("manual")).toBeVisible();
  await expect(page.getByRole("cell", { name: "completed" }).first()).toBeVisible();
  await expect(page.getByRole("cell", { name: "2" }).first()).toBeVisible();
});

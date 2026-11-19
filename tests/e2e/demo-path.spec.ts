import { expect, test } from "@playwright/test";
import { readState } from "./support";

/**
 * The demo path, end to end, against a real build with mocked AI and Buffer:
 * sign in → Radar (from a URL) → research report → perspective → Studio →
 * Guardian → publish dialog. It stops at the final confirmation and never
 * clicks Approve (the mock would refuse the Buffer mutation anyway).
 */
test("demo path: sign in to the Buffer final confirmation", async ({ page }) => {
  const state = readState();
  if (!state) throw new Error("E2E state missing: global setup did not run.");

  // 1. Sign in
  await page.goto("/login");
  await page.getByLabel("Email").fill(state.email);
  await page.getByLabel("Password").fill(state.password);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));

  // 2. Radar: discover from a URL
  await page.goto("/radar");
  await page.getByRole("tab", { name: /From URLs/ }).click();
  await page.getByRole("textbox", { name: "URLs" }).fill("https://example.com/orbit-e2e/postgres-18");
  await page.getByRole("button", { name: "Analyze" }).click();
  const discoveryLink = page.getByRole("link", { name: "PostgreSQL 18 adds asynchronous I/O and native UUIDv7" }).first();
  await expect(discoveryLink).toBeVisible({ timeout: 60_000 });

  // 3. Research report with its source
  await discoveryLink.click();
  await page.waitForURL(/\/research\/[0-9a-f-]{36}/);
  await page.getByRole("button", { name: "Generate research report" }).click();
  await expect(page.getByText("PostgreSQL 18: asynchronous I/O and UUIDv7").first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Only one source was available.").first()).toBeVisible();

  // 4. Perspective
  await page.getByRole("button", { name: "Develop My Perspective" }).click();
  const question = page.getByRole("button", { name: /Do you agree that PostgreSQL is now the default choice/ });
  await expect(question).toBeVisible({ timeout: 30_000 });
  await question.click();
  await page.locator("#perspective-answer").fill("Founders should benchmark before reaching for niche databases.");
  await page.getByRole("button", { name: "Save response" }).click();
  await expect(page.getByText("Founders should benchmark before reaching for niche databases.").first()).toBeVisible();

  // 5. Studio: generate platform variants
  await page.getByRole("link", { name: "Create content from this" }).click();
  await page.waitForURL(/\/studio\/new/);
  await expect(page.getByText(/Using 1 perspective response/)).toBeVisible();
  await page.getByRole("button", { name: "Generate drafts" }).click();
  await page.waitForURL(/\/studio\/[0-9a-f-]{36}/, { timeout: 60_000 });
  await expect(page.getByText(/boring default keeps getting stronger/).first()).toBeVisible();

  // 6. Guardian
  await page.getByRole("button", { name: "Run checks" }).click();
  await expect(page.getByText(/The factual claims match the provided source/).first()).toBeVisible({ timeout: 60_000 });

  // 7. Publish dialog, up to (not including) approval
  await page.getByRole("button", { name: "Review & send to Buffer" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("E2E LinkedIn").first()).toBeVisible();
  await dialog.getByText("Save as Buffer draft", { exact: true }).click();
  const ack = dialog.getByText(/I understand Guardian/);
  if (await ack.count()) await ack.click();
  await dialog.getByRole("button", { name: "Review", exact: true }).click();
  await expect(dialog.getByText("Final confirmation")).toBeVisible();
  const approve = dialog.getByRole("button", { name: "Approve & create Buffer draft" });
  await expect(approve).toBeVisible();
  await expect(approve).toBeEnabled();
  // Stop here: never approve in tests.
});

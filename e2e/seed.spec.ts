// seed.spec.ts
import { test, expect } from "@playwright/test";

test("created deck persists after page reload", async ({ page }) => {
  const deckName = `Test Deck ${Date.now()}`;
  await page.goto("/");

  await page.getByRole("button", { name: "New deck" }).click();
  await page.getByRole("textbox", { name: "Deck name" }).fill(deckName);
  await page.getByRole("button", { name: "Create" }).click();

  await expect(page.getByRole("heading", { name: deckName })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: deckName })).toBeVisible();

  // Cleanup
  await page.getByRole("button", { name: "Delete deck" }).click();
  await page.getByRole("button", { name: "Confirm" }).click();
});

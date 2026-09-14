/**
 * seed.spec.ts — the exemplar every other spec in this directory is modelled on.
 *
 * It is not a ritual. What this file shows is what a generated test reproduces:
 * if it reaches for `getByRole`, so will the next one; if it ever grows a
 * `waitForTimeout`, every spec written afterwards inherits it. Keep it honest.
 *
 * The four patterns it demonstrates, in order of how often they get broken:
 *
 *   1. Role-based locators throughout — no CSS, no DOM structure.
 *   2. One self-contained test: its own setup, action, assertion and cleanup,
 *      safe to run alone, in parallel, or twice in a row.
 *   3. Waiting on state (`waitForResponse`, `toBeVisible`), never on a duration.
 *   4. A name that binds it to a real risk, and assertions that fail when that
 *      risk materialises.
 *
 * The flow it covers — a save survives a full server round trip — is the
 * cheapest honest end-to-end path this app has: it crosses the session cookie,
 * the island's `fetch`, the API route, RLS, and then the *SSR* read that
 * `dashboard.astro` performs on reload. No unit test reaches that chain.
 *
 * To confirm it still protects anything, break the chain: make
 * `POST /api/opportunities` return its row without inserting. The save appears
 * to work, and this spec goes red on the assertion after `reload()`.
 */
import { expect, test } from "@playwright/test";
import { waitForIslands } from "./support/hydration";
import { clearSavedOpportunities, seedChannelProfile } from "./support/supabase-admin";

/**
 * This spec's own fixture video, not shared with any other file. The e2e account
 * is a singleton, so two specs saving the same video would race on
 * `content_opportunities_user_video_unique` and on each other's cleanup.
 */
const VIDEO_TITLE = "Stub Alpha breakout upload";
const VIDEO_ID = "alpha-outlier";

// A UI cleanup can only run if the test got that far. This hook guarantees the
// row is gone even when an assertion failed first, so the next run still starts
// from a known state.
test.afterEach(async () => {
  await clearSavedOpportunities([VIDEO_ID]);
});

test("a saved opportunity survives a page reload", async ({ page }) => {
  // Teardown-before-setup: a previous run that crashed after saving would
  // otherwise leave the row behind and the "Save" button already reading
  // "Saved", so the test would assert against something it did not create.
  await seedChannelProfile();
  await clearSavedOpportunities([VIDEO_ID]);

  await page.goto("/dashboard");
  // Astro renders this panel on the server, so the button is clickable before
  // React has attached its handler. Without this gate the click lands on inert
  // markup, no request is sent, and the wait below times out. See
  // `support/hydration.ts`.
  await waitForIslands(page);

  const ranking = page.getByRole("region", { name: "Content opportunities" });
  const savedPanel = page.getByRole("region", { name: "Saved opportunities" });

  // Arm the wait before the click, or the response can land first and the
  // listener never fires.
  const analyzed = page.waitForResponse("**/api/analyze");
  await ranking.getByRole("button", { name: "Analyze" }).click();
  await analyzed;

  const row = ranking.getByRole("listitem").filter({ hasText: VIDEO_TITLE });
  await expect(row).toBeVisible();

  // `exact: true` is load-bearing: the button re-labels itself to "Saved", and a
  // substring match would resolve to both states — letting this pass against a
  // row it never saved.
  await row.getByRole("button", { name: "Save", exact: true }).click();
  await expect(savedPanel.getByRole("link", { name: VIDEO_TITLE })).toBeVisible();

  // The point of the test. Before the reload the row is React state; after it,
  // it can only be on the page because the route persisted it and
  // `dashboard.astro` read it back server-side under this user's RLS.
  await page.reload();
  // A reload serves fresh SSR HTML, so the hydration race starts again and the
  // Remove click below needs the same gate.
  await waitForIslands(page);
  await expect(savedPanel.getByRole("link", { name: VIDEO_TITLE })).toBeVisible();

  // Cleanup through the UI, which doubles as coverage of the remove path.
  await savedPanel
    .getByRole("listitem")
    .filter({ hasText: VIDEO_TITLE })
    .getByRole("button", { name: "Remove" })
    .click();
  await expect(savedPanel.getByRole("link", { name: VIDEO_TITLE })).toBeHidden();
});

/**
 * auth.setup.ts — runs once, before every browser project, and leaves a signed-in
 * `storageState` behind so no individual test ever logs in through the UI.
 *
 * Three jobs, in order:
 *   1. Sweep accounts abandoned by runs that crashed before teardown.
 *   2. Create this run's account, and record it where the worker processes can
 *      read it.
 *   3. Sign in through the real dialog once, and save the cookies.
 *
 * Step 3 deliberately uses the UI even though the rules forbid it *in tests*:
 * this is the one place the sign-in flow is exercised, and it doubles as a smoke
 * check that the auth slice still works. Every other spec inherits the cookies
 * and skips it.
 *
 * The account is fresh per run rather than fixed. `support/supabase-admin.ts`
 * carries the full reasoning; the short version is that `/api/analyze` is rate
 * limited per user, and a shared account let one run's budget bleed into the
 * next one's.
 */
import { expect, test as setup } from "@playwright/test";
import { TEST_PASSWORD, createTestAccount, sweepStaleAccounts, writeAccount } from "./support/supabase-admin";

const AUTH_FILE = "playwright/.auth/user.json";

setup("authenticate", async ({ page }) => {
  await sweepStaleAccounts();

  const account = await createTestAccount();
  await writeAccount(account);

  // `/auth/signin` is a redirect shim (`src/pages/auth/signin.ts`) onto
  // `/?auth=signin&next=…`, which is what actually opens the dialog. Going
  // through it rather than hand-building the query keeps this setup honest if
  // that contract ever changes.
  await page.goto("/auth/signin?next=/dashboard");

  // Scoped to the dialog: the Topbar trigger is also named "Sign in", and an
  // unscoped locator would be ambiguous.
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Sign in" })).toBeVisible();

  // `exact: true` on the password field is load-bearing: `PasswordToggle`
  // carries `aria-label="Show password"`, which a substring match picks up
  // alongside the input itself.
  await dialog.getByLabel("Email", { exact: true }).fill(account.email);
  await dialog.getByLabel("Password", { exact: true }).fill(TEST_PASSWORD);
  await dialog.getByRole("button", { name: "Sign in" }).click();

  // A successful sign-in does a real navigation (`window.location.assign`), so
  // the cookies are only settled once that lands. Waiting for the URL — not for
  // a duration — is what makes this deterministic.
  await page.waitForURL("**/dashboard");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  // The dashboard's own greeting, not the bare address — the Topbar renders the
  // same email, so an unscoped match is ambiguous. This asserts the session
  // belongs to this run's account rather than to whoever was signed in last.
  await expect(page.getByText(`Welcome, ${account.email}`)).toBeVisible();

  await page.context().storageState({ path: AUTH_FILE });
});

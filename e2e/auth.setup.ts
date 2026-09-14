/**
 * auth.setup.ts — runs once, before every browser project, and leaves a signed-in
 * `storageState` behind so no individual test ever logs in through the UI.
 *
 * Two jobs, in order:
 *   1. Guarantee the e2e account exists (idempotent, so a fresh `supabase db
 *      reset` needs no manual step).
 *   2. Sign in through the real dialog once, and save the cookies.
 *
 * Step 2 deliberately uses the UI even though the rules forbid it *in tests*:
 * this is the one place the sign-in flow is exercised, and it doubles as a
 * smoke check that the auth slice still works. Every other spec inherits the
 * cookies and skips it.
 */
import { expect, test as setup } from "@playwright/test";

const AUTH_FILE = "playwright/.auth/user.json";

/**
 * The e2e account. The password is four characters on purpose — the admin API
 * bypasses `minimum_password_length = 6` in `supabase/config.toml`, and
 * sign-in does not re-check length, so `test` works end to end. Signing *up*
 * with it through the app would be rejected, which is the intended asymmetry:
 * this account can only be created by this file.
 *
 * `@e2e.local` is a reserved-by-convention TLD, so a stray confirmation mail
 * can never leave the machine.
 */
const TEST_EMAIL = "test@e2e.local";
const TEST_PASSWORD = "test";

/**
 * Local-stack defaults. These are the fixed demo keys every `supabase start`
 * prints — not credentials, and worthless against anything but 127.0.0.1. They
 * are overridable so the same setup can point at a throwaway hosted project.
 *
 * The service-role key is used *here*, in `e2e/`, and must never migrate into
 * `src/` — `src/lib/no-privileged-client.test.ts` scans that tree and fails the
 * build if a privileged client appears in it. The invariant is about the app,
 * not about the harness: RLS is the only thing between two users at runtime,
 * and this file runs before any runtime exists.
 */
// Read through a widened alias: `worker-configuration.d.ts` declares the app's
// secrets as required strings on `ProcessEnv`, so a direct `process.env.X ?? …`
// trips `no-unnecessary-condition` even though the fallback is the whole point
// — the harness runs in Node, where nothing has populated them.
const env: Record<string, string | undefined> = process.env;

const SUPABASE_URL = env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY =
  env.SUPABASE_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

/**
 * Creates the account if it is absent and says nothing if it is already there.
 * GoTrue answers a duplicate with 422 `email_exists`, which is the success
 * case on every run after the first — anything else is a real failure and must
 * stop the suite rather than surface later as a confusing login error.
 */
async function ensureTestUser(): Promise<void> {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    // `email_confirm` skips the mail round-trip; local `enable_confirmations`
    // is already false, but this keeps the setup honest against a hosted
    // project where it is not.
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD, email_confirm: true }),
  });

  if (response.ok) return;

  const body: unknown = await response.json().catch(() => null);
  const code = typeof body === "object" && body !== null ? (body as { error_code?: unknown }).error_code : null;
  if (response.status === 422 && code === "email_exists") return;

  throw new Error(`Could not provision the e2e user (HTTP ${response.status}): ${JSON.stringify(body)}`);
}

setup("authenticate", async ({ page }) => {
  await ensureTestUser();

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
  await dialog.getByLabel("Email", { exact: true }).fill(TEST_EMAIL);
  await dialog.getByLabel("Password", { exact: true }).fill(TEST_PASSWORD);
  await dialog.getByRole("button", { name: "Sign in" }).click();

  // A successful sign-in does a real navigation (`window.location.assign`), so
  // the cookies are only settled once that lands. Waiting for the URL — not for
  // a duration — is what makes this deterministic.
  await page.waitForURL("**/dashboard");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  // The dashboard's own greeting, not the bare address — the Topbar renders the
  // same email, so an unscoped match is ambiguous. This asserts the session
  // belongs to the e2e account rather than to whoever was signed in last.
  await expect(page.getByText(`Welcome, ${TEST_EMAIL}`)).toBeVisible();

  await page.context().storageState({ path: AUTH_FILE });
});

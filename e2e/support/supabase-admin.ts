/**
 * Privileged data setup for the e2e harness.
 *
 * Tests authenticate through `storageState` and drive the app as a real user,
 * but the *data* a test needs before it starts — a channel profile pointing at
 * the stub channels, a clean saved list — is arranged here, out of band. Driving
 * setup through the UI would make every spec depend on the correctness of a
 * feature it is not testing.
 *
 * The service-role key lives in `e2e/` and must never migrate into `src/` —
 * `src/lib/no-privileged-client.test.ts` scans that tree and fails the build if
 * a privileged client appears in it. The invariant is about the *app*: at
 * runtime, RLS is the only thing standing between two users, and a service-role
 * client in `src/` would demote that guarantee to decoration. This file runs
 * before any runtime exists, against a local stack, so it is outside that rule
 * rather than an exception to it.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { STUB_COMPETITORS } from "../stubs/fixture.mjs";

/**
 * A fresh account per run, not one fixed account.
 *
 * `/api/analyze` is rate limited to 5 runs per 60 seconds, **keyed on the user
 * id**. With a single shared account the suite spent 2 of that budget per run,
 * so the third consecutive run inside a minute got a 429 and the ranking never
 * appeared — measured 2026-09-14 as a 2-in-8 failure rate under repetition, and
 * a re-run is the most ordinary thing a developer does.
 *
 * Isolating per run is the honest fix rather than a way around the guard. The
 * limiter is per-user by design, so a per-run account keeps it fully enforced
 * *within* a run while stopping one run's budget from leaking into the next —
 * the same "no shared state between tests" rule the E2E rules state, applied to
 * the harness itself. Raising or disabling the limit would instead hide a real
 * production behaviour from every spec that follows.
 *
 * `@e2e.local` is reserved by convention, so a stray confirmation mail can never
 * leave the machine.
 */
export const TEST_PASSWORD = "test";

/**
 * `EMAIL_PREFIX` names the accounts this harness *creates*; the sweep matches on
 * `EMAIL_DOMAIN` alone, which is broader on purpose. `@e2e.local` is reserved by
 * convention for this harness, so anything in it is ours to reclaim — including
 * accounts left by an earlier shape of this file.
 */
const EMAIL_PREFIX = "e2e-";
const EMAIL_DOMAIN = "@e2e.local";

/**
 * Where `auth.setup.ts` records the run's account.
 *
 * Specs run in separate worker processes from the setup project, so the account
 * cannot simply be a module-level constant — it has to be handed over on disk,
 * next to the `storageState` that belongs to it.
 */
export const ACCOUNT_FILE = "playwright/.auth/account.json";

export interface TestAccount {
  id: string;
  email: string;
}

// Read through a widened alias: `worker-configuration.d.ts` declares the app's
// secrets as required strings on `ProcessEnv`, so a direct `process.env.X ?? …`
// trips `no-unnecessary-condition` even though the fallback is the whole point
// — the harness runs in Node, where nothing has populated them.
const env: Record<string, string | undefined> = process.env;

/**
 * Local-stack defaults: the fixed demo keys every `supabase start` prints. Not
 * credentials, and worthless against anything but 127.0.0.1. Overridable so the
 * same harness can point at a throwaway hosted project.
 */
export const SUPABASE_URL = env.SUPABASE_URL ?? "http://127.0.0.1:54321";
export const SERVICE_ROLE_KEY =
  env.SUPABASE_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const headers = {
  apikey: SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json",
};

/**
 * `headers` is narrowed to a plain record rather than `HeadersInit` so the merge
 * below is a real object spread. `HeadersInit` also admits an array of pairs,
 * which would spread to a list of indices and silently drop every header.
 */
interface AdminInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

async function admin(path: string, init: AdminInit = {}): Promise<Response> {
  const res = await fetch(`${SUPABASE_URL}${path}`, { ...init, headers: { ...headers, ...init.headers } });
  if (!res.ok) {
    throw new Error(
      `Supabase admin call failed (${init.method ?? "GET"} ${path} → ${res.status}): ${await res.text()}`,
    );
  }
  return res;
}

/**
 * Create this run's account and return it.
 *
 * `email_confirm` skips the mail round-trip; local `enable_confirmations` is
 * already false, but this keeps the setup honest against a hosted project where
 * it is not.
 *
 * The password is four characters on purpose: the admin API bypasses
 * `minimum_password_length = 6` in `supabase/config.toml`, and sign-in does not
 * re-check length, so `test` works end to end. Signing *up* with it through the
 * app would be rejected, which is the intended asymmetry — this account can only
 * be created here.
 */
export async function createTestAccount(): Promise<TestAccount> {
  const email = `${EMAIL_PREFIX}${Date.now()}${EMAIL_DOMAIN}`;

  const res = await admin("/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({ email, password: TEST_PASSWORD, email_confirm: true }),
  });

  const body: unknown = await res.json();
  const { id } = body as { id?: string };
  if (id === undefined) throw new Error(`GoTrue created ${email} but returned no id: ${JSON.stringify(body)}`);

  return { id, email };
}

/**
 * Delete accounts left behind by runs that crashed before teardown.
 *
 * Bounded by age rather than "everything but mine" so a second suite running
 * concurrently — another terminal, a watch mode — does not have its account
 * deleted out from under it mid-run. A cascade on `auth.users` takes the profile
 * and saved rows with it, so this is the only cleanup needed.
 *
 * Five minutes is the margin: a full run takes roughly twenty seconds, so an
 * account this old cannot belong to a run still in flight, and the cutoff keeps
 * the local `auth.users` table from growing one row per invocation.
 */
export async function sweepStaleAccounts(maxAgeMs = 5 * 60 * 1000): Promise<void> {
  const res = await admin("/auth/v1/admin/users?per_page=1000");
  const body: unknown = await res.json();
  const { users = [] } = body as { users?: { id: string; email?: string; created_at?: string }[] };

  const cutoff = Date.now() - maxAgeMs;
  const stale = users.filter((user) => {
    if (user.email?.endsWith(EMAIL_DOMAIN) !== true) return false;
    const createdAt = user.created_at === undefined ? NaN : Date.parse(user.created_at);
    return !Number.isNaN(createdAt) && createdAt < cutoff;
  });

  for (const user of stale) {
    await admin(`/auth/v1/admin/users/${user.id}`, { method: "DELETE" });
  }
}

/** Hand the run's account to the worker processes, next to their cookies. */
export async function writeAccount(account: TestAccount): Promise<void> {
  await mkdir(dirname(ACCOUNT_FILE), { recursive: true });
  await writeFile(ACCOUNT_FILE, JSON.stringify(account), "utf8");
}

let cachedAccount: TestAccount | null = null;

/**
 * This run's account, as recorded by `auth.setup.ts`.
 *
 * Read from disk rather than looked up by email: the setup project and the
 * specs are different processes, and an email lookup would have to guess which
 * of several `e2e-…` accounts belongs to this run.
 */
export async function testAccount(): Promise<TestAccount> {
  if (cachedAccount !== null) return cachedAccount;

  let raw: string;
  try {
    raw = await readFile(ACCOUNT_FILE, "utf8");
  } catch {
    throw new Error(`No account at ${ACCOUNT_FILE}. The \`setup\` project should have written it before any spec ran.`);
  }

  cachedAccount = JSON.parse(raw) as TestAccount;
  return cachedAccount;
}

/**
 * Point the e2e account's profile at the stub channels.
 *
 * Idempotent, and deliberately writes the same value every time: the table has
 * a unique constraint on `user_id`, so a profile is a singleton per account and
 * two specs setting it up in parallel must not disagree about what it says.
 * `resolution=merge-duplicates` turns the insert into an upsert, which is what
 * makes a re-run after a crash as clean as a first run.
 *
 * `on_conflict=user_id` is not optional here. PostgREST resolves an upsert
 * against the *primary key* unless told otherwise, and this table's key is a
 * generated `id` that a seed never supplies — so without the parameter the
 * second run of any spec fails on `channel_profiles_user_id_key` rather than
 * updating the row it meant to.
 */
export async function seedChannelProfile(): Promise<string> {
  const { id: userId } = await testAccount();

  await admin("/rest/v1/channel_profiles?on_conflict=user_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({
      user_id: userId,
      niche: "e2e stub niche",
      sub_niche: null,
      competitors: STUB_COMPETITORS,
    }),
  });

  return userId;
}

/**
 * Remove the e2e account's saved rows for exactly these videos.
 *
 * Scoped to the ids the caller names rather than truncating the table, so a
 * spec can only ever delete what it put there — the property that lets these
 * specs run in parallel and in any order.
 */
export async function clearSavedOpportunities(videoIds: string[]): Promise<void> {
  if (videoIds.length === 0) return;
  const { id: userId } = await testAccount();
  const list = videoIds.map((id) => `"${id}"`).join(",");
  await admin(`/rest/v1/content_opportunities?user_id=eq.${userId}&video_id=in.(${list})`, { method: "DELETE" });
}

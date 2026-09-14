# E2E Testing Rules

Read this before adding a spec under `e2e/`. It is the sibling of
`supabase/tests/README.md`: the conventions that make a generated test protect a
risk instead of merely passing.

The reference spec is `seed.spec.ts`. Model new work on it — **what you show is
what you get**, so an anti-pattern that lands there is reproduced by every test
written afterwards.

## The rules

- Use `getByRole`, `getByLabel`, `getByText` as primary locators. Fall back to
  `getByTestId` only when accessibility attributes are ambiguous — and prefer
  fixing the ambiguity. Both dashboard panels carry `aria-labelledby` precisely
  so `getByRole("region", { name: … })` can tell them apart; that was a better
  answer than a test id, because it also helps a screen reader.
- Never use CSS selectors, XPath, or DOM structure for locating elements.
- Each test must be independently runnable — no shared state between tests.
- Never use `page.waitForTimeout()`. Wait for specific conditions:
  `toBeVisible()`, `waitForURL()`, `waitForResponse()`.
- Assert the business outcome, not implementation details.
- Use unique identifiers (e.g. a timestamp suffix) for test data to avoid
  collisions in parallel runs, and clean up what you created.
- Use `storageState` for authentication — never log in through the UI in an
  individual test. `auth.setup.ts` does it once; every spec inherits the cookies.

## Four rules this project learned the hard way

**Wait for the island before you click.** Every interactive control on the
dashboard is inside a `client:load` React island, so Astro server-renders a
button that is visible, enabled and clickable _before any handler is attached_.
Playwright's actionability checks all pass, the click lands, focus moves — and
nothing happens. Call `waitForIslands(page)` from `support/hydration.ts` after
every `goto` **and** every `reload`. Skipping it failed three of four full-suite
runs while passing every time in isolation, because two workers on a cold Vite
dev server lose the race that one worker on a warm one wins.

**`Save` is a prefix of `Saved`.** The button re-labels itself after a
successful save, so `getByRole("button", { name: "Save" })` matches both states
and a test can pass against a row it never saved. Use `{ exact: true }`.

**A fresh account per run, because the rate limiter is per user.**
`/api/analyze` allows 5 runs per 60 seconds keyed on the user id, and the suite
spends 2 of them. On one fixed account the third consecutive run inside a minute
got a 429 and no ranking — a 2-in-8 failure rate under repetition, and re-running
is the most ordinary thing a developer does. `auth.setup.ts` therefore creates
`e2e-<timestamp>@e2e.local` per run and sweeps accounts older than five minutes.
This is isolation, not evasion: the limiter stays fully enforced _within_ a run,
and raising or disabling it would hide a real production behaviour instead.

**Assert a score you derived by hand, and write the counterfactual.** The
fixture is built so the arithmetic is checkable without running anything: four
videos at 400 views and one outlier, so the median is exactly 400. Never compute
the expectation from the fixture with the same formula the code uses — that is
the "formula in the expectation" anti-pattern `context/foundation/test-plan.md`
§6.5 spent a phase removing from the unit suite, and it restates the
implementation instead of checking it.

## Real vs mocked — where the line sits, and why

**E2E ≠ zero mocking, but the internal boundaries stay real.** Supabase auth,
the cookie session, the middleware, the SSR route, the database and the React
island are all genuine: that is where integration risk lives, and mocking them
would leave a test that proves nothing it claims to.

Only the two external boundaries are faked, by `stubs/upstream.mjs`:

| Boundary  | Why it is stubbed                                         | Seam                                        |
| --------- | --------------------------------------------------------- | ------------------------------------------- |
| YouTube   | Costs a shared 10 000 units/day; answers differ every day | `YOUTUBE_API_BASE` (`playwright.config.ts`) |
| Anthropic | Costs money; non-deterministic by construction            | `ANTHROPIC_BASE_URL` (`.dev.vars.e2e`)      |

The stub speaks real HTTP and returns real bodies, so `getJson`'s status
classification, both zod schemas, the paging and the Anthropic SDK's own decoder
stay in the exercised path. **Fake the transport, never the parsing.**

`page.route()` is the wrong tool for either of them: both calls are made by the
_server_, so a browser-level intercept never sees them.

### The two seams are not interchangeable

They are read through different mechanisms and each has to go in its own file.
`astro:env/server` resolves from the **Node** process in dev, so
`YOUTUBE_API_BASE` belongs in `playwright.config.ts` under `webServer.env`.
`.dev.vars.e2e` populates the **Worker** env, which is what `cloudflare:workers`
and the Anthropic SDK's in-workerd `process.env` read, so `ANTHROPIC_BASE_URL`
belongs there. Putting the YouTube seam in `.dev.vars.e2e` looks right, does
nothing, and silently sends the run to the live API — a green test against live
data. The long comment in `playwright.config.ts` records the measurement.

Note also that `.dev.vars.e2e` **replaces** `.dev.vars` rather than merging with
it, so it has to stay a complete copy plus the seams.

## Data setup

`support/supabase-admin.ts` creates the run's account, seeds the channel profile
and clears saved rows, using the service-role key. That key lives in `e2e/` and
must never appear in `src/` — `src/lib/no-privileged-client.test.ts` fails the
build if it does. The invariant is about the app, where RLS is the only thing
between two users; this harness runs before any runtime exists.

`auth.setup.ts` writes the account to `playwright/.auth/account.json`, because
the setup project and the specs are different processes and the account cannot
be a module-level constant. Deleting the account cascades to its profile and
saved rows, so the sweep is the only cleanup the database needs.

Within a run the specs share that one account, so each still seeds the profile
idempotently (`on_conflict=user_id`) and deletes only the saved rows for the
videos it names. Pick a distinct fixture video per spec.

## Running

```bash
npm run test:e2e                       # everything
npx playwright test analyze            # one spec, by substring
npx playwright test --ui               # watch it drive
```

Needs Docker and a running local stack (`npx supabase start`). Playwright starts
the stub server and the dev server itself.

### First-time setup

`.dev.vars.e2e` is gitignored and is **not** created for you, so a fresh clone
needs it before the suite can run:

```bash
cp .dev.vars .dev.vars.e2e
printf '\nANTHROPIC_BASE_URL=http://127.0.0.1:9999\n' >> .dev.vars.e2e
```

It must be a full copy, not just the extra line — wrangler selects
`.dev.vars.e2e` _instead of_ `.dev.vars`, it does not merge the two. The YouTube
seam is not in this file by design; see above.

Browsers come from `npx playwright install chromium` if you have never run
Playwright on this machine.

## Before you trust a new spec, break the thing it protects

Invert the production behaviour the risk names, re-run, and confirm the spec goes
red. A spec that stays green after you break what it exists to catch is
decorative. Revert the break immediately; never commit it. The break used for
each spec is recorded in that spec's header.

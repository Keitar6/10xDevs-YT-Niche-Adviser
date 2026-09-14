/**
 * Risk #1 — `context/foundation/test-plan.md` §2, the only High × High.
 *
 * > The LLM provider returns a malformed, truncated, or refused payload for the
 * > justification step, and the whole Analyze run dies — the user gets an error
 * > or a blank screen even though the deterministic scores were already
 * > computed.
 *
 * What would prove protection, per the same document's Risk Response Guidance:
 *
 * > With credentials present and the provider returning garbage, the user still
 * > receives the ranked list with its scores plus an explicit account of the
 * > missing justification — never a server error, never a blank screen, never a
 * > fabricated sentence.
 *
 * ## Why this risk earns a browser test at all
 *
 * §3 Phase 1 already covers the provider boundary at the integration layer, and
 * `justify.ts` / `justification-merge.ts` are well tested. What no cheaper layer
 * reaches is the last link: whether a degraded *payload* still arrives on a
 * *rendered page* as a ranking the user can act on. That crosses the session
 * cookie, the middleware, the SSR route, the database read, the two upstream
 * calls and the React island — five boundaries whose integration is the failure
 * mode, and a unit test that mocked them would have nothing left to prove.
 *
 * ## The trap this spec is built to avoid
 *
 * The guidance names it explicitly:
 *
 * > "The missing-credential degradation path proves the provider path is safe."
 * > It does not: the missing-credential path short-circuits *before* the call,
 * > while a bad payload fails *after* it, during parsing.
 *
 * So the credential must be *present* and the failure must happen *inside*
 * `messages.parse()`. The stub returns HTTP 200 with a well-formed Anthropic
 * envelope whose text block stops mid-token, which throws `AnthropicError`
 * during the zod parse. The assertion on the notice's wording is what pins the
 * distinction: "returned an unreadable response" is the post-call parse branch,
 * whereas the short-circuit this spec must *not* be testing would read
 * "Anthropic API is not configured". Asserting the sentence is therefore not
 * copy-checking — it is the only available evidence of *which* path ran.
 *
 * ## The deliberate break that proves it (re-run before trusting a change)
 *
 * In `src/pages/api/analyze.ts`, make a justification failure fail the run —
 * after the `mergeJustifications` call, add:
 *
 *     if (!summary.justifications_available) return jsonError("nope", 500);
 *
 * That is Risk #1 materialising verbatim. Verified 2026-09-14: this spec goes
 * red on the ranking assertions, and the panel shows the error paragraph
 * instead. Revert it immediately; never commit it.
 *
 * A second break worth re-running, for the "explain the gap" half: delete the
 * `result.summary.justifications_error` notice from `AnalyzePanel.tsx`. The
 * ranking still renders — and this spec still goes red, because a silent gap is
 * the failure the PRD guardrail forbids.
 */
import { expect, test } from "@playwright/test";
import { TRUNCATED_JUSTIFICATIONS } from "./stubs/fixture.mjs";
import { waitForIslands } from "./support/hydration";
import { seedChannelProfile } from "./support/supabase-admin";

/**
 * Hand-derived from the fixture, not computed from it.
 *
 * Stub Beta's sample is four videos at 400 views plus one at 700. Sorted, that
 * is [400, 400, 400, 400, 700], so the median is the middle element, 400, and
 * the outlier scores 700 / 400 = 1.75 exactly.
 *
 * The counterfactual, which is what makes this assertion worth writing: had the
 * baseline been the *mean* rather than the median — the 2026-09-11 correction
 * the project protects most explicitly — the denominator would have been 460
 * and this would read 1.52. Had Shorts not been excluded, or had the sample
 * been truncated, the denominator would move again. 1.75 is reachable by one
 * rule only.
 *
 * Written as a literal with two decimals because `format.ts` fixes presentation
 * at 2 dp: this pins that *presentation* decides precision and computation does
 * not, so a rounding introduced anywhere earlier in the chain fails here.
 */
const TOP_SCORE = "1.75";
const TOP_TITLE = "Stub Beta breakout upload";

/** Second and third place, so the assertion covers the *order*, not just a row. */
const SECOND_TITLE = "Stub Gamma breakout upload";
const THIRD_TITLE = "Stub Alpha breakout upload";

/** `TOP_N` in `analyze.ts`. Three outliers plus the two highest 1.00 rows. */
const RANKED_COUNT = 5;

/**
 * The post-call parse-failure branch in `justify.ts`.
 *
 * Distinct from "Anthropic API is not configured, so justifications were
 * skipped." — see the header: telling those two apart is the whole point.
 */
const PARSE_FAILURE_NOTICE = "The justification service returned an unreadable response.";

test("a truncated justification payload still yields the ranked list, with the gap explained", async ({ page }) => {
  await seedChannelProfile();
  await page.goto("/dashboard");
  // The Analyze button is server-rendered and therefore clickable before its
  // React handler exists; clicking early sends no request at all. See
  // `support/hydration.ts`.
  await waitForIslands(page);

  const ranking = page.getByRole("region", { name: "Content opportunities" });

  // Armed before the click so the response cannot land first.
  const analyzed = page.waitForResponse("**/api/analyze");
  await ranking.getByRole("button", { name: "Analyze" }).click();
  const response = await analyzed;

  // Never a server error. The route materialises the ranking *before* calling
  // the provider precisely so a bad answer cannot take it away, and a 500 here
  // is the literal first clause of the risk.
  expect(response.status()).toBe(200);

  // Never a blank screen, and the scores survived. `AnalyzePanel` renders the
  // error state and the result state exclusively, so a visible, correctly
  // ordered ranking rules out both failure modes without needing a negative
  // locator for either.
  const rows = ranking.getByRole("listitem");
  await expect(rows).toHaveCount(RANKED_COUNT);

  const topRow = rows.first();
  await expect(topRow.getByRole("link", { name: TOP_TITLE })).toBeVisible();
  await expect(topRow).toContainText(TOP_SCORE);
  await expect(topRow).toContainText("vs 400 median");

  // The ordering is part of the contract — descending by score — and a ranking
  // that survived the failure but lost its order is still a broken answer.
  await expect(rows.nth(1).getByRole("link", { name: SECOND_TITLE })).toBeVisible();
  await expect(rows.nth(2).getByRole("link", { name: THIRD_TITLE })).toBeVisible();

  // An explicit account of what is missing. Without this the user gets a
  // ranking with an unexplained gap where the reasoning should be, which is the
  // PRD guardrail ("Analyze never ends in emptiness without explanation")
  // failing quietly rather than loudly.
  await expect(ranking.getByText(PARSE_FAILURE_NOTICE)).toBeVisible();

  // Never a fabricated sentence. The provider's answer stopped mid-word; no
  // part of it may be salvaged onto a card and presented to the user as advice.
  await expect(page.getByText(TRUNCATED_JUSTIFICATIONS, { exact: false })).toHaveCount(0);
  await expect(page.getByText("This to", { exact: true })).toHaveCount(0);
});

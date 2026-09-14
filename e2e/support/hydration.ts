/**
 * Waiting for Astro islands to hydrate.
 *
 * ## The failure this exists to stop
 *
 * Every interactive control on the dashboard is inside a `client:load` React
 * island. Astro server-renders it, so the button is in the DOM, visible,
 * enabled and clickable **before any React handler is attached to it**. Playwright's
 * actionability checks all pass — the element is visible, stable and receives
 * events — so `click()` succeeds, focus moves, and nothing happens. The `onClick`
 * that would have started the analysis was not there yet.
 *
 * Measured on 2026-09-14: three of four full-suite runs failed this way, while
 * the same spec passed every time in isolation. Two workers compiling the
 * island graph on a cold Vite dev server is enough to lose the race; one worker
 * on a warm one usually wins it. The captured page state named the cause
 * precisely — the button read `"Analyze" [active]`, so the click had landed and
 * focus had moved, but the panel still showed its idle text and the request was
 * never sent.
 *
 * ## Why this is a wait for *state*, not a disguised sleep
 *
 * `astro-island` sets `ssr` on the server and removes it as the last step of
 * hydrating (`astro/dist/runtime/server/astro-island.js`: `await hydrate(…)`,
 * then `this.removeAttribute("ssr")`, then it dispatches `astro:hydrate`).
 * So "no island on the page still carries `ssr`" is exactly "every island has
 * finished hydrating" — a real application state, asserted with an auto-retrying
 * web-first assertion. No duration is guessed anywhere.
 *
 * ## The one CSS selector in this suite
 *
 * `e2e/README.md` forbids CSS selectors, and this is the deliberate exception,
 * confined to this function so no spec repeats it. The rule exists to stop tests
 * coupling to layout and DOM structure, which churn. `astro-island` is neither:
 * it is the framework's own custom element, it carries no styling, and it has no
 * accessible role to address it by — being invisible to the accessibility tree is
 * the entire point of a wrapper element. Locate *interface* elements by role;
 * this locates the renderer.
 */
import { type Page, expect } from "@playwright/test";

/**
 * Resolves once every island on the page has hydrated.
 *
 * Call it after `goto` and after any `reload` — a reload serves fresh SSR HTML
 * and starts the race over. Safe on a page with no islands, where the count is
 * already zero.
 */
export async function waitForIslands(page: Page): Promise<void> {
  await expect(page.locator("astro-island[ssr]")).toHaveCount(0);
}

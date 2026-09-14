/**
 * The one orchestration point for a run, and the only place that decides what
 * the user sees when something fails.
 *
 * Every failure is either an error exit with a message naming what broke, or a
 * 200 carrying whatever the run *could* produce plus a reason for the rest.
 * A click never ends in unexplained emptiness — that is a PRD guardrail, not a
 * nicety, so an empty ranking always ships with `summary.empty_reason` set.
 */
import type { APIRoute } from "astro";
import { ANTHROPIC_API_KEY, YOUTUBE_API_KEY } from "astro:env/server";
// `Astro.locals.runtime` was removed in @astrojs/cloudflare v13 / Astro 6, so
// bindings are reached through the module-level `env` instead. Tutorials written
// against v12 use `context.locals.runtime.env` — that pattern no longer exists.
import { env } from "cloudflare:workers";
import { jsonError } from "@/lib/http";
import { createClient } from "@/lib/supabase";
import { parseChannelProfile } from "@/lib/services/channel-profile";
import { justifyOpportunities } from "@/lib/services/justify";
import { mergeJustifications } from "@/lib/services/justification-merge";
import { MIN_RANKABLE_AGE_DAYS, rankOpportunities, scoreChannel } from "@/lib/services/scoring";
import { fetchCompetitorVideos, YouTubeError } from "@/lib/services/youtube";
import type {
  AnalyzeOpportunity,
  AnalyzeResponse,
  AnalyzeSummary,
  SkippedChannel,
  UnresolvedCompetitor,
} from "@/types";

/** Mirrors the `simple` block of the `RATE_LIMITER` binding in wrangler.jsonc. */
const RATE_LIMIT = 5;
const RATE_LIMIT_PERIOD_SECONDS = 60;

const TOP_N = 5;

function json(body: AnalyzeResponse, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** An empty ranking is a successful response *with a reason*, never a bare list. */
function emptyResult(summary: AnalyzeSummary): Response {
  return json({ opportunities: [], summary });
}

function describeSkip(skipped: SkippedChannel[]): string {
  return skipped.map((s) => `${s.channel_title ?? s.channel_id} (${s.message})`).join(" ");
}

/**
 * The "nothing resolved" sentence, split by reason.
 *
 * A not-found id and a competitor whose fetch failed are different problems
 * with different remedies, and telling a user to check an id that is fine is
 * exactly the confidently-wrong emptiness the guardrail forbids.
 */
function describeUnresolved(unresolved: UnresolvedCompetitor[], requested: number): string {
  const notFound = unresolved.filter((u) => u.reason === "not_found").map((u) => u.channel_id);
  const failed = unresolved.filter((u) => u.reason !== "not_found").map((u) => u.channel_id);

  const sentences = [`None of your ${requested} competitor channels could be analysed.`];
  if (notFound.length > 0) {
    sentences.push(`Not found on YouTube: ${notFound.join(", ")}. Check these IDs in your profile.`);
  }
  if (failed.length > 0) {
    sentences.push(`Their data could not be loaded this run: ${failed.join(", ")}. Try again shortly.`);
  }
  return sentences.join(" ");
}

/**
 * Guarantees the `{ error }` JSON contract the client already assumes.
 *
 * Without this, an unexpected throw anywhere below — `parseChannelProfile`,
 * `scoreChannel`, `rankOpportunities`, or the re-throw of a non-`YouTubeError`
 * from the fetch step — escapes into Astro's generic SSR handling and returns a
 * 500 *HTML* page. The island's `.json()` then fails and it falls back to
 * "The analysis failed (HTTP 500)", which is the closest thing this codebase
 * has to the error page the guardrail forbids.
 *
 * The narrow `YouTubeError` catch inside `runAnalysis` stays where it is: its
 * 429/502 mapping is the specific case and must not be swallowed here.
 */
export const POST: APIRoute = async (context) => {
  try {
    return await runAnalysis(context);
  } catch (error) {
    // The raw error can name internals, so it stays server-side. `observability`
    // is enabled on the Worker, so this reaches Workers Logs — the only
    // diagnostic channel the project has. Same shape as the profile read failure
    // below, with one deliberate difference: that branch logs `error.message`
    // because it knows what it caught, and this one logs the whole error because
    // it does not — the stack is the only clue an unexpected throw leaves.
    // eslint-disable-next-line no-console -- deliberate: no logger exists yet
    console.error("analyze run failed", error);
    return jsonError("The analysis could not be completed. Try again.", 500);
  }
};

const runAnalysis = async (context: Parameters<APIRoute>[0]): Promise<Response> => {
  // No request body is read: the run is defined entirely by the caller's saved
  // profile, so there is nothing to parse and nothing to guard.
  if (!context.locals.user) {
    return jsonError("You must be signed in", 401);
  }

  // Keyed on the authenticated user, which is why this runs after the auth
  // check: the budget being protected is the shared YouTube quota, consumed per
  // user. An IP key would rate-limit co-located users against each other.
  const { success } = await env.RATE_LIMITER.limit({ key: context.locals.user.id });
  if (!success) {
    return jsonError(
      `You can run at most ${RATE_LIMIT} analyses per ${RATE_LIMIT_PERIOD_SECONDS} seconds. Wait ${RATE_LIMIT_PERIOD_SECONDS} seconds and try again.`,
      429,
    );
  }

  if (!YOUTUBE_API_KEY) {
    return jsonError("YouTube Data API is not configured, so an analysis cannot run", 500);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return jsonError("Supabase is not configured", 500);
  }

  // `PROTECTED_ROUTES` in the middleware covers pages only, so this read is the
  // route's own. RLS is row-scoped on `user_id`, which makes the cookie-scoped
  // client owner-isolated without an explicit filter — the filter is here
  // anyway, because relying on RLS alone hides the intent.
  const { data, error } = await supabase
    .from("channel_profiles")
    .select()
    .eq("user_id", context.locals.user.id)
    .maybeSingle();

  if (error) {
    // The raw PostgREST message names columns, constraints and tables, so it
    // stays server-side. `observability` is enabled on the Worker, so this
    // reaches Workers Logs — the only diagnostic channel the project has.
    // eslint-disable-next-line no-console -- deliberate: no logger exists yet
    console.error("channel_profiles read failed", error.message);
    return jsonError("Could not read your channel profile. Try again.", 500);
  }

  const profile = parseChannelProfile(data);
  if (!profile || profile.competitors.length === 0) {
    return jsonError("Set up your channel profile with competitor channels before running an analysis", 400);
  }

  const competitorIds = profile.competitors.map((competitor) => competitor.id);

  let fetched;
  try {
    fetched = await fetchCompetitorVideos(competitorIds, YOUTUBE_API_KEY);
  } catch (err) {
    if (err instanceof YouTubeError) {
      // The quota case gets its own status as well as its own message: it is
      // the one failure a user can act on by waiting.
      return jsonError(err.message, err.failure.kind === "quota" ? 429 : 502);
    }
    throw err;
  }

  const summary: AnalyzeSummary = {
    requested: competitorIds.length,
    resolved: fetched.channels.length,
    unresolved: fetched.unresolved,
    scored: 0,
    skipped: [],
    justifications_available: false,
    justifications_error: null,
    empty_reason: null,
  };

  if (fetched.channels.length === 0) {
    return emptyResult({
      ...summary,
      // The two halves get different sentences on purpose: "check the IDs" is
      // actionable advice for an id YouTube does not know, and actively
      // misleading for a channel whose data merely failed to load this run.
      empty_reason: describeUnresolved(fetched.unresolved, competitorIds.length),
    });
  }

  const now = new Date();
  const scored = fetched.channels.map((sample) => scoreChannel(sample, now));

  for (const result of scored) {
    if (result.kind === "skipped") {
      summary.skipped.push({
        channel_id: result.channel_id,
        channel_title: result.channel_title,
        sample_size: result.sample_size,
        reason: result.reason,
        message: result.message,
      });
    } else {
      summary.scored += 1;
    }
  }

  if (summary.scored === 0) {
    // Named by channel title rather than raw id — these channels resolved, so
    // `channels.list` gave us a title and showing the id would be worse.
    return emptyResult({
      ...summary,
      empty_reason: `No competitor had enough recent long-form video data to score. ${describeSkip(summary.skipped)}`,
    });
  }

  const ranked = rankOpportunities(scored, TOP_N);

  if (ranked.length === 0) {
    // Distinct from the skip cases: the baselines held, but every video in the
    // sample is still inside the recency window and so cannot be ranked yet.
    return emptyResult({
      ...summary,
      empty_reason: `Every video found is newer than ${MIN_RANKABLE_AGE_DAYS} days, so none has had time to accumulate a representative view count. Try again in a few days.`,
    });
  }

  // The scores are already final here. Whatever the justification step does
  // next, it cannot take them away — which is why the ranking is materialized
  // before the LLM is ever called.
  let opportunities: AnalyzeOpportunity[] = ranked.map((opportunity) => ({ ...opportunity, justification: null }));

  if (ANTHROPIC_API_KEY) {
    const merged = mergeJustifications(ranked, await justifyOpportunities(ranked, ANTHROPIC_API_KEY, now));
    opportunities = merged.opportunities;
    summary.justifications_available = merged.justifications_available;
    summary.justifications_error = merged.justifications_error;
  } else {
    // A configuration decision rather than a merge one, so it stays here: there
    // was no answer to merge.
    summary.justifications_error = "Anthropic API is not configured, so justifications were skipped.";
  }

  return json({ opportunities, summary });
};

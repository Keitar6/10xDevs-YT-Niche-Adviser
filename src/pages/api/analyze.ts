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
import { MIN_RANKABLE_AGE_DAYS, rankOpportunities, scoreChannel } from "@/lib/services/scoring";
import { fetchCompetitorVideos, YouTubeError } from "@/lib/services/youtube";
import type { AnalyzeOpportunity, AnalyzeResponse, AnalyzeSummary, SkippedChannel } from "@/types";

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

export const POST: APIRoute = async (context) => {
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
    return jsonError(error.message, 500);
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
      empty_reason: `None of your ${competitorIds.length} competitor channels could be found on YouTube: ${fetched.unresolved.join(", ")}. Check the IDs in your profile.`,
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

  let opportunities: AnalyzeOpportunity[] = ranked.map((opportunity) => ({ ...opportunity, justification: null }));

  if (ANTHROPIC_API_KEY) {
    const result = await justifyOpportunities(ranked, ANTHROPIC_API_KEY, now);
    if (result.ok) {
      const byVideoId = new Map(result.justifications.map((j) => [j.video_id, j.justification]));
      opportunities = opportunities.map((opportunity) => ({
        ...opportunity,
        justification: byVideoId.get(opportunity.video_id) ?? null,
      }));
      // Only a claim we can back: a partial answer leaves some rows null, and
      // the UI would otherwise promise justifications it does not have.
      summary.justifications_available = opportunities.every((o) => o.justification !== null);
      if (!summary.justifications_available) {
        summary.justifications_error = "Justifications were only available for some of the ranked videos.";
      }
    } else {
      summary.justifications_error = result.message;
    }
  } else {
    summary.justifications_error = "Anthropic API is not configured, so justifications were skipped.";
  }

  return json({ opportunities, summary });
};

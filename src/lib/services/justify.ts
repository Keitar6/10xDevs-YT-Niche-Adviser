/**
 * One-sentence justifications for the ranked opportunities.
 *
 * This is the only step in the analysis that is allowed to fail without failing
 * the run: the ranking is the Primary success criterion, justifications are the
 * Secondary one. Every exit here is a typed value the route can degrade on, so
 * nothing thrown from this module ever reaches the user as a 500.
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { ScoredOpportunity } from "./scoring";

/**
 * The response is parsed with zod like any other untrusted input — an LLM
 * response is no more trustworthy than an API response. `video_id` comes back
 * so a reordered or partial answer can still be matched to the right row rather
 * than being zipped positionally onto the wrong video.
 */
const justificationsSchema = z.object({
  justifications: z.array(
    z.object({
      video_id: z.string(),
      justification: z.string(),
    }),
  ),
});

const MODEL = "claude-opus-5";

/**
 * `effort: "low"` is deliberate. Writing five sentences from numbers already
 * supplied in the prompt is a simple task, and this call sits on the critical
 * path of a blocking POST whose p95 target is ~30s — thinking depth here buys
 * latency, not quality.
 */
const EFFORT = "low";

/**
 * The SDK default is 10 minutes, which would leave the user's spinner hanging
 * far past the point where degrading is the better answer. One attempt only
 * (`maxRetries: 0`): a retry pushes against the same p95 target.
 */
const REQUEST_TIMEOUT_MS = 20_000;

const MAX_TOKENS = 4096;

const SYSTEM_PROMPT = `You advise YouTube creators on what to record next.

You will receive a ranked list of videos from channels the creator tracks as competitors. Each carries an outlier score — the video's view count divided by the median view count of recent long-form videos on its own channel. A score of 3.0 means it earned three times what that channel typically does, which is evidence the *topic* resonated, independent of channel size.

For each video, write exactly one sentence explaining why the topic behind it is worth recording next. Ground every claim in the numbers you were given; never invent view counts, dates, audience details, or context that is not in the input. Address the creator directly, name what makes the topic promising rather than restating the score, and write in English.

Return one entry per video, each carrying the video_id it belongs to.`;

export interface Justification {
  video_id: string;
  justification: string;
}

export type JustifyResult = { ok: true; justifications: Justification[] } | { ok: false; message: string };

const MS_PER_DAY = 86_400_000;

function ageInDays(publishedAt: string, now: Date): number | null {
  const published = Date.parse(publishedAt);
  if (Number.isNaN(published)) return null;
  return Math.max(0, Math.round((now.getTime() - published) / MS_PER_DAY));
}

/**
 * The prompt carries only what the scoring pipeline actually measured, so the
 * model has numbers to reason from and nothing to embellish with.
 */
function buildPrompt(opportunities: ScoredOpportunity[], now: Date): string {
  const lines = opportunities.map((opportunity, index) => {
    const age = ageInDays(opportunity.published_at, now);
    return [
      `${index + 1}. video_id: ${opportunity.video_id}`,
      `   title: ${opportunity.title}`,
      `   channel: ${opportunity.channel_title ?? opportunity.channel_id}`,
      `   outlier_score: ${opportunity.outlier_score.toFixed(2)}`,
      `   view_count: ${opportunity.view_count}`,
      `   channel_median_views: ${opportunity.channel_median}`,
      `   channel_sample_size: ${opportunity.sample_size}`,
      `   published: ${age === null ? "unknown" : `${age} days ago`}`,
    ].join("\n");
  });

  return `Here are the ranked opportunities:\n\n${lines.join("\n\n")}`;
}

/**
 * One batched call for the whole ranking — five separate calls would multiply
 * the latency this step is already budgeted against.
 *
 * Returns a failure rather than throwing on every path, including a schema
 * mismatch. `now` is injected so the publication ages in the prompt are
 * deterministic under test.
 */
export async function justifyOpportunities(
  opportunities: ScoredOpportunity[],
  apiKey: string,
  now: Date = new Date(),
): Promise<JustifyResult> {
  if (opportunities.length === 0) return { ok: true, justifications: [] };

  const client = new Anthropic({ apiKey, maxRetries: 0, timeout: REQUEST_TIMEOUT_MS });

  try {
    const message = await client.messages.parse({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      // Adaptive thinking is on by default on this model, and `budget_tokens`
      // is rejected with a 400 — depth is controlled through `effort` instead.
      output_config: { effort: EFFORT, format: zodOutputFormat(justificationsSchema) },
      system: SYSTEM_PROMPT,
      // No assistant prefill: it returns a 400 on this model family. Structured
      // output is what pins the response shape.
      messages: [{ role: "user", content: buildPrompt(opportunities, now) }],
    });

    if (message.stop_reason === "refusal") {
      return { ok: false, message: "The justification service declined to answer." };
    }

    // `parsed_output` is null when the model's answer did not satisfy the
    // schema. Treated as a degradation, not an exception.
    const parsed = message.parsed_output;
    if (!parsed) {
      return { ok: false, message: "The justification service returned an unreadable response." };
    }

    return { ok: true, justifications: parsed.justifications };
  } catch (error) {
    // Most specific first. Note that `APIConnectionError` *extends* `APIError`
    // in this SDK, so it has to be tested before it — the reverse order would
    // collapse every transport failure into the generic branch. `AnthropicError`
    // is the base of all three and so must come last of the four.
    if (error instanceof Anthropic.RateLimitError) {
      return { ok: false, message: "The justification service is rate limited." };
    }
    if (error instanceof Anthropic.APIConnectionError) {
      return { ok: false, message: "The justification service could not be reached." };
    }
    if (error instanceof Anthropic.APIError) {
      return { ok: false, message: `The justification service returned an error (HTTP ${error.status ?? "unknown"}).` };
    }
    // A decode failure, not a transport one. `messages.parse()` is
    // `create().then(parseMessage)`, so the structured-output parse runs before
    // this function ever sees `stop_reason` — and it *throws* on malformed or
    // off-schema JSON rather than leaving `parsed_output` null. Truncated
    // output and a wrong-shape answer both arrive here, so they get the same
    // sentence as the null check above: from the user's side it is the same
    // failure.
    if (error instanceof Anthropic.AnthropicError) {
      return { ok: false, message: "The justification service returned an unreadable response." };
    }
    return { ok: false, message: "Justifications could not be generated." };
  }
}

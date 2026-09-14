/**
 * The LLM boundary, faked at the transport and nowhere else.
 *
 * `justify.ts` constructs its Anthropic client *per call*, and the SDK resolves
 * the transport in the client constructor (`client.ts` →
 * `Shims.getDefaultFetch()`, which reads the `fetch` global at that moment).
 * So stubbing the global before the call reaches the SDK without any
 * production-code seam: the SDK's real decoder, the real `zodOutputFormat`
 * parse, and this module's real branching all stay in the exercised path.
 *
 * This is the point of the file. The module's contract — "nothing thrown from
 * this module ever reaches the user as a 500" — is asserted against SDK
 * behaviour rather than assumed from reading it.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { justifyOpportunities } from "./justify";
import type { ScoredOpportunity } from "./scoring";

const NOW = new Date("2026-09-12T12:00:00Z");

function opportunity(overrides: Partial<ScoredOpportunity> & Pick<ScoredOpportunity, "video_id">): ScoredOpportunity {
  return {
    title: `Video ${overrides.video_id}`,
    channel_id: "UCaaaaaaaaaaaaaaaaaaaaaa",
    channel_title: "Test Channel",
    published_at: "2026-08-13T12:00:00Z",
    view_count: 30_000,
    outlier_score: 3,
    channel_median: 10_000,
    sample_size: 12,
    ...overrides,
  };
}

const RANKED = [opportunity({ video_id: "vid1" }), opportunity({ video_id: "vid2" })];

/** Content blocks as the API returns them — a text block carries the structured JSON. */
function textBlock(text: string) {
  return { type: "text", text };
}

/**
 * A `Message` as the wire carries it. Only the fields the SDK and this module
 * actually read are meaningful; the rest keep the shape honest.
 */
function message(overrides: { content?: unknown[]; stop_reason?: string } = {}) {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-opus-5",
    content: overrides.content ?? [],
    stop_reason: overrides.stop_reason ?? "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 10 },
  };
}

/**
 * Installs a `fetch` that answers with a real `Response`.
 *
 * A real one rather than a duck-typed stub because the SDK reads `status`,
 * `headers`, and calls `.json()` on whatever comes back — and it decides
 * between JSON and text on the `content-type` header alone
 * (`internal/parse.ts`). A body is also single-use, so the `Response` is built
 * fresh inside the handler rather than captured outside it.
 */
function stubFetch(body: unknown, status = 200): { calls: () => number } {
  let calls = 0;
  vi.stubGlobal("fetch", () => {
    calls += 1;
    return Promise.resolve(
      new Response(typeof body === "string" ? body : JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
    );
  });
  return { calls: () => calls };
}

/**
 * A transport that never answers — the connection-failure case.
 *
 * `unknown` rather than `Error` on purpose: one case rejects with a non-Error
 * to prove the module degrades on a throw it cannot classify.
 */
function stubFetchRejecting(error: unknown): void {
  // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- deliberate: a non-Error rejection is the case under test
  vi.stubGlobal("fetch", () => Promise.reject(error));
}

afterEach(() => {
  // Vitest's `unstubGlobals` defaults to false, so this is not automatic.
  vi.unstubAllGlobals();
});

describe("justifyOpportunities", () => {
  describe("when the provider answers cleanly", () => {
    it("returns the justifications, matched to their video ids", async () => {
      stubFetch(
        message({
          content: [
            textBlock(
              JSON.stringify({
                justifications: [
                  { video_id: "vid1", justification: "First reason." },
                  { video_id: "vid2", justification: "Second reason." },
                ],
              }),
            ),
          ],
        }),
      );

      const result = await justifyOpportunities(RANKED, "test-key", NOW);

      expect(result).toEqual({
        ok: true,
        justifications: [
          { video_id: "vid1", justification: "First reason." },
          { video_id: "vid2", justification: "Second reason." },
        ],
      });
    });

    it("returns a short list when the model omits a video, rather than failing the batch", async () => {
      // One bad batch degrades every row, so a *partial* answer is the only
      // partial case that exists. The caller matches on `video_id` precisely so
      // this stays usable instead of being zipped onto the wrong row.
      stubFetch(
        message({
          content: [textBlock(JSON.stringify({ justifications: [{ video_id: "vid2", justification: "Only one." }] }))],
        }),
      );

      const result = await justifyOpportunities(RANKED, "test-key", NOW);

      expect(result).toEqual({ ok: true, justifications: [{ video_id: "vid2", justification: "Only one." }] });
    });

    it("short-circuits an empty ranking without calling the provider", async () => {
      const fake = stubFetch(message());

      const result = await justifyOpportunities([], "test-key", NOW);

      expect(result).toEqual({ ok: true, justifications: [] });
      // Asserting the return value alone would pass even if the call went out.
      expect(fake.calls()).toBe(0);
    });
  });

  describe("when the response is unreadable", () => {
    it("degrades on an empty content array", async () => {
      // No text block means nothing to parse, so the SDK leaves `parsed_output`
      // null rather than throwing. This is the branch that null check exists for.
      stubFetch(message({ content: [] }));

      const result = await justifyOpportunities(RANKED, "test-key", NOW);

      expect(result).toEqual({ ok: false, message: "The justification service returned an unreadable response." });
    });

    it("degrades when the response carries no text block", async () => {
      stubFetch(message({ content: [{ type: "thinking", thinking: "…", signature: "sig" }] }));

      const result = await justifyOpportunities(RANKED, "test-key", NOW);

      expect(result).toEqual({ ok: false, message: "The justification service returned an unreadable response." });
    });

    it("degrades on truncated JSON", async () => {
      // The SDK's `zodOutputFormat` parse *throws* here rather than returning
      // null — `messages.parse()` is `create().then(parseMessage)`, and the
      // parse failure surfaces as an `AnthropicError`. Since that class is the
      // *parent* of `APIError`, it matches none of the typed branches.
      stubFetch(message({ content: [textBlock('{"justifications": [{"video_id": "vid1", "justi')] }));

      const result = await justifyOpportunities(RANKED, "test-key", NOW);

      expect(result).toEqual({ ok: false, message: "The justification service returned an unreadable response." });
    });

    it("degrades on schema-valid JSON with the wrong keys", async () => {
      stubFetch(message({ content: [textBlock(JSON.stringify({ reasons: ["nope"] }))] }));

      const result = await justifyOpportunities(RANKED, "test-key", NOW);

      expect(result).toEqual({ ok: false, message: "The justification service returned an unreadable response." });
    });
  });

  describe("when the model declines or truncates", () => {
    it("reports a refusal that carries no parseable text block", async () => {
      // The refusal check is reachable only while there is nothing for the SDK
      // to parse. A refusal carrying prose is pre-empted by the parse throw and
      // lands on the unreadable-response branch above — same degradation, a
      // different sentence.
      stubFetch(message({ content: [], stop_reason: "refusal" }));

      const result = await justifyOpportunities(RANKED, "test-key", NOW);

      expect(result).toEqual({ ok: false, message: "The justification service declined to answer." });
    });

    it("accepts a max_tokens truncation that still parsed, returning fewer rows", async () => {
      // Characterized, not defended against: for this to happen the truncation
      // has to land exactly on a valid closing brace with a schema-conforming
      // shorter array. Anything else throws and degrades. The run is not wrong
      // — the caller reports the missing rows as unjustified — but the stated
      // reason will be "only available for some" rather than a token budget.
      stubFetch(
        message({
          content: [textBlock(JSON.stringify({ justifications: [{ video_id: "vid1", justification: "Only one." }] }))],
          stop_reason: "max_tokens",
        }),
      );

      const result = await justifyOpportunities(RANKED, "test-key", NOW);

      expect(result).toEqual({ ok: true, justifications: [{ video_id: "vid1", justification: "Only one." }] });
    });
  });

  describe("when the transport or the API fails", () => {
    it("reports a rate limit", async () => {
      stubFetch({ type: "error", error: { type: "rate_limit_error", message: "slow down" } }, 429);

      const result = await justifyOpportunities(RANKED, "test-key", NOW);

      expect(result).toEqual({ ok: false, message: "The justification service is rate limited." });
    });

    it("reports an unreachable service when the connection fails", async () => {
      stubFetchRejecting(new TypeError("fetch failed"));

      const result = await justifyOpportunities(RANKED, "test-key", NOW);

      expect(result).toEqual({ ok: false, message: "The justification service could not be reached." });
    });

    it("names the status on any other API error", async () => {
      stubFetch({ type: "error", error: { type: "api_error", message: "boom" } }, 500);

      const result = await justifyOpportunities(RANKED, "test-key", NOW);

      expect(result).toEqual({ ok: false, message: "The justification service returned an error (HTTP 500)." });
    });

    it("degrades rather than throwing when the failure is not one the SDK models", async () => {
      // The contract this module exists to keep: whatever comes back, the
      // caller gets a value it can degrade on, never an exception.
      stubFetchRejecting("not even an error object");

      const result = await justifyOpportunities(RANKED, "test-key", NOW);

      expect(result.ok).toBe(false);
    });
  });
});

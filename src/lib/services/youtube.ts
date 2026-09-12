import { z } from "zod";
import { type ChannelRef, parseChannelRef } from "./youtube-ids";

const API_BASE = "https://www.googleapis.com/youtube/v3";

/**
 * `channels.list` response, modelling parts as *absent keys* rather than
 * nullable fields: a part the request did not ask for is simply missing from
 * the resource. `id` is always present regardless of `part`.
 */
const channelListSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string(),
        // `customUrl` is the `@handle` form. It is genuinely optional — a few
        // channels have never claimed one.
        snippet: z.object({ title: z.string(), customUrl: z.string().optional() }).optional(),
        contentDetails: z.object({ relatedPlaylists: z.object({ uploads: z.string() }) }).optional(),
      }),
    )
    .optional(),
});

const apiErrorSchema = z.object({
  error: z.object({
    code: z.number(),
    message: z.string(),
    errors: z.array(z.object({ reason: z.string().optional() })).optional(),
  }),
});

export type YouTubeFailure =
  | { kind: "quota"; message: string }
  | { kind: "auth"; message: string }
  | { kind: "transport"; message: string }
  | { kind: "malformed"; message: string };

export class YouTubeError extends Error {
  readonly failure: YouTubeFailure;

  constructor(failure: YouTubeFailure) {
    super(failure.message);
    this.name = "YouTubeError";
    this.failure = failure;
  }
}

/**
 * One GET against the Data API, with every failure classified rather than
 * collapsed — FR-009 requires the quota case to produce its own message.
 */
async function getJson(path: string, params: Record<string, string>, apiKey: string): Promise<unknown> {
  const url = new URL(`${API_BASE}/${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  url.searchParams.set("key", apiKey);

  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new YouTubeError({ kind: "transport", message: "Could not reach the YouTube API." });
  }

  let payload: unknown;
  try {
    payload = await res.json();
  } catch {
    throw new YouTubeError({ kind: "malformed", message: "The YouTube API returned a response we could not read." });
  }

  if (!res.ok) {
    const parsed = apiErrorSchema.safeParse(payload);
    const reasons = parsed.success ? (parsed.data.error.errors?.map((e) => e.reason) ?? []) : [];
    if (res.status === 403 && reasons.includes("quotaExceeded")) {
      throw new YouTubeError({
        kind: "quota",
        message: "The daily YouTube API quota has been used up. Try again after it resets (midnight Pacific time).",
      });
    }
    if (res.status === 400 || res.status === 401 || res.status === 403) {
      throw new YouTubeError({
        kind: "auth",
        message: "The YouTube API key was rejected. Check the key and that YouTube Data API v3 is enabled.",
      });
    }
    throw new YouTubeError({
      kind: "transport",
      message: `The YouTube API returned an unexpected error (HTTP ${res.status}).`,
    });
  }

  return payload;
}

function parseChannelList(payload: unknown): z.infer<typeof channelListSchema> {
  const parsed = channelListSchema.safeParse(payload);
  if (!parsed.success) {
    throw new YouTubeError({ kind: "malformed", message: "The YouTube API returned an unexpected channel payload." });
  }
  return parsed.data;
}

export interface ResolvedChannel {
  /** Exactly what the user typed, so an error can quote it back. */
  input: string;
  channelId: string;
  /** The `@handle` form, when the channel has claimed one. */
  handle: string | null;
  title: string | null;
}

export interface ResolveChannelsResult {
  resolved: ResolvedChannel[];
  /** Inputs that parsed as a reference but matched no live channel. */
  unresolved: string[];
  /** Inputs that could not be a channel reference at all. */
  invalid: string[];
}

type ChannelItem = NonNullable<z.infer<typeof channelListSchema>["items"]>[number];

function toResolved(input: string, item: ChannelItem): ResolvedChannel {
  return {
    input,
    channelId: item.id,
    handle: item.snippet?.customUrl ?? null,
    title: item.snippet?.title ?? null,
  };
}

/**
 * Turn user-supplied competitor references into canonical channel IDs.
 *
 * Quota shape matters here: `id=` accepts a comma-joined batch and costs one
 * unit for the whole set, while `forHandle` accepts exactly one handle per
 * call (a comma-joined list returns an empty `items` array with no error).
 * So IDs go out as a single call and handles cost one unit each. This runs at
 * profile-save time — a rare operation — which is what keeps the per-analysis
 * call chain at its contracted one unit.
 */
export async function resolveChannelRefs(inputs: string[], apiKey: string): Promise<ResolveChannelsResult> {
  const invalid: string[] = [];
  const refs: { input: string; ref: ChannelRef }[] = [];

  for (const input of inputs) {
    const ref = parseChannelRef(input);
    if (ref === null) {
      invalid.push(input.trim());
    } else {
      refs.push({ input: input.trim(), ref });
    }
  }

  const resolved: ResolvedChannel[] = [];
  const unresolved: string[] = [];

  // All bare IDs in one call.
  const idRefs = refs.filter((r) => r.ref.kind === "id");
  if (idRefs.length > 0) {
    const ids = idRefs.map((r) => (r.ref.kind === "id" ? r.ref.id : ""));
    const payload = await getJson("channels", { part: "snippet", id: ids.join(",") }, apiKey);
    const items = parseChannelList(payload).items ?? [];
    const byId = new Map(items.map((item) => [item.id, item]));
    for (const { input, ref } of idRefs) {
      const item = ref.kind === "id" ? byId.get(ref.id) : undefined;
      if (item) {
        resolved.push(toResolved(input, item));
      } else {
        unresolved.push(input);
      }
    }
  }

  // One call per handle. Capped at the competitor limit, so this stays well
  // inside Cloudflare's 6 simultaneous outgoing connections.
  const handleRefs = refs.filter((r) => r.ref.kind === "handle");
  const handleResults = await Promise.all(
    handleRefs.map(async ({ input, ref }) => {
      const handle = ref.kind === "handle" ? ref.handle : "";
      const payload = await getJson("channels", { part: "snippet", forHandle: handle }, apiKey);
      const items = parseChannelList(payload).items ?? [];
      // `.at()` rather than `[0]`: without `noUncheckedIndexedAccess` an index
      // read is typed as always-defined, which would hide the not-found case.
      return { input, item: items.at(0) };
    }),
  );
  for (const { input, item } of handleResults) {
    if (item) {
      resolved.push(toResolved(input, item));
    } else {
      unresolved.push(input);
    }
  }

  return { resolved, unresolved, invalid };
}

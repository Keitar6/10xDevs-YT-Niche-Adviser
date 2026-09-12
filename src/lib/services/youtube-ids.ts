/**
 * Pure parsing for competitor channel references.
 *
 * This module is imported by the React form as well as the API route, so it
 * must stay free of `fetch` and of `astro:env/server` — anything that needs a
 * key or a network round-trip belongs in `./youtube.ts`.
 *
 * A YouTube channel ID is the literal `UC` followed by 22 characters from the
 * URL-safe base64 alphabet. A handle is the `@name` form. Both are globally
 * unique, but only IDs can be batched into a single `channels.list` call, so
 * handles are resolved to IDs once at profile-save time and the canonical ID
 * is what gets stored.
 */
export const CHANNEL_ID_PATTERN = /^UC[A-Za-z0-9_-]{22}$/;

/** YouTube handles are 3–30 characters of letters, digits, `.`, `_` or `-`. */
export const HANDLE_PATTERN = /^[A-Za-z0-9._-]{3,30}$/;

export const COMPETITOR_INPUT_MESSAGE =
  "Each competitor must be a YouTube handle (@name), a channel ID (UC…), or a channel URL.";

export function isChannelId(value: string): boolean {
  return CHANNEL_ID_PATTERN.test(value);
}

export type ChannelRef = { kind: "id"; id: string } | { kind: "handle"; handle: string };

/**
 * Normalise whatever the user pasted into something `channels.list` can look
 * up. Accepts a bare ID, a bare handle (with or without `@`), and the common
 * URL shapes. Returns `null` when the input cannot be a channel reference at
 * all — existence is *not* checked here, only shape.
 */
export function parseChannelRef(input: string): ChannelRef | null {
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;

  // Strip a URL down to its meaningful path segment.
  let token = trimmed;
  const urlMatch = /^(?:https?:\/\/)?(?:www\.|m\.)?youtube\.com\/(.+)$/i.exec(trimmed);
  if (urlMatch) {
    const path = urlMatch[1].split(/[?#]/)[0].replace(/\/+$/, "");
    const segments = path.split("/").filter((s) => s.length > 0);
    // A channel URL is routinely pasted with a tab suffix (`/@name/videos`,
    // `/channel/UC…/shorts`), so the identifying segment is the *first*
    // meaningful one, never the last.
    const handleSegment = segments.find((s) => s.startsWith("@"));
    if (handleSegment) {
      token = handleSegment;
    } else if (/^(channel|c|user)$/i.test(segments[0] ?? "")) {
      // `/c/Name` and `/user/Name` are legacy forms whose name is not
      // guaranteed to equal the handle, but trying is strictly better than
      // rejecting — a miss surfaces as "no channel found".
      token = segments[1] ?? "";
    } else {
      token = segments[0] ?? "";
    }
  }

  if (token.startsWith("@")) {
    token = token.slice(1);
    return HANDLE_PATTERN.test(token) ? { kind: "handle", handle: token } : null;
  }

  if (CHANNEL_ID_PATTERN.test(token)) {
    return { kind: "id", id: token };
  }

  return HANDLE_PATTERN.test(token) ? { kind: "handle", handle: token } : null;
}

/** How a reference should be shown back to the user in an error message. */
export function formatRef(ref: ChannelRef): string {
  return ref.kind === "id" ? ref.id : `@${ref.handle}`;
}

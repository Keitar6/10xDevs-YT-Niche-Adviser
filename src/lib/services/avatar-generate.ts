/**
 * Avatar generation through the Workers AI binding.
 *
 * Kept out of `avatar.ts` on purpose: that module is the pure one (no I/O, no
 * platform types), and this one calls a binding. The binding is *passed in*
 * rather than imported, so nothing here reaches for `cloudflare:workers` — the
 * route owns that import, exactly as `justify.ts` takes an API key instead of
 * reading `astro:env/server` itself.
 *
 * Like `JustifyResult`, this never throws: a failed generation is a typed
 * `{ ok: false }` the route turns into a message, because the caller already has
 * a working avatar path (upload) and a generation failure must not take it down.
 *
 * ## Size
 *
 * `flux-1-schnell` takes `prompt` and `steps` and nothing else — there is no
 * `width`/`height` on its input schema (see
 * `Ai_Cf_Black_Forest_Labs_Flux_1_Schnell_Input` in `worker-configuration.d.ts`).
 * It emits 1024×1024. The plan assumed a 512 request was possible; it is not,
 * and there is nowhere to shrink the result — Supabase transforms are Pro-only
 * and the Worker's 10ms CPU budget rules out doing it in-process. So a generated
 * avatar is stored at whatever the model produced, while an *uploaded* one is
 * still normalized to {@link AVATAR_EDGE_PX} on the client canvas. Both land far
 * under the bucket's 2 MiB cap, which is the limit that actually matters.
 */
import { ALLOWED_AVATAR_TYPES, type AllowedAvatarType } from "@/lib/services/avatar";

export const AVATAR_MODEL = "@cf/black-forest-labs/flux-1-schnell";

/** schnell is distilled for 4 steps; more buys nothing but latency and neurons. */
const AVATAR_STEPS = 4;

export type AvatarGenerationResult =
  { ok: true; bytes: ArrayBuffer; contentType: AllowedAvatarType; extension: string } | { ok: false; message: string };

/**
 * Identify the image from its magic bytes rather than trusting a declared type.
 *
 * The model's output schema says "Base64" and nothing about the format, and that
 * format has changed across Cloudflare's image models before. Sniffing means a
 * silent switch from JPEG to PNG upstream stores the right `Content-Type`
 * instead of a plausible-looking lie that the bucket then rejects.
 */
function sniffImageType(bytes: Uint8Array): { contentType: AllowedAvatarType; extension: string } | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { contentType: "image/jpeg", extension: "jpg" };
  }
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return { contentType: "image/png", extension: "png" };
  }
  // RIFF....WEBP
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return { contentType: "image/webp", extension: "webp" };
  }
  return null;
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function generateAvatar(ai: Ai, prompt: string): Promise<AvatarGenerationResult> {
  let output: { image?: string };
  try {
    output = await ai.run(AVATAR_MODEL, { prompt, steps: AVATAR_STEPS });
  } catch {
    // Neuron exhaustion, a cold model, an upstream outage — all arrive here and
    // all mean the same thing to the user: try again or upload instead. The raw
    // error isn't forwarded — it's Workers AI's wording, not ours to promise as
    // stable or safe to show, and this module has no logging convention to send
    // it to instead (matching the other failure branches below).
    return { ok: false, message: "Image generation failed. Try again, or upload an image instead." };
  }

  if (!output.image) {
    return { ok: false, message: "The image service returned no image. Try again." };
  }

  let bytes: Uint8Array;
  try {
    bytes = decodeBase64(output.image);
  } catch {
    return { ok: false, message: "The generated image could not be decoded" };
  }

  const sniffed = sniffImageType(bytes);
  if (!sniffed) {
    return {
      ok: false,
      message: `The image service returned a format this app cannot store (expected one of ${ALLOWED_AVATAR_TYPES.join(", ")})`,
    };
  }

  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);

  return { ok: true, bytes: buffer, contentType: sniffed.contentType, extension: sniffed.extension };
}

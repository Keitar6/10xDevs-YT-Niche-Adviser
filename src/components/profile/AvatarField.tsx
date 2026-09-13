import { useId, useRef, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ServerError } from "@/components/auth/ServerError";
import { ALLOWED_AVATAR_TYPES, AVATAR_EDGE_PX, validateAvatarUpload } from "@/lib/services/avatar";

interface Props {
  avatarUrl: string | null;
  /** The stored avatar exists but could not be read — not the same as having none. */
  loadFailed?: boolean;
  /** `avatar_path` is a column on the profile, so there is nothing to attach to without one. */
  hasProfile: boolean;
  onChanged: (avatarUrl: string | null) => void;
}

/**
 * Center-crop to a square and scale to {@link AVATAR_EDGE_PX}.
 *
 * This is the only resize in the system: Supabase transforms are Pro-only and
 * the Worker's 10ms CPU budget rules out doing it server-side, so whatever the
 * browser produces here is what gets stored forever.
 *
 * WebP is requested because it keeps transparency (logo-style avatars) while
 * landing far under the bucket cap. Browsers that cannot encode it fall back to
 * PNG on their own, which is why the *resulting* blob's type is what gets sent
 * rather than the type that was asked for.
 */
async function normalizeToSquare(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);

  try {
    const canvas = document.createElement("canvas");
    canvas.width = AVATAR_EDGE_PX;
    canvas.height = AVATAR_EDGE_PX;

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is unavailable");

    const edge = Math.min(bitmap.width, bitmap.height);
    const sx = (bitmap.width - edge) / 2;
    const sy = (bitmap.height - edge) / 2;
    ctx.drawImage(bitmap, sx, sy, edge, edge, 0, 0, AVATAR_EDGE_PX, AVATAR_EDGE_PX);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error("Could not encode the image"));
        },
        "image/webp",
        0.92,
      );
    });
  } finally {
    bitmap.close();
  }
}

export default function AvatarField({ avatarUrl, loadFailed = false, hasProfile, onChanged }: Props) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<null | "upload" | "remove">(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);

    // The same bounds the route enforces, imported rather than re-typed, so a
    // change to one cannot silently leave the other behind (impl-review F1).
    const check = validateAvatarUpload({ contentType: file.type, byteLength: file.size });
    if (!check.ok) {
      setError(check.message);
      return;
    }

    setBusy("upload");
    try {
      const blob = await normalizeToSquare(file);
      const res = await fetch("/api/avatar", {
        method: "POST",
        headers: { "Content-Type": blob.type },
        body: blob,
      });
      const json: { avatar_url?: string | null; error?: string } = await res.json();

      if (!res.ok) {
        setError(json.error ?? "Something went wrong");
        return;
      }

      onChanged(json.avatar_url ?? null);
    } catch {
      // catch, not just finally — a network failure here would otherwise leave
      // the spinner running with nothing said (impl-review F2).
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(null);
      // Let the same file be chosen again after a failure.
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleRemove() {
    setError(null);
    setBusy("remove");
    try {
      const res = await fetch("/api/avatar", { method: "DELETE" });
      const json: { error?: string } = await res.json();

      if (!res.ok) {
        setError(json.error ?? "Something went wrong");
        return;
      }

      onChanged(null);
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  const pending = busy !== null;
  const disabledReason = !hasProfile ? "Save your channel profile first" : undefined;

  return (
    <div className="space-y-3">
      <span className="block text-sm text-blue-100/80">Avatar</span>

      <div className="flex items-center gap-4">
        <Avatar size="lg" className="size-16 border border-white/10 bg-white/5">
          {avatarUrl ? <AvatarImage src={avatarUrl} alt="Your channel avatar" /> : null}
          <AvatarFallback className="bg-white/5 text-white/40">
            <ImagePlus className="size-5" />
          </AvatarFallback>
        </Avatar>

        <div className="flex flex-col items-start gap-1">
          <label
            htmlFor={inputId}
            aria-disabled={pending || !hasProfile}
            title={disabledReason}
            className="flex cursor-pointer items-center gap-2 rounded-lg bg-purple-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-purple-500 aria-disabled:pointer-events-none aria-disabled:cursor-not-allowed aria-disabled:opacity-40"
          >
            {busy === "upload" ? (
              <>
                <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Uploading...
              </>
            ) : (
              <>
                <ImagePlus className="size-4" />
                {avatarUrl ? "Change image" : "Upload image"}
              </>
            )}
          </label>
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            accept={ALLOWED_AVATAR_TYPES.join(",")}
            disabled={pending || !hasProfile}
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
            }}
          />

          {avatarUrl ? (
            <button
              type="button"
              onClick={() => void handleRemove()}
              disabled={pending}
              className="flex items-center gap-1 text-xs text-white/50 transition-colors hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Trash2 className="size-3" />
              {busy === "remove" ? "Removing..." : "Remove"}
            </button>
          ) : null}
        </div>
      </div>

      {/*
        A failed signing is reported as its own state. Showing an empty slot
        instead would invite an upload that silently replaces an avatar the user
        cannot currently see (impl-review F4).
      */}
      {loadFailed && !avatarUrl ? (
        <p className="text-xs text-amber-300/80">Your avatar could not be loaded. Refresh to try again.</p>
      ) : null}

      {!hasProfile ? <p className="text-xs text-white/40">Save your channel profile to add an avatar.</p> : null}

      <ServerError message={error} />
    </div>
  );
}

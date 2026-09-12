import { useState, type SubmitEvent } from "react";
import { Tag, Tags, Link, Plus, X, Save } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ServerError } from "@/components/auth/ServerError";
import type { ChannelProfile } from "@/types";
import { competitorLabel } from "@/lib/services/channel-profile";
import { parseChannelRef, COMPETITOR_INPUT_MESSAGE } from "@/lib/services/youtube-ids";

interface CompetitorRow {
  id: string;
  value: string;
}

let rowSeq = 0;
function newRow(value: string): CompetitorRow {
  rowSeq += 1;
  return { id: `competitor-${rowSeq}`, value };
}

interface Props {
  profile: ChannelProfile | null;
  onSaved: (profile: ChannelProfile) => void;
}

export default function ChannelProfileForm({ profile, onSaved }: Props) {
  const [niche, setNiche] = useState(profile?.niche ?? "");
  const [subNiche, setSubNiche] = useState(profile?.sub_niche ?? "");
  const [competitorRows, setCompetitorRows] = useState<CompetitorRow[]>(() =>
    (profile && profile.competitors.length > 0 ? profile.competitors.map(competitorLabel) : ["", "", ""]).map(newRow),
  );
  const [errors, setErrors] = useState<{ niche?: string; competitorIds?: string }>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  function validate() {
    const next: typeof errors = {};

    if (!niche.trim()) {
      next.niche = "Niche is required";
    }

    const trimmed = competitorRows.map((row) => row.value.trim());
    const filled = trimmed.filter((id) => id.length > 0);
    if (filled.length < 3 || trimmed.some((id) => id.length === 0)) {
      next.competitorIds = "At least 3 competitor channel IDs are required";
    } else if (filled.length > 5) {
      next.competitorIds = "At most 5 competitor channel IDs are allowed";
    } else if (new Set(trimmed).size !== trimmed.length) {
      next.competitorIds = "Competitor channel IDs must be unique";
    } else if (!filled.every((v) => parseChannelRef(v) !== null)) {
      // Shape only — whether the channel actually exists is resolved server-side.
      next.competitorIds = COMPETITOR_INPUT_MESSAGE;
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaved(false);
    setServerError(null);
    if (!validate()) {
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ niche, subNiche, competitors: competitorRows.map((row) => row.value) }),
      });
      const json: { profile?: ChannelProfile; error?: string } = await res.json();

      if (!res.ok || !json.profile) {
        setServerError(json.error ?? "Something went wrong");
        return;
      }

      setSaved(true);
      // Re-seed from what was actually stored, showing each competitor's handle
      // rather than the raw UC… id it resolved to.
      setCompetitorRows(json.profile.competitors.map(competitorLabel).map(newRow));
      onSaved(json.profile);
    } catch {
      setServerError("Could not reach the server. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  function updateCompetitorId(id: string, value: string) {
    setCompetitorRows((prev) => prev.map((row) => (row.id === id ? { ...row, value } : row)));
    if (errors.competitorIds) setErrors((prev) => ({ ...prev, competitorIds: undefined }));
  }

  function addCompetitorRow() {
    setCompetitorRows((prev) => (prev.length >= 5 ? prev : [...prev, newRow("")]));
  }

  function removeCompetitorRow(id: string) {
    setCompetitorRows((prev) => prev.filter((row) => row.id !== id));
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <FormField
        id="niche"
        name="niche"
        label="Niche"
        value={niche}
        onChange={(v) => {
          setNiche(v);
          if (errors.niche) setErrors((prev) => ({ ...prev, niche: undefined }));
        }}
        placeholder="e.g. gaming"
        error={errors.niche}
        icon={<Tag className="size-4" />}
      />

      <FormField
        id="subNiche"
        name="subNiche"
        label="Sub-niche (optional)"
        value={subNiche}
        onChange={setSubNiche}
        placeholder="e.g. speedrunning"
        icon={<Tags className="size-4" />}
      />

      <div>
        <label className="mb-1 block text-sm text-blue-100/80">Competitor channels (3–5)</label>
        <div className="space-y-2">
          {competitorRows.map((row, index) => (
            <FormField
              key={row.id}
              id={`competitorChannelIds-${index}`}
              name="competitorChannelIds"
              label=""
              value={row.value}
              onChange={(v) => {
                updateCompetitorId(row.id, v);
              }}
              placeholder="@handle, UC… ID, or channel URL"
              icon={<Link className="size-4" />}
              endContent={
                competitorRows.length > 3 ? (
                  <button
                    type="button"
                    onClick={() => {
                      removeCompetitorRow(row.id);
                    }}
                    className="absolute top-1/2 right-3 -translate-y-1/2 text-white/40 hover:text-white/80"
                    aria-label="Remove competitor"
                  >
                    <X className="size-4" />
                  </button>
                ) : undefined
              }
            />
          ))}
        </div>
        {errors.competitorIds ? <p className="mt-1 text-xs text-red-300">{errors.competitorIds}</p> : null}
        <button
          type="button"
          onClick={addCompetitorRow}
          disabled={competitorRows.length >= 5}
          className="mt-2 flex items-center gap-1 text-xs text-purple-300 hover:underline disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:no-underline"
        >
          <Plus className="size-3" />
          Add competitor
        </button>
      </div>

      {saved && !serverError ? (
        <p className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-900/30 px-3 py-2 text-sm text-green-300">
          Profile saved
        </p>
      ) : null}

      <ServerError message={serverError} />

      <SubmitButton pendingText="Saving..." pending={saving} icon={<Save className="size-4" />}>
        Save profile
      </SubmitButton>
    </form>
  );
}

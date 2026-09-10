import { useState, type SubmitEvent } from "react";
import { Tag, Tags, Link, Plus, X, Save } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ServerError } from "@/components/auth/ServerError";
import type { ChannelProfile } from "@/types";

interface Props {
  profile: ChannelProfile | null;
  onSaved: (profile: ChannelProfile) => void;
}

export default function ChannelProfileForm({ profile, onSaved }: Props) {
  const [niche, setNiche] = useState(profile?.niche ?? "");
  const [subNiche, setSubNiche] = useState(profile?.sub_niche ?? "");
  const [competitorIds, setCompetitorIds] = useState<string[]>(
    profile?.competitor_channel_ids && profile.competitor_channel_ids.length > 0
      ? profile.competitor_channel_ids
      : ["", "", ""],
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

    const trimmed = competitorIds.map((id) => id.trim());
    if (trimmed.filter((id) => id.length > 0).length < 3 || trimmed.some((id) => id.length === 0)) {
      next.competitorIds = "At least 3 competitor channel IDs are required";
    } else if (new Set(trimmed).size !== trimmed.length) {
      next.competitorIds = "Competitor channel IDs must be unique";
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
        body: JSON.stringify({ niche, subNiche, competitorChannelIds: competitorIds }),
      });
      const json = (await res.json()) as { profile?: ChannelProfile; error?: string };

      if (!res.ok || !json.profile) {
        setServerError(json.error ?? "Something went wrong");
        return;
      }

      setSaved(true);
      onSaved(json.profile);
    } finally {
      setSaving(false);
    }
  }

  function updateCompetitorId(index: number, value: string) {
    setCompetitorIds((prev) => prev.map((id, i) => (i === index ? value : id)));
    if (errors.competitorIds) setErrors((prev) => ({ ...prev, competitorIds: undefined }));
  }

  function addCompetitorRow() {
    setCompetitorIds((prev) => [...prev, ""]);
  }

  function removeCompetitorRow(index: number) {
    setCompetitorIds((prev) => prev.filter((_, i) => i !== index));
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
        <label className="mb-1 block text-sm text-blue-100/80">Competitor channel IDs (min. 3)</label>
        <div className="space-y-2">
          {competitorIds.map((id, index) => (
            <FormField
              key={index}
              id={`competitorChannelIds-${index}`}
              name="competitorChannelIds"
              label=""
              value={id}
              onChange={(v) => {
                updateCompetitorId(index, v);
              }}
              placeholder="Channel ID"
              icon={<Link className="size-4" />}
              endContent={
                competitorIds.length > 3 ? (
                  <button
                    type="button"
                    onClick={() => {
                      removeCompetitorRow(index);
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
          className="mt-2 flex items-center gap-1 text-xs text-purple-300 hover:underline"
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

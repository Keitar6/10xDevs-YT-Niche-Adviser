import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import ChannelProfileForm from "@/components/profile/ChannelProfileForm";
import AvatarField from "@/components/profile/AvatarField";
import type { ChannelProfile } from "@/types";

interface Props {
  initialProfile: ChannelProfile | null;
  loadFailed?: boolean;
  initialAvatarUrl?: string | null;
  /** The profile names an avatar object, but signing a URL for it failed. */
  avatarLoadFailed?: boolean;
  /** The `AI` binding is present on this deployment, so generation can be offered. */
  canGenerate?: boolean;
}

export default function ProfileDialog({
  initialProfile,
  loadFailed = false,
  initialAvatarUrl = null,
  avatarLoadFailed = false,
  canGenerate = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState(initialProfile);
  // Held here rather than in AvatarField so the trigger — which is what the
  // topbar actually shows — re-renders the moment the avatar changes. Server
  // state alone would stay stale until the next full page load.
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);

  if (loadFailed && !profile) {
    return (
      <span className="text-white/40" title="Could not load your profile. Refresh to try again.">
        Profile unavailable
      </span>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 text-purple-300 transition-colors hover:text-purple-100 hover:underline"
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="size-6 shrink-0 rounded-full border border-white/10 object-cover" />
          ) : null}
          {profile ? "Profile" : "Set up profile"}
        </button>
      </DialogTrigger>
      <DialogContent className="border-white/10 bg-white/10 text-white backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle>Channel profile</DialogTitle>
        </DialogHeader>

        <AvatarField
          avatarUrl={avatarUrl}
          loadFailed={avatarLoadFailed}
          hasProfile={profile !== null}
          canGenerate={canGenerate}
          onChanged={setAvatarUrl}
        />

        <ChannelProfileForm
          profile={profile}
          onSaved={(saved) => {
            setProfile(saved);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

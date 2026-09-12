import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import ChannelProfileForm from "@/components/profile/ChannelProfileForm";
import type { ChannelProfile } from "@/types";

interface Props {
  initialProfile: ChannelProfile | null;
  loadFailed?: boolean;
}

export default function ProfileDialog({ initialProfile, loadFailed = false }: Props) {
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState(initialProfile);

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
        <button type="button" className="text-purple-300 transition-colors hover:text-purple-100 hover:underline">
          {profile ? "Profile" : "Set up profile"}
        </button>
      </DialogTrigger>
      <DialogContent className="border-white/10 bg-white/10 text-white backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle>Channel profile</DialogTitle>
        </DialogHeader>
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

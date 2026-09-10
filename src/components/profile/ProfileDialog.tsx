import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import ChannelProfileForm from "@/components/profile/ChannelProfileForm";
import type { ChannelProfile } from "@/types";

interface Props {
  initialProfile: ChannelProfile | null;
}

export default function ProfileDialog({ initialProfile }: Props) {
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState(initialProfile);

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

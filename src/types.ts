// Shared entity and DTO types go here.

import type { Database } from "@/lib/database.types";

export type ChannelProfile = Database["public"]["Tables"]["channel_profiles"]["Row"];

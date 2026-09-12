// Shared entity and DTO types go here.
//
// Convention: zod schemas are the source of truth in their owning service
// module; this file re-exports the inferred types so consumers import one path.

export type { ChannelProfile, Competitor } from "@/lib/services/channel-profile";

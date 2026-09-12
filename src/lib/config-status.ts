import { SUPABASE_URL, SUPABASE_KEY, YOUTUBE_API_KEY, ANTHROPIC_API_KEY } from "astro:env/server";

export interface ConfigStatus {
  name: string;
  configured: boolean;
  message: string;
  docsUrl?: string;
  docsLabel?: string;
}

export const configStatuses: ConfigStatus[] = [
  {
    name: "Supabase",
    configured: Boolean(SUPABASE_URL && SUPABASE_KEY),
    message: "Supabase is not configured — authentication features are disabled.",
    docsUrl: "https://github.com/przeprogramowani/10x-astro-starter#supabase-configuration",
    docsLabel: "See setup instructions",
  },
  {
    name: "YouTube",
    configured: Boolean(YOUTUBE_API_KEY),
    message: "YouTube Data API is not configured — running an analysis will fail.",
    docsUrl: "https://developers.google.com/youtube/v3/getting-started",
    docsLabel: "See setup instructions",
  },
  {
    name: "Anthropic",
    configured: Boolean(ANTHROPIC_API_KEY),
    message: "Anthropic API is not configured — analyses will run without justifications.",
    docsUrl: "https://docs.anthropic.com/en/api/getting-started",
    docsLabel: "See setup instructions",
  },
];

export const missingConfigs = configStatuses.filter((s) => !s.configured);

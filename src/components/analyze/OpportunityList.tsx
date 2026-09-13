import { ExternalLink, Quote } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { AnalyzeOpportunity } from "@/types";

/**
 * Fixed precision, so two runs of the same profile are visually comparable and a
 * score that drifts in the fourth decimal does not read as a different number.
 */
const scoreFormat = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const viewFormat = new Intl.NumberFormat("en-US", { notation: "compact" });

const dateFormat = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric" });

function publishedLabel(publishedAt: string): string | null {
  const date = new Date(publishedAt);
  return Number.isNaN(date.getTime()) ? null : dateFormat.format(date);
}

interface Props {
  opportunities: AnalyzeOpportunity[];
}

export default function OpportunityList({ opportunities }: Props) {
  return (
    <ol className="space-y-3">
      {opportunities.map((opportunity, index) => (
        <li key={opportunity.video_id}>
          <Card className="gap-3 border-white/10 bg-white/5 py-4 text-white backdrop-blur-xl">
            <CardContent className="flex gap-4 px-4">
              <span
                className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-purple-500/20 text-sm font-semibold text-purple-200"
                aria-hidden="true"
              >
                {index + 1}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <a
                      href={`https://www.youtube.com/watch?v=${opportunity.video_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex items-start gap-1.5 font-medium text-white hover:underline"
                    >
                      <span className="min-w-0">{opportunity.title}</span>
                      <ExternalLink className="mt-1 size-3.5 shrink-0 text-white/40 group-hover:text-white/80" />
                    </a>
                    <p className="mt-1 text-xs text-blue-100/60">
                      {opportunity.channel_title ?? opportunity.channel_id}
                      {" · "}
                      {viewFormat.format(opportunity.view_count)} views
                      {publishedLabel(opportunity.published_at) ? ` · ${publishedLabel(opportunity.published_at)}` : ""}
                    </p>
                  </div>

                  <div className="shrink-0 text-right">
                    <p className="text-lg font-semibold text-purple-200">
                      {scoreFormat.format(opportunity.outlier_score)}
                      <span className="text-sm font-normal text-purple-200/60">×</span>
                    </p>
                    <p className="text-[11px] text-blue-100/50">
                      vs {viewFormat.format(opportunity.channel_median)} median
                    </p>
                  </div>
                </div>

                {opportunity.justification ? (
                  <p className="mt-2 flex gap-2 text-sm text-blue-100/80">
                    <Quote className="mt-0.5 size-3.5 shrink-0 text-purple-300/60" />
                    <span>{opportunity.justification}</span>
                  </p>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </li>
      ))}
    </ol>
  );
}

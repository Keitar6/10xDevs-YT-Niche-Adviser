import { Check, ExternalLink, Quote, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate, formatScore, formatViews } from "@/lib/format";
import type { AnalyzeOpportunity } from "@/types";

interface Props {
  opportunities: AnalyzeOpportunity[];
  savedVideoIds: Set<string>;
  pendingVideoIds: Set<string>;
  onSave: (opportunity: AnalyzeOpportunity) => void;
}

export default function OpportunityList({ opportunities, savedVideoIds, pendingVideoIds, onSave }: Props) {
  return (
    <ol className="space-y-3">
      {opportunities.map((opportunity, index) => {
        const saved = savedVideoIds.has(opportunity.video_id);
        const pending = pendingVideoIds.has(opportunity.video_id);
        return (
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
                        {formatViews(opportunity.view_count)} views
                        {formatDate(opportunity.published_at) ? ` · ${formatDate(opportunity.published_at)}` : ""}
                      </p>
                    </div>

                    <div className="shrink-0 text-right">
                      <p className="text-lg font-semibold text-purple-200">
                        {formatScore(opportunity.outlier_score)}
                        <span className="text-sm font-normal text-purple-200/60">×</span>
                      </p>
                      <p className="text-[11px] text-blue-100/50">
                        vs {formatViews(opportunity.channel_median)} median
                      </p>
                    </div>
                  </div>

                  {opportunity.justification ? (
                    <p className="mt-2 flex gap-2 text-sm text-blue-100/80">
                      <Quote className="mt-0.5 size-3.5 shrink-0 text-purple-300/60" />
                      <span>{opportunity.justification}</span>
                    </p>
                  ) : null}

                  <div className="mt-3 flex justify-end">
                    <Button
                      type="button"
                      size="sm"
                      variant={saved ? "secondary" : "outline"}
                      disabled={saved || pending}
                      onClick={() => {
                        onSave(opportunity);
                      }}
                      className={
                        saved
                          ? "border-transparent bg-white/10 text-blue-100/70"
                          : "border-white/20 bg-transparent text-white hover:bg-white/10"
                      }
                    >
                      {pending ? (
                        <RefreshCw className="size-3.5 animate-spin" />
                      ) : saved ? (
                        <Check className="size-3.5" />
                      ) : null}
                      {pending ? "Saving..." : saved ? "Saved" : "Save"}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </li>
        );
      })}
    </ol>
  );
}

import { CircleAlert, ExternalLink, Quote, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate, formatScore, formatViews } from "@/lib/format";
import { SAVED_LIST_LIMIT } from "@/lib/services/content-opportunity";
import type { SavedOpportunity } from "@/types";

interface Props {
  opportunities: SavedOpportunity[];
  removingIds: Set<string>;
  onRemove: (id: string) => void;
  loadFailed: boolean;
}

export default function SavedOpportunitiesPanel({ opportunities, removingIds, onRemove, loadFailed }: Props) {
  return (
    <section className="mt-6 w-full rounded-2xl border border-white/10 bg-white/5 p-6 text-white backdrop-blur-xl">
      <h2 className="text-xl font-semibold text-white">Saved opportunities</h2>

      <div className="mt-5 space-y-3">
        {loadFailed ? (
          <p className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-900/30 px-3 py-2 text-sm text-red-300">
            <CircleAlert className="size-4 shrink-0" />
            Your saved opportunities could not be loaded. Refresh to try again.
          </p>
        ) : opportunities.length === 0 ? (
          <p className="text-sm text-blue-100/50">
            Nothing saved yet — run an analysis and save the opportunities you want to keep.
          </p>
        ) : (
          <>
            <ol className="space-y-3">
              {opportunities.map((opportunity) => {
                const removing = removingIds.has(opportunity.id);
                return (
                  <li key={opportunity.id}>
                    <Card className="gap-3 border-white/10 bg-white/5 py-4 text-white backdrop-blur-xl">
                      <CardContent className="flex gap-4 px-4">
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
                                {formatDate(opportunity.saved_at) ? ` · Saved ${formatDate(opportunity.saved_at)}` : ""}
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
                              variant="outline"
                              disabled={removing}
                              onClick={() => {
                                onRemove(opportunity.id);
                              }}
                              className="border-white/20 bg-transparent text-white hover:bg-white/10"
                            >
                              {removing ? (
                                <RefreshCw className="size-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="size-3.5" />
                              )}
                              {removing ? "Removing..." : "Remove"}
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </li>
                );
              })}
            </ol>

            {opportunities.length === SAVED_LIST_LIMIT ? (
              <p className="text-xs text-blue-100/50">Showing your {SAVED_LIST_LIMIT} most recent saves.</p>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}

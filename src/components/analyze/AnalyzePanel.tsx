import { useState } from "react";
import { toast } from "sonner";
import { CircleAlert, Info, Play, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import OpportunityList from "@/components/analyze/OpportunityList";
import type { AnalyzeOpportunity, AnalyzeResponse } from "@/types";

const CONNECTION_ERROR = "Could not reach the server. Check your connection and try again.";

/**
 * A structural guard rather than a zod parse: the response is large and zod would
 * follow this island into the browser bundle for a check that only has to catch
 * "this is not our payload at all" — a proxy error page, or a crash before the
 * route ran. Field-level trust comes from the route constructing the body.
 */
function isAnalyzeResponse(value: unknown): value is AnalyzeResponse {
  if (typeof value !== "object" || value === null) return false;
  const { opportunities, summary } = value as Record<string, unknown>;
  return Array.isArray(opportunities) && typeof summary === "object" && summary !== null;
}

/** `/api/*` failures are `{ error }` (see `jsonError`); anything else gets a fallback. */
function errorMessage(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const { error } = payload as { error?: unknown };
  return typeof error === "string" && error.length > 0 ? error : null;
}

type NoticeTone = "info" | "warning";

function Notice({ tone, children }: { tone: NoticeTone; children: React.ReactNode }) {
  const palette =
    tone === "warning"
      ? "border-amber-400/30 bg-amber-900/20 text-amber-100"
      : "border-blue-400/30 bg-blue-900/20 text-blue-100";
  return (
    <p className={`flex gap-2 rounded-lg border px-3 py-2 text-sm ${palette}`}>
      <Info className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

function RunningSkeleton() {
  return (
    <div className="space-y-3" aria-hidden="true">
      {[0, 1, 2].map((row) => (
        <Skeleton key={row} className="h-24 w-full rounded-xl bg-white/10" />
      ))}
    </div>
  );
}

interface Props {
  savedVideoIds: Set<string>;
  pendingVideoIds: Set<string>;
  onSave: (opportunity: AnalyzeOpportunity) => void;
}

export default function AnalyzePanel({ savedVideoIds, pendingVideoIds, onSave }: Props) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  function fail(message: string) {
    setError(message);
    setResult(null);
    toast.error(message);
  }

  async function runAnalysis() {
    setRunning(true);
    setError(null);
    try {
      // No body: the run is defined entirely by the saved profile. A browser
      // `fetch` sends the `Origin` header Astro's CSRF check requires.
      const res = await fetch("/api/analyze", { method: "POST" });

      // A failure can arrive as a non-JSON body (an upstream error page). Letting
      // `.json()` throw here would misreport it as a lost connection.
      let payload: unknown = null;
      try {
        payload = await res.json();
      } catch {
        payload = null;
      }

      if (!res.ok) {
        fail(errorMessage(payload) ?? `The analysis failed (HTTP ${res.status}).`);
        return;
      }

      if (!isAnalyzeResponse(payload)) {
        fail("The server returned an unexpected response. Try again.");
        return;
      }

      setResult(payload);
    } catch {
      // Network-level failure only — the dev server going away mid-request lands
      // here, and must read as an error rather than resetting to the idle state.
      fail(CONNECTION_ERROR);
    } finally {
      setRunning(false);
    }
  }

  // Two different problems with two different remedies: a bad id is the user's
  // to fix, a failed fetch is the run's to retry. They get their own notices.
  const unresolved = result?.summary.unresolved ?? [];
  const notFound = unresolved.filter((u) => u.reason === "not_found").map((u) => u.channel_id);
  const failedToLoad = unresolved.filter((u) => u.reason !== "not_found").map((u) => u.channel_id);

  return (
    <section className="mt-6 w-full rounded-2xl border border-white/10 bg-white/5 p-6 text-white backdrop-blur-xl">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white">Content opportunities</h2>
          <p className="mt-1 text-sm text-blue-100/60">
            Ranks recent videos from your competitor channels against each channel&apos;s own median views.
          </p>
        </div>
        <Button
          type="button"
          onClick={() => void runAnalysis()}
          disabled={running}
          className="bg-purple-500 text-white hover:bg-purple-400"
        >
          {running ? <RefreshCw className="size-4 animate-spin" /> : <Play className="size-4" />}
          {running ? "Analyzing..." : "Analyze"}
        </Button>
      </div>

      <div className="mt-5 space-y-3">
        {running ? <RunningSkeleton /> : null}

        {!running && error ? (
          <p className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-900/30 px-3 py-2 text-sm text-red-300">
            <CircleAlert className="size-4 shrink-0" />
            {error}
          </p>
        ) : null}

        {!running && !error && result ? (
          <>
            {result.summary.resolved < result.summary.requested ? (
              <Notice tone="warning">
                Resolved {result.summary.resolved} of {result.summary.requested} competitor channels.
                {notFound.length > 0 ? ` Not found on YouTube: ${notFound.join(", ")}.` : ""}
              </Notice>
            ) : null}

            {/*
              Kept separate from the notice above on purpose. These channels
              exist — their data just failed to load this run — and folding them
              into "not found" would tell the user to fix an id that is fine.
            */}
            {failedToLoad.length > 0 ? (
              <Notice tone="warning">
                Could not load data for {failedToLoad.join(", ")} this run, so the ranking below covers the remaining
                competitors. Try again shortly.
              </Notice>
            ) : null}

            {result.summary.skipped.length > 0 ? (
              <Notice tone="warning">
                Skipped{" "}
                {result.summary.skipped
                  .map((s) => `${s.channel_title ?? s.channel_id} (${s.sample_size} long-form videos — ${s.message})`)
                  .join("; ")}
              </Notice>
            ) : null}

            {result.summary.justifications_error ? (
              <Notice tone="info">{result.summary.justifications_error}</Notice>
            ) : null}

            {result.opportunities.length > 0 ? (
              <OpportunityList
                opportunities={result.opportunities}
                savedVideoIds={savedVideoIds}
                pendingVideoIds={pendingVideoIds}
                onSave={onSave}
              />
            ) : (
              // Never a bare "no results": an empty ranking always carries its reason.
              <Notice tone="info">{result.summary.empty_reason ?? "No opportunities were found for this run."}</Notice>
            )}
          </>
        ) : null}

        {!running && !error && !result ? (
          <p className="text-sm text-blue-100/50">
            Click Analyze to score your competitors&apos; recent uploads and surface the top opportunities.
          </p>
        ) : null}
      </div>
    </section>
  );
}

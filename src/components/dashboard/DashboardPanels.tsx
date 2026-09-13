import { useMemo, useState } from "react";
import { toast } from "sonner";
import AnalyzePanel from "@/components/analyze/AnalyzePanel";
import SavedOpportunitiesPanel from "@/components/opportunities/SavedOpportunitiesPanel";
import type { AnalyzeOpportunity, SavedOpportunity } from "@/types";

const CONNECTION_ERROR = "Could not reach the server. Check your connection and try again.";

/** `/api/*` failures are `{ error }` (see `jsonError`); anything else gets a fallback. */
function errorMessage(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const { error } = payload as { error?: unknown };
  return typeof error === "string" && error.length > 0 ? error : null;
}

interface Props {
  initialSaved: SavedOpportunity[];
  loadFailed: boolean;
}

/**
 * Owns the saved set so the ranking and the saved panel share one consistent
 * view without a page reload — a save is visible in both places in the same
 * render.
 */
export default function DashboardPanels({ initialSaved, loadFailed }: Props) {
  const [saved, setSaved] = useState<SavedOpportunity[]>(initialSaved);
  const [pendingVideoIds, setPendingVideoIds] = useState<Set<string>>(new Set());
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());

  const savedVideoIds = useMemo(() => new Set(saved.map((row) => row.video_id)), [saved]);

  async function onSave(opportunity: AnalyzeOpportunity) {
    setPendingVideoIds((prev) => new Set(prev).add(opportunity.video_id));
    try {
      const res = await fetch("/api/opportunities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(opportunity),
      });

      // A failure can arrive as a non-JSON body (an upstream error page). Letting
      // `.json()` throw here would misreport it as a lost connection.
      let payload: unknown = null;
      try {
        payload = await res.json();
      } catch {
        payload = null;
      }

      if (!res.ok) {
        toast.error(errorMessage(payload) ?? `Could not save this opportunity (HTTP ${res.status}).`);
        return;
      }

      const row = payload as SavedOpportunity;
      // Merge rather than prepend: the route is idempotent and hands back the
      // *existing* row for a repeat save, so a second tab or a stale SSR list
      // would otherwise prepend a row already in the array — a duplicate id.
      setSaved((prev) => {
        const existingIndex = prev.findIndex((r) => r.id === row.id);
        if (existingIndex === -1) return [row, ...prev];
        const next = [...prev];
        next[existingIndex] = row;
        return next;
      });
      toast.success("Saved.");
    } catch {
      toast.error(CONNECTION_ERROR);
    } finally {
      setPendingVideoIds((prev) => {
        const next = new Set(prev);
        next.delete(opportunity.video_id);
        return next;
      });
    }
  }

  async function onRemove(id: string) {
    setRemovingIds((prev) => new Set(prev).add(id));
    try {
      const res = await fetch(`/api/opportunities?id=${id}`, { method: "DELETE" });

      let payload: unknown = null;
      try {
        payload = await res.json();
      } catch {
        payload = null;
      }

      // 200 and 404 both mean the row is no longer there.
      if (res.ok || res.status === 404) {
        setSaved((prev) => prev.filter((row) => row.id !== id));
        return;
      }

      toast.error(errorMessage(payload) ?? `Could not remove this opportunity (HTTP ${res.status}).`);
    } catch {
      toast.error(CONNECTION_ERROR);
    } finally {
      setRemovingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  return (
    <>
      <AnalyzePanel savedVideoIds={savedVideoIds} pendingVideoIds={pendingVideoIds} onSave={(o) => void onSave(o)} />
      <SavedOpportunitiesPanel
        opportunities={saved}
        removingIds={removingIds}
        onRemove={(id) => void onRemove(id)}
        loadFailed={loadFailed}
      />
    </>
  );
}

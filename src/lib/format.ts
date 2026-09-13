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

export function formatScore(score: number): string {
  return scoreFormat.format(score);
}

export function formatViews(views: number): string {
  return viewFormat.format(views);
}

export function formatDate(dateString: string): string | null {
  const date = new Date(dateString);
  return Number.isNaN(date.getTime()) ? null : dateFormat.format(date);
}

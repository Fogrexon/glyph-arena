/**
 * The one line the result screen puts under the verdict: how this run compares
 * with the run before it. It is the question a player actually asks at that
 * moment - "was that better?" - answered without making them read the list.
 *
 * Session-only: the history it reads lives in memory and dies with the tab.
 */
export type RunSummary = { parried: number; absoluteMs: number; wave: number };

function parryCount(delta: number): string {
  const count = Math.abs(delta);
  return `${count} ${count === 1 ? "parry" : "parries"}`;
}

/** `vs last run: +1 parry, median error -80ms`, or the baseline line on run one. */
export function comparisonLine(latest: RunSummary, previous: RunSummary | undefined): string {
  if (previous === undefined) {
    return "First run \u2014 this is the baseline";
  }
  const parryDelta = latest.parried - previous.parried;
  const parries = parryDelta === 0 ? "same parries" : `${parryDelta > 0 ? "+" : "-"}${parryCount(parryDelta)}`;
  // Median error only means something once both runs parried at least once.
  if (latest.parried === 0 || previous.parried === 0) {
    return `vs last run: ${parries}`;
  }
  const errorDelta = latest.absoluteMs - previous.absoluteMs;
  const error =
    errorDelta === 0
      ? "median error same"
      : `median error ${errorDelta > 0 ? "+" : "-"}${Math.abs(errorDelta)}ms`;
  return `vs last run: ${parries}, ${error}`;
}

/** Whether the line describes progress, so the caller can colour it as such. */
export function isImprovement(latest: RunSummary, previous: RunSummary | undefined): boolean {
  if (previous === undefined) {
    return false;
  }
  if (latest.parried !== previous.parried) {
    return latest.parried > previous.parried;
  }
  if (latest.parried === 0 || previous.parried === 0) {
    return false;
  }
  return latest.absoluteMs < previous.absoluteMs;
}

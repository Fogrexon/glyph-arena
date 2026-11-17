/**
 * The one line the result screen puts under the verdict: how this run compares
 * with the run before it. It is the question a player actually asks at that
 * moment - "was that better?" - answered without making them read the list.
 *
 * Session-only: the history it reads lives in memory and dies with the tab.
 */
export type RunSummary = {
  parried: number;
  absoluteMs: number;
  wave: number;
  /** Lives left when the run ended. */
  lives: number;
  /** Seconds from the start of the run to its end. */
  seconds: number;
  /** Whether the run reached wave 20 and cleared. */
  cleared: boolean;
};

/** The best a session has managed, so the result screen can say what to beat. */
export type Best = { parried: number; lives: number; clearSeconds: number | null };

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

/**
 * The session's best run: most parries, most lives left, and the fastest clear.
 *
 * Each number stands on its own on purpose. A run that cleared slowly can still
 * hold the parry record, and the fastest clear is only comparable with other
 * clears, so the best of one is not the best of another.
 */
export function bestOf(runs: ReadonlyArray<RunSummary>): Best | null {
  if (runs.length === 0) {
    return null;
  }
  let parried = 0;
  let lives = 0;
  let clearSeconds: number | null = null;
  for (const run of runs) {
    if (run.parried > parried) {
      parried = run.parried;
    }
    if (run.lives > lives) {
      lives = run.lives;
    }
    if (run.cleared && (clearSeconds === null || run.seconds < clearSeconds)) {
      clearSeconds = run.seconds;
    }
  }
  return { parried, lives, clearSeconds };
}

/** `Best: 12 parries, 2 lives, 27.1s clear` - or `no clear yet` while every run failed. */
export function bestLine(best: Best | null): string {
  if (best === null) {
    return "Best: \u2014";
  }
  const parries = `${best.parried} ${best.parried === 1 ? "parry" : "parries"}`;
  const lives = `${best.lives} ${best.lives === 1 ? "life" : "lives"}`;
  if (best.clearSeconds === null) {
    // An endless run never clears, so there is nothing to compare a clear time with.
    return `Best: ${parries}, ${lives}`;
  }
  return `Best: ${parries}, ${lives}, ${best.clearSeconds.toFixed(1)}s clear`;
}

/**
 * Whether the latest run moved any of the three records. The first run is the
 * baseline -- it sets the best, but calling it a new best says nothing.
 */
export function isNewBest(best: Best | null, previousBest: Best | null): boolean {
  if (best === null || previousBest === null) {
    return false;
  }
  if (best.parried > previousBest.parried || best.lives > previousBest.lives) {
    return true;
  }
  if (best.clearSeconds === null) {
    return false;
  }
  return previousBest.clearSeconds === null || best.clearSeconds < previousBest.clearSeconds;
}

/**
 * One list of "put this back", run in the order it was written.
 *
 * Every slice in this repository hand-wrote the same thing and the same failure came with it: a
 * state field is added, and the line that resets it is added somewhere else — or not at all. The
 * miss does not throw. It leaves the previous round's value in place, so the second run starts with
 * a stale clock and looks like a game bug ("the first commit of a retry never happens").
 *
 * The shape that removes it is registration: the reset is written **next to the state it resets**,
 * and boot and retry call the same `run()`. A game that keeps two paths (`boot()` and `restart()`)
 * ends up with one of them stale, which is the second half of the same bug.
 *
 * What this package deliberately does not do:
 *
 * - **It does not know what a "round" is.** The functions are the game's; this is a list.
 * - **It does not read state between entries.** If one reset reads what another wrote, the order
 *   becomes meaning, and the next person cannot reorder anything safely.
 * - **Its `run()` return value is not a gate.** The number changes whenever a subsystem is added, so
 *   a test that pins it turns "we added a thing" into a red build — the wrong kind of gate. Check a
 *   reset with the game's own state (that is what R8 does).
 */
export type ResetFunction = () => void;

export interface Reset {
  /**
   * Register `fn` under `name`. Call it next to the state it resets, not in a list somewhere else.
   *
   * Throws on a duplicate `name` (two registrations of one name is a copy-paste, and the second
   * would silently win or be silently ignored) and inside `run()` (a registration made during a run
   * has no defined place in the order).
   */
  add(name: string, fn: ResetFunction): void;
  /**
   * Run every registered function, in the order they were added. Synchronous: no load, no `await`,
   * no rebuild — a one-minute game cannot spend its retry on a scene change.
   *
   * Returns how many ran. Do not pin that number in a test.
   *
   * Throws if called from inside a reset (a re-entrant run has no defined order) and rethrows the
   * first failure, **without running the rest**: a half-reset state that looks normal is worse than
   * a crash, because the next frame reads it as a real round.
   */
  run(): number;
}

export function createReset(): Reset {
  const entries: Array<{ name: string; fn: ResetFunction }> = [];
  const names = new Set<string>();
  let running = false;

  return {
    add(name: string, fn: ResetFunction): void {
      if (running) {
        throw new Error(`reset.add("${name}"): a reset was registered while run() was running`);
      }
      if (names.has(name)) {
        throw new Error(`reset.add("${name}"): that name is already registered`);
      }

      names.add(name);
      entries.push({ name, fn });
    },

    run(): number {
      if (running) {
        throw new Error("reset.run(): run() is already running");
      }

      running = true;
      try {
        for (const entry of entries) {
          entry.fn();
        }
      } finally {
        running = false;
      }

      return entries.length;
    },
  };
}

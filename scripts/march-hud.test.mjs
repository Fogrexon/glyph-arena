/**
 * The HUD prints one number that is not a measurement of the game but of the player: **which run
 * this is**. Three people are about to play `/march/` and report where they died and how many times
 * they went again, and "how many times" is only usable if the screen says it.
 *
 * This is a source check, and it is one on purpose: the number is drawn on a canvas, so node cannot
 * read it back, and a screenshot-and-OCR gate would be a worse test than the thing it guards. What
 * can rot is the *source of the number* — a second counter next to the first, or a HUD that prints a
 * copy that stops moving. Both are text, and both are what this looks at.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const ROOT = new URL("..", import.meta.url).pathname;
const source = readFileSync(`${ROOT}examples/march/src/main.ts`, "utf8");

/** The body of a top-level function, by name — enough to say "this is the HUD, not the state". */
function bodyOf(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `no \`function ${name}\` in main.ts`);
  let depth = 0;
  let opened = false;
  for (let i = start; i < source.length; i += 1) {
    if (source[i] === "{") {
      depth += 1;
      opened = true;
    } else if (source[i] === "}") {
      depth -= 1;
      if (opened && depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`unbalanced braces after function ${name}`);
}

test("the play HUD prints the run number", () => {
  const hud = bodyOf("drawHud");
  // The line that is drawn while you play, not the result line: both are in `drawHud`, so a bare
  // `/run \$\{runs\}/` would keep passing with the in-play counter gone (measured — the first
  // version of this test did exactly that). The play line starts with the clock.
  assert.match(hud, /clockOf\(simMs\)[^`]*run \$\{runs\}/, "the play HUD no longer prints `run ${runs}`");
});

test("the run number on screen is the one the state publishes", () => {
  // One counter, one name. `publish()` is what the bot reads and what the human reads, so the two
  // must be the same value: a second counter would drift the moment one path increments and the
  // other does not (this game already had that bug shape — the state's `runs` and the bot's count).
  const declarations = [...source.matchAll(/^\s*(?:let|const)\s+(runs?|runCount|runNumber|attempts)\s*=/gm)].map((m) => m[1]);
  assert.deepEqual(declarations, ["runs"], `expected exactly one run counter named \`runs\`, found ${declarations.join(", ")}`);

  const publish = bodyOf("publish");
  assert.match(publish, /^\s*runs,$/m, "publish() no longer exposes `runs`");

  // And the result screen names it too, so a player who just died can say which run it was.
  const hud = bodyOf("drawHud");
  assert.match(hud, /`run \$\{runs\} · passed/, "the result screen no longer names the run");
});

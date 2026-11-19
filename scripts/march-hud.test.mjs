/**
 * The HUD prints two numbers that are not measurements of the game but of the player: **which run
 * this is**, and **where the last heart went**. Three people are about to play `/march/` and report
 * where they died and how many times they went again, and neither number is usable from memory.
 *
 * This is a source check, and it is one on purpose: the numbers are drawn on a canvas, so node cannot
 * read them back, and a screenshot-and-OCR gate would be a worse test than the thing it guards. What
 * can rot is the *source* of each number — a second counter next to the first, a HUD that prints a
 * copy that stops moving, or a death position read from a body the knockback has already moved.
 * All three are text, and all three are what this looks at.
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

test("the result screen says where the fatal hit landed, from the hit record", () => {
  // The number three people are about to read off the screen and report. It has to be the position
  // of the *hit*, not of the body afterwards: the knockback moves the player before the result is
  // drawn, so `player.x` at that moment is where the slide ended — a different x, and one that
  // would quietly disagree with the `hits[].x` the bot logs.
  const hud = bodyOf("drawHud");
  const shown = /died at x \$\{Math\.round\(([^)]+)\)\}/.exec(hud);

  assert.ok(shown, "the result screen no longer prints the death position");
  assert.notEqual(shown[1], "player.x", `the death position is \`${shown[1]}\`, which the knockback has already moved`);
  assert.match(hud, /hits\.(?:at\(-1\)|\[hits\.length - 1\])/, "the death position is not read from the last hit");
});

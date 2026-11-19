/**
 * The march page is a description of numbers, so the numbers are the thing that can rot.
 *
 * Every row of the constant table in `examples/march/README.md` names a constant (`ENEMY_STATS.hp`)
 * and its value, and every one of those is a value this game's code decides. A tuning pass that
 * changes `hp` and forgets the page is exactly the failure this checks: the page would keep telling
 * the next reader "three, because eleven guards of four is 84.5 s" while the road runs four.
 *
 * Both sides come from the repository: the page is parsed, the constants are parsed out of the
 * source. Nothing is compared against a number written down here — a list kept in the test would be
 * the next "adding a value makes it red" waiting to happen. The same rule is why the road's size,
 * its guard count, its beats and its goal column are derived from the level text rather than typed.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const ROOT = new URL("..", import.meta.url).pathname;
const read = (path) => readFileSync(`${ROOT}${path}`, "utf8");

/** Where a constant may live. A key must be found in exactly one of these, or this test is lying. */
const SOURCES = [
  "examples/march/src/combat.ts",
  "examples/march/src/enemy.ts",
  "examples/march/src/sizes.ts",
  "examples/march/src/main.ts",
];

/** `| \`ENEMY_STATS.hp\` | 3 | …` → `[{group, key, value}]` */
function tableRows(page) {
  const rows = [...page.matchAll(/^\|\s*`([A-Za-z_][\w]*)\.(\w+)`\s*\|\s*(\d+)\s*\|/gm)];
  return rows.map((match) => ({ group: match[1], key: match[2], value: match[3] }));
}

test("every constant the march page names still has that value in the code", () => {
  const page = read("examples/march/README.md");
  const rows = tableRows(page);
  assert.ok(rows.length >= 20, `the page's table should name the numbers the road is made of, found ${rows.length}`);

  // Look the value up **inside the object it names**: `windupMs` is 260 in `ENEMY_AI` and 60 in
  // `ATTACK`, and a page that named one of them would pass either way if the name were ignored.
  const sources = SOURCES.map((path) => ({ path, text: read(path) }));
  const missing = [];
  for (const { group, key, value } of rows) {
    const blocks = sources
      .map((source) => {
        const match = new RegExp(`(?:export )?const ${group}\\s*(?::\\s*\\w+)?\\s*=\\s*\\{([\\s\\S]*?)\\}(?:\\s+as const)?;`).exec(source.text);
        return match === null ? null : { path: source.path, body: match[1] };
      })
      .filter((block) => block !== null);
    if (blocks.length === 0) {
      missing.push(`${group}.${key}: no source declares \`${group}\``);
      continue;
    }
    const pattern = new RegExp(`\\b${key}\\s*:\\s*${value}\\b`);
    const hits = blocks.filter((block) => pattern.test(block.body));
    if (hits.length !== 1) {
      missing.push(
        hits.length === 0
          ? `${group}.${key} = ${value} (the code says something else)`
          : `${group}.${key} = ${value} is declared twice: ${hits.map((hit) => hit.path).join(", ")}`,
      );
    }
  }
  assert.deepEqual(missing, [], "the page and the road disagree; fix the page (or the number) and re-run");
});

const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];

test("the page's road is the level's — size, guards, beats and goal", () => {
  const page = read("examples/march/README.md");
  const level = read("examples/march/src/level.ts");

  const tile = Number(/export const TILE = (\d+);/.exec(level)?.[1]);
  const block = /const TEXT: readonly string\[\] = \[([\s\S]*?)\n\];/.exec(level)?.[1] ?? "";
  const rows = [...block.matchAll(/"([^"]*)"/g)].map((match) => match[1]);
  assert.ok(rows.length > 0, "the level's rows are still written as strings");

  const columns = Math.max(...rows.map((row) => row.length));
  assert.match(
    page,
    new RegExp(`${columns} × ${rows.length} tiles of ${tile} px`),
    `the road is ${columns} × ${rows.length} tiles of ${tile} px; the page says something else`,
  );

  const standing = rows.findIndex((row) => row.includes("@"));
  assert.ok(standing >= 0, "no spawn row in the level");
  const guards = [...rows[standing]].map((cell, column) => (cell === "e" ? column : -1)).filter((column) => column >= 0);
  const goal = rows[standing].indexOf("g");

  // Beats are the groups the walk separates, exactly as the level's own test reads them.
  const walkPx = 6 * tile;
  let beats = 1;
  for (let i = 1; i < guards.length; i += 1) if ((guards[i] - guards[i - 1]) * tile > walkPx) beats += 1;

  assert.match(
    page,
    new RegExp(`${WORDS[guards.length]} guards in ${WORDS[beats]} beats`, "i"),
    `the road has ${guards.length} guards in ${beats} beats; the page says something else`,
  );
  assert.match(page, new RegExp(`goal at column ${goal}`), `the goal is at column ${goal}; the page says something else`);
});

test("the page keeps the rules that are not numbers", () => {
  // These are the design; a rewrite that drops them leaves a page describing a game with one
  // answer. Cheap to hold, and they are the paragraphs a future editor is most likely to trim.
  const page = read("examples/march/README.md");
  assert.match(page, /only pushing into one costs a heart|only while .*pushed into/i, "the reach rule is gone");
  assert.match(page, /for its whole length, not just its window/i, "the roll rule is gone");
  assert.match(page, /the guard's post does not move/i, "the post rule is gone");
  assert.match(page, /passing is a loan/i, "the pursuit rule is gone");
  assert.match(page, /^\*\*Play it:\*\* /m, "the page does not open with the demo link the nav uses");
});

test("the pass line is quoted as a range, not as one run", () => {
  // The page said `clear, 0 hits, 74.3 s` — one run, the lucky one. The next run took a heart at
  // x 34, and that hit is what found the guard whose post walked. A single number cannot tell a fix
  // from a good run, so the table has to say how many runs it is and give both ends of the time.
  const page = read("examples/march/README.md");
  const row = /^\| careful \(fight every guard\) \|([^\n]*)\|/m.exec(page)?.[1] ?? "";
  assert.ok(row.length > 0, "the pass line no longer has a careful row");
  assert.match(row, /3 of 3 runs/, `the careful row does not say how many runs it is: ${row.trim()}`);
  assert.match(row, /\d+(?:\.\d+)?–\d+(?:\.\d+)? s/, `the careful time is a single number again: ${row.trim()}`);
  const bold = /^\| bold \(roll through every guard\) \|([^\n]*)\|/m.exec(page)?.[1] ?? "";
  assert.match(bold, /3 of 3 runs/, `the bold row does not say how many runs it is: ${bold.trim()}`);
  assert.match(bold, /\d+(?:\.\d+)?–\d+(?:\.\d+)? s/, `the bold time is a single number again: ${bold.trim()}`);
});

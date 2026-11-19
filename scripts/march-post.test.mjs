/**
 * The rule the march page claims — *a guard holds his post* — is only true while the code undoes
 * what the commit does to the body.
 *
 * `homeX` was declared on every enemy from the first version and never read: the field said "holds
 * his post" and the behaviour said otherwise. Measured on 11-19 by holding right at the first guard:
 * the post walked 454 → 329 → 204 → 79 and the walker was killed at the spawn wall in 4.2 s having
 * decided nothing. A field nothing reads is not a rule, so this checks the reading.
 *
 * Like `march-hud.test.mjs`, this is a source gate on purpose: the behaviour lives inside the frame
 * loop, and the honest alternative — a browser — is not in CI. It names the three things the fix is
 * made of, each of which is the thing a future edit would drop.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const ROOT = new URL("..", import.meta.url).pathname;
const main = readFileSync(`${ROOT}examples/march/src/main.ts`, "utf8");

test("a walking guard reads his post, and the walk is the step back", () => {
  // The walk moves the body toward a target, and that target falls back to `homeX` whenever the
  // guard is not pursuing — the pursuit is the one case where he is meant to leave his post.
  assert.match(
    main,
    /const targetX = pursuing \? [^:]+ : enemy\.homeX;/,
    "the walk no longer aims at `homeX`: the commit moves the body and nothing moves it back",
  );
  assert.match(
    main,
    /stepToPost\(enemy\.body\.x,\s*targetX,\s*speed,\s*dt\)/,
    "the walk no longer steps the body toward its target",
  );
  const uses = (main.match(/\bhomeX\b/g) ?? []).length;
  assert.ok(uses >= 4, `\`homeX\` is read ${uses} time(s) — a post that is declared and never used is what caused this`);
});

test("a guard commits from his post, not from the middle of the return", () => {
  assert.match(
    main,
    /const atPost = Math\.abs\(enemy\.body\.x - enemy\.homeX\) < 0\.5;/,
    "the frame no longer asks whether the guard is standing on his post",
  );
  const inRange = /const inRange =\s*([\s\S]*?);/.exec(main)?.[1] ?? "";
  assert.match(
    inRange,
    /atPost/,
    `a guard may start a tell anywhere on the road again: the trigger reads \`${inRange.trim().replace(/\s+/g, " ")}\``,
  );
});

test("a guard you walked past gets one commit, then he is spent", () => {
  // Without this, eleven guards are eleven chances to hit you from behind and the road becomes
  // unkillable rather than expensive. The budget is one heart per guard, per run.
  assert.match(
    main,
    /if \(enemy\.passed\) enemy\.spent = true;/,
    "a pursuing guard never stops: after his commit he must be marked spent",
  );
});

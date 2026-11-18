# Camp — one fight, three verbs, one queue

A side-on duel with two rooms. Walk right, meet a pair, clear them, walk twelve tiles, meet
three under the rocks. The page is `/camp/`.

This page is the whole design in one place: **what each number is, why it is that number, and
which measurement made it change**. Every value below is the game's own — read from
`src/*.ts`, and the table is checked against the source by `scripts/camp-readme.test.mjs`, so a
tuned number that is not re-written here turns the gate red instead of the page quietly lying.

## The loop

1. Close the distance. The enemy notices you inside 260 px and walks in.
2. It commits — a tell, then a lunge. **The tell is your window**: strike it early (cancels the
   lunge) or leave (the lunge crosses 138 px).
3. It is open after a lunge. That is when you swing.
4. Get hit and you lose a heart and are pushed back; five hearts, and a room that is cleared stays
   cleared.

## The three verbs, and what each costs

| verb | keys | cost | what it buys |
| --- | --- | --- | --- |
| swing | `J` / `X` | 300 ms locked in place (windup 60 + active 90 + recovery 150) | the only way to remove a body |
| jump | `Space` / `Up` / `W` / `Z` | you cannot steer in the air | crossing a lunge, but you land where you land |
| roll | `Shift` / `L` | 180 ms locked, 420 ms before the next one | crossing a commit **inside** its 140 ms invulnerable window |

The roll's window (140 ms) is **shorter than the roll** (180 ms) on purpose: the last 40 ms can be
caught, so a roll is a commitment and not a free pass. No verb both moves and hits — that is what
makes choosing one cost the others.

## The enemies are a queue, not a crowd

| constant | value | why this number |
| --- | --- | --- |
| `ENEMY_STATS.sightPx` | 260 | far enough that the second room's three arrive as a group |
| `ENEMY_AI.lungeRangePx` | 70 | the commit covers 138 px, so a 110 px trigger made every place you could stand a place it reached |
| `ENEMY_AI.windupMs` | 260 | long enough to react to; the **first half** is cancellable, the second half is armoured |
| `ENEMY_AI.lungeMs` | 300 | fixed distance in fixed time, so it can be learned rather than guessed |
| `ENEMY_AI.lungeSpeedPxPerSecond` | 460 | 300 ms at 460 px/s = the 138 px the tell promises |
| `ENEMY_AI.restMs` | 450 | must outlast the answer it asks for: reversing a retreat costs 125 ms and the swing 300 ms, so a 300 ms window was a window nobody could step into. **It is a floor, not a dial** — at 380 the careful play stops clearing (measured 11-18: 0/6, dead in the first room), because the swing it starts on arrival no longer finishes before the next tell |
| `ENEMY_AI.commitSpacingMs` | 300 | **no two commits inside this window.** Measured with three bodies: the interval between lunges was median 1900 ms but **min 116 ms**, and 116 ms is shorter than the roll's 180 ms lockout — no verb could answer the second one. 300 ms is longer than that lockout, and the second tell now arrives while you are free |
| `ENEMY_STATS.hp` | 4 | 4 swings ≈ 1.2 s of commitment; at 3 the fight got **easier** — 12 swings cancelled every tell before it completed (8 tells, 0 lunges, no damage) |
| `ENEMY_STATS.contactDamage` | 1 | only a *lunging* enemy hurts; brushing past a walking one does not |
| `PLAYER_STATS.hearts` | 5 | two bodies take ~4 hits to clear; 3 hearts could not carry a run through two rooms (measured `down 8.4 s` on the second) |
| `PLAYER_STATS.invulnerableMs` | 900 | one hit per commitment, not one per frame of contact |
| `PLAYER_STATS.contactKnockback` | 320 | a hit moves you; standing in the same spot after one is not an option |
| `ATTACK.damage` | 1 | four clean hits per body, so the fight is about windows, not arithmetic |
| `ATTACK.hitstopMs` | 70 | both bodies stop on contact so the eye catches the hit |

The queue is the only rule that is about **two** enemies at once. An enemy in range that is not
next **holds its ground** rather than committing: the second tell must not start inside the answer
to the first.

## The room

64 × 11 tiles of 32 px. The left column is a wall — not decoration. The tilemap treats
out-of-map cells as empty, so before it existed a knockback at the first room could put the player
past `x = 0` where there is no ground: measured `x -104`, every enemy stuck in `walk`, 48 s of
nothing, and no way for the run to end. `test/level.test.ts` holds the wall.

Two bodies on open ground, a walk of twelve tiles, then three under the rocks and the wall at their
back: the second room asks the same question with one more body, and the retreat runs out.

## The pass line, and what it measured

The line is **the careful play clears with no hits, and the bold play clears fast but bleeds** —
one strategy must not be free.

| bot | clears | time | hearts left | hits taken |
| --- | --- | --- | --- | --- |
| bold (mash) | 3/3 | 11.9 s | 1 | 4 |
| careful (read the tell, punish the opening) | 6/6 | 42–54 s | 5 in 5 of 6 | 0 in 5 of 6 |

Same level, same bundle (`index-D6_5OA_7.js`). Two bodies only:

| bot | clears | time | hearts left | commits apart (min) |
| --- | --- | --- | --- | --- |
| bold | 2/2 | 10.4 s | 2 | 733 ms |
| careful | 34 s (1 of 2 runs stalled — that was the open left edge) | | 5 | 1033 ms |

With two bodies the queue never binds, which is why the two-body fight did not move when the rule
landed.

## Measuring it

```sh
pnpm -r build
E2E_CHROMIUM=/usr/bin/chromium pnpm camp:bot bold     --runs 3
E2E_CHROMIUM=/usr/bin/chromium pnpm camp:bot careful  --runs 3
```

`scripts/play-bot.mjs` prints, per run, `camps` (tells / lunges / hits / hearts lost **per room**,
split at the walk — never at a written-down index) and two intervals:

- `commit gap` — between one tell starting and the next. This is the number the queue rule is
  written against.
- `danger gap` — between one lunge starting and the next. One tell later; hitstop pauses the tell
  without pausing the clock, so it is a different question.

A machine that plays is the acceptance harness: a number is a rerun, not a rewrite.

## What is still open (the next targets)

- **One careful hit in six** was taken while free (`blade: idle`, `since 51`): a place, not a
  lockout. That is the next thing to explain — record where the body stood when it happens.
- **The roll is never required.** In the shipped fight the careful bot rolls zero times: standing
  and swinging still answers everything. The third verb exists, the third *decision* does not.
- **`restMs` was measured, and 450 stands.** 380 was tried on 11-18 and the careful bot died in the
  first room in **6 of 6** runs (`hearts 0`, 8–12 tells, 0–1 kills): the window is what keeps the
  careful answer alive, so it cannot be shortened to make a room harder. The second room is longer
  (15–21 tells) rather than harder (10–14 in the first), and that has to change some other way.

## Controls

`←`/`→` or `A`/`D` walk · `Space`/`↑`/`W`/`Z` jump · `J`/`X` swing · `Shift`/`L` roll · `R` retry

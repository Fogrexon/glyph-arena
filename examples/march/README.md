# March — the road, not the room

**Play it:** [fogrexon.github.io/glyph-arena/march/](https://fogrexon.github.io/glyph-arena/march/)

Eleven guards hold a 92-column road. You can fight each one, or go by it. The run is one minute
long, death is instant, and the retry is one frame.

CAMP asks *when do I commit*, in a room you cannot leave. This asks the same thing while the road
keeps going: there is always a guard in front of you, and the only two ways past are **fight it** or
**go by it**. The second one is what the game is for.

This page is the whole design in one place: **what each number is, why it is that number, and which
measurement made it change.** Every number below is the game's own — read from `src/*.ts`, and the
table is checked against the source by `scripts/march-readme.test.mjs`, so a tuned number that is
not rewritten here turns the gate red instead of the page quietly lying.

## The loop

1. Walk right. A guard holds his post: he does not come to you, and after a lunge he walks back to it.
2. Inside 70 px he commits — a tell, then a lunge that crosses 138 px. **The tell is your window**:
   strike it early (cancels the lunge) or leave.
3. After the lunge he is open for 450 ms. That is when you swing.
4. Decide, at every guard, which of the two things you are doing: **fight** (safe, slow) or **go
   by** (fast, and it costs a heart unless the roll is spent well).
5. Reach the goal past the last guard, or run out of hearts.

## The two ways past, and what each costs

| way | keys | cost | what it buys |
| --- | --- | --- | --- |
| fight | `J` / `X` | 300 ms locked in place per swing, and three swings per guard | the guard is gone, and the next one starts from a clean line |
| go by | `Shift` / `L` | a heart if the body is pushed into, nothing if the roll's window is spent right | the whole guard, in about a fifth of a second |
| hop over | `Space` | — | **nothing, on this road**: every beat is roofed |

That third row is the point of the roof. Without it a 28 px body clears a guard at any point of a
111 px jump, so "go by all eleven" would have been free and the fight would have been the slow path
nobody takes. The level says the rule instead of a tutorial: **under rock you fight, or you roll.**

## The numbers

| constant | value | why this number |
| --- | --- | --- |
| `ENEMY_AI.sightPx` | 260 | how far a guard notices you; he still does not walk, so this only decides when he turns |
| `ENEMY_AI.lungeRangePx` | 70 | the commit covers 138 px, so a 110 px trigger made every place you could stand a place it reached |
| `ENEMY_AI.windupMs` | 260 | long enough to react to; the **first half** is cancellable, the second half is armoured. CAMP measured that a longer tell does not create a decision (260 → 300 moved nothing to `idle`/`active` and halved the commits), and MARCH kept the proven number |
| `ENEMY_AI.lungeMs` | 300 | fixed distance in fixed time, so it can be learned rather than guessed |
| `ENEMY_AI.lungeSpeedPxPerSecond` | 460 | 300 ms at 460 px/s = the 138 px the tell promises |
| `ENEMY_AI.restMs` | 450 | must outlast the answer it asks for: the swing is 300 ms and a late start leaves the recovery out when the next tell begins. **A floor, not a dial** — CAMP measured 380 as 0/6 clears |
| `ENEMY_AI.commitSpacingMs` | 300 | **no two commits inside this window.** The unfair thing was the queue, not the body: with three, the gap between lunges was min 116 ms, shorter than the roll's 180 ms lockout, so no verb could answer the second one |
| `ENEMY_AI.returnPxPerSecond` | 300 | **a commit is a step out, not a move.** The lunge carries the body 138 px; without this the body kept it, and holding right at the first guard walked the post 454 → 329 → 204 → 79 and killed the walker at the spawn wall in 4.2 s without a decision. At your own 300 px/s the walk home cannot be chased down, so the window after the lunge is still the window |
| `ENEMY_STATS.hp` | 3 | three swings per guard, played eleven times, lands the careful crossing inside a minute. Four is 44 swings and 84.5 s (measured); three is 33 swings and 74.3 s, with no timing changed |
| `ENEMY_STATS.contactDamage` | 1 | one heart, once per 900 ms of invulnerability — and **only while the body is being pushed into**, see below |
| `PLAYER_STATS.hearts` | 4 | three passes and one mistake. Five survived CAMP because a room ends; a road charges per guard |
| `PLAYER_STATS.invulnerableMs` | 900 | one hit per commitment, not one per frame of contact |
| `PLAYER_STATS.contactKnockback` | 320 | a hit moves you; standing in the same spot after one is not an option |
| `ATTACK.windupMs` | 60 | the blade comes out after this long: the press has a cost or it is not a decision |
| `ATTACK.activeMs` | 90 | the only window in which the blade is out |
| `ATTACK.recoveryMs` | 150 | 300 ms of commitment in total, which is what the rest window has to cover |
| `ATTACK.reachPx` | 30 | 26 px of gap is where a swing lands, so the fight happens inside the lunge's own reach |
| `ATTACK.damage` | 1 | three clean hits per guard, so the fight is about windows, not arithmetic |
| `ATTACK.hitstopMs` | 70 | both bodies stop on contact so the eye catches the hit |
| `DODGE.durationMs` | 180 | the roll carries you 94 px — enough to cross a 20 px body with margin |
| `DODGE.speedPxPerSecond` | 520 | above the 300 px/s run; the point is to cross the commit, not to walk |
| `DODGE.invulnerableMs` | 140 | **shorter than the roll**, on purpose: the last 40 ms can be caught, so a roll is a commitment |
| `DODGE.cooldownMs` | 420 | one roll per guard, not one per frame |
| `PLAYER_SIZE.h` | 28 | the body that has to fit under the roof |
| `ENEMY_SIZE.h` | 44 | taller than the 36 px a body can rise under the rock, so the roof closes the jump |

### The three rules that are not numbers

**A body is a wall, and only pushing into one costs a heart.** The player is pushed out of a guard
in every frame except a roll; contact damages only while `vx` is toward the guard at over 60 px/s.
The first version damaged on any contact, and the fight it produced was not a fight: measured, a bot
playing CAMP's proven waiting game — stand outside the lunge, spend the rest — lost four hearts
before its first kill, because a guard walking into a standing body counted as a hit. The road's
question is *can I get by*, not *may I stand next to you*.

**A roll crosses a body for its whole length, not just its window.** Exempting only the 140 ms left
the last 40 ms being shoved back out of the guard, so no roll ever finished a crossing: measured, the
fast bot spent two rolls per guard, was pushed back out of every one, and died on the tenth. The
window is what stops damage; the roll is what stops the wall.

**The guard's post does not move, only his body does.** The rule above — he does not come to you —
was half true: the lunge carried him 138 px toward you and nothing carried him back, so the road
under the fight was rewritten, guard by guard. Measured by holding right at the first guard (no
attack, no roll): post 454 → 329 → 204 → 79, the walker's body pushed from 434 → 309 → 184 → 59, and
dead at the spawn wall in 4.2 s having decided nothing. He had not lost a fight; he had lost the
road. So a guard walks back to the post he committed from, and may not start a tell until he is
standing on it — the thing he commits from is the thing you planned against, whether you plan to
fight him there or to go by him.

## The road

112 × 11 tiles of 32 px. Eleven guards in five beats — one, two, three, two, three — with a walk
between them, then the goal at column 92.

Both edge columns are solid on **every** row, not just the standing row. The tilemap treats out-of-map
cells as empty, so a half-open edge is a hole you can be knocked through; the tutorial, the runner,
the pickup and CAMP each had to close it, and `test/level.test.ts` holds it here.

Every beat is roofed with seven rows of rock. The corridor is 64 px deep: a 28 px body can rise
36 px, a guard is 44 px. `test/level.test.ts` derives that relationship from `src/sizes.ts` rather
than repeating the numbers, so a taller guard or a thinner roof fails before someone measures a jump
that should not work.

## The pass line, and what it measured

The line is **the careful play clears with no hits, and the fast play bleeds** — one strategy must
not be free.

Three runs each, on the build this page describes, quoted as a range. **The range is the point.** The
first version of this table quoted one run — `clear, 0 hits, 74.3 s` — and the run it left out took a
heart at `x 34` on the first guard. Chasing that hit is what found that a guard's post moved with
every lunge (the third rule, above). A table written as a single number cannot tell a fix from a
lucky run.

| bot | result | time | hearts left | hits taken |
| --- | --- | --- | --- | --- |
| careful (fight every guard) | **clear 11/11, 3 of 3 runs** | 61.8–66.5 s | 4 | **0** |
| bold (roll through every guard) | **down at 9/11, 3 of 3 runs** | 7.77–7.81 s | 0 | 4, **all four while running at the goal** |

**bold dies at the same four places on every run** (`x 851`, `1267`, `1843`, `2291`): the roll carries
73 px and the pairs stand 96 px apart, so rolling past the first of a pair lands the body inside the
second guard's reach with the window already spent. "Roll through everything" is therefore not a
plan — the plan is *roll the singles, fight the groups*, which is what a player finds. That is the
decision the level is built to ask, and it is the reason the beats are grouped instead of evenly
spaced.

## Measuring it

```sh
pnpm -r build
E2E_CHROMIUM=/usr/bin/chromium pnpm march:bot march bold     --runs 3
E2E_CHROMIUM=/usr/bin/chromium pnpm march:bot march careful  --runs 3
```

`scripts/play-bot.mjs march` prints, per run, the phase, hearts, how many guards were passed and how
many killed, the clock, the hits **with the mode each one landed in and whether it was taken while
running at the goal**, and `retry N frame(s)` — the number a one-minute game lives on. It exits 0
when every run ended either way and could be restarted in a frame; the win is a number, not an exit
code.

Measuring this exposed two bugs in the instrument rather than the game, both now fixed:
**a keydown released inside one frame is a press the game never samples** (a one-frame `R` looked
like a 31-frame retry), and the player's **facing** had to be published, because a bot that spends
the tell retreating swings backwards and lands nothing (20 swings, 0 kills).

## What is still open

- **62–66 s is not a minute.** The careful crossing is honest but long. Cutting course length would
  cut the number of decisions, so the lever is `ENEMY_STATS.hp` — and the line to stop at is a
  person saying it feels unfair, not a bot taking fewer hits. The bot's numbers prove *there is a
  choice*; they cannot prove *it is fun*. **Nobody has played this yet who can say which it is** —
  three people's `died at x` is the next measurement, and it outranks every number on this page.
- **The pairs are the only thing that makes the roll unsafe.** Every guard is the same body; the
  beats differ in count. A second guard type is the obvious next content, and it is also the thing
  that would make "roll the singles" a worse rule than it is.
- **The road is flat.** No pits, no steps. Terrain is the next thing a road can use and none of it
  is here.
- **No sound.** The hit has hitstop and shake; it has no noise.

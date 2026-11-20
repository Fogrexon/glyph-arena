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
   **Walk past him and he turns and follows** — at 330 px/s against your 300, so he gains 30 px/s and
   gets one commit before he is spent and goes home. **He also shouts ahead**: the next post wakes
   and commits from further out, so going by is paid for at the guard you meet next, not here. The
   guard who heard it flashes for 600 ms — the price is announced before it is charged — and then
   wears a quiet mark for the rest of the run.
2. Inside 70 px he commits — a tell, then a lunge that crosses 138 px. **The tell is your window**:
   strike it early (cancels the lunge) or leave. The blade reaches 52 px past your body, which is the
   line he commits from, so the strike is a thing your hands can do from where you are standing.
3. After the lunge he is open for 450 ms. That is when you swing.
4. Decide, at every guard, which of the two things you are doing: **fight** (safe, slow) or **go
   by** (fast — but going by a body is the roll, not the walk: see the wall rule below).
5. Reach the goal past the last guard, or run out of hearts.

## The two ways past, and what each costs

| way | keys | cost | what it buys |
| --- | --- | --- | --- |
| fight | `J` / `X` | 300 ms locked in place per swing, and three swings per guard | the guard is gone, and the next one starts from a clean line |
| go by | `Shift` / `L` | the roll, and a heart every 900 ms you spend pushing into a body — **walking into one never gets you past it** | the whole guard, in about a fifth of a second |
| hop over | `Space` | — | **nothing, on this road**: every beat is roofed |

That third row is the point of the roof. Without it a 28 px body clears a guard at any point of a
111 px jump, so "go by all eleven" would have been free and the fight would have been the slow path
nobody takes. The level says the rule instead of a tutorial: **under rock you fight, or you roll.**

The second row's first cost is measured, not assumed. A hand that only walks — no swing, no roll —
**dies at the first guard in 4.6 s having passed 0 of 11** (three runs, 11-19): the body is a wall,
the push resolves away from it every frame, and pushing costs a heart every 900 ms. "Go by for a
heart" was not a thing you could do; the roll is not a discount on the walk, it is the only way
through a body.

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
| `ENEMY_AI.chaseSpeedPxPerSecond` | 330 | **passing is a loan.** A guard you walked past follows, 30 px/s faster than you run, while you are inside his sight — get 260 px away and he gives up. **One commit and he is spent**, so a guard can cost at most one heart in a run and eleven guards cannot become eleven hits. Slower than you and passing is free again; much faster and the road is a chase nobody survives. Measured 11-19: this is **not** what stops a runner — the roll hands die at the pairs first, and the hand that only walks never passes a body at all |
| `ENEMY_AI.alertRangePx` | 190 | **the price of going by.** A guard who was *called* — woken by the one you passed — commits from here instead of 70. 190 clears his own 138 px commit by 52, so he is not aiming at where you stood: he lunges **into the road**, and you meet his body with the roll still cooling down. With the pursuit alone the mixed line cleared in 41–52 s **untouched** (measured 11-19), which is faster *and* safer than fighting and so not a choice; with the shout it clears in 34–47 s **taking a heart**. The number is the distance at which a body becomes an obstacle rather than a hit — further and he lunges at nothing |
| `ENEMY_AI.callPartnerPx` | 130 | **a call wakes a pair, not a queue.** Posts closer than this wake together when one of them is called. The road's pairs stand 96 px apart (triples 64) and the next beat is 320–448 away, so this separates the two populations instead of tuning a difficulty: `scripts/march-readme.test.mjs` derives both edges from `level.ts` |
| `ENEMY_AI.alertFlashMs` | 600 | **a price nobody reads is not a price.** The called guard wears a loud mark — wide bar and halo — for 600 ms, then the quiet one for the rest of the run. Both ends are derivable: longer than a simple reaction to a shape change, shorter than the 640 ms it takes to walk a beat (6 tiles at 300 px/s), so the cue belongs to the guard who shouted rather than to the road |
| `ENEMY_AI.returnPxPerSecond` | 300 | **a commit is a step out, not a move.** The lunge carries the body 138 px; without this the body kept it, and holding right at the first guard walked the post 454 → 329 → 204 → 79 and killed the walker at the spawn wall in 4.2 s without a decision. At your own 300 px/s the walk home cannot be chased down, so the window after the lunge is still the window |
| `ENEMY_STATS.hp` | 3 | three swings per guard, played eleven times, lands the careful crossing inside a minute. Four is 44 swings and 84.5 s (measured); three is 33 swings and 74.3 s, with no timing changed |
| `ENEMY_STATS.contactDamage` | 1 | one heart, once per 900 ms of invulnerability — and **only while the body is being pushed into**, see below |
| `PLAYER_STATS.hearts` | 4 | three passes and one mistake. Five survived CAMP because a room ends; a road charges per guard |
| `PLAYER_STATS.invulnerableMs` | 900 | one hit per commitment, not one per frame of contact |
| `PLAYER_STATS.contactKnockback` | 320 | a hit moves you; standing in the same spot after one is not an option |
| `ATTACK.windupMs` | 60 | the blade comes out after this long: the press has a cost or it is not a decision |
| `ATTACK.activeMs` | 90 | the only window in which the blade is out |
| `ATTACK.recoveryMs` | 150 | 300 ms of commitment in total, which is what the rest window has to cover |
| `ATTACK.reachPx` | 52 | **the blade reaches the line he commits from.** A guard tells at 70 px centre to centre — a 50 px gap between the bodies — and at 30 px the blade could not touch him from that line, so "strike the tell" was a move the game asked for and did not allow. A first-time player (11-19) swung three times at range with the blade out and left the guard at full hp; two hits landed at a 20 px gap. Derived in `test/combat.test.ts` from the two body widths and the lunge range, and the same test keeps the other end: one pixel past the reach is a miss |
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

**A swing that lands nothing is drawn.** A press that goes through air used to look exactly like a
dropped input: the blade was on screen for 150 ms of a 300 ms swing and then nothing. A miss now
leaves the same box in the same place as the blade's window closes, grey and fading for 130 ms — the picture says *the blade went
there and he was not in it*, which is the only way a player learns a distance. `whiff` is published
with the rest of the state so a harness can tell a miss from a key the game never saw.

**Passing is a loan, not a free pass.** A guard you walked past used to keep his post and let you
go: the road behind you was empty, so the fast line was faster *and* safer and there was nothing to
choose. He now turns and follows, and his one commit is what you pay with: a roll, or a heart. In a
7.4 s run that rolled through nine guards, **eight of them chased and committed at the player's
back** (`spent: 8` in `__marchState`); the player answered each with a roll, which is the point —
the roll becomes a resource you cannot spend twice in 420 ms. A guard who is coming is drawn with an
outline, because a thing that follows you has to be visible as one.

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

The row above was re-measured after `ATTACK.reachPx` went 30 → 52 (a first-time player could not
land a swing from the line the guard commits from), and the careful crossing moved with it:
**61.8–66.5 s → 66.3–74.4 s**, still 0 hits. A longer blade is not a faster fight here — the careful
line swings on the rest window either way, and the reach changed which swings land, so "advance,
hold, swing" settled onto a different rhythm. What is worth keeping is the shape: careful clears
with no hits, and no hand that goes by ends the road.

| bot | result | time | hearts left | hits taken |
| --- | --- | --- | --- | --- |
| careful (fight every guard) | **clear 11/11, 3 of 3 runs** | 68.1–72.6 s | 4 | **0** |
| bold (roll when a body is 22 px away) | **down at 9/11, 3 of 3 runs** | 8.70–8.73 s | 0 | 4, **all four while running at the goal** |
| rush (run, roll on every cooldown) | **down at 7/11, 3 of 3 runs** | 6.58–6.62 s | 0 | 4, same reason |
| run (walk, never roll) | **down at 0/11, 3 of 3 runs** | 4.58–4.62 s | 0 | 4, **all on the first guard** |
| mixed (roll the singles, fight the pairs) | **clear 11/11, 3 of 3 runs** | 34.1–47.1 s | 2–3 | **1–2** |

The counts differ because the hands are not the same age: `careful` and `bold` are quoted over six
runs each — the three from the pursuit change and the three from the run hand — while `rush`, `run`
and `mixed` are the three runs that introduced them. The range is
still the point; six runs of the same build say more about the road than three do.

**The two roll hands die in the same four places** (`x 851`, `1267`, `1843`, `2291` for `bold`;
`854`, `1270`, `1843`, `2227` for `rush`): the roll carries 73 px and the pairs stand 96 px apart, so
rolling past the first of a pair lands the body inside the second guard's reach with the window
already spent. `rush` spends the roll on every cooldown (32 rolls a run) and it changes nothing —
**the death is geometry, not timing.** "Roll through everything" is therefore not a plan; the plan is
*roll the singles, fight the groups*, which is what a player finds. That is the decision the level is
built to ask, and it is the reason the beats are grouped instead of evenly spaced.

**`mixed` is the row the pass line finally lands on.** The policy is one line — a guard whose
**post** has nobody within 130 px is a roll, otherwise fight — and it clears in **34–47 s taking one
or two hearts**, passing five guards and killing six. Against the careful 68–73 s and no hits, that
is the choice the road was built to ask: **half the time for a heart**, and no way to have both.

**It did not start that way.** With the pursuit alone, `mixed` cleared in 41–52 s with **zero** hits
— faster *and* untouched, so it strictly dominated the careful line and there was still one best
answer. The chaser's single commit cost nothing, because it was answered by the same roll the
crossing had already spent. What gives going by a price is that the guard you pass **shouts ahead**:
the next post wakes and commits from 190 px instead of 70, so the body lands **in the road** — 52 px
past his own 138 px reach — and you arrive at it with the roll still cooling down. That is why every
hit in the table lands in `walk` at `x 1281`/`1291`/`2305`: the called guard's body, met while
running. The reading is geometric because the road is read from posts, not bodies.

**And `run` is the row that redefines the second way past.** It never swings and never rolls, so it
is the honest version of "just run": it dies at the **first** guard in 4.6 s with 0 of 11 passed, on
every run. The body is a wall and the roll is the only thing that removes it, so there is no
"go by for a heart" walk — the roll is not a discount on the road, it is the road.

## Measuring it

```sh
pnpm -r build
E2E_CHROMIUM=/usr/bin/chromium pnpm march:bot march careful  --runs 3
E2E_CHROMIUM=/usr/bin/chromium pnpm march:bot march bold     --runs 3
E2E_CHROMIUM=/usr/bin/chromium pnpm march:bot march rush     --runs 3
E2E_CHROMIUM=/usr/bin/chromium pnpm march:bot march run      --runs 3
E2E_CHROMIUM=/usr/bin/chromium pnpm march:bot march mixed    --runs 3
```

Five hands, because the fast line is two questions and one hand cannot answer both. `run` never
swings and never rolls, so it answers *does walking pass a body*; `rush` walks and spends the roll on
every cooldown, so it answers *is the roll enough when it is always available*. `bold` rolls only
when a body is 22 px away, so its death at the pairs could be a timing mistake; `rush` takes the
timing out of the question. `mixed` is the policy a player converges on — roll a guard who is alone,
fight a guard who is not — and it is the hand that decides whether a middle line exists at all. Each of them prints the phase, hearts, how many guards were passed and how
many killed, the clock, the hits **with the mode each one landed in and whether it was taken while
running at the goal**, the rolls and swings a hand actually spent, and `retry N frame(s)` — the number
a one-minute game lives on. It exits 0 when every run ended either way and could be restarted in a
frame; the win is a number, not an exit code.

Measuring this exposed three bugs — two in the instrument, one in the measurement's idea of the road.
The third is published with the rest of the state: a guard's **post** (`homeX`) is what a plan is made
against, because a body mid-lunge is 138 px from where he started, so "is this guard alone" read off
bodies changes with the moment and read off posts it is a property of the road.

Both instrument bugs are fixed:
**a keydown released inside one frame is a press the game never samples** (a one-frame `R` looked
like a 31-frame retry), and the player's **facing** had to be published, because a bot that spends
the tell retreating swings backwards and lands nothing (20 swings, 0 kills).

## What is still open

- **The pass line holds, for the first time.** Walking cannot pass a body at all (0 of 11), rolling
  through everything dies at the pairs (9 of 11), and **mixed clears in 34–47 s taking one or two
  hearts** against the careful 68–73 s untouched. Half the time for a heart is a choice; the road
  no longer has one best answer. What made the difference was not the pursuit — it was the shout
  ahead (`alertRangePx`).
- **Three first-time players, and the answer is not the one the numbers predicted** (11-19, this
  bundle, each in their own Pod). All three finished their minute at **`passed 0/11`** — not one of
  them rolled through a body. 宣伝 died 7 times (`died at x` 851 ×5, 754 ×2, 22% of the road);
  QA died 3 times (1148–1202); リリース mashed `J` and **cleared in 105 s without dying, one heart
  gone**. So the decision the last two bullets were built around was **never reached by anyone**:
  the cost system was dead code for every player who did not already know the verb, which was all
  of them. What a first-timer meets instead is the pair at 768/864 — the one place mashing stops
  working — and that is a wall, not a choice.
- **The controls line never said what the roll does.** `A/D run · Space jump · J attack · Shift roll`
  reads as two ways to hit things. It now has a second row: `Shift rolls through a body — the guard
  you pass wakes the next one`. That sentence is the whole game, and it was not on the screen.
- **The death screen named a coordinate, not the thing that killed you.** `died at x 851` was all
  the game said at the moment of failure, and 851 means nothing to a player — 宣伝 died there five
  times in one minute without ever knowing it was the same pair. The screen now adds the road's own
  word for it: `beat 2/5 · 2 guards`, derived from the posts by the same grouping `test/level.test.ts`
  checks rather than typed.
- **The tell is the second verb and it was in the same position.** Two of the three died to lunges
  they never interrupted: the guard's tell is 260 ms of orange, and striking him *inside* it
  cancels the lunge outright — the fight's whole defence, on no screen. It is now a third row,
  `the orange flash is his tell — hit him inside it and the lunge never happens`, and **it leaves
  after the player's first kill or first pass**: a hint that never leaves is scenery.
- **`hits N (N from behind)` was a lie, and it was mine.** The number behind it is
  `player.vx > 60` — *were you running at the goal when it landed* — and nothing in the run measures
  which side a guard was on. Two first-time players read it as a fact about the guard and reported
  the cause of death as "4 from behind"; so did I, twice, while tuning against it. On those runs
  `passed 0/11`, so every guard was in front. The field is now `"running" | "standing"`, the HUD
  prints `hits 4 (4 while running)`, and `test/readout.test.ts` fails if a label names a side again.
  **The same rule as the harness `kicks` correction: the instrument may not name a thing it did not
  measure.**
- **A cue off screen is absent, not quiet.** QA went over the first guard on purpose: the pair woke
  on cue, but standing at `x 406` they were 368 and 464 px to the right, which on the 640 px view
  with the player at 42% is **637 px and 733 px** — one on the last column of pixels, one past it.
  QA had to crop a screenshot to see the mark at all. An alerted guard whose body is off screen now
  draws a 4 px cream bar on the edge he is off of (`edgeMarkFor`), so the price of going by is on
  screen even when the guard is not. The body keeps its own mark when it is visible: two marks for
  one guard would read as two guards.
- **65–73 s is not a minute.** The careful crossing is honest but long. Cutting course length would
  cut the number of decisions, so the lever is `ENEMY_STATS.hp` — and the line to stop at is a
  person saying it feels unfair, not a bot taking fewer hits. The bot's numbers prove *there is a
  choice*; they cannot prove *it is fun*. **Nobody has played this yet who can say which it is** —
  three people's `died at x` is the next measurement, and it outranks every number on this page.
- **The pairs are the only thing that makes the roll unsafe.** Every guard is the same body; the
  beats differ in count. A second guard type is the obvious next content, and it is also the thing
  that would make "roll the singles" a worse rule than it is.
- **The stall is in the harness, not in the road — and that is a correction.** The first reading was
  "the body pushed into a guard that never committed". The captured state says otherwise: at
  `x 2526` the player had **`vx 0`**, **four hearts**, and **no living guard within 400 px** — all
  eleven were dead or passed. The game derives `vx` from the keys it received every frame, so it
  cannot produce a standing body on a clear road; the harness's held-key set and the game's input had
  disagreed, and the set never re-sent the key. The harness now re-sends it when the road is clear and
  the body is not moving, and prints `kicks` — a non-zero count on a passing run is the proof rather
  than a theory. It is intermittent (2 of 4 runs before the change, 0 of 8 after), so the counter is
  the instrument that will show it if it comes back.
- **The road is flat.** No pits, no steps. Terrain is the next thing a road can use and none of it
  is here.
- **No sound.** The hit has hitstop and shake; it has no noise.

# March — the road, not the room

Eleven guards hold a 92-column road. You can fight each one, or go by it. The run is one minute
long, death is instant, and the retry is one frame. The page is `/march/` — demo:
<https://fogrexon.github.io/glyph-arena/march/>.

CAMP asks *when do I commit*, in a room you cannot leave. This asks the same thing while the road
keeps going: there is always a guard in front of you, and the only two ways past are **fight it** or
**go by it**. The second one is what the game is for.

## The four rules that make "go by" a question

| Rule | Why it is this rule |
| --- | --- |
| **A body is a wall** | The player is pushed out of a guard. Without it, walking through an enemy is a way past it and the fight is optional. |
| **Pushing into a body costs a heart** | Contact only hurts while you are *moving into* the guard (`vx` toward it, over 60 px/s). One rule, and it splits the road in two: a guard you stand next to is a wall and free, a guard you try to shove through is a heart. |
| **A roll crosses a body for its whole length** | The roll is the fast road's tool. Its damage window is 140 ms, but the body is crossed for all 180 ms — exempting only the window let the last 40 ms be shoved back out, so a roll could never finish a crossing (measured: two rolls per guard, pushed back out of every one). |
| **Every beat is roofed** | Seven rows of rock leave 64 px between floor and ceiling: a 28 px body can hop 36 px, a guard is 44 px tall. Without the roof a body clears a guard at any point of a 111 px jump, so "go by all eleven" would have been free. |

The roof is the level saying the rule instead of a tutorial: **under rock you fight, or you roll.**

## The measured strategies

Played by `pnpm march:bot march bold|careful` — a machine, in a pod, against the built slice:

| Strategy | Result | Time | Hearts | Hits |
| --- | --- | --- | --- | --- |
| `careful` — fight every guard | **clear 11/11** | **74.3 s** | 4 / 4 left | **0** |
| `bold` — roll through every guard | **down at 9/11** | 8.3 s | 0 | 4, **all four from behind** |

Two numbers are the design:

- **Careful is safe and slow**: eleven guards at three swings each, no hit taken. The waiting game
  CAMP's numbers were measured on still works when the guard holds his post.
- **Bold is fast and unaffordable**: 9 of 11 in 8.3 s, four hearts gone, and every hit is logged
  `passing` — a hit taken while running *at* the goal. The fast road has a price and the price is
  collected.

**Rolling past the first of a pair is where bold dies**, and it dies at the same places every run
(`x 851`, `1267`, `1843`, `2291`): the roll carries 73 px and the pairs stand 96 px apart, so the
body lands inside the second guard's reach with the window already spent. "Roll through everything"
is therefore not a plan — the plan is *roll the singles, fight the groups*, which is what a player
finds and what this game is asking.

The fight is CAMP's, deliberately: the same tell (260 ms), the same commit (460 px/s for 300 ms,
138 px), the same rest (450 ms), the same commit queue (300 ms). What is new is the shape around it.
Three things were changed and each has its reason in `src/main.ts`: the guard holds his post instead
of walking you down (a road has walls, a room has corners), the guard is 44 px tall so the roof can
close the jump, and it has three hit points instead of four (44 swings down a road is 84 s, and a
one-minute game that takes ninety seconds is not one).

## What this does not do yet

- The road is flat. No pits, no steps — terrain is the next thing a road can use and none of it is
  here.
- One guard type. The beats differ in count, not in kind.
- No sound. The hit has hitstop and shake; it has no noise.

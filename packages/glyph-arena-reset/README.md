# @fogrexon/glyph-arena-reset

One list of "put this back", run in the order it was written:

```ts
const reset = createReset();

reset.add("player", () => {
  player = createBody(spawn, PLAYER_CONFIG);
});
reset.add("commitClock", () => {
  lastCommitMs = -Infinity;
});

reset.run(); // boot
// …
reset.run(); // retry — the same list, not a second one
```

## The failure this removes

Every slice wrote its own `reset()` by hand, and every one of them had the same hole: **a state field
is added, and the line that resets it is added somewhere else — or not at all.** The miss does not
throw. It leaves the previous round's value in place, so the second run starts with a stale clock and
reads as a game bug. `examples/camp` had already lost one (`dodge`: dying mid-roll came back mid-roll,
still invulnerable).

Registration puts the reset **next to the state it resets**, and boot and retry call the same `run()`.
Two entry points into a round (`boot()` and `restart()`) is how one of them goes stale.

## What it refuses to do

- **It does not know what a round is.** The functions are the game's; this is a list.
- **It does not read state between entries.** If one reset reads what another wrote, order becomes
  meaning and nobody can reorder anything safely.
- **Its `run()` return value is not a gate.** The count changes whenever a subsystem is added, so a
  test that pins it turns "we added a thing" into a red build. Check a reset with the game's own
  state.

## API

- `createReset()` → `{ add, run }`.
- `add(name, fn)` — register, next to the state. A duplicate `name` throws (two registrations of one
  name is a copy-paste), and so does a registration made while `run()` is running (it would have no
  defined place in the order).
- `run()` — every function in registration order, synchronously: no load, no `await`, no rebuild. A
  one-minute game cannot spend its retry on a scene change. Returns how many ran. Throws if called
  from inside a reset, and **rethrows the first failure without running the rest** — a half-reset
  state that looks normal is worse than a crash, because the next frame reads it as a real round.

Part of the [`@fogrexon/glyph-arena`](../glyph-arena/README.md) runtime.

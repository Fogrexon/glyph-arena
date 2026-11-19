# @fogrexon/glyph-arena-reset

One list of "put this back", run in the order it was written. See also
[package README](../packages/glyph-arena-reset/README.md).

## Exports

Generated from the package's source when the docs are built — do not edit this table by hand.

## `createReset()`

```ts
const reset = createReset();
reset.add("commitClock", () => {
  lastCommitMs = -Infinity;
});
reset.run();
```

## Why it is a library

The failure has one shape and every sample had it: a state field is added, and the line that resets
it is added somewhere else — or not at all. Nothing throws; the previous round's value simply stays,
and the second run reads as a game bug. `examples/camp`'s hand-written `reset()` had already lost
`dodge`, so dying mid-roll came back mid-roll and still invulnerable.

Registering next to the state removes the "somewhere else", and one `run()` for boot and retry
removes the second path.

## The rules

- **`add(name, fn)`** — a duplicate name throws, and so does registering during `run()`.
- **`run()`** — synchronous, in registration order, returns how many ran. Re-entrant `run()` throws.
- **A failing entry stops the list** and the exception is rethrown: a half-reset state that looks normal is worse than a crash.
- **Resets do not read each other's state.** Order is not meaning.
- **The return value is not a gate.** Pin the game's own state instead; the count changes whenever a subsystem is added.

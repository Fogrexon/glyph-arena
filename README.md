# Glyph Arena

Monorepo for Glyph Arena packages.

## Packages

- `@fogrexon/glyph-arena-loop` — frame loop with injectable clock and rAF
- `@fogrexon/glyph-arena-input` — keyboard and pointer input snapshot

## Demo

Top-down pickup game at [fogrexon.github.io/glyph-arena](https://fogrexon.github.io/glyph-arena/). Source: `examples/pickup-demo`.

```bash
pnpm install
pnpm build
pnpm --filter @fogrexon/glyph-arena-pickup-demo dev
```

## Development

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

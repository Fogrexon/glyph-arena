// Harness for the browser gate: the tutorial's `buildPad`, exposed on `window`.
//
// The phone section's zone block is a snippet for the reader's own file, so it exports nothing.
// This page is the smallest possible host: no canvas, no loop — the gate only asks `buildPad` for
// zones at several widths and probes them.
import { buildPad } from "./phone-pad";

declare global {
  interface Window {
    __buildPad?: typeof buildPad;
  }
}

window.__buildPad = buildPad;

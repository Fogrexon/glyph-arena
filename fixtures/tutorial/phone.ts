// Harness for the browser gate: the tutorial's phone program, exported so `buildPad` can be probed.
//
// The phone program is a reader's file, not a module with an API, so `phone-pad.ts` is generated
// from the document with one added `export` line. Its `buildPad` hands back the zones *and* the pad
// it reads (the program also draws them); the probe only asks "which zones answer at this point",
// so this page flattens it to the controls.
import { buildPad } from "./phone-pad";

const probe = (width: number, height: number) => buildPad(width, height).controls;

declare global {
  interface Window {
    __buildPad?: typeof probe;
  }
}

window.__buildPad = probe;

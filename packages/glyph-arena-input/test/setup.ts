import { Window } from "happy-dom";

const testWindow = new Window();
Object.assign(globalThis, {
  EventTarget: testWindow.EventTarget,
  Event: testWindow.Event,
  KeyboardEvent: testWindow.KeyboardEvent,
  PointerEvent: testWindow.PointerEvent,
});

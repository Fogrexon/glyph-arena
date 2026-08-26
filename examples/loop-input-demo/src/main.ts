import { createActions } from "@fogrexon/glyph-arena-actions";
import { createDraw } from "@fogrexon/glyph-arena-draw";
import { createInput } from "@fogrexon/glyph-arena-input";
import { createLoop } from "@fogrexon/glyph-arena-loop";

const canvasEl = document.getElementById("game");
if (!(canvasEl instanceof HTMLCanvasElement)) {
  throw new Error("Missing #game canvas");
}

const canvas: HTMLCanvasElement = canvasEl;

const context = canvas.getContext("2d");
if (context === null) {
  throw new Error("2D canvas context unavailable");
}

function createCircleSprite(
  diameter: number,
  color: string,
  strokeOnly = false,
): CanvasImageSource {
  const spriteCanvas = document.createElement("canvas");
  spriteCanvas.width = diameter;
  spriteCanvas.height = diameter;

  const spriteContext = spriteCanvas.getContext("2d");
  if (spriteContext === null) {
    throw new Error("2D sprite canvas context unavailable");
  }

  const center = diameter / 2;
  const arcRadius = strokeOnly ? center - 2 : center;

  spriteContext.beginPath();
  spriteContext.arc(center, center, arcRadius, 0, Math.PI * 2);

  if (strokeOnly) {
    spriteContext.strokeStyle = color;
    spriteContext.lineWidth = 2;
    spriteContext.stroke();
  } else {
    spriteContext.fillStyle = color;
    spriteContext.fill();
  }

  return spriteCanvas;
}

const radius = 20;
const speed = 220;
const pointerMarkerDiameter = 20;

const playerSprite = createCircleSprite(radius * 2, "#4cc9f0");
const pointerSprite = createCircleSprite(pointerMarkerDiameter, "#ff8a4c", true);

const draw = createDraw({ context });

const player = { x: 0, y: 0 };

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  player.x = canvas.width / 2;
  player.y = canvas.height / 2;
}

resize();
window.addEventListener("resize", resize);

const input = createInput();
input.attach(window);

const actions = createActions();
actions.bind("left", ["ArrowLeft", "KeyA"]);
actions.bind("right", ["ArrowRight", "KeyD"]);
actions.bind("up", ["ArrowUp", "KeyW"]);
actions.bind("down", ["ArrowDown", "KeyS"]);

const loop = createLoop({
  onFrame(time) {
    const { keys, pointers } = input.snapshot();
    const query = actions.tick(keys);

    let dx = 0;
    let dy = 0;

    if (query.down("left")) dx -= 1;
    if (query.down("right")) dx += 1;
    if (query.down("up")) dy -= 1;
    if (query.down("down")) dy += 1;

    if (dx !== 0 || dy !== 0) {
      const length = Math.hypot(dx, dy);
      player.x += (dx / length) * speed * time.delta;
      player.y += (dy / length) * speed * time.delta;
    } else if (pointers.length > 0) {
      const pointer = pointers[0];
      const toX = pointer.x - player.x;
      const toY = pointer.y - player.y;
      const distance = Math.hypot(toX, toY);

      if (distance > 1) {
        player.x += (toX / distance) * speed * time.delta;
        player.y += (toY / distance) * speed * time.delta;
      }
    }

    player.x = Math.max(radius, Math.min(canvas.width - radius, player.x));
    player.y = Math.max(radius, Math.min(canvas.height - radius, player.y));

    draw.clear("#0f1115");

    for (const pointer of pointers) {
      draw.sprite({
        image: pointerSprite,
        x: pointer.x - pointerMarkerDiameter / 2,
        y: pointer.y - pointerMarkerDiameter / 2,
      });
    }

    draw.sprite({
      image: playerSprite,
      x: player.x - radius,
      y: player.y - radius,
    });
  },
});

loop.start();

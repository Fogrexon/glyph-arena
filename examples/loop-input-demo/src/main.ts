import { createInput } from "@fogrexon/glyph-arena-input";
import { createLoop } from "@fogrexon/glyph-arena-loop";

const canvasEl = document.getElementById("game");
if (!(canvasEl instanceof HTMLCanvasElement)) {
  throw new Error("Missing #game canvas");
}

const canvas: HTMLCanvasElement = canvasEl;

const ctx = canvas.getContext("2d");
if (ctx === null) {
  throw new Error("2D canvas context unavailable");
}

const radius = 20;
const speed = 220;

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

const loop = createLoop({
  onFrame(time) {
    const { keys, pointers } = input.snapshot();

    let dx = 0;
    let dy = 0;

    if (keys.has("ArrowLeft") || keys.has("KeyA")) dx -= 1;
    if (keys.has("ArrowRight") || keys.has("KeyD")) dx += 1;
    if (keys.has("ArrowUp") || keys.has("KeyW")) dy -= 1;
    if (keys.has("ArrowDown") || keys.has("KeyS")) dy += 1;

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

    ctx.fillStyle = "#0f1115";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (const pointer of pointers) {
      ctx.strokeStyle = "#ff8a4c";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(pointer.x, pointer.y, 10, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.fillStyle = "#4cc9f0";
    ctx.beginPath();
    ctx.arc(player.x, player.y, radius, 0, Math.PI * 2);
    ctx.fill();
  },
});

loop.start();

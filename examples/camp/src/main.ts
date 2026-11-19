/**
 * Camp — the first slice of a different genre.
 *
 * The runner asks "can I get to the end". This asks "when do I commit": one attack, one enemy,
 * and the half second around the contact is the whole product. Windup, active frames, hitstop,
 * knockback and the flash are here; there is no art, so the feel has to come from timing and
 * motion rather than from a drawing.
 *
 * Everything about tiles is the library's (`solidInRect`), everything about a body is the
 * library's (`stepBody`), and the numbers that decide how it feels are this game's and sit at the
 * top of this file.
 */
import { createActions } from "@fogrexon/glyph-arena-actions";
import { createBody, stepBody, type Body, type BodyConfig } from "@fogrexon/glyph-arena-body";
import { createDraw } from "@fogrexon/glyph-arena-draw";
import { createInput } from "@fogrexon/glyph-arena-input";
import { createLoop } from "@fogrexon/glyph-arena-loop";
import { createReset } from "@fogrexon/glyph-arena-reset";
import { visibleColumns } from "@fogrexon/glyph-arena-tilemap";
import { approach } from "@fogrexon/glyph-arena-tween";

import {
  ATTACK,
  DODGE,
  attackBox,
  attackPhase,
  beginAttack,
  beginDodge,
  dodgeInvulnerable,
  dodgeReady,
  dodgeRolling,
  overlapsHalfOpen,
  stepAttack,
  stepDodge,
  type Attack,
  type Dodge,
} from "./combat";
import { ENEMY_AI, canCommit, canInterrupt, type EnemyMode } from "./enemy";
import { TILE, currentMap, enemySpawns, isSolidTile, levelColumns, levelRows, solidAt, spawnPoint } from "./level";

const VIEW_W = 640;
const VIEW_H = 360;

/** The HUD's type. Canvas' default is 10px sans-serif, which reads as a mistake rather than a font. */
const HUD_FONT = "ui-monospace, monospace";

/** The player's feel. Same family as the runner's, shorter reach and a touch slower. */
const PLAYER_CONFIG: BodyConfig = {
  gravity: 2600,
  jumpVelocity: -760,
  maxFall: 1200,
  coyoteSeconds: 0.09,
  jumpBufferSeconds: 0.12,
  runSpeed: 300,
  runAccel: 2400,
  airAccel: 1600,
  groundFriction: 2600,
  airFriction: 400,
  jumpCutFactor: 0.35,
};

/** The enemy shares the physics and differs in speed: it can never outrun you, only corner you. */
const ENEMY_CONFIG: BodyConfig = { ...PLAYER_CONFIG, runSpeed: 74, runAccel: 900, airAccel: 500, jumpVelocity: -520 };

/**
 * Five hearts for two camps: the run is expected to cost a masher about two hits per camp, plus one
 * heart of margin. This is the number the two-strategy acceptance lives on — measured with three it
 * died with the last enemy standing, and with an enemy's hp at 3 instead it took nothing at all
 * (twelve swings cancel every tell before it lands), so the health is the lever that keeps
 * "fast and hurt" a way to win rather than the huge-hammer option that only looks brave.
 */
const PLAYER_STATS = { hearts: 5, invulnerableMs: 900, contactKnockback: 320 };
const ENEMY_STATS = { hp: 4, sightPx: 260, contactDamage: 1 };

const canvas = document.querySelector("canvas");
if (canvas === null) {
  throw new Error("no canvas");
}
canvas.width = VIEW_W;
canvas.height = VIEW_H;
const context2d = canvas.getContext("2d");
if (context2d === null) {
  throw new Error("no 2d context");
}
const ctx: CanvasRenderingContext2D = context2d;

/**
 * Every rectangle and line of text on screen. `ctx` is still here for one thing — `globalAlpha`
 * during a roll — because opacity on a rect is not in `draw` yet (two of three samples ask).
 */
const paint = createDraw({ context: ctx });

const input = createInput();
input.attach(window);
const actions = createActions();
actions.bind("left", ["ArrowLeft", "KeyA"]);
actions.bind("right", ["ArrowRight", "KeyD"]);
actions.bind("jump", ["Space", "ArrowUp", "KeyW", "KeyZ"]);
actions.bind("attack", ["KeyJ", "KeyX"]);
actions.bind("dodge", ["ShiftLeft", "ShiftRight", "KeyL"]);
actions.bind("retry", ["KeyR"]);

type Phase = "play" | "clear" | "down";

type Enemy = {
  body: Body;
  hp: number;
  alive: boolean;
  flashMs: number;
  mode: EnemyMode;
  modeMs: number;
  facing: 1 | -1;
};

let player: Body = createBody({ x: 0, y: 0, w: 20, h: 28 }, PLAYER_CONFIG);
let enemies: Enemy[] = [];
let attack: Attack = { elapsedMs: -1, hasHit: false, facing: 1 };
let dodge: Dodge = { elapsedMs: -1, cooldownMs: 0, facing: 1 };
let facing: 1 | -1 = 1;

let phase: Phase = "play";
let hearts = PLAYER_STATS.hearts;
let invulnerableMs = 0;
let hitstopMs = 0;
let shakeMs = 0;
let hits = 0;
let kills = 0;
let simMs = 0;
// When anyone last began a tell. Enemies take turns: no two commits inside
// `ENEMY_AI.commitSpacingMs`. See `canCommit` — the unfair thing was the queue, not the enemy.
let lastCommitMs = -Infinity;
let cameraX = 0;

const worldWidth = levelColumns() * TILE;
const worldHeight = levelRows() * TILE;

/**
 * Put the slice back to its first frame. One registration per piece of state, written **next to the
 * state it resets** — the old version was a function that listed all fifteen by hand, and it had
 * already lost one (`dodge`: dying mid-roll came back mid-roll, still invulnerable). Boot and retry
 * call the same `run()`; two paths is how one of them goes stale.
 */
const reset = createReset();

reset.add("player", () => {
  const spawn = spawnPoint();
  player = createBody({ x: spawn.x + 6, y: spawn.y, w: 20, h: 28 }, PLAYER_CONFIG);
});
reset.add("enemies", () => {
  enemies = enemySpawns().map((point) => ({
    body: createBody({ x: point.x + 6, y: point.y, w: 20, h: 28 }, ENEMY_CONFIG),
    hp: ENEMY_STATS.hp,
    alive: true,
    flashMs: 0,
    mode: "walk",
    modeMs: 0,
    facing: -1,
  }));
});
reset.add("attack", () => {
  attack = { elapsedMs: -1, hasHit: false, facing: 1 };
});
reset.add("dodge", () => {
  dodge = { elapsedMs: -1, cooldownMs: 0, facing: 1 };
});
reset.add("facing", () => {
  facing = 1;
});
reset.add("phase", () => {
  phase = "play";
});
reset.add("hearts", () => {
  hearts = PLAYER_STATS.hearts;
});
reset.add("invulnerable", () => {
  invulnerableMs = 0;
});
reset.add("hitstop", () => {
  hitstopMs = 0;
});
reset.add("shake", () => {
  shakeMs = 0;
});
reset.add("hits", () => {
  hits = 0;
});
reset.add("kills", () => {
  kills = 0;
});
reset.add("simMs", () => {
  simMs = 0;
});
reset.add("commitClock", () => {
  lastCommitMs = -Infinity;
});
reset.add("camera", () => {
  cameraX = 0;
});

reset.run();

function boxOf(body: Body) {
  return { left: body.x, top: body.y, right: body.x + body.w, bottom: body.y + body.h };
}

/** One hit lands: damage, push, flash, and the freeze that makes it read as contact. */
function hitEnemy(enemy: Enemy, from: 1 | -1): void {
  enemy.hp -= ATTACK.damage;
  enemy.flashMs = 140;
  enemy.body.vx = from * ATTACK.knockbackPxPerSecond;
  hitstopMs = ATTACK.hitstopMs;
  shakeMs = 110;
  hits += 1;
  if (canInterrupt(enemy.mode, enemy.modeMs)) {
    // Hitting the tell is the counter: the lunge never happens.
    enemy.mode = "rest";
    enemy.modeMs = 0;
  }
  if (enemy.hp <= 0) {
    enemy.alive = false;
    kills += 1;
    if (enemies.every((each) => !each.alive)) phase = "clear";
  }
}

function hurtPlayer(from: 1 | -1): void {
  hearts -= ENEMY_STATS.contactDamage;
  invulnerableMs = PLAYER_STATS.invulnerableMs;
  player.vx = from * PLAYER_STATS.contactKnockback;
  shakeMs = 160;
  if (hearts <= 0) {
    hearts = 0;
    phase = "down";
  }
}

function stepWorld(dt: number, dtMs: number, moveLeft: boolean, moveRight: boolean, jumpPressed: boolean, jumpHeld: boolean): void {
  // The swing commits: while the blade is out (windup, active, recovery) you cannot steer. That is
  // what makes "attack" a cost instead of a free cancel — without it a player who holds attack wins
  // every exchange, which is exactly what the first measurement showed.
  stepDodge(dodge, dtMs);
  const rolling = dodgeRolling(dodge.elapsedMs);
  // The swing commits and so does the roll: while either is out you cannot steer. The roll is
  // *only* that — a fixed direction at a fixed speed, so spending it early is a real mistake.
  const committed = attack.elapsedMs >= 0 || rolling;
  const left = moveLeft && !committed;
  const right = moveRight && !committed;
  const direction = (right ? 1 : 0) - (left ? 1 : 0);
  if (direction !== 0) facing = direction > 0 ? 1 : -1;

  if (rolling) {
    // Moved by hand: `stepBody` accelerates toward the config's run speed and has no way to be
    // told "this frame is faster", and a roll that is merely a run is not a dodge.
    const next = player.x + dodge.facing * DODGE.speedPxPerSecond * dt;
    if (!solidAt(next, player.y, next + player.w, player.y + player.h)) {
      player.x = next;
    }
    player.vx = 0;
    stepBody(player, {}, dt, solidAt, { grid: TILE });
  } else {
    stepBody(player, { left, right, jump: jumpPressed, jumpHeld }, dt, solidAt, { grid: TILE });
  }

  for (const enemy of enemies) {
    if (!enemy.alive) continue;
    enemy.flashMs = Math.max(0, enemy.flashMs - dtMs);
    enemy.modeMs += dtMs;
    const distance = player.x + player.w / 2 - (enemy.body.x + enemy.body.w / 2);
    const chasing = Math.abs(distance) < ENEMY_STATS.sightPx;

    if (enemy.mode === "walk") {
      const inRange = chasing && Math.abs(distance) <= ENEMY_AI.lungeRangePx && enemy.body.grounded;
      if (inRange && canCommit(simMs, lastCommitMs)) {
        enemy.mode = "windup";
        enemy.modeMs = 0;
        enemy.facing = distance < 0 ? -1 : 1;
        lastCommitMs = simMs;
      } else if (inRange) {
        // In range, but it is not this one's turn. It holds rather than walking through the player
        // — the queue has to be readable, or the rule just looks like a frozen enemy.
        enemy.body.vx = 0;
        stepBody(enemy.body, {}, dt, solidAt, { grid: TILE });
      } else {
        stepBody(enemy.body, { left: chasing && distance < 0, right: chasing && distance > 0 }, dt, solidAt, { grid: TILE });
      }
    } else if (enemy.mode === "windup") {
      enemy.body.vx = 0;
      stepBody(enemy.body, {}, dt, solidAt, { grid: TILE });
      if (enemy.modeMs >= ENEMY_AI.windupMs) {
        enemy.mode = "lunge";
        enemy.modeMs = 0;
      }
    } else if (enemy.mode === "lunge") {
      // Held, not accelerated: the lunge is a fixed distance in a fixed time, so it can be learned.
      enemy.body.vx = enemy.facing * ENEMY_AI.lungeSpeedPxPerSecond;
      stepBody(enemy.body, {}, dt, solidAt, { grid: TILE });
      if (enemy.modeMs >= ENEMY_AI.lungeMs) {
        enemy.mode = "rest";
        enemy.modeMs = 0;
      }
    } else {
      enemy.body.vx = 0;
      stepBody(enemy.body, {}, dt, solidAt, { grid: TILE });
      if (enemy.modeMs >= ENEMY_AI.restMs) {
        enemy.mode = "walk";
        enemy.modeMs = 0;
      }
    }
  }

  if (attack.elapsedMs >= 0) {
    stepAttack(attack, dtMs);
    if (attackPhase(attack.elapsedMs) === "active" && !attack.hasHit) {
      const blade = attackBox(player, attack.facing);
      for (const enemy of enemies) {
        if (enemy.alive && overlapsHalfOpen(blade, boxOf(enemy.body))) {
          hitEnemy(enemy, attack.facing);
          attack.hasHit = true;
          break;
        }
      }
    }
  }

  invulnerableMs = Math.max(0, invulnerableMs - dtMs);
  if (phase === "play" && invulnerableMs === 0 && !dodgeInvulnerable(dodge.elapsedMs)) {
    for (const enemy of enemies) {
      // Only the commit hurts. Brushing past a walking enemy is not a hit — the lunge is the
      // threat, and it is the only thing you have to answer.
      if (enemy.alive && enemy.mode === "lunge" && overlapsHalfOpen(boxOf(player), boxOf(enemy.body))) {
        hurtPlayer(player.x < enemy.body.x ? -1 : 1);
        break;
      }
    }
  }

  // Bodies do not push each other in the library (it has no body-vs-body), and without this the
  // first thing a player does — walk into the enemy — passes straight through it. The enemy is
  // the heavier of the two, so only the player is moved, and only if the push does not put them in
  // a wall.
  for (const enemy of enemies) {
    if (!enemy.alive) continue;
    const me = boxOf(player);
    const them = boxOf(enemy.body);
    if (!overlapsHalfOpen(me, them)) continue;
    const overlapX = Math.min(me.right, them.right) - Math.max(me.left, them.left);
    if (overlapX <= 0) continue;
    const push = (me.left + me.right) / 2 < (them.left + them.right) / 2 ? -overlapX : overlapX;
    const nextX = player.x + push;
    if (!solidAt(nextX, player.y, nextX + player.w, player.y + player.h)) {
      player.x = nextX;
    }
  }

  const aim = Math.min(Math.max(player.x + player.w / 2 - VIEW_W * 0.42, 0), Math.max(0, worldWidth - VIEW_W));
  cameraX = approach(cameraX, aim, dt, { rate: 8 });
  shakeMs = Math.max(0, shakeMs - dtMs);
  simMs += dtMs;
}

function drawTiles(left: number): void {
  // The one column of slack at each edge is this drawing's number (`margin`), not the library's
  // default — the same call the runner makes, so both samples ask the question in one place.
  // `left` is the world x at the left edge of the screen, before the projection rounds it: the
  // margin is a whole column, so a sub-pixel difference cannot change which columns are drawn.
  const view = visibleColumns(currentMap(), left, VIEW_W, { margin: 1 });
  for (let row = 0; row < levelRows(); row += 1) {
    for (let column = view.first; column < view.end; column += 1) {
      if (!isSolidTile(column, row)) continue;
      const above = row > 0 && isSolidTile(column, row - 1);
      paint.rect({ x: column * TILE, y: row * TILE, w: TILE, h: TILE, fill: above ? "#39414f" : "#4a5468" });
      if (!above) {
        paint.rect({ x: column * TILE, y: row * TILE, w: TILE, h: 3, fill: "#5c6880" });
      }
    }
  }
}

function drawHud(): void {
  for (let i = 0; i < PLAYER_STATS.hearts; i += 1) {
    paint.rect({ x: 12 + i * 14, y: 12, w: 10, h: 10, fill: i < hearts ? "#e0574f" : "#3a4150" });
  }
  paint.text({ text: `hits ${hits}  kills ${kills}/${enemies.length}`, x: 12, y: 30, size: 12, font: HUD_FONT, fill: "#9aa5b8" });
  paint.text({ text: "A/D or arrows · Space jump · J attack", x: 12, y: VIEW_H - 22, size: 12, font: HUD_FONT, fill: "#9aa5b8" });
  if (phase === "clear") {
    paint.text({ text: "camp cleared — R to go again", x: VIEW_W / 2 - 130, y: VIEW_H / 2 - 20, size: 16, font: HUD_FONT, fill: "#e8edf6" });
  }
  if (phase === "down") {
    paint.text({ text: "down — R to try again", x: VIEW_W / 2 - 100, y: VIEW_H / 2 - 20, size: 16, font: HUD_FONT, fill: "#e0574f" });
  }
}

function draw(): void {
  paint.clear("#0b0e13");

  // The camera, as three numbers: `round` rounds this one offset, so the tile edges land on whole
  // pixels without rounding every corner of every rectangle into a seam.
  const shake = shakeMs > 0 ? Math.sin(simMs * 0.08) * 3 : 0;
  const left = cameraX + shake;
  paint.setView({ scale: 1, offsetX: -left, offsetY: 0, round: true });
  drawTiles(left);

  for (const enemy of enemies) {
    if (!enemy.alive) continue;
    const tell = enemy.mode === "windup" ? Math.floor(enemy.modeMs / 70) % 2 === 0 : false;
    paint.rect({
      x: enemy.body.x,
      y: enemy.body.y,
      w: enemy.body.w,
      h: enemy.body.h,
      fill: enemy.flashMs > 0 ? "#ffffff" : tell ? "#ff9c6e" : enemy.mode === "lunge" ? "#ff7a5c" : "#e0574f",
    });
    if (enemy.mode === "windup") {
      paint.rect({ x: enemy.body.x - 3, y: enemy.body.y - 3, w: enemy.body.w + 6, h: enemy.body.h + 6, stroke: "#ffd0a8", lineWidth: 2 });
    }
    const pip = enemy.flashMs > 0 ? "#ffd9d6" : "#8f3733";
    for (let i = 0; i < enemy.hp; i += 1) {
      paint.rect({ x: enemy.body.x + i * 5, y: enemy.body.y - 7, w: 4, h: 3, fill: pip });
    }
  }

  if (dodgeRolling(dodge.elapsedMs)) {
    paint.rect({
      x: player.x - dodge.facing * 18,
      y: player.y + 2,
      w: 14,
      h: player.h - 4,
      fill: "rgba(110, 168, 254, 0.28)",
    });
  }

  // Opacity is the one drawing state this game still sets on the context: `draw` has no `alpha`
  // on a rect, because only two of the three samples asked for it.
  const rolling = dodgeRolling(dodge.elapsedMs);
  const blinking = invulnerableMs > 0 && Math.floor(simMs / 90) % 2 === 0;
  if (rolling) ctx.globalAlpha = dodgeInvulnerable(dodge.elapsedMs) ? 0.55 : 0.9;
  if (!blinking) {
    paint.rect({ x: player.x, y: player.y, w: player.w, h: player.h, fill: "#6ea8fe" });
    paint.rect({
      x: facing === 1 ? player.x + player.w - 7 : player.x + 3,
      y: player.y + 6,
      w: 4,
      h: 4,
      fill: "#dbe9ff",
    });
  }
  ctx.globalAlpha = 1;

  const bladePhase = attackPhase(attack.elapsedMs);
  if (bladePhase === "windup" || bladePhase === "active") {
    const blade = attackBox(player, attack.facing);
    paint.rect({
      x: blade.left,
      y: blade.top + 4,
      w: blade.right - blade.left,
      h: blade.bottom - blade.top - 8,
      fill: bladePhase === "active" ? "#ffe9a8" : "#5a5f6b",
    });
  }

  paint.setView(null);
  drawHud();
}

type CampState = {
  phase: Phase;
  x: number;
  y: number;
  hearts: number;
  grounded: boolean;
  hits: number;
  kills: number;
  simMs: number;
  blade: string;
  dodge: "roll" | "idle" | "cooldown";
  hitstopMs: number;
  /** Milliseconds of the last commit, or `null` before the first one (JSON has no `-Infinity`). */
  lastCommitMs: number | null;
  enemy: { x: number; y: number; hp: number; alive: boolean; mode: string } | null;
  enemies: Array<{ x: number; y: number; hp: number; alive: boolean; mode: string }>;
  cameraX: number;
};

function publish(): void {
  const first = enemies[0];
  (window as typeof window & { __campState?: CampState }).__campState = {
    phase,
    x: player.x,
    y: player.y,
    hearts,
    grounded: player.grounded,
    hits,
    kills,
    simMs: Math.round(simMs),
    blade: attackPhase(attack.elapsedMs),
    dodge: dodgeRolling(dodge.elapsedMs) ? "roll" : dodgeReady(dodge) ? "idle" : "cooldown",
    hitstopMs: Math.round(hitstopMs),
    // `-Infinity` is the first-frame value and JSON cannot carry it: `null` means "no commit yet".
    lastCommitMs: Number.isFinite(lastCommitMs) ? Math.round(lastCommitMs) : null,
    enemy: first === undefined ? null : { x: first.body.x, y: first.body.y, hp: first.hp, alive: first.alive, mode: first.mode },
    enemies: enemies.map((each) => ({ x: each.body.x, y: each.body.y, hp: each.hp, alive: each.alive, mode: each.mode })),
    cameraX,
  };
}

const loop = createLoop({
  // A tab that was asleep must not teleport the player through a rock: half the loop's default.
  maxDelta: 0.05,
  onFrame(time) {
    const dt = time.delta;
    const query = actions.tick(new Set(input.snapshot().keys));

    if (query.pressed("retry") && (phase === "down" || phase === "clear")) {
      reset.run();
    }

    const jumping = query.pressed("jump");
    const holdingJump = query.down("jump");

    if (phase === "play") {
      if (query.pressed("attack") && attack.elapsedMs < 0) {
        beginAttack(attack, facing);
      }
      if (query.pressed("dodge") && dodgeReady(dodge)) {
        beginDodge(dodge, facing);
      }
      if (hitstopMs > 0) {
        // Contact freeze: the world stops, the clock does not, so the hit reads as impact.
        hitstopMs = Math.max(0, hitstopMs - dt * 1000);
        simMs += dt * 1000;
      } else {
        stepWorld(dt, dt * 1000, query.down("left"), query.down("right"), jumping, holdingJump);
      }
    }

    draw();
    publish();
  },
});

loop.start();

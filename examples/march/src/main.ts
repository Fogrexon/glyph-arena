/**
 * March — the road, not the room.
 *
 * CAMP asks "when do I commit" in a room you cannot leave. This asks the same question while the
 * road keeps going: there is always an enemy in front of you, and the only two ways past are to
 * fight it or to go by it. That second option is the whole game.
 *
 * **Pushing into an enemy hurts, in every mode.** CAMP only damaged on a lunge, so walking into an
 * enemy was free and the fight had one answer. Here a body is a wall with a price: shoving into one
 * costs a heart, standing beside one is free, and rolling through costs nothing if the window is
 * spent at the right moment. So every beat is a real question — pay time, pay a heart, or pay the
 * roll's cooldown — and the run is one minute of answering it eleven times.
 *
 * Everything about tiles is the library's (`solidAt`), everything about a body is the library's
 * (`stepBody`), and the numbers that decide how it feels sit at the top of `combat.ts` /
 * `enemy.ts` or here.
 */
import { createActions } from "@fogrexon/glyph-arena-actions";
import { createBody, stepBody, type Body, type BodyConfig } from "@fogrexon/glyph-arena-body";
import { createInput } from "@fogrexon/glyph-arena-input";
import { createLoop } from "@fogrexon/glyph-arena-loop";
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
import {
  TILE,
  currentMap,
  enemySpawns,
  goalX,
  isSolidTile,
  levelColumns,
  levelRows,
  solidAt,
  spawnPoint,
} from "./level";
import { ENEMY_SIZE, PLAYER_SIZE } from "./sizes";

const VIEW_W = 640;
const VIEW_H = 360;

/** The player's feel, the same family as CAMP's: the road should not feel like a different game. */
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

/** The enemy is the same body as CAMP's: it can never outrun you, only hold the road. */
const ENEMY_CONFIG: BodyConfig = { ...PLAYER_CONFIG, runSpeed: 74, runAccel: 900, airAccel: 500, jumpVelocity: -520 };

/**
 * Four hearts for eleven beats, and the number the two strategies are measured against.
 *
 * Five survived everything in CAMP because a room ends. A road does not: the cost of going by an
 * enemy is paid *per enemy*, so the pool has to be small enough that "go by all of them" runs out
 * and large enough that one mistake is not the run. Four is three passes and one mistake.
 */
const PLAYER_STATS = { hearts: 4, invulnerableMs: 900, contactKnockback: 320 };
/**
 * Three, not the four CAMP uses. The fight is the same fight, but it is played eleven times down a
 * road instead of twice in a room: measured with four, the careful crossing took 84.5 s, and a
 * one-minute game that takes a minute and a half is not one. Four swings per guard is 44 swings;
 * three is 33, and the road lands inside the minute without moving a single timing.
 */
const ENEMY_STATS = { hp: 3, contactDamage: 1 };

/** How long the result stands before mashing a play button counts as "again". */
const RESTART_AFTER_MS = 350;

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

const input = createInput();
input.attach(window);
const actions = createActions();
actions.bind("left", ["ArrowLeft", "KeyA"]);
actions.bind("right", ["ArrowRight", "KeyD"]);
actions.bind("jump", ["Space", "ArrowUp", "KeyW", "KeyZ"]);
actions.bind("attack", ["KeyJ", "KeyX"]);
actions.bind("dodge", ["ShiftLeft", "ShiftRight", "KeyL"]);
actions.bind("retry", ["KeyR", "Enter"]);

type Phase = "play" | "clear" | "down";

/** How a heart was lost. The one number this game exists to produce. */
type Cause = "passing" | "fighting";

type Hit = { atMs: number; x: number; cause: Cause; mode: EnemyMode };

type Enemy = {
  body: Body;
  homeX: number;
  hp: number;
  alive: boolean;
  flashMs: number;
  mode: EnemyMode;
  modeMs: number;
  facing: 1 | -1;
  /** Has the player ever been past this one? Decides whether a hit was fighting or passing. */
  passed: boolean;
};

let player: Body = createBody({ x: 0, y: 0, ...PLAYER_SIZE }, PLAYER_CONFIG);
let enemies: Enemy[] = [];
let attack: Attack = { elapsedMs: -1, hasHit: false, facing: 1 };
let dodge: Dodge = { elapsedMs: -1, cooldownMs: 0, facing: 1 };
let facing: 1 | -1 = 1;

let phase: Phase = "play";
let hearts = PLAYER_STATS.hearts;
let invulnerableMs = 0;
let hitstopMs = 0;
let shakeMs = 0;
let kills = 0;
let passes = 0;
let simMs = 0;
let restartMs = 0;
let lastCommitMs = -Infinity;
let cameraX = 0;
let hits: Hit[] = [];
/** When the previous run ended, so "again" has something to beat. */
let lastRunMs: number | null = null;
/** How many runs have been started. Instant retry is measured as "one press, one run". */
let runs = 1;

const worldWidth = levelColumns() * TILE;
const worldHeight = levelRows() * TILE;
const GOAL_X = goalX();

/** Put the road back to its first frame. Called on boot, and on every retry — never by reload. */
function reset(): void {
  const spawn = spawnPoint();
  // Bodies are placed by their feet: the cell is where the body *stands*, not where it starts.
  player = createBody({ x: spawn.x + 6, y: spawn.y + TILE - PLAYER_SIZE.h, ...PLAYER_SIZE }, PLAYER_CONFIG);
  enemies = enemySpawns().map((point) => ({
    body: createBody({ x: point.x + 6, y: point.y + TILE - ENEMY_SIZE.h, ...ENEMY_SIZE }, ENEMY_CONFIG),
    homeX: point.x + 6,
    hp: ENEMY_STATS.hp,
    alive: true,
    flashMs: 0,
    mode: "walk",
    modeMs: 0,
    facing: -1,
    passed: false,
  }));
  attack = { elapsedMs: -1, hasHit: false, facing: 1 };
  dodge = { elapsedMs: -1, cooldownMs: 0, facing: 1 };
  facing = 1;
  phase = "play";
  hearts = PLAYER_STATS.hearts;
  invulnerableMs = 0;
  hitstopMs = 0;
  shakeMs = 0;
  kills = 0;
  passes = 0;
  simMs = 0;
  restartMs = 0;
  lastCommitMs = -Infinity;
  cameraX = 0;
  hits = [];
}
reset();

function boxOf(body: Body) {
  return { left: body.x, top: body.y, right: body.x + body.w, bottom: body.y + body.h };
}

function endRun(next: "clear" | "down"): void {
  phase = next;
  restartMs = 0;
  lastRunMs = Math.round(simMs);
}

/** One hit lands: damage, push, flash, and the freeze that makes it read as contact. */
function hitEnemy(enemy: Enemy, from: 1 | -1): void {
  enemy.hp -= ATTACK.damage;
  enemy.flashMs = 140;
  enemy.body.vx = from * ATTACK.knockbackPxPerSecond;
  hitstopMs = ATTACK.hitstopMs;
  shakeMs = 110;
  if (canInterrupt(enemy.mode, enemy.modeMs)) {
    // Hitting the tell is the counter: the lunge never happens.
    enemy.mode = "rest";
    enemy.modeMs = 0;
  }
  if (enemy.hp <= 0) {
    enemy.alive = false;
    kills += 1;
  }
}

/**
 * Contact, from anywhere, in any mode.
 *
 * The cause is not read off the current mode, it is read off the body: a hit taken while you were
 * running at the goal is the price of going by, and a hit taken while you stood your ground is the
 * fight. That is the one number the run has to produce, and it is derived rather than declared at
 * the call site, because the call site does not know which way you were going a frame ago.
 */
function hurtPlayer(enemy: Enemy): void {
  // Which way were you going when it landed? Read before the knockback, which overwrites `vx`.
  const goingBy = player.vx > 60;
  hearts -= ENEMY_STATS.contactDamage;
  invulnerableMs = PLAYER_STATS.invulnerableMs;
  player.vx = player.x + player.w / 2 < enemy.body.x + enemy.body.w / 2 ? -PLAYER_STATS.contactKnockback : PLAYER_STATS.contactKnockback;
  hitstopMs = ATTACK.hitstopMs;
  shakeMs = 160;
  hits.push({ atMs: Math.round(simMs), x: Math.round(player.x), cause: goingBy ? "passing" : "fighting", mode: enemy.mode });
  if (hearts <= 0) {
    hearts = 0;
    endRun("down");
  }
}

function stepWorld(dt: number, dtMs: number, moveLeft: boolean, moveRight: boolean, jumpPressed: boolean, jumpHeld: boolean): void {
  stepDodge(dodge, dtMs);
  const rolling = dodgeRolling(dodge.elapsedMs);
  const invulnerable = dodgeInvulnerable(dodge.elapsedMs);
  // The swing commits and so does the roll: while either is out you cannot steer.
  const committed = attack.elapsedMs >= 0 || rolling;
  const left = moveLeft && !committed;
  const right = moveRight && !committed;
  const direction = (right ? 1 : 0) - (left ? 1 : 0);
  if (direction !== 0) facing = direction > 0 ? 1 : -1;

  if (rolling) {
    // Moved by hand: `stepBody` accelerates toward the config's run speed and has no way to be told
    // "this frame is faster". The roll is the only way through a body, so it is not a run.
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
    const chasing = Math.abs(distance) < ENEMY_AI.sightPx;

    if (enemy.mode === "walk") {
      // **A guard holds his post.** CAMP's enemy walks you down, which is right in a room and wrong
      // on a road: measured, a bot playing the proven waiting game was walked from the first
      // guard back into the spawn wall in two cycles and died there, four hearts before the first
      // kill. It never lost a fight it could retreat from — it ran out of road. Standing still
      // bounds the retreat to one commit's length, keeps every fight where it started, and makes
      // "go past" a question about his body rather than about his legs.
      enemy.body.vx = 0;
      stepBody(enemy.body, {}, dt, solidAt, { grid: TILE });
      const inRange = chasing && Math.abs(distance) <= ENEMY_AI.lungeRangePx && enemy.body.grounded;
      if (inRange && canCommit(simMs, lastCommitMs)) {
        enemy.mode = "windup";
        enemy.modeMs = 0;
        enemy.facing = distance < 0 ? -1 : 1;
        lastCommitMs = simMs;
      } else if (chasing) {
        enemy.facing = distance < 0 ? -1 : 1;
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
  if (phase === "play" && invulnerableMs === 0 && !invulnerable) {
    for (const enemy of enemies) {
      if (!enemy.alive || !overlapsHalfOpen(boxOf(player), boxOf(enemy.body))) continue;
      // **Only a body that is being pushed into costs a heart.** The first version made any
      // contact damage, and the fight it produced was not a fight: measured, a bot playing CAMP's
      // proven waiting game — stand outside the lunge, spend the rest — took four hearts before it
      // could kill one guard, because a guard walking into a standing body counted as a hit. The
      // road's question is "can I get by", not "may I stand next to you": a guard you are not
      // pushing is a wall, and a wall is free. What costs is trying to go through him, which is
      // exactly what the fast road does.
      const pushing =
        (player.vx > 60 && enemy.body.x + enemy.body.w > player.x) ||
        (player.vx < -60 && enemy.body.x < player.x + player.w);
      if (!pushing) continue;
      hurtPlayer(enemy);
      break;
    }
  }

  // Bodies do not push each other in the library (it has no body-vs-body). The enemy is the heavier
  // of the two, so only the player is moved — except for the whole of a roll, which is the one
  // thing in the game that crosses a body.
  //
  // **The whole of it, not just the window.** Exempting only the 140 ms of invulnerability left the
  // last 40 ms of the roll being shoved back out of the guard, so a roll could never finish a
  // crossing: measured, the fast bot spent two rolls per guard, was pushed back out of every one,
  // and died on the tenth. The window is what stops damage; the roll is what stops the wall.
  if (!rolling) {
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
  }

  for (const enemy of enemies) {
    if (!enemy.alive || enemy.passed) continue;
    if (player.x > enemy.body.x + enemy.body.w) {
      enemy.passed = true;
      passes += 1;
    }
  }

  if (phase === "play" && player.x + player.w / 2 >= GOAL_X) {
    endRun("clear");
  }

  const aim = Math.min(Math.max(player.x + player.w / 2 - VIEW_W * 0.42, 0), Math.max(0, worldWidth - VIEW_W));
  cameraX = approach(cameraX, aim, dt, { rate: 8 });
  shakeMs = Math.max(0, shakeMs - dtMs);
  simMs += dtMs;
}

function clockOf(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function drawTiles(fromX: number): void {
  const view = visibleColumns(currentMap(), fromX, VIEW_W, { margin: 1 });
  for (let row = 0; row < levelRows(); row += 1) {
    for (let column = view.first; column < view.end; column += 1) {
      if (!isSolidTile(column, row)) continue;
      const above = row > 0 && isSolidTile(column, row - 1);
      ctx.fillStyle = above ? "#39414f" : "#4a5468";
      ctx.fillRect(column * TILE - fromX, row * TILE, TILE, TILE);
      if (!above) {
        ctx.fillStyle = "#5c6880";
        ctx.fillRect(column * TILE - fromX, row * TILE, TILE, 3);
      }
    }
  }
}

function drawGoal(fromX: number): void {
  const x = GOAL_X - fromX;
  if (x < -8 || x > VIEW_W + 8) return;
  ctx.fillStyle = "rgba(122, 206, 154, 0.22)";
  ctx.fillRect(x - 2, 0, 44, VIEW_H);
  ctx.fillStyle = "#7ace9a";
  ctx.fillRect(x, 0, 3, VIEW_H);
}

function drawHud(): void {
  // The road, as a bar: where you are is the one thing a scrolling run has to say at a glance.
  const span = Math.max(1, GOAL_X - spawnPoint().x);
  const progress = Math.min(1, Math.max(0, (player.x - spawnPoint().x) / span));
  ctx.fillStyle = "#1b212c";
  ctx.fillRect(12, 12, VIEW_W - 24, 3);
  ctx.fillStyle = "#7ace9a";
  ctx.fillRect(12, 12, Math.round((VIEW_W - 24) * progress), 3);
  for (const enemy of enemies) {
    if (!enemy.alive) continue;
    const at = 12 + Math.round((VIEW_W - 24) * Math.min(1, Math.max(0, (enemy.body.x - spawnPoint().x) / span)));
    ctx.fillStyle = enemy.passed ? "#5a6478" : "#e0574f";
    ctx.fillRect(at - 1, 9, 2, 9);
  }

  ctx.font = "12px ui-monospace, monospace";
  ctx.textBaseline = "top";
  for (let i = 0; i < PLAYER_STATS.hearts; i += 1) {
    ctx.fillStyle = i < hearts ? "#e0574f" : "#3a4150";
    ctx.fillRect(12 + i * 14, 26, 10, 10);
  }
  ctx.fillStyle = "#9aa5b8";
  ctx.fillText(`${clockOf(simMs)}   passed ${passes}/${enemies.length}   killed ${kills}`, 12, 42);

  if (phase === "play") {
    ctx.fillStyle = "#6b7688";
    ctx.fillText("A/D run · Space jump · J attack · Shift roll · touching a body hurts", 12, VIEW_H - 22);
  }
  if (phase === "clear" || phase === "down") {
    const total = hits.length;
    const passing = hits.filter((hit) => hit.cause === "passing").length;
    ctx.fillStyle = phase === "clear" ? "#7ace9a" : "#e0574f";
    ctx.font = "16px ui-monospace, monospace";
    ctx.fillText(
      phase === "clear" ? `through  ${clockOf(simMs)}` : `down  ${clockOf(simMs)}`,
      VIEW_W / 2 - 90,
      VIEW_H / 2 - 34,
    );
    ctx.fillStyle = "#9aa5b8";
    ctx.font = "12px ui-monospace, monospace";
    ctx.fillText(
      `passed ${passes}/${enemies.length} · killed ${kills} · hits ${total} (${passing} from behind)`,
      VIEW_W / 2 - 170,
      VIEW_H / 2 - 6,
    );
    if (lastRunMs !== null) {
      ctx.fillText(`R to go again — last run ${clockOf(lastRunMs)}`, VIEW_W / 2 - 130, VIEW_H / 2 + 18);
    }
  }
}

function draw(): void {
  ctx.fillStyle = "#0b0e13";
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  const shake = shakeMs > 0 ? Math.sin(simMs * 0.08) * 3 : 0;
  const fromX = Math.round(cameraX + shake);
  drawTiles(fromX);
  drawGoal(fromX);

  for (const enemy of enemies) {
    if (!enemy.alive) continue;
    const x = enemy.body.x - fromX;
    const tell = enemy.mode === "windup" ? Math.floor(enemy.modeMs / 70) % 2 === 0 : false;
    ctx.fillStyle = enemy.flashMs > 0 ? "#ffffff" : tell ? "#ff9c6e" : enemy.mode === "lunge" ? "#ff7a5c" : enemy.passed ? "#8a4a48" : "#e0574f";
    ctx.fillRect(x, enemy.body.y, enemy.body.w, enemy.body.h);
    if (enemy.mode === "windup") {
      ctx.strokeStyle = "#ffd0a8";
      ctx.lineWidth = 2;
      ctx.strokeRect(x - 3, enemy.body.y - 3, enemy.body.w + 6, enemy.body.h + 6);
    }
    ctx.fillStyle = enemy.flashMs > 0 ? "#ffd9d6" : "#8f3733";
    for (let i = 0; i < enemy.hp; i += 1) ctx.fillRect(x + i * 5, enemy.body.y - 7, 4, 3);
  }

  const rolling = dodgeRolling(dodge.elapsedMs);
  if (rolling) {
    ctx.fillStyle = "rgba(110, 168, 254, 0.28)";
    ctx.fillRect(player.x - fromX - dodge.facing * 18, player.y + 2, 14, player.h - 4);
  }

  const blinking = invulnerableMs > 0 && Math.floor(simMs / 90) % 2 === 0;
  if (rolling) ctx.globalAlpha = dodgeInvulnerable(dodge.elapsedMs) ? 0.55 : 0.9;
  if (!blinking) {
    ctx.fillStyle = "#6ea8fe";
    ctx.fillRect(player.x - fromX, player.y, player.w, player.h);
    ctx.fillStyle = "#dbe9ff";
    ctx.fillRect(facing === 1 ? player.x - fromX + player.w - 7 : player.x - fromX + 3, player.y + 6, 4, 4);
  }
  ctx.globalAlpha = 1;

  const bladePhase = attackPhase(attack.elapsedMs);
  if (bladePhase === "windup" || bladePhase === "active") {
    const blade = attackBox(player, attack.facing);
    ctx.fillStyle = bladePhase === "active" ? "#ffe9a8" : "#5a5f6b";
    ctx.fillRect(blade.left - fromX, blade.top + 4, blade.right - blade.left, blade.bottom - blade.top - 8);
  }

  drawHud();
}

type MarchState = {
  phase: Phase;
  x: number;
  y: number;
  vx: number;
  facing: 1 | -1;
  hearts: number;
  grounded: boolean;
  kills: number;
  passes: number;
  simMs: number;
  goalX: number;
  progress: number;
  blade: string;
  dodge: "roll" | "idle" | "cooldown";
  cameraX: number;
  runs: number;
  lastRunMs: number | null;
  hits: Hit[];
  enemies: Array<{ x: number; y: number; hp: number; alive: boolean; mode: string; modeMs: number; passed: boolean }>;
};

function publish(): void {
  (window as typeof window & { __marchState?: MarchState }).__marchState = {
    phase,
    x: player.x,
    y: player.y,
    vx: player.vx,
    facing,
    hearts,
    grounded: player.grounded,
    kills,
    passes,
    simMs: Math.round(simMs),
    goalX: GOAL_X,
    progress: GOAL_X === 0 ? 1 : Math.min(1, player.x / GOAL_X),
    blade: attackPhase(attack.elapsedMs),
    dodge: dodgeRolling(dodge.elapsedMs) ? "roll" : dodgeReady(dodge) ? "idle" : "cooldown",
    cameraX,
    runs,
    lastRunMs,
    hits,
    enemies: enemies.map((each) => ({
      x: each.body.x,
      y: each.body.y,
      hp: each.hp,
      alive: each.alive,
      mode: each.mode,
      modeMs: Math.round(each.modeMs),
      passed: each.passed,
    })),
  };
}

const loop = createLoop({
  // A tab that was asleep must not teleport the player through the road: half the loop's default.
  maxDelta: 0.05,
  onFrame(time) {
    const dt = time.delta;
    const query = actions.tick(new Set(input.snapshot().keys));

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
        stepWorld(dt, dt * 1000, query.down("left"), query.down("right"), query.pressed("jump"), query.down("jump"));
      }
    } else {
      // Instant retry: the run is reset in the frame the button is read, never by reloading the page
      // — a one-minute game whose next run costs a page load does not get a next run.
      restartMs += dt * 1000;
      const mashes = query.pressed("attack") || query.pressed("jump") || query.pressed("dodge");
      if (query.pressed("retry") || (restartMs >= RESTART_AFTER_MS && mashes)) {
        runs += 1;
        reset();
      }
    }

    draw();
    publish();
  },
});

loop.start();

#!/usr/bin/env node
/**
 * One complete run of the parry demo, played by a mechanical player.
 *
 * The E2E check (I11) only has time for five waves, so nobody had seen the end
 * of a run. This script plays all 20 waves and reports what happened: which
 * wave cost a life, how many enemies were closing at once, how wide the window
 * was, and whether the result screen arrived at all.
 *
 * The player rule is the one a human uses:
 *
 *   1. face the soonest threat (`threats[0]`) and keep facing it,
 *   2. press the dash once `ms <= windowMs + dashMs`,
 *   3. after a parry, step ~30 px sideways off the *next* threat's approach
 *      line instead of running at it. Measured: clearing that offset costs
 *      ~204 ms and the next enemy arrives 900 ms later, so it is affordable.
 *
 * Before step 3 existed the player lost a life on the waves where two enemies
 * close together: its facing *is* its movement, so it rode one enemy's line
 * straight into the other.
 *
 * Usage:
 *   node scripts/measure-parry-run.mjs --url https://example/parry/ [--chromium /usr/bin/chromium]
 *   node scripts/measure-parry-run.mjs              # serves examples/parry/dist locally
 */
import { existsSync } from "node:fs";
import { dirname, extname, join, normalize } from "node:path";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PARRY_DIST = join(ROOT, "examples/parry/dist");
const PORT = 4821;
const TIMEOUT_MS = 90_000;

const argv = process.argv.slice(2);

/** `--name=value` or `--name value`. */
const arg = (name) => {
  const inline = argv.find((a) => a.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = argv.indexOf(`--${name}`);
  return index >= 0 && argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[index + 1] : null;
};

/** Static server for the local build, so the script works with no network. */
async function serveDist(dir) {
  const types = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
  };
  const server = createServer(async (req, res) => {
    const path = decodeURIComponent((req.url ?? "/").split("?")[0]);
    const file = normalize(join(dir, path === "/" ? "index.html" : path));
    if (!file.startsWith(dir)) {
      res.writeHead(403).end();
      return;
    }
    try {
      const body = await readFile(file);
      res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" }).end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(PORT, "127.0.0.1", resolve));
  return server;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Arrow keys for a unit direction -- the thresholds the E2E player uses. */
function arrowsFor(dx, dy) {
  const keys = [];
  if (dy > 0.35) keys.push("ArrowDown");
  else if (dy < -0.35) keys.push("ArrowUp");
  if (dx > 0.35) keys.push("ArrowRight");
  else if (dx < -0.35) keys.push("ArrowLeft");
  return keys;
}

async function main() {
  const chromiumPath = arg("chromium") ?? process.env.CHROMIUM_PATH ?? undefined;
  let server = null;
  let url = arg("url");
  if (!url) {
    if (!existsSync(join(PARRY_DIST, "index.html"))) {
      throw new Error(`no built parry demo at ${PARRY_DIST} -- run \`pnpm -r build\`, or pass --url`);
    }
    server = await serveDist(PARRY_DIST);
    url = `http://127.0.0.1:${PORT}/`;
  }

  const browser = await chromium.launch({
    executablePath: chromiumPath,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  const held = new Set();
  const hold = async (keys) => {
    for (const key of held) if (!keys.includes(key)) await page.keyboard.up(key);
    for (const key of keys) if (!held.has(key)) await page.keyboard.down(key);
    held.clear();
    for (const key of keys) held.add(key);
  };
  const releaseAll = async () => {
    for (const key of held) await page.keyboard.up(key);
    held.clear();
  };
  const press = async () => {
    await page.keyboard.down("ShiftLeft");
    await sleep(140);
    await page.keyboard.up("ShiftLeft");
  };

  const waves = new Map();
  const lifeLosses = [];
  let lastParried = 0;
  let lastWave = -1;
  let lastLives = null;
  let dodgeUntil = 0;
  let dodgeKeys = [];
  let parryLockUntil = 0;
  let startMs = null;
  let resultMs = null;
  let finalState = null;
  let lastState = null;
  let presses = 0;

  try {
    await page.goto(url, { waitUntil: "load", timeout: 30000 });
    await sleep(700);
    await hold(["Space"]);
    await sleep(160);
    await releaseAll();

    const deadline = Date.now() + TIMEOUT_MS;
    while (Date.now() < deadline) {
      const s = await page.evaluate(() => window.__parryState ?? null);
      if (!s) {
        await sleep(30);
        continue;
      }
      lastState = s;
      if (startMs === null && s.phase === "play") startMs = Date.now();

      if (s.wave !== lastWave) {
        lastWave = s.wave;
        waves.set(s.wave, {
          wave: s.wave,
          startedAt: startMs === null ? null : Date.now() - startMs,
          windowMs: s.windowMs,
          maxThreats: Array.isArray(s.threats) ? s.threats.length : 0,
          livesAt: s.lives,
          parriedAt: s.parried,
        });
      }
      const row = waves.get(s.wave);
      if (row && Array.isArray(s.threats) && s.threats.length > row.maxThreats) row.maxThreats = s.threats.length;

      if (lastLives !== null && s.lives < lastLives) {
        lifeLosses.push({
          wave: s.wave,
          windowMs: s.windowMs,
          threats: Array.isArray(s.threats) ? s.threats.length : 0,
          lives: s.lives,
        });
      }
      lastLives = s.lives;

      if (s.phase === "result") {
        resultMs = Date.now();
        finalState = s;
        break;
      }
      if (s.phase !== "play") {
        await sleep(30);
        continue;
      }

      // A parry just landed: step off the next enemy's line instead of charging it.
      if (s.parried > lastParried) {
        lastParried = s.parried;
        parryLockUntil = Date.now() + 120;
        const next = Array.isArray(s.threats) && s.threats.length > 0 ? s.threats[0] : null;
        if (next) {
          let px = -next.dirY;
          let py = next.dirX;
          const other = s.threats[1];
          if (other && px * other.dirX + py * other.dirY > 0) {
            // Both enemies close to the same line: leave on the side the second one is not on.
            px = -px;
            py = -py;
          }
          dodgeKeys = arrowsFor(px, py);
          dodgeUntil = Date.now() + 150; // 30 px at MOVE_SPEED 210 px/s ~= 143 ms
        }
      }

      if (Date.now() < dodgeUntil) {
        await hold(dodgeKeys);
        await sleep(20);
        continue;
      }

      const threat = Array.isArray(s.threats) && s.threats.length > 0 ? s.threats[0] : null;
      if (threat) {
        await hold(arrowsFor(threat.dirX, threat.dirY));
        if (Date.now() > parryLockUntil && threat.ms <= s.windowMs + s.dashMs) {
          presses += 1;
          await press();
          parryLockUntil = Date.now() + 260;
        }
      } else {
        await releaseAll();
      }
      await sleep(20);
    }
  } finally {
    finalState = finalState ?? lastState;
    if (startMs !== null && resultMs === null) resultMs = Date.now();
    await releaseAll();
    await browser.close();
    server?.close();
  }

  const reached = finalState?.phase === "result";
  const cleared = reached && (finalState?.lives ?? 0) > 0;
  const rows = [...waves.values()].sort((a, b) => a.wave - b.wave);
  // A wave that was never answered: `parried` did not move before the next wave began.
  const unanswered = rows.filter((row, index) => {
    const next = rows[index + 1];
    const parriedAfterWave = next ? next.parriedAt : (finalState?.parried ?? row.parriedAt);
    return parriedAfterWave <= row.parriedAt;
  });

  console.log(`url: ${url}`);
  console.log(`reached result: ${reached}${reached ? ` (${cleared ? "CLEAR" : "FAIL"})` : ""}`);
  console.log(
    `run length: ${resultMs && startMs ? ((resultMs - startMs) / 1000).toFixed(1) : "?"}s` +
      (resultMs && startMs ? "" : ` (gave up after ${TIMEOUT_MS / 1000}s)`),
  );
  console.log(
    `parried: ${finalState?.parried ?? "?"} from ${presses} presses, lives: ${finalState?.lives ?? "?"}, wave: ${finalState?.wave ?? "?"}`,
  );
  const best = finalState?.best ?? null;
  console.log(
    best === null
      ? "best: none yet (no run has finished)"
      : `best: ${best.parried} parries, ${best.lives} lives, ${best.clearMs === null ? "no clear" : `${(best.clearMs / 1000).toFixed(1)}s clear`}`,
  );
  console.log("wave | windowMs | maxThreats | livesAt | parriedAt");
  for (const row of rows) {
    console.log(
      `${String(row.wave).padStart(4)} | ${String(row.windowMs).padStart(8)} | ${String(row.maxThreats).padStart(10)} | ${String(row.livesAt).padStart(7)} | ${String(row.parriedAt).padStart(9)}`,
    );
  }
  console.log(`unanswered waves (no parry landed): ${unanswered.length === 0 ? "none" : unanswered.map((r) => r.wave).join(", ")}`);
  console.log(`life losses: ${lifeLosses.length === 0 ? "none" : ""}`);
  for (const loss of lifeLosses) {
    console.log(`  wave ${loss.wave}: windowMs ${loss.windowMs}, threats ${loss.threats}, lives ${loss.lives + 1}->${loss.lives}`);
  }
  if (!reached) {
    const lastRow = rows[rows.length - 1];
    if (lastRow?.startedAt != null) {
      console.log(
        `last wave ${lastRow.wave} began at ${(lastRow.startedAt / 1000).toFixed(1)}s and the run was still on it ${(TIMEOUT_MS / 1000).toFixed(0)}s after the start`,
      );
    }
    // `clear()` needs every enemy gone, and an enemy is only removed by a parry: one that slides
    // past is never removed, so a run that misses a wave can never reach the result screen.
    console.log(
      `no result screen: phase stayed "play" at wave ${finalState?.wave ?? "?"} with ${finalState?.lives ?? "?"} lives -- ` +
        "a missed enemy stays in the run and blocks the clear condition",
    );
  }
  if (consoleErrors.length > 0) console.log(`console errors: ${consoleErrors.length}\n  ${consoleErrors.join("\n  ")}`);
  process.exitCode = reached ? 0 : 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

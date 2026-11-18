#!/usr/bin/env node
/**
 * The outside reader's path, end to end, against the **packed tarball** (CI step 12).
 *
 * Every other gate runs against this workspace: `tsconfig` `paths` map the umbrella to `src/`, and
 * the fixtures import it through workspace links. That is not what a reader gets. They get
 * `npm install @fogrexon/glyph-arena`, which resolves to the tarball's `dist/`, and today that gap
 * has already produced a false green — the docs described four functions a released version did not
 * export, and every workspace gate stayed green because the workspace had them.
 *
 * So this gate builds the artifact the way npm does and checks the two documents a reader copies:
 *
 *   P1 `pnpm pack` produces a tarball that ships `dist/index.js` and `dist/index.d.ts`
 *   P2 the tarball installs **offline** into an empty project — no workspace links, no `paths`
 *   P3 both programs (`docs/tutorial.md`'s "The whole file" and the umbrella `README.md`'s example)
 *      typecheck in that project, against the installed declarations
 *   P4 the tutorial's program is emitted and **runs in a browser** — the canvas is read, so a
 *      broken `dist` cannot hide behind types that happen to be right
 *   P5 no console or page errors, and every asset the page asked for was served
 *   P6 the same two programs, compiled against the version **npm serves** — red when that version
 *      is this workspace's own, and a named wait when a release is staged (see the block)
 *
 * The emitted JavaScript keeps the bare specifier and the page resolves it with an import map, so
 * nothing here is bundled — the bytes the browser runs are the ones npm installed.
 *
 * Usage: `pnpm e2e:published` (needs a built `packages/`). `E2E_CHROMIUM=/path/to/chrome`
 * overrides the browser, exactly like the other gates.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { chromium } from "playwright-core";

import { requireFresh } from "./lib/build-stamp.mjs";
import { singleProgram } from "./lib/markdown-program.mjs";
import { serveDist } from "./lib/static-server.mjs";
import { wholeFileProgram } from "./lib/tutorial.mjs";

const HERE = import.meta.dirname ?? new URL(".", import.meta.url).pathname;
const ROOT = resolve(HERE, "..");
const UMBRELLA = join(ROOT, "packages", "glyph-arena");
const TSC = join(ROOT, "node_modules", ".bin", "tsc");
const PORT = Number(process.env.E2E_PUBLISHED_PORT ?? 4323);

const CLEAR = [13, 22, 38]; // "#0d1626"
const SOLID = [42, 53, 80]; // "#2a3550"
const PLAYER = [247, 179, 43]; // "#f7b32b"

const failures = [];

const firstLine = (error) => String(error?.message ?? error).split("\n")[0];

function check(ok, name, detail) {
  if (ok) {
    console.log(`PASS ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function run(command, args, cwd) {
  return execFileSync(command, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

/** Count frames by wrapping rAF before the page's own script runs. */
const COUNT_FRAMES = `(() => {
  let frames = 0;
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (callback) => raf((time) => {
    frames += 1;
    return callback(time);
  });
  window.__frames = () => frames;
})();`;

const SAMPLE = `(() => {
  const canvas = document.querySelector("#game");
  if (!canvas) return { error: "no #game canvas" };
  const context = canvas.getContext("2d");
  if (!context) return { error: "no 2d context" };

  const { width, height } = canvas;
  const { data } = context.getImageData(0, 0, width, height);
  const counts = { clear: 0, solid: 0, player: 0 };
  let solidX = 0;
  let minX = width;
  let maxX = -1;

  for (let index = 0; index < data.length; index += 4) {
    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];
    const pixel = (index / 4) % width;

    if (r === ${CLEAR[0]} && g === ${CLEAR[1]} && b === ${CLEAR[2]}) counts.clear += 1;
    else if (r === ${SOLID[0]} && g === ${SOLID[1]} && b === ${SOLID[2]}) {
      counts.solid += 1;
      solidX += pixel;
    } else if (r === ${PLAYER[0]} && g === ${PLAYER[1]} && b === ${PLAYER[2]}) {
      counts.player += 1;
      if (pixel < minX) minX = pixel;
      if (pixel > maxX) maxX = pixel;
    }
  }

  return {
    width,
    height,
    counts,
    body: maxX >= 0 ? { minX, maxX } : null,
    solidCentreX: counts.solid > 0 ? solidX / counts.solid : null,
    frames: window.__frames?.() ?? null,
  };
})()`;

async function main() {
  const work = mkdtempSync(join(tmpdir(), "glyph-published-"));
  const tarballDir = join(work, "tarballs");
  const project = join(work, "project");
  mkdirSync(tarballDir, { recursive: true });
  mkdirSync(project, { recursive: true });

  try {
    // ---- P1: pack the umbrella exactly as npm receives it --------------------
    // `pack` runs the umbrella's `prepack`, which rebuilds `dist` from `packages/*/src` — that is
    // what keeps the tarball current, and it is the whole reason this gate cannot test a stale
    // build. Deleting `dist` first makes that a live test instead of an assumption: a fresh clone
    // has no `dist`, so a package whose `prepack` disappeared packs an empty shell here, rather
    // than silently shipping whatever `dist` happened to be lying around (which would still pass
    // P1 and then run old code in P4).
    rmSync(join(UMBRELLA, "dist"), { recursive: true, force: true });
    const packed = run("pnpm", ["pack", "--pack-destination", tarballDir], UMBRELLA);
    const tarball = packed
      .split("\n")
      .map((line) => line.trim())
      .reverse()
      .find((line) => line.endsWith(".tgz"));
    if (!tarball) throw new Error(`pnpm pack did not report a tarball:\n${packed}`);

    // The pack rebuilt `dist/` through `prepack`, so the stamp left behind is the one that describes
    // these bytes. Checking it is what makes this gate stand on its own: a `prepack` that stopped
    // stamping would leave a tarball nobody can attribute to a source tree, and P1 alone cannot see
    // that (a stale `dist/` also ships).
    requireFresh("package:glyph-arena", ROOT, { label: "e2e:published (umbrella)" });

    const listing = run("tar", ["-tzf", tarball], work).split("\n");
    const shipped = ["package/dist/index.js", "package/dist/index.d.ts"].every((file) =>
      listing.includes(file),
    );
    check(shipped, "P1: the tarball ships dist/index.js and dist/index.d.ts", tarball);
    if (!shipped)
      throw new Error(
        "the tarball is not a usable package: `pack` did not rebuild dist/ from packages/*/src " +
          "(is the umbrella's `prepack` still there?); stopping before install",
      );

    // ---- P2: install it into an empty project, offline ----------------------
    writeFileSync(
      join(project, "package.json"),
      `${JSON.stringify({ name: "glyph-published-consumer", private: true, type: "module" }, null, 2)}\n`,
    );
    run("npm", ["install", "--offline", "--no-audit", "--no-fund", "--ignore-scripts", tarball], project);

    const installed = join(project, "node_modules", "@fogrexon", "glyph-arena", "dist", "index.js");
    check(existsSync(installed), "P2: the tarball installed into an empty project, offline", installed);
    if (!existsSync(installed)) throw new Error("install did not produce the package");

    // ---- P3: the two documents a reader copies, compiled in that project ----
    const tutorial = wholeFileProgram(readFileSync(join(ROOT, "docs", "tutorial.md"), "utf8"));
    const readme = singleProgram(
      readFileSync(join(ROOT, "packages", "glyph-arena", "README.md"), "utf8"),
      { source: "packages/glyph-arena/README.md" },
    );
    writeFileSync(join(project, "tutorial.ts"), `${tutorial.code}\n`);
    writeFileSync(join(project, "readme.ts"), `${readme.code}\n`);

    const tsconfig = {
      compilerOptions: {
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "bundler",
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        lib: ["ES2022", "DOM", "DOM.Iterable"],
      },
      include: ["tutorial.ts", "readme.ts"],
    };
    writeFileSync(join(project, "tsconfig.json"), `${JSON.stringify(tsconfig, null, 2)}\n`);

    let compiled = true;
    try {
      run(TSC, ["-p", "tsconfig.json"], project);
    } catch (error) {
      compiled = false;
      console.log(`FAIL P3: the documents do not compile against the installed package\n${error.stdout ?? ""}${error.stderr ?? ""}`);
    }
    if (compiled) {
      check(
        true,
        "P3: README and tutorial compile against the installed declarations",
        `docs/tutorial.md:${tutorial.line}, packages/glyph-arena/README.md:${readme.line}`,
      );

      // Compiling is only worth something if it read the *installed* declarations. `tsc` prints
      // every file it considered; the workspace path must not appear, or a `paths` mapping came
      // back and this gate silently went back to checking `src/`.
      const trace = run(TSC, ["-p", "tsconfig.json", "--traceResolution"], project);
      const installedTypes = join(project, "node_modules", "@fogrexon", "glyph-arena", "dist", "index.d.ts");
      const usedInstalled = trace.includes(installedTypes);
      const usedWorkspace = trace.includes(join(ROOT, "packages", "glyph-arena", "src"));
      check(
        usedInstalled && !usedWorkspace,
        "P3b: the declarations it compiled against are the installed ones",
        usedInstalled ? "a workspace src path appeared in resolution" : `${installedTypes} never appeared`,
      );
    } else {
      failures.push("P3: the documents do not compile against the installed package");
    }


    // ---- P6: the same two documents, against the version npm is serving ------
    // P3 proves the documents work with the tarball this workspace is about to publish, and it is
    // green even when main's documents are hours ahead of what a reader can install: the workspace
    // has the export, the registry does not. That gap stopped a real dry run on its first import —
    // `does not provide an export named 'tagIn'` — while every workspace gate was green. The fix
    // for that state is a release, not a code change, so the check has to tell the two apart.
    //
    // The published version is the one `npm install @fogrexon/glyph-arena` resolves to, so it is
    // the one the documents have to compile against:
    //   workspace == registry → the documents must compile against what npm serves, or red;
    //   workspace > registry  → a release is staged (this workspace is the newer one), and the
    //                           check names the version it waits for instead of blocking every pull
    //                           request until that release ships.
    const registry = join(work, "registry");
    mkdirSync(registry, { recursive: true });
    writeFileSync(
      join(registry, "package.json"),
      `${JSON.stringify({ name: "registry-docs", private: true, type: "module" }, null, 2)}\n`,
    );

    const workspaceVersion = JSON.parse(readFileSync(join(UMBRELLA, "package.json"), "utf8")).version;
    let publishedVersion = null;
    try {
      publishedVersion = run("npm", ["view", "@fogrexon/glyph-arena", "version"], ROOT).trim();
    } catch (error) {
      console.log(`PEND P6: could not ask the registry which version it serves — ${firstLine(error)}`);
    }

    if (publishedVersion) {
      let registryInstalled = true;
      try {
        run(
          "npm",
          ["install", "--no-audit", "--no-fund", "--ignore-scripts", `@fogrexon/glyph-arena@${publishedVersion}`],
          registry,
        );
      } catch (error) {
        registryInstalled = false;
        console.log(`PEND P6: could not install @fogrexon/glyph-arena@${publishedVersion} from the registry — ${firstLine(error)}`);
      }

      if (registryInstalled) {
        writeFileSync(join(registry, "tutorial.ts"), `${tutorial.code}\n`);
        writeFileSync(join(registry, "readme.ts"), `${readme.code}\n`);
        writeFileSync(join(registry, "tsconfig.json"), `${JSON.stringify(tsconfig, null, 2)}\n`);

        let registryCompiled = true;
        let registryError = "";
        try {
          run(TSC, ["-p", "tsconfig.json"], registry);
        } catch (error) {
          registryCompiled = false;
          const out = `${error.stdout ?? ""}${error.stderr ?? ""}`;
          registryError = out.split("\n").find((line) => line.includes("error TS")) ?? firstLine(error);
        }

        if (registryCompiled) {
          check(
            true,
            "P6: the documents on main compile against the version npm serves",
            `@fogrexon/glyph-arena@${publishedVersion}`,
          );
        } else if (workspaceVersion !== publishedVersion) {
          // A release is staged: this workspace is a version npm does not have yet, so the
          // documents are ahead of the registry *by design* until that version is published. The
          // line names the version so the wait cannot be mistaken for a pass.
          console.log(
            `PEND P6: npm serves @fogrexon/glyph-arena@${publishedVersion}, which cannot run the documents on main ` +
              `(${registryError}); this workspace is v${workspaceVersion}, so a release is staged — ` +
              `publish v${workspaceVersion} and this check becomes the gate`,
          );
        } else {
          check(
            false,
            "P6: the documents on main compile against the version npm serves",
            `${registryError} — v${publishedVersion} is published and this workspace is the same version`,
          );
        }
      }
    }

    // ---- P4: the installed bundle actually runs ------------------------------
    // Emit the tutorial as-is; the bare specifier stays and the page resolves it with an import
    // map, so the browser executes the installed `dist`, not a rebuilt copy.
    writeFileSync(
      join(project, "tsconfig.emit.json"),
      `${JSON.stringify(
        {
          compilerOptions: {
            ...tsconfig.compilerOptions,
            noEmit: false,
            outDir: "js",
            declaration: false,
            sourceMap: false,
          },
          include: ["tutorial.ts"],
        },
        null,
        2,
      )}\n`,
    );
    let emitted = true;
    try {
      run(TSC, ["-p", "tsconfig.emit.json"], project);
    } catch (error) {
      emitted = false;
      console.log(`FAIL P4: could not emit the tutorial\n${error.stdout ?? ""}${error.stderr ?? ""}`);
    }

    const emittedFile = join(project, "js", "tutorial.js");
    if (!emitted || !existsSync(emittedFile)) {
      check(false, "P4: the tutorial's program runs against the installed bundle", "nothing was emitted");
    } else {
      check(true, "P4a: the tutorial emitted, keeping the bare import", emittedFile);

      writeFileSync(
        join(project, "index.html"),
        `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>published example</title>
    <style>html, body { margin: 0; height: 100%; overflow: hidden; background: #0d1626; } canvas { display: block; }</style>
  </head>
  <body>
    <canvas id="game"></canvas>
    <script type="importmap">
      { "imports": { "@fogrexon/glyph-arena": "/node_modules/@fogrexon/glyph-arena/dist/index.js" } }
    </script>
    <script type="module" src="/js/tutorial.js"></script>
  </body>
</html>
`,
      );

      const { server, missing } = await serveDist({ root: project, port: PORT });
      const errors = [];
      const launch = { args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio"] };
      const executablePath = process.env.E2E_CHROMIUM;
      const browser = executablePath
        ? await chromium.launch({ ...launch, executablePath })
        : await chromium.launch({ ...launch, channel: process.env.E2E_CHANNEL ?? "chrome" });

      try {
        const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
        page.on("console", (message) => {
          if (message.type() === "error" && !/Failed to load resource/.test(message.text())) {
            errors.push(`console: ${message.text()}`);
          }
        });
        page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));

        await page.addInitScript(COUNT_FRAMES);
        await page.goto(`http://127.0.0.1:${PORT}`, { waitUntil: "load" });

        let first = null;
        const deadline = Date.now() + 10_000;
        while (Date.now() < deadline) {
          first = await page.evaluate(SAMPLE);
          if (first.error === undefined && first.counts.player > 0 && first.counts.solid > 0) break;
          await page.waitForTimeout(100);
        }
        if (first?.error !== undefined) throw new Error(first.error);

        check(
          first.counts.clear > 0 && first.counts.solid > 0 && first.counts.player > 0,
          "P4b: the installed bundle painted a frame with the body on it",
          `clear ${first.counts.clear}px, solid ${first.counts.solid}px, player ${first.counts.player}px`,
        );

        const still = await page.evaluate(SAMPLE);
        await page.keyboard.down("ArrowRight");
        await page.waitForTimeout(600);
        const running = await page.evaluate(SAMPLE);
        await page.keyboard.up("ArrowRight");

        const bodyShift = Math.abs(running.body.minX - still.body.minX);
        const worldShift = still.solidCentreX - running.solidCentreX;
        check(
          worldShift > 30 && bodyShift < 12,
          "P4c: holding ArrowRight moves the body through the world",
          `world moved ${worldShift.toFixed(1)}px left, body moved ${bodyShift.toFixed(1)}px on screen`,
        );
        check(running.frames - still.frames >= 4, "P4d: frames keep coming", `${running.frames - still.frames} frames in 600 ms`);
        check(errors.length === 0, "P5: no console or page errors", errors.slice(0, 3).join(" | "));
        check(missing.length === 0, "P5: every asset the page asked for was served", missing.slice(0, 3).join(" | "));
      } finally {
        await browser.close();
        server.close();
      }
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }

  if (failures.length > 0) {
    console.error(`e2e:published failed: ${failures.length} check(s)`);
    process.exitCode = 1;
  } else {
    console.log("e2e:published passed");
  }
}

main().catch((error) => {
  console.error(`e2e:published crashed: ${error.stack ?? error.message}`);
  process.exitCode = 1;
});

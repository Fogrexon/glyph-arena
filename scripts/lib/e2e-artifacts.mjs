/**
 * What a browser gate leaves behind when it fails.
 *
 * A gate that fails with nothing behind it fails the same way again: the log is gone with the
 * runner, and the next person starts by guessing. So a failure writes down the checks that failed,
 * the page's console, the page errors, the last frame it read, and a screenshot — and prints the
 * same summary, because a CI log keeps what an artifact upload needs a workflow-scoped token for.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

/** Where a gate writes; `.e2e-artifacts` by default, and gitignored. */
export function artifactDir(root) {
  return process.env.E2E_ARTIFACTS ? resolve(process.env.E2E_ARTIFACTS) : join(root, ".e2e-artifacts");
}

/**
 * Write `<name>.log` (and `<name>.png` when there is a page) and print where they went.
 *
 * The screenshot is best effort: a page that cannot be photographed for the same reason it failed
 * must not turn a red check into an exception, so its own error goes into the log instead.
 */
export async function writeFailureArtifacts({ name, root, page, checks, consoleLines = [], pageErrors = [], extra = {} }) {
  const dir = artifactDir(root);
  mkdirSync(dir, { recursive: true });

  const base = join(dir, name);
  const lines = [
    `# ${name}`,
    "",
    "## Checks that failed",
    ...(checks.length > 0 ? checks.map((line) => `- ${line}`) : ["- (none recorded)"]),
    "",
    "## Page errors",
    ...(pageErrors.length > 0 ? pageErrors.map((line) => `- ${line}`) : ["- none"]),
    "",
    "## Console",
    ...(consoleLines.length > 0 ? consoleLines.slice(-80).map((line) => `- ${line}`) : ["- (nothing captured)"]),
    "",
    "## Last frame read",
    "```json",
    JSON.stringify(extra, null, 2),
    "```",
  ];

  writeFileSync(`${base}.log`, `${lines.join("\n")}\n`);

  let screenshot = null;
  if (page) {
    try {
      await page.screenshot({ path: `${base}.png` });
      screenshot = `${base}.png`;
    } catch (error) {
      writeFileSync(`${base}.log`, `${lines.join("\n")}\n\n## Screenshot\n\n- failed: ${error.message}\n`);
    }
  }

  // The files are for whoever opens the run afterwards; the log itself has to carry what a CI
  // log keeps, because uploading needs a workflow-scoped token this repository's bot does not have.
  console.log(lines.join("\n"));
  console.log(`artifacts: ${base}.log${screenshot ? `, ${screenshot}` : ""}`);
  return { log: `${base}.log`, screenshot };
}

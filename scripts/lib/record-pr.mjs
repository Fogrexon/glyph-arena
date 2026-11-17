/**
 * Record a deploy through a pull request, with the API — no git, no token on
 * disk.
 *
 * `pnpm check:deployed --write` can already write `docs/bundles.json` locally,
 * but main is protected now (PR required, `verify` required, admins included),
 * so the record cannot be pushed straight to it any more. This is that missing
 * step, and it is the step that has gone wrong by hand twice:
 *
 * - the branch MUST exist before the file write. The file API does not fail
 *   when the branch is missing — it silently commits to the default branch, and
 *   that is how four commits landed on `main` on 11-17 without a PR.
 * - the PR MUST carry exactly the files we sent. A dropped file is invisible in
 *   the PR body and only shows up as a 404 later (`/runner/` on 11-17).
 * - the merge MUST be followed by reading `main` back. A merge that says
 *   "merged" and a main that did not move is not a merge.
 *
 * Every one of those is an assertion here rather than a comment, because the
 * whole point is to stop doing them by memory.
 */

const DEFAULT_API = "https://api.github.com";

export class RecordPrError extends Error {
  constructor(message, detail) {
    super(message);
    this.name = "RecordPrError";
    this.detail = detail;
  }
}

function api({ token, apiBase, method, path, body }) {
  const url = `${apiBase}${path}`;
  const headers = {
    accept: "application/vnd.github+json",
    "user-agent": "glyph-arena-check-deployed",
    "x-github-api-version": "2022-11-28",
  };
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  return fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }).then(
    async (response) => {
      const text = await response.text();
      let parsed = null;
      try {
        parsed = text === "" ? null : JSON.parse(text);
      } catch {
        parsed = { raw: text };
      }
      if (!response.ok) {
        const why = (parsed && (parsed.message || parsed.raw)) || response.statusText;
        throw new RecordPrError(`${method} ${path} → ${response.status}: ${why}`, parsed);
      }
      return parsed;
    },
  );
}

/** What we would do, without doing it. */
export function planRecordPr({ repo, branch }) {
  return [
    `GET  /repos/${repo}/git/ref/heads/main            (is the branch point there)`,
    `POST /repos/${repo}/git/refs                      (create ${branch})`,
    `GET  /repos/${repo}/git/ref/heads/${branch}       (prove it exists before writing)`,
    `GET  /repos/${repo}/contents/docs/bundles.json?ref=${branch}   (blob sha to update)`,
    `PUT  /repos/${repo}/contents/docs/bundles.json    (commit onto ${branch}, never main)`,
    `POST /repos/${repo}/pulls                         (base main, head ${branch})`,
    `GET  /repos/${repo}/pulls/:n                      (changed_files must be 1)`,
    `GET  /repos/${repo}/pulls/:n                      (until mergeable_state is clean = verify green)`,
    `PUT  /repos/${repo}/pulls/:n/merge                (squash)`,
    `GET  /repos/${repo}/git/ref/heads/main            (the head must have moved)`,
  ];
}

/**
 * Open, wait for, and merge one PR that changes one file.
 *
 * `content` is the full new file body. Nothing is written until the branch has
 * been read back from the API.
 */
export async function openRecordPr({
  token,
  repo,
  content,
  path = "docs/bundles.json",
  apiBase = process.env.GITHUB_API_URL || DEFAULT_API,
  branch,
  title,
  body,
  pollMs = 10_000,
  timeoutMs = 15 * 60_000,
  log = console.log,
  sleep = (ms) => new Promise((done) => setTimeout(done, ms)),
}) {
  if (!token) {
    throw new RecordPrError(
      "GITHUB_TOKEN is not set — --pr needs it. There is no git credentials file in this container, " +
        "so the API is the only way to open the PR (ask the 会長 to grant the token).",
    );
  }
  const call = (method, apiPath, requestBody) => api({ token, apiBase, method, path: apiPath, body: requestBody });
  const sentFiles = new Set([path]);

  const main = await call("GET", `/repos/${repo}/git/ref/heads/main`);
  const base = main.object.sha;
  log(`main at ${base.slice(0, 8)}`);

  await call("POST", `/repos/${repo}/git/refs`, { ref: `refs/heads/${branch}`, sha: base });
  const created = await call("GET", `/repos/${repo}/git/ref/heads/${branch}`);
  if (created.object.sha !== base) {
    throw new RecordPrError(`${branch} was not created from ${base.slice(0, 8)} (got ${created.object.sha.slice(0, 8)})`);
  }
  log(`${branch} created from ${base.slice(0, 8)}`);

  const existing = await call("GET", `/repos/${repo}/contents/${path}?ref=${branch}`);
  const committed = await call("PUT", `/repos/${repo}/contents/${path}`, {
    message: title,
    content: Buffer.from(content, "utf8").toString("base64"),
    branch,
    sha: existing.sha,
  });
  log(`committed ${path} → ${committed.commit.sha.slice(0, 8)} on ${branch}`);
  if (committed.commit.parents?.some((parent) => parent.sha === base) === false) {
    throw new RecordPrError(`the commit on ${branch} does not continue from ${base.slice(0, 8)}`);
  }

  const pr = await call("POST", `/repos/${repo}/pulls`, { title, body, head: branch, base: "main" });
  log(`PR #${pr.number} opened: ${pr.html_url}`);

  // Exactly the files we sent. A dropped file reads as success everywhere else.
  let state = await call("GET", `/repos/${repo}/pulls/${pr.number}`);
  if (state.changed_files !== sentFiles.size) {
    throw new RecordPrError(
      `PR #${pr.number} changes ${state.changed_files} file(s), we sent ${sentFiles.size} — not merging`,
    );
  }

  const deadline = Date.now() + timeoutMs;
  while (state.mergeable_state !== "clean") {
    if (state.mergeable_state === "dirty") {
      throw new RecordPrError(`PR #${pr.number} conflicts with main (mergeable_state dirty)`);
    }
    if (Date.now() > deadline) {
      throw new RecordPrError(
        `PR #${pr.number} never became clean in ${Math.round(timeoutMs / 60_000)}min ` +
          `(last mergeable_state ${state.mergeable_state}) — read the run before merging it by hand`,
      );
    }
    log(`waiting: mergeable_state ${state.mergeable_state ?? "unknown"} (verify must be green)`);
    await sleep(pollMs);
    state = await call("GET", `/repos/${repo}/pulls/${pr.number}`);
  }

  const merged = await call("PUT", `/repos/${repo}/pulls/${pr.number}/merge`, {
    merge_method: "squash",
    commit_title: title,
  });
  if (!merged.merged) throw new RecordPrError(`merge refused: ${merged.message}`);

  const after = await call("GET", `/repos/${repo}/git/ref/heads/main`);
  if (after.object.sha === base) {
    throw new RecordPrError("merge reported success but main did not move");
  }
  log(`merged ${merged.sha.slice(0, 8)}; main ${base.slice(0, 8)} → ${after.object.sha.slice(0, 8)}`);

  return { branch, number: pr.number, sha: merged.sha, main: after.object.sha, url: pr.html_url };
}

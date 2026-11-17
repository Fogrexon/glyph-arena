/**
 * The record-PR flow, against a fake GitHub API.
 *
 * The three failures this file has to keep impossible are the three that have
 * actually happened, so they are asserted rather than described: a missing
 * branch silently committing to main, a PR whose file count is not what was
 * sent, and a "merged" that left main where it was.
 *
 *   node --test scripts/record-pr.test.mjs
 */
import { createServer } from "node:http";
import { test } from "node:test";
import assert from "node:assert/strict";

import { openRecordPr, planRecordPr, RecordPrError } from "./lib/record-pr.mjs";

const BASE = "a".repeat(40);
const AFTER = "b".repeat(40);

/** A GitHub stand-in: records every call, answers the handful of paths used. */
async function fakeGitHub({ changedFiles = 1, states = ["clean"], moveMain = true } = {}) {
  const calls = [];
  const queue = [...states];
  const server = createServer((request, response) => {
    let raw = "";
    request.on("data", (chunk) => (raw += chunk));
    request.on("end", () => {
      const body = raw === "" ? undefined : JSON.parse(raw);
      calls.push({ method: request.method, path: request.url, body });
      const json = (status, payload) => {
        response.writeHead(status, { "content-type": "application/json" });
        response.end(JSON.stringify(payload));
      };
      const path = request.url.split("?")[0];

      if (path === "/repos/o/r/git/ref/heads/main") {
        const moved = calls.some((call) => call.path.includes("/pulls/") && call.method === "PUT");
        return json(200, { object: { sha: moveMain && moved ? AFTER : BASE } });
      }
      if (path === "/repos/o/r/git/refs" && request.method === "POST") {
        return json(201, { ref: body.ref, object: { sha: body.sha } });
      }
      if (path.startsWith("/repos/o/r/git/ref/heads/")) {
        return json(200, { object: { sha: BASE } });
      }
      if (path === "/repos/o/r/contents/docs/bundles.json") {
        if (request.method === "GET") return json(200, { sha: "blob-on-main" });
        return json(200, { commit: { sha: "c0ffee00", parents: [{ sha: BASE }] } });
      }
      if (path === "/repos/o/r/pulls" && request.method === "POST") {
        return json(201, { number: 154, html_url: "https://example.test/pull/154" });
      }
      if (path === "/repos/o/r/pulls/154" && request.method === "GET") {
        const state = queue.length > 1 ? queue.shift() : queue[0];
        return json(200, { number: 154, changed_files: changedFiles, mergeable_state: state });
      }
      if (path === "/repos/o/r/pulls/154/merge") {
        return json(200, { merged: true, sha: "merged-sha" });
      }
      return json(404, { message: `unexpected ${request.method} ${request.url}` });
    });
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  return {
    apiBase: `http://127.0.0.1:${server.address().port}`,
    calls,
    close: () => new Promise((done) => server.close(done)),
    writes: () => calls.filter((call) => call.method === "PUT" || call.method === "POST").map((c) => c.path),
  };
}

const run = (apiBase, extra = {}) =>
  openRecordPr({
    token: "test-token",
    repo: "o/r",
    apiBase,
    branch: "chore/record-bundles-1",
    title: "chore(p6): record the deployed bundles",
    body: "recorded by `pnpm check:deployed --write --pr`",
    content: '{\n  "root": "index-abc.js"\n}\n',
    pollMs: 1,
    timeoutMs: 50,
    log: () => {},
    ...extra,
  });

test("creates the branch before touching the file, then merges", async () => {
  const gh = await fakeGitHub();
  try {
    const result = await run(gh.apiBase);
    assert.equal(result.number, 154);
    const order = gh.calls.map((call) => `${call.method} ${call.path.split("?")[0]}`);
    const branchAt = order.indexOf("POST /repos/o/r/git/refs");
    const fileAt = order.findIndex((line) => line.startsWith("PUT /repos/o/r/contents"));
    const mergeAt = order.indexOf("PUT /repos/o/r/pulls/154/merge");
    assert.ok(branchAt >= 0, "the branch is created");
    assert.ok(branchAt < fileAt, "the branch exists before the file is sent");
    assert.ok(mergeAt > fileAt, "the merge comes last");
    // and the file goes onto the branch, never onto main
    const put = gh.calls.find((call) => call.method === "PUT" && call.path.startsWith("/repos/o/r/contents"));
    assert.equal(put.body.branch, "chore/record-bundles-1");
    assert.equal(put.body.sha, "blob-on-main");
  } finally {
    await gh.close();
  }
});

test("reads main back after merging", async () => {
  const gh = await fakeGitHub();
  try {
    const result = await run(gh.apiBase);
    assert.equal(result.main, AFTER);
    const reads = gh.calls.filter((call) => call.path === "/repos/o/r/git/ref/heads/main");
    assert.equal(reads.length, 2, "main is read before and after");
  } finally {
    await gh.close();
  }
});

test("refuses a PR that carries more files than we sent", async () => {
  const gh = await fakeGitHub({ changedFiles: 2 });
  try {
    await assert.rejects(() => run(gh.apiBase), (error) => {
      assert.ok(error instanceof RecordPrError);
      assert.match(error.message, /changes 2 file\(s\), we sent 1/);
      return true;
    });
    assert.ok(!gh.writes().includes("/repos/o/r/pulls/154/merge"), "nothing is merged");
  } finally {
    await gh.close();
  }
});

test("waits while the check is pending, then merges", async () => {
  const gh = await fakeGitHub({ states: ["blocked", "unstable", "clean"] });
  try {
    const result = await run(gh.apiBase);
    assert.equal(result.number, 154);
    const polls = gh.calls.filter((call) => call.method === "GET" && call.path === "/repos/o/r/pulls/154");
    assert.equal(polls.length, 3, "blocked and unstable are waited on, clean is not");
  } finally {
    await gh.close();
  }
});

test("times out instead of merging a red PR", async () => {
  const gh = await fakeGitHub({ states: ["blocked"] });
  try {
    await assert.rejects(() => run(gh.apiBase), /never became clean/);
    assert.ok(!gh.writes().includes("/repos/o/r/pulls/154/merge"), "a check that never goes green is never merged");
  } finally {
    await gh.close();
  }
});

test("a merge that leaves main where it was is a failure", async () => {
  const gh = await fakeGitHub({ moveMain: false });
  try {
    await assert.rejects(() => run(gh.apiBase), /main did not move/);
  } finally {
    await gh.close();
  }
});

test("no token, no requests", async () => {
  const gh = await fakeGitHub();
  try {
    await assert.rejects(() => run(gh.apiBase, { token: "" }), /GITHUB_TOKEN is not set/);
    assert.equal(gh.calls.length, 0);
  } finally {
    await gh.close();
  }
});

test("the dry-run plan creates the branch before it writes the file", () => {
  const plan = planRecordPr({ repo: "o/r", branch: "chore/x" });
  const branchAt = plan.findIndex((line) => line.includes("git/refs"));
  const writeAt = plan.findIndex((line) => line.includes("PUT") && line.includes("contents"));
  assert.ok(branchAt >= 0 && branchAt < writeAt, "the plan says branch first");
});

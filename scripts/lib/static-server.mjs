/**
 * Serve a built page from 127.0.0.1 for the browser gates, and count what it could not answer.
 *
 * The browser's own console message for a 404 ("Failed to load resource") names no URL, so a gate
 * that only reads console errors can say "something was missing" but not *what* — and it cannot
 * tell a 404 from a 500. This keeps the list instead: `missing` is every response >= 400, so the
 * check that fails names the path.
 *
 * The page has no favicon, and the browser asks for one anyway; answering 204 is not hiding a page
 * asset, and treating it as a failure would make every gate red for a file nobody wrote.
 */
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join, resolve, sep } from "node:path";

const MIME = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".ico", "image/x-icon"],
  [".txt", "text/plain; charset=utf-8"],
  [".webmanifest", "application/manifest+json"],
  [".wasm", "application/wasm"],
]);

/**
 * @param {{ root: string, port: number }} options
 * @returns {Promise<{ server: import("node:http").Server, missing: string[] }>}
 */
export async function serveDist({ root, port }) {
  const base = resolve(root);
  const missing = [];

  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, "");

    if (relative === "favicon.ico") {
      response.writeHead(204).end();
      return;
    }

    const path = resolve(base, relative === "" ? "index.html" : relative);

    if (path !== base && !path.startsWith(base + sep)) {
      missing.push(`403 ${url.pathname}`);
      response.writeHead(403).end("forbidden");
      return;
    }

    try {
      const body = await readFile(path);
      const type = MIME.get(path.slice(path.lastIndexOf("."))) ?? "application/octet-stream";
      response.writeHead(200, { "content-type": type, "cache-control": "no-store" }).end(body);
    } catch {
      missing.push(`404 ${url.pathname}`);
      response.writeHead(404).end("not found");
    }
  });

  const listening = await new Promise((resolvePromise) => {
    server.listen(port, "127.0.0.1", () => resolvePromise(server));
  });

  return { server: listening, missing };
}

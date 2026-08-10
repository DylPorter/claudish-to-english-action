/**
 * Stands in for both upstreams the action talks to — the inference provider
 * and the GitHub API — so the shipped bundle can be exercised end to end with
 * no credentials and no network.
 *
 * Octokit is pointed here with GITHUB_API_URL; the model with api-base.
 */
import { createServer } from "node:http";

const REWRITE =
  "This change rewrites how data gets loaded so you can see what it is doing.\n\n" +
  "It touches src/ingest/loader.ts. The loader now reports each batch as it finishes, " +
  "instead of staying silent until the whole run ends. Failed batches are retried twice " +
  "before being dropped.";

/** Everything the run did, so the driver can assert against it. */
const calls = { model: [], created: [], updated: [] };
let comments = [];
let nextId = 100;

function send(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}

const server = createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    const body = raw ? JSON.parse(raw) : {};
    const url = req.url ?? "";

    if (req.method === "POST" && url.includes("/chat/completions")) {
      calls.model.push(body);
      return send(res, 200, { choices: [{ message: { content: REWRITE } }] });
    }

    if (req.method === "GET" && url.includes("/pulls/1/files")) {
      return send(res, 200, [{ filename: "src/ingest/loader.ts" }]);
    }

    if (req.method === "GET" && url.includes("/issues/1/comments")) {
      return send(res, 200, comments);
    }

    if (req.method === "POST" && url.includes("/issues/1/comments")) {
      const comment = { id: nextId++, body: body.body };
      comments.push(comment);
      calls.created.push(comment);
      return send(res, 201, comment);
    }

    if (req.method === "PATCH" && url.includes("/issues/comments/")) {
      const id = Number(url.split("/issues/comments/")[1]?.split("?")[0]);
      const found = comments.find((c) => c.id === id);
      if (found) found.body = body.body;
      calls.updated.push({ id, body: body.body });
      return send(res, 200, found ?? {});
    }

    // Surfaced by the driver so an unexpected call is a test failure, not a hang.
    if (url === "/__calls") return send(res, 200, calls);

    calls.model.push({ unexpected: `${req.method} ${url}` });
    send(res, 404, { message: `stub has no route for ${req.method} ${url}` });
  });
});

server.listen(8912, () => process.stdout.write("stub-ready\n"));

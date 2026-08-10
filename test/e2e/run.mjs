/**
 * End-to-end check of the SHIPPED artifact.
 *
 * Runs dist/index.js — the bundle GitHub actually executes — twice against
 * stubbed model and GitHub APIs, and asserts it creates a comment on the first
 * run and edits that same comment on the second. Needs no credentials.
 *
 * This is the layer the unit tests cannot reach: a broken bundle, a bad
 * entrypoint, or a Node version problem all pass vitest and fail here.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const STUB = new URL("./stub-server.mjs", import.meta.url).pathname;
const BASE = "http://127.0.0.1:8912";

const failures = [];
function check(label, condition) {
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    console.log(`  FAIL ${label}`);
    failures.push(label);
  }
}

function startStub() {
  return new Promise((resolve, reject) => {
    const proc = spawn("node", [STUB], { stdio: ["ignore", "pipe", "inherit"] });
    proc.stdout.on("data", (d) => {
      if (d.toString().includes("stub-ready")) resolve(proc);
    });
    proc.on("error", reject);
    setTimeout(() => reject(new Error("stub did not start within 10s")), 10_000);
  });
}

function runAction(eventPath) {
  return new Promise((resolve) => {
    const proc = spawn("node", ["dist/index.js"], {
      env: {
        ...process.env,
        GITHUB_EVENT_PATH: eventPath,
        GITHUB_REPOSITORY: "DylPorter/demo",
        GITHUB_API_URL: BASE,
        "INPUT_API-BASE": `${BASE}/v1`,
        "INPUT_API-KEY": "stub-key",
        "INPUT_GITHUB-TOKEN": "stub-token",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let out = "";
    proc.stdout.on("data", (d) => (out += d));
    proc.stderr.on("data", (d) => (out += d));
    proc.on("close", (code) => resolve({ code, out }));
  });
}

const stub = await startStub();

try {
  const dir = mkdtempSync(join(tmpdir(), "claudish-e2e-"));
  const eventPath = join(dir, "event.json");
  writeFileSync(
    eventPath,
    JSON.stringify({
      pull_request: {
        number: 1,
        title: "Refactor the ingestion layer",
        labels: [],
        body:
          "This pull request implements a comprehensive refactor of the data ingestion " +
          "subsystem in order to provide enhanced observability into the batch processing " +
          "pipeline. It is worth noting that the existing implementation did not surface " +
          "intermediate state, which in some cases could make it difficult for operators " +
          "to ascertain progress.",
      },
    }),
  );

  console.log("run 1 — expect a comment to be created");
  const first = await runAction(eventPath);
  check("exits 0", first.code === 0);
  check("reports created", first.out.includes("created"));
  check("logs no warning", !first.out.includes("::warning"));

  console.log("run 2 — expect that same comment to be edited");
  const second = await runAction(eventPath);
  check("exits 0", second.code === 0);
  check("reports updated", second.out.includes("updated"));

  const calls = await fetch(`${BASE}/__calls`).then((r) => r.json());

  check("called the model twice", calls.model.length === 2);
  check("created exactly one comment", calls.created.length === 1);
  check("edited exactly one comment", calls.updated.length === 1);
  check("edited the comment it created", calls.updated[0]?.id === calls.created[0]?.id);

  const prompt = calls.model[0]?.messages?.[0]?.content ?? "";
  check("prompt keeps the original instruction", prompt.includes("Keep every fact, name, number"));
  check("prompt grounds on changed files", prompt.includes("src/ingest/loader.ts"));

  const posted = calls.created[0]?.body ?? "";
  check("comment carries the sticky marker", posted.includes("<!-- claudish-to-english -->"));
  check("comment contains the rewrite", posted.includes("Loads data faster") || posted.includes("rewrites how data gets loaded"));
  check("comment says how to turn it off", posted.includes("no-claudish"));
  check("no unexpected API calls", !JSON.stringify(calls).includes("unexpected"));
} finally {
  stub.kill();
}

if (failures.length > 0) {
  console.error(`\n${failures.length} end-to-end check(s) failed.`);
  process.exit(1);
}
console.log("\nAll end-to-end checks passed.");

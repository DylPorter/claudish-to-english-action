/**
 * Wiring, and the fail-open boundary.
 *
 * FAIL-OPEN CONTRACT: this Action must never fail a workflow run. Every
 * failure path — bad config, missing permission, rate limit, timeout, model
 * error — logs a warning and exits 0.
 *
 * Inherited from gvzdv/claudish-to-english, where a display hook that threw
 * would have swallowed Claude's answer entirely. The stakes here are
 * different but point the same way: a convenience feature that turns
 * someone's checks red gets uninstalled the same day.
 */

import * as core from "@actions/core";
import * as github from "@actions/github";

import { parseConfig } from "./inputs.js";
import { rewrite, LlmError } from "./llm.js";
import { buildMessages } from "./prompt.js";
import { shouldSkip } from "./skip.js";
import { upsertComment, type CommentApi } from "./comment.js";

const MAX_FILES_FETCHED = 100;

async function run(): Promise<void> {
  const pr = github.context.payload.pull_request;
  if (!pr) {
    core.info("Not a pull request event — nothing to do.");
    return;
  }

  const config = parseConfig((name) => core.getInput(name));
  const { owner, repo } = github.context.repo;
  const prNumber = pr.number;

  const labels = (pr.labels ?? []).map((l: { name?: string }) => l.name ?? "");
  const decision = shouldSkip({
    body: pr.body,
    labels,
    minChars: config.minChars,
    skipLabel: config.skipLabel,
  });

  if (decision.skip) {
    core.info(`Skipping: ${decision.reason}`);
    return;
  }

  const octokit = github.getOctokit(config.githubToken);

  // Paths only — grounding the rewrite is worth one cheap call, diff content
  // is not. A failure here is not fatal; we just rewrite with less context.
  let changedFiles: string[] = [];
  try {
    const { data } = await octokit.rest.pulls.listFiles({
      owner,
      repo,
      pull_number: prNumber,
      per_page: MAX_FILES_FETCHED,
    });
    changedFiles = data.map((f) => f.filename);
  } catch (error) {
    core.info(
      `Could not list changed files (${error instanceof Error ? error.message : String(error)}) — ` +
        "rewriting without that context.",
    );
  }

  const rewritten = await rewrite(
    buildMessages({
      title: pr.title ?? "",
      body: pr.body ?? "",
      changedFiles,
    }),
    {
      apiBase: config.apiBase,
      apiKey: config.apiKey,
      model: config.model,
      timeoutSeconds: config.timeoutSeconds,
    },
  );

  const api: CommentApi = {
    listComments: async (params) => {
      const { data } = await octokit.rest.issues.listComments({
        ...params,
        per_page: 100,
      });
      return data.map((c) => ({ id: c.id, body: c.body }));
    },
    createComment: (params) => octokit.rest.issues.createComment(params),
    updateComment: (params) => octokit.rest.issues.updateComment(params),
  };

  const action = await upsertComment(api, { owner, repo, prNumber }, rewritten);
  core.info(`Plain-English comment ${action} on #${prNumber}.`);
}

/**
 * The only place an error may surface, and it never rethrows.
 * Exported separately from the entrypoint so the contract can be tested.
 */
export async function main(): Promise<void> {
  try {
    await run();
  } catch (error) {
    const detail =
      error instanceof LlmError || error instanceof Error
        ? error.message
        : String(error);
    core.warning(
      `claudish-to-english did nothing: ${detail} ` +
        "(this never fails your build — the pull request is untouched).",
    );
  }
}

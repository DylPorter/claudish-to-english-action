# claudish-to-english-action — Design

**Date:** 2026-08-11
**Status:** Approved
**Origin:** [gvzdv/claudish-to-english](https://github.com/gvzdv/claudish-to-english) — a Claude Code plugin that rewrites assistant messages into plain English using a local ollama model. This project ports the idea to CI.

## Problem

Pull request descriptions are increasingly written by coding agents, and they read like it: preamble, abstract nouns, hedges, structure applied by reflex, a closing paragraph that restates the opening one. Reviewers skim them and lose the actual change.

The original plugin solved this at the terminal, for one reader, using a local model. The same problem exists on every PR in a repo, for every reviewer, and CI is where it can be solved once for everyone.

## What it does

A JavaScript GitHub Action. On a pull request event it reads the PR title, body, and changed-file paths, asks a model to rewrite the body in plain English, and posts the result as a single sticky bot comment that it edits in place on subsequent runs.

## The prompt

Taken verbatim from the original's `rewrite.sh`:

> You rewrite the assistant's message into much simpler, plain English. Keep every fact, name, number, and file path. Use short sentences and everyday words. Leave fenced code blocks unchanged. Output ONLY the rewritten message with no preamble, labels, or commentary.

Adapted only where the domain differs: "the assistant's message" becomes "the pull request description".

The original passes the user's original question as *context only*, with an explicit instruction never to answer or repeat it. This port keeps that mechanism and fills it with the PR's changed-file paths — enough to ground the rewrite in what actually changed, cheap because it is paths and not diff content.

## Inference

**Revised 2026-08-11, during implementation.** The design was approved with GitHub Models as a zero-config default — the workflow's own `GITHUB_TOKEN` plus a `models: read` permission, no API key and no secret. A live probe during the build returned `410 github_models_retirement_brownout`: **GitHub Models was fully retired on 2026-07-30**, twelve days before this was written.

The service had been correctly documented as retired the whole time — `docs.github.com/en/github-models` leads with "GitHub Models has been retired." The approved design cited a GitHub *blog post* from before the shutdown, which naturally still described the old `models: read` pattern, and that was mistaken for current documentation. The lesson is to probe the endpoint before designing around it, not to distrust the docs.

There is no keyless replacement. GitHub's own `actions/ai-inference` now requires a Copilot PAT secret plus a Copilot CLI install, and the official migration targets (Microsoft Foundry, Copilot) all need their own credentials.

So the escape hatch becomes the main road: `api-base` and `api-key` make the client OpenAI-compatible against OpenAI, Anthropic, Groq, OpenRouter, or a self-hosted ollama — the same provider-agnosticism the original got from `CLAUDISH_OLLAMA`. `api-key` is required and has no default. `api-base` defaults to `https://api.openai.com/v1`.

**Strategic consequence.** Zero-config was the adoption argument, and it is gone. Every install now costs the user an API key and a per-PR token spend. The Action is still worth building — the underlying problem is real and getting worse — but the "100 installs" bar on the Marketplace ladder is materially harder than it looked when this was approved, and should be re-priced rather than assumed.

## Delivery

A single sticky comment, identified by a hidden HTML marker (`<!-- claudish-to-english -->`). Each run lists the PR's comments, finds one carrying the marker, and edits it — otherwise creates it. A 40-push PR gets one comment, not 40.

Chosen over editing the PR body because the body is text the author owns. Appending to it risks destroying human edits and confuses merge-queue tooling that parses PR descriptions.

## Fail-open contract

**The Action must never fail a workflow run.** Any error — rate limit, timeout, model unavailable, malformed response, missing permission — logs a warning via `core.warning` and exits 0.

This is inherited from the original, where a display hook that threw would have swallowed Claude's answer entirely. The CI stakes are higher in a different way: a convenience feature that turns someone's checks red gets uninstalled the same day. This is covered by an explicit test, not just a `try`/`catch`.

## Skip rules

The Action does nothing when:

- the PR body is empty
- the PR body is shorter than `min-chars` (default 200, matching the original's `CLAUDISH_MIN_CHARS`), measured after stripping fenced code blocks and whitespace
- the PR carries the `skip-label` (default `no-claudish`)

It deliberately does **not** skip bot authors. Agent-written PRs are the primary use case.

## Modules

Each unit has one job, a defined interface, and can be tested alone.

| File | Responsibility | Depends on |
|---|---|---|
| `src/inputs.ts` | parse and validate action inputs, apply defaults | `@actions/core` |
| `src/skip.ts` | pure predicate — should this PR be rewritten? | nothing |
| `src/prompt.ts` | build system + user messages | nothing |
| `src/llm.ts` | one OpenAI-compatible chat call with a timeout | `fetch` |
| `src/comment.ts` | find / create / update the sticky comment | `@actions/github` |
| `src/main.ts` | wiring and the fail-open boundary | all of the above |

`skip.ts`, `prompt.ts`, and `inputs.ts` are pure and need no network or mocks. `comment.ts` takes an injected Octokit so it can be tested against a fake.

## Data flow

```
pull_request event
   → inputs.ts       parse config
   → skip.ts         should we run at all?           ── no ──▶ exit 0
   → octokit         fetch changed-file paths
   → prompt.ts       build messages (body + paths as context)
   → llm.ts          POST /chat/completions, timeout ── fail ─▶ warn, exit 0
   → comment.ts      find marker → update, else create
   → exit 0
```

## Inputs

| Input | Default | Purpose |
|---|---|---|
| `model` | `gpt-4o-mini` | model id passed through to the endpoint |
| `api-base` | `https://api.openai.com/v1` | OpenAI-compatible base URL |
| `api-key` | `${{ github.token }}` | auth for the above |
| `min-chars` | `200` | prose-length floor before rewriting |
| `timeout` | `45` | seconds before giving up on the model |
| `skip-label` | `no-claudish` | label that disables the Action for one PR |

Defaults make the zero-config path work with an empty `with:` block.

## Triggers

`pull_request` on `opened`, `edited`, `synchronize`, `reopened`. Required permissions: `pull-requests: write`, `contents: read`.

## Testing

- **Unit (vitest):** skip predicate across each rule and boundary; prompt construction including the code-block stripping; input parsing and defaults; comment find/create/update against a fake Octokit.
- **Fail-open:** explicit tests that a thrown LLM error, a timeout, and a malformed response each result in exit 0 and a warning.
- **Live:** dogfood workflow committed to this repo, so the project's own PRs exercise the Action.

## Out of scope for v1

Release-note rewriting, issue rewriting, review-comment rewriting, multi-language output, and any form of caching. Each is a plausible v2; none is needed to prove the thing works.

## Attribution

The idea and the prompt are gvzdv's. Credit goes in the README's first paragraph, in `action.yml`'s description, and in the LICENSE notice. `gvzdv/claudish-to-english` is forked to `DylPorter/claudish-to-english` for visible lineage, and an issue will be opened on the original pointing at this port once it is live.

## Strategic context

This is rung one of the GitHub integration ladder: a Marketplace-listed Action is half of what the GitHub Technology Partner Program requires (at least one Action plus at least one app or model listed). It is the cheap half. See `project_oss_contribution_strategy` — the goal is credible external surface area, not badge collection, and a listed Action with real installs is surface area.

# Claudish to English

A GitHub Action that rewrites agent-written pull request descriptions into plain English and posts the result as a comment.

This is a port of [**gvzdv/claudish-to-english**](https://github.com/gvzdv/claudish-to-english), a Claude Code plugin that does the same thing for assistant messages in your terminal using a local ollama model. The idea, and the rewrite prompt itself, are theirs. This moves it to CI, where one install covers every reviewer on the repo instead of one person's screen.

## Why

PR descriptions are increasingly written by coding agents, and they read like it — preamble, abstract nouns doing a verb's job, hedges that carry no information, a closing paragraph restating the opening one. Reviewers skim and lose the actual change.

The rewrite keeps every fact, name, number, and file path. It only changes how it reads.

**[See it on a real pull request →](https://github.com/DylPorter/claudish-to-english-action/pull/4)** — a deliberately overwritten description, with the rewrite posted underneath it.

## Usage

```yaml
name: Plain English

on:
  pull_request:
    types: [opened, edited, synchronize, reopened]

jobs:
  rewrite:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: DylPorter/claudish-to-english-action@v1
        with:
          api-key: ${{ secrets.OPENAI_API_KEY }}
```

The Action never touches your description. It posts one comment and edits that same comment on every push.

## Choosing a provider

`api-base` is any OpenAI-compatible endpoint, so this works with most providers by changing two lines.

```yaml
        with:                                        # DeepSeek
          api-base: https://api.deepseek.com/v1
          api-key: ${{ secrets.DEEPSEEK_API_KEY }}
          model: deepseek-chat
```

```yaml
        with:                                        # Anthropic
          api-base: https://api.anthropic.com/v1
          api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          model: claude-haiku-4-5-20251001
```

Anthropic's OpenAI-compatible layer works here, but [their docs](https://platform.claude.com/docs/en/api/openai-sdk) describe it as a testing convenience rather than a production path, so prefer a provider whose OpenAI-compatible endpoint is the real one.

Anything else with an OpenAI-compatible `/chat/completions` — Groq, OpenRouter, a self-hosted ollama — works the same way: set `api-base` to its base URL and pick a model id from that provider's own list.

This is a small, cheap call — one short prompt and a few hundred output tokens per push — so the smallest model a provider offers is usually the right choice.

> **On keyless setup.** This Action was originally designed against [GitHub Models](https://github.blog/changelog/2026-07-30-github-models-is-now-retired/), which would have needed no key at all: the workflow's own `GITHUB_TOKEN` plus a `models: read` permission. That service was **retired on 30 July 2026** and the endpoint now returns `410`. GitHub's own `actions/ai-inference` moved to requiring a Copilot PAT and a CLI install, so there is currently no keyless path. If one reappears, it goes back in as the default.

`api-key` and `github-token` are deliberately separate. The first authenticates the model; the second posts the comment and defaults to the workflow token. Setting one does not change the other.

## Inputs

| Input | Default | What it does |
|---|---|---|
| `api-key` | **required** | Credential for the model |
| `model` | `gpt-4o-mini` | Model id passed to the endpoint |
| `api-base` | `https://api.openai.com/v1` | OpenAI-compatible base URL |
| `github-token` | `${{ github.token }}` | Credential for reading the PR and posting the comment |
| `min-chars` | `200` | Skip descriptions with less prose than this |
| `timeout` | `45` | Seconds to wait for the model |
| `skip-label` | `no-claudish` | Label that turns the Action off for one PR |

## When it does nothing

- The description is empty
- The description has fewer than `min-chars` non-whitespace characters, **ignoring fenced code blocks** — a description that's mostly a stack trace has little prose to simplify
- The PR carries the `no-claudish` label

It does **not** skip bot authors. Agent-written PRs are the point.

## It cannot fail your build

Every failure path — bad config, missing permission, rate limit, timeout, model error, malformed response — logs a warning and exits 0.

This is inherited from the original, where a display hook that threw would have swallowed Claude's answer entirely. Here the reasoning is different but points the same way: a convenience feature that turns someone's checks red gets uninstalled the same day. There are tests that exist purely to keep this true.

A consequence worth knowing: if comments stop appearing, the Action is not crashing loudly. Check the workflow log for a warning — a rate limit or an expired key looks like silence, by design.

## Fork pull requests

On `pull_request` events from a fork, GitHub issues a read-only token and withholds secrets, so both the model call and the comment will fail — you'll see a warning, and nothing else happens.

**That is the correct behaviour and you should probably leave it.** It is the same mechanism that stops a stranger's pull request from spending your API credits.

`pull_request_target` would enable fork support, and this Action is one of the few safe uses of it — it only reads PR metadata and never checks out or executes PR code. But that safety comes from what the *workflow* does after the trigger fires, not from the trigger. Add an `actions/checkout` of the PR ref to such a workflow and you have handed attacker-controlled code a job holding your secrets, which is a well-known way public repos get compromised. If you don't already know that trade-off cold, stay on `pull_request`.

## Security notes

**Prompt injection is possible and bounded.** The PR description is untrusted text sent to a model, so it can carry instructions aimed at the model rather than at a reader — and whatever comes back is posted by a bot, which reviewers tend to trust more than the PR author's own words. The bound: an attacker can only do this on a pull request they already wrote, so they could have put the same text in the description directly. The comment always says the original is unchanged above, so a reviewer can compare.

**Token scope is minimal.** The workflow needs `contents: read` and `pull-requests: write`. The `GITHUB_TOKEN` cannot push code, and on fork PRs it is read-only with no secrets attached.

**No shell path.** The description is read from the event payload in JavaScript and never passed through a shell, so it cannot become workflow command injection.

**Cost is bounded.** Descriptions are truncated at 20,000 characters before being sent, runs are serialised per pull request, and fork PRs never receive your key.

## Development

```bash
npm install
npm run typecheck
npm test          # unit tests
npm run build     # bundles to dist/, which must be committed
npm run test:e2e  # runs the built bundle against stubbed APIs, no credentials
npm run all       # all of the above, in order
```

`npm run test:e2e` executes `dist/index.js` exactly as GitHub would, with the model and the GitHub API both stubbed on localhost, and asserts it creates one comment then edits that same comment. A broken bundle or entrypoint passes the unit tests and fails here.

`dist/index.js` is committed because GitHub Actions runs it directly. Rebuild it in the same commit as any `src/` change — CI fails if the bundle is stale.

## Credit

Original idea and prompt: [gvzdv/claudish-to-english](https://github.com/gvzdv/claudish-to-english). If you work in Claude Code, install that too — it does this for everything Claude says to you, locally, with no API calls leaving your machine.

MIT.

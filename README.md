# Claudish to English

A GitHub Action that rewrites agent-written pull request descriptions into plain English and posts the result as a comment.

This is a port of [**gvzdv/claudish-to-english**](https://github.com/gvzdv/claudish-to-english), a Claude Code plugin that does the same thing for assistant messages in your terminal using a local ollama model. The idea, and the rewrite prompt itself, are theirs. This moves it to CI, where one install covers every reviewer on the repo instead of one person's screen.

## Why

PR descriptions are increasingly written by coding agents, and they read like it — preamble, abstract nouns doing a verb's job, hedges that carry no information, a closing paragraph restating the opening one. Reviewers skim and lose the actual change.

The rewrite keeps every fact, name, number, and file path. It only changes how it reads.

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
      models: read
    steps:
      - uses: DylPorter/claudish-to-english-action@v1
```

That's the whole setup. **No API key, no secret, no account.** It runs on [GitHub Models](https://docs.github.com/en/github-models) using the workflow's built-in `GITHUB_TOKEN` — the `models: read` permission is what unlocks it.

The Action never touches your description. It posts one comment and edits that same comment on every push.

## Rate limits — read this before filing a bug

GitHub Models' free tier is rate limited **per user, per model, per day**. A busy repo will exhaust it.

When that happens the Action **goes quiet** — it logs a warning and exits successfully. It does not fail your build and it does not retry. If comments stop appearing, check the workflow log for a rate-limit warning before assuming something is broken.

To get past it, either enable paid inference in your GitHub settings, or point the Action at your own provider.

## Using your own model

`api-base` is any OpenAI-compatible endpoint, so this works with Anthropic, OpenAI, OpenRouter, or a self-hosted ollama:

```yaml
      - uses: DylPorter/claudish-to-english-action@v1
        with:
          api-base: https://api.anthropic.com/v1
          api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          model: claude-haiku-4-5
```

`api-key` and `github-token` are deliberately separate. The first authenticates the model; the second posts the comment. Setting one does not change the other.

## Inputs

| Input | Default | What it does |
|---|---|---|
| `model` | `openai/gpt-4o-mini` | Model id passed to the endpoint |
| `api-base` | `https://models.github.ai/inference` | OpenAI-compatible base URL |
| `api-key` | `${{ github.token }}` | Credential for the model |
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

## Fork pull requests

On `pull_request` events from a fork, GitHub issues a read-only token, so posting the comment will fail — you'll see a warning, and nothing else happens.

If you need it on fork PRs, switch the trigger to `pull_request_target`. This Action only reads PR metadata and never checks out or runs PR code, which avoids the usual reason `pull_request_target` is dangerous — but understand that trigger before you reach for it.

## Security notes

The PR description is untrusted text that gets sent to a model, so a description can contain instructions aimed at the model rather than at a reader. The blast radius is small — the worst case is a misleading comment on the pull request whose author wrote the injection in the first place, and the Action holds no secrets beyond the tokens you gave it. But it is worth knowing before you point this at a public repo.

The description is read from the event payload in JavaScript and never passed through a shell, so it cannot become workflow command injection.

## Development

```bash
npm install
npm run typecheck
npm test
npm run build     # bundles to dist/, which must be committed
```

`dist/index.js` is committed because GitHub Actions runs it directly. Rebuild it in the same commit as any `src/` change.

## Credit

Original idea and prompt: [gvzdv/claudish-to-english](https://github.com/gvzdv/claudish-to-english). If you work in Claude Code, install that too — it does this for everything Claude says to you, locally, with no API calls leaving your machine.

MIT.

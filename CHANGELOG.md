# Changelog

## v1.0.0 — 2026-08-11

First release. Ports [gvzdv/claudish-to-english](https://github.com/gvzdv/claudish-to-english) from a Claude Code display hook to a GitHub Action.

- Rewrites pull request descriptions into plain English and posts a sticky comment, edited in place on each push
- Works against any OpenAI-compatible endpoint — OpenAI, Anthropic, Groq, OpenRouter, or a self-hosted ollama
- Never fails a workflow run: every error path warns and exits 0
- Skips empty descriptions, descriptions below `min-chars` of prose (fenced code excluded), and PRs labelled `no-claudish`
- Does not skip bot authors, since agent-written PRs are the point

### Note on setup

This was designed against GitHub Models, which needed no API key — just the workflow's `GITHUB_TOKEN` and a `models: read` permission. GitHub Models was [retired on 30 July 2026](https://github.blog/changelog/2026-07-30-github-models-is-now-retired/) and the endpoint returns `410`, so `api-key` is required. If a keyless option returns, it goes back in as the default.

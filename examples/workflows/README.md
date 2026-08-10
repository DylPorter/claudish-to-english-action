# Workflows

These live here instead of `.github/workflows/` because the token used to create this repo lacked the `workflow` OAuth scope, which GitHub requires to push files into that directory.

To enable them:

```bash
gh auth refresh -s workflow          # interactive, opens a browser
mkdir -p .github/workflows
cp examples/workflows/ci.yml examples/workflows/claudish.yml .github/workflows/
git add .github/workflows
git commit -m "Enable CI and dogfood workflows"
git push
```

| File | What it does |
|---|---|
| `ci.yml` | Typecheck + tests on every push and PR, plus a guard that fails if the committed `dist/` bundle is out of date |
| `claudish.yml` | Dogfoods the Action on this repo's own pull requests using `uses: ./` |

`ci.yml`'s bundle check matters more than it looks: `dist/` is committed and executed directly by the runner, so a stale bundle ships broken code while every test still passes.

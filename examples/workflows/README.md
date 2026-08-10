# Example workflows

Copies of the workflows this repo runs on itself. Both are active in `.github/workflows/` — these exist so you can read them without digging, and copy the parts you want.

| File | What it does |
|---|---|
| `claudish.yml` | Runs the Action on this repo's own pull requests via `uses: ./`, so a regression shows up on the PR that caused it |
| `ci.yml` | Typecheck + tests on every push and PR, plus a guard that fails if the committed `dist/` bundle is out of date |

`ci.yml`'s bundle check matters more than it looks. `dist/` is committed and executed directly by the runner, so a stale bundle ships broken code while every test still passes.

To use the Action in your own repo, copy `claudish.yml`, drop the `actions/checkout` step, and point it at the published version:

```yaml
      - uses: DylPorter/claudish-to-english-action@v1
        with:
          api-key: ${{ secrets.OPENAI_API_KEY }}
```

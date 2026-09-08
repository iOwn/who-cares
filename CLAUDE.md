# WhoCares

## Git hooks

Never bypass git hooks. On a `lefthook` pre-commit or pre-push failure, fix the underlying
issue or report it to the user — do **not** pass `--no-verify` / `-n` to `git commit` or
`git push`. (Humans may; agents may not. See `docs/contributing.md`.) A `PreToolUse` hook
enforces this, but the rule stands regardless.

## Developing

When you are about to implement or develop something create a branch first. After you are finished with a development task create a PR.

## Agent skills

### Issue tracker

Issues and specs live as GitHub issues, managed via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

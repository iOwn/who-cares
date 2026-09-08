# WhoCares

## Git hooks

Never bypass git hooks. On a `lefthook` pre-commit or pre-push failure, fix the underlying
issue or report it to the user — do **not** pass `--no-verify` / `-n` to `git commit` or
`git push`. (Humans may; agents may not. See `docs/contributing.md`.) A `PreToolUse` hook
enforces this, but the rule stands regardless.

## Developing

When you are about to implement or develop something create a branch first. After you are finished with a development task create a PR.

## Next.js

The app is pinned to Next.js 16 (see `docs/adr/0004-serverless-vercel-stack-over-always-on-fly-io.md`).
Next 16 is newer than most agent training data, so when its API surface matters,
check the version's own bundled docs under `node_modules/next/dist/docs/` rather
than relying on memory.

`next.config.ts` sets `agentRules: false`. Next's `next dev` would otherwise
rewrite this file on every run (reflowing the whole thing through an 80-col
markdown formatter). The cost of opting out is that Next no longer injects its
own agent guidance here — so the pointer above is hand-maintained instead.

## Agent skills

### Issue tracker

Issues and specs live as GitHub issues, managed via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

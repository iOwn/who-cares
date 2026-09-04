# Contributing

## Commit messages

WhoCares uses [Conventional Commits](https://www.conventionalcommits.org/). The history is
kept clean by discipline — there is **no commitlint dependency and no commit-msg hook**
(WhoCares has no release automation to justify one; see
[issue #23](https://github.com/iOwn/who-cares/issues/23)).

Format:

```
<type>(<optional scope>): <summary>

<optional body>

<optional footer>
```

Types in use:

| Type | For |
| --- | --- |
| `feat` | a user-facing feature or behaviour change |
| `fix` | a bug fix |
| `docs` | documentation only (`CONTEXT.md`, ADRs, `SPEC.md`, this file) |
| `chore` | tooling, deps, config, housekeeping with no src behaviour change |
| `refactor` | code change that neither fixes a bug nor adds a feature |
| `test` | adding or correcting tests |
| `build` | build system, bundler, or `package.json` scripts |
| `ci` | GitHub Actions workflows and CI config |

Summary line: imperative mood, lower-case, no trailing period, aim for ≤ 72 chars.

## Git hooks

`lefthook` installs pre-commit (`biome check --write --staged`) and an optional pre-push
(`tsc --noEmit` + `vitest run`) on clone via the `prepare` script. See
[`docs/testing.md`](./testing.md#local-guardrails) for the full layer stack.

**Humans** may `git commit --no-verify` / `git push --no-verify` when genuinely in a hurry —
CI re-checks everything, so nothing rots silently. `LEFTHOOK=0` disables hooks in bulk.

**Agents must not bypass hooks** — on a hook failure, fix the issue or report it, never
`--no-verify`. This is enforced by a `PreToolUse` hook, not just convention.

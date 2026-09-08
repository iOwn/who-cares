/**
 * Tests for the deny-git-hook-bypass PreToolUse hook. Run with `node --test`
 * (see the `test:hooks` package.json script) — no test framework needed.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { bypassesGitHooks } from "./deny-git-hook-bypass.mjs";

const BLOCKED = [
  // --no-verify, long form
  'git commit --no-verify -m "wip"',
  "git push --no-verify",
  // -n on its own
  'git commit -n -m "wip"',
  "git push -n", // = --dry-run, but intentionally denied per issue wording
  // -n inside a combined short cluster (the regression this hook exists to stop)
  'git commit -nm "wip"',
  'git commit -vn -m "wip"',
  'git commit -nv -m "wip"',
  // LEFTHOOK env-var off-switch prefixed onto the command
  'LEFTHOOK=0 git commit -m "wip"',
  'LEFTHOOK=false git commit -m "wip"',
  "LEFTHOOK=off git push",
  // bypass survives being buried in a compound command
  'pnpm lint && git commit -nm "wip"',
  'git add -A && git commit --no-verify -m "wip"',
  "(git commit -nm x)",
];

const ALLOWED = [
  // ordinary commits / pushes
  'git commit -m "add feature"',
  "git push origin main",
  "git push --force-with-lease",
  // -am is add-all + message, no `n`
  'git commit -am "quick fix"',
  // --amend / --no-edit contain no bypass flag
  "git commit --amend --no-edit",
  // a literal "-n" / "--no-verify" inside the commit message is not the flag
  'git commit -m "document the -n / --no-verify flags"',
  "git commit -m 'skip with --no-verify (do not)'",
  // -n belongs to another program in the pipeline, not to git
  'find . -name "*.ts" && git commit -m "x"',
  'git log -n 5 && git commit -m "x"',
  'rg -n TODO && git commit -m "x"',
  "pnpm build -n",
  // LEFTHOOK toggle on an unrelated git command
  "LEFTHOOK=0 git status",
  // not a git command at all
  'echo "git commit -nm"',
];

for (const cmd of BLOCKED) {
  test(`blocks: ${cmd}`, () => {
    assert.equal(bypassesGitHooks(cmd), true);
  });
}

for (const cmd of ALLOWED) {
  test(`allows: ${cmd}`, () => {
    assert.equal(bypassesGitHooks(cmd), false);
  });
}

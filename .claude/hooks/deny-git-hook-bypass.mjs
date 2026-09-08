#!/usr/bin/env node
/**
 * Claude Code PreToolUse hook — denies any Bash command that bypasses git
 * hooks on `git commit` / `git push`:
 *   - `--no-verify`
 *   - `-n` (also inside a combined short cluster, e.g. `-nm`, `-vn`)
 *   - a `LEFTHOOK=0` / `LEFTHOOK=false` prefix
 * Agents must not skip hooks: fix or report a hook failure instead
 * (CLAUDE.md, docs/contributing.md). Humans are unaffected — this only gates
 * the agent's Bash tool.
 *
 * Reads the tool-call payload as JSON on stdin; exit 2 = deny (message to
 * Claude via stderr).
 */
let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  raw += chunk;
});
process.stdin.on("end", () => {
  let command = "";
  try {
    command = JSON.parse(raw)?.tool_input?.command ?? "";
  } catch {
    process.exit(0);
  }

  // Drop quoted spans (commit messages etc.) so a literal "-n" inside a
  // message is not mistaken for the flag.
  const bare = command.replace(/"[^"]*"/g, '""').replace(/'[^']*'/g, "''");

  const touchesGit = /\bgit\s+(commit|push)\b/.test(bare);
  const shortBypass = /(?:^|\s)-[a-zA-Z]*n[a-zA-Z]*(?:\s|=|$)/; // -n, -nm, -vn, ...
  const bypasses = /--no-verify/.test(bare) || shortBypass.test(bare);
  const disablesLefthook = /(?:^|\s)LEFTHOOK=(0|false|off)\b/i.test(bare);

  if ((touchesGit && bypasses) || (disablesLefthook && /\bgit\b/.test(bare))) {
    console.error(
      "Blocked: agents must not bypass git hooks (--no-verify / -n / LEFTHOOK=0) " +
        "on git commit/push.\n" +
        "Fix the underlying hook failure or report it — see CLAUDE.md.\n" +
        "(For a push dry-run, use `git push --dry-run`.)",
    );
    process.exit(2);
  }

  process.exit(0);
});

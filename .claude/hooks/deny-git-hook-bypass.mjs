#!/usr/bin/env node
/**
 * Claude Code PreToolUse hook — denies any Bash command that bypasses git
 * hooks (`--no-verify` or `-n` on `git commit` / `git push`). Agents must not
 * skip hooks: fix or report a hook failure instead (CLAUDE.md, docs/contributing.md).
 * Humans are unaffected — this only gates the agent's Bash tool.
 *
 * Reads the tool-call payload as JSON on stdin; exit 2 = deny (message goes to
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

  // Strip quoted spans (commit messages etc.) so a literal " -n " inside a
  // message is not mistaken for the short bypass flag.
  const bare = command.replace(/"[^"]*"/g, '""').replace(/'[^']*'/g, "''");

  const touchesGit = /\bgit\s+(commit|push)\b/.test(bare);
  const bypasses = /(--no-verify|(?:^|\s)-n(?:\s|$))/.test(bare);

  if (touchesGit && bypasses) {
    console.error(
      "Blocked: agents must not bypass git hooks (--no-verify / -n) on git commit/push.\n" +
        "Fix the underlying hook failure or report it — see CLAUDE.md.\n" +
        "(For a push dry-run, use `git push --dry-run`.)",
    );
    process.exit(2);
  }

  process.exit(0);
});

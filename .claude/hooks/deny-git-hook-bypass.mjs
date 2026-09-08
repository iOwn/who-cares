#!/usr/bin/env node
/**
 * Claude Code PreToolUse hook — denies any Bash command that bypasses git
 * hooks on `git commit` / `git push`:
 *   - `--no-verify`
 *   - `-n` (also inside a combined short cluster, e.g. `-nm`, `-vn`)
 *   - a `LEFTHOOK=0` / `LEFTHOOK=false` / `LEFTHOOK=off` prefix
 * Agents must not skip hooks: fix or report a hook failure instead
 * (CLAUDE.md, docs/contributing.md). Humans are unaffected — this only gates
 * the agent's Bash tool.
 *
 * Reads the tool-call payload as JSON on stdin; exit 2 = deny (message to
 * Claude via stderr).
 */
import { argv } from "node:process";
import { pathToFileURL } from "node:url";

const DENY_MESSAGE =
  "Blocked: agents must not bypass git hooks (--no-verify / -n / LEFTHOOK=0) " +
  "on git commit/push.\n" +
  "Fix the underlying hook failure or report it — see CLAUDE.md.\n" +
  "(For a push dry-run, use `git push --dry-run`.)";

/**
 * @param {string} command  the raw Bash command line
 * @returns {boolean}  true if the command bypasses git hooks and must be denied
 *
 * A bypass flag only counts when it sits in the same pipeline segment as the
 * `git commit` / `git push` it would apply to — so `find . -name x && git
 * commit -m y` (the `-name` is unrelated) is allowed, while `git commit -nm y`
 * is not.
 */
export function bypassesGitHooks(command) {
  // Blank quoted spans so a literal "-n" / "--no-verify" inside a commit
  // message is not mistaken for a real flag.
  const bare = command.replace(/"[^"]*"/g, '""').replace(/'[^']*'/g, "''");

  // Split on shell operators / grouping so each segment is one simple command.
  for (const segment of bare.split(/&&|\|\||[|;\n()&`]/)) {
    const tokens = segment.trim().split(/\s+/).filter(Boolean);

    // `git` immediately followed by `commit` or `push` (matches the historical
    // scope — `git -c … commit` is a known, accepted gap).
    const gitIdx = tokens.findIndex(
      (t, i) => t === "git" && (tokens[i + 1] === "commit" || tokens[i + 1] === "push"),
    );
    if (gitIdx === -1) continue;

    // Env-var assignments prefixed onto this command.
    const disablesLefthook = tokens
      .slice(0, gitIdx)
      .some((t) => /^LEFTHOOK=(0|false|off)$/i.test(t));

    // Flags that belong to the git subcommand (everything after it).
    const bypassFlag = tokens.slice(gitIdx + 2).some(
      (t) =>
        t === "--no-verify" ||
        // single-dash short cluster containing `n`: -n, -nm, -vn, ...
        /^-[a-zA-Z]*n[a-zA-Z]*$/.test(t),
    );

    if (bypassFlag || disablesLefthook) return true;
  }

  return false;
}

// Run as a hook only when executed directly (not when imported by a test).
if (argv[1] && import.meta.url === pathToFileURL(argv[1]).href) {
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

    if (bypassesGitHooks(command)) {
      console.error(DENY_MESSAGE);
      process.exit(2);
    }

    process.exit(0);
  });
}

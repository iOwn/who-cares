#!/usr/bin/env node
/**
 * Claude Code PostToolUse hook — runs `biome check --write` on the file an
 * Edit / Write / MultiEdit just touched. Auto-fixes land immediately; a
 * remaining (non-auto-fixable) violation exits 2 so Claude fixes its own lint
 * before continuing. See docs/testing.md "Local guardrails" layer 1.
 *
 * Reads the tool-call payload as JSON on stdin; only acts on JS/TS/JSON/CSS.
 * Invokes Biome's own Node entrypoint directly (no shell, no `pnpm exec`
 * resolution) so paths with spaces are safe and the per-edit cost is minimal.
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const FIXABLE = /\.(m?[jt]sx?|cjs|jsonc?|css)$/;

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  raw += chunk;
});
process.stdin.on("end", () => {
  let filePath = "";
  try {
    filePath = JSON.parse(raw)?.tool_input?.file_path ?? "";
  } catch {
    process.exit(0);
  }

  if (!filePath || !FIXABLE.test(filePath)) process.exit(0);

  let biomeBin;
  try {
    biomeBin = require.resolve("@biomejs/biome/bin/biome");
  } catch {
    // Biome not installed (e.g. deps not yet fetched) — don't block the edit.
    process.exit(0);
  }

  const result = spawnSync(
    process.execPath,
    [biomeBin, "check", "--write", "--no-errors-on-unmatched", filePath],
    { stdio: "inherit" },
  );

  process.exit(result.status === 0 ? 0 : 2);
});

#!/usr/bin/env node
/**
 * Claude Code PostToolUse hook — runs `biome check --write` on the file an
 * Edit / Write / MultiEdit just touched. Auto-fixes land immediately; a
 * remaining (non-auto-fixable) violation exits 2 so Claude fixes its own lint
 * before continuing. See docs/testing.md "Local guardrails" layer 1.
 *
 * Reads the tool-call payload as JSON on stdin; only acts on JS/TS/JSON/CSS.
 */
import { spawnSync } from "node:child_process";

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

  const result = spawnSync(
    "pnpm",
    ["exec", "biome", "check", "--write", "--no-errors-on-unmatched", filePath],
    { stdio: "inherit", shell: process.platform === "win32" },
  );

  process.exit(result.status === 0 ? 0 : 2);
});

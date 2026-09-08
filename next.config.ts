import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next 16's `next dev` otherwise rewrites CLAUDE.md on every run (reflowing the
  // whole file through an 80-col markdown formatter, which mangles existing prose).
  // Keep the repo's agent docs hand-maintained instead; CLAUDE.md's "Next.js"
  // section carries the pointer to `node_modules/next/dist/docs/` that this
  // opt-out would otherwise inject. Rationale recorded on issue #35.
  agentRules: false,
};

export default nextConfig;

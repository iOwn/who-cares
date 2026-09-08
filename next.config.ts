import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next 16's `next dev` otherwise rewrites CLAUDE.md on every run (reflowing the
  // whole file through an 80-col markdown formatter, which mangles existing prose).
  // Keep the repo's agent docs hand-maintained instead. See issue #35 discussion.
  agentRules: false,
};

export default nextConfig;

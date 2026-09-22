import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next.js 16 auto-writes AGENTS.md/CLAUDE.md on `next dev`/`next build`.
  // Disabled: this repo manages its own CLAUDE.md conventions.
  agentRules: false,
};

export default nextConfig;

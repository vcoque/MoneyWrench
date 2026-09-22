import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next.js 16 auto-writes AGENTS.md/CLAUDE.md on `next dev`/`next build`.
  // Disabled: this repo manages its own CLAUDE.md conventions.
  agentRules: false,
  experimental: {
    serverActions: {
      // Task 12 (CSV import): the default 1MB server-action body limit is
      // too small for a bank CSV export, and the column-mapping step's
      // submit round-trips the FULL CSV text back as a hidden field on top
      // of the original upload. 10MB comfortably covers a large personal
      // transaction history export.
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;

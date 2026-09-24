import { defineConfig, devices } from "@playwright/test";
import { loadEnv } from "vite";

// The dev server this config spawns (see `webServer` below) loads .env
// itself, same as any other `next dev` invocation. This process — the one
// actually running the test file, which talks to Postgres directly for
// its own setup/teardown (see tests/e2e/happy-path.spec.ts) — does not get
// .env for free, so load it the same explicit way vitest.config.mts does.
Object.assign(process.env, loadEnv("development", process.cwd(), ""));

// A dedicated, non-default port: this suite must never collide with a
// `next dev` a developer already has running on 3000 while iterating.
const PORT = 3100;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  // A single, sequential happy-path flow (Task 17) — no benefit to
  // parallelizing across workers, and running serially keeps webServer
  // startup simple.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run dev -- -p ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});

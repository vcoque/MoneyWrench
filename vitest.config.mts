import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig(({ mode }) => {
  // Vite's dev server loads .env into `process.env` automatically, but
  // vitest doesn't — DB-backed tests (e.g. the accounts household-scoping
  // test) need DATABASE_URL, so load it explicitly the same way Next.js
  // does. Uses the empty prefix so unprefixed vars like DATABASE_URL are
  // included (Vite only auto-exposes VITE_-prefixed vars otherwise).
  Object.assign(process.env, loadEnv(mode, process.cwd(), ""));

  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "."),
      },
    },
    test: {
      environment: "jsdom",
      setupFiles: ["./tests/setup.ts"],
      include: ["tests/**/*.test.{ts,tsx}"],
    },
  };
});

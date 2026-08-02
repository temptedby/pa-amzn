import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Resolve the "@/*" path alias from tsconfig so unit tests can import app modules
// (e.g. ad-engine.ts -> "@/lib/db/client"). DB access is lazy, so importing is side-effect free.
export default defineConfig({
  test: {
    // The unit suite is src/ only. scripts/ holds one-off LIVE harnesses that make real Amazon API
    // calls (scripts/live-reintro-preview.spec.mts) — they must never run in the default suite or
    // in CI, where they would hang on Amazon's report queue. Run those explicitly:
    //   npx vitest run --include 'scripts/live-reintro-preview.spec.mts' --testTimeout=3600000
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});

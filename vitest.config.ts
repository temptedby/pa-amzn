import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Resolve the "@/*" path alias from tsconfig so unit tests can import app modules
// (e.g. ad-engine.ts -> "@/lib/db/client"). DB access is lazy, so importing is side-effect free.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});

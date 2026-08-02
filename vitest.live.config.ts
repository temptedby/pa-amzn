import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// LIVE harness config — separate from vitest.config.ts on purpose. The specs under scripts/ make
// real Amazon API calls, so they must never be reachable from the default unit run or from CI.
//   REINTRO_OUT=/tmp/x.txt npx vitest run --config vitest.live.config.ts --testTimeout=600000
export default defineConfig({
  test: { include: ["scripts/**/*.spec.mts"] },
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
});

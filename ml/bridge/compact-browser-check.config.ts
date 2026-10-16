import { defineConfig, devices } from "@playwright/test";

/** Runs only `compact-browser-check.e2e.ts`, which needs a model pack in the build. */
export default defineConfig({
  testDir: ".",
  testMatch: "compact-browser-check.e2e.ts",
  reporter: "line",
  use: { ...devices["Desktop Chrome"], screenshot: "only-on-failure" },
});

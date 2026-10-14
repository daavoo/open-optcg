import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // `dist-tsc` holds `tsc`'s emit, including compiled copies of every test.
    // Vitest's defaults exclude `dist` but not this, and running both copies
    // doubles the suite and halves the time budget each copy gets.
    //
    // `.claude/worktrees` and `worktrees` both hold agent worktrees: whole
    // checkouts of this repo, each with its own copy of every test. Globbing
    // them does not just multiply the suite, it reports failures that are not
    // about this checkout at all -- `browser-parity` and `web-controller`
    // assert against whatever stale bundle that worktree last built. A bare
    // `pnpm test` was reporting 15 failures across 970 files on a tree whose
    // own 111 files all passed; once a second worktree root appeared beside
    // the first, 146 across 4413.
    exclude: [
      ...configDefaults.exclude,
      "dist-tsc/**",
      ".claude/worktrees/**",
      "worktrees/**",
    ],
    /**
     * Vitest's 5s default is a unit-test budget, and most tests here play real
     * games: a scenario test that drives the engine to a decision is doing work
     * measured in seconds, not milliseconds. Leaving the default meant every
     * such test carried its own number, each one guessed once and then quietly
     * outgrown as the card pool grew -- three of them went red on CI in the
     * same run. 30s is the floor for all of them; the two whole-format
     * simulations that need more say so at the test.
     */
    testTimeout: 30_000,
    // Loads the gitignored printed-text cache, when present, before any test.
    setupFiles: ["test/support/printed-text-setup.ts"],
    /**
     * `@mozilla-ai/otari@0.4.0` declares `"type": "module"` but its
     * OpenAPI-generated `_client` emits extensionless relative imports (`from
     * "./runtime"`), which Node's ESM loader cannot resolve -- plain
     * `import("@mozilla-ai/otari")` fails. Every tool here runs through `tsx`
     * and the web bundle through `esbuild`, both of which resolve it like a
     * bundler, so only Vitest trips: it externalises `node_modules` and hands
     * them to Node.
     *
     * Inlining routes the package through Vite's resolver instead. It also makes
     * Vitest read the sourcemap the package ships for each of its ~200 generated
     * files, whose `sources` are absent from the tarball, so a run that touches
     * the gateway client prints "points to missing source files" warnings before
     * its results -- noise, not failure. `deps.optimizer.ssr` would prebundle
     * past both, but cannot resolve a dependency declared in a workspace package
     * rather than at the root. Drop all of this once upstream ships extensions.
     */
    server: { deps: { inline: ["@mozilla-ai/otari"] } },
  },
});

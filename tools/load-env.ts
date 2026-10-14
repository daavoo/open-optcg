import { existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Loads `.env` into `process.env`.
 *
 * The scripts that need provider credentials are run through `tsx` from
 * `package.json`, so the alternative is a `--env-file` flag repeated on every
 * script that grows an LLM call -- and silently missing from the ones that grew
 * one later. Calling this instead keeps the requirement with the code that has
 * it: a script that reads `LLM_MODEL` says so at the top of its own body.
 *
 * Absent file is not an error, because CI and the browser build run these
 * without one. Variables already in the environment win, matching `--env-file`,
 * so `LLM_MODEL=x pnpm ...` still overrides the file for one run.
 */
export function loadDotEnv(file = ".env"): void {
  const path = resolve(file);
  if (existsSync(path)) process.loadEnvFile(path);
}

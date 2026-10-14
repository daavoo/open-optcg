/**
 * `pnpm web:serve`. A separate entry point so `serve-web.ts` can be imported
 * without starting a server.
 */
import { main } from "./serve-web.js";

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

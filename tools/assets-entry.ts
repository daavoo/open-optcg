// Entry point of the packaged asset downloader (`pnpm assets:package`): the
// same tool as `pnpm assets:download`, bundled into one executable so a player
// without Node can build their asset pack by double-clicking it.
import { main } from "./download-assets.js";

main(process.argv.slice(2)).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

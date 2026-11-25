/**
 * The command-line entry for the bridge (`pnpm optcgsim:bridge`).
 *
 *   pnpm optcgsim:bridge [--port 7788] [--model path] [--adapters dir]
 *                        [--record dir] [--blind p1|p2] [--offline]
 *
 * The launcher (`tools/optcgsim/launcher/`) starts the same server in-process
 * with its own window; this is the shape the README and the tests use.
 */
import { startBridge } from "./bridge.js";

function flag(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1]! : fallback;
}

const blind = flag("blind", "");
const bridge = await startBridge({
  port: Number(flag("port", "7788")),
  ...(flag("model", "") ? { modelPath: flag("model", "") } : {}),
  ...(flag("adapters", "") ? { adapterDir: flag("adapters", "") } : {}),
  ...(flag("record", "") ? { recordDir: flag("record", "") } : {}),
  ...(blind === "p1" || blind === "p2" ? { blind } : {}),
  offline: process.argv.includes("--offline"),
  log: (line) => {
    console.log(line);
  },
});
console.log(`OPTCGSim bridge on ${bridge.info.url} with ${bridge.info.model}`);

/**
 * The launcher: a local page that installs the bridge and plays the sim.
 *
 * It is one small HTTP server on 127.0.0.1. The page (`ui.ts`) is served from
 * it, the buttons call its API, and "Play" starts the bridge in-process on the
 * port the plugin expects and then starts the sim through BepInEx's own script.
 * Keeping the bridge in the same process means the model it resolved and the
 * port it bound are what the page shows, and stopping the launcher stops both.
 */
import { existsSync } from "node:fs";
import { createServer, type ServerResponse } from "node:http";
import { ensureBridge, type Bridge } from "../bridge.js";
import { Github, type ReleaseClient } from "../github.js";
import { modelStatus, releaseSourceOf } from "../model-source.js";
import { modelCacheDir } from "../paths.js";
import {
  BRIDGE_TAG_PREFIX,
  installSim,
  installedState,
  type InstallResult,
} from "./install.js";
import {
  bundledPluginPath,
  findSimDir,
  isSimDir,
  launchSim,
  platformOf,
  simMarker,
  type Platform,
} from "./platform.js";
import { launcherPage } from "./ui.js";

/** The launcher's page; the bridge takes the port above it. */
export const LAUNCHER_PORT = 7787;

export interface LauncherOptions {
  /** The sim folder; defaults to the recorded one, then a search. */
  simDir?: string;
  /** The launcher page's port. */
  port?: number;
  /** The bridge's port, which the plugin is configured with. */
  bridgePort?: number;
  platform?: Platform;
  github?: ReleaseClient;
  /** Where the install record lives; defaults to the app-support folder. */
  statePath?: string;
  /** How the sim is started; injectable so a test does not open one. */
  launchSim?: (simDir: string, platform: Platform) => void;
  /** Where downloaded models live; defaults to the app-support folder. */
  cacheDir?: string;
  /** Called for every line the page's log shows. */
  log?: (line: string) => void;
}

export interface Launcher {
  url: string;
  simDir: string | undefined;
  close(): Promise<void>;
}

export async function startLauncher(
  options: LauncherOptions = {},
): Promise<Launcher> {
  const platform = options.platform ?? platformOf();
  const port = options.port ?? LAUNCHER_PORT;
  const bridgePort = options.bridgePort ?? 7788;
  const cacheDir = options.cacheDir ?? modelCacheDir();
  const github = options.github ?? new Github("daavoo/open-optcg");
  const lines: string[] = [];
  const listeners = new Set<ServerResponse>();
  const log = (line: string): void => {
    lines.push(line);
    if (lines.length > 500) lines.shift();
    for (const listener of listeners) listener.write(`data: ${line}\n\n`);
    options.log?.(line);
  };

  let simDir = resolveSimDir(options.simDir, platform, options.statePath);
  let bridge: Bridge | undefined;
  // False when the bridge on the port was started by something else -- a
  // leftover from a terminal, say -- and this launcher is only borrowing it.
  let bridgeOwned = true;

  /** The bridge to play through, adopting one already on the port. */
  async function bridgeForPlay(): Promise<Bridge> {
    if (bridge) return bridge;
    const ensured = await ensureBridge({ port: bridgePort, cacheDir, log });
    bridge = ensured.bridge;
    bridgeOwned = ensured.owned;
    return bridge;
  }

  const status = async (): Promise<unknown> => {
    const recorded = installedState(options.statePath);
    const model = await modelStatus({
      cacheDir,
      source: releaseSourceOf(github),
      offline: false,
    });
    // One release listing per run (the client caches it), so polling the
    // status does not spend the anonymous rate limit.
    const latestBridge = await latestBridgeTag(github);
    return {
      simDir,
      platform,
      installed: recorded !== undefined,
      bridge: recorded?.bridge ?? null,
      /** The newest `bridge-*` release, so the page can offer an update. */
      latestBridge,
      updateAvailable:
        recorded !== undefined &&
        latestBridge !== null &&
        recorded.bridge !== latestBridge,
      bridgeRunning: bridge !== undefined,
      bridgeUrl: bridge?.info.url ?? null,
      /** False when the bridge was already running and this launcher borrows it. */
      bridgeOwned,
      model: bridge
        ? { release: bridge.info.release, model: bridge.info.model }
        : model.cached
          ? { release: model.cached, model: "(cached; starts on Play)" }
          : null,
      published: model.published,
      cached: model.cached,
    };
  };

  const server = createServer((request, response) => {
    const json = (status: number, body: unknown): void => {
      response.writeHead(status, { "Content-Type": "application/json" });
      response.end(JSON.stringify(body));
    };
    const url = request.url ?? "/";
    if (request.method === "GET" && url === "/") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(launcherPage());
      return;
    }
    if (request.method === "GET" && url === "/api/events") {
      response.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      response.write(`data: ${lines.slice(-50).join("\ndata: ")}\n\n`);
      listeners.add(response);
      request.on("close", () => listeners.delete(response));
      return;
    }
    if (request.method === "GET" && url === "/api/status") {
      status().then(
        (body) => {
          json(200, body);
        },
        (error: unknown) => {
          json(500, { error: message(error) });
        },
      );
      return;
    }
    if (request.method !== "POST") {
      json(404, {
        error: "GET /api/status, GET /api/events, POST /api/install",
      });
      return;
    }
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const body = parse(chunks);
      void handle(url, body).then(
        (result) => {
          json(200, result);
        },
        (error: unknown) => {
          json(400, { error: message(error) });
        },
      );
    });

    async function handle(
      path: string,
      body: Record<string, unknown>,
    ): Promise<unknown> {
      if (path === "/api/sim-dir") {
        const wanted = text(body.simDir);
        if (!wanted) throw new Error("give a folder");
        if (!isSimDir(wanted, platform)) {
          throw new Error(`no ${simMarker(platform)} in ${wanted}`);
        }
        simDir = wanted;
        return { simDir };
      }
      if (path === "/api/install") {
        const wanted = text(body.simDir) || simDir;
        if (!wanted) throw new Error("no sim folder to install into");
        simDir = wanted;
        // A macOS `.app` carries its plugin, so a download installs with no
        // release and no network.
        const bundled = bundledPluginPath();
        const result: InstallResult = await installSim({
          simDir: wanted,
          platform,
          github,
          ...(options.statePath ? { statePath: options.statePath } : {}),
          ...(bundled ? { bundledPlugin: bundled } : {}),
          log,
        });
        log(
          `installed ${result.bridge}: BepInEx ${result.bepinexInstalled ? "added" : "kept"}, plugin ${result.pluginInstalled ? "written" : "kept"}`,
        );
        return result;
      }
      if (path === "/api/play") {
        if (!simDir) throw new Error("no sim folder; install first");
        bridge = await bridgeForPlay();
        (options.launchSim ?? launchSim)(simDir, platform);
        log(`started ${simMarker(platform)}`);
        return { bridge: bridge.info };
      }
      if (path === "/api/stop") {
        if (bridge && !bridgeOwned) {
          log(
            `the bridge on ${bridgePort} was started elsewhere; stop it there`,
          );
          return { stopped: false, external: true };
        }
        await bridge?.close();
        bridge = undefined;
        log("bridge stopped");
        return { stopped: true };
      }
      if (path === "/api/quit") {
        // The page is the only window a `.app` has, so it needs a way out:
        // closing the bridge and the server leaves nothing to quit from.
        await bridge?.close();
        bridge = undefined;
        log("quitting");
        setTimeout(() => process.exit(0), 50);
        return { quit: true };
      }
      throw new Error(`unknown endpoint ${path}`);
    }
  });

  await new Promise<void>((resolve) =>
    server.listen(port, "127.0.0.1", resolve),
  );
  // `port: 0` asks the OS for one, which is what a test does; the URL has to
  // carry the port that was actually bound, not the one that was asked for.
  const address = server.address();
  const bound =
    typeof address === "object" && address !== null ? address.port : port;
  const url = `http://127.0.0.1:${bound}`;
  log(`launcher on ${url}`);
  return {
    url,
    simDir,
    close: async () => {
      await bridge?.close();
      await new Promise<void>((resolve) =>
        server.close(() => {
          resolve();
        }),
      );
    },
  };
}

function latestBridgeTag(github: ReleaseClient): Promise<string | null> {
  return github
    .newest(BRIDGE_TAG_PREFIX)
    .then((release) => release?.tag ?? null)
    .catch(() => null);
}

function resolveSimDir(
  wanted: string | undefined,
  platform: Platform,
  statePath: string | undefined,
): string | undefined {
  if (wanted) return wanted;
  const recorded = installedState(statePath)?.simDir;
  if (recorded && existsSync(recorded)) return recorded;
  return findSimDir(platform);
}

function parse(chunks: Buffer[]): Record<string, unknown> {
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<
      string,
      unknown
    >;
  } catch {
    return {};
  }
}

/** A JSON body's field as text; anything that is not a string is empty. */
function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

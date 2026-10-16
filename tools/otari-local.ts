/**
 * Run a local otari gateway for this project to talk to.
 *
 * The gateway (https://github.com/mozilla-ai/otari) is an OpenAI-compatible
 * proxy: provider keys stay inside it, and this project authenticates with a
 * gateway-issued `gw-` key instead. That is worth the extra hop locally because
 * it is where per-run cost attribution and provider switching come from, and
 * because it exercises the same path a deployed setup would use.
 *
 * Subcommands: `up`, `down`, `key`, `env`, `status`.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

const CONTAINER = "otari-local";
const IMAGE = "mzdotai/otari:latest";
const PORT = Number(process.env.OTARI_PORT ?? 8000);
const HEALTH_TIMEOUT_MS = 90_000;

/**
 * The gateway needs pricing data to record usage, and a provider credential to
 * reach anything real. `default_pricing` covers the first; the provider block is
 * emitted only when a key exists, so `up` still works for wiring checks without
 * one (requests then fail at the provider hop with a clear 502).
 */
function configYaml(): string {
  const lines = ["default_pricing: true"];
  const providers: string[] = [];
  if (process.env.OPENAI_API_KEY) {
    providers.push(`  openai:\n    api_key: ${process.env.OPENAI_API_KEY}`);
  }
  if (process.env.ANTHROPIC_API_KEY) {
    providers.push(
      `  anthropic:\n    api_key: ${process.env.ANTHROPIC_API_KEY}`,
    );
  }
  if (process.env.OTARI_PROVIDER_API_BASE) {
    // Point the openai provider at an OpenAI-compatible endpoint of your own
    // (a stub, llama.cpp, vLLM). From inside the container the host is
    // `host.docker.internal`, not `localhost`.
    providers.push(
      `  openai:\n    api_key: ${process.env.OPENAI_API_KEY ?? "local-stub-key"}\n    api_base: "${process.env.OTARI_PROVIDER_API_BASE}"`,
    );
  }
  if (providers.length > 0) lines.push("providers:", ...providers);
  return lines.join("\n");
}

async function docker(args: string[]): Promise<string> {
  const { stdout } = await run("docker", args, { maxBuffer: 32 * 1024 * 1024 });
  return stdout.trim();
}

async function containerRunning(): Promise<boolean> {
  const out = await docker([
    "ps",
    "--filter",
    `name=^/${CONTAINER}$`,
    "--format",
    "{{.Names}}",
  ]);
  return out.split("\n").includes(CONTAINER);
}

/** The bootstrap `gw-` key the gateway prints on its first run. */
async function bootstrapKey(): Promise<string | undefined> {
  const logs = await docker(["logs", CONTAINER]).catch(() => "");
  return /gw-[A-Za-z0-9_-]+/.exec(logs)?.[0];
}

async function waitForHealth(): Promise<void> {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  for (;;) {
    try {
      const response = await fetch(`http://localhost:${PORT}/health`);
      if (response.ok) return;
    } catch {
      // Not listening yet.
    }
    if (Date.now() > deadline) {
      throw new Error(
        `OTARI_NOT_HEALTHY: no healthy /health on port ${PORT} within ${HEALTH_TIMEOUT_MS}ms. Check \`docker logs ${CONTAINER}\`.`,
      );
    }
    await new Promise((done) => setTimeout(done, 1000));
  }
}

function reportEnv(key: string): void {
  console.log(
    [
      "",
      "Run this project against it:",
      "",
      `  export GATEWAY_API_BASE=http://localhost:${PORT}`,
      `  export GATEWAY_API_KEY=${key}`,
      "  export LLM_MODEL=openai:gpt-5-mini   # models are provider-prefixed here",
      "",
      "  pnpm matchup:llm   # or pnpm trace:shadow",
      "",
      "Unset OPENAI_API_KEY in that shell, or set LLM_PROVIDER=otari, so the",
      "gateway transport is selected rather than a direct provider call.",
    ].join("\n"),
  );
}

async function up(): Promise<void> {
  if (await containerRunning()) {
    console.log(`${CONTAINER} is already running on port ${PORT}.`);
    const existing = await bootstrapKey();
    if (existing) reportEnv(existing);
    return;
  }
  await docker(["rm", "-f", CONTAINER]).catch(() => "");
  const hasProvider = Boolean(
    process.env.OPENAI_API_KEY ??
    process.env.ANTHROPIC_API_KEY ??
    process.env.OTARI_PROVIDER_API_BASE,
  );
  console.log(
    `Starting ${CONTAINER} on port ${PORT}${hasProvider ? "" : " (no provider credential found: requests will 502 at the provider hop)"}...`,
  );
  await docker([
    "run",
    "-d",
    "--name",
    CONTAINER,
    "-p",
    `${PORT}:8000`,
    "-e",
    `OTARI_MASTER_KEY=${process.env.OTARI_MASTER_KEY ?? "local-dev-master-key"}`,
    "-e",
    `OTARI_CONFIG_YAML=${configYaml()}`,
    IMAGE,
    "otari",
    "serve",
  ]);
  await waitForHealth();
  const key = await bootstrapKey();
  if (!key) {
    throw new Error(
      `OTARI_NO_BOOTSTRAP_KEY: the gateway started but printed no gw- key. Check \`docker logs ${CONTAINER}\`.`,
    );
  }
  console.log(`Healthy. Bootstrap key: ${key}`);
  reportEnv(key);
}

async function main(): Promise<void> {
  const command = process.argv[2] ?? "up";
  switch (command) {
    case "up":
      await up();
      return;
    case "down":
      await docker(["rm", "-f", CONTAINER]).catch(() => "");
      console.log(`Removed ${CONTAINER}.`);
      return;
    case "status": {
      const running = await containerRunning();
      console.log(
        running
          ? `${CONTAINER} running on port ${PORT}.`
          : `${CONTAINER} not running.`,
      );
      return;
    }
    case "key": {
      const key = await bootstrapKey();
      if (!key) throw new Error("OTARI_NO_BOOTSTRAP_KEY: is the gateway up?");
      console.log(key);
      return;
    }
    case "env": {
      const key = await bootstrapKey();
      if (!key) throw new Error("OTARI_NO_BOOTSTRAP_KEY: is the gateway up?");
      // Shell-evaluable, for `eval "$(pnpm --silent otari:env)"`.
      console.log(`export GATEWAY_API_BASE=http://localhost:${PORT}`);
      console.log(`export GATEWAY_API_KEY=${key}`);
      console.log("unset OPENAI_API_KEY");
      return;
    }
    default:
      throw new Error(
        `UNKNOWN_COMMAND: ${command} (expected up, down, status, key, or env)`,
      );
  }
}

await main();

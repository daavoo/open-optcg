/**
 * The launcher's window: one page, no build step, no network.
 *
 * It is a local page served by the launcher rather than a native window so the
 * same code runs on macOS and Windows, and so the whole UI is one file a
 * contributor can read. The buttons are the launcher's own HTTP API, which is
 * also what `pnpm bridge:install` calls, so nothing is reachable only through
 * the page.
 */
export function launcherPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>open-optcg — OPTCGSim bridge</title>
<style>
  :root { color-scheme: dark; --ink: #f4f1ea; --dim: #9a958c; --line: #2b2a28;
          --bg: #141312; --panel: #1c1b19; --accent: #e8b13c; --bad: #e06c5a; }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink);
         font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { max-width: 46rem; margin: 0 auto; padding: 3rem 1.25rem 4rem; }
  h1 { font-size: 1.5rem; margin: 0 0 .25rem; }
  p.lede { color: var(--dim); margin: 0 0 2rem; }
  section { background: var(--panel); border: 1px solid var(--line);
            border-radius: 12px; padding: 1.25rem; margin-bottom: 1rem; }
  h2 { font-size: .8rem; letter-spacing: .08em; text-transform: uppercase;
       color: var(--dim); margin: 0 0 .75rem; }
  dl { display: grid; grid-template-columns: 9rem 1fr; gap: .35rem 1rem; margin: 0; }
  dt { color: var(--dim); }
  dd { margin: 0; word-break: break-all; }
  .row { display: flex; gap: .5rem; flex-wrap: wrap; margin-top: 1rem; }
  input[type=text] { flex: 1 1 18rem; background: var(--bg); color: var(--ink);
      border: 1px solid var(--line); border-radius: 8px; padding: .55rem .7rem;
      font: inherit; }
  button { background: var(--accent); color: #201c10; border: 0; border-radius: 8px;
      padding: .55rem 1rem; font: inherit; font-weight: 600; cursor: pointer; }
  button.secondary { background: transparent; color: var(--ink);
      border: 1px solid var(--line); font-weight: 500; }
  button:disabled { opacity: .5; cursor: default; }
  .pill { display: inline-block; padding: .1rem .5rem; border-radius: 999px;
      border: 1px solid var(--line); font-size: .85rem; }
  .ok { color: var(--accent); } .bad { color: var(--bad); }
  #log { font: 12px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace;
      white-space: pre-wrap; color: var(--dim); max-height: 12rem; overflow: auto;
      margin: .75rem 0 0; }
</style>
</head>
<body>
<main>
  <h1>open-optcg bridge</h1>
  <p class="lede">Play OPTCGSim against the learned model. The launcher installs
    BepInEx and the plugin beside your sim, keeps the model current, and runs
    the bridge while you play.</p>

  <section>
    <h2>Status</h2>
    <dl>
      <dt>Sim folder</dt><dd id="sim">—</dd>
      <dt>Bridge</dt><dd id="bridge">—</dd>
      <dt>Model</dt><dd id="model">—</dd>
    </dl>
    <p id="hint" class="lede" style="display:none;margin:.9rem 0 0"></p>
    <div class="row">
      <button id="install">Install / update</button>
      <button id="play" class="secondary">Play</button>
      <button id="stop" class="secondary">Stop</button>
      <button id="quit" class="secondary">Quit</button>
    </div>
    <pre id="log"></pre>
  </section>

  <section>
    <h2>Sim folder</h2>
    <p class="lede" style="margin-bottom:.75rem">The folder holding
      <code>OPTCGSim.app</code> / <code>OPTCGSim.exe</code>. Leave blank to
      search the usual places.</p>
    <div class="row">
      <input id="dir" type="text" placeholder="/Applications/OPTCGSim" spellcheck="false">
      <button id="save" class="secondary">Use this folder</button>
    </div>
  </section>
</main>
<script>
const $ = (id) => document.getElementById(id);
const log = (line) => { $("log").textContent += line + "\\n"; $("log").scrollTop = 1e9; };
const call = async (path, body) => {
  const response = await fetch(path, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : undefined);
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error || response.statusText);
  return json;
};
async function refresh() {
  try {
    const status = await call("/api/status");
    $("sim").textContent = status.simDir || "not found";
    $("bridge").textContent = status.installed
      ? status.bridge +
        (status.bridgeRunning
          ? " (running on " + status.bridgeUrl +
            (status.bridgeOwned === false ? ", started elsewhere" : "") + ")"
          : "") +
        (status.updateAvailable ? " — " + status.latestBridge + " is available" : "")
      : "not installed";
    $("bridge").className = status.installed ? "ok" : "bad";
    $("model").textContent = status.model
      ? status.model.release + " (" + status.model.model + ")" +
        (status.published && status.published !== status.model.release
          ? " — " + status.published + " will be fetched on Play"
          : "")
      : "not fetched yet";
    $("install").textContent = status.updateAvailable ? "Update" : "Install";
    if (!status.simDir) {
      const marker = status.platform === "windows" ? "OPTCGSim.exe" : "OPTCGSim.app";
      $("hint").style.display = "block";
      $("hint").textContent =
        "OPTCGSim was not found. Paste the folder that holds " + marker +
        " above and press Use this folder.";
    } else if (!status.installed) {
      $("hint").style.display = "block";
      $("hint").textContent =
        "Press Install to put the bridge beside your sim, then Play.";
    } else {
      $("hint").style.display = "none";
    }
    $("install").disabled = !status.simDir;
    if (document.activeElement !== $("dir")) $("dir").value = status.simDir || "";
    $("play").disabled = !status.installed || status.bridgeRunning;
    $("stop").disabled = !status.bridgeRunning;
  } catch (error) { log("status: " + error.message); }
}
$("install").onclick = async () => {
  $("install").disabled = true;
  try { await call("/api/install", { simDir: $("dir").value.trim() || undefined }); }
  catch (error) { log("install: " + error.message); }
  $("install").disabled = false;
  refresh();
};
$("save").onclick = async () => {
  try { await call("/api/sim-dir", { simDir: $("dir").value.trim() }); refresh(); }
  catch (error) { log("folder: " + error.message); }
};
$("play").onclick = async () => {
  try { await call("/api/play"); } catch (error) { log("play: " + error.message); }
  refresh();
};
$("stop").onclick = async () => {
  try { await call("/api/stop"); } catch (error) { log("stop: " + error.message); }
  refresh();
};
$("quit").onclick = async () => {
  try { await call("/api/quit"); } catch (error) { log("quit: " + error.message); }
  document.body.innerHTML = '<main><h1>Bridge stopped</h1>' +
    '<p class="lede">You can close this tab.</p></main>';
};
// The launcher streams its own progress into the page's log.
const events = new EventSource("/api/events");
events.onmessage = (message) => log(message.data);
refresh();
setInterval(refresh, 5000);
</script>
</body>
</html>
`;
}

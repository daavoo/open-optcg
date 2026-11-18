# OPTCGSim bridge

Lets the learned model (the compact System-1 scorer, `ml/README.md`) play one
seat of [OPTCGSim](https://optcgsim.com/)'s **Solo V Self** mode, on your own
machine. It is a prototype, for offline practice against the model; it does
not run in multiplayer, and is not meant to.

```
OPTCGSim (Solo V Self)                      pnpm optcgsim:bridge
  BepInEx plugin ── TableSnapshot (HTTP) ──►  position.ts: rebuild the table as an engine position
  reads the table                             observe() + legalActions + the compact scorer
  performs the move ◄──── SimMove ──────────  decide.ts: the pick, in the sim's card ids
  through the sim's own click handlers
```

The model never plays OPTCGSim's rules directly. At each decision the plugin
reads the table, the bridge rebuilds it as a position in this repo's engine,
the model chooses among the engine's legal actions there, and the plugin
performs that action through the same handlers a click goes through. The sim
keeps the game -- its shuffles, draws and rulings -- and the position is rebuilt
from scratch every time, so the two can disagree about a ruling but never drift.

## What it plays, and what it hands back

The model takes the mulligan, every main-phase action (play a card, give
DON!!, attack, activate a `[Main]` without a target), blocks, Counters, and
ends its turn. Anything inside an effect -- choosing targets, ordering cards,
optional costs -- is handed back to you: the seat waits, and the on-screen
line says why. So do positions the engine refuses (a card it does not have)
and any click the sim does not accept.

The snapshot cannot carry everything the sim knows. A once-per-turn already
spent or a "this turn" restriction is invisible to it, and power the engine
cannot derive is carried over as a flat modifier (`SimFieldCard.power`).

## Setup (macOS; Windows and Linux are the same with their paths)

1. **The model.** `pnpm model:fetch` writes `packages/web/src/scorer-model.json`.
2. **BepInEx 5** (the Mono build) into the folder holding `OPTCGSim.app`, from
   the [BepInEx releases](https://github.com/BepInEx/BepInEx/releases)
   (`BepInEx_macos_universal_5.4.23.6` is the one the plugin is built
   against). In `run_bepinex.sh` set
   `executable_name="OPTCGSim.app"`, then start the sim once with
   `./run_bepinex.sh` so BepInEx creates its folders.
3. **Build the plugin** against your copies (needs the .NET SDK,
   `brew install dotnet`):
   ```sh
   cd tools/optcgsim/plugin
   dotnet build -c Release \
     -p:GameManaged="/Applications/OPTCGSim/OPTCGSim.app/Contents/Resources/Data/Managed" \
     -p:BepInExCore="/Applications/OPTCGSim/BepInEx/core"
   cp bin/Release/netstandard2.1/OpenOptcgBridge.dll /Applications/OPTCGSim/BepInEx/plugins/
   ```
4. **Run the bridge** from the repo root: `pnpm optcgsim:bridge`.
5. **Play.** Start the sim with `./run_bepinex.sh`, open Solo V Self with two
   decks, and press **F8**. The model plays Player 2; **F9** switches seats.
   Settings (port, seat, the delay between clicks) are in
   `BepInEx/config/dev.open-optcg.optcgsim-bridge.cfg`.

## Checking the bridge without the sim

```sh
pnpm optcgsim:bridge &
curl -s localhost:7788/health
curl -s -X POST localhost:7788/decide --data @snapshot.json
```

`snapshot.ts` is the whole contract between the two halves, and
`test/optcgsim-bridge.test.ts` builds snapshots by hand.

## Where it is fragile

The plugin is written against OPTCGSim 1.45b's internals (`GameplayLogicScript`,
its `GameplayState` and `ButtonChoiceType` enums, its choice buttons). A sim
update that renames them breaks the plugin, and the BepInEx log
(`BepInEx/LogOutput.log`) names the member. OPTCGSim is closed source; none of
it is in this repository, and the plugin compiles against the player's own copy.

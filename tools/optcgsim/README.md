# OPTCGSim bridge

Lets the learned model (the compact System-1 scorer, `ml/README.md`) play
[OPTCGSim](https://optcgsim.com/)'s **Solo V Self** mode on your own machine:
one seat against you (**Solo vs AI**), or both (**AI vs AI**). It is a
prototype, for offline play against the model and for checking this engine
against the sim's rules; it does not run in multiplayer, and is not meant to.

```
OPTCGSim (Solo V Self)                      pnpm optcgsim:bridge
  BepInEx plugin ── TableSnapshot (HTTP) ──►  shadow.ts: the sim's game, kept in this engine
  reads the table                             observe() + legalActions + the compact scorer
  performs the move ◄──── SimMove ──────────  the pick, in the sim's card ids
  through the sim's own click handlers        recorder.ts: the game, as a match the engine loads
```

The model never plays OPTCGSim's rules directly. The bridge keeps one game of
this repo's engine for the whole of the sim's game. The model decides in it,
each decision is applied to it and clicked in the sim through the handlers a
person's click goes through, and every snapshot the plugin sends is checked
against it. The sim keeps the game -- its shuffles, draws and rulings -- and
the engine's copy follows:

- **Shuffles.** The sim shuffles with its own dice, so the engine's game is
  dealt the sim's cards through recorded shuffles (`recorded-shuffle.ts` in
  the engine): the order each shuffle came out in is part of the record.
- **Choices the sim makes its own way** -- the order cards go to the bottom
  of a deck, a prompt the engine does not stop for -- are read off the table
  at the next snapshot.
- **A person's moves** are clicks the bridge is never told about. The plugin
  shows it the table at each of their decisions, and the bridge finds the
  engine actions that turn its table into that one. Their hand reaches the
  bridge for this and nothing else: the model's observation is `observe()`'s,
  which withholds it.
- **A move the sim refuses** is taken back in the engine's game and the
  decision is made again without it.

When the two rules engines rule differently the tables stop matching. The
difference is noted, the engine's game is set to the sim's table
(`position.ts`) and followed again from there, so the game goes on and one
game can find several differences. The record -- the game this engine loads --
ends at the first: it cannot hold a ruling the engine would not make. What a
snapshot cannot say (a once-per-turn already spent, a keyword gained) is lost
at each such point and kept from then on.

## Recorded games

Every game the model plays is written under `analysis/optcgsim/` (ignored by
git; `--record <dir>` moves it), rewritten at each decision:

| file                 | what it is                                                                                                                                                           |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<game>.jsonl`       | the game in this engine's own format: loads in the app and in every `pnpm trace:*` tool, and replays from its recorded shuffles                                      |
| `<game>.plays.jsonl` | play by play: each decision's engine actions beside the move the sim was given, with the powers the two disagree on, each place the games parted, and how both ended |
| `<game>.sim.jsonl`   | every snapshot the sim sent and the move it got back                                                                                                                 |
| `index.jsonl`        | one line per game: decks, how far the record got, the difference that ended it                                                                                       |

`pnpm optcgsim:report [dir]` lists the games and groups the places they
parted by the last card played before each.

### Collecting games unattended

In `BepInEx/config/dev.open-optcg.optcgsim-bridge.cfg`, under `[AiVsAi]`:

- `Games = N` plays N AI vs AI games as soon as the sim starts, one after
  another. Set it back to 0 to get your menu back.
- `OurDecks = true` plays them with this repo's deck lists, a different pair
  each game. The lists are saved beside your own decks as `open-optcg ...`,
  so you can also pick them for a game of your own.
- `Speed = 4` runs the sim that many times faster during those games.
- `StopWhenNotRecorded = true` gives a game up at the first difference,
  where its record ends, instead of playing it out to find the rest. A game
  the sim stops moving in is given up either way.

`pnpm optcgsim:bridge --blind p1` keeps one seat's moves from the record, as
a person's are, in games the model still plays both seats of: it is how
following a person is checked without anyone sitting through the games.

## Installing it for a player

The launcher does the whole of the setup below, in one window:

```sh
pnpm bridge:launch      # a local page at http://127.0.0.1:7787
pnpm bridge:binary      # or one executable with no Node and no checkout
pnpm bridge:app         # or a macOS application around that executable
```

It finds (or is given) the sim folder, installs BepInEx 5.4.23.6 and the
plugin from the newest `bridge-*` release, fetches the newest `model-*`
release's weights into the user's application-support folder, and starts the
bridge in-process when you press **Play**. `pnpm bridge:install` and
`pnpm bridge:status` are the same thing without the page, and
`pnpm bridge:install --dry-run` says what it would do without writing.

`pnpm bridge:binary` embeds the launcher in a copy of the running Node with
Node's single-executable-application support, so a player runs one file. It is
for the machine that builds it (a SEA binary carries its own Node runtime), so
CI builds one per platform. `pnpm bridge:app` wraps that executable in a macOS
`.app` -- `Info.plist`, a drawn icon, and a bundle signature -- and zips it, so
a macOS player double-clicks an icon instead of running a command. macOS only;
the app is signed ad hoc, which runs on the machine that built it.

### The releases

Two kinds, both on the release page:

| tag        | what it carries                                                                                                                                   | who builds it                   |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `model-*`  | `scorer-model.json`, `scorer-adapter-<deck>.json`, `deck-standings.json`                                                                          | training                        |
| `bridge-*` | `launcher.mjs`, `open-optcg-bridge-<platform>[.exe]`, `open-optcg-bridge-macos.app.zip`, `OpenOptcgBridge-<platform>.dll`, `bridge-manifest.json` | CI, plus a machine with the sim |

The model is never in the launcher bundle: the bridge resolves the newest
`model-*` release at run time (`model-source.ts`), caches it by tag under
`~/Library/Application Support/open-optcg/models/`, and falls back to the
newest cached tag, then to a checkout's pack, when GitHub cannot be reached.
`GET /health` reports which release is in play, and the page shows it.

```sh
pnpm bridge:release --tag bridge-v1    # bundle + manifest + the host's DLL and binary
pnpm bridge:verify  --tag bridge-v1    # is it installable?
```

The plugin DLL cannot be built in CI: it compiles against the player's own
OPTCGSim and BepInEx assemblies (`OpenOptcgBridge.csproj`), which are not in
this repository. The single-file launcher can, so the workflow builds it on
macOS, Windows and Linux and publishes it with the manifest on a `bridge-v*`
tag; the maintainer tops the release up with the plugin DLLs:

```sh
pnpm bridge:release --tag bridge-v1 \
  --plugin macos=tools/optcgsim/plugin/bin/Release/netstandard2.1/OpenOptcgBridge.dll \
  --plugin windows=<built on a Windows machine>
```

The script is idempotent (`gh release upload --clobber` once the release
exists), so the order does not matter; `bridge:verify` is what says whether
the result is complete.

## Setup (macOS; Windows and Linux are the same with their paths)

This is what the launcher automates; follow it by hand to work on the bridge
itself.

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
5. **Play.** Start the sim with `./run_bepinex.sh`. Two buttons sit beside
   Solo V Self on the main menu:
   - **Solo vs AI**: choose the two decks as usual. You play the bottom of
     the table ("You" in the sim's log) and the model plays the top
     ("Opponent"), clicking for itself. Its hand, and the cards its effects
     look at, stay face down. While a decision is the model's, the sim's
     buttons are covered by "AI playing" and your clicks on cards are ignored.
   - **AI vs AI**: the model plays both seats.

   The panel (drag it anywhere) stops the model or switches its side. Plain
   Solo V Self games start with the model off.

   Both decks must be made of cards this engine knows. The decks are checked
   once the sim deals them, and a game that fails goes back to the main menu
   naming the cards.
   Settings (port, seat, the delay between clicks) are in
   `BepInEx/config/dev.open-optcg.optcgsim-bridge.cfg`.

## Checking the bridge without the sim

```sh
pnpm optcgsim:bridge &
curl -s localhost:7788/health
curl -s -X POST localhost:7788/decide --data @snapshot.json
```

`snapshot.ts` is the whole contract between the two halves.
`test/optcgsim-bridge.test.ts` builds snapshots by hand, and
`test/optcgsim-shadow.test.ts` follows whole games through a stand-in for the
sim: a second engine game, dealt from another seed.

## Where it is fragile

The plugin is written against OPTCGSim 1.45b's internals (`GameplayLogicScript`,
its `GameplayState` and `ButtonChoiceType` enums, its choice buttons). A sim
update that renames them breaks the plugin, and the BepInEx log
(`BepInEx/LogOutput.log`) names the member. OPTCGSim is closed source; none of
it is in this repository, and the plugin compiles against the player's own copy.

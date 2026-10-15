# How to play

Open <https://daavoo.github.io/open-optcg/> in any browser, phone included. It
carries no card images or printed card text, and is not played without them:
the first screen shows how to fetch them from Bandai's card list with the
Get cards bookmark, see
[Card text and art](asset-packs.md).

From a checkout, `pnpm web:build` produces `dist/open-optcg.html`, the whole
app in one file. It runs offline from `file://` and can be copied anywhere.

## Start a match

The app opens on the 1v1 lobby: your Leader on the left, the opponent's on the
right, and three controls on the hub between them.

- **Your deck** and **Opponent deck**: click either Leader to pick from the
  ST31 to ST36 structure decks, an upgraded ST31 list, and OP-16 and OP-12
  tournament lists. **Custom deck** opens the deck editor for either seat.
- **Configure matchup** (the top cell of the hub) holds the rest:
  - **Opponent controller**: **Heuristics**, the built-in deck policies, or
    **LLM**, which needs `pnpm web:serve` from a checkout and an API key
    (see [LLM opponents](llm-opponents.md)). You always pilot your
    own seat.
  - **Starting player**: you, the opponent, or decided by the seed.
  - **Seed**: every shuffle, random choice and turn order comes from this
    string. Reuse a seed to replay the same game. Swap the two decks and keep
    the seed to play the same matchup from the other side.
- **Start match** is the play cell (the triangle), and **Load match from
  trace** the bottom one (see below). With **AI** on both seats, the play cell
  asks whether to watch one game or simulate 100, 250 or 500 of them.

A newer pack -- after a new set comes out -- loads from **Configure matchup**,
under _Card text and art_.

## Playing a turn

Click a card, then click a legal destination. Only legal plays are offered, and
the engine stops and asks whenever a card gives you a choice: targets, search
selections, Counters, Triggers, Blockers.

In the top bar:

- **Pause AI** stops the opponent so you can study the board.
- **Match history** is the full event log, newest first. Click any entry to
  rewind the game to that point, which is how you undo and try another line.
  Against an LLM, each step also shows the action the model picked and its
  reasoning.
- **Export trace** saves the match as one file (see below).

The power shown on a card is its current power. The rules panel (the eye tab on
mobile, the side drawer on desktop) shows the printed text and the arithmetic
behind that number: which DON!!, which modifiers, which effects.

## Saving and resuming

**Export trace** writes the whole match to a single file: decks, seed, every
decision. **Load match from trace** on the setup screen asks what the file is
for: **Pilot it** replays it and drops you back where you were, and **Watch it
back** opens it as a replay. The same file is what to attach to a bug report.

## Watching a match back

A replay plays the file's actions back one at a time with **both hands face
up**, which is the way to see what an AI opponent was holding when it made a
move -- or to watch two of them play each other. The strip along the top of the
board drives it:

- **Play** runs it on its own, about an action a second; press it again to
  stop.
- The arrows either side step one action at a time.
- The turn list jumps straight to the start of a turn, and the match history's
  **Jump** does the same for any single action. Nothing is discarded by either:
  the file still holds the rest.
- The swap button watches from the other seat, which is also the hand shown in
  the sheet on a phone.
- **Pilot from here** hands you that seat and plays on from the position on
  screen. The rest of the file is simply not played, the other seat goes back
  to its agent, and the board is an ordinary match again.

Nothing decides anything during a replay: the file already answered every
question, so no choice modals come up and no agent is asked for a move.

A trace contains both players' hidden cards, so keep it to yourself while a
game is in progress.

## Building a deck

**Custom deck** on the setup screen opens the editor. It starts from an existing
list, enforces the 50-card constructed rules as you go, and keeps the deck for
the current session. **Import** takes a pasted list in the usual `4x OP16-034`
form, one line per card with exactly one Leader; lines starting with `#` or
`//` are ignored. **Export** copies it back out in the same format.

## Puzzles

Puzzles and Sealed are not on the lobby yet: only 1v1 ships. Both still run,
and opening the app with `#modes` on the address (for example
`open-optcg.html#modes`) shows the page that lists them.

A puzzle is a set position with a win hidden in it. The board is built for you,
the objective says how many turns you have, and you find the line.

Every puzzle is proven forced before it ships: there is a line that wins
whatever the defender does with the cards it holds, every block and every
Counter. A line that only works if they decline to block is not the answer.

The banner above the table shows the objective, the turn, and three controls:
**Hint** (one nudge, only when you ask), **Restart** and **All puzzles**. Miss
the deadline and the board says so immediately.

The defender blocks and counters properly. On its own turn in a two-turn puzzle
it passes; the position is set up so it is tapped out, and that is part of the
puzzle's premise.

Solved puzzles are remembered in the browser.

## Sealed

**Sealed** opens six random boosters. You build a 40-card deck from the pool
under a wildcard Sealed Leader. Any colour is allowed, and there is no copy
limit. The opponent opens six packs from the same expansion. **Auto-build**
fills a legal deck if you would rather just play.

The lobby opens on the newest expansion. **Pick a different expansion** lists
every supported booster: OP-10 through OP-17. A set is offered only once its
printed rarities are sourced and every card in it runs its printed text, so a
thin pool is bad luck, not a gap in the engine.

The pool seed is shown while you build. Keep it to reopen the exact same pool
later. A seed is per expansion. You can also import a 40-card list instead of
opening packs.

## Matchup analytics

**Matchup analytics** on the setup screen shows a precomputed win-rate matrix
for the six format decks: rows go first, columns go second. Click a cell for
the detail: the same pair with seats swapped, how the games ended, and a
per-card split of win rate by whether the deck played, activated or countered
with the card. That split is an association, not a cause, and the page says so.

**Build deck** there runs your own deck against the whole format in the
background and adds it as a row and column labelled `YOURS`. Each cell states
its own sample size.

The built-in matrix is computed at build time. To regenerate it, see
[theorycrafting](theorycrafting.md).

## Playing in a terminal

```sh
pnpm play
```

Prompts for both decks, a controller for each seat (human, the deck's rules
agent, an LLM, or two trivial baselines), a seed, and an optional trace path.
You pick actions by number. `q` quits.

```sh
pnpm play:sealed
```

Sealed against an LLM opponent. `--set=OP15` picks the expansion; the default
is the newest.

Output is coloured when the terminal is interactive and plain when redirected.
`--color` and `--no-color` force either.

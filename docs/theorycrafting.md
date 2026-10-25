# Theorycrafting

Everything the app does in one game, the command line can do in thousands.
"This list feels better" is hard to check by playing; a headless engine plays a
few thousand games while you make coffee.

Everything here is deterministic: same seed, same games. Two runs are comparable
because they played the same games, not just the same number of them. The bulk
instruments (`deck:benchmark`, `deck:ab`, `heuristic:ab`) run one worker per
core and merge the results in the order a single process would have produced,
so a sharded report is byte-identical to a serial one. `--jobs N` pins the
worker count.

Auditing one deck's policy is its own procedure with its own traps. Start with
`.claude/skills/audit-deck-policy`, which begins with `pnpm census` below.

## Who beats whom

```sh
pnpm head-to-head ST31 ST32 200
```

Two decks over 200 paired seeds. Every seed is played in both seat orders, so
first-player advantage cancels instead of being averaged in.

```sh
pnpm deck:benchmark run --deck ST31 --seeds 100 --output analysis/st31.json
pnpm deck:benchmark run --all --seeds 100 --output analysis/all.json
pnpm deck:benchmark report analysis/all.json --deck ST31 --opponent ST32 --seat p1
```

The same against the whole field, with a saved report you can query. Any deck
with a manifest works; its agent is resolved from its Leader. `--all` is every
deck the 1v1 setup screen offers (`SELECTABLE_DECK_IDS`), so a deck cannot be
playable without being measured. `--deck <ID>` plays one deck against the six
format decks. `--json` on a `report` emits the game rows.

## Who is actually piloting each deck?

```sh
pnpm census                          # all-vs-all, 10 seeds
pnpm census --seeds 100 --jobs 8
pnpm census --deck ST33              # one deck against the format six
pnpm census --json --output analysis/census.json
```

The benchmark says who wins; this says who is playing. For every deck it
reports the share of its decisions shaped by a rule written for that deck, by a
shared rule, and by nothing at all (the generic ladder answering alone).

That last column is the one to read. A deck low in the benchmark with a high
"no rule at all" share is not badly tuned, it is unpiloted, and that is a
different piece of work. A rule counts as shaping a decision whether it decided
it or only narrowed the candidates; `narrowedBy` on the decision tells the two
apart, because a `rank`-only policy that hides every candidate but its preferred
line would otherwise read as absent.

Two more shapes worth looking for, both shipped here before:

- **One module taking an implausible share of one action type.** ST33 lost
  22.8pt to a single branch classifying 96% of its effect decisions with all its
  tests green. `byActionType` and `byModule` in the JSON show it.
- **A module that never fires.** `silentModules` lists every module registered
  for a deck that never decided or narrowed one of its decisions.

The census locates; it does not judge. Every candidate it turns up still has to
be measured with `deck:ab` or `heuristic:ab`. A rule that is a community
fundamental has measured at −7.5pt here.

## Did my change help?

Win rates from two runs are paired samples. Comparing summary numbers throws
that away and reports an interval about three times wider than the data
supports. These pair properly.

```sh
pnpm benchmark:diff --deck ST32 before.json after.json
```

Joins two benchmark reports game by game and counts the games your change
flipped.

```sh
pnpm heuristic:ab --module don-reservation --seeds 250
pnpm heuristic:ab --module don-reservation --format --seeds 250
```

For a rule that applies to every deck, a benchmark is blind: both seats get the
rule and the delta reads as zero. This runs mirror matches with the rule off on
one side and reports that side's win rate against a 50% null. An unqualified
run sweeps all sixteen selectable decks; `--format` narrows to the six format
decks, which is the field the numbers in `registry.ts` were taken against.

```sh
pnpm deck:ab --deck ST32 --disable threat-removal --seeds 200
```

For a change scoped to one deck, where the mirror is the wrong game. Plays every
(opponent, seed, seat) twice, with the named modules off and on, and counts the
discordant pairs. Takes the same `--format` flag for its opponent set.

## Why did it do that?

```sh
pnpm trace:match --p1 OP16-NAMI-6738 --p2 ST32 --seed s-0
```

One game decision by decision, with the policy that made each call and the
events it produced. This is what a new deck needs before its win rate means
anything.

```sh
pnpm trace:compare --file=exported-match.jsonl
```

Replays a match exported from the browser and asks the rules agent what it
would have chosen at every decision, so you can see where a human diverged
from the policy.

## Sealed

```sh
pnpm sealed:analysis --seeds 200 --builder grape
```

Bulk rules-vs-rules sealed games with per-card pick value: how often the
auto-builder kept each card and how the seats that kept it fared. That is an
association, not a pick order, and the report says so. `--builder` picks between
the plain curve heuristic and the community's G-R-A-P-E order.

## The format matchup matrix

```sh
pnpm analytics:baseline --seeds 100
```

Plays every ordered pair of the six format decks (3,600 games at 100 seeds,
about two minutes) and writes the report to
`packages/web/src/analytics-baseline.json`. It stays the format six rather than
the whole field because 16x16 at that seed count is hours. The app does not
read it: its Simulate matchup page plays the two lobby decks on demand,
reached by pressing play with AI on both seats.

## Writing a deck policy

Deck rules can be declarative. `prefer`, `avoid` and `never` from
`@one-piece-sim/agents/local` build rules against a `Tactics` view of the
observation, and `heuristics(id, rules)` compiles them into a module that
narrows what the deck's existing policy chooses from. Printed card facts
(category, power, keywords, types, DON!! requirements) are on the observation,
so a rule can say "the highest-power Blocker" without naming card numbers.

`packages/agents/src/` has one file per deck policy; the ST31 and ST32 ones are
the most developed examples.

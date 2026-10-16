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

## The committed standings

```sh
pnpm standings                   # rewrite both files
pnpm standings --group starter   # rewrite one division, leaving the other alone
pnpm standings:check             # regenerate into memory, fail on a real difference
```

Two closed round-robins, each committed as its own CSV:

| File                                                                           | Decks | Seeds | Games per deck |
| ------------------------------------------------------------------------------ | ----- | ----- | -------------- |
| [rules-map/deck-standings-featured.csv](rules-map/deck-standings-featured.csv) | 18    | 8     | 272            |
| [rules-map/deck-standings-starter.csv](rules-map/deck-standings-starter.csv)   | 9     | 16    | 256            |

`featured` is every built list, Bandai's own feature decks and the tournament
lists together; `starter` is Bandai's precons. `deckDivision` derives the split
from the deck id, so a deck added to the roster is placed by the name it already
has.

They are two files rather than one because a rate is only a statement about the
field it was measured in. An all-vs-all field has a mean of exactly 50% by
construction, so mixing precons with tournament lists made every number a
statement about the mixture. OP13-004 shows it plainly: it fronts a deck on each
shelf, ST-35 and the OP-17 Elbaph list, and in the single mixed field those two
sat at opposite ends of the table. Read against its own shelf, a precon's rate
says whether its policy pilots the product it came in, and a built list's says
whether it beats the lists people bring.

The other reason is the diff. A change to one division leaves the other file
untouched, so a starter policy change is nine rows moving rather than
twenty-seven, and `--group starter` replays under a third of the games. Each
file carries its own rules stamp, so the check can say one division is stale
while the other is current.

The point is still the diff: a mechanic fix that moves a deck from 29% to 41%,
or a "harmless" refactor that flips sixty games, shows up as rows moving in a
pull request. `.github/workflows/standings.yml` runs the check on a pull request
that touches the engine or the rules policies.

**Read the numbers coarsely.** A matchup is 16 games in `featured` and 32 in
`starter`, which is roughly ±13pp and ±9pp on any single pair: enough for the
30%-vs-80% gaps that matter and useless for a small policy change -- `pnpm
deck:ab` is the instrument for that. A 2pp move is
not signal, and neither is a deck crossing 50%: the two halves of a ten-seed run
disagreed by 8.8pp on the widest row, and a no-change run already moves several
rows on its own. The seed counts differ per division so that a row rests on
about 260 games either way, which is what the single 27-deck field gave it; see
`STANDINGS_SEEDS` for that reasoning. The spread is far wider than a real
metagame, so this measures policy quality at least as much as deck quality.

`incomplete` counts games that hit the action cap with no winner. It is a
tracked column rather than a failure: a game that cannot finish is a real
finding, but it belongs in the file, not in a red check.

Every row repeats the run's rules stamp and configuration, which is what lets a
file be read on its own and what makes a hand-edited row detectable -- its
neighbours disagree with it. Everything in a file is a pure function of the
build (a rules stamp rather than a date), or the check would be noise.

`pnpm standings:check` **reads the numbers rather than the bytes**: a rate
within 5pp of a fresh run, and a turn average within 5% of itself, is noise at
these seed counts and passes. It prints tolerated moves anyway, and goes red on
a bigger move, a stale rules stamp, a changed configuration, or a deck entering
or leaving a division. `--tolerance` tightens the bound.

Each division is quadratic in its deck count, so CI splits the sweep across
eight runners rather than playing it on one:

```sh
pnpm standings --shard 3/8 --shard-out shards/3.json   # one machine's stripe
pnpm standings:check --merge shards                    # assemble and compare
```

`--shard` stripes whole matchups within each division and composes with the
`--jobs` fork inside each machine, so the split is exact rather than
approximate: the merged files are the ones a single process would have produced.
A shard writes one report per division it played. `--merge` plays nothing, and
fails rather than rendering a file from an incomplete set of shards. Locally
there is no reason to reach for either -- `pnpm standings` forks over your cores
on its own.

What the split gives up is the cross-division matchups: a featured deck never
plays a precon here. Nothing reads per-matchup numbers out of these files, and
`pnpm deck:benchmark` still plays a deck against the whole roster, so what is
lost is sweep coverage as a crash net rather than a number anyone quotes.

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

That last column is the one to read. A deck low in the standings with a high
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
would have chosen at every decision, so you can see where a human or an LLM
diverged from the policy.

```sh
pnpm trace:shadow --file=exported-match.jsonl --seat=p2
pnpm trace:shadow --file=exported.jsonl --revisions=196 --repeat=20
pnpm trace:shadow --file=exported.jsonl --revisions=196 --recorded-context=true
```

The same replay, asking an LLM what it would have played at one seat's
decisions, with its reasoning. Every recorded action is still applied, so the
model answers the positions that actually arose. Needs `LLM_API` and a key.
Each answer is reported whole (a DON!! allocation is "attach N times, then
attack", and N is usually the question).

The model is not deterministic, so one answer on one position is not a
measurement; `--repeat` asks many times. `--recorded-context=true` re-sends the
exact request the trace recorded instead of asking afresh, which separates "the
prompt never says this" from "the conversation had already decided it".
`--model=` and `--effort=` change one arm without touching `.env`.

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

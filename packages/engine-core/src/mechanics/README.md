# mechanics/

Card behaviour, one module per set — the same split `packages/cards/src` uses for
card data.

| File                   | Cards from                                                          |
| ---------------------- | ------------------------------------------------------------------- |
| `format.ts`            | the generated ST31–ST36 pool                                        |
| `st21.ts`              | `cards/src/st21-cards.ts`                                           |
| `st22-*.ts`            | `cards/src/st22.ts`                                                 |
| `op03.ts`              | the OP-03 reprints a shipped list plays, until the set comes in     |
| `op03-static.ts`       | the continuous text those OP-03 reprints print                      |
| `op02.ts`              | OP02-013 Ace, OP-02's one card in the pool (a Super Parallel `X`)   |
| `st02.ts`              | ST02-007 Bonney, ST-02's one card in the pool (a block-4 reprint)   |
| `st06.ts`              | ST06-008 Hina, ST-06's one card in the pool (a block-4 reprint)     |
| `st26.ts`              | the five ST-26 exclusives the starter deck ships                    |
| `st23.ts`              | the ST-23 exclusives (static rows in `st23-static.ts`)              |
| `st01.ts`              | ST01-011 Brook, ST-01's one card in the pool (a block-4 reprint)    |
| `st27.ts`              | ST-27's exclusives, plus the PRB-02/EB-01 singles it plays          |
| `op07-*.ts`            | `cards/src/op07.ts`                                                 |
| `op08-*.ts`            | `cards/src/op08.ts`                                                 |
| `op09-*.ts`            | `cards/src/op09.ts`                                                 |
| `op10-*.ts`            | `cards/src/op10.ts`                                                 |
| `op11-*.ts`            | `cards/src/op11.ts`                                                 |
| `op12-*.ts`            | `cards/src/op12.ts`                                                 |
| `op13-*.ts`            | `cards/src/op13.ts`                                                 |
| `op12-rosinante.ts`    | `cards/src/op12-rosinante.ts`                                       |
| `op14-*.ts`            | `cards/src/op14.ts`                                                 |
| `op15-*.ts`            | `cards/src/op15.ts`                                                 |
| `op16-enel.ts`         | `cards/src/op16-enel.ts`                                            |
| `op16-luffy.ts`        | `cards/src/op16-luffy.ts`                                           |
| `op16-nami.ts`         | `cards/src/op16-nami.ts`                                            |
| `op16-teach.ts`        | `cards/src/op16-teach.ts`                                           |
| `op16-*.ts`            | `cards/src/op16.ts`                                                 |
| `op17-*.ts`            | `cards/src/op17.ts`                                                 |
| `op17-luffy-ace.ts`    | `cards/src/op17-luffy-ace.ts`, plus ST21-017                        |
| `op05-*.ts`            | `cards/src/op05.ts`                                                 |
| `op05-replacements.ts` | the four replacements OP05 prints                                   |
| `op05-shared.ts`       | OP05 fragments more than one of its cards prints                    |
| `op06-*.ts`            | `cards/src/op06.ts`                                                 |
| `op06-yamato.ts`       | `cards/src/op06-yamato.ts`                                          |
| `eb05-*.ts`            | `cards/src/eb05.ts`                                                 |
| `eb04-bonney.ts`       | `cards/src/eb04-bonney.ts`                                          |
| `eb04-*.ts`            | `cards/src/eb04.ts`                                                 |
| `eb04-replacements.ts` | the two removal replacements EB-04 prints                           |
| `op07-replacements.ts` | the two "removed from the field" replacements OP07 prints           |
| `op08-replacements.ts` | the one K.O. replacement OP08 prints                                |
| `op09-replacements.ts` | the one K.O. replacement OP09 prints                                |
| `op14-replacements.ts` | the K.O. replacements OP14 prints                                   |
| `op16-replacements.ts` | the K.O. replacements OP15 and OP16 print                           |
| `op10-replacements.ts` | the K.O. replacements OP10 prints                                   |
| `op11-replacements.ts` | OP11-110's, whose cost rests a Stage or the Leader                  |
| `op13-replacements.ts` | every "removed from the field" replacement, OP10–OP13               |
| `op06-shared.ts`       | OP06 fragments more than one of its cards prints                    |
| `op07-shared.ts`       | OP07 fragments more than one of its cards prints                    |
| `op08-shared.ts`       | OP08 fragments more than one of its cards prints                    |
| `op09-shared.ts`       | the ODYSSEY rested-board gate eleven OP09 cards print               |
| `op14-shared.ts`       | OP14 fragments more than one of its cards prints                    |
| `op15-shared.ts`       | OP15 fragments printed on two clauses of one card                   |
| `op16-shared.ts`       | the OP16 Whitebeard "reveal an 8000" template                       |
| `eb02-*.ts`            | `cards/src/eb02.ts`                                                 |
| `eb02-shared.ts`       | EB02 fragments more than one of its cards prints                    |
| `shared.ts`            | program fragments more than one set prints                          |
| `*-static.ts`          | each set's continuous text, the rows `../static-abilities.ts` folds |
| `static-shared.ts`     | the predicates those rows read                                      |
| `*-reactions.ts`       | each set's signal-driven "when X happens" clauses (`ReactionRule`s) |
| `reaction-shared.ts`   | program fragments more than one of those reactions resolves         |
| `types.ts`             | the registry entry types                                            |
| `registry.ts`          | `SetMechanics` and the merge                                        |
| `index.ts`             | the twelve merged registries                                        |

Sixteen sets are in the pool as whole series -- OP05 through OP17, 119 cards
each except OP14 and OP13 at 120, plus EB-05's 61, EB-04's 61, EB-03's 62 and EB-02's 61 --
and every one of them is split
the same way, by the timing window a clause fires in: `*-on-play.ts`, `*-main.ts` (`[Main]` Events
and `[Activate: Main]`), `*-battle.ts` (`[Counter]`,
`[On Your Opponent's Attack]`, `[When Attacking]`, `[On Block]`, Leader watchers,
and OP14's "when this Character becomes rested") and `*-triggers.ts`
(`[Trigger]`, `[On K.O.]`, `[End of Your Turn]`, and a Leader's
start-of-turn activation).

A clause with no printed marker at all goes somewhere else again. Continuous text
is a row in the set's `*-static.ts` (the predicates those rows read are in
`static-shared.ts`), folded into power, cost and keyword queries by
`../static-abilities.ts`; a "when X happens" clause with no marker is
a `ReactionRule` row in the set's `*-reactions.ts`, dispatched off the signal stream by `../card-mechanics.ts` --
that is where OP10-042's removal draw, OP11-077's DON!!-returned buff, OP12-081's
punishment for the opponent's tempo, OP12-099's Life-triggered draw and OP13-078,
OP13-100, OP13-106 and OP11-102's watchers live.

Five OP07 identities were in the pool before the set was, played by the
community decks and format lists that ship them: OP07-022 (`op14-mihawk.ts`),
OP07-077 (`op17-kaido.ts`), OP07-107 and OP07-114 (`eb04-bonney.ts`). The
fifth, OP07-056, is one of the imperative entries in `legal-actions/counter.ts`
and `actions/activate-counter-event.ts` rather than a program at all. All five
stay where they are, the same split OP08, OP09 and OP14 kept.

Three OP08 identities were in the pool before the set was, played by the
community decks that ship them: OP08-023 (`op06-yamato.ts`), OP08-036
(`op14-mihawk.ts`) and OP08-051 (`op17-meta.ts`). Their programs stay in the
modules named after those decks, the same split OP09 and OP14 kept.

Seven OP09 identities were in the pool before the set was, played by the
community decks that ship them: OP09-069 and OP09-072 (`op12-rosinante.ts`,
`op16-enel.ts`), OP09-093, OP09-096 and OP09-099 (`op16-teach.ts`) and OP09-112
(`op16-nami.ts`). Their programs stay in the modules named after those decks,
the same split OP14's did.

Three OP05 identities were in the pool before the set was: OP05-066 Jinbe and
OP05-070 Fra-Nosuke are continuous text and are rows in `op05-static.ts`, and OP05-077 Gamma Knife's two halves are in `op16-enel.ts`. All
three stay where they are. Five more OP05 clauses have no printed marker beyond
a turn window and are `ReactionRule`s in their set's `*-reactions.ts`: OP05-053,
OP05-074, OP05-098, OP05-107 and OP05-109.

Twelve OP06 identities were in the pool before the set was, played by the
community decks that ship them: OP06-022, OP06-033, OP06-035, OP06-104,
OP06-106, OP06-107, OP06-109, OP06-110, OP06-115 and OP06-118
(`op06-yamato.ts`), and OP06-038 and OP06-058 (`op14-mihawk.ts` and
`op06-main.ts`, where its `[Main]` Event was migrated off the hand-written
register before the set was imported). Their programs stay where those decks
put them, the same split every earlier whole-set import kept.

Seven OP14 identities were in the pool before the set was, played by
`OP16-NAMI-6738`, `OP12-ROSINANTE-AYASHIZO` and the ST31-36 format. Their
programs stay in the modules named after those decks, the same split OP15 kept
for its Enel identities -- see the header of `cards/src/op14.ts`.

EB-04 keeps its own `eb04-replacements.ts` rather than joining
`op13-replacements.ts`, even though one of its two entries is an
"off-field" clause: the pair is what makes the set's two prices comparable, and
one of them is the first replacement in the pool with a board precondition of
its own (`requires` on `ReplacementProgram`, added for EB04-044).

One EB-02 identity was in the pool before the set was, played by the OP17
Luffy & Ace list: EB02-017 Nami, whose `[On Play]` is in `op17-luffy-ace.ts`.
It stays there, the same split every earlier whole-set import kept. Two more of
the set's clauses have no printed timing marker beyond a turn window and are
`ReactionRule`s in their set's `*-reactions.ts`: EB02-023's bounce watcher and
EB02-035's DON!!-returned refund. EB-02's one replacement lives in
`eb02-triggers.ts` beside the `[Trigger]` of the same card, because the Event
that buys it is the same card -- and it is the only entry in that registry with
no card on the field to be found by: its `[Counter]` books it on the player and
`eligibleReplacements` reads the booking as a protector of its own.

`op16-replacements.ts` holds both sets' K.O. replacements, because the clause is
rare enough that four entries side by side say more than two files of two.
`op13-replacements.ts` groups by the _rule_ rather than by the set for the same
reason: the ten "removed from the field" clauses across OP10–OP13 differ only in
what they pay, and reading them together is what makes those six prices
comparable.

Note the two neighbours with similar names: `../mechanics.ts` is the DSL —
effects, selectors, conditions and the interpreter — and this directory holds
programs written in it. `../card-mechanics.ts` is the lookup and dispatch seam
between those programs and the engine.

## Adding a card

1. Find the set module for the card's set (add one, and register it in
   `index.ts`, if the set is new).
2. Add a `[cardNumber, program]` entry under the clause it prints. Comment it
   with the printed text and with why the program reads that way — the text
   itself is the specification, and the next reader needs the reasoning.
3. Add a test: `test/<deck>.test.ts`, built with `test/support`.
4. `pnpm test:card <deck>`, then `pnpm verify`.

`pnpm new:card <CARD>` does steps 1, 2 and 3's scaffolding for you.

Registering the same clause for the same card in two places is an error at
import time (`mergeSetMechanics`), not a silent last-one-wins. That check found
one already: OP12-112's `[Trigger]` had been registered twice.

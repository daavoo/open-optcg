/**
 * OP07 `[Main]` Events and `[Activate: Main]` abilities.
 *
 * Split by timing window like every other whole-set import; see
 * `mechanics/README.md`. Comments paraphrase what each program has to do rather
 * than quoting the card -- printed text is a runtime asset, not repo content
 * (`pnpm card:text OP07-0xx` prints it from the local cache).
 *
 * Two OP07 Events were in the pool before the set was, played by community
 * decks that ship them: OP07-077 (`op17-kaido.ts`) and OP07-114
 * (`eb04-bonney.ts`). Their programs stay in the modules named after those
 * decks.
 */
import { SOURCE_BINDING } from "../mechanics.js";
import { type SetMechanics } from "./registry.js";
import { lookAndAdd, payFromHand } from "./shared.js";
import { costDebuff, powerDebuff } from "./op08-shared.js";
import {
  addDonRested,
  blazeSlice,
  buffOwnCardForTurn,
  foxyLeader,
  kujaCard,
  lifeAtMost,
  payFromTrash,
  restCostAtMost,
  trashAtLeastTen,
} from "./op07-shared.js";

export const op07MainMechanics: SetMechanics = {
  eventMain: [
    [
      // OP07-016 Galaxy Wink (1): a buff on the archetype's own type, then a
      // debuff across the table. Both "up to", both this turn.
      "OP07-016",
      {
        cost: 1,
        program: {
          effect: {
            kind: "sequence",
            effects: [
              {
                kind: "choose",
                selector: {
                  player: "self",
                  zone: "board",
                  category: "character",
                  type: "Revolutionary Army",
                },
                bind: "op07-wink-buff",
                min: 0,
                max: 1,
                effect: {
                  kind: "modify-power",
                  binding: "op07-wink-buff",
                  amount: 2_000,
                  expiresAfterTurns: 0,
                },
              },
              powerDebuff(1_000, "op07-wink-debuff"),
            ],
          },
        },
      },
    ],
    [
      // OP07-017 Dragon Breath (2): removal on two boards at once, and the only
      // Stage answer in the set.
      //
      // The Character half reads "3000 power or less", which is current power:
      // the clause is about a card already on the field, so a debuff this turn
      // brings a bigger body inside it. The Stage half reads a cost.
      "OP07-017",
      {
        cost: 2,
        program: {
          effect: {
            kind: "sequence",
            effects: [
              {
                kind: "choose",
                selector: {
                  player: "opponent",
                  zone: "board",
                  category: "character",
                  maxCurrentPower: 3_000,
                },
                bind: "op07-breath-ko",
                min: 0,
                max: 1,
                effect: { kind: "knock-out", binding: "op07-breath-ko" },
              },
              {
                kind: "choose",
                selector: {
                  player: "opponent",
                  zone: "stage",
                  maxCost: 1,
                },
                bind: "op07-breath-stage",
                min: 0,
                max: 1,
                effect: { kind: "knock-out", binding: "op07-breath-stage" },
              },
            ],
          },
        },
      },
    ],
    [
      // OP07-036 Demonic Aura Nine-Sword Style Asura Demon Nine Flash (2): a
      // buff, then a rest bought by resting one of the controller's own.
      //
      // "If you do" is what makes the second half nested rather than sequenced:
      // declining the cost, or having no body big enough to pay it, must not
      // hand over the opponent's rest for free.
      "OP07-036",
      {
        cost: 2,
        program: {
          effect: {
            kind: "sequence",
            effects: [
              buffOwnCardForTurn(3_000, "op07-asura-buff"),
              {
                kind: "optional",
                effect: {
                  kind: "choose",
                  selector: {
                    player: "self",
                    zone: "board",
                    category: "character",
                    minCost: 3,
                    rested: false,
                  },
                  bind: "op07-asura-cost",
                  min: 1,
                  max: 1,
                  effect: {
                    kind: "sequence",
                    effects: [
                      { kind: "rest", binding: "op07-asura-cost" },
                      restCostAtMost(5, "op07-asura-rest"),
                    ],
                  },
                },
              },
            ],
          },
        },
      },
    ],
    [
      // OP07-037 More Pizza!! (1): the Supernovas dig.
      "OP07-037",
      {
        cost: 1,
        program: lookAndAdd(5, "op07-pizza-look", {
          type: "Supernovas",
          excludeName: "More Pizza!!",
        }),
      },
    ],
    [
      // OP07-057 Perfume Femur (2): a Warlord buff that also switches off the
      // opponent's [Blocker] for that card's attack.
      //
      // [Unblockable] for the turn is exactly the printed sentence: the
      // restriction is on what the *opponent* may activate, and the engine
      // holds that as a keyword on the attacker rather than as a rule on the
      // defender. Granted to the selected card, so a second attacker in the
      // same turn is blocked normally.
      "OP07-057",
      {
        cost: 2,
        program: {
          effect: {
            kind: "choose",
            selector: {
              player: "self",
              zone: "board",
              includeLeader: true,
              type: "The Seven Warlords of the Sea",
            },
            bind: "op07-femur-target",
            min: 0,
            max: 1,
            effect: {
              kind: "sequence",
              effects: [
                {
                  kind: "modify-power",
                  binding: "op07-femur-target",
                  amount: 2_000,
                  expiresAfterTurns: 0,
                },
                {
                  kind: "grant-keyword",
                  binding: "op07-femur-target",
                  keyword: "Unblockable",
                  expiresAfterTurns: 0,
                },
              ],
            },
          },
        },
      },
    ],
    [
      // OP07-078 Megaton Nine-Tails Rush (3): the Foxy Leader (or a [Foxy]
      // Character) swings twice.
      //
      // `update` rather than the `rest` node's inverse, because setting a card
      // active is not an event anything watches -- and `update` is what reaches
      // `leaderRested`, which is where a Leader's rested state lives. The
      // target must *be* rested, or the activation buys nothing.
      "OP07-078",
      {
        cost: 3,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "field-don-versus",
              player: "self",
              operator: "lte",
            },
            then: {
              kind: "choose",
              selector: {
                player: "self",
                zone: "board",
                includeLeader: true,
                name: "Foxy",
                rested: true,
              },
              bind: "op07-megaton-target",
              min: 0,
              max: 1,
              effect: {
                kind: "update",
                binding: "op07-megaton-target",
                rested: false,
              },
            },
          },
        },
      },
    ],
    [
      // OP07-096 Tempest Kick (1): a card, and a cost debuff once the deck has
      // milled itself ten deep.
      //
      // The draw is unconditional, so the two halves are sequenced rather than
      // nested -- and the trash is read *after* the Event itself has been
      // trashed, which is what puts a deck on nine over the line.
      "OP07-096",
      {
        cost: 1,
        program: {
          effect: {
            kind: "sequence",
            effects: [
              { kind: "draw", player: "self", count: 1 },
              {
                kind: "if",
                condition: trashAtLeastTen,
                then: costDebuff(3, "op07-tempest-debuff"),
              },
            ],
          },
        },
      },
    ],
    [
      // OP07-116 Blaze Slice (1): the set's only card printed on both halves of
      // the Event window, so the same program is registered twice -- see
      // `op07-battle.ts` for the `[Counter]` half.
      "OP07-116",
      { cost: 1, program: blazeSlice },
    ],
  ],
  activateMain: [
    [
      // OP07-001 Monkey.D.Dragon (Leader): DON!! already given, moved onto one
      // Character.
      //
      // `from: "given"` is what makes this a re-aim rather than a ramp: the
      // DON!! stays on the field and keeps granting power, it just grants it
      // somewhere else. The Leader's own pile is the usual source, which is why
      // the printed clause is a Red Leader's -- it turns a turn's worth of
      // attack power into a lethal Character swing. `givenDon` gates the offer,
      // because with nothing given the activation would spend the turn's one
      // use on nothing.
      "OP07-001",
      {
        oncePerTurn: true,
        requires: { givenDon: 1 },
        program: {
          effect: {
            kind: "choose",
            selector: {
              player: "self",
              zone: "board",
              category: "character",
            },
            bind: "op07-dragon-gift",
            min: 0,
            max: 1,
            effect: {
              kind: "attach-don",
              player: "self",
              from: "given",
              count: 2,
              target: { binding: "op07-dragon-gift" },
            },
          },
        },
      },
    ],
    [
      // OP07-003 Outlook III: a 2-cost 0-power body traded for two debuffs.
      //
      // Gated outermost on the opponent having a Character at all, so the
      // activation is not offered into an empty board -- taking it there would
      // trash the card for nothing. Both debuffs come off one `choose` of two,
      // which is what "up to 2 of your opponent's Characters −2000" means: each
      // card in the binding takes the full number.
      "OP07-003",
      {
        oncePerTurn: false,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "selector-count",
              player: "opponent",
              selector: { zone: "board", category: "character" },
              operator: "gte",
              value: 1,
            },
            then: {
              kind: "sequence",
              effects: [
                {
                  kind: "move",
                  binding: SOURCE_BINDING,
                  to: { player: "self", zone: "trash" },
                },
                {
                  kind: "choose",
                  selector: {
                    player: "opponent",
                    zone: "board",
                    category: "character",
                  },
                  bind: "op07-outlook-debuff",
                  min: 0,
                  max: 2,
                  effect: {
                    kind: "modify-power",
                    binding: "op07-outlook-debuff",
                    amount: -2_000,
                    expiresAfterTurns: 0,
                  },
                },
              ],
            },
          },
        },
      },
    ],
    [
      // OP07-047 Trafalgar Law: picks itself up to bury a card from a full
      // hand.
      //
      // Gated outermost on the hand size the printed clause names, so the
      // activation is never offered as a bare self-bounce: it is repeatable,
      // and an offer that changes nothing is one a rules agent takes forever.
      // The opponent picks which card goes, which is the rule for anything
      // leaving a hand.
      "OP07-047",
      {
        oncePerTurn: false,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "zone-count",
              player: "opponent",
              zone: "hand",
              operator: "gte",
              value: 6,
            },
            then: {
              kind: "sequence",
              effects: [
                {
                  kind: "move",
                  binding: SOURCE_BINDING,
                  to: { player: "owner", zone: "hand" },
                },
                {
                  kind: "choose",
                  selector: { player: "opponent", zone: "hand" },
                  bind: "op07-law-bury",
                  chooser: "opponent",
                  min: 1,
                  max: 1,
                  effect: {
                    kind: "move",
                    binding: "op07-law-bury",
                    to: {
                      player: "opponent",
                      zone: "deck",
                      position: "bottom",
                    },
                  },
                },
              ],
            },
          },
        },
      },
    ],
    [
      // OP07-048 Donquixote Doflamingo: two rested DON!! for a look at the top
      // card, and a free Warlord if that is what it is.
      //
      // The reveal is its own node, so the card is public before the play is
      // offered -- the gamble is the whole card. "Place the rest at the bottom"
      // is one card and so a plain `move`: there is no order to ask about.
      "OP07-048",
      {
        oncePerTurn: true,
        requires: { activeDon: 2 },
        program: {
          effect: {
            kind: "sequence",
            effects: [
              { kind: "rest-don", player: "self", count: 2 },
              {
                kind: "look-at",
                player: "self",
                count: 1,
                bind: "op07-doflamingo-top",
              },
              { kind: "reveal", binding: "op07-doflamingo-top" },
              {
                kind: "choose",
                selector: {
                  player: "self",
                  zone: "deck",
                  binding: "op07-doflamingo-top",
                  category: "character",
                  type: "The Seven Warlords of the Sea",
                  maxCost: 4,
                },
                bind: "op07-doflamingo-play",
                min: 0,
                max: 1,
                effect: {
                  kind: "play",
                  binding: "op07-doflamingo-play",
                  rested: true,
                },
              },
              {
                kind: "select",
                selector: {
                  player: "self",
                  zone: "deck",
                  binding: "op07-doflamingo-top",
                },
                bind: "op07-doflamingo-rest",
                count: "all",
                effect: {
                  kind: "move",
                  binding: "op07-doflamingo-rest",
                  to: { player: "self", zone: "deck", position: "bottom" },
                },
              },
            ],
          },
        },
      },
    ],
    [
      // OP07-058 Island of Women (Stage): a card and the Stage's own rest, for
      // a Kuja body back in hand.
      //
      // Returning your own Character is the point rather than the price: the
      // Kuja package's bodies all carry an `[On Play]`, and this is how the deck
      // runs them twice. Gated outermost on the Leader's type, so the
      // activation is not offered behind a Leader that cannot pay it out.
      "OP07-058",
      {
        oncePerTurn: false,
        requires: { handCards: 1, sourceActive: true },
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "leader-has-type",
              player: "self",
              type: "Kuja Pirates",
            },
            then: {
              kind: "sequence",
              effects: [
                { kind: "rest", binding: SOURCE_BINDING },
                payFromHand(
                  { player: "self", zone: "hand" },
                  "op07-island-cost",
                  1,
                  {
                    kind: "choose",
                    selector: {
                      ...kujaCard,
                      player: "self",
                      zone: "board",
                      category: "character",
                    },
                    bind: "op07-island-bounce",
                    min: 0,
                    max: 1,
                    effect: {
                      kind: "move",
                      binding: "op07-island-bounce",
                      to: { player: "owner", zone: "hand" },
                    },
                  },
                ),
              ],
            },
          },
        },
      },
    ],
    [
      // OP07-060 Itomimizu: a DON!! a turn, as long as it is the only copy out.
      //
      // "No other [Itomimizu]" is a count with the source excluded, which is
      // the one reading that lets the first copy ramp and the second sit idle --
      // and it is a *name* check, so the format's other Itomimizu printings
      // switch it off too.
      "OP07-060",
      {
        oncePerTurn: true,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "all-of",
              conditions: [
                foxyLeader,
                {
                  kind: "selector-count",
                  player: "self",
                  selector: {
                    zone: "board",
                    category: "character",
                    name: "Itomimizu",
                    excludeSource: true,
                  },
                  operator: "eq",
                  value: 0,
                },
              ],
            },
            then: addDonRested,
          },
        },
      },
    ],
    [
      // OP07-071 Foxy: the ramp half. Its continuous `[Opponent's Turn]` debuff
      // is a row in `static-abilities.ts`.
      //
      // Ungated, unlike the rest of the package: a 7-cost body has paid for it.
      "OP07-071",
      { oncePerTurn: true, program: { effect: addDonRested } },
    ],
    [
      // OP07-073 Monkey.D.Luffy: `DON!! −3` to stand back up and swing again.
      //
      // `sourceRested` is what makes the offer honest -- setting an active
      // Character active buys nothing, and taking the offer would spend three
      // DON!! and the turn's one use. The opponent's board is the printed gate:
      // this is a card for a board that has something to answer.
      "OP07-073",
      {
        oncePerTurn: true,
        requires: { fieldDon: 3, sourceRested: true },
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "selector-count",
              player: "opponent",
              selector: { zone: "board", category: "character" },
              operator: "gte",
              value: 3,
            },
            then: {
              kind: "sequence",
              effects: [
                { kind: "return-don", player: "self", count: 3 },
                { kind: "update", binding: SOURCE_BINDING, rested: false },
              ],
            },
          },
        },
      },
    ],
    [
      // OP07-074 Monda: a 2-cost body traded for a DON!!, which behind the
      // Foxy Leader is a whole turn of tempo on a deck that spends DON!! to
      // cast its own cards.
      "OP07-074",
      {
        oncePerTurn: false,
        program: {
          effect: {
            kind: "if",
            condition: foxyLeader,
            then: {
              kind: "sequence",
              effects: [
                {
                  kind: "move",
                  binding: SOURCE_BINDING,
                  to: { player: "self", zone: "trash" },
                },
                addDonRested,
              ],
            },
          },
        },
      },
    ],
    [
      // OP07-083 Gecko Moria: four Thriller Bark cards out of the trash for
      // [Banish] and a thousand power.
      //
      // [Banish] is what the cost is really for: a Life card trashed instead of
      // joining the hand takes its `[Trigger]` with it, which is how Black
      // closes a game against a Life stack full of them.
      "OP07-083",
      {
        oncePerTurn: false,
        program: {
          effect: payFromTrash(
            4,
            "op07-moria-cost",
            {
              kind: "sequence",
              effects: [
                {
                  kind: "grant-keyword",
                  binding: SOURCE_BINDING,
                  keyword: "Banish",
                  expiresAfterTurns: 0,
                },
                {
                  kind: "modify-power",
                  binding: SOURCE_BINDING,
                  amount: 1_000,
                  expiresAfterTurns: 0,
                },
              ],
            },
            { type: "Thriller Bark Pirates" },
          ),
        },
      },
    ],
    [
      // OP07-097 Vegapunk (Leader): a rested DON!! turns an {Egghead} card in
      // hand into a body or into a Life card.
      //
      // The Leader cannot attack -- that half is `attackBannedByOwnText` -- so
      // this activation is the whole of what it does with a turn, and the Life
      // branch is what pays for the deck's "2 or less Life" payoffs. Face-up,
      // so both players know what the next hit turns over.
      //
      // `handCardsMatching` gates the offer: a hand with no {Egghead} card
      // under the ceiling would otherwise spend the turn's one use on a
      // `choose` that finds nothing.
      "OP07-097",
      {
        oncePerTurn: true,
        requires: {
          activeDon: 1,
          handCardsMatching: {
            match: { type: "Egghead", maxCost: 5 },
            count: 1,
          },
        },
        program: {
          effect: {
            kind: "sequence",
            effects: [
              { kind: "rest-don", player: "self", count: 1 },
              {
                kind: "choose",
                selector: {
                  player: "self",
                  zone: "hand",
                  type: "Egghead",
                  maxCost: 5,
                },
                bind: "op07-vegapunk-pick",
                min: 0,
                max: 1,
                effect: {
                  kind: "choice",
                  branches: [
                    {
                      id: "play",
                      label: "Play it",
                      effect: { kind: "play", binding: "op07-vegapunk-pick" },
                    },
                    {
                      id: "life",
                      label: "Add it to the top of your Life cards face-up",
                      effect: {
                        kind: "move",
                        binding: "op07-vegapunk-pick",
                        to: { player: "self", zone: "life", position: "top" },
                        faceUp: true,
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
      },
    ],
    [
      // OP07-109 Monkey.D.Luffy: a 5-cost body traded for removal and a card,
      // once the Yellow deck is down to two Life.
      //
      // The draw is printed after the K.O. and is not conditional on it
      // landing, so the two are sequenced inside the same gate.
      "OP07-109",
      {
        oncePerTurn: false,
        program: {
          effect: {
            kind: "if",
            condition: lifeAtMost(2),
            then: {
              kind: "sequence",
              effects: [
                {
                  kind: "move",
                  binding: SOURCE_BINDING,
                  to: { player: "self", zone: "trash" },
                },
                {
                  kind: "choose",
                  selector: {
                    player: "opponent",
                    zone: "board",
                    category: "character",
                    maxCost: 4,
                  },
                  bind: "op07-luffy-ko",
                  min: 0,
                  max: 1,
                  effect: { kind: "knock-out", binding: "op07-luffy-ko" },
                },
                { kind: "draw", player: "self", count: 1 },
              ],
            },
          },
        },
      },
    ],
  ],
};

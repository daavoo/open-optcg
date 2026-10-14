/**
 * OP08 `[On Play]` programs.
 *
 * Split by timing window like every other whole-set import; see
 * `mechanics/README.md`. Comments paraphrase what each program has to do rather
 * than quoting the card -- printed text is a runtime asset, not repo content
 * (`pnpm card:text OP08-0xx` prints it from the local cache).
 *
 * Three OP08 identities were in the pool before the set was, played by the
 * community decks that ship them: OP08-023 (`op06-yamato.ts`), OP08-036
 * (`op14-mihawk.ts`) and OP08-051 (`op17-meta.ts`). Their programs stay in the
 * modules named after those decks, the same split OP09 and OP14 kept.
 */
import { SOURCE_BINDING, type MechanicEffect } from "../mechanics.js";
import { type SetMechanics } from "./registry.js";
import { lookAndAdd, payFromHand, revealTopThen } from "./shared.js";
import {
  chopperDig,
  deckTopToLife,
  donMinusOne,
  koCostAtMost,
  playFromHand,
  powerDebuff,
  rampActive,
  restLock,
  revealTwoWhitebeard,
  snakeAttackLock,
  whitebeardLeader,
} from "./op08-shared.js";

/** "If you have [<name>]" -- the Drum Kingdom pair's gate on each other. */
const hasNamed = (name: string) =>
  ({
    kind: "selector-count",
    player: "self",
    selector: { zone: "board", category: "character", name },
    operator: "gte",
    value: 1,
  }) as const;

/**
 * "…play up to 1 Character card with a type including 'Whitebeard Pirates' and
 * a cost of C or less" out of the revealed card -- OP08-052's [On Play] and
 * OP08-054's [Counter] print the same sentence at different ceilings.
 */
export const playRevealedWhitebeard = (
  maxCost: number,
  bind: string,
): MechanicEffect =>
  revealTopThen(bind, {
    kind: "choose",
    selector: {
      player: "self",
      zone: "deck",
      binding: bind,
      category: "character",
      typeIncluding: "Whitebeard Pirates",
      maxCost,
    },
    bind: `${bind}-play`,
    min: 0,
    max: 1,
    effect: { kind: "play", binding: `${bind}-play` },
  });

export const op08OnPlayMechanics: SetMechanics = {
  onPlay: [
    [
      // OP08-004 Kuromarimo: removal that only fires beside its printed
      // partner. Current power, which is what "3000 power or less" means about
      // a card already on the board.
      "OP08-004",
      {
        effect: {
          kind: "if",
          condition: hasNamed("Chess"),
          then: {
            kind: "choose",
            selector: {
              player: "opponent",
              zone: "board",
              category: "character",
              maxCurrentPower: 3_000,
            },
            bind: "op08-kuromarimo-ko",
            min: 0,
            max: 1,
            effect: { kind: "knock-out", binding: "op08-kuromarimo-ko" },
          },
        },
      },
    ],
    [
      // OP08-005 Chess: the debuff, then the partner out of hand -- and the
      // board is read *after* the debuff, so a Kuromarimo already out is what
      // stops the second half rather than anything this card did.
      "OP08-005",
      {
        effect: {
          kind: "sequence",
          effects: [
            powerDebuff(2_000, "op08-chess-debuff"),
            {
              kind: "if",
              condition: {
                kind: "selector-count",
                player: "self",
                selector: {
                  zone: "board",
                  category: "character",
                  name: "Kuromarimo",
                },
                operator: "eq",
                value: 0,
              },
              then: playFromHand(
                { name: "Kuromarimo" },
                "op08-chess-kuromarimo",
              ),
            },
          ],
        },
      },
    ],
    [
      // OP08-007 Tony Tony.Chopper: the same program on two timings, so it is
      // written once in `op08-battle.ts` and registered from both.
      //
      // `[Your Turn]` is not free even on an `[On Play]`: a Character can reach
      // the board on the other player's turn through a Counter or a Trigger,
      // and this clause does nothing there.
      "OP08-007",
      chopperDig,
    ],
    [
      // OP08-008 Dalton: the [On Play] half. Its `[Activate: Main]` is in
      // `op08-main.ts`.
      "OP08-008",
      { effect: powerDebuff(1_000, "op08-dalton-debuff") },
    ],
    [
      // OP08-015 Dr.Kureha: the Drum Kingdom search, and the only one in the
      // set that reaches for a *name* as well as a type -- the deck's own
      // Leader identity is not a {Drum Kingdom} card on every printing.
      "OP08-015",
      lookAndAdd(4, "op08-kureha-looked", {
        anyOf: [{ name: "Tony Tony.Chopper" }, { type: "Drum Kingdom" }],
        excludeName: "Dr.Kureha",
      }),
    ],
    [
      // OP08-022 Inuarashi: the rest lock at its widest -- two bodies, cost 5.
      "OP08-022",
      {
        effect: {
          kind: "if",
          condition: { kind: "leader-has-type", player: "self", type: "Minks" },
          then: restLock(5, "op08-inuarashi-lock", 2),
        },
      },
    ],
    [
      // OP08-025 Shishilian: the same lock, one step down and ungated.
      "OP08-025",
      { effect: restLock(3, "op08-shishilian-lock") },
    ],
    [
      // OP08-028 Nekomamushi: [Rush] bought with the opponent's own rested
      // board, which is what the Minks lock package produces.
      "OP08-028",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "rested-cards",
            player: "opponent",
            operator: "gte",
            value: 7,
          },
          then: {
            kind: "grant-keyword",
            binding: SOURCE_BINDING,
            keyword: "Rush",
            expiresAfterTurns: 0,
          },
        },
      },
    ],
    [
      // OP08-031 Miyagi: sets a small Minks body active. Filtered on `rested`
      // so the offer never points at a Character that is already active.
      "OP08-031",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "self",
            zone: "board",
            category: "character",
            type: "Minks",
            maxCost: 2,
            rested: true,
          },
          bind: "op08-miyagi-active",
          min: 0,
          max: 1,
          effect: {
            kind: "update",
            binding: "op08-miyagi-active",
            rested: false,
          },
        },
      },
    ],
    [
      // OP08-033 Roddy: a 1-cost body that kills, once the lock has done its
      // work. Both halves of the printed gate, and the target must already be
      // rested.
      "OP08-033",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "all-of",
            conditions: [
              { kind: "leader-has-type", player: "self", type: "Minks" },
              {
                kind: "rested-cards",
                player: "opponent",
                operator: "gte",
                value: 7,
              },
            ],
          },
          then: {
            kind: "choose",
            selector: {
              player: "opponent",
              zone: "board",
              category: "character",
              rested: true,
              maxCost: 2,
            },
            bind: "op08-roddy-ko",
            min: 0,
            max: 1,
            effect: { kind: "knock-out", binding: "op08-roddy-ko" },
          },
        },
      },
    ],
    [
      // OP08-034 Wanda: the Minks search.
      "OP08-034",
      lookAndAdd(5, "op08-wanda-looked", {
        type: "Minks",
        excludeName: "Wanda",
      }),
    ],
    [
      // OP08-040 Atmos: the Leader gate is read *inside* the reveal cost, which
      // is where the printed sentence puts it -- revealing two cards behind the
      // wrong Leader buys nothing, and the offer says so by resolving to
      // nothing rather than by being withheld.
      "OP08-040",
      {
        effect: revealTwoWhitebeard("op08-atmos-reveal", {
          kind: "if",
          condition: whitebeardLeader,
          then: {
            kind: "choose",
            selector: {
              player: "opponent",
              zone: "board",
              category: "character",
              maxCost: 4,
            },
            bind: "op08-atmos-bounce",
            min: 0,
            max: 1,
            effect: {
              kind: "move",
              binding: "op08-atmos-bounce",
              to: { player: "owner", zone: "hand" },
            },
          },
        }),
      },
    ],
    [
      // OP08-043 Edward.Newgate: the set's 10-cost finisher, and the only
      // printed clause in the pool that prices an attack instead of banning it
      // -- see the `attack-taxed` restriction. "Select all", so no choice: a
      // `select` over their whole board, and a Character played after this
      // resolves is not one of the selected and swings for free.
      //
      // Both halves of the gate are printed, and the Life half is what makes it
      // a comeback card rather than a lock: it does nothing from ahead.
      "OP08-043",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "all-of",
            conditions: [
              whitebeardLeader,
              {
                kind: "zone-count",
                player: "self",
                zone: "life",
                operator: "lte",
                value: 2,
              },
            ],
          },
          then: {
            kind: "select",
            selector: {
              player: "opponent",
              zone: "board",
              category: "character",
            },
            bind: "op08-newgate-tax",
            count: "all",
            effect: {
              kind: "restrict",
              binding: "op08-newgate-tax",
              restriction: "attack-taxed",
              handTrashCost: 2,
              expiresAfterTurns: 1,
            },
          },
        },
      },
    ],
    [
      // OP08-047 Jozu: pays a body of its own for a bounce that reaches
      // *either* side of the table -- "1 Character", not "1 of your
      // opponent's", so a Character with an [On Play] worth re-buying is a
      // legal target.
      "OP08-047",
      {
        effect: {
          kind: "optional",
          effect: {
            kind: "choose",
            selector: {
              player: "self",
              zone: "board",
              category: "character",
              excludeSource: true,
            },
            bind: "op08-jozu-cost",
            min: 1,
            max: 1,
            effect: {
              kind: "sequence",
              effects: [
                {
                  kind: "move",
                  binding: "op08-jozu-cost",
                  to: { player: "owner", zone: "hand" },
                },
                {
                  kind: "choose",
                  selector: {
                    player: "either",
                    zone: "board",
                    category: "character",
                    maxCost: 6,
                  },
                  bind: "op08-jozu-bounce",
                  min: 0,
                  max: 1,
                  effect: {
                    kind: "move",
                    binding: "op08-jozu-bounce",
                    to: { player: "owner", zone: "hand" },
                  },
                },
              ],
            },
          },
        },
      },
    ],
    [
      // OP08-049 Speed Jil: [Rush] off the top of its own deck. The card is
      // revealed before the type is read and placed at either end afterwards,
      // so the peek is worth something even when the flip misses.
      "OP08-049",
      {
        effect: revealTopThen("op08-jil-top", {
          kind: "if",
          condition: {
            kind: "selector-count",
            player: "self",
            selector: {
              zone: "deck",
              binding: "op08-jil-top",
              typeIncluding: "Whitebeard Pirates",
            },
            operator: "gte",
            value: 1,
          },
          then: {
            kind: "grant-keyword",
            binding: SOURCE_BINDING,
            keyword: "Rush",
            expiresAfterTurns: 0,
          },
        }),
      },
    ],
    [
      // OP08-050 Namule: draw two, put two back at either end in any order --
      // a filter rather than a refill, which is what `order-to-bottom`'s
      // `alternate` is for.
      "OP08-050",
      {
        effect: {
          kind: "sequence",
          effects: [
            { kind: "draw", player: "self", count: 2 },
            {
              kind: "choose",
              selector: { player: "self", zone: "hand" },
              bind: "op08-namule-back",
              min: 2,
              max: 2,
              effect: {
                kind: "order-to-bottom",
                binding: "op08-namule-back",
                to: { player: "self", zone: "deck", position: "top" },
                alternate: { player: "self", zone: "deck", position: "bottom" },
              },
            },
          ],
        },
      },
    ],
    [
      // OP08-052 Portgas.D.Ace: the free Whitebeard body off the top.
      "OP08-052",
      { effect: playRevealedWhitebeard(4, "op08-ace-top") },
    ],
    [
      // OP08-060 King: [Rush] paid for with a DON!! and priced off the
      // opponent's board rather than its own -- it is a catch-up card.
      "OP08-060",
      {
        effect: donMinusOne({
          kind: "if",
          condition: {
            kind: "field-don",
            player: "opponent",
            operator: "gte",
            value: 5,
          },
          then: {
            kind: "grant-keyword",
            binding: SOURCE_BINDING,
            keyword: "Rush",
            expiresAfterTurns: 0,
          },
        }),
      },
    ],
    [
      // OP08-063 Charlotte Katakuri: ramp bought with the information in a
      // face-up Life card. Only a face-up card can be turned face-down, which
      // is what makes the cost payable at all -- and it is paid from the top,
      // the card the next attack turns over.
      "OP08-063",
      {
        effect: {
          kind: "optional",
          effect: {
            kind: "choose",
            selector: {
              player: "self",
              zone: "life",
              position: "top",
              faceUp: true,
            },
            bind: "op08-katakuri-life",
            min: 1,
            max: 1,
            effect: {
              kind: "sequence",
              effects: [
                {
                  kind: "update",
                  binding: "op08-katakuri-life",
                  faceUp: false,
                },
                rampActive,
              ],
            },
          },
        },
      },
    ],
    [
      // OP08-069 Charlotte Linlin: a Life card for itself, then a body of the
      // opponent's *into* their Life face-up. The second half is not damage --
      // the Character joins their Life, which is a removal that also hands them
      // a card back, so the printed "top or bottom" is a real decision and is
      // written as one.
      "OP08-069",
      {
        effect: donMinusOne(
          payFromHand({ player: "self", zone: "hand" }, "op08-linlin-cost", 1, {
            kind: "sequence",
            effects: [
              deckTopToLife("op08-linlin-life"),
              {
                kind: "choose",
                selector: {
                  player: "opponent",
                  zone: "board",
                  category: "character",
                  maxCost: 6,
                },
                bind: "op08-linlin-bury",
                min: 0,
                max: 1,
                effect: {
                  kind: "choice",
                  branches: [
                    {
                      id: "top",
                      label: "Add it to the top of their Life cards",
                      effect: {
                        kind: "move",
                        binding: "op08-linlin-bury",
                        to: { player: "owner", zone: "life", position: "top" },
                        faceUp: true,
                      },
                    },
                    {
                      id: "bottom",
                      label: "Add it to the bottom of their Life cards",
                      effect: {
                        kind: "move",
                        binding: "op08-linlin-bury",
                        to: {
                          player: "owner",
                          zone: "life",
                          position: "bottom",
                        },
                        faceUp: true,
                      },
                    },
                  ],
                },
              },
            ],
          }),
        ),
      },
    ],
    [
      // OP08-080 Queen: the Animal Kingdom search.
      "OP08-080",
      lookAndAdd(5, "op08-queen-looked", {
        type: "Animal Kingdom Pirates",
        excludeName: "Queen",
      }),
    ],
    [
      // OP08-086 Ginrummy: refills only against a board the SMILE package has
      // already pushed to zero cost. Effective cost, which is the whole point:
      // nothing is printed at 0.
      "OP08-086",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "selector-count",
            player: "opponent",
            selector: { zone: "board", category: "character", maxCost: 0 },
            operator: "gte",
            value: 1,
          },
          then: {
            kind: "sequence",
            effects: [
              { kind: "draw", player: "self", count: 2 },
              {
                kind: "choose",
                selector: { player: "self", zone: "hand" },
                bind: "op08-ginrummy-trash",
                min: 2,
                max: 2,
                effect: {
                  kind: "move",
                  binding: "op08-ginrummy-trash",
                  to: { player: "self", zone: "trash" },
                },
              },
            ],
          },
        },
      },
    ],
    [
      // OP08-088 Duval: a cost buff, which in Black is protection -- it lifts a
      // body out of the "cost N or less" removal the format is full of, and it
      // holds through the opponent's turn.
      "OP08-088",
      {
        effect: {
          kind: "choose",
          selector: { player: "self", zone: "board", category: "character" },
          bind: "op08-duval-cost",
          min: 0,
          max: 1,
          effect: {
            kind: "modify-cost",
            binding: "op08-duval-cost",
            amount: 1,
            expiresAfterTurns: 1,
          },
        },
      },
    ],
    [
      // OP08-090 Hamlet: SMILE recursion out of the trash.
      "OP08-090",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "self",
            zone: "trash",
            category: "character",
            type: "SMILE",
            maxCost: 2,
          },
          bind: "op08-hamlet-play",
          min: 0,
          max: 1,
          effect: { kind: "play", binding: "op08-hamlet-play" },
        },
      },
    ],
    [
      // OP08-091 Who's.Who: the same removal its own Trigger prints, bought
      // with a card from hand.
      "OP08-091",
      {
        effect: {
          kind: "optional",
          effect: payFromHand(
            { player: "self", zone: "hand" },
            "op08-whoswho-cost",
            1,
            koCostAtMost(3, "op08-whoswho-ko"),
          ),
        },
      },
    ],
    [
      // OP08-092 Page One: reaches for its printed partner by name.
      "OP08-092",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "self",
            zone: "trash",
            category: "character",
            name: "Ulti",
            maxCost: 4,
          },
          bind: "op08-page-one-play",
          min: 0,
          max: 1,
          effect: { kind: "play", binding: "op08-page-one-play" },
        },
      },
    ],
    [
      // OP08-100 South Bird: digs seven deep for the Stage the Shandian
      // package is built around, and plays it straight off the deck.
      "OP08-100",
      {
        effect: {
          kind: "sequence",
          effects: [
            {
              kind: "look-at",
              player: "self",
              count: 7,
              bind: "op08-south-bird",
            },
            {
              kind: "choose",
              selector: {
                player: "self",
                zone: "deck",
                binding: "op08-south-bird",
                name: "Upper Yard",
              },
              bind: "op08-south-bird-play",
              min: 0,
              max: 1,
              effect: { kind: "play", binding: "op08-south-bird-play" },
            },
            {
              kind: "select",
              selector: {
                player: "self",
                zone: "deck",
                binding: "op08-south-bird",
              },
              bind: "op08-south-bird-rest",
              count: "all",
              effect: {
                kind: "order-to-bottom",
                binding: "op08-south-bird-rest",
                to: { player: "self", zone: "deck", position: "bottom" },
              },
            },
          ],
        },
      },
    ],
    [
      // OP08-102 Charlotte Opera: removal whose ceiling is the controller's own
      // Life total, which is what `maxCostFromZoneCount` reads -- a Yellow deck
      // sitting on five Life kills almost anything, and the same card on one
      // Life kills a 1-drop.
      "OP08-102",
      {
        effect: {
          kind: "optional",
          effect: payFromHand(
            { player: "self", zone: "hand" },
            "op08-opera-cost",
            1,
            {
              kind: "choose",
              selector: {
                player: "opponent",
                zone: "board",
                category: "character",
                maxCostFromZoneCount: { player: "self", zone: "life" },
              },
              bind: "op08-opera-ko",
              min: 0,
              max: 1,
              effect: { kind: "knock-out", binding: "op08-opera-ko" },
            },
          ),
        },
      },
    ],
    [
      // OP08-106 Nami: the cost names a card with a [Trigger], which
      // `hasTrigger` reads off the derived rules rather than off the words.
      // The refill is read *after* the K.O., so the card that paid is already
      // gone when the hand is counted.
      "OP08-106",
      {
        effect: {
          kind: "optional",
          effect: payFromHand(
            { player: "self", zone: "hand", hasTrigger: true },
            "op08-nami-cost",
            1,
            {
              kind: "sequence",
              effects: [
                koCostAtMost(5, "op08-nami-ko"),
                {
                  kind: "if",
                  condition: {
                    kind: "zone-count",
                    player: "self",
                    zone: "hand",
                    operator: "lte",
                    value: 3,
                  },
                  then: { kind: "draw", player: "self", count: 1 },
                },
              ],
            },
          ),
        },
      },
    ],
    [
      // OP08-109 Mont Blanc Noland: the Shandian package's Life refill, gated
      // on the Leader and on its printed partner being out.
      "OP08-109",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "all-of",
            conditions: [
              {
                kind: "leader-has-type",
                player: "self",
                type: "Shandian Warrior",
              },
              hasNamed("Kalgara"),
            ],
          },
          then: deckTopToLife("op08-noland-life"),
        },
      },
    ],
    [
      // OP08-110 Wyper: finds the Stage and then plays it out of hand -- the
      // second half reads the hand *after* the search, so the copy it just
      // added is the one it can put down.
      "OP08-110",
      {
        effect: {
          kind: "sequence",
          effects: [
            lookAndAdd(5, "op08-wyper-looked", { name: "Upper Yard" }).effect,
            playFromHand({ name: "Upper Yard" }, "op08-wyper-stage"),
          ],
        },
      },
    ],
    [
      // OP08-112 S-Snake: the same program its own Trigger runs. The named
      // exclusion is printed, and it is the reason this card does not answer
      // the Leader the Seraphim were built against.
      "OP08-112",
      snakeAttackLock,
    ],
    [
      // OP08-118 Silvers Rayleigh: two different numbers to two different
      // bodies, which is what `excludeBinding` is for -- without it the same
      // Character could take both halves and read -5000. The K.O. is read
      // *after* both debuffs, so a body pushed to 3000 by this card's own text
      // is a legal target for its own second half.
      "OP08-118",
      {
        effect: {
          kind: "sequence",
          effects: [
            {
              kind: "choose",
              selector: {
                player: "opponent",
                zone: "board",
                category: "character",
              },
              bind: "op08-rayleigh-big",
              min: 0,
              max: 1,
              effect: {
                kind: "modify-power",
                binding: "op08-rayleigh-big",
                amount: -3_000,
                expiresAfterTurns: 1,
              },
            },
            {
              kind: "choose",
              selector: {
                player: "opponent",
                zone: "board",
                category: "character",
                excludeBinding: "op08-rayleigh-big",
              },
              bind: "op08-rayleigh-small",
              min: 0,
              max: 1,
              effect: {
                kind: "modify-power",
                binding: "op08-rayleigh-small",
                amount: -2_000,
                expiresAfterTurns: 1,
              },
            },
            {
              kind: "choose",
              selector: {
                player: "opponent",
                zone: "board",
                category: "character",
                maxCurrentPower: 3_000,
              },
              bind: "op08-rayleigh-ko",
              min: 0,
              max: 1,
              effect: { kind: "knock-out", binding: "op08-rayleigh-ko" },
            },
          ],
        },
      },
    ],
  ],
};

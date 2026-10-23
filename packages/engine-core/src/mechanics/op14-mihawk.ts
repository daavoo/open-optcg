/**
 * The off-set identities `OP14-MIHAWK-SLASH` plays, as programs.
 *
 * One module for cards from six different series, for the same reason
 * `cards/src/op14-mihawk.ts` is one file: none of them belongs to a set this
 * repo carries whole, and `op17-meta.ts` set the precedent of grouping a deck's
 * reach-outside-the-set slots rather than opening six near-empty set modules.
 *
 * The deck's own set (OP14-020's Leader, OP14-038, OP14-039) is in the
 * `op14-*.ts` modules, its ST32 and OP12-023 slots in `format.ts` and
 * `effects.ts`, and its OP13/OP17 slots in `op17-meta.ts`, `op17-on-play.ts`
 * and `op17-triggers.ts`, so nothing here duplicates them.
 *
 * What they have in common is that resting is currency. Two are the deck's
 * 1-cost searchers, one is its cheap removal, and the rest are the Events that
 * turn a rested field into cards, into power, and into a board that does not
 * stand back up.
 */
import { type MechanicEffect } from "../mechanics.js";
import { type SetMechanics } from "./registry.js";
import { lookAndAdd, payFromHand } from "./shared.js";

/**
 * "You may rest 2 of your Characters: <effect>."
 *
 * The Characters-only sibling of `restOwnCards` in `op14-main.ts`, which reads
 * the commoner "rest N of your cards" as the Leader and the Characters.
 * OP01-055 prints "Characters", so the Leader is not a legal payment and
 * `includeLeader` stays off -- the one difference between the two, and the
 * reason this is not a call into that helper.
 *
 * `canRest` rather than `rested: false`: a cost has to be payable with the
 * cards it names, and an opponent's "cannot be rested" effect on one of your
 * own Characters makes it unpayable with that body. `rested: false` alone would
 * offer it, rest nothing, and hand over the draw for free.
 */
const restOwnCharacters = (
  count: number,
  bind: string,
  effect: MechanicEffect,
): MechanicEffect => ({
  kind: "optional",
  effect: {
    kind: "choose",
    selector: {
      player: "self",
      zone: "board",
      category: "character",
      canRest: true,
    },
    bind,
    min: count,
    max: count,
    effect: {
      kind: "sequence",
      // Through the `rest` node rather than `update`, because that is what the
      // deck's own "when this Character becomes rested" clauses (ST32-003,
      // OP14-027) are listening for. Paying this price is meant to switch them
      // on.
      effects: [{ kind: "rest", binding: bind }, effect],
    },
  },
});

export const op14MihawkMechanics: SetMechanics = {
  onPlay: [
    [
      // OP07-022 Otama: "[printed text omitted -- pnpm card:text OP07-022]"
      //
      // The deck's widest dig -- five cards deep into a list where ST32-001
      // Kin'emon, ST32-002 Oden and OP12-023 Kawamatsu are all {Land of Wano},
      // so it rarely whiffs. `excludeName` is the printed "other than [Otama]",
      // and it is on the *name* rather than the card number, which is what
      // stops a second copy being fetched.
      "OP07-022",
      lookAndAdd(5, "op07-otama", {
        color: "Green",
        type: "Land of Wano",
        excludeName: "Otama",
      }),
    ],
    [
      // OP12-034 Perona: "[printed text omitted -- pnpm card:text OP12-034]"
      //
      // The gate is on the Leader's attribute, not its name, so the card is
      // live behind any <Slash> Leader; OP14-020 is one, which is the only
      // reason this 1-drop is in this deck. It reads through
      // `leader-has-attribute` because a Leader is in no zone and
      // `selector-count` cannot ask about one.
      //
      // The reveal is a two-branch disjunction where the second branch needs two
      // facts at once ("green" *and* "Event"), which is what the conjunctive
      // `anyOf` clause is for: `{ category: "event" }` alone would also fetch
      // the deck's off-colour Events, of which it plays none today -- but the
      // filter should say what the card says, not what the list happens to hold.
      // The first branch is attribute-only and so reaches ST32-003, OP14-027,
      // ST24-004 and the Slash bodies alike, Character or not.
      "OP12-034",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "leader-has-attribute",
            player: "self",
            attribute: "Slash",
          },
          then: lookAndAdd(5, "op12-perona", {
            anyOf: [
              { attribute: "Slash" },
              { color: "Green", category: "event" },
            ],
          }).effect,
        },
      },
    ],
    [
      // ST24-004 Law & Bepo: "[printed text omitted -- pnpm card:text ST24-004]"
      //
      // The deck's closer, and both halves are written the way the pool already
      // writes them: "[printed text omitted -- pnpm card:text ST24-004]" is `restrict: "cannot-refresh"` at `expiresAfterTurns: 1` (the
      // same clause OP15-023 and the OP17-020 Leader print), and "[printed text omitted -- pnpm card:text OP17-020]" is that same one-turn window on a
      // `modify-power`, which is what makes the +2000 defence rather than a
      // push. `{ zone: [], includeLeader: true }` names the Leader alone.
      //
      // No `canRest`: an already-rested Character is a legal pick, and the
      // lock still keeps it down through the next Refresh Phase (Bandai's
      // ST24-004#1). One that cannot be rested stays active, so its lock does
      // nothing.
      //
      // The `if` reads the board *after* the rest, which is what "Then" means:
      // the Character this clause just rested counts toward the 2, so one
      // already-rested body across the table is enough to switch the buff on.
      "ST24-004",
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
              bind: "st24-lawbepo-rest",
              min: 0,
              max: 1,
              effect: {
                kind: "sequence",
                effects: [
                  { kind: "rest", binding: "st24-lawbepo-rest" },
                  {
                    kind: "restrict",
                    binding: "st24-lawbepo-rest",
                    restriction: "cannot-refresh",
                    expiresAfterTurns: 1,
                  },
                ],
              },
            },
            {
              kind: "if",
              condition: {
                kind: "selector-count",
                player: "opponent",
                selector: {
                  zone: "board",
                  category: "character",
                  rested: true,
                },
                operator: "gte",
                value: 2,
              },
              then: {
                kind: "select",
                selector: { player: "self", zone: [], includeLeader: true },
                bind: "st24-lawbepo-leader",
                count: "all",
                effect: {
                  kind: "modify-power",
                  binding: "st24-lawbepo-leader",
                  amount: 2000,
                  expiresAfterTurns: 1,
                },
              },
            },
          ],
        },
      },
    ],
    [
      // OP06-033 Vander Decken IX: "[printed text omitted -- pnpm card:text OP06-033]"
      //
      // The list's cheap removal, and the reason its {Fish-Man} count is not an
      // accident: OP12-023 Kawamatsu is a {Fish-Man} the deck already plays for
      // its Slash body, and this card is the second one, so a hand holding two
      // of them can always pay. That is also why the cost is a real decision
      // rather than a formality -- Kawamatsu in hand is a 5-drop, and feeding
      // it to a 2-drop to K.O. a rested body is the trade this clause offers.
      //
      // "Rested" is on the target, so this is removal that only fires into a
      // board the deck has already rested. That is the whole point of it being
      // in a rest-lock list -- and it is why the gate is a conjunction rather
      // than the cost half alone. "Up to 1" lets the K.O. resolve for zero, so
      // a gate that asks only whether the cost is payable offers a trade in
      // which one half is charged and the other cannot happen: a {Fish-Man}
      // leaves the hand and nothing across the table is touched.
      //
      // The two printed halves of the cost are one selector rather than a
      // `choice`, because a `choice` would offer a branch that can never be
      // taken: [The Ark Noah] is not an identity this repo has imported, and no
      // {Fish-Man} Stage exists in the pool at all -- so `zone: ["hand",
      // "stage"]` reaches exactly the printed set today, and the only card the
      // Stage half can ever name is Ark Noah itself. Importing a {Fish-Man}
      // Stage that is not Ark Noah is what would make this too permissive, and
      // is what should split it back into two branches.
      "OP06-033",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "all-of",
            conditions: [
              {
                kind: "selector-count",
                player: "self",
                selector: {
                  zone: ["hand", "stage"],
                  anyOf: [{ type: "Fish-Man" }, { name: "The Ark Noah" }],
                },
                operator: "gte",
                value: 1,
              },
              {
                kind: "selector-count",
                player: "opponent",
                selector: {
                  zone: "board",
                  category: "character",
                  rested: true,
                },
                operator: "gte",
                value: 1,
              },
            ],
          },
          then: {
            kind: "optional",
            effect: payFromHand(
              {
                player: "self",
                zone: ["hand", "stage"],
                anyOf: [{ type: "Fish-Man" }, { name: "The Ark Noah" }],
              },
              "op06-decken-cost",
              1,
              {
                kind: "choose",
                selector: {
                  player: "opponent",
                  zone: "board",
                  category: "character",
                  rested: true,
                },
                bind: "op06-decken-ko",
                min: 0,
                max: 1,
                effect: { kind: "knock-out", binding: "op06-decken-ko" },
              },
            ),
          },
        },
      },
    ],
    [
      // OP06-035 Hody Jones: "[printed text omitted -- pnpm card:text OP06-035]"
      //
      // The rest-lock's [Rush] top end: it lands, rests two of the things
      // across the table, and refills the hand it cost -- so the body that
      // attacks the turn it arrives also pays for itself.
      //
      // "A total of 2 ... Characters or DON!! cards" is one printed budget over
      // two pools, which is what `rest-opponent-cards` is for: no `CardSelector`
      // spans the board and the cost area, and nesting `choice` branches would
      // offer "rest a DON!!" to a player whose opponent has none. OP12-037 Asura
      // prints the same clause and reaches the same shape through the older
      // imperative `rest-opponent-card` pending effect; this card cannot, because
      // its text does not end at the rest and the imperative path has nowhere to
      // hang the "Then".
      //
      // The Life pull is mandatory and `position: "edge"` is the top of the
      // pile, so this is a `select` rather than a `choose`: "[printed text omitted -- pnpm card:text OP12-037]" names the card, it does not offer it. Taking a
      // Life card is a real price at 1 Life, and the engine is right to charge
      // it without asking.
      "OP06-035",
      {
        effect: {
          kind: "sequence",
          effects: [
            { kind: "rest-opponent-cards", player: "opponent", count: 2 },
            {
              kind: "select",
              selector: { player: "self", zone: "life", position: "edge" },
              bind: "op06-hody-life",
              count: 1,
              effect: {
                kind: "move",
                binding: "op06-hody-life",
                to: { player: "self", zone: "hand" },
              },
            },
          ],
        },
      },
    ],
  ],
  eventMain: [
    [
      // OP01-055 "You Can Be My Samurai!!": "[printed text omitted -- pnpm card:text OP01-055]"
      //
      // A straight two-for-one in a deck that wants its own Characters rested
      // anyway: ST32-003 Mihawk and OP14-027 Shanks both pay out when they
      // become rested, so the "cost" of this Event is where two of the deck's
      // bodies want to be.
      "OP01-055",
      {
        cost: 1,
        program: {
          effect: restOwnCharacters(2, "op01-samurai-cost", {
            kind: "draw",
            player: "self",
            count: 2,
          }),
        },
      },
    ],
    [
      // OP08-036 "Electrical Luna": "[printed text omitted -- pnpm card:text OP08-036]"
      //
      // The rest-lock's payoff card, and the only one that locks a *board*
      // rather than a body. Everything else in the list rests one Character at
      // a time; this holds down every one of them at once, which is why it is
      // worth 3 cost in a deck whose Leader refunds three DON!! a turn.
      //
      // "All", not "up to": `select` with `count: "all"` and no decision, so a
      // board with nothing rested on it simply locks nothing. That is also why
      // it is not gated -- an Event that can be played into an empty board is a
      // wasted card, but it is the player's card to waste, and the engine has
      // no business refusing a legal play.
      //
      // The window is the same `expiresAfterTurns: 1` that ST24-004 above uses
      // for the identical printed clause, so the two stack rather than
      // disagreeing about what "[printed text omitted -- pnpm card:text ST24-004]" means.
      "OP08-036",
      {
        cost: 3,
        program: {
          effect: {
            kind: "select",
            selector: {
              player: "opponent",
              zone: "board",
              category: "character",
              rested: true,
              maxCost: 7,
            },
            bind: "op08-luna-lock",
            count: "all",
            effect: {
              kind: "restrict",
              binding: "op08-luna-lock",
              restriction: "cannot-refresh",
              expiresAfterTurns: 1,
            },
          },
        },
      },
    ],
  ],
  counterEvent: [
    [
      // OP06-038 "The Billion-fold World Trichiliocosm": "[printed text omitted -- pnpm card:text OP06-038]"
      //
      // "[printed text omitted -- pnpm card:text OP06-038]" with no further restriction
      // is the unrestricted Counter: the engine holds a battle's power as one
      // number on the card being attacked, and that card is always your Leader
      // or one of your Characters, so there is no `target` filter to write and
      // no choice worth offering. See `battle-power`'s own note.
      //
      // "That card" in the second sentence is therefore the same card, which is
      // why the conditional half is another `battle-power` on `self` rather than
      // a binding: both land on the one scalar the battle carries.
      //
      // Eight rested cards counts the cost area too -- see `rested-cards` -- and
      // that is what makes the clause reachable rather than aspirational. This
      // deck's Leader rests its own field to refund DON!!, and a field rested on
      // your turn is still rested through the opponent's, because Refresh
      // happens at the start of *your* turn. So the +4000 mode is the normal one
      // on the turn after a big ramp, not a corner case.
      "OP06-038",
      {
        cost: 1,
        power: 2000,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "rested-cards",
              player: "self",
              operator: "gte",
              value: 8,
            },
            then: { kind: "battle-power", player: "self", amount: 2000 },
          },
        },
      },
    ],
  ],
  trigger: [
    [
      // OP06-038 "The Billion-fold World Trichiliocosm": "[printed text omitted -- pnpm card:text OP06-038]"
      //
      // "A cost of 3 or less", not "a base cost of 3 or less", so it reads the
      // effective cost -- `maxCost` rather than `maxBaseCost`. The `rested`
      // requirement is on the target rather than on your own field, which makes
      // this the deck's only removal that a *defensive* Trigger can supply.
      "OP06-038",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            category: "character",
            rested: true,
            maxCost: 3,
          },
          bind: "op06-trichiliocosm-ko",
          min: 0,
          max: 1,
          effect: { kind: "knock-out", binding: "op06-trichiliocosm-ko" },
        },
      },
    ],
    [
      // OP08-036 "Electrical Luna": "[printed text omitted -- pnpm card:text OP08-036]"
      //
      // The Trigger half is a plain rest with no cost filter, unlike the [Main]
      // half's "7 or less" -- so off Life it reaches a body the paid half
      // cannot. `canRest` is the pool-wide convention for "[printed text omitted -- pnpm card:text OP08-036]": it skips a Character that is already rested, where
      // resting again would do nothing.
      "OP08-036",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            category: "character",
            canRest: true,
          },
          bind: "op08-luna-trigger",
          min: 0,
          max: 1,
          effect: { kind: "rest", binding: "op08-luna-trigger" },
        },
      },
    ],
  ],
};

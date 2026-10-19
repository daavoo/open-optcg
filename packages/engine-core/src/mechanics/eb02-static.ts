/**
 * Continuous text printed on EB-02: the rows `static-abilities.ts` folds
 * into power, cost and keyword queries. A clause with no timing marker lives
 * here; one with a marker is a program in this set's other modules.
 */
import { fieldDonCount } from "../don.js";
import { type StaticAbility, opponentOf } from "../static-abilities.js";
import {
  attachedDon,
  fieldHasName,
  leaderHasType,
  leaderMulticolored,
  opponentCharacters,
  turnPlayer,
} from "./static-shared.js";

export const eb02StaticAbilities: readonly StaticAbility[] = [
  // EB02-003 Tony Tony.Chopper: "[DON!! x2] [Opponent's Turn] This Character
  // gains +2000 power." Two conditions on one layer and both are printed: the
  // DON!! given to this card, and whose turn it is. So a 3-cost 3000 body
  // carrying two DON!! defends at 5000 and attacks at 5000 too -- the DON!!
  // itself pays the other 2000 on its controller's turn. Its `[On Play]` is in
  // `mechanics/eb02-on-play.ts`.
  {
    cardNumber: "EB02-003",
    scope: "self",
    power: {
      kind: "add",
      value: (context) =>
        attachedDon(context) >= 2 && turnPlayer(context) !== context.playerId
          ? 2000
          : 0,
    },
  },
  // EB02-005 Fake Straw Hat Crew: "[Your Turn] This Character gains +2000
  // power. [Opponent's Turn] Give this Character −2000 power." One row, because
  // the two sentences are the two sides of one number: a 2-cost body that
  // attacks as a 5000 and blocks as a 1000. The whole card is that it cannot
  // defend, which is what a 2-cost 5000 attacker with no Counter is priced
  // against.
  {
    cardNumber: "EB02-005",
    scope: "self",
    power: {
      kind: "add",
      value: (context) =>
        turnPlayer(context) === context.playerId ? 2000 : -2000,
    },
  },
  // EB02-012 Gaimon: "If you have a [Sarfunkel], this Character gains
  // [Blocker]." The other half of the joke is EB02-014 Sarfunkel, whose
  // `[On Play]` plays this out of hand for free -- so the pair is a 2-cost play
  // that leaves a 1000 Blocker behind. A name match rather than the card
  // number, so an alias printed by a later [Sarfunkel] would count, and read
  // over the whole field so a Leader with every card name counts too.
  {
    cardNumber: "EB02-012",
    scope: "self",
    keyword: {
      keyword: "Blocker",
      when: (context) => fieldHasName(context, "Sarfunkel"),
    },
  },
  // EB02-019 Roronoa Zoro: "If your opponent has 2 or more Characters, this
  // Character can attack Characters on the turn in which it is played." That
  // sentence is [Rush: Character] spelled out, gated on the board it is written
  // to answer: a wide board is what this 4-cost 5000 body is played into, and a
  // rest on arrival is what its `[On Play]` in `mechanics/eb02-on-play.ts`
  // adds to it.
  {
    cardNumber: "EB02-019",
    scope: "self",
    keyword: {
      keyword: "Rush: Character",
      when: (context) => opponentCharacters(context) >= 2,
    },
  },
  // EB02-033 Klabautermann: "If you have [Merry Go] on your field, this
  // Character gains [Blocker]." "On your field" is the Stage area as well as
  // the board, and for this card it is only ever the Stage area: both [Merry
  // Go] in the pool are Stages (EB02-041 and EB02-060), which is what makes a
  // 1-cost 0-power {Sprite} a Blocker the Stage pays for.
  {
    cardNumber: "EB02-033",
    scope: "self",
    keyword: {
      keyword: "Blocker",
      when: (context) => fieldHasName(context, "Merry Go"),
    },
  },
  // EB02-052 Enel: "If your Leader has the {Sky Island} type, this Character
  // gains [Rush]." [Rush] rather than [Rush: Character]: the printed text names
  // no restriction, so a 10-cost 11000 body lands and swings at the Leader on
  // the same turn. Its `[When Attacking]` is in `mechanics/eb02-battle.ts`.
  {
    cardNumber: "EB02-052",
    scope: "self",
    keyword: {
      keyword: "Rush",
      when: (context) => leaderHasType(context, "Sky Island"),
    },
  },
  // EB02-061 Monkey.D.Luffy: "If your Leader is multicolored and your opponent
  // has 5 or more DON!! cards on their field, this Character gains [Rush]."
  // The second half is a clock on the *opponent's* ramp rather than on the
  // controller's own, so the keyword arrives exactly when a 6-cost 7000 body
  // needs to attack the turn it lands. Its `[When Attacking]` is in
  // `mechanics/eb02-battle.ts`.
  {
    cardNumber: "EB02-061",
    scope: "self",
    readsDon: ["opponent"],
    keyword: {
      keyword: "Rush",
      when: (context) =>
        leaderMulticolored(context) &&
        fieldDonCount(context.state, opponentOf(context.playerId)) >= 5,
    },
  },
];

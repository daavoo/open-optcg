/**
 * Continuous text printed on OP-05: the rows `static-abilities.ts` folds
 * into power, cost and keyword queries. A clause with no timing marker lives
 * here; one with a marker is a program in this set's other modules.
 */
import { hasCardType } from "@one-piece-sim/cards";
import {
  type StaticAbility,
  boardCardPower,
  opponentOf,
} from "../static-abilities.js";
import {
  attachedDon,
  birdcageHolds,
  celestialDragonsCourt,
  fieldDon,
  lowLife,
  trashAtLeastCount,
  turnPlayer,
} from "./static-shared.js";

export const op05StaticAbilities: readonly StaticAbility[] = [
  // OP05-066 Jinbe: "[Blocker] ... [Opponent's Turn] If you have 10 DON!! cards
  // on your field, this Character gains +1000 power."
  //
  // The [Blocker] is printed and unconditional, so `hasStaticKeyword` reads it
  // straight off the card and only the power half is a layer. Ten is the whole
  // DON!! deck, so this is live exactly once the deck is empty -- which is the
  // turn the ST-26 Leader's refund has been paying towards all game.
  //
  // `fieldDon` rather than `totalGivenDon`: the printed text says "on your
  // field", which counts active, rested and given DON!! alike.
  {
    cardNumber: "OP05-066",
    scope: "self",
    power: {
      kind: "add",
      value: (context) =>
        turnPlayer(context) !== context.playerId && fieldDon(context) >= 10
          ? 1000
          : 0,
    },
  },
  // OP05-070 Fra-Nosuke: "[DON!! x1] If you have 8 or more DON!! cards on your
  // field, this Character gains [Rush]."
  //
  // Two gates, and they ask different questions: `[DON!! x1]` is DON!! given to
  // *this card*, and the "8 or more" is the whole field's. A 5-cost body played
  // on the turn the eighth DON!! arrives has exactly one DON!! spare to give
  // itself, which is what the pair is priced around.
  //
  // `"Rush"`, not `"Rush: Character"`: the printed text names no restriction on
  // what it may attack.
  {
    cardNumber: "OP05-070",
    scope: "self",
    keyword: {
      keyword: "Rush",
      when: (context) =>
        !context.isLeader &&
        attachedDon(context) >= 1 &&
        fieldDon(context) >= 8,
    },
  },
  // OP05-003 Inazuma: [Rush] while another of the controller's Characters is a
  // 7000 or bigger. Current power, so a body carrying the turn's DON!! counts --
  // that is the Red Revolutionary Army plan, and the reason the clause is
  // printed on a 3-cost. "Other than this Character" is an instance question,
  // asked against the card being evaluated.
  {
    cardNumber: "OP05-003",
    scope: "self",
    keyword: {
      keyword: "Rush",
      when: (context) =>
        !context.isLeader &&
        context.state.players[context.playerId].board.some(
          (card) =>
            card.instanceId !== context.card.instanceId &&
            context.db.require(card.cardNumber).category === "character" &&
            boardCardPower(
              context.state,
              context.playerId,
              card,
              true,
              context.db,
            ) >= 7000,
        ),
    },
  },
  // OP05-062 O-Nami: [Blocker] at exactly ten DON!! on the field -- the Purple
  // Straw Hat plan's terminal state, and `fieldDon` counts given DON!! too,
  // which is what "on your field" means everywhere else in the pool.
  {
    cardNumber: "OP05-062",
    scope: "self",
    keyword: {
      keyword: "Blocker",
      when: (context) => fieldDon(context) >= 10,
    },
  },
  // OP05-086 Nefeltari Vivi: [Blocker] behind ten cards in the trash, Black's
  // mill payoff gate at the same threshold OP15-087 and OP07's `trashAtLeastTen`
  // read.
  {
    cardNumber: "OP05-086",
    scope: "self",
    keyword: {
      keyword: "Blocker",
      when: (context) => trashAtLeastCount(context, 10),
    },
  },
  // OP05-101 Ohm: +1000 at two or fewer Life, Yellow's behind-only gate. Its
  // `[On Play]` search is in `mechanics/op05-on-play.ts`.
  {
    cardNumber: "OP05-101",
    scope: "self",
    power: {
      kind: "add",
      value: (context) => (lowLife(context, 2) ? 1000 : 0),
    },
  },
  // OP05-084 Saint Charlos and OP05-092 Saint Rosward: every opposing Character
  // is −4 (or −6) cost on the controller's turn, while the controller's board is
  // *only* {Celestial Dragons}. An `opponent-board-aura`, so `context.playerId`
  // is the side being debuffed and the source walks the far board; "[Your Turn]"
  // is the aura's controller being the turn player, which from here is the
  // other seat. Vacuously true on a board of one -- the Saint alone qualifies --
  // which is the whole reason the deck plays no other bodies.
  {
    cardNumber: "OP05-084",
    scope: "opponent-board-aura",
    cost: (context) => (celestialDragonsCourt(context) ? -4 : 0),
  },
  {
    cardNumber: "OP05-092",
    scope: "opponent-board-aura",
    cost: (context) => (celestialDragonsCourt(context) ? -6 : 0),
  },
  // OP05-097 Mary Geoise (Stage): one DON!! off every {Celestial Dragons}
  // Character of printed cost 2 or more played from hand on the controller's
  // turn. Printed cost, so the Saints' own −N auras on the opposing board do
  // not move it; a hand card has no effective cost anyway.
  {
    cardNumber: "OP05-097",
    scope: "stage-aura",
    handPlayDiscount: (context) => {
      const card = context.db.require(context.card.cardNumber);
      return turnPlayer(context) === context.playerId &&
        card.category === "character" &&
        (card.cost ?? 0) >= 2 &&
        hasCardType(context.card.cardNumber, "Celestial Dragons")
        ? 1
        : 0;
    },
  },
  // OP05-040 Birdcage: while its controller's Leader is [Donquixote
  // Doflamingo], no Character with a cost of 5 or less on *either* side stands
  // up in a Refresh Phase. Two rows because a Stage aura reaches one side of
  // the table at a time; each reads the Leader on the Stage's own side. Its
  // `[End of Your Turn]` half is in `mechanics/op05-triggers.ts`.
  {
    cardNumber: "OP05-040",
    scope: "stage-aura",
    blocksRefresh: (context) => birdcageHolds(context, context.playerId),
  },
  {
    cardNumber: "OP05-040",
    scope: "opponent-stage-aura",
    blocksRefresh: (context) =>
      birdcageHolds(context, opponentOf(context.playerId)),
  },
];

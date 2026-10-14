/**
 * Continuous text printed on EB-04: the rows `static-abilities.ts` folds
 * into power, cost and keyword queries. A clause with no timing marker lives
 * here; one with a marker is a program in this set's other modules.
 *
 * The Red/Yellow Jewelry Bonney list prints one clause per Life threshold it
 * plays around; `decks/src/eb04-bonney-manifest.ts` has the ladder they make
 * together, and the list's timed text is in `eb04-bonney.ts`.
 */
import { hasCardName, hasCardType } from "@one-piece-sim/cards";
import {
  type StaticAbility,
  opponentOf,
  type RemovalImmunity,
} from "../static-abilities.js";
import {
  attachedDon,
  leaderHasType,
  lowLife,
  lucciSteps,
  turnPlayer,
} from "./static-shared.js";

export const eb04StaticAbilities: readonly StaticAbility[] = [
  // EB04-001 Jewelry Bonney, the Leader: "[printed text omitted -- pnpm card:text EB04-001]"
  //
  // `scope: "self"` on a Leader, and the layer has to check `isLeader` itself:
  // "this Leader" names one card, and without the guard the aura would read as
  // the whole board. `turnPlayer(context) !== context.playerId` is
  // `[Opponent's Turn]` -- the buff is defence only, which is the half that
  // makes running the Life total to one survivable.
  //
  // Its `[Activate: Main]` half is registered in `mechanics/eb04-bonney.ts`,
  // and the two share the threshold from opposite sides: the activation trades
  // Life for cards only while there are 2 or more, and this switches on at 1.
  {
    cardNumber: "EB04-001",
    scope: "self",
    power: {
      kind: "add",
      value: (context) =>
        context.isLeader &&
        turnPlayer(context) !== context.playerId &&
        lowLife(context, 1)
          ? 2000
          : 0,
    },
  },
  // EB04-056 Pacifista: "[printed text omitted -- pnpm card:text EB04-056]"
  //
  // "You have [Jewelry Bonney]" reads the Leader as well as the board -- a
  // named card the player has, and in this deck it is the Leader that satisfies
  // it, so all four copies are live from turn one and it is the Life half that
  // gates them. Written as both halves anyway, because the clause is printed
  // that way and nothing stops the card being played under another Leader that
  // finds an EB04-002 or an OP13-108.
  //
  // Zero Life exactly, not "1 or less": this is the last-ditch wall, four
  // 1-cost bodies to soak four attacks on the turn the deck would otherwise
  // lose. `lowLife(context, 0)` is that reading -- the ceiling form with a
  // ceiling of nothing.
  {
    cardNumber: "EB04-056",
    scope: "self",
    keyword: {
      keyword: "Blocker",
      when: (context) =>
        lowLife(context, 0) &&
        (hasCardName(
          context.state.players[context.playerId].leaderCardNumber,
          "Jewelry Bonney",
        ) ||
          context.state.players[context.playerId].board.some((card) =>
            hasCardName(card.cardNumber, "Jewelry Bonney"),
          )),
    },
  },
  // EB04-061 Monkey.D.Luffy: "[printed text omitted -- pnpm card:text EB04-061]"
  //
  // "Give this card *in your hand* -1 cost", so `handPlayDiscount` and not a
  // `cost` layer: the clause names the hand, and `playCostFromHand` is the only
  // path a hand price takes. A `cost` layer misses that path entirely and lands
  // on the board reading instead, where the printed text does not reach -- it
  // would make the played 10-drop answer "cost 9 or less" removal it is printed
  // to be out of range of. Same split, and the same reason, as PRB02-014's note
  // in `hand-price.ts`.
  //
  // One DON!! off a ten, which sounds marginal and is not: nine is the turn a
  // deck that has been spending its own Life reaches first, and this clause is
  // live exactly when that deck's Leader is already at 7000.
  {
    cardNumber: "EB04-061",
    scope: "self",
    handPlayDiscount: (context) => (lowLife(context, 1) ? 1 : 0),
  },
  // The rest of EB-04, the extra booster's own set import. Six continuous
  // clauses in five colours, so unlike the Bonney block above they share no
  // thread -- what they share is that none of them names a timing window, which
  // is what puts them here rather than in `mechanics/eb04-*.ts`.

  // EB04-003 Smoker & Tashigi: printed text `pnpm card:text EB04-003`.
  //
  // A Character rewriting its *Leader's* base power, which only `board-aura`
  // can reach: `scope: "self"` would ask about this card, and the clause is
  // about the card behind it. The layer guards on `isLeader` for the same
  // reason EB04-001's does from the other side -- without it every Character on
  // the board would become a 7000.
  //
  // `set-base` rather than `add`, because "becomes 7000" is a replacement: it
  // composes as layer 1, so DON!! given to the Leader still stacks on top and a
  // 6000 Leader gains 1000 rather than 2000. That is what makes this and
  // EB04-004 Zeff the same defensive floor from two different windows.
  {
    cardNumber: "EB04-003",
    scope: "board-aura",
    power: {
      kind: "set-base",
      value: (context) => {
        if (!context.isLeader) return undefined;
        if (turnPlayer(context) === context.playerId) return undefined;
        return leaderHasType(context, "Navy") ? 7000 : undefined;
      },
    },
  },
  // EB04-005 Trafalgar Law: printed text `pnpm card:text EB04-005`.
  //
  // A 3-cost 5000 with a 2000 Counter whose price is that it cannot attack into
  // an empty board: "unless your opponent has 2 or more Characters with a base
  // power of 5000 or more" is a live board question, so it is an
  // `attackBlocked` predicate rather than the derived `cannotAttack` flag.
  //
  // Printed power, not current: DON!! the opponent piles on for a swing does
  // not turn this card on, and a debuff this deck applied does not turn it off.
  // The card is a punish for a developed board, and printed power is what
  // "developed" means here.
  {
    cardNumber: "EB04-005",
    scope: "self",
    attackBlocked: (context) =>
      context.state.players[opponentOf(context.playerId)].board.filter(
        (card) => (context.db.require(card.cardNumber).power ?? 0) >= 5000,
      ).length < 2,
  },
  // EB04-010 Lulucia Kingdom (Stage): printed text
  // `pnpm card:text EB04-010`.
  //
  // `stage-aura`, the scope that is live while this exact card is its
  // controller's Stage -- and +5000 on a base-cost-1 body is the largest
  // single aura in the pool, which is what a 7-cost Stage with no other
  // continuous text is paying for. `[Opponent's Turn]` makes it purely
  // defensive: a board of 1-drops that were 1000 on the turn they attacked
  // blocks at 6000.
  //
  // `maxBaseCost`'s reading, done by hand: the printed cost, so a 1-drop this
  // deck's own effects raised is still covered and a 2-drop discounted to 1 is
  // not. Its `[On Play]` half is in `mechanics/eb04-on-play.ts`.
  {
    cardNumber: "EB04-010",
    scope: "stage-aura",
    power: {
      kind: "add",
      value: (context) =>
        !context.isLeader &&
        turnPlayer(context) !== context.playerId &&
        (context.db.require(context.card.cardNumber).cost ?? 0) === 1
          ? 5000
          : 0,
    },
  },
  // EB04-017 Mystoms: printed text `pnpm card:text EB04-017`.
  //
  // `opponent-board-aura`: the subject is the *other* player's Characters and
  // the source is a Character on this one's board, which is the pairing that
  // scope exists for. `[Your Turn]` reads as the aura's controller being the
  // turn player, and from inside the layer -- whose `playerId` is the player
  // being asked about, the opponent of the source -- that is
  // `turnPlayer(context) !== context.playerId`.
  //
  // The three-body count is read on the source's side, so it has to walk that
  // board explicitly rather than through `context`. Its `[On Play]` half is in
  // `mechanics/eb04-on-play.ts`, and the body it plays is what turns this on.
  {
    cardNumber: "EB04-017",
    scope: "opponent-board-aura",
    cost: (context) => {
      if (context.isLeader) return 0;
      if (turnPlayer(context) === context.playerId) return 0;
      const source = context.state.players[opponentOf(context.playerId)];
      const minks = source.board.filter(
        (card) =>
          hasCardType(card.cardNumber, "Minks") &&
          context.db.require(card.cardNumber).category === "character",
      ).length;
      return minks >= 3 ? -1 : 0;
    },
  },
  // EB04-046 Doll: printed text `pnpm card:text EB04-046`.
  //
  // A *cost* aura read as defence, which is the read that makes a 2-cost 1000
  // worth a slot: most of the pool's removal names a cost ceiling, so +2 on
  // this player's own {Navy} bodies during the opponent's turn is what puts
  // them out of reach of it. `board-aura`, so it covers the teammates and this
  // card itself.
  {
    cardNumber: "EB04-046",
    scope: "board-aura",
    cost: (context) =>
      !context.isLeader &&
      turnPlayer(context) !== context.playerId &&
      hasCardType(context.card.cardNumber, "Navy")
        ? 2
        : 0,
  },
  // EB04-048 Rob Lucci: printed text `pnpm card:text EB04-048`.
  //
  // "for every 5 cards in your trash" is integer division and both halves read
  // the same number, so the two layers are written as one pair of rows keyed on
  // the same count -- a trash of 14 is two steps, not two and four fifths.
  //
  // The cost half climbing is a benefit here for the same reason EB04-046's is:
  // this deck fills its own trash (EB04-042 three at a time, EB04-043 two), so
  // by the time the power is worth anything the body is also hard to remove by
  // cost.
  //
  // `leader-type-including` in condition form: the printed clause quotes
  // "CP" as a substring, which reaches {CP0}, {CP8} and {CP9} -- three types
  // this set alone prints. Its `[On Play]` half is in
  // `mechanics/eb04-on-play.ts`.
  {
    cardNumber: "EB04-048",
    scope: "self",
    power: {
      kind: "add",
      value: (context) => 1000 * lucciSteps(context),
    },
    cost: (context) => 2 * lucciSteps(context),
  },
  // EB04-051 Emet: printed text `pnpm card:text EB04-051`.
  //
  // The same conditional ban as EB04-005 and a much harder one: "there is a
  // Character with 12000 base power or more" names no side, so either board
  // can satisfy it -- but 12000 printed is the Elbaph giants and almost
  // nothing else, which is why this 8-cost 7000's real mode is its
  // `[Trigger]` (in `mechanics/eb04-triggers.ts`) rather than an attack.
  {
    cardNumber: "EB04-051",
    scope: "self",
    attackBlocked: (context) =>
      !(["p1", "p2"] as const).some((playerId) =>
        context.state.players[playerId].board.some(
          (card) => (context.db.require(card.cardNumber).power ?? 0) >= 12000,
        ),
      ),
  },
  // EB04-057 Vegapunk: printed text `pnpm card:text EB04-057`.
  //
  // Only the `[DON!! x1]` half is here. The removal immunity is not a layer at
  // all -- it is an aura over *other* cards read by `isRemovalImmune`, which
  // has its own table; see `REMOVAL_IMMUNE_BY_AURA` above.
  {
    cardNumber: "EB04-057",
    scope: "self",
    keyword: {
      keyword: "Blocker",
      when: (context) => attachedDon(context) >= 1,
    },
  },
];

export const eb04RemovalImmunities: readonly RemovalImmunity[] = [
  // EB04-057 Vegapunk: printed text: `pnpm card:text EB04-057`. Yellow *and*
  // {Scientist}, so a second Vegapunk protects itself and this set's other
  // Ohara body and nothing else -- a narrow aura, which is what a 2-cost
  // 0-power is allowed to print. The Life gate is the yellow trade again: the
  // protection arrives only once the deck has spent down to two.
  {
    cardNumber: "EB04-057",
    from: "opponent",
    protects: (definition) =>
      definition.category === "character" &&
      definition.colors?.includes("Yellow") === true &&
      definition.types.includes("Scientist"),
    when: (state, ownerId) => state.players[ownerId].life.length <= 2,
  },
];

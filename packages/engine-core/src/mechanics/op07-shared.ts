/**
 * OP07 program fragments more than one of its cards prints.
 *
 * Comments paraphrase what each fragment has to do rather than quoting the
 * card -- printed text is a runtime asset, not repo content
 * (`pnpm card:text OP07-0xx` prints it from the local cache).
 */
import {
  SOURCE_BINDING,
  type CardSelector,
  type MechanicCondition,
  type MechanicEffect,
  type MechanicProgram,
} from "../mechanics.js";

/**
 * "If the number of DON!! cards on your field is equal to or less than the
 * number on your opponent's field" -- the gate the whole Purple Foxy package
 * is built on. Thirteen of the set's twenty Purple cards print it, and it is
 * what makes a deck that spends `DON!! −N` on every clause pay itself back.
 *
 * The tie counts, which is the common board state rather than the exception:
 * a strict `lt` would switch the archetype off on every even turn.
 */
export const donBehind: MechanicCondition = {
  kind: "field-don-versus",
  player: "self",
  operator: "lte",
};

/** "If your Leader has the {Foxy Pirates} type" -- printed on six of them. */
export const foxyLeader: MechanicCondition = {
  kind: "leader-has-type",
  player: "self",
  type: "Foxy Pirates",
};

/** "If your Leader has the {The Seven Warlords of the Sea} type." */
export const warlordLeader: MechanicCondition = {
  kind: "leader-has-type",
  player: "self",
  type: "The Seven Warlords of the Sea",
};

/**
 * "If you have 2 or more {Amazon Lily} or {Kuja Pirates} type Characters on
 * your field" -- the Kuja package's board gate, printed on OP07-050 and
 * OP07-052.
 *
 * A disjunction inside one selector rather than two conditions: a Character
 * with both types is one Character, and counting it twice would open the gate
 * on a board of one.
 */
export const twoKujaBodies: MechanicCondition = {
  kind: "selector-count",
  player: "self",
  selector: {
    zone: "board",
    category: "character",
    anyOf: [{ type: "Amazon Lily" }, { type: "Kuja Pirates" }],
  },
  operator: "gte",
  value: 2,
};

/** The same disjunction as a target filter, for the searches that print it. */
export const kujaCard: Omit<CardSelector, "player" | "zone"> = {
  anyOf: [{ type: "Amazon Lily" }, { type: "Kuja Pirates" }],
};

/** "If you have N or less Life cards" -- Yellow's price for everything. */
export const lifeAtMost = (value: number): MechanicCondition => ({
  kind: "zone-count",
  player: "self",
  zone: "life",
  operator: "lte",
  value,
});

/** "If you have 10 or more cards in your trash" -- Black's mill payoff gate. */
export const trashAtLeastTen: MechanicCondition = {
  kind: "zone-count",
  player: "self",
  zone: "trash",
  operator: "gte",
  value: 10,
};

/** "Return up to 1 of your opponent's Characters with a cost of C or less to the owner's hand." */
export const bounceCostAtMost = (
  maxCost: number,
  bind: string,
): MechanicEffect => ({
  kind: "choose",
  selector: {
    player: "opponent",
    zone: "board",
    category: "character",
    maxCost,
  },
  bind,
  min: 0,
  max: 1,
  effect: {
    kind: "move",
    binding: bind,
    to: { player: "owner", zone: "hand" },
  },
});

/**
 * "Place up to 1 Character with a cost of C or less at the bottom of the
 * owner's deck."
 *
 * `player: "either"` because the printed clause names no side -- OP07-051 and
 * OP07-052 both read "1 Character", which reaches the controller's own board
 * as well. The destination is the *owner's* deck for the same reason.
 */
export const buryCostAtMost = (
  maxCost: number,
  bind: string,
): MechanicEffect => ({
  kind: "choose",
  selector: {
    player: "either",
    zone: "board",
    category: "character",
    maxCost,
  },
  bind,
  min: 0,
  max: 1,
  effect: {
    kind: "move",
    binding: bind,
    to: { player: "owner", zone: "deck", position: "bottom" },
  },
});

/** "Rest up to 1 of your opponent's Characters with a cost of C or less." */
export const restCostAtMost = (
  maxCost: number,
  bind: string,
): MechanicEffect => ({
  kind: "choose",
  selector: {
    player: "opponent",
    zone: "board",
    category: "character",
    maxCost,
    canRest: true,
  },
  bind,
  min: 0,
  max: 1,
  effect: { kind: "rest", binding: bind },
});

/**
 * "Up to 1 of your Leader or Character cards gains +N power during this turn."
 *
 * Turn-scoped rather than battle-scoped, which is why it is a `modify-power`
 * on a chosen card and not a `battle-power`: OP07-036 prints it in a `[Main]`
 * Event with no battle open at all, and OP07-095's `[Trigger]` prints the same
 * sentence off a Life card.
 */
export const buffOwnCardForTurn = (
  amount: number,
  bind: string,
  expiresAfterTurns = 0,
): MechanicEffect => ({
  kind: "choose",
  selector: { player: "self", zone: "board", includeLeader: true },
  bind,
  min: 0,
  max: 1,
  effect: {
    kind: "modify-power",
    binding: bind,
    amount,
    expiresAfterTurns,
  },
});

/**
 * "You may place N cards <match> from your trash at the bottom of your deck in
 * any order: <effect>."
 *
 * Black's second currency, printed on four OP07 cards. The payoff is nested
 * inside the cost's `choose` for the reason `payFromHand` gives: a `choose`
 * whose zone cannot fill its `min` is skipped and the queue continues, so
 * sequencing the two would hand the payoff to a player who cannot pay.
 *
 * "In any order" is the player's, so the cards go back through
 * `order-to-bottom` rather than through a bare `move`.
 */
export const payFromTrash = (
  count: number,
  bind: string,
  effect: MechanicEffect,
  match: Omit<CardSelector, "player" | "zone"> = {},
): MechanicEffect => ({
  kind: "optional",
  effect: {
    kind: "choose",
    selector: { ...match, player: "self", zone: "trash" },
    bind,
    min: count,
    max: count,
    effect: {
      kind: "sequence",
      effects: [
        {
          kind: "order-to-bottom",
          binding: bind,
          to: { player: "self", zone: "deck", position: "bottom" },
        },
        effect,
      ],
    },
  },
});

/** "…cards with a type including \"CP\"" -- OP07-080 and OP07-092's currency. */
export const cpCard: Omit<CardSelector, "player" | "zone"> = {
  typeIncluding: "CP",
};

/**
 * "Trash 2 cards from the top of your deck and give up to 1 of your opponent's
 * Characters −N cost during this turn."
 *
 * OP07-082 and OP07-086 print the same sentence at −1 and −2. The mill is
 * mandatory and comes first, which matters on this deck: its own payoffs read
 * the trash count back.
 */
export const millTwoThenCostDebuff = (
  amount: number,
  bind: string,
): MechanicEffect => ({
  kind: "sequence",
  effects: [
    { kind: "trash-top", player: "self", count: 2 },
    {
      kind: "choose",
      selector: { player: "opponent", zone: "board", category: "character" },
      bind,
      min: 0,
      max: 1,
      effect: {
        kind: "modify-cost",
        binding: bind,
        amount: -amount,
        expiresAfterTurns: 0,
      },
    },
  ],
});

/**
 * "Add up to 1 DON!! card from your DON!! deck and rest it" / "and set it as
 * active" -- the Foxy package's ramp, printed on seven cards between the two
 * readings.
 */
export const addDonRested: MechanicEffect = {
  kind: "add-don",
  player: "self",
  count: 1,
  rested: true,
};

export const addDonActive: MechanicEffect = {
  kind: "add-don",
  player: "self",
  count: 1,
  rested: false,
};

/**
 * "[Trigger] If your Leader is [Vegapunk], play this card."
 *
 * Five OP07 Egghead Characters print exactly this, which is what makes the
 * Yellow deck's Life stack a board rather than a hand: the gate is on the
 * Leader's *name*, so a {Egghead} Leader that is not Vegapunk does not fire it.
 */
export const playSelfBehindVegapunk: MechanicEffect = {
  kind: "if",
  condition: { kind: "leader-has-name", player: "self", name: "Vegapunk" },
  then: { kind: "play", binding: SOURCE_BINDING },
};

/**
 * OP07-116 Blaze Slice (1): a small buff, and a rest once the opponent is down
 * to two Life.
 *
 * The set's only card printed on both halves of the Event window
 * (`[Main]`/`[Counter]`), so one program is registered from both tables. The
 * buff is turn-scoped rather than battle-scoped even on the `[Counter]` half --
 * the printed words are "during this turn" -- which is why the entry there
 * carries `power: 0` and does its work in the program.
 */
export const blazeSlice: MechanicProgram = {
  effect: {
    kind: "sequence",
    effects: [
      buffOwnCardForTurn(1_000, "op07-blaze-buff"),
      {
        kind: "if",
        condition: {
          kind: "zone-count",
          player: "opponent",
          zone: "life",
          operator: "lte",
          value: 2,
        },
        then: restCostAtMost(4, "op07-blaze-rest"),
      },
    ],
  },
};

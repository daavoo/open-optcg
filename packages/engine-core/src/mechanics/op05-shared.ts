/**
 * OP05 program fragments more than one of its cards prints.
 *
 * Comments paraphrase what each fragment has to do rather than quoting the
 * card -- printed text is a runtime asset, not repo content
 * (`pnpm card:text OP05-0xx` prints it from the local cache).
 */
import {
  SOURCE_BINDING,
  type CardSelector,
  type MechanicCondition,
  type MechanicEffect,
} from "../mechanics.js";

/** "If your Leader has the {Revolutionary Army} type" -- Red's gate. */
export const revolutionaryArmyLeader: MechanicCondition = {
  kind: "leader-has-type",
  player: "self",
  type: "Revolutionary Army",
};

/**
 * "If this Character has 7000 power or more" -- the gate the Red Revolutionary
 * Army package hangs its `[When Attacking]` payoffs on. Current power, so the
 * DON!! given to the attacker for the turn is what pays it.
 */
export const sourceAtLeast7000: MechanicCondition = {
  kind: "source-current-power",
  operator: "gte",
  value: 7_000,
};

/** "[DON!! x1]" as a gate on a `[When Attacking]` program firing at all. */
export const sourceHasDon: MechanicCondition = {
  kind: "source-attached-don",
  operator: "gte",
  value: 1,
};

/** "If you have 8 or more DON!! cards on your field" -- Purple's payoff gate. */
export const eightFieldDon: MechanicCondition = {
  kind: "field-don",
  player: "self",
  operator: "gte",
  value: 8,
};

/**
 * "If your opponent has more DON!! cards on their field than you" -- the
 * OP05 Heart Pirates pair's behind-only gate. Strict: the tie is the common
 * board state and the clause is written to sit it out.
 */
export const donBehindStrict: MechanicCondition = {
  kind: "field-don-versus",
  player: "self",
  operator: "lt",
};

/** "If your Leader is multicolored" -- printed on eight OP05 cards. */
export const multicoloredLeader: MechanicCondition = {
  kind: "leader-multicolored",
  player: "self",
};

/**
 * "Give up to 1 of your opponent's Leader or Character cards −N power during
 * this turn." -- the Leader is a legal target, unlike `powerDebuff`.
 */
export const debuffLeaderOrCharacter = (
  amount: number,
  bind: string,
): MechanicEffect => ({
  kind: "choose",
  selector: { player: "opponent", zone: "board", includeLeader: true },
  bind,
  min: 0,
  max: 1,
  effect: {
    kind: "modify-power",
    binding: bind,
    amount: -amount,
    expiresAfterTurns: 0,
  },
});

/**
 * "K.O. up to 1 of your opponent's Characters with N power or less" -- Red's
 * removal, read as *current* power so the set's own −N debuffs bring a body
 * inside it.
 */
export const koPowerAtMost = (
  maxCurrentPower: number,
  bind: string,
): MechanicEffect => ({
  kind: "choose",
  selector: {
    player: "opponent",
    zone: "board",
    category: "character",
    maxCurrentPower,
  },
  bind,
  min: 0,
  max: 1,
  effect: { kind: "knock-out", binding: bind },
});

/** "K.O. up to 1 of your opponent's rested Characters with a cost of C or less." */
export const koRestedCostAtMost = (
  maxCost: number,
  bind: string,
): MechanicEffect => ({
  kind: "choose",
  selector: {
    player: "opponent",
    zone: "board",
    category: "character",
    rested: true,
    maxCost,
  },
  bind,
  min: 0,
  max: 1,
  effect: { kind: "knock-out", binding: bind },
});

/**
 * "K.O. up to 1 of your opponent's Characters with a cost equal to or less than
 * the number of your opponent's Life cards" -- the Yellow Sky Island package's
 * removal, printed on four OP05 cards. A live ceiling, which is what
 * `maxCostFromZoneCount` exists for.
 */
export const koCostAtMostOpponentLife = (bind: string): MechanicEffect => ({
  kind: "choose",
  selector: {
    player: "opponent",
    zone: "board",
    category: "character",
    maxCostFromZoneCount: { player: "opponent", zone: "life" },
  },
  bind,
  min: 0,
  max: 1,
  effect: { kind: "knock-out", binding: bind },
});

/**
 * "Return up to 1 Character with a cost of C or less to the owner's hand."
 *
 * `player: "either"` because the printed clause names no side -- OP05-049,
 * OP05-057's Trigger and OP05-059 all read "1 Character", which reaches the
 * controller's own board too; the destination is the *owner's* hand for the
 * same reason.
 */
export const bounceEitherCostAtMost = (
  maxCost: number,
  bind: string,
): MechanicEffect => ({
  kind: "choose",
  selector: { player: "either", zone: "board", category: "character", maxCost },
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
 * "Play up to 1 {Revolutionary Army} type Character card with 5000 power or
 * less from your hand" -- printed on OP05-018's both halves and, with an
 * `excludeName`, on OP05-004.
 */
export const revolutionaryArmyBody: Omit<CardSelector, "player" | "zone"> = {
  category: "character",
  type: "Revolutionary Army",
  maxPower: 5_000,
};

/**
 * "You may trash 1 card from your hand: If your Leader is multicolored, play
 * this card." -- OP05-016 Morley and OP05-017 Lindbergh's Triggers.
 *
 * The gate is read *first*: the printed order lets a player pay for nothing
 * behind a mono-colour Leader, but that is a choice no player makes, and the
 * outermost `if` is what keeps the Trigger from being offered at all where it
 * cannot land -- see `triggerProgramCanAct`.
 */
export const trashToPlaySelfBehindMulticolor = (
  bind: string,
): MechanicEffect => ({
  kind: "if",
  condition: multicoloredLeader,
  then: {
    kind: "optional",
    effect: {
      kind: "choose",
      selector: { player: "self", zone: "hand" },
      bind,
      min: 1,
      max: 1,
      effect: {
        kind: "sequence",
        effects: [
          {
            kind: "move",
            binding: bind,
            to: { player: "self", zone: "trash" },
          },
          { kind: "play", binding: SOURCE_BINDING },
        ],
      },
    },
  },
});

/**
 * "Place up to 1 of your opponent's Characters with a cost of C or less at the
 * top or bottom of their Life cards face-up" -- OP05-096's third branch and
 * OP05-111 Hotori.
 *
 * The end is the controller's choice, so the placement is a `choice` of two
 * moves after the target is picked. Face-up, which is what makes it a real
 * removal: the card comes back to the opponent's hand only as damage, and
 * everybody knows which card it is.
 */
export const opponentCharacterToLife = (
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
    kind: "choice",
    branches: [
      {
        id: "life-top",
        label: "Place it at the top of their Life cards face-up",
        effect: {
          kind: "move",
          binding: bind,
          to: { player: "owner", zone: "life", position: "top" },
          faceUp: true,
        },
      },
      {
        id: "life-bottom",
        label: "Place it at the bottom of their Life cards face-up",
        effect: {
          kind: "move",
          binding: bind,
          to: { player: "owner", zone: "life", position: "bottom" },
          faceUp: true,
        },
      },
    ],
  },
});

/**
 * "You may rest this Character and place 2 cards from your trash at the bottom
 * of your deck in any order: <effect>" -- OP05-082 Shirahoshi and OP05-088
 * Mansherry's price, Black's second currency spent alongside the body's own
 * rest. Gated on the two trash cards so an activation that cannot pay is not
 * offered; the offer already gates the rest through `sourceActive`.
 */
export const restAndBuryTwoFromTrash = (
  bind: string,
  effect: MechanicEffect,
): MechanicEffect => ({
  kind: "if",
  condition: {
    kind: "zone-count",
    player: "self",
    zone: "trash",
    operator: "gte",
    value: 2,
  },
  then: {
    kind: "sequence",
    effects: [
      { kind: "rest", binding: SOURCE_BINDING },
      {
        kind: "choose",
        selector: { player: "self", zone: "trash" },
        bind,
        min: 2,
        max: 2,
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
    ],
  },
});

/**
 * "Add up to 1 black Character card with a cost of L to H from your trash to
 * your hand" -- OP05-088, OP05-089 and OP05-091's recursion, at three ranges.
 */
export const blackCharacterFromTrash = (
  minCost: number,
  maxCost: number,
  bind: string,
  excludeName?: string,
): MechanicEffect => ({
  kind: "choose",
  selector: {
    player: "self",
    zone: "trash",
    category: "character",
    color: "Black",
    minCost,
    maxCost,
    ...(excludeName ? { excludeName } : {}),
  },
  bind,
  min: 0,
  max: 1,
  effect: { kind: "move", binding: bind, to: { player: "self", zone: "hand" } },
});

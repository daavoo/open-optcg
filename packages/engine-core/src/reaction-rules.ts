/**
 * The signal-driven reaction registry: every "when X happens" clause with no
 * printed marker, dispatched off the signal stream by `card-mechanics.ts`.
 *
 * The rows live per set in `mechanics/<set>-reactions.ts` and
 * `mechanics/index.ts` hands them over once at init through
 * {@link registerReactionRules}. The registry is its own module because
 * `card-mechanics.ts` imports `mechanics/index.ts`: a register function there
 * would be called while that module is still mid-evaluation.
 */
import type { MechanicCondition, MechanicProgram } from "./mechanics.js";

/**
 * A Leader that reacts to a card moving, rather than to a timing window.
 *
 * Two shapes so far: OP11-041 Nami draws when a Life card leaves Life, and
 * OP16-041 Buggy replays a Prisoner when one of its own {Impel Down} Characters
 * is removed from the field. Both are "when X happens" clauses with no printed
 * marker, so nothing dispatches them -- the signal stream does.
 */
export interface ReactionRule {
  cardNumber: string;
  /**
   * Where the reacting card sits. `"leader"` is every rule that predates
   * OP11-077 Randolph, which is the first *Character* whose "when X happens"
   * clause has no printed marker -- so the scan has to look at the board and
   * dispatch once per copy, with that copy as the source.
   */
  controller: "leader" | "board" | "stage";
  signal:
    | {
        kind: "card-moved";
        /**
         * `"hand"` is OP12-040 Kuzan's Leader, the first rule here to watch a
         * card leaving a *hand* rather than the field. Pair it with
         * `sourceType`: a hand trash is nearly always a cost, so without that
         * filter the rule would pay out on every discard in the game.
         */
        from: "life" | "board" | "hand";
        /**
         * Where it went, for a clause that means a K.O. rather than any exit --
         * or, with `"hand"`, one that means a Life card *kept*: "when a card is
         * added to your hand from your Life" (OP05-107 Lieutenant Spacey).
         */
        to?: "trash" | "hand";
        /**
         * Only a K.O.: "when a Character is K.O.'d" (EB01-047, EB04-044,
         * OP13-002, OP14-041). `to: "trash"` alone also matches a Character
         * an effect trashes, which is not a K.O.
         */
        ko?: true;
        /**
         * A type the *moving effect's* card must carry -- "by your {Navy} type
         * card's effect" (OP12-040). Every other filter here is about the card
         * that moved; this one is about what moved it, and the signal carries
         * it for that reason.
         */
        sourceType?: string;
        /** A type the moved card must carry, for a clause that names one. */
        movedType?: string;
        /**
         * The substring reading of the same filter -- "[printed text omitted -- pnpm card:text <card>]"Roger Pirates"" (OP13-078 Oro Jackson), which has to
         * reach {Former Roger Pirates} too.
         */
        movedTypeIncluding?: string;
        /**
         * A disjunction of types, for "[printed text omitted -- pnpm card:text OP13-078]" -- OP14-041 Boa Hancock's Leader.
         */
        movedAnyOfTypes?: readonly string[];
        /**
         * A base-power floor on the moved card, for the same clause. A card
         * leaving the field is measured as it stood there -- see
         * `departedCardBasePower`.
         */
        movedMinPower?: number;
        /**
         * Whose card moved. `"self"` is the reacting card's own controller;
         * `"opponent"` is the other side, which EB04-044 Koby is the first
         * clause to watch -- "when your opponent's Character is K.O.'d".
         */
        movedOwner?: "self" | "opponent";
        /**
         * Whose effect did the moving -- "when a Character is removed from the
         * field by *your* effect" (OP08-046 Shakuyaku).
         *
         * `movedOwner` asks about the card that moved and cannot say this: on
         * its controller's own turn a Character can leave the board to their
         * own removal or to the other player's Counter, and only this tells the
         * two apart. A signal with no `sourcePlayerId` -- battle damage, a
         * Trigger's own reveal -- matches neither side.
         */
        bySource?: "self" | "opponent";
        /**
         * "When this Leader's attack deals damage to your opponent's Life" --
         * P-117 Nami.
         *
         * Neither `bySource` nor `sourceCardNumber` can say it: battle damage
         * carries no source card, so both are absent for every attack, and a
         * Character's attack moves a Life card in the same shape as the
         * Leader's. `battle.ts` puts the answer on the signal.
         */
        byLeaderAttack?: true;
      }
    /**
     * "When you play a Character" -- OP14-041 Boa Hancock's Leader, the first
     * clause in the pool to watch a *play* rather than a move. The signal is
     * the same one `[On Play]` dispatches from; this reads it for a card that
     * is not the one being played.
     */
    | {
        kind: "card-played";
        category: string;
        /**
         * Whose play it was. `"opponent"` is OP12-081 Koala's Leader, the first
         * clause to watch the *other* player's plays.
         */
        playedBy: "self" | "opponent";
        /** A printed-cost floor on the played card, for OP12-081's first half. */
        minBaseCost?: number;
        /**
         * "…when you play a Character with a [Trigger]" -- OP13-100 Jewelry
         * Bonney's Leader, which is what makes that deck's Trigger-heavy build
         * pay off on its own turn rather than only on the opponent's.
         */
        hasTrigger?: boolean;
        /**
         * "…using a Character's effect" -- OP12-081's second half, which the
         * signal's `bySourceCategory` answers. A play out of hand carries none,
         * and that is exactly what this reading excludes.
         */
        bySourceCategory?: string;
      }
    /**
     * "[printed text omitted -- pnpm card:text OP12-081]" --
     * OP11-077 Randolph. Raised by the `return-don` node, which is how
     * `DON!! −N` is paid; see `MechanicSignal`'s `don-returned`.
     */
    | {
        kind: "don-returned";
        returnedBy: "self";
        /**
         * A floor on how many DON!! went back at once -- OP09-061
         * Monkey.D.Luffy's Leader reads "2 or more", where every earlier rule
         * answers any return. A payment of one must not fire it, so the count
         * rides on the signal rather than being inferred from the board.
         */
        minCount?: number;
      }
    /**
     * "If a Character is rested by your effect" -- OP07-031 Bartolomeo.
     *
     * The `whenRested` registry reads the same signal from the other end: it is
     * keyed by the Character that *became* rested, and this is a watcher on the
     * bench that reacts to any of them. `restedBy` is whose effect did the
     * resting, the half of the printed sentence that stops the clause paying
     * out when the opponent rests something.
     */
    | { kind: "card-rested"; restedBy: "self" | "opponent" }
    /**
     * "When a [Trigger] activates" -- OP13-106 Conney, which watches *either*
     * player's Trigger: the printed clause does not say whose.
     */
    | { kind: "trigger-activated" }
    /**
     * "When you activate an Event" (OP10-003 Sugar) and the opponent-side reading
     * (OP11-102 Camie). `activatedBy` is which side's Event it was.
     */
    | { kind: "event-activated"; activatedBy: "self" | "opponent" }
    | { kind: "blocker-activated"; activatedBy: "self" | "opponent" }
    /**
     * "When you draw a card outside of your Draw Phase" -- OP05-053 Mozambia.
     * Raised by the `draw` node alone; see `MechanicSignal`'s `card-drawn`.
     */
    | { kind: "card-drawn"; drawnBy: "self" | "opponent" };
  ownTurn: boolean;
  /**
   * A board condition the clause opens with, read *before* the `[Once Per
   * Turn]` key is spent -- "when your number of Life cards becomes 0" (the
   * OP05-098 Enel Leader), which is a `card-moved` off Life that only counts
   * when it was the last one.
   *
   * Not the program's own outermost `if`: that runs after the key is marked,
   * so a Life card lost at three would have spent the turn's one use on
   * nothing. Evaluated with the reacting card as the source, so `"self"` is its
   * controller.
   */
  condition?: MechanicCondition;
  /**
   * "[Opponent's Turn]" on a signal-driven clause -- the mirror of `ownTurn`.
   *
   * OP14-041's draw only happens on the other player's turn, which is when a
   * Character reaches the board off a Trigger or a Counter. Without the gate
   * the Leader would draw on every Character its controller plays.
   */
  opponentTurn?: boolean;
  oncePerTurn: boolean;
  maxHandSize?: number;
  /** DON!! that must be given to the Leader, for a `[DON!! xN]` clause. */
  leaderAttachedDon?: number;
  /**
   * DON!! that must be given to the *reacting card itself* -- OP08-105 Jewelry
   * Bonney's `[DON!! x1]`, the first board-scoped reaction in the pool to print
   * one.
   *
   * `leaderAttachedDon` is the Leader's pile and cannot stand in for it: two
   * copies of the same Character can be on one board with different DON!! on
   * them, so the gate is per source rather than per player.
   */
  sourceAttachedDon?: number;
  /**
   * A `card-moved` off the board also fires the clause when the card that
   * moved is this one, though it is no longer on the field to watch.
   *
   * EB01-047 Laboon's "when a Character is K.O.'d" is the first: Bandai's Q&A
   * (EB01-047#1) rules that it answers its own K.O. Opt-in because the other
   * board watchers name Characters other than themselves, or are not about a
   * card leaving at all.
   */
  answersOwnExit?: true;
  program: MechanicProgram;
}

/**
 * Every set's reaction rules, in registration order: the order a player's
 * reactions to one signal are offered in.
 */
export let REACTION_RULES: readonly ReactionRule[] = [];

export function registerReactionRules(rules: readonly ReactionRule[]): void {
  REACTION_RULES = rules;
}

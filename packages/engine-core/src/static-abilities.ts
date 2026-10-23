import {
  cards,
  hasCardTypeIncluding,
  type CardDatabase,
  type CardDefinition,
} from "@one-piece-sim/cards";
import { storedBasePower } from "./base-power.js";
import type { PlayerId } from "@one-piece-sim/protocol";
import type { BoardCard, CardInstance, GameState } from "./model.js";

/**
 * Declarative table of continuous ("static") abilities.
 *
 * These used to live as hardcoded `if (cardNumber === ...)` branches inside
 * `currentPower`, `effectiveCost`, `hasKeyword`, `hasRush` and
 * `hasRushCharacter`, which meant adding one card with a conditional buff
 * touched five core engine functions. Here a card contributes rows to an
 * ordered pipeline instead, and the query functions just fold the pipeline.
 *
 * Layer kinds are evaluated in a fixed order so that "base power becomes 0"
 * composes correctly with later additions:
 *
 *   1. `set-base`  replaces printed power
 *   2. `add`       sums onto it
 *
 * Keyword and cost layers are simple predicates in the same table so that one
 * card's whole static text lives in one place.
 */

export type Keyword =
  | "Blocker"
  | "Rush"
  | "Rush: Character"
  | "Unblockable"
  /**
   * "[printed text omitted -- pnpm card:text <card>]"
   *
   * Unlike the other four this changes what a *successful* attack does rather
   * than what may be declared or blocked, so `resolveBattle` and the
   * observation's `lifeCost` are the only places that read it.
   *
   * Eight cards in the format switch it on, in four different shapes: printed
   * (OP13-046, OP13-118), conditional on the holder's own board state
   * (OP10-094, OP13-009), granted for a turn by an Event (OP15-056, OP16-039),
   * and handed over by an aura (OP15-071, OP16-003). Any consumer keyed to one
   * of those shapes is wrong about the other three, which is why everything
   * above the engine reads `effectiveKeywords` off the observation instead.
   */
  | "Double Attack"
  /**
   * "[printed text omitted -- pnpm card:text OP16-003]"
   *
   * Like [Double Attack] this changes what a *successful* attack does rather
   * than what may be declared or blocked, so `resolveBattle` is the only place
   * that reads it. Six cards in the pool print it and two more grant it for a
   * turn; before it was modelled, every one of them dealt ordinary damage and
   * the printed keyword did nothing at all.
   */
  | "Banish";

/** What a layer is being asked about. */
export interface AbilityContext {
  state: GameState;
  /** Controller of the card the layer is attached to. */
  playerId: PlayerId;
  /** The card itself, or the Leader pseudo-card. */
  card: CardInstance;
  /** True when the subject is the Leader rather than a board Character. */
  isLeader: boolean;
  db: CardDatabase;
}

export type PowerLayer =
  | { kind: "set-base"; value: (context: AbilityContext) => number | undefined }
  | { kind: "add"; value: (context: AbilityContext) => number };

export interface StaticAbility {
  /** Card this ability is printed on, or the Leader/board card granting an aura. */
  cardNumber: string;
  /**
   * Where the ability is read from. Auras apply to other cards too.
   *
   * `controller-aura` is live while `cardNumber` is the player's Leader --
   * every aura in the format before OP17-112 is printed on a Leader.
   * `board-aura` is live while an un-negated copy of `cardNumber` is
   * anywhere on the player's board: OP17-112 Charlotte Linlin's "[printed text omitted -- pnpm card:text OP17-112]" is a Character granting an aura to its own
   * teammates, which no Leader-scoped aura could reach.
   */
  scope:
    | "self"
    | "controller-aura"
    | "board-aura"
    /**
     * Live while `cardNumber` is the *opponent's* Leader, and applies to the
     * cards of the player being asked about.
     *
     * OP15-001 Krieg's "[DON!! x1] [Opponent's Turn] ... give all of your
     * opponent's Characters −2000 power" is the first: an aura whose subject is
     * the other side of the table, which no controller- or board-scoped aura
     * can express.
     */
    | "opponent-aura"
    /**
     * Live while an un-negated copy of `cardNumber` is on the *opponent's*
     * board, and applies to the cards of the player being asked about.
     *
     * OP14-027 Shanks: "[printed text omitted -- pnpm card:text OP14-027]" A board Character debuffing
     * across the table, which neither `board-aura` (own board, own cards) nor
     * `opponent-aura` (their Leader) can express. The rested test lives in the
     * layer's own predicate, because the scope filter only answers "is a copy
     * out there".
     */
    | "opponent-board-aura"
    /**
     * Live while `cardNumber` is the player's own *Stage*, and applies to their
     * cards.
     *
     * OP13-099 The Empty Throne is the first Stage in the pool to grant an aura:
     * "[printed text omitted -- pnpm card:text OP13-099]" A Stage is in its own area rather than on the board, so
     * `board-aura`'s scan cannot see it.
     */
    | "stage-aura"
    /**
     * Live while `cardNumber` is the *opponent's* Stage, and applies to the
     * cards of the player being asked about.
     *
     * OP05-040 Birdcage is the first Stage whose text reaches both sides of the
     * table -- "all Characters with a cost of 5 or less do not become active
     * in your and your opponent's Refresh Phases" -- so it is registered twice,
     * once under each Stage scope, the same pairing `board-aura` and
     * `opponent-board-aura` make for a Character.
     */
    | "opponent-stage-aura";
  /**
   * The printed timing clause this row implements, when the text carries a
   * marker but resolves as a continuous layer. OP16-055's "[When Attacking]
   * ... becomes the same as your opponent's Leader's power" is read while the
   * attack is open, so a turn-scoped modifier applied at declaration would
   * still be there when the Character defends. `test/card-support.test.ts`
   * reads this to count the row as that clause's handler.
   */
  implementsClause?: "[When Attacking]";
  power?: PowerLayer;
  /**
   * A `scope: "self"` cost layer is "This Character gains +N cost": it is read
   * only while the card is on its controller's field, so the same card in hand,
   * trash or deck reads its printed cost -- Bandai's OP-17 Q&A on the Elbaph
   * giants' `+12`. Auras (every other scope) decide their own subjects.
   */
  cost?: (context: AbilityContext) => number;
  /**
   * `"hand"` for a self cost layer printed as "give this card in your hand −N
   * cost": read only while the card is in its controller's hand, and never on
   * the field.
   */
  costZone?: "hand";
  keyword?: { keyword: Keyword; when: (context: AbilityContext) => boolean };
  /**
   * The DON!! counts this row's predicate reads, for `donCountReaders`: a
   * closure it cannot walk, so the row says so. See {@link DonCountRead}.
   */
  readsDon?: readonly DonCountRead[];
  /**
   * "[printed text omitted -- pnpm card:text <card>]"
   *
   * Not a {@link Keyword}: the printed pool grants the same permission for a
   * turn on five OP-11 cards, and the engine already holds that as
   * `BoardCard.attacksActiveUntilTurn`. What no card printed until OP06-110
   * Nekomamushi is the *continuous* form -- the card's own text, live whenever
   * its condition holds -- and a turn flag cannot express it: nothing writes
   * the flag, because there is no effect to resolve.
   *
   * Read through {@link attacksActiveCharacters}, which ORs this against that
   * flag, so the one target-list check in `legal-actions/main.ts` answers both
   * shapes.
   */
  attacksActive?: (context: AbilityContext) => boolean;
  /**
   * "Your Character cards are played rested" -- OP09-022 Lim's Leader.
   *
   * A rule about how a card *arrives*, which no power, cost or keyword layer
   * can express, and not a turn-scoped flag either: the clause is continuous,
   * so nothing resolves to write one. Read through
   * {@link charactersArriveRested} at every site that puts a Character on a
   * board -- the play action and the `play` mechanic node alike, because the
   * ODYSSEY package plays half its board out of hand with effects.
   *
   * Asked with the *Leader* as the subject card, so a negated Leader stops
   * imposing it, exactly like every other clause printed on a Leader.
   */
  charactersPlayRested?: (context: AbilityContext) => boolean;
  /**
   * "When a {Land of Wano} type Character card is played from your trash, that
   * Character gains [Rush] during this turn" -- OP16-079 Yamato's Leader.
   *
   * Asked with the Leader as the subject card, about the card being played,
   * at the moment it lands. What it hands out is a turn-scoped grant on that
   * Character (`BoardCard.rushUntilTurn`), not a continuous keyword: the play
   * is the event, and the [Rush] it produced outlasts a Leader negated later
   * in the same turn the way any resolved grant does. Read through
   * {@link trashPlayGrantsRush} by the one site that plays a card out of the
   * trash, the `play` mechanic node.
   */
  trashPlayRush?: (context: AbilityContext, cardNumber: string) => boolean;
  /**
   * "Your face-up Life cards are placed at the bottom of your deck instead of
   * being added to your hand, according to the rules" -- ST13-003's Leader.
   *
   * A rewrite of what damage *does*, which nothing else in the engine expresses:
   * every other clause about Life moves cards around, and this one changes
   * where the rules put a card that has already been taken. "According to the
   * rules" is the scope: an effect that says "add a Life card to your hand" is
   * untouched, and only the rules-based landing after damage is redirected.
   *
   * Read through {@link faceUpLifeBanksToDeck} at all three sites that end a
   * point of damage -- the no-Trigger path in `battle.ts`, the declined-Trigger
   * path in `actions/resolve-trigger.ts`, and effect damage in `pending.ts`.
   * Asked with the *Leader* as the subject card, so a negated Leader stops
   * imposing it, exactly like every other clause printed on a Leader.
   *
   * It is a price, not a payoff: the whole of ST-13's deck is putting its own
   * best Characters on top of Life face-up, and under this Leader every one of
   * them is gone for good once it is hit. What it buys is the rest of the
   * Leader's text.
   */
  faceUpLifeGoesToDeckBottom?: (context: AbilityContext) => boolean;
  /**
   * One of the DON!! the DON!! Phase places goes onto the Leader, while the
   * field already holds DON!! -- OP13-003 Gol.D.Roger's first clause.
   *
   * A rewrite of where the rules put a DON!! the DON!! Phase places, which no
   * timed clause can express: the phase is not a window any program runs in.
   * Read through {@link donPhaseGivesLeaderDon} from `drawForTurn`, asked with
   * the Leader as the subject so OP13-064's negation of its controller's
   * Leader switches it off with the rest of the Leader's text. The "any DON!!
   * on your field" half is read there too, before the phase places anything:
   * after it, the field is never empty.
   */
  donPhaseDonToLeader?: (context: AbilityContext) => boolean;
  /**
   * "This Character cannot be K.O.'d in battle" (OP09-045 Cabaji) and the
   * narrower "…in battle by Leaders" (OP09-025 Crocodile).
   *
   * The exact complement of `isRemovalImmune`, which answers effects and says
   * nothing about losing a fight -- and the two must stay apart: a Character
   * that survives battle is still answered by a removal Event, which is what
   * makes these bodies beatable. `attacker` is what the narrower reading needs;
   * nothing in `AbilityContext` can name the other side of a battle. It carries
   * the attacker's identity as well as whether it is the Leader, because
   * OP08-114 S-Hawk names an *attribute* -- "cannot be K.O.'d in battle by
   * <Slash> attribute cards" -- which no flag about the other side's role can
   * answer.
   */
  battleKoImmune?: (
    context: AbilityContext,
    attacker: { isLeader: boolean; cardNumber: string },
  ) => boolean;
  /**
   * An alternate win condition that fires when the *opponent* activates a
   * [Blocker] -- OP09-118 Gol.D.Roger, the only card in the pool that wins a
   * game without taking a Life card.
   *
   * Read through {@link winsOnOpponentBlock} from the block action, which is
   * the one place a [Blocker] activation is known to have happened.
   */
  winsOnOpponentBlock?: (context: AbilityContext) => boolean;
  /**
   * "Your [On Play] effects are negated" -- OP09-081 Marshall.D.Teach's Leader,
   * the price it pays for switching the opponent's off.
   *
   * The continuous half of the same rule `restrict-player`'s
   * `on-play-negated` writes for a turn. Read through
   * {@link onPlayEffectsNegated}, which ORs the two.
   */
  onPlayNegated?: (context: AbilityContext) => boolean;
  /**
   * "This Character cannot attack unless <condition>." -- a *conditional* ban,
   * as opposed to the unqualified "This Character cannot attack." that
   * `CardRules.cannotAttack` derives from the printed sentence.
   *
   * EB04-005 Trafalgar Law and EB04-051 Emet are the first two, and the
   * difference from the derived flag is the whole reason this exists: the flag
   * is a fact about the card, true for the game's whole length, and these are
   * facts about the board that change every turn. Read through
   * {@link attackBannedByOwnText}, from `couldAttackThisTurn`.
   *
   * The predicate returns whether the attack is *barred*, so the printed
   * "unless X" is written as `!X` -- which is what keeps a row readable
   * alongside `attacksActive` next to it, both answering "may it".
   */
  attackBlocked?: (context: AbilityContext) => boolean;
  /**
   * "…do not become active in your and your opponent's Refresh Phases" --
   * OP05-040 Birdcage, the only continuous refresh lock in the pool.
   *
   * The turn-scoped form is `BoardCard.cannotRefreshUntilTurn`, written by the
   * `cannot-refresh` restriction for "will not become active in your opponent's
   * next Refresh Phase". This is the clause that never expires while its Stage
   * stands, and a flag cannot say that: nothing resolves to write it. Read
   * through {@link refreshBlocked} from `drawForTurn`.
   */
  blocksRefresh?: (context: AbilityContext) => boolean;
  /**
   * A discount on playing `context.card` *from hand* -- OP05-097 Mary Geoise,
   * "[Your Turn] The cost of playing {Celestial Dragons} type Character cards
   * with a cost of 2 or more from your hand will be reduced by 1."
   *
   * Not a `cost` layer: that reaches `effectiveCost`, which answers for a card
   * on the board, and would leave the hand price untouched while making the
   * played body read as cheaper to every "cost N or less" removal -- the
   * mistake `hand-price.ts` documents for OP16-015. The subject here is the
   * card still in hand, and `auraReaches` finds the Stage the same way it does
   * for any board card. Read through {@link staticHandPlayDiscount}.
   */
  handPlayDiscount?: (context: AbilityContext) => number;
  /**
   * A hand card that no effect may play -- OP12-036 Roronoa Zoro, the only
   * card in the pool that prints it (`pnpm card:text OP12-036`).
   *
   * A rule about the card while it is still in hand, so the subject is the
   * hand card under a synthetic id, as {@link handPlayDiscount}'s is. The
   * main-phase play action is untouched: only a `play` node an effect resolves
   * is barred. Read through {@link effectPlayBarred}.
   */
  effectPlayFromHandBarred?: (context: AbilityContext) => boolean;
  /**
   * "This Character cannot be rested by your opponent's effects", live while
   * the predicate holds -- OP15-024 Usopp on the opponent's turn, OP11-046
   * Vinsmoke Yonji while every Character beside it is GERMA, OP12-021
   * Ipponmatsu behind a Slash Leader with 6 rested DON!!.
   *
   * Continuous and read off the card itself, unlike `cannotRestUntilTurn`,
   * which an effect writes for a window. Read through {@link isRestImmune}.
   */
  restImmune?: (context: AbilityContext) => boolean;
}

// --- shared predicates ------------------------------------------------------

export const opponentOf = (playerId: PlayerId): PlayerId =>
  playerId === "p1" ? "p2" : "p1";

/**
 * A card's cost including static layers and temporary modifiers.
 *
 * This is the body of `effectiveCost` in `queries.ts`, which delegates here.
 * It lives on this side of the import edge because the layers below need it and
 * `queries.ts` already imports this module -- reaching back the other way would
 * be a cycle.
 *
 * Note for future layers: this calls `staticCostDelta`, so a `cost` layer must
 * never itself ask what another card's cost is, or the two will recurse. No
 * current layer does -- OP17's `+12 cost` giants are unconditional or gated on
 * the Leader's type.
 */
export function costOf(
  state: GameState,
  playerId: PlayerId,
  card: CardInstance,
  db: CardDatabase = cards,
): number {
  const printed = db.require(card.cardNumber).cost ?? 0;
  const temporary = ((card as BoardCard).costModifiers ?? [])
    .filter((modifier) => modifier.expiresAtTurn >= state.turn)
    .reduce((total, modifier) => total + modifier.amount, 0);
  // Bandai's rules Q&A (Basic Rules): a cost below 0 is treated as 0, so a
  // "cost of 0" filter sees a card pushed to −2.
  return Math.max(
    0,
    printed + temporary + staticCostDelta(state, playerId, card, db),
  );
}

/**
 * Events in a player's trash, counted by category off the card database rather
 * than by colour or type: the clauses that read this count say "Events" with no
 * further filter, so an Event the deck never played still counts, and so does
 * one that arrived there off a [Trigger].
 *
 * Exported because the same count prices OP15-021 in `hand-price.ts`, which is
 * the only place a hand price is decided -- see the note on that card's entry
 * there.
 */
export const trashEventCount = (
  state: GameState,
  playerId: PlayerId,
  db: CardDatabase,
): number =>
  state.players[playerId].trash.filter(
    (card) => db.require(card.cardNumber).category === "event",
  ).length;

/**
 * Whether this instance's own printed effects are switched off.
 *
 * "[printed text omitted -- pnpm card:text <card>]"
 * -- OP16-119 Marshall.D.Teach's Trigger -- is the only source in the format,
 * and it is a fact about the *instance*, not the card number: one copy can be
 * negated while another is not.
 *
 * Every read of a Character's own text must ask this. The layers below do it for
 * static power, cost and keywords; the timed clauses ([On K.O.], [When
 * Attacking], [Activate: Main]) ask it at their dispatch sites, because a
 * program that runs is not something a query can undo.
 */
export function effectsNegated(state: GameState, instanceId: string): boolean {
  if (
    (state.negatedEffects ?? []).some(
      (entry) =>
        entry.instanceId === instanceId && entry.expiresAtTurn >= state.turn,
    )
  ) {
    return true;
  }
  return continuouslyNegated(state, instanceId);
}

/**
 * "[printed text omitted -- pnpm card:text <card>]"Roger Pirates" have their effects negated" -- OP13-064 Gol.D.Roger, the only
 * *continuous* negation in the pool.
 *
 * Every other negation is a turn-scoped entry on `negatedEffects` written by the
 * `negate` node; this one holds for as long as the 10-cost body is on the board,
 * which is what makes playing it a commitment rather than a play. It reaches its
 * own controller's cards only, and never itself: Roger has the type.
 *
 * Read from inside `effectsNegated` so every consumer -- the static-ability
 * pipeline, the clause dispatchers, the replacement registry -- answers the same
 * way, and so a negated card cannot be negated twice.
 */
function continuouslyNegated(state: GameState, instanceId: string): boolean {
  for (const playerId of ["p1", "p2"] as const) {
    const player = state.players[playerId];
    const roger = player.board.some((card) => card.cardNumber === "OP13-064");
    if (!roger) continue;
    // The type filter on OP13-064 qualifies the Characters only, so the
    // Leader is negated whatever its type. OP13-003, itself {Roger Pirates},
    // is the Leader this is printed for: Bandai's feature deck for it lands
    // OP13-064 precisely to switch off that Leader's -2000.
    if (instanceId === `${playerId}-leader`) return true;
    const own = player.board.find((card) => card.instanceId === instanceId);
    if (own) {
      return !hasCardTypeIncluding(own.cardNumber, "Roger Pirates");
    }
  }
  return false;
}

/**
 * Whether `playerId`'s Leader's own printed effects are switched off.
 *
 * OP09-093 Marshall.D.Teach -- "[printed text omitted -- pnpm card:text OP09-093]" -- is the only source in the format, and it is why
 * this exists at all: every read of a Leader's own text used to be able to
 * assume the answer was no, and several said so in a comment.
 *
 * A Leader sits in no zone and has no `CardInstance`, so it is negated under the
 * synthetic `${playerId}-leader` id every other subsystem already addresses it
 * by (`leaderInstanceId` in `engine.ts`, which cannot be imported here without a
 * cycle). What that covers is the Leader's *own* text -- its static auras, its
 * timed clauses, and the hardcoded Leader rules in `engine.ts`,
 * `legal-actions/` and `removal.ts`. It says nothing about DON!! attached to the
 * Leader, about its power, or about its ability to attack, none of which are
 * effects.
 */
export function leaderEffectsNegated(
  state: GameState,
  playerId: PlayerId,
): boolean {
  return effectsNegated(state, `${playerId}-leader`);
}

/** Switch off `instanceId`'s own effects through `expiresAtTurn`. */
export function negateEffects(
  state: GameState,
  instanceId: string,
  expiresAtTurn: number,
): void {
  if (effectsNegated(state, instanceId)) return;
  state.negatedEffects = [
    ...(state.negatedEffects ?? []),
    { instanceId, expiresAtTurn },
  ];
}

/**
 * Drop negations that have run out, at the same point `completeEndTurn` drops
 * expired power and cost modifiers. The field goes away entirely when the last
 * one expires, so a game returns to hashing as if negation had never happened.
 */
export function clearExpiredNegations(state: GameState): void {
  if (!state.negatedEffects) return;
  const live = state.negatedEffects.filter(
    (entry) => entry.expiresAtTurn > state.turn,
  );
  if (live.length === 0) delete state.negatedEffects;
  else state.negatedEffects = live;
}

/**
 * A printed removal immunity: "cannot be K.O.'d" or "cannot be removed from the
 * field", by the opponent's effects or by any effect, unconditionally or while
 * `when` holds. The rows live with each set's continuous text in
 * `mechanics/<set>-static.ts`, handed over by {@link registerRemovalImmunities}.
 *
 * Battle destruction is outside every one of them: losing a fight is not an
 * effect.
 */
export interface RemovalImmunity {
  /** The protected card, or for an aura the card granting it. */
  cardNumber: string;
  /**
   * `"opponent"` for "by your opponent's effects", which is every immunity in
   * the pool but OP06-109 Denjiro's; `"any"` for a clause that names no
   * player, which covers the controller's own effects too.
   */
  from: "opponent" | "any";
  /**
   * "cannot be K.O.'d" rather than "cannot be removed from the field": a bounce
   * or a bury still takes the card off the field.
   */
  koOnly?: true;
  /**
   * For an aura -- "all of your <filter> Characters cannot be ..." -- which of
   * the controller's cards it reaches. The protected bodies print nothing, so
   * the row is keyed by the card granting it, and `when` is asked of that
   * granting copy: with two on the board, one rested and one not, only the
   * active one may be granting anything.
   */
  protects?: (definition: CardDefinition) => boolean;
  /**
   * The clause's condition. `card` is the protected card, or for an aura the
   * copy granting it. Absent for an unconditional clause.
   */
  when?: (state: GameState, ownerId: PlayerId, card: CardInstance) => boolean;
  /** See {@link StaticAbility.readsDon}. */
  readsDon?: readonly DonCountRead[];
  /**
   * For "cannot be K.O.'d by effects of <some cards>": whether the card whose
   * effect is removing it is one the immunity answers. OP11-005 Smoker is
   * immune to Characters without <Special> and to nothing else, so a Leader,
   * an Event or a <Special> Character still removes it. A caller that cannot
   * name the source card gets "not immune", the reading `isRemovalImmune`
   * gives OP14-003 for the same reason.
   */
  bySource?: (source: CardDefinition) => boolean;
}

/**
 * A DON!! count a continuous clause reads, so that returning DON!! can switch
 * it: `"own-ceiling"` for "6 or less DON!! on your field" or "equal to or fewer
 * than your opponent", `"opponent"` for one that reads the other player's.
 */
export type DonCountRead = "own-ceiling" | "opponent";

let REMOVAL_IMMUNITIES: readonly RemovalImmunity[] = [];

/**
 * Cards with a continuous ability that reads their controller's DON!! count
 * against a ceiling, so that returning DON!! can switch it on.
 *
 * `donCountReaders` in `card-mechanics.ts` finds the same shapes in programs
 * by walking them; a row is a closure it cannot walk, so each row declares
 * `readsDon`, and `test/don-count-readers.test.ts` scans the rows for a DON!!
 * count read that no declaration covers.
 */
export let STATIC_OWN_DON_CEILING_CARDS: ReadonlySet<string> = new Set();

/**
 * Cards with a continuous ability that reads the *other* player's DON!! count,
 * so the other player returning DON!! can switch it on or off. See
 * {@link STATIC_OWN_DON_CEILING_CARDS}.
 */
export let STATIC_OPPONENT_DON_READERS: ReadonlySet<string> = new Set();

function collectDonReaders(): void {
  const own = new Set<string>();
  const opponent = new Set<string>();
  for (const row of [...STATIC_ABILITIES, ...REMOVAL_IMMUNITIES]) {
    for (const read of row.readsDon ?? []) {
      (read === "own-ceiling" ? own : opponent).add(row.cardNumber);
    }
  }
  STATIC_OWN_DON_CEILING_CARDS = own;
  STATIC_OPPONENT_DON_READERS = opponent;
}

export function registerRemovalImmunities(
  immunities: readonly RemovalImmunity[],
): void {
  REMOVAL_IMMUNITIES = immunities;
  collectDonReaders();
}

function immunityHolds(
  immunity: RemovalImmunity,
  state: GameState,
  ownerId: PlayerId,
  card: CardInstance,
  removalKind: "ko" | "off-field",
  source: CardDefinition | undefined,
): boolean {
  return (
    (immunity.koOnly !== true || removalKind === "ko") &&
    (immunity.bySource === undefined ||
      (source !== undefined && immunity.bySource(source))) &&
    (immunity.when?.(state, ownerId, card) ?? true)
  );
}

/**
 * Whether an opponent's effect may rest this Character: the `restImmune` rows
 * of its own text. Distinct from `cannotRestUntilTurn`, which an effect writes
 * onto a card for a window; this is continuous and read off the card itself.
 *
 * Deliberately narrow: it says nothing about resting the card as a *cost* its
 * own controller pays, or about the ordinary rest of declaring an attack.
 */
export function isRestImmune(
  state: GameState,
  playerId: PlayerId,
  card: CardInstance,
  db: CardDatabase = cards,
): boolean {
  const own = bySelf.get(card.cardNumber);
  if (!own || effectsNegated(state, card.instanceId)) return false;
  const context: AbilityContext = {
    state,
    playerId,
    card,
    isLeader: false,
    db,
  };
  return own.some((ability) => ability.restImmune?.(context) === true);
}

/**
 * Whether a board Character's own printed text is switched off right now.
 *
 * `effectsNegated` answers the general case -- an opponent pointed OP16-119's
 * Trigger at it. This adds the one card that negates *itself*: OP14-056
 * Wadatsumi, "[printed text omitted -- pnpm card:text OP14-056]"
 *
 * Wadatsumi prints nothing else, so the whole of that self-negation is visible
 * in the one place that reads it -- `canAttack`. A second card with the clause
 * and a second ability would need this folded into the static pipeline instead.
 */
export function characterEffectsSwitchedOff(
  state: GameState,
  playerId: PlayerId,
  card: CardInstance,
): boolean {
  if (effectsNegated(state, card.instanceId)) return true;
  return (
    card.cardNumber === "OP14-056" &&
    state.handTrashedByEffectOnTurn?.[playerId] === state.turn
  );
}

export function isRemovalImmune(
  state: GameState,
  ownerId: PlayerId,
  card: CardInstance,
  sourcePlayerId: PlayerId,
  /**
   * The card whose effect is doing the removing, where the caller knows it.
   *
   * Two OP14 clauses need it and no earlier one did. OP14-003 Capone"Gang"Bege
   * is immune only to "[printed text omitted -- pnpm card:text OP14-003]", which is a fact about the *source card*, not the source
   * player; and the OP14-079 Crocodile Leader bans its own effects from
   * removing anything at all. A caller that cannot say leaves this undefined,
   * and both clauses then answer "not immune" rather than guessing.
   */
  sourceCardNumber?: string,
  db: CardDatabase = cards,
  /**
   * Which removal is being attempted. Defaults to `"ko"`, the case every caller
   * but two is; the two that take a Character off the field without K.O.ing it
   * -- `bottom-deck-character` and the move into Life -- pass `"off-field"`, and
   * a `"ko"`-only immunity does not answer them.
   */
  removalKind: "ko" | "off-field" = "ko",
  /**
   * The copy of `sourceCardNumber` doing the removing, where the caller knows
   * it. OP14-003 Capone"Gang"Bege reads that Character's *base* power, which a
   * static layer or a stored setter can have moved off the printed figure
   * (OP13-084 Ju Peter sets its Five Elders to 7000). Without it the printed
   * power is all there is to read.
   */
  sourceInstanceId?: string,
): boolean {
  const source =
    sourceCardNumber === undefined ? undefined : db.get(sourceCardNumber);
  // OP14-079 Crocodile (Leader): "[printed text omitted -- pnpm card:text OP14-079]" A self-imposed ban, which is what
  // pays for the Leader's own −10 cost engine: Crocodile shrinks a Character
  // for its Baroque Works bodies to answer rather than answering it itself.
  // Checked before the `sourcePlayerId === ownerId` line below, because this
  // one is about whose *effect* it is rather than whose Character.
  if (
    sourcePlayerId !== ownerId &&
    state.players[sourcePlayerId].leaderCardNumber === "OP14-079" &&
    !leaderEffectsNegated(state, sourcePlayerId)
  ) {
    return true;
  }
  // "cannot be K.O.'d by effects", with no player named -- so this is asked
  // before the own-source line below rather than after it. The immunity is the
  // Character's own text, so a negated body loses it.
  if (
    !effectsNegated(state, card.instanceId) &&
    REMOVAL_IMMUNITIES.some(
      (immunity) =>
        immunity.from === "any" &&
        immunity.protects === undefined &&
        immunity.cardNumber === card.cardNumber &&
        immunityHolds(immunity, state, ownerId, card, removalKind, source),
    )
  ) {
    return true;
  }
  // OP04-083 Sabo's turn-scoped "by effects" protection names no player, so
  // it is asked before the own-source line below, like the printed form above.
  // Read before the negation line, for the reason Trebol's form gives below.
  if (
    removalKind === "ko" &&
    "koImmuneToEffectsUntilTurn" in card &&
    ((card as BoardCard).koImmuneToEffectsUntilTurn ?? -1) >= state.turn
  ) {
    return true;
  }
  if (sourcePlayerId === ownerId) return false;
  // A turn-scoped protection somebody else's effect wrote onto this Character --
  // OP10-070 Trebol. Read before the negation line below on purpose: the
  // protection is Trebol's effect, not this Character's own text, so negating
  // the *protected* body does not strip it.
  if (
    removalKind === "ko" &&
    "koImmuneToOpponentEffectsUntilTurn" in card &&
    ((card as BoardCard).koImmuneToOpponentEffectsUntilTurn ?? -1) >= state.turn
  ) {
    return true;
  }
  // An immunity granted by a *teammate*, so it is asked before the line below:
  // negating the protected body does not strip somebody else's aura, exactly
  // the way OP10-070 Trebol's turn-scoped protection is read above.
  if (
    REMOVAL_IMMUNITIES.some(
      (aura) =>
        aura.protects?.(db.require(card.cardNumber)) === true &&
        state.players[ownerId].board.some(
          (candidate) =>
            candidate.cardNumber === aura.cardNumber &&
            !effectsNegated(state, candidate.instanceId) &&
            immunityHolds(aura, state, ownerId, candidate, removalKind, source),
        ),
    )
  ) {
    return true;
  }
  // The immunity is the Character's own printed text, so negating the Character
  // removes it -- which is the point of negating an Enel body before K.O.ing it.
  if (effectsNegated(state, card.instanceId)) return false;
  // OP14-003 Capone"Gang"Bege: "[printed text omitted -- pnpm card:text OP14-003]" Base power, so
  // the DON!! an attacker piles onto a small body does not buy it through --
  // and a Leader's or an Event's effect is not covered at all, which is where
  // the answer to this 1-cost body is.
  if (card.cardNumber === "OP14-003" && sourceCardNumber !== undefined) {
    const source = db.get(sourceCardNumber);
    const sourceOnBoard =
      sourceInstanceId === undefined
        ? undefined
        : state.players[sourcePlayerId].board.find(
            (candidate) => candidate.instanceId === sourceInstanceId,
          );
    const sourceBasePower = sourceOnBoard
      ? cardBasePower(state, sourcePlayerId, sourceOnBoard, db)
      : source?.power;
    if (
      source?.category === "character" &&
      (sourceBasePower ?? Number.POSITIVE_INFINITY) <= 5000
    ) {
      return true;
    }
  }
  return REMOVAL_IMMUNITIES.some(
    (immunity) =>
      immunity.from === "opponent" &&
      immunity.protects === undefined &&
      immunity.cardNumber === card.cardNumber &&
      immunityHolds(immunity, state, ownerId, card, removalKind, source),
  );
}

// --- the table --------------------------------------------------------------

/**
 * Every set's continuous text, in registration order: the `*-static.ts`
 * modules under `mechanics/` hold the rows, and `mechanics/index.ts` hands
 * them over once at init through {@link registerStaticAbilities} -- the same
 * seam the replacement and `[Main]` Event registries use, because every set
 * module imports this file and importing them back would close a cycle.
 */
export let STATIC_ABILITIES: readonly StaticAbility[] = [];

// The table is read on every power, cost and keyword query -- `observe` alone
// asks about six keywords for every board card -- so it is indexed once here
// rather than scanned per call. `bySelf` answers "what does this card's own
// text say"; `aurasBySource` holds everything that reaches a card from
// elsewhere, keyed by the card that projects it. Table order is the order of
// the observation's static power breakdown, so each entry remembers its
// position and a query restores it over the auras it gathers.
const bySelf = new Map<string, StaticAbility[]>();
// An aura is live only while its source card is on the table -- as a Leader,
// a Stage or a board Character of one side or the other -- so a query gathers
// the auras of the dozen or so cards that are present and checks those,
// rather than asking every aura in the pool whether it reaches.
const aurasBySource = new Map<
  string,
  { ability: StaticAbility; position: number }[]
>();
// `${cardNumber}\u0000${keyword}` for every `scope: "self"` keyword entry: the
// question `hasStaticKeyword` asks before deciding whether the printed fact or
// the conditional text is the authority.
const selfKeywordConditionals = new Set<string>();

export function registerStaticAbilities(
  abilities: readonly StaticAbility[],
): void {
  STATIC_ABILITIES = abilities;
  collectDonReaders();
  bySelf.clear();
  aurasBySource.clear();
  selfKeywordConditionals.clear();
  for (const [position, ability] of abilities.entries()) {
    if (ability.scope !== "self") {
      const list = aurasBySource.get(ability.cardNumber) ?? [];
      list.push({ ability, position });
      aurasBySource.set(ability.cardNumber, list);
    } else {
      const list = bySelf.get(ability.cardNumber) ?? [];
      list.push(ability);
      bySelf.set(ability.cardNumber, list);
      if (ability.keyword) {
        selfKeywordConditionals.add(
          `${ability.cardNumber}\u0000${ability.keyword.keyword}`,
        );
      }
    }
  }
}

/**
 * The keywords this card *number* prints conditionally rather than outright.
 *
 * A card whose [Rush] or [Blocker] arrives only while its own text says so --
 * ST31-004 Monkey.D.Luffy wants 3 given DON!! across the field, and 59 other
 * entries want something of their own -- reads in an observation exactly like a
 * card that has no such keyword at all: `keywords: none`, and for a Character
 * played this turn, "cannot attack this turn ... and has no [Rush]". Both are
 * true and neither says the keyword is one action away. A caller that knows the
 * keyword is conditional can go back to the card's text; one told only that it
 * is absent has no reason to.
 */
export function conditionalSelfKeywords(
  cardNumber: string,
): readonly Keyword[] {
  return (bySelf.get(cardNumber) ?? [])
    .map((ability) => ability.keyword?.keyword)
    .filter((keyword): keyword is Keyword => keyword !== undefined);
}

function auraReaches(aura: StaticAbility, context: AbilityContext): boolean {
  const { state, playerId } = context;
  switch (aura.scope) {
    // A Leader aura is the *Leader's* effect: it reaches a negated Character
    // (which is why `abilitiesFor` does not filter it by the card's own
    // negation), and it stops reaching anything once the Leader is negated.
    case "controller-aura":
      return (
        state.players[playerId].leaderCardNumber === aura.cardNumber &&
        !leaderEffectsNegated(state, playerId)
      );
    case "opponent-aura": {
      const auraPlayerId = opponentOf(playerId);
      return (
        state.players[auraPlayerId].leaderCardNumber === aura.cardNumber &&
        !leaderEffectsNegated(state, auraPlayerId)
      );
    }
    case "stage-aura":
    case "opponent-stage-aura": {
      const stage =
        state.players[
          aura.scope === "opponent-stage-aura" ? opponentOf(playerId) : playerId
        ].stage;
      return (
        stage?.cardNumber === aura.cardNumber &&
        !effectsNegated(state, stage.instanceId)
      );
    }
    case "board-aura":
    case "opponent-board-aura":
      return boardAuraCopies(aura, context) > 0;
    case "self":
      return false;
  }
}

/**
 * How many un-negated copies of a Character aura's source stand on the board
 * it reaches from. Each copy's effect applies on its own, so two P-027 General
 * Frankys give +2000 (Bandai's P-027#2). A Leader or Stage aura has one
 * source per side, so only a Character aura can count past one.
 */
function boardAuraCopies(aura: StaticAbility, context: AbilityContext): number {
  const { state, playerId } = context;
  const board =
    state.players[
      aura.scope === "opponent-board-aura" ? opponentOf(playerId) : playerId
    ].board;
  return board.filter(
    (card) =>
      card.cardNumber === aura.cardNumber &&
      !effectsNegated(state, card.instanceId),
  ).length;
}

function abilitiesFor(context: AbilityContext): StaticAbility[] {
  // A negated card keeps nothing of its own text. A Leader is addressed by its
  // synthetic instance id, which is what `context.card.instanceId` already
  // holds for a Leader context, so the one read covers both.
  const own = bySelf.get(context.card.cardNumber);
  const abilities: StaticAbility[] =
    own && !effectsNegated(context.state, context.card.instanceId)
      ? [...own]
      : [];
  const candidates = presentAuras(context.state);
  if (candidates.length === 0) return abilities;
  // `auraReaches` still decides: a card present on the wrong side of the table
  // is a candidate here and is turned away there, exactly as it was when every
  // aura in the pool was asked.
  const reaching = candidates.filter(({ ability }) =>
    auraReaches(ability, context),
  );
  if (reaching.length > 1)
    reaching.sort((left, right) => left.position - right.position);
  for (const { ability } of reaching) {
    const copies =
      ability.scope === "board-aura" || ability.scope === "opponent-board-aura"
        ? boardAuraCopies(ability, context)
        : 1;
    for (let copy = 0; copy < copies; copy += 1) abilities.push(ability);
  }
  return abilities;
}

/**
 * The auras whose source card is somewhere on the table: either Leader, either
 * Stage, or a Character on either board.
 */
function presentAuras(
  state: GameState,
): { ability: StaticAbility; position: number }[] {
  const found: { ability: StaticAbility; position: number }[] = [];
  for (const playerId of ["p1", "p2"] as const) {
    const player = state.players[playerId];
    collectAuras(found, player.leaderCardNumber);
    if (player.stage) collectAuras(found, player.stage.cardNumber);
    for (const card of player.board) collectAuras(found, card.cardNumber);
  }
  return found;
}

/**
 * Adds `cardNumber`'s auras to `found` once each -- `abilitiesFor` counts the
 * copies -- and `found` is a handful of entries at most, so a linear check is
 * the cheapest set there is.
 */
function collectAuras(
  found: { ability: StaticAbility; position: number }[],
  cardNumber: string,
): void {
  const list = aurasBySource.get(cardNumber);
  if (!list) return;
  for (const entry of list) if (!found.includes(entry)) found.push(entry);
}

/**
 * Cost from static text only, ignoring temporary `costModifiers` and auras.
 * Used by the aura predicate itself to keep the recursion finite.
 */
export function baseEffectiveCost(
  state: GameState,
  playerId: PlayerId,
  card: CardInstance,
  db: CardDatabase = cards,
): number {
  const printed = db.require(card.cardNumber).cost ?? 0;
  if (effectsNegated(state, card.instanceId)) return printed;
  const context: AbilityContext = {
    state,
    playerId,
    card,
    isLeader: false,
    db,
  };
  return (bySelf.get(card.cardNumber) ?? []).reduce(
    (total, ability) =>
      total +
      (selfCostReads(ability, context) ? (ability.cost?.(context) ?? 0) : 0),
    printed,
  );
}

/**
 * Whether a cost layer applies to the card in the zone it is in now: a
 * `scope: "self"` layer only where its printed text points (see
 * `StaticAbility.cost` and `costZone`), and an aura only on the field. Every
 * cost aura in the pool names "Characters", which are cards on the field, so
 * none reaches a Character card in a hand or a trash (Bandai's P-032#1).
 */
function selfCostReads(
  ability: StaticAbility,
  context: AbilityContext,
): boolean {
  if (ability.cost === undefined) return true;
  const player = context.state.players[context.playerId];
  const id = context.card.instanceId;
  if (ability.scope === "self" && ability.costZone === "hand")
    return player.hand.some((card) => card.instanceId === id);
  return (
    player.board.some((card) => card.instanceId === id) ||
    player.stage?.instanceId === id
  );
}

/** Total static cost contribution for a card. */
export function staticCostDelta(
  state: GameState,
  playerId: PlayerId,
  card: CardInstance,
  db: CardDatabase = cards,
): number {
  const context: AbilityContext = {
    state,
    playerId,
    card,
    isLeader: false,
    db,
  };
  return abilitiesFor(context).reduce(
    (total, ability) =>
      total +
      (selfCostReads(ability, context) ? (ability.cost?.(context) ?? 0) : 0),
    0,
  );
}

/**
 * The static cost contribution of the abilities `include` admits, for a cost
 * layer whose own condition reads the cost the *other* layers leave: OP10-042
 * Usopp's "+1 to cost 2 or more" cannot ask `costOf` without asking itself.
 */
export function staticCostDeltaWhere(
  state: GameState,
  playerId: PlayerId,
  card: CardInstance,
  db: CardDatabase,
  include: (ability: StaticAbility) => boolean,
): number {
  const context: AbilityContext = {
    state,
    playerId,
    card,
    isLeader: false,
    db,
  };
  return abilitiesFor(context).reduce(
    (total, ability) =>
      total +
      (include(ability) && selfCostReads(ability, context)
        ? (ability.cost?.(context) ?? 0)
        : 0),
    0,
  );
}

/** One static ability's net effect on a card's power, for UI breakdowns. */
export interface StaticPowerContribution {
  cardNumber: string;
  amount: number;
}

/**
 * Itemized static power contributions, so callers can show *why* a card's
 * power changed rather than just the folded total `staticPower` returns.
 *
 * A `set-base` layer is expressed as the delta from `printed` so every
 * contribution is directly summable: `printed + sum(contributions) === staticPower(...)`.
 *
 * `baseIsSet` says `printed` is itself a stored "base power becomes N" rather
 * than the printed figure. That matters to a `set-base` layer: rule 4-9-2-1
 * applies the highest of several base-power setters, so a static 7000 lifts a
 * stored 6000 but does not pull a stored 8000 down, where over a real printed
 * power it replaces the number whichever way it moves it.
 */
export function staticPowerContributions(
  state: GameState,
  playerId: PlayerId,
  card: CardInstance,
  isLeader: boolean,
  printed: number,
  db: CardDatabase = cards,
  baseIsSet = false,
): StaticPowerContribution[] {
  const context: AbilityContext = { state, playerId, card, isLeader, db };
  const abilities = abilitiesFor(context);
  const contributions: StaticPowerContribution[] = [];
  const setBase = highestStaticSetBase(abilities, context);
  if (setBase && (!baseIsSet || setBase.value > printed)) {
    if (setBase.value !== printed) {
      contributions.push({
        cardNumber: setBase.cardNumber,
        amount: setBase.value - printed,
      });
    }
  }
  for (const ability of abilities) {
    if (ability.power?.kind !== "add") continue;
    const amount = ability.power.value(context);
    if (amount !== 0)
      contributions.push({ cardNumber: ability.cardNumber, amount });
  }
  return contributions;
}

/**
 * The highest live `set-base` layer on a card, and whose it is -- the highest
 * rather than the first, by rule 4-9-2-1.
 */
function highestStaticSetBase(
  abilities: readonly StaticAbility[],
  context: AbilityContext,
): { cardNumber: string; value: number } | undefined {
  let highest: { cardNumber: string; value: number } | undefined;
  for (const ability of abilities) {
    if (ability.power?.kind !== "set-base") continue;
    const value = ability.power.value(context);
    if (value === undefined) continue;
    if (!highest || value > highest.value)
      highest = { cardNumber: ability.cardNumber, value };
  }
  return highest;
}

/** Static power contribution, applied over printed power and modifiers. */
/**
 * A board Character's current power, including its static layers, its
 * turn-scoped modifiers and the DON!! given to it.
 *
 * This is the Character branch of `currentPower` in `queries.ts`, which
 * delegates here -- the same seam `costOf` already has for `effectiveCost`. It
 * lives on this side of the import edge because a static layer may need to read
 * another card's power: OP15-080 Oars gains +7000 only next to a [Gecko Moria]
 * "with 10000 power or more", and reaching back into `queries.ts` for that
 * would be a cycle.
 */
export function boardCardPower(
  state: GameState,
  playerId: PlayerId,
  card: BoardCard,
  includeAttachedDon = true,
  db: CardDatabase = cards,
): number {
  // A live "base power becomes N" setter replaces printed power before any
  // static layer or modifier is applied, the same order `currentPower` gives the
  // Leader's own `leaderBasePowers`.
  const override = storedBasePower(card.basePowerOverrides, state.turn);
  const printed = override ?? db.require(card.cardNumber).power ?? 0;
  const modifiers = (card.powerModifiers ?? [])
    .filter((modifier) => modifier.expiresAtTurn >= state.turn)
    .reduce((total, modifier) => total + modifier.amount, 0);
  return (
    staticPower(
      state,
      playerId,
      card,
      false,
      printed,
      db,
      override !== undefined,
    ) +
    modifiers +
    (includeAttachedDon ? (card.attachedDon?.length ?? 0) * 1000 : 0)
  );
}

/**
 * A card's *base* power, for "base power N or less" and "N base power" gates.
 *
 * The same ordering `boardCardPower` and `currentPower` fold, stopped before
 * the `add` layers, modifiers and DON!!: the highest live "base power becomes
 * N" -- a stored setter or a static `set-base` layer, by rule 4-9-2-1 --
 * replaces printed power. Bandai's OP17-112 Q&A is the ruling: a Character whose base power
 * Charlotte Linlin turned into 8000 no longer answers to "4000 base power".
 *
 * Off the field nothing can have rewritten a card, so a card in hand, deck,
 * trash or Life reads its printed power. `undefined` for a card that prints
 * none (an Event, a Stage), which is what lets a power bound never match one.
 */
export function cardBasePower(
  state: GameState,
  playerId: PlayerId,
  card: CardInstance,
  db: CardDatabase = cards,
): number | undefined {
  const player = state.players[playerId];
  if (card.instanceId === `${playerId}-leader`) {
    const override = storedBasePower(player.leaderBasePowers, state.turn);
    const printed = override ?? db.require(player.leaderCardNumber).power ?? 0;
    return staticBasePower(
      state,
      playerId,
      card,
      true,
      printed,
      db,
      override !== undefined,
    );
  }
  const printed = db.require(card.cardNumber).power ?? undefined;
  const onBoard = player.board.find(
    (candidate) => candidate.instanceId === card.instanceId,
  );
  if (!onBoard) return printed;
  const override = storedBasePower(onBoard.basePowerOverrides, state.turn);
  const base = override ?? printed;
  if (base === undefined) return undefined;
  return staticBasePower(
    state,
    playerId,
    onBoard,
    false,
    base,
    db,
    override !== undefined,
  );
}

/**
 * The base power a card had as it left the field, read off the board entry it
 * left behind.
 *
 * `cardBasePower` reads printed power for anything off the board, which is
 * right for a card sitting in the trash and wrong for "when your Character
 * with N base power is K.O.'d": that clause asks what the Character *was*.
 * Bandai's OP14-053 Q&A is the ruling -- OP14-053 Vista K.O.'d while its base
 * power copies a 6000 Leader is a 6000-base Character to OP13-002 Ace. The
 * entry keeps its stored setters, and a card's own `set-base` layers are read
 * against it as they would be on the field; an entry that was never on the
 * board carries neither and so reads its printed power.
 */
export function departedCardBasePower(
  state: GameState,
  playerId: PlayerId,
  card: CardInstance,
  db: CardDatabase = cards,
): number | undefined {
  const printed = db.require(card.cardNumber).power ?? undefined;
  const override =
    "basePowerOverrides" in card
      ? storedBasePower((card as BoardCard).basePowerOverrides, state.turn)
      : undefined;
  const base = override ?? printed;
  if (base === undefined) return undefined;
  return staticBasePower(
    state,
    playerId,
    card,
    false,
    base,
    db,
    override !== undefined,
  );
}

/**
 * The `set-base` layer alone: what `staticPower` starts its `add`s from. See
 * `staticPowerContributions` for `baseIsSet`.
 */
function staticBasePower(
  state: GameState,
  playerId: PlayerId,
  card: CardInstance,
  isLeader: boolean,
  printed: number,
  db: CardDatabase,
  baseIsSet: boolean,
): number {
  const context: AbilityContext = { state, playerId, card, isLeader, db };
  const setBase = highestStaticSetBase(abilitiesFor(context), context);
  if (!setBase) return printed;
  return baseIsSet ? Math.max(printed, setBase.value) : setBase.value;
}

export function staticPower(
  state: GameState,
  playerId: PlayerId,
  card: CardInstance,
  isLeader: boolean,
  printed: number,
  db: CardDatabase = cards,
  baseIsSet = false,
): number {
  return staticPowerContributions(
    state,
    playerId,
    card,
    isLeader,
    printed,
    db,
    baseIsSet,
  ).reduce((total, contribution) => total + contribution.amount, printed);
}

/**
 * Whether a card has a keyword from static text.
 *
 * Unconditional keywords are read straight off printed card text; the table is
 * consulted only for cards that condition the keyword on board state, and a
 * table entry *overrides* the text for that card and keyword.
 *
 * It used to work the other way round: every Blocker in the format had to be
 * hand-added to a list here. Three cards in the OP16 Nami playtest deck --
 * PRB02-008 Marco, EB04-058 Borsalino and OP13-042 Edward.Newgate -- print
 * [Blocker], had their On Play and On K.O. effects implemented, and silently
 * could not block, because nobody added them to the list. Deriving the default
 * from text removes the whole class: a card entering the format through
 * `pnpm reference:audit` gets its printed keywords automatically, and only a
 * genuinely conditional one needs an entry.
 */
/**
 * Extra Counter power a hand card gains from another card's static text,
 * printed on top of the two cards in this set that give Counter power to a
 * card with none printed.
 *
 * Both are gated on "without a Counter", so a card already printing one is
 * never touched -- neither text reads as a bonus on top of an existing
 * number.
 *
 *  - OP17-063 Kaido: "[printed text omitted -- pnpm card:text OP17-063]" A board-sourced aura over the controller's whole hand,
 *    live while an un-negated 063 sits on the board -- the same shape
 *    `board-aura` gives OP17-112, but Counter power during the Counter step
 *    has no home in the `StaticAbility` power/cost/keyword layers, so this is
 *    its own small table rather than a fourth layer kind for one clause.
 *  - OP17-118 Rocks.D.Xebec: "[printed text omitted -- pnpm card:text OP17-118]" Self-only: the bonus never
 *    reaches any other card in hand, and the gate reads the player's *board*,
 *    not their hand. A board with no Characters at all does not satisfy "[printed text omitted -- pnpm card:text OP17-118]": Bandai's OP-17 Q&A
 *    rules that "only have" needs at least one such Character.
 *
 * OP16-118 Portgas.D.Ace is the third and does not fit that shape: "[printed text omitted -- pnpm card:text OP16-118]" is
 * a *replacement*, so it reaches a card that already prints one -- OP16-017
 * LittleOars Jr. prints 1000 -- and the two clauses above never do. It is
 * therefore answered before the printed-Counter gate and returns a delta, since
 * the caller adds this to the printed number. "with 8000 power" is a floor,
 * not an exact match: Bandai's OP-17 Q&A rules that with Ace on the field a
 * Character in hand "with 8000 power or more and no Counter" is treated as
 * having Counter +2000, so OP16-003 at 10000 and OP17-005 at 12000 are reached
 * too. The same ruling fixes the stack with OP17-063 Kaido: the card reads
 * +2000, not +3000, which is why this branch returns before Kaido's is summed.
 */
export function handCounterPower(
  state: GameState,
  playerId: PlayerId,
  cardNumber: string,
  db: CardDatabase = cards,
): number {
  const definition = db.require(cardNumber);
  if (definition.category !== "character") return 0;
  const board = state.players[playerId].board;
  if (
    (definition.power ?? 0) >= 8000 &&
    board.some(
      (card) =>
        card.cardNumber === "OP16-118" &&
        !effectsNegated(state, card.instanceId),
    )
  ) {
    return 2000 - (definition.counter ?? 0);
  }
  if ((definition.counter ?? 0) > 0) return 0;
  let bonus = 0;
  if (
    board.some(
      (card) =>
        card.cardNumber === "OP17-063" &&
        !effectsNegated(state, card.instanceId),
    )
  ) {
    bonus += 1000;
  }
  if (cardNumber === "OP17-118") {
    const characters = board.filter(
      (card) => db.require(card.cardNumber).category === "character",
    );
    if (
      characters.length > 0 &&
      characters.every(
        (card) => (db.require(card.cardNumber).counter ?? 0) === 0,
      )
    ) {
      bonus += 2000;
    }
  }
  return bonus;
}

/**
 * Whether this card's own continuous text lets it attack an active Character.
 *
 * The static half of the permission `BoardCard.attacksActiveUntilTurn` holds
 * for a turn; the caller in `legal-actions/main.ts` takes either. Negation
 * strips it, because it is the Character's own printed text -- unlike the turn
 * flag, which is somebody else's effect written onto the card.
 */
export function attacksActiveCharacters(
  state: GameState,
  playerId: PlayerId,
  card: CardInstance,
  db: CardDatabase = cards,
): boolean {
  if (effectsNegated(state, card.instanceId)) return false;
  const context: AbilityContext = {
    state,
    playerId,
    card,
    isLeader: false,
    db,
  };
  return abilitiesFor(context).some((ability) =>
    ability.attacksActive?.(context),
  );
}

/**
 * Whether this card's own continuous text bars it from attacking right now.
 *
 * The mirror of {@link attacksActiveCharacters}: a permission there, a
 * prohibition here, and both are the card's own printed text -- so negation
 * lifts this the same way it strips that. `couldAttackThisTurn` is the only
 * caller, and it asks after the derived `rules.cannotAttack` flag, because the
 * two readings are different sentences and a card could in principle print
 * either.
 */
export function attackBannedByOwnText(
  state: GameState,
  playerId: PlayerId,
  card: CardInstance,
  db: CardDatabase = cards,
): boolean {
  if (effectsNegated(state, card.instanceId)) return false;
  const context: AbilityContext = {
    state,
    playerId,
    card,
    isLeader: false,
    db,
  };
  return abilitiesFor(context).some((ability) =>
    ability.attackBlocked?.(context),
  );
}

/**
 * The Leader pseudo-card as an ability subject, for the two player-scoped rules
 * below. Both are printed on Leaders, and asking with the Leader as the subject
 * is what makes `abilitiesFor`'s negation check cover them.
 */
function leaderContext(
  state: GameState,
  playerId: PlayerId,
  db: CardDatabase,
): AbilityContext {
  return {
    state,
    playerId,
    card: {
      instanceId: `${playerId}-leader`,
      cardNumber: state.players[playerId].leaderCardNumber,
    },
    isLeader: true,
    db,
  };
}

/**
 * Whether a Character survives losing a fight. See `battleKoImmune`.
 *
 * A negated body loses the protection, which `abilitiesFor` already applies:
 * the immunity is the Character's own printed text.
 */
export function survivesBattleKo(
  state: GameState,
  ownerId: PlayerId,
  card: CardInstance,
  attacker: { isLeader: boolean; cardNumber: string },
  db: CardDatabase = cards,
): boolean {
  // The granted window beside the printed text -- OP06-030 Dosun hands it to
  // itself and the OP06-096 Event hands it to a board. Read here rather than at
  // the battle site so both shapes of the same sentence are one question, the
  // way `attacksActiveCharacters` reads the printed and granted halves of its
  // own permission together. A negated body keeps it: what the effect wrote is
  // not the Character's own text.
  if (
    "battleKoImmuneUntilTurn" in card &&
    ((card as BoardCard).battleKoImmuneUntilTurn ?? -1) >= state.turn
  ) {
    return true;
  }
  const context: AbilityContext = {
    state,
    playerId: ownerId,
    card,
    isLeader: false,
    db,
  };
  return abilitiesFor(context).some((ability) =>
    ability.battleKoImmune?.(context, attacker),
  );
}

/**
 * Whether `playerId` wins the game because their opponent just activated a
 * [Blocker]. See `winsOnOpponentBlock`.
 */
export function winsOnOpponentBlock(
  state: GameState,
  playerId: PlayerId,
  db: CardDatabase = cards,
): boolean {
  return state.players[playerId].board.some((card) => {
    const context: AbilityContext = {
      state,
      playerId,
      card,
      isLeader: false,
      db,
    };
    return abilitiesFor(context).some((ability) =>
      ability.winsOnOpponentBlock?.(context),
    );
  });
}

/**
 * Whether playing `cardNumber` out of this player's trash grants it [Rush] for
 * the turn. See `trashPlayRush`.
 */
export function trashPlayGrantsRush(
  state: GameState,
  playerId: PlayerId,
  cardNumber: string,
  db: CardDatabase = cards,
): boolean {
  const context = leaderContext(state, playerId, db);
  return abilitiesFor(context).some((ability) =>
    ability.trashPlayRush?.(context, cardNumber),
  );
}

/** Whether this player's Characters arrive rested. See `charactersPlayRested`. */
/**
 * Whether a continuous clause holds this rested Character down through its
 * controller's Refresh Phase -- OP05-040 Birdcage. See
 * {@link StaticAbility.blocksRefresh}.
 */
export function refreshBlocked(
  state: GameState,
  playerId: PlayerId,
  card: BoardCard,
  db: CardDatabase = cards,
): boolean {
  const context: AbilityContext = {
    state,
    playerId,
    card,
    isLeader: false,
    db,
  };
  return abilitiesFor(context).some((ability) =>
    ability.blocksRefresh?.(context),
  );
}

/**
 * The total a player's continuous text takes off playing `cardNumber` from
 * hand right now -- see {@link StaticAbility.handPlayDiscount}. The subject is
 * the hand card, under a synthetic id no zone holds, so a Stage aura reaches it
 * and nothing keyed to a board instance does.
 */
export function staticHandPlayDiscount(
  state: GameState,
  playerId: PlayerId,
  cardNumber: string,
  db: CardDatabase = cards,
): number {
  const context: AbilityContext = {
    state,
    playerId,
    card: { instanceId: `${playerId}-hand-price`, cardNumber },
    isLeader: false,
    db,
  };
  return abilitiesFor(context).reduce(
    (total, ability) => total + (ability.handPlayDiscount?.(context) ?? 0),
    0,
  );
}

/**
 * The card's own `costZone: "hand"` layers -- "give this card in your hand −N
 * cost" -- summed for `cardNumber` as it sits in `playerId`'s hand, so the
 * price paid to play or activate it reads the same number `effectiveCost`
 * reports for the hand card. Negative for a discount.
 */
export function staticHandCostDelta(
  state: GameState,
  playerId: PlayerId,
  cardNumber: string,
  db: CardDatabase = cards,
): number {
  const context: AbilityContext = {
    state,
    playerId,
    card: { instanceId: `${playerId}-hand-price`, cardNumber },
    isLeader: false,
    db,
  };
  return (bySelf.get(cardNumber) ?? []).reduce(
    (total, ability) =>
      ability.costZone === "hand"
        ? total + (ability.cost?.(context) ?? 0)
        : total,
    0,
  );
}

/**
 * Whether `cardNumber` in this player's hand refuses to be played by an
 * effect. See {@link StaticAbility.effectPlayFromHandBarred}.
 */
export function effectPlayBarred(
  state: GameState,
  playerId: PlayerId,
  cardNumber: string,
  db: CardDatabase = cards,
): boolean {
  const context: AbilityContext = {
    state,
    playerId,
    card: { instanceId: `${playerId}-hand-play`, cardNumber },
    isLeader: false,
    db,
  };
  return abilitiesFor(context).some((ability) =>
    ability.effectPlayFromHandBarred?.(context),
  );
}

export function charactersArriveRested(
  state: GameState,
  playerId: PlayerId,
  db: CardDatabase = cards,
): boolean {
  const context = leaderContext(state, playerId, db);
  return abilitiesFor(context).some((ability) =>
    ability.charactersPlayRested?.(context),
  );
}

/**
 * Whether a damaged *face-up* Life card goes to the bottom of this player's
 * deck instead of into their hand. See {@link
 * StaticAbility.faceUpLifeGoesToDeckBottom}.
 */
export function faceUpLifeBanksToDeck(
  state: GameState,
  playerId: PlayerId,
  db: CardDatabase = cards,
): boolean {
  const context = leaderContext(state, playerId, db);
  return abilitiesFor(context).some((ability) =>
    ability.faceUpLifeGoesToDeckBottom?.(context),
  );
}

/**
 * Whether one DON!! this player's DON!! Phase places goes onto their Leader.
 * See {@link StaticAbility.donPhaseDonToLeader}.
 */
export function donPhaseGivesLeaderDon(
  state: GameState,
  playerId: PlayerId,
  db: CardDatabase = cards,
): boolean {
  const context = leaderContext(state, playerId, db);
  return abilitiesFor(context).some((ability) =>
    ability.donPhaseDonToLeader?.(context),
  );
}

/**
 * Whether this player's `[On Play]` effects resolve at all.
 *
 * The static half is a Leader's own text; the turn-scoped half is what
 * OP09-081's `[Activate: Main]` writes onto the *other* player.
 */
export function onPlayEffectsNegated(
  state: GameState,
  playerId: PlayerId,
  db: CardDatabase = cards,
): boolean {
  if ((state.players[playerId].onPlayNegatedUntilTurn ?? -1) >= state.turn) {
    return true;
  }
  const context = leaderContext(state, playerId, db);
  return abilitiesFor(context).some((ability) =>
    ability.onPlayNegated?.(context),
  );
}

export function hasStaticKeyword(
  state: GameState,
  playerId: PlayerId,
  card: CardInstance,
  keyword: Keyword,
  db: CardDatabase = cards,
  /**
   * Whether `card` is the Leader pseudo-card. An aura can reach one -- OP16-003
   * Edward.Newgate gives its controller's Leader [Double Attack] -- and the
   * layers ask through `context.isLeader`.
   */
  isLeader = false,
): boolean {
  // Printed [Blocker], [Rush] and [Unblockable] are the Character's own effects,
  // so a negated Character loses them. A keyword another card's aura grants
  // is that card's effect and survives -- OP17-079's Leader still gives a
  // negated 12-cost Character [Blocker] -- and so do the turn-scoped grants
  // on board flags, which `hasKeyword` reads.
  const negated = effectsNegated(state, card.instanceId);
  const context: AbilityContext = {
    state,
    playerId,
    card,
    isLeader,
    db,
  };
  // This card's own conditional text (a `scope: "self"` entry keyed on its
  // exact card number) *overrides* its printed fact rather than adding to
  // it -- see the function's own doc comment. Everything else -- an
  // unconditional printed keyword, or a `controller-aura`/`board-aura`
  // sourced from a *different* card, such as OP17-079's Leader-granted
  // [Blocker] -- only ever adds. Folding an aura into the same "override"
  // check this card's own conditional text uses would make it *replace* a
  // card's printed [Blocker] with "no" whenever the aura itself does not
  // happen to reach it, which is what briefly broke OP17-064 King and
  // OP17-108 Brulee here.
  const ownConditional = selfKeywordConditionals.has(
    `${card.cardNumber}\u0000${keyword}`,
  );
  const abilities = abilitiesFor(context);
  const own = negated
    ? false
    : ownConditional
      ? abilities.some(
          (ability) =>
            ability.scope === "self" &&
            ability.keyword?.keyword === keyword &&
            ability.keyword.when(context),
        )
      : context.db.facts(card.cardNumber).keywords.includes(keyword);
  if (own) return true;
  return abilities.some(
    (ability) =>
      ability.scope !== "self" &&
      ability.keyword?.keyword === keyword &&
      ability.keyword.when(context),
  );
}

import {
  type ActiveAttack,
  applyAction,
  assertGameStateInvariants,
  createGame,
  currentPower,
  getLegalActions,
  type BoardCard,
  type CardInstance,
  type GameState,
} from "@one-piece-sim/engine-core";
import type {
  LegalAction,
  PlayerId,
  PublicEvent,
} from "@one-piece-sim/protocol";
import { resolveDeck } from "@one-piece-sim/decks";

/**
 * A battle to fabricate, stated the way a test thinks about one.
 *
 * `attackPower` is the total the attacker swings for, not the engine's
 * `battleAttackBonus` -- see `withActiveAttack`, which converts.
 */
export type FabricatedAttack = Omit<ActiveAttack, "battleAttackBonus"> & {
  attackPower: number;
};

/**
 * Turns a {@link FabricatedAttack} into the `ActiveAttack` the engine holds.
 *
 * The engine stores the battle-scoped *bonus* over the attacker's board power,
 * not a total: `battleAttackPower` adds the two at every read, so a mid-battle
 * debuff on the attacker moves the battle the way it moves the card. A test
 * naming a bonus would have to restate the attacker's power arithmetic in every
 * position, and a fabricated battle is posed as "this much is coming at you".
 *
 * Assign the result *after* `turnPlayerId` and the board are in place: a
 * `[Your Turn]` static layer reads them, so measuring earlier puts the attacker
 * on the wrong side of its own attack.
 */
export function fabricatedAttack(
  state: GameState,
  attack: FabricatedAttack,
): ActiveAttack {
  const { attackPower, ...battle } = attack;
  const attackerIsLeader =
    attack.attackerInstanceId === `${attack.attackerPlayerId}-leader`;
  const onField =
    attackerIsLeader ||
    state.players[attack.attackerPlayerId].board.some(
      (card) => card.instanceId === attack.attackerInstanceId,
    );
  const boardPower = onField
    ? currentPower(
        state,
        attack.attackerPlayerId,
        attack.attackerInstanceId,
        true,
      )
    : 0;
  return { ...battle, battleAttackBonus: attackPower - boardPower };
}

/**
 * The documented way to build a position for a test.
 *
 * Two rules the hand-rolled scaffolding in older tests broke, and the reason
 * this exists:
 *
 * 1. **Reach positions through legal actions where you can.** `keepBothHands()`
 *    and `atTurn()` drive the engine's own actions, so the position they produce
 *    is one a real game could contain. A test that mutates `state.turn` directly
 *    can assert on a board the engine would never hand it, and then a green test
 *    is not evidence.
 * 2. **Name the exceptions.** Placing a specific card on the board or in the
 *    trash is not reachable by playing a seeded game to a decision, so those are
 *    `with*` setters: deliberate, listed in one place, and invariant-checked at
 *    `build()`.
 *
 * ```ts
 * const game = scenario()
 *   .decks("(Red/Black) Sabo - Starter Deck 35", "(Red) Monkey.D.Luffy - Starter Deck 31")
 *   .seed("st35-playable")
 *   .keepBothHands()
 *   .atTurn(3, { active: "p1" })
 *   .withBoard("p1", [character("morley", "OP12-093")])
 *   .build();
 *
 * game.play({ type: "play-card", cardNumber: "OP13-004" });
 * ```
 */
export function scenario(): Scenario {
  return new Scenario();
}

/** A legal action selector: a predicate, or the fields it has to match. */
export type ActionMatcher =
  | ((action: LegalAction) => boolean)
  | (Partial<Record<string, unknown>> & {
      type?: LegalAction["type"];
      /** Matched as a substring, since summaries are display text. */
      summary?: string;
      /** For `play-card`: resolved against the acting player's hand. */
      cardNumber?: string;
    });

type Setup = (state: GameState) => void;

class Scenario {
  #p1Deck = "(Red) Monkey.D.Luffy - Starter Deck 31";
  #p2Deck = "(Green) Roronoa Zoro - Starter Deck 32";
  #seed = "scenario";
  #gameId?: string;
  #startingPlayer?: PlayerId;
  #keepHands = false;
  #turn?: { turn: number; active?: PlayerId };
  #setups: Setup[] = [];
  #invariantOptions: { exactDonCount?: boolean; uniqueIdentities?: boolean } =
    {};

  decks(p1Deck: string, p2Deck: string): this {
    this.#p1Deck = p1Deck;
    this.#p2Deck = p2Deck;
    return this;
  }

  seed(seed: string): this {
    this.#seed = seed;
    return this;
  }

  /** Defaults to the seed, which is what the older hand-rolled setups did. */
  gameId(gameId: string): this {
    this.#gameId = gameId;
    return this;
  }

  startingPlayer(player: PlayerId): this {
    this.#startingPlayer = player;
    return this;
  }

  /** Takes both mulligan decisions as `keep`, through the offered actions. */
  keepBothHands(): this {
    this.#keepHands = true;
    return this;
  }

  /**
   * Passes turns until the given turn, so DON!!, draws and refreshes are the
   * ones a real game would have at that point. Implies `keepBothHands()`.
   */
  atTurn(turn: number, options: { active?: PlayerId } = {}): this {
    this.#keepHands = true;
    this.#turn = { turn, ...options };
    return this;
  }

  withLeader(player: PlayerId, cardNumber: string): this {
    return this.#setup((state) => {
      state.players[player].leaderCardNumber = cardNumber;
    });
  }

  /**
   * Rests the Leader, as declaring an attack with it does.
   *
   * `withActiveAttack` sets the battle up without replaying the attack that
   * started it, so a Leader that is mid-swing still reads as active. That is
   * the difference between "one more attack can still land this turn" and "this
   * is the last hit of the turn" to every policy that counts incoming attacks,
   * so a test posing the second case has to say so.
   */
  withRestedLeader(player: PlayerId): this {
    return this.#setup((state) => {
      state.players[player].leaderRested = true;
    });
  }

  withBoard(player: PlayerId, board: BoardCard[]): this {
    return this.#setup((state) => {
      state.players[player].board = board;
    });
  }

  withStage(
    player: PlayerId,
    /**
     * `rested` is part of the card here rather than a separate argument, so a
     * position can state a Stage that has already been spent -- OP09-080
     * Thousand Sunny and OP09-099 Fullalead both pay by resting themselves, and
     * "already rested" is the case their clauses have to refuse.
     */
    stage: (CardInstance & { rested?: boolean }) | null,
  ): this {
    return this.#setup((state) => {
      // `rested: false` is the default, not an override: a Stage with an
      // `[Activate: Main]` that rests itself (OP09-099 Fullalead) needs a
      // position where it has already been spent.
      state.players[player].stage =
        stage === null ? null : { rested: false, ...stage };
    });
  }

  withHand(player: PlayerId, hand: CardInstance[]): this {
    return this.#setup((state) => {
      state.players[player].hand = hand;
    });
  }

  withTrash(player: PlayerId, trash: CardInstance[]): this {
    return this.#setup((state) => {
      state.players[player].trash = trash;
    });
  }

  /** Cards on top of the deck, in draw order. The rest of the deck stays. */
  withDeckTop(player: PlayerId, cards: CardInstance[]): this {
    return this.#setup((state) => {
      state.players[player].deck.unshift(...cards);
    });
  }

  /**
   * Extra cards moved from the top of the deck into hand, the way a draw
   * effect moves them.
   */
  withDraw(player: PlayerId, count: number): this {
    return this.#setup((state) => {
      const target = state.players[player];
      target.hand.push(...target.deck.splice(0, count));
    });
  }

  /**
   * Life as a count, dealt off the top of the deck the way setup deals it, or as
   * explicit cards when the test cares which ones they are.
   */
  withLife(player: PlayerId, life: number | CardInstance[]): this {
    return this.#setup((state) => {
      const target = state.players[player];
      target.life =
        typeof life === "number" ? target.deck.splice(0, life) : [...life];
    });
  }

  /**
   * DON!! on the field, moved out of the DON!! deck -- or off the active pile
   * once the deck is empty, as `bareTable()` leaves it -- so the ten-card total
   * the invariant check enforces still holds.
   */
  withDon(
    player: PlayerId,
    counts: { active?: number; rested?: number; leaderAttached?: number },
  ): this {
    return this.#setup((state) => {
      const target = state.players[player];
      const take = (count: number): string[] => {
        const taken = target.donDeck.splice(0, count);
        if (taken.length < count) {
          taken.push(...target.activeDon.splice(0, count - taken.length));
        }
        if (taken.length < count) {
          throw new Error(`${player} has no DON!! left to place`);
        }
        return taken;
      };
      if (counts.active !== undefined) {
        target.activeDon.push(...take(counts.active));
      }
      if (counts.rested !== undefined) {
        target.restedDon.push(...take(counts.rested));
      }
      if (counts.leaderAttached !== undefined) {
        target.leaderAttachedDon.push(...take(counts.leaderAttached));
      }
    });
  }

  /**
   * DON!! moved back into the DON!! deck, so an "add N DON!! from your DON!!
   * deck" effect has something to add.
   *
   * `bareTable()` puts all ten on the field, which is what most positions want
   * and what leaves the DON!! deck empty. OP16's Purple shell is built entirely
   * on drawing from it, so those tests say how much is left there.
   */
  withDonDeck(player: PlayerId, count: number): this {
    return this.#setup((state) => {
      const target = state.players[player];
      // `splice(-0)` is `splice(0)`, which removes *everything*: asking for no
      // DON!! back used to move the whole active pool into the DON!! deck, and
      // a scenario that computed its count (`10 - fieldDon`) hit it the moment
      // that came out at zero.
      const taken = count === 0 ? [] : target.activeDon.splice(-count);
      if (taken.length < count) {
        taken.push(...target.restedDon.splice(-(count - taken.length)));
      }
      if (taken.length < count) {
        throw new Error(`${player} has no DON!! left to return`);
      }
      target.donDeck.push(...taken);
    });
  }

  /**
   * DON!! *given* to a Character already on the board.
   *
   * Distinct from `withDon`, which fills the cost area: a given DON!! has left
   * the cost area for a specific card, and OP15's Green/East Blue package is
   * built on the difference -- "with a DON!! card given" is a target filter,
   * and a `[DON!! xN]` clause reads the same field. Taken from the player's own
   * DON!! so the ten-card total the invariant check enforces still holds, which
   * is why this is a setter rather than an `attachedDon` literal in a
   * `character()` call: an invented id shows up as a duplicate.
   */
  withGivenDon(player: PlayerId, instanceId: string, count: number): this {
    return this.#setup((state) => {
      const target = state.players[player];
      const moved = target.activeDon.splice(0, count);
      if (moved.length < count) {
        moved.push(...target.donDeck.splice(0, count - moved.length));
      }
      if (moved.length < count) {
        throw new Error(`${player} has no DON!! left to give`);
      }
      if (instanceId === `${player}-leader`) {
        target.leaderAttachedDon.push(...moved);
        return;
      }
      const card = target.board.find(
        (candidate) => candidate.instanceId === instanceId,
      );
      if (!card) throw new Error(`${player} has no board card ${instanceId}`);
      card.attachedDon = [...(card.attachedDon ?? []), ...moved];
    });
  }

  /**
   * An empty table: no hands, decks, boards, trash or Stage on either side, all
   * ten DON!! active, and nothing pending.
   *
   * For testing one interaction in isolation, where a real game's board would
   * only add noise -- which is what a dozen card tests were assembling by hand
   * with `Object.assign(player, { hand: [], deck: [], ... })`. Deliberately not
   * a position a game reaches on its own, so it is named: DON!! totals and card
   * identities are still checked, and everything the scenario needs it places
   * explicitly afterwards.
   */
  bareTable(): this {
    return this.#setup((state) => {
      state.pendingEffect = null;
      state.activeAttack = null;
      state.pendingTrigger = null;
      state.oncePerTurn = [];
      for (const playerId of ["p1", "p2"] as const) {
        const target = state.players[playerId];
        const don = [
          ...target.donDeck,
          ...target.activeDon,
          ...target.restedDon,
          ...target.leaderAttachedDon,
        ];
        Object.assign(target, {
          hand: [],
          deck: [],
          board: [],
          stage: null,
          trash: [],
          life: [],
          donDeck: [],
          activeDon: don,
          restedDon: [],
          leaderAttachedDon: [],
          leaderPowerModifiers: [],
          leaderRested: false,
        });
      }
    });
  }

  /**
   * A battle already in progress, for the [Blocker] and [Counter] windows.
   *
   * Reaching these by playing the attack out needs the opposing seat to hold a
   * board the scenario does not otherwise care about, so this is the labelled
   * shortcut: it sets the phase and hands the decision to the defender, which
   * is what the engine does on declaration.
   *
   * The turn goes with it. An attack only ever happens on the attacker's turn,
   * so a fabricated battle that left the turn where the position was built
   * would put a `[Your Turn]` layer and a DON!! bonus on the wrong side.
   */
  withActiveAttack(
    attack: FabricatedAttack,
    phase: "block" | "counter" = "block",
  ): this {
    return this.#setup((state) => {
      state.phase = phase;
      state.activePlayer = attack.defenderPlayerId;
      state.turnPlayerId = attack.attackerPlayerId;
      // Seat first, then the battle: `fabricatedAttack` measures the attacker.
      state.activeAttack = fabricatedAttack(state, attack);
    });
  }

  /**
   * Escape hatch for a position no setter covers. Prefer adding a named setter
   * here over calling this from a test: a `with*` name says what the position
   * is, an inline mutation says only that the state shape allowed it.
   */
  withState(setup: Setup): this {
    return this.#setup(setup);
  }

  /**
   * Relaxes the `build()` invariant check. Only for tests that deliberately
   * build a partial board -- a bare `createGame` with two cards placed by hand
   * owns fewer than ten DON!!, for instance.
   */
  allowPartialState(
    options: { exactDonCount?: boolean; uniqueIdentities?: boolean } = {
      exactDonCount: false,
    },
  ): this {
    this.#invariantOptions = options;
    return this;
  }

  build(): Game {
    let state = createGame({
      gameId: this.#gameId ?? this.#seed,
      // The builder still speaks deck *ids*, which is what a test wants to
      // read; resolving them is the caller's job now, and here that is us.
      p1: resolveDeck(this.#p1Deck),
      p2: resolveDeck(this.#p2Deck),
      seed: this.#seed,
      ...(this.#startingPlayer ? { startingPlayer: this.#startingPlayer } : {}),
    });

    if (this.#keepHands) {
      for (let index = 0; index < 2; index += 1) {
        state = submit(
          state,
          requireAction(state, {
            type: "mulligan-decision",
            decision: "keep",
          }),
        );
      }
    }

    if (this.#turn) {
      const { turn, active } = this.#turn;
      let guard = 0;
      while (
        state.turn < turn ||
        (active !== undefined && state.activePlayer !== active)
      ) {
        if (state.phase === "finished") {
          throw new Error(`game finished before turn ${turn}`);
        }
        if (guard > 40) throw new Error(`could not reach turn ${turn}`);
        guard += 1;
        state = submit(state, requireAction(state, { type: "pass" }));
      }
    }

    for (const setup of this.#setups) setup(state);
    assertGameStateInvariants(state, this.#invariantOptions);
    return new Game(state);
  }

  #setup(setup: Setup): this {
    this.#setups.push(setup);
    return this;
  }
}

/** A built position, plus the three things every test does with one. */
export class Game {
  #state: GameState;
  #events: readonly PublicEvent[] = [];

  constructor(state: GameState) {
    this.#state = state;
  }

  get state(): GameState {
    return this.#state;
  }

  /**
   * The events the most recent action produced.
   *
   * A step that moves nothing a test can read off `state` is only assertable
   * here: DON!! going back to the DON!! deck lands in a pile whose contents
   * are interchangeable, so "the cost was paid, by this card, for this many"
   * is a claim about the event and nothing else.
   */
  get events(): readonly PublicEvent[] {
    return this.#events;
  }

  get player(): PlayerId {
    return this.#state.activePlayer;
  }

  legalActions(player: PlayerId = this.#state.activePlayer): LegalAction[] {
    return getLegalActions(this.#state, player);
  }

  /** The one legal action matching `matcher`, or a listing of what was on offer. */
  action(matcher: ActionMatcher): LegalAction {
    return requireAction(this.#state, matcher);
  }

  /** Applies an action and advances this game to the resulting state. */
  submit(action: LegalAction): GameState {
    const applied = applyAction(this.#state, {
      ...action,
      revision: this.#state.revision,
    });
    this.#state = applied.state;
    this.#events = applied.events;
    return this.#state;
  }

  /** `submit(action(matcher))`, the shape most steps of a scenario take. */
  play(matcher: ActionMatcher): GameState {
    return this.submit(this.action(matcher));
  }

  /** Ends the current turn. */
  pass(): GameState {
    return this.play({ type: "pass" });
  }

  summaries(player: PlayerId = this.#state.activePlayer): string[] {
    return this.legalActions(player).map((action) => action.summary);
  }
}

/**
 * Hands the turn to a player: both the decision and the turn itself.
 *
 * `state.activePlayer` alone is "who acts next", which a Block step or a
 * pending effect moves without the turn changing hands -- so a test that wants
 * "it is now p2's turn" has to say so, or every `[Your Turn]` layer and every
 * DON!! bonus keeps reading the turn the position was built in.
 */
export function setTurnPlayer(state: GameState, playerId: PlayerId): void {
  state.activePlayer = playerId;
  state.turnPlayerId = playerId;
}

/** Applies one legal action at the state's current revision. */
export function submit(state: GameState, action: LegalAction): GameState {
  return applyAction(state, { ...action, revision: state.revision }).state;
}

/**
 * The legal action matching `matcher`, or an error naming every action that was
 * on offer -- which is the question a failing scenario always raises next.
 */
export function requireAction(
  state: GameState,
  matcher: ActionMatcher,
  player: PlayerId = state.activePlayer,
): LegalAction {
  const actions = getLegalActions(state, player);
  const predicate =
    typeof matcher === "function"
      ? matcher
      : toPredicate(state, player, matcher);
  const found = actions.find(predicate);
  if (found) return found;
  throw new Error(
    `no legal action matches ${describe(matcher)}; ${player} was offered: ${
      actions.map((action) => action.summary).join(" | ") || "nothing"
    }`,
  );
}

function toPredicate(
  state: GameState,
  player: PlayerId,
  matcher: Exclude<ActionMatcher, (action: LegalAction) => boolean>,
): (action: LegalAction) => boolean {
  const { cardNumber, summary, ...fields } = matcher;
  // `play-card` names a hand instance, not a card number, so resolve the ids of
  // every copy of that card in hand and match any of them. Tests read better
  // written against the printed card.
  const handIds =
    cardNumber === undefined
      ? undefined
      : new Set(
          state.players[player].hand
            .filter((card) => card.cardNumber === cardNumber)
            .map((card) => card.instanceId),
        );
  return (action) => {
    const candidate = action as unknown as Record<string, unknown>;
    for (const [key, value] of Object.entries(fields)) {
      if (candidate[key] !== value) return false;
    }
    if (summary !== undefined && !action.summary.includes(summary))
      return false;
    if (handIds !== undefined) {
      const instanceId = candidate["cardInstanceId"];
      const named =
        candidate["sourceCardNumber"] === cardNumber ||
        candidate["optionCardNumber"] === cardNumber;
      if (
        !named &&
        !(typeof instanceId === "string" && handIds.has(instanceId))
      ) {
        return false;
      }
    }
    return true;
  };
}

function describe(matcher: ActionMatcher): string {
  return typeof matcher === "function"
    ? "the predicate"
    : JSON.stringify(matcher);
}

/**
 * A recorded game: the sim's game played a second time, move for move, in
 * this engine.
 *
 * `position.ts` rebuilds the table at every decision and forgets it. This
 * keeps one engine game for the whole of the sim's game instead. The model
 * decides in it, each decision is applied to it and performed in the sim, and
 * the next snapshot is checked against it -- so the record that falls out is a
 * game in this engine's own format (a seed, the decks, the action ids) that
 * loads and replays like any other, and the first snapshot the engine's game
 * does not match is a place where the two rules engines disagree.
 *
 * It needs the model in both seats, because every action of the game has to
 * pass through here to be recorded, and a snapshot that shows both hands,
 * decks and Life piles (`TableSnapshot.record`).
 *
 * The sim shuffles with its own dice, so the engine's game is dealt the sim's
 * cards through recorded shuffles (`recorded-shuffle.ts` in the engine): a
 * shuffle is first drawn from the seed, the next snapshot shows how the sim's
 * came out, and the game is replayed from the start with that order recorded.
 */
import {
  applyOfferedAction,
  createGame,
  currentPower,
  donPowerApplies,
  findOfferedAction,
  getLegalActions,
  observe,
  rulesStamp,
  toGameAction,
  type CardInstance,
  type GameState,
} from "@one-piece-sim/engine-core";
import {
  deckManifests,
  resolveMatchDecks,
  type DeckManifest,
} from "@one-piece-sim/decks";
import type {
  GameObservation,
  LegalAction,
  PlayerId,
} from "@one-piece-sim/protocol";
import {
  BrowserGameController,
  type MatchConfig,
} from "../../packages/web/src/controller.js";
import { buildDiagnosticsJsonl } from "../../packages/web/src/diagnostics.js";
import { simMove } from "./decide.js";
import { countCards, importPosition, normalized } from "./position.js";
import type { SimMove, SimSide, SimStep, TableSnapshot } from "./snapshot.js";

const SEATS = ["p1", "p2"] as const;

/** Picks one of an observation's legal actions; the model, or a test's stand-in. */
export type Chooser = (
  observation: GameObservation,
  deck: { leader: string; cards: Record<string, number> },
) => Promise<{ action: LegalAction; value?: number }>;

/** One decision of the recorded game, as both sides saw it. */
export interface Play {
  /** How many engine actions the game held before this decision. */
  at: number;
  turn: number;
  seat: PlayerId;
  step: SimStep["kind"];
  /** The engine actions this decision applied, by summary. */
  actions: string[];
  /**
   * What the sim was told to do. Absent for a person's move, which the sim
   * was not told: it is read off the table afterwards.
   */
  move?: SimMove;
  by?: "person";
  value?: number;
  /** Where the engine and the sim differ without the games parting. */
  notes?: string[];
}

/** Where the engine's game stopped being the sim's. */
export interface Divergence {
  /** How many plays the game held when it happened. */
  afterPlay: number;
  at: number;
  turn: number;
  seat: PlayerId;
  step: SimStep["kind"];
  why: string;
  /** What the engine has that the sim does not, zone by zone. */
  differences: string[];
}

export interface ShadowResult {
  move: SimMove;
  summary: string;
  value?: number;
  offered: string[];
}

function other(player: PlayerId): PlayerId {
  return player === "p1" ? "p2" : "p1";
}

function sorted(values: readonly string[]): string[] {
  return [...values].sort();
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

const numbers = (cards: readonly { cardNumber: string }[]): string[] =>
  cards.map((card) => card.cardNumber);

/** The decision a position is waiting on, in the sim's step names. */
function awaits(state: GameState): {
  seat: PlayerId;
  kind: SimStep["kind"] | "finished";
} {
  const seat = state.activePlayer;
  if (state.phase === "finished") return { seat, kind: "finished" };
  if (state.phase === "mulligan") return { seat, kind: "mulligan" };
  if (state.pendingEffect) return { seat, kind: "effect" };
  if (state.phase === "trigger") return { seat, kind: "trigger" };
  return { seat, kind: state.phase };
}

interface Differences {
  /** Differences in what is on the table. */
  table: string[];
  /** Differences in the order of a player's hidden cards, per player. */
  hidden: Record<PlayerId, string[]>;
  /** Differences that leave both games in the same position. */
  notes: string[];
}

/**
 * A player's deck and Life as a table shows them. The engine deals Life once
 * both players have decided their mulligan; the sim deals a player's as soon
 * as that player has. Between the two the engine's Life is still the top of
 * its deck, and is read from there -- the top card to the bottom of Life,
 * as the engine itself will deal it.
 */
function piles(
  state: GameState,
  player: PlayerId,
  simLife: number,
): { deck: readonly CardInstance[]; life: readonly CardInstance[] } {
  const side = state.players[player];
  if (
    state.phase === "mulligan" &&
    side.mulliganDecision !== "pending" &&
    side.life.length === 0 &&
    simLife > 0
  ) {
    return {
      life: side.deck.slice(0, simLife).reverse(),
      deck: side.deck.slice(simLife),
    };
  }
  return { deck: side.deck, life: side.life };
}

function fieldKey(card: {
  cardNumber: string;
  rested: boolean;
  don: number;
}): string {
  return `${card.cardNumber}${card.rested ? " rested" : ""}${card.don > 0 ? ` +${card.don} DON!!` : ""}`;
}

/** What the engine's game holds that the snapshot does not show, and the reverse. */
export function differences(
  state: GameState,
  snapshot: TableSnapshot,
): Differences {
  const result: Differences = {
    table: [],
    hidden: { p1: [], p2: [] },
    notes: [],
  };
  if (state.turnPlayerId !== snapshot.turnPlayer) {
    result.table.push(
      `it is ${state.turnPlayerId}'s turn in the engine and ${snapshot.turnPlayer}'s in the sim`,
    );
  }
  for (const player of SEATS) {
    const engine = state.players[player];
    const sim = snapshot.players[player];
    const { deck, life } = piles(state, player, sim.life);
    const table = (what: string, ours: unknown, theirs: unknown): void => {
      if (JSON.stringify(ours) !== JSON.stringify(theirs)) {
        result.table.push(
          `${player} ${what}: engine ${JSON.stringify(ours)}, sim ${JSON.stringify(theirs)}`,
        );
      }
    };
    table("Leader rested", engine.leaderRested, sim.leader.rested);
    table("Leader DON!!", engine.leaderAttachedDon.length, sim.leader.don);
    table(
      "Characters",
      sorted(
        engine.board.map((card) =>
          fieldKey({ ...card, don: card.attachedDon?.length ?? 0 }),
        ),
      ),
      sorted(sim.characters.map(fieldKey)),
    );
    table(
      "Stage",
      engine.stage
        ? `${engine.stage.cardNumber}${engine.stage.rested ? " rested" : ""}`
        : null,
      sim.stage
        ? `${sim.stage.cardNumber}${sim.stage.rested ? " rested" : ""}`
        : null,
    );
    table("trash", sorted(numbers(engine.trash)), sorted(numbers(sim.trash)));
    // The engine deals each player one DON!! at setup and counts it as the
    // first of their first DON!! Phase (`placeDonForTurn`); a table shows it
    // only once that phase has happened.
    const preplaced =
      state.phase === "mulligan" ||
      (state.turn === 1 && player !== state.turnPlayerId)
        ? 1
        : 0;
    table("active DON!!", engine.activeDon.length - preplaced, sim.don.active);
    table("rested DON!!", engine.restedDon.length, sim.don.rested);
    table(
      "hand size",
      engine.hand.length,
      Array.isArray(sim.hand) ? sim.hand.length : sim.hand,
    );
    table("deck size", deck.length, sim.deckCount);
    table("Life", life.length, sim.life);

    const hidden = (what: string, ours: string[], theirs: string[]): void => {
      if (!sameList(ours, theirs)) {
        result.hidden[player].push(
          `${player} ${what}: engine ${JSON.stringify(ours)}, sim ${JSON.stringify(theirs)}`,
        );
      }
    };
    if (Array.isArray(sim.hand)) {
      hidden("hand", sorted(numbers(engine.hand)), sorted(numbers(sim.hand)));
    }
    if (sim.deck) hidden("deck", numbers(deck), numbers(sim.deck));
    if (sim.lifeCards) {
      hidden("Life cards", numbers(life), numbers(sim.lifeCards));
    }

    const power = (
      name: string,
      instanceId: string,
      shown: number | undefined,
    ): void => {
      if (shown === undefined) return;
      const ours = currentPower(
        state,
        player,
        instanceId,
        donPowerApplies(state, player),
      );
      if (ours !== shown) {
        result.notes.push(
          `${player} ${name} power: engine ${ours}, sim ${shown}`,
        );
      }
    };
    power(
      `Leader ${engine.leaderCardNumber}`,
      `${player}-leader`,
      sim.leader.power,
    );
    const shown = [...sim.characters];
    for (const card of engine.board) {
      const key = fieldKey({ ...card, don: card.attachedDon?.length ?? 0 });
      const index = shown.findIndex((theirs) => fieldKey(theirs) === key);
      if (index < 0) continue;
      power(card.cardNumber, card.instanceId, shown.splice(index, 1)[0]!.power);
    }
  }
  return result;
}

/**
 * Engine instance ids to the sim's card ids. Two copies of a card in the same
 * place are the same card to both games, so cards are paired zone by zone on
 * what tells them apart there; whatever is left is paired by owner and number
 * alone, which is how a card an effect is holding -- in neither game's zones
 * for the moment -- still gets a name.
 */
function pairCards(
  state: GameState,
  snapshot: TableSnapshot,
): Map<string, string> {
  const ids = new Map<string, string>();
  for (const player of SEATS) {
    const engine = state.players[player];
    const sim = snapshot.players[player];
    ids.set(`${player}-leader`, sim.leader.id);
    const unpaired: { instanceId: string; cardNumber: string }[] = [];
    const loose: { id: string; cardNumber: string }[] = [];
    const pair = <E extends { instanceId: string; cardNumber: string }>(
      ours: readonly E[],
      theirs: readonly { id: string; cardNumber: string }[],
      key: (card: E) => string = (card) => card.cardNumber,
      theirKey: (index: number) => string = (index) =>
        theirs[index]!.cardNumber,
    ): void => {
      const left = theirs.map((card, index) => ({
        card,
        key: theirKey(index),
      }));
      for (const card of ours) {
        const index = left.findIndex((entry) => entry.key === key(card));
        if (index < 0) unpaired.push(card);
        else ids.set(card.instanceId, left.splice(index, 1)[0]!.card.id);
      }
      loose.push(...left.map((entry) => entry.card));
    };
    pair(
      engine.board,
      sim.characters,
      (card) => fieldKey({ ...card, don: card.attachedDon?.length ?? 0 }),
      (index) => fieldKey(sim.characters[index]!),
    );
    pair(engine.stage ? [engine.stage] : [], sim.stage ? [sim.stage] : []);
    pair(engine.hand, Array.isArray(sim.hand) ? sim.hand : []);
    pair(engine.trash, sim.trash);
    const { deck, life } = piles(state, player, sim.life);
    pair(deck, sim.deck ?? []);
    pair(life, sim.lifeCards ?? []);
    if (snapshot.seat === player) {
      if (snapshot.step.kind === "effect")
        loose.push(...snapshot.step.revealed);
      if (snapshot.step.kind === "trigger" && snapshot.step.card) {
        loose.push(snapshot.step.card);
      }
    }
    for (const card of unpaired) {
      const index = loose.findIndex(
        (theirs) => theirs.cardNumber === card.cardNumber,
      );
      if (index >= 0) ids.set(card.instanceId, loose.splice(index, 1)[0]!.id);
    }
  }
  return ids;
}

/** The card number of every card the snapshot names, by the sim's id. */
function simCardNumbers(snapshot: TableSnapshot): Map<string, string> {
  const result = new Map<string, string>();
  const add = (card: { id: string; cardNumber: string } | null): void => {
    if (card) result.set(card.id, card.cardNumber);
  };
  for (const player of SEATS) {
    const side = snapshot.players[player];
    add(side.leader);
    add(side.stage);
    for (const zone of [
      Array.isArray(side.hand) ? side.hand : [],
      side.characters,
      side.trash,
      side.deck ?? [],
      side.lifeCards ?? [],
    ]) {
      zone.forEach(add);
    }
  }
  if (snapshot.step.kind === "effect") snapshot.step.revealed.forEach(add);
  if (snapshot.step.kind === "trigger") add(snapshot.step.card ?? null);
  return result;
}

/**
 * An action by what it does, without the instance ids its `actionId` holds or
 * the numbers its summary goes on to quote: the name a move keeps when the
 * engine's game is rebuilt around it.
 */
function moveName(action: LegalAction): string {
  const cut = action.summary.indexOf(" (");
  return cut > 0 ? action.summary.slice(0, cut) : action.summary;
}

/** Where each card the snapshot names is, by the sim's id. */
function simCardPlaces(
  snapshot: TableSnapshot,
): Map<string, { cardNumber: string; owner: PlayerId; zone: string }> {
  const result = new Map<
    string,
    { cardNumber: string; owner: PlayerId; zone: string }
  >();
  for (const owner of SEATS) {
    const side = snapshot.players[owner];
    const add = (
      zone: string,
      cards: readonly ({ id: string; cardNumber: string } | null)[],
    ): void => {
      for (const card of cards) {
        if (card)
          result.set(card.id, { cardNumber: card.cardNumber, owner, zone });
      }
    };
    add("leader", [side.leader]);
    add("stage", [side.stage]);
    add("hand", Array.isArray(side.hand) ? side.hand : []);
    add("board", side.characters);
    add("trash", side.trash);
    add("deck", side.deck ?? []);
    add("life", side.lifeCards ?? []);
  }
  if (snapshot.step.kind === "effect") {
    for (const card of snapshot.step.revealed) {
      if (!result.has(card.id)) {
        result.set(card.id, {
          cardNumber: card.cardNumber,
          owner: snapshot.seat,
          zone: "revealed",
        });
      }
    }
  }
  return result;
}

/** Every order of `items`. */
function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [[...items]];
  return items.flatMap((item, index) =>
    permutations([...items.slice(0, index), ...items.slice(index + 1)]).map(
      (rest) => [item, ...rest],
    ),
  );
}

/**
 * Every way to take one offer. An ordering is offered once and taken with any
 * order of its cards, and on a "top or bottom" placement at either end.
 */
function waysToTake(
  offer: LegalAction,
  offered: readonly LegalAction[],
): LegalAction[] {
  if (offer.type !== "resolve-effect" || offer.option.kind !== "order") {
    return [offer];
  }
  const cut = offer.actionId.lastIndexOf(":");
  const [list = "", split] = offer.actionId.slice(cut + 1).split("|");
  const indices = list.split(",");
  // 120 orders of five cards is the most a look at the top of a deck asks for.
  if (indices.length > 5) return [offer];
  const ends = split === undefined ? [""] : ["|0", `|${indices.length}`];
  return permutations(indices).flatMap((order) =>
    ends.flatMap((end) => {
      const taken = findOfferedAction(
        offered,
        `${offer.actionId.slice(0, cut + 1)}${order.join(",")}${end}`,
      );
      return taken ? [taken] : [];
    }),
  );
}

function apply(state: GameState, action: LegalAction): GameState {
  return applyOfferedAction(state, toGameAction(action, state.revision), action)
    .state;
}

interface Config {
  decks: Record<PlayerId, { leader: string; cards: Record<string, number> }>;
  match: MatchConfig;
}

/** The catalog deck with exactly this list, so the record names a deck people know. */
function catalogDeck(deck: {
  leader: string;
  cards: Record<string, number>;
}): string | undefined {
  const key = JSON.stringify(Object.entries(deck.cards).sort());
  return Object.entries(deckManifests).find(
    ([, manifest]) =>
      manifest.leader === deck.leader &&
      JSON.stringify(Object.entries(manifest.cards).sort()) === key,
  )?.[0];
}

export class ShadowGame {
  readonly #choose: Chooser;
  /** The seat a person plays, when one does. */
  readonly #person: PlayerId | undefined;
  readonly #config: Config;
  #orders: Record<PlayerId, string[][]> = { p1: [], p2: [] };
  #actions: string[] = [];
  #state: GameState;
  /** A target the last action named, which the sim asks for as its own prompt. */
  #namedTargets: string[] = [];
  /**
   * The engine is at a choice the sim was left to make its own way (see
   * `decide`), so which answer it gave is still to be read off the table.
   */
  #leftToTheSim = false;
  /**
   * The game as it stood before the last decision, and the action that
   * decision took first: what a move the sim refuses is taken back to.
   */
  #before:
    | {
        state: GameState;
        actions: number;
        orders: Record<PlayerId, string[][]>;
        took?: string;
      }
    | undefined;
  /** Actions the sim has refused at the decision it is on. */
  readonly #refused = new Set<string>();
  #refusedOnTurn = 0;
  /** The last action taken at a table decision, as `moveName` names it. */
  #lastTableMove: string | undefined;
  readonly plays: Play[] = [];
  /**
   * The person's decision the engine's game could not be brought up to, while
   * it is still behind: where to look when the record ends soon after.
   */
  unfollowed:
    | {
        turn: number;
        step: SimStep["kind"];
        why: string;
        differences: readonly string[];
      }
    | undefined;
  /**
   * Every place the engine's game has parted from the sim's. The first ends
   * the record: a game this engine loads cannot contain a ruling it would
   * not make. The game itself goes on -- the engine's copy is set to the
   * sim's table (`#reanchor`) and followed from there -- so one game can
   * find several.
   */
  readonly divergences: Divergence[] = [];
  /** The record as it stood at the first divergence, which is where it ends. */
  #recorded:
    { actions: string[]; orders: Record<PlayerId, string[][]> } | undefined;
  /** How the sim's game ended, once it has. */
  ended:
    { winner: PlayerId | null; agrees: boolean; detail: string } | undefined;

  constructor(first: TableSnapshot, choose: Chooser, seed: string) {
    const snapshot = normalized(first);
    this.#choose = choose;
    this.#person = snapshot.person;
    const decks = {
      p1: deckOf(snapshot.players.p1),
      p2: deckOf(snapshot.players.p2),
    };
    const named = (player: PlayerId): Partial<MatchConfig> => {
      const id = catalogDeck(decks[player]);
      const manifest: DeckManifest = {
        id: `OPTCGSim list - ${decks[player].leader}`,
        leader: decks[player].leader,
        cards: decks[player].cards,
        format: "extra",
      };
      return id
        ? { [`${player}Deck`]: id }
        : { [`${player}Deck`]: manifest.id, [`${player}CustomDeck`]: manifest };
    };
    this.#config = {
      decks,
      match: {
        ...(named("p1") as Pick<MatchConfig, "p1Deck">),
        ...(named("p2") as Pick<MatchConfig, "p2Deck">),
        p1Controller: "scorer",
        p2Controller: "scorer",
        seed,
        startingPlayer:
          snapshot.first ??
          (snapshot.turn % 2 === 1
            ? snapshot.turnPlayer
            : other(snapshot.turnPlayer)),
      },
    };
    this.#state = this.#replay(this.#orders, []);
  }

  /** The first place the games parted, where the record ends. */
  get divergence(): Divergence | undefined {
    return this.divergences[0];
  }

  /** Engine actions in the record. */
  get actionCount(): number {
    return (this.#recorded?.actions ?? this.#actions).length;
  }

  /** The record so far, as a match this engine loads. */
  match(): MatchConfig & { recordedShuffles: Record<PlayerId, string[][]> } {
    return {
      ...this.#config.match,
      recordedShuffles: this.#recorded?.orders ?? this.#orders,
    };
  }

  #part(divergence: Omit<Divergence, "afterPlay" | "at">): void {
    this.#recorded ??= { actions: [...this.#actions], orders: this.#orders };
    this.divergences.push({
      afterPlay: this.plays.length,
      at: this.#actions.length,
      ...divergence,
    });
  }

  /**
   * Sets the engine's game to the sim's table, as `position.ts` rebuilds it:
   * what lets a game go on past a ruling the two engines make differently.
   * What a snapshot cannot say -- a once-per-turn already spent, a keyword
   * gained -- is lost at that point and kept from then on.
   */
  #reanchor(simSnapshot: TableSnapshot): boolean {
    try {
      this.#state = importPosition(simSnapshot).state;
    } catch {
      return false;
    }
    this.#before = undefined;
    this.#leftToTheSim = false;
    this.#namedTargets = [];
    return true;
  }

  /** The record as the diagnostics JSONL the app and the trace tools read. */
  trace(exportedAt: string): string {
    const controller = BrowserGameController.load({
      version: 1,
      config: this.match(),
      actions: this.#recorded?.actions ?? this.#actions,
      rules: rulesStamp(),
    });
    return buildDiagnosticsJsonl({
      trace: controller.trace(),
      llmRecords: [],
      exportedAt,
    });
  }

  #replay(
    orders: Record<PlayerId, string[][]>,
    actionIds: readonly string[],
  ): GameState {
    let state = createGame({
      gameId: "optcgsim",
      ...resolveMatchDecks({ ...this.#config.match, recordedShuffles: orders }),
      seed: this.#config.match.seed,
      startingPlayer: this.#config.match.startingPlayer,
      // Both lists, even when empty: it is what has the engine keep how each
      // shuffle came out, which a later order is worked out from.
      recordedShuffles: orders,
    });
    for (const id of actionIds) {
      const action = findOfferedAction(
        getLegalActions(state, state.activePlayer),
        id,
      );
      if (!action) throw new Error(`${id} is not legal on replay`);
      state = apply(state, action);
    }
    return state;
  }

  /**
   * One decision of the sim's game. Where the engine's game turns out not to
   * be the sim's, that is noted (`divergences`), the engine's game is set to
   * the sim's table, and the decision is made from there. Undefined only
   * when even that position cannot be decided from.
   */
  async decide(simSnapshot: TableSnapshot): Promise<ShadowResult | undefined> {
    const parted = this.divergences.length;
    const decided = await this.#decide(simSnapshot);
    if (decided || this.divergences.length === parted) return decided;
    if (!this.#reanchor(simSnapshot)) return undefined;
    const again = this.divergences.length;
    const second = await this.#decide(simSnapshot);
    // The same decision parting twice says nothing new the second time.
    this.divergences.length = again;
    return second;
  }

  async #decide(simSnapshot: TableSnapshot): Promise<ShadowResult | undefined> {
    const snapshot = normalized(simSnapshot);
    const step = snapshot.step;
    // A move the sim did not take is taken back here too, and the decision
    // made again without it: the two engines disagree on whether it was
    // legal, which the play-by-play notes, and the game goes on.
    // What the sim refuses it refuses for the turn: the list is kept until
    // the turn changes, so two refused moves cannot be offered in rotation.
    if (snapshot.turn !== this.#refusedOnTurn) {
      this.#refused.clear();
      this.#refusedOnTurn = snapshot.turn;
    }
    if (snapshot.refused) {
      if (this.#before?.took !== undefined) {
        // The move this decision was last answered with.
        this.#state = this.#before.state;
        this.#actions.length = this.#before.actions;
        this.#orders = this.#before.orders;
        this.#refused.add(this.#before.took);
      } else if (this.#lastTableMove !== undefined) {
        // A move whose effect the sim then backed out of, leaving the table
        // where it was before the move: the engine's game goes back there
        // too.
        this.#refused.add(this.#lastTableMove);
        this.#reanchor(simSnapshot);
      }
      const last = this.plays[this.plays.length - 1];
      if (last) {
        last.notes = [...(last.notes ?? []), "the sim refused this move"];
      }
    }
    const at = this.#actions.length;
    const part = (
      why: string,
      found: readonly string[] = [],
    ): ShadowResult | undefined => {
      this.#part({
        turn: snapshot.turn,
        seat: snapshot.seat,
        step: step.kind,
        why,
        differences: [...found],
      });
      return undefined;
    };
    const play = (
      result: ShadowResult,
      actions: string[],
      notes: string[] = [],
    ): ShadowResult => {
      this.plays.push({
        at,
        turn: snapshot.turn,
        seat: snapshot.seat,
        step: step.kind,
        actions,
        move: result.move,
        ...(result.value === undefined ? {} : { value: result.value }),
        ...(notes.length > 0 ? { notes } : {}),
      });
      return result;
    };

    let notes: string[] = [];
    // A person's moves can lead straight into a prompt of the model's -- an
    // attack that K.O.s its Character, a hit on its Life -- with no table
    // decision of the model's in between to catch the engine's game up at.
    if (
      snapshot.person &&
      (step.kind === "effect" || step.kind === "trigger") &&
      awaits(this.#state).seat !== snapshot.seat
    ) {
      this.#reconcile(snapshot, "decision");
    }
    if (step.kind === "effect") {
      if (this.#leftToTheSim) this.#catchUpInsideEffect(snapshot, step);
      const waiting = awaits(this.#state);
      if (waiting.kind !== "effect" || waiting.seat !== snapshot.seat) {
        // A prompt the last answer did not move is given the next one: each
        // card it offers in turn, then its Cancel.
        const repeat = snapshot.repeat ?? 0;
        if (repeat > 0) {
          const offered = step.candidates;
          // A question asked with buttons can be asked in stages that look
          // the same from here, so each button is pressed twice before the
          // next is tried.
          const asked = (snapshot.buttons ?? []).filter(
            (name) => name !== "Cancel",
          );
          const press = Math.floor((repeat - 1) / 2);
          const move: SimMove =
            repeat <= offered.length
              ? { kind: "choose", cards: [offered[repeat - 1]!] }
              : offered.length === 0 && press < asked.length
                ? {
                    kind: "choose",
                    cards: [],
                    button: `${asked[press]!}#${asked.slice(0, press + 1).filter((name) => name === asked[press]).length}`,
                  }
                : { kind: "choose", cards: [], button: "Cancel" };
          return play(
            { move, summary: "the sim's own prompt, again", offered: [] },
            [],
          );
        }
        const answer = this.#ownPrompt(snapshot, step);
        if (!answer) {
          return part(
            `the sim asks ${snapshot.seat} to choose among ${step.candidates.length} cards for an effect, and the engine is waiting on ${waiting.seat}'s ${waiting.kind}`,
          );
        }
        this.#namedTargets = [];
        return play(
          {
            move: { kind: "choose", ...answer },
            summary: "the sim's own prompt",
            offered: [],
          },
          [],
        );
      }
    } else if (step.kind === "trigger") {
      // The hit Life card is in neither game's zones while its [Trigger] is
      // decided, so the tables are compared again at the next step instead.
      const waiting = awaits(this.#state);
      if (waiting.kind !== "trigger" || waiting.seat !== snapshot.seat) {
        return part(
          `the sim offers ${snapshot.seat} a [Trigger]${step.card ? ` (${step.card.cardNumber})` : ""}, and the engine is waiting on ${waiting.seat}'s ${waiting.kind}`,
        );
      }
    } else {
      const reconciled = this.#reconcile(snapshot);
      if ("why" in reconciled) return part(reconciled.why, reconciled.found);
      if (reconciled.answer) {
        return play(
          {
            move: reconciled.answer,
            summary: "the sim's own step",
            offered: [],
          },
          [],
          reconciled.notes,
        );
      }
      notes = reconciled.notes;
    }
    this.#namedTargets = [];
    this.#leftToTheSim = false;

    this.#before = {
      state: this.#state,
      actions: this.#actions.length,
      orders: this.#orders,
    };
    const ids = pairCards(this.#state, snapshot);
    const applied: string[] = [];
    const take = (action: LegalAction): void => {
      if (this.#before) this.#before.took ??= moveName(action);
      if (
        action.type !== "resolve-effect" &&
        action.type !== "resolve-trigger"
      ) {
        this.#lastTableMove = moveName(action);
      }
      this.#state = apply(this.#state, action);
      this.#actions.push(action.actionId);
      applied.push(action.summary);
    };
    /** The first of these sim buttons the prompt is showing. */
    const shown = (...names: string[]): string | undefined =>
      names.find((name) => snapshot.buttons?.includes(name));
    /** The "choose one" button whose text says `word`, as `V3Choice#n`. */
    const labelled = (word: string): string | undefined => {
      let nth = 0;
      for (const [index, name] of (snapshot.buttons ?? []).entries()) {
        if (name !== "V3Choice") continue;
        nth += 1;
        if (
          (snapshot.labels?.[index] ?? "")
            .toLowerCase()
            .includes(word.toLowerCase())
        ) {
          return `V3Choice#${nth}`;
        }
      }
      return undefined;
    };
    const simId = (instanceId: string | undefined): string | undefined =>
      instanceId === undefined ? undefined : ids.get(instanceId);

    /**
     * The sim's card for one an effect option names, among those the sim
     * offers. Two copies of a card are one card to both games, and a card the
     * effect is holding is in no zone to be paired from, so a card the
     * pairing did not land on is named by number -- in the same player's
     * same zone, since a hand and a board can hold the same card.
     */
    const places = simCardPlaces(snapshot);
    const simCard = (option: {
      owner: "self" | "opponent";
      zone: string;
      card: { instanceId: string; cardNumber: string };
    }): string | undefined => {
      if (step.kind !== "effect") return undefined;
      const paired = simId(option.card.instanceId);
      if (paired !== undefined && step.candidates.includes(paired)) {
        return paired;
      }
      const owner =
        option.owner === "self" ? snapshot.seat : other(snapshot.seat);
      const fromDeck = (zone: string): boolean =>
        zone === "deck" || zone === "revealed";
      return step.candidates.find((candidate) => {
        const place = places.get(candidate);
        return (
          place !== undefined &&
          place.cardNumber === option.card.cardNumber &&
          place.owner === owner &&
          (place.zone === option.zone ||
            (fromDeck(place.zone) && fromDeck(option.zone)))
        );
      });
    };

    const lifeButton = (option: {
      owner: "self" | "opponent";
      zone: string;
      card: { instanceId: string };
    }): string | undefined => {
      if (option.zone !== "life") return undefined;
      const owner =
        option.owner === "self" ? snapshot.seat : other(snapshot.seat);
      const life = this.#state.players[owner].life;
      const at = life.findIndex(
        (card) => card.instanceId === option.card.instanceId,
      );
      if (at < 0) return undefined;
      return at === 0
        ? labelled("top")
        : at === life.length - 1
          ? labelled("bottom")
          : undefined;
    };

    // A table decision is one engine action; a choice inside an effect can be
    // several, when the engine asks first whether and then which.
    for (let depth = 0; depth < 6; depth++) {
      // The engine's effect can finish on an answer -- "activate", with
      // nothing further to choose -- while the sim's prompt is still open
      // for something the engine settled by itself.
      if (
        depth > 0 &&
        step.kind === "effect" &&
        (awaits(this.#state).kind !== "effect" ||
          awaits(this.#state).seat !== snapshot.seat)
      ) {
        return play(
          {
            move: {
              kind: "choose",
              ...(this.#ownPrompt(snapshot, step) ?? { cards: [] }),
            },
            summary: applied[applied.length - 1] ?? "",
            offered: [],
          },
          applied,
          notes,
        );
      }
      const observation = observe(this.#state, snapshot.seat);
      const performableNow = observation.legalActions.filter(
        (action) =>
          performable(action, ids, this.#state) &&
          !this.#refused.has(moveName(action)),
      );
      // The two engines can disagree on which cards an effect may take. The
      // model is offered the cards both allow, so the game goes on, and the
      // ones only this engine allows are noted beside the play.
      const onlyHere =
        step.kind === "effect" && step.candidates.length > 0
          ? performableNow.filter(
              (action) =>
                action.type === "resolve-effect" &&
                action.option.kind === "card" &&
                simCard(action.option) === undefined &&
                lifeButton(action.option) === undefined,
            )
          : [];
      const offered =
        onlyHere.length > 0 && onlyHere.length < performableNow.length
          ? performableNow.filter((action) => !onlyHere.includes(action))
          : performableNow;
      if (offered !== performableNow) {
        notes = [
          ...notes,
          `the sim does not offer ${onlyHere.map((action) => action.summary).join(", ")}`,
        ];
      }
      // None of the cards the engine is choosing among is one the sim offers:
      // the sim is asking something else first -- which card a Counter is
      // for, before the cost the engine has moved on to. That prompt is
      // answered, and the engine's choice waits for the sim to reach it.
      // Likewise when the sim's prompt belongs to another card than the
      // effect the engine is in: two effects answering one attack, taken in
      // a different order.
      const engineSource = performableNow.find(
        (action) => action.type === "resolve-effect",
      );
      const otherCard =
        step.kind === "effect" &&
        step.sourceCard !== undefined &&
        engineSource?.type === "resolve-effect" &&
        engineSource.sourceCardNumber !== step.sourceCard;
      if (
        step.kind === "effect" &&
        (otherCard ||
          (onlyHere.length > 0 && onlyHere.length === performableNow.length))
      ) {
        const answer = this.#ownPrompt(snapshot, step);
        if (answer) {
          return play(
            {
              move: { kind: "choose", ...answer },
              summary: "the sim's own prompt",
              offered: [],
            },
            applied,
            notes,
          );
        }
      }
      if (offered.length === 0) {
        return part(
          `the engine offers ${snapshot.seat} nothing the sim can be told to do`,
          observation.legalActions.map((action) => action.summary),
        );
      }
      const { action, value } = await this.#choose(
        { ...observation, legalActions: offered },
        this.#config.decks[snapshot.seat],
      );
      const result = (move: SimMove): ShadowResult =>
        play(
          {
            move,
            summary: action.summary,
            ...(value === undefined ? {} : { value }),
            offered: offered.map((entry) => entry.summary),
          },
          applied,
          notes,
        );

      if (action.type === "resolve-trigger") {
        if (step.kind !== "trigger") {
          return part(
            "the engine is deciding a [Trigger] the sim is not asking about",
          );
        }
        take(action);
        const target = simId(action.targetInstanceId);
        if (target) this.#namedTargets = [target];
        return result({
          kind: "trigger",
          activate: action.optionId !== "skip",
        });
      }
      if (action.type !== "resolve-effect") {
        const phase = this.#state.phase;
        take(action);
        const target =
          action.type === "activate-main" || action.type === "counter"
            ? simId(action.targetInstanceId)
            : undefined;
        if (target) this.#namedTargets = [target];
        return result(simMove(action, ids, phase));
      }

      if (step.kind !== "effect") {
        return part(
          `the engine is inside an effect of ${action.sourceCardNumber} and the sim is at ${snapshot.seat}'s ${step.kind}`,
        );
      }
      const option = action.option;
      switch (option.kind) {
        case "card": {
          // A Life card taken from the top or the bottom is asked for with
          // a button for each end.
          const end = lifeButton(option);
          if (end && simCard(option) === undefined) {
            take(action);
            return result({ kind: "choose", cards: [], button: end });
          }
          const id = simCard(option);
          if (!id) {
            return part(
              `the engine chose ${option.card.cardNumber} for ${action.sourceCardNumber}, which the sim does not offer`,
              [`the sim offers ${step.candidates.length} cards`],
            );
          }
          take(action);
          return result({ kind: "choose", cards: [id] });
        }
        case "skip": {
          take(action);
          // "Cancel" is how the sim passes on an optional effect it has
          // already opened.
          const button = shown(
            "PlayWithNoEffect",
            "DrawNone",
            "NoMill",
            "Cancel",
          );
          return result({
            kind: "choose",
            cards: [],
            decline: true,
            ...(button ? { button } : {}),
          });
        }
        case "confirm": {
          take(action);
          if (option.choice === "done") {
            return result({ kind: "choose", cards: [] });
          }
          // "Activate" or "apply" is a question of its own when the sim asks
          // it with a button; otherwise it opens the effect the sim is
          // already showing the targets of, and the next engine choice
          // answers that.
          const button = shown("UseOnPlay", "UseV3OnPlay");
          if (!button || step.candidates.length > 0) continue;
          return result({ kind: "choose", cards: [], button });
        }
        case "position": {
          const button =
            (option.position === "top"
              ? shown("MoveToTop", "TopDeckToTop", "AddTopLife", "TakeTopLife")
              : shown(
                  "MoveToBottom",
                  "TopDeckToBottom",
                  "AddBottomLife",
                  "TakeBottomLife",
                )) ?? labelled(option.position);
          if (button) {
            take(action);
            return result({ kind: "choose", cards: [], button });
          }
          this.#leftToTheSim = true;
          return result({ kind: "choose", cards: [] });
        }
        default:
          // An order to put cards back in, a position, which resource pays:
          // the sim asks these its own way, or not at all, and the plugin
          // confirms whatever its prompt starts on. The engine's answer is
          // left open and read off the table at a later snapshot
          // (`#reconcile`), which is also what keeps the record the sim's
          // game rather than the model's preference.
          // Where the sim's prompt is one this side can answer anyway --
          // DON!! to pay with, a look at the deck to close -- it is.
          this.#leftToTheSim = true;
          return result({
            kind: "choose",
            ...(this.#ownPrompt(snapshot, step) ?? { cards: [] }),
          });
      }
    }
    return part("one prompt of the sim took more than six engine choices");
  }

  /**
   * The answer to a prompt of the sim's the engine does not stop for, or
   * undefined when it is a choice among cards the engine has no say in:
   * closing a look at the deck, the target the engine's own action named,
   * the card being attacked for a Counter, DON!! to pay with, the only card
   * offered, or nothing where the sim lets a selection be confirmed empty.
   */
  #ownPrompt(
    snapshot: TableSnapshot,
    step: Extract<SimStep, { kind: "effect" }>,
  ): { cards: string[]; button?: string } | undefined {
    const buttons = snapshot.buttons ?? [];
    const shows = (name: string): boolean => buttons.includes(name);
    const cards = (...ids: string[]): { cards: string[] } => ({ cards: ids });
    if (shows("FinalizeTopDeck")) return cards();
    // "Choose one", asked with a button per answer. The engine does not stop
    // for an "up to N" it can take in full, so the answer it has already
    // given is the largest number on offer; where the buttons are not
    // numbers, the last is the one that is not "none".
    const choices = buttons.flatMap((name, index) =>
      name === "V3Choice" ? [snapshot.labels?.[index] ?? ""] : [],
    );
    if (choices.length > 0) {
      const amounts = choices.map((label) => {
        const number = /\d+/.exec(label);
        return number ? Number(number[0]) : Number.NaN;
      });
      const pick = amounts.every((amount) => Number.isFinite(amount))
        ? amounts.indexOf(Math.max(...amounts))
        : choices.length - 1;
      return { cards: [], button: `V3Choice#${pick + 1}` };
    }
    // An effect the engine applied without asking is one it has to apply.
    const use = ["UseV3OnPlay", "UseOnPlay"].find(shows);
    if (use && step.candidates.length === 0) return { cards: [], button: use };
    const named = this.#namedTargets.find((id) => step.candidates.includes(id));
    if (named) return cards(named);
    const attack = this.#state.activeAttack;
    if (attack) {
      const target = pairCards(this.#state, snapshot).get(
        attack.targetInstanceId,
      );
      if (target && step.candidates.includes(target)) return cards(target);
    }
    // DON!! cards are not cards of either deck, so the snapshot does not
    // name them; the sim offers them rested first.
    const numberOfSimCard = simCardNumbers(snapshot);
    if (
      step.candidates.length > 0 &&
      step.candidates.every((id) => !numberOfSimCard.has(id))
    ) {
      return cards(...step.candidates.slice(0, Math.max(1, step.remaining)));
    }
    if (step.candidates.length <= 1) return cards(...step.candidates);
    if (buttons.some((name) => /^Select|^Confirm/.test(name))) return cards();
    return undefined;
  }

  /**
   * The sim has moved on to a further prompt of an effect while the engine is
   * still at a choice that was left to it. The engine's choice is given the
   * answer after which it offers the cards the sim now does -- preferring one
   * that also leaves the tables equal -- and stays open when none does.
   */
  #catchUpInsideEffect(
    snapshot: TableSnapshot,
    step: Extract<SimStep, { kind: "effect" }>,
  ): void {
    const numberOfSimCard = simCardNumbers(snapshot);
    const wanted = sorted(
      step.candidates.map((id) => numberOfSimCard.get(id) ?? id),
    );
    const offersThem = (state: GameState): boolean => {
      const waiting = awaits(state);
      if (waiting.kind !== "effect" || waiting.seat !== snapshot.seat) {
        return false;
      }
      const offered = getLegalActions(state, snapshot.seat).flatMap((offer) =>
        offer.type === "resolve-effect" && offer.option.kind === "card"
          ? [offer.option.card.cardNumber]
          : [],
      );
      return sameList(sorted(offered), wanted);
    };
    if (offersThem(this.#state)) return;
    interface Node {
      state: GameState;
      path: LegalAction[];
    }
    const queue: Node[] = [{ state: this.#state, path: [] }];
    let fallback: Node | undefined;
    for (let visited = 0; queue.length > 0 && visited < 600; visited++) {
      const node = queue.shift()!;
      if (node.path.length > 0 && offersThem(node.state)) {
        if (differences(node.state, snapshot).table.length === 0) {
          this.#adopt(node);
          return;
        }
        fallback ??= node;
      }
      if (node.path.length >= 3 || !node.state.pendingEffect) continue;
      const offered = getLegalActions(node.state, node.state.activePlayer);
      for (const offer of offered) {
        for (const action of waysToTake(offer, offered)) {
          try {
            queue.push({
              state: apply(node.state, action),
              path: [...node.path, action],
            });
          } catch {
            // An order the engine refuses is not one the sim took.
          }
        }
      }
    }
    if (fallback) this.#adopt(fallback);
  }

  #adopt(node: { state: GameState; path: LegalAction[] }): void {
    this.#state = node.state;
    this.#actions.push(...node.path.map((action) => action.actionId));
  }

  /**
   * Brings the engine's game to the decision the snapshot shows. It may have
   * stopped short of it -- at a choice the sim made by itself, or an action
   * with one legal answer -- so those are searched for the answers that leave
   * the engine's table equal to the sim's; and a shuffle the engine drew from
   * its seed is redealt the way the sim's came out.
   */
  #reconcile(
    snapshot: TableSnapshot,
    /**
     * `decision` accepts the first game that is waiting on the snapshot's
     * decision, without comparing tables: for a prompt inside an effect,
     * where a card is in neither game's zones.
     */
    accept: "table" | "decision" = "table",
  ): { notes: string[]; answer?: SimMove } | { why: string; found: string[] } {
    interface Node {
      state: GameState;
      path: LegalAction[];
      /** Who took each action of `path`. */
      by: PlayerId[];
    }
    const numberOfSimCard = simCardNumbers(snapshot);
    const fits = (state: GameState): boolean => {
      const waiting = awaits(state);
      if (
        waiting.seat !== snapshot.seat ||
        waiting.kind !== snapshot.step.kind
      ) {
        return false;
      }
      // An attack is the same attack only with the same cards in it.
      const step = snapshot.step;
      const attack = state.activeAttack;
      if ((step.kind !== "block" && step.kind !== "counter") || !attack) {
        return true;
      }
      const numberOf = (player: PlayerId, instanceId: string): string =>
        instanceId === `${player}-leader`
          ? state.players[player].leaderCardNumber
          : (state.players[player].board.find(
              (card) => card.instanceId === instanceId,
            )?.cardNumber ?? "");
      return (
        numberOf(attack.attackerPlayerId, attack.attackerInstanceId) ===
          numberOfSimCard.get(step.attacker) &&
        numberOf(attack.defenderPlayerId, attack.targetInstanceId) ===
          numberOfSimCard.get(step.target)
      );
    };
    const adopt = (
      node: Node,
      notes: readonly string[],
    ): { notes: string[] } => {
      // A person's moves are plays of the game like the model's.
      const theirs = node.path.filter(
        (_, index) => node.by[index] === snapshot.person,
      );
      if (theirs.length > 0 && snapshot.person) {
        this.plays.push({
          at: this.#actions.length - node.path.length,
          turn: snapshot.turn,
          seat: snapshot.person,
          step: snapshot.step.kind,
          actions: theirs.map((action) => action.summary),
          by: "person",
        });
      }
      return {
        notes: [
          ...node.path
            .filter((_, index) => node.by[index] !== snapshot.person)
            .map(
              (action) =>
                `the engine stopped for "${action.summary}" and the sim did not`,
            ),
          ...notes,
        ],
      };
    };
    /** How the battle in progress differs, the way a power does. */
    const battleNotes = (state: GameState): string[] => {
      const step = snapshot.step;
      const attack = state.activeAttack;
      if (
        (step.kind !== "block" && step.kind !== "counter") ||
        !attack ||
        step.counterPower === undefined ||
        attack.counterPower === step.counterPower
      ) {
        return [];
      }
      return [
        `Counter power in this battle: engine ${attack.counterPower}, sim ${step.counterPower}`,
      ];
    };
    const queue: Node[] = [{ state: this.#state, path: [], by: [] }];
    let visited = 0;
    let sameTable: Node | undefined;
    let close:
      | {
          node: Node;
          dealt: { orders: Record<PlayerId, string[][]>; state: GameState };
          notes: string[];
        }
      | undefined;
    // A person can have made several moves since the last snapshot, each one
    // of many, so their game is searched wider and deeper than the answers
    // the sim gives by itself.
    const budget = snapshot.person ? 6000 : 600;
    const depth = snapshot.person ? 7 : 5;
    while (queue.length > 0 && visited < budget) {
      const node = queue.shift()!;
      visited += 1;
      if (accept === "decision") {
        if (fits(node.state)) {
          this.#state = node.state;
          this.#actions.push(...node.path.map((action) => action.actionId));
          return adopt(node, []);
        }
      } else {
        // Two moves can leave the same cards in the same places -- a Counter
        // onto the Leader or onto the card being attacked -- and differ only
        // in the powers that result. So a game whose table matches but whose
        // powers do not is held while the other games as near are looked at,
        // and taken only when none of them matches those too.
        if (close && node.path.length > close.node.path.length) break;
        const found = differences(node.state, snapshot);
        if (found.table.length === 0) {
          sameTable ??= node;
          if (fits(node.state)) {
            const dealt = this.#dealAs(node, snapshot, found);
            if (dealt) {
              const notes = [...found.notes, ...battleNotes(node.state)];
              if (notes.length === 0) {
                close = { node, dealt, notes };
                break;
              }
              close ??= { node, dealt, notes };
            }
          }
        }
      }
      if (node.path.length >= depth) continue;
      const actor = node.state.activePlayer;
      const offered = getLegalActions(node.state, actor);
      // Only the answers the sim could have given without asking -- the one
      // legal action, the choices inside an effect, a [Trigger] it did not
      // offer -- and whatever a person at the table was free to do.
      if (
        offered.length !== 1 &&
        !node.state.pendingEffect &&
        node.state.phase !== "trigger" &&
        actor !== snapshot.person
      ) {
        continue;
      }
      for (const offer of offered) {
        for (const action of waysToTake(offer, offered)) {
          try {
            queue.push({
              state: apply(node.state, action),
              path: [...node.path, action],
              by: [...node.by, actor],
            });
          } catch {
            // An order the engine refuses is not one the sim took.
          }
        }
      }
    }
    if (close) {
      this.#orders = close.dealt.orders;
      this.#actions = [
        ...this.#actions,
        ...close.node.path.map((action) => action.actionId),
      ];
      this.#state = close.dealt.state;
      return adopt(close.node, close.notes);
    }
    if (accept === "decision") {
      const there = awaits(this.#state);
      return {
        why: `the sim is at ${snapshot.seat}'s ${snapshot.step.kind} and the engine at ${there.seat}'s ${there.kind}`,
        found: [],
      };
    }

    // The sim stops for a block when the engine, with no [Blocker] to offer,
    // has already moved on to the Counter step of the same attack.
    const waiting = awaits(this.#state);
    const found = differences(this.#state, snapshot);
    if (
      snapshot.step.kind === "block" &&
      waiting.kind === "counter" &&
      waiting.seat === snapshot.seat &&
      found.table.length === 0
    ) {
      return { notes: found.notes, answer: { kind: "no-block" } };
    }
    const where = sameTable ?? { state: this.#state };
    const there = awaits(where.state);
    const all = differences(where.state, snapshot);
    return {
      why:
        all.table.length > 0
          ? "the engine's table is not the sim's"
          : all.hidden.p1.length + all.hidden.p2.length > 0
            ? "the engine's hidden cards are not the sim's, and no shuffle explains it"
            : `the sim is at ${snapshot.seat}'s ${snapshot.step.kind} and the engine at ${there.seat}'s ${there.kind}`,
      found: [...all.table, ...all.hidden.p1, ...all.hidden.p2],
    };
  }

  /**
   * The game at `node` with its hidden cards in the sim's order, or undefined
   * when no recorded shuffle gets there. A player whose latest shuffle was
   * drawn from the seed has it redealt: each card that shuffle placed is
   * followed to where it is now, and the card the sim holds in that place is
   * recorded in its position.
   */
  #dealAs(
    node: { state: GameState; path: LegalAction[] },
    snapshot: TableSnapshot,
    found: Differences,
  ): { orders: Record<PlayerId, string[][]>; state: GameState } | undefined {
    if (found.hidden.p1.length + found.hidden.p2.length === 0) {
      return { orders: this.#orders, state: node.state };
    }
    const orders = { p1: [...this.#orders.p1], p2: [...this.#orders.p2] };
    for (const player of SEATS) {
      if (found.hidden[player].length === 0) continue;
      // A game set to the sim's table mid-way has no shuffles of its own to
      // redeal.
      const dealt = node.state.recordedShuffles?.dealt[player];
      if (!dealt) return undefined;
      if (dealt.length <= orders[player].length) return undefined;
      const engine = node.state.players[player];
      const sim = snapshot.players[player];
      const numberOf = new Map<string, string>();
      for (const card of [
        ...engine.hand,
        ...engine.deck,
        ...engine.life,
        ...engine.board,
        ...engine.trash,
        ...(engine.stage ? [engine.stage] : []),
      ]) {
        numberOf.set(card.instanceId, card.cardNumber);
      }
      // Shuffles before the latest keep the order they were dealt in: the
      // game matched the sim after them.
      while (orders[player].length < dealt.length - 1) {
        const earlier = dealt[orders[player].length]!;
        if (earlier.some((id) => !numberOf.has(id))) return undefined;
        orders[player].push(earlier.map((id) => numberOf.get(id)!));
      }
      const latest = dealt[dealt.length - 1]!;
      const shuffled = new Set(latest);
      const simHand = Array.isArray(sim.hand) ? numbers(sim.hand) : [];
      for (const card of engine.hand) {
        if (shuffled.has(card.instanceId)) continue;
        const index = simHand.indexOf(card.cardNumber);
        if (index < 0) return undefined;
        simHand.splice(index, 1);
      }
      const order: string[] = [];
      const { deck, life } = piles(node.state, player, sim.life);
      for (const id of latest) {
        const inDeck = deck.findIndex((card) => card.instanceId === id);
        const inLife = life.findIndex((card) => card.instanceId === id);
        const number =
          inDeck >= 0
            ? sim.deck?.[inDeck]?.cardNumber
            : inLife >= 0
              ? sim.lifeCards?.[inLife]?.cardNumber
              : engine.hand.some((card) => card.instanceId === id)
                ? simHand.shift()
                : numberOf.get(id);
        if (number === undefined) return undefined;
        order.push(number);
      }
      const shuffledNumbers = latest.map((id) => numberOf.get(id) ?? "");
      if (!sameList(sorted(order), sorted(shuffledNumbers))) return undefined;
      orders[player].push(order);
    }
    let state: GameState;
    try {
      state = this.#replay(orders, [
        ...this.#actions,
        ...node.path.map((action) => action.actionId),
      ]);
    } catch {
      return undefined;
    }
    const after = differences(state, snapshot);
    return after.table.length +
      after.hidden.p1.length +
      after.hidden.p2.length ===
      0
      ? { orders, state }
      : undefined;
  }

  /**
   * A snapshot taken at a decision of the person's: the engine's game is
   * brought up to it, so each of their moves is found one at a time. A table
   * the search does not reach is left for a later snapshot -- two of their
   * clicks can land between snapshots -- and only a decision the model has to
   * make from a game that is not the sim's ends the record (`decide`).
   */
  follow(simSnapshot: TableSnapshot): boolean {
    const snapshot = normalized(simSnapshot);
    if (snapshot.step.kind === "effect" || snapshot.step.kind === "trigger") {
      return false;
    }
    const reconciled = this.#reconcile(snapshot);
    this.unfollowed =
      "why" in reconciled
        ? {
            turn: snapshot.turn,
            step: snapshot.step.kind,
            why: reconciled.why,
            differences: reconciled.found,
          }
        : undefined;
    return !this.unfollowed;
  }

  /**
   * The sim's game was given up before it ended -- it stopped moving -- which
   * ends the record where it stands.
   */
  abandon(why: string, snapshot?: TableSnapshot): void {
    this.#part({
      turn: snapshot?.turn ?? this.#state.turn,
      seat: snapshot?.seat ?? this.#state.activePlayer,
      step: snapshot?.step.kind ?? "main",
      why,
      differences: [],
    });
  }

  /** The sim's game is over; `winner` is who it says won. */
  finish(winner: PlayerId | null): void {
    // The last hit can leave the engine at an action with one answer, and a
    // person's last moves were never shown at a decision of theirs: the
    // engine's game is played on to the end the sim reached, when it is
    // within reach.
    if (!this.divergence && this.#state.phase !== "finished") {
      const queue: { state: GameState; path: LegalAction[] }[] = [
        { state: this.#state, path: [] },
      ];
      for (let visited = 0; queue.length > 0 && visited < 6000; visited++) {
        const node = queue.shift()!;
        if (node.state.phase === "finished") {
          if (node.state.winner !== winner) continue;
          this.#adopt(node);
          break;
        }
        if (node.path.length >= 7) continue;
        const actor = node.state.activePlayer;
        const offered = getLegalActions(node.state, actor);
        if (
          offered.length !== 1 &&
          !node.state.pendingEffect &&
          node.state.phase !== "trigger" &&
          actor !== this.#person
        ) {
          continue;
        }
        for (const action of offered) {
          try {
            queue.push({
              state: apply(node.state, action),
              path: [...node.path, action],
            });
          } catch {
            // Not a way the game ended.
          }
        }
      }
    }
    const ours =
      this.#state.phase === "finished" ? this.#state.winner : undefined;
    const agrees = !this.divergence && ours === winner;
    this.ended = {
      winner,
      agrees,
      detail: this.divergence
        ? "the engine's game had already parted from the sim's"
        : ours === undefined
          ? `the sim ended the game for ${winner ?? "nobody"}, and the engine's game is still at ${awaits(this.#state).seat}'s ${awaits(this.#state).kind}`
          : agrees
            ? `both games end with ${winner ?? "nobody"} winning (${this.#state.resultReason ?? "no reason"})`
            : `the sim's winner is ${winner ?? "nobody"} and the engine's is ${ours ?? "nobody"}`,
    };
  }
}

function deckOf(side: SimSide): {
  leader: string;
  cards: Record<string, number>;
} {
  if (!side.deckList) throw new Error("a recorded game needs both deck lists");
  return { leader: side.leader.cardNumber, cards: countCards(side.deckList) };
}

/**
 * Whether the plugin has clicks for an action. The model is only offered
 * these: in a game with no person at the table, a move nobody can perform
 * stops it.
 */
function performable(
  action: LegalAction,
  ids: ReadonlyMap<string, string>,
  state: GameState,
): boolean {
  if (action.type === "resolve-effect" || action.type === "resolve-trigger") {
    return true;
  }
  try {
    return simMove(action, ids, state.phase).kind !== "defer";
  } catch {
    return false;
  }
}

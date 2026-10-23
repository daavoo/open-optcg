/**
 * The DSL's read side: resolving a `CardSelector` to the cards it names, and
 * deciding a `MechanicCondition`. Both read the bindings a running program has
 * made so far, which is why they take the execution's bindings rather than a
 * bare state.
 */
import {
  cardAttributes,
  type CardDatabase,
  cardNames,
  cards as defaultCardDatabase,
  hasCardName,
  hasCardType,
  hasCardTypeIncluding,
} from "@one-piece-sim/cards";
import type { PlayerId } from "@one-piece-sim/protocol";
import type {
  BasePowerSetter,
  BoardCard,
  CardInstance,
  GameState,
} from "./model.js";
import { storedBasePower, withBasePowerSetter } from "./base-power.js";
import {
  canBeTargeted,
  currentPower,
  donPowerApplies,
  effectiveCost,
  isRested,
} from "./queries.js";
import {
  boardCardPower,
  cardBasePower,
  hasStaticKeyword,
  isRestImmune,
  type Keyword,
} from "./static-abilities.js";
import { DON_CARD_NUMBER, fieldDonCount } from "./don.js";
import {
  battleParticipant,
  battleTargetMatches,
  type CardSelector,
  type CardZone,
  leaderBattledCharacterKey,
  type MechanicCondition,
  type MechanicContext,
  type MechanicEffect,
  type MechanicExecution,
  type MechanicProgram,
  type PlayerRef,
} from "./mechanic-dsl.js";
import { effectSelectsNothing, whenRestedCards } from "./program-analysis.js";
import {
  findCardZone,
  findInstanceCardNumber,
  REMOVABLE_ZONES,
  resolvePlayer,
  SOURCE_BINDING,
  zoneCards,
} from "./mechanics.js";
import { opponentOf } from "./board.js";

/**
 * The attributes a board Character answers to, printed or granted.
 *
 * Attribute is otherwise read straight off the card database; a Character that
 * has been handed one for the turn (OP15-093) needs the board state folded in,
 * and every attribute question about a *board* card should ask here.
 */
export function boardCardAttributes(
  state: GameState,
  card: BoardCard,
  db: CardDatabase = defaultCardDatabase,
): readonly string[] {
  const granted =
    (card.grantedAttributes?.expiresAtTurn ?? -1) >= state.turn
      ? (card.grantedAttributes?.attributes ?? [])
      : [];
  return [...cardAttributes(db.require(card.cardNumber)), ...granted];
}

/** The Character a program's source noted earlier this turn, if it still holds. */
function rememberedTargetOf(
  state: GameState,
  context: MechanicContext,
): string | undefined {
  const source = state.players[context.sourcePlayerId].board.find(
    (card) => card.instanceId === context.source.instanceId,
  );
  const noted = source?.rememberedTarget;
  return noted && noted.turn === state.turn ? noted.instanceId : undefined;
}

/** The DON!! given to the card a binding names, for a per-DON!! multiplier. */
export function givenDonOfBinding(
  state: GameState,
  execution: MechanicExecution,
  binding: string,
): number {
  const instanceId = (execution.bindings[binding] ?? [])[0];
  if (instanceId === undefined) return 0;
  for (const playerId of ["p1", "p2"] as const) {
    const card = state.players[playerId].board.find(
      (candidate) => candidate.instanceId === instanceId,
    );
    if (card) return card.attachedDon?.length ?? 0;
  }
  return 0;
}

/** The printed cost of a binding's first card, wherever it sits; 0 without one. */
export function printedCostOfBinding(
  state: GameState,
  execution: MechanicExecution,
  binding: string,
  db: CardDatabase,
): number {
  const instanceId = (execution.bindings[binding] ?? [])[0];
  if (instanceId === undefined) return 0;
  const cardNumber = findInstanceCardNumber(state, instanceId);
  if (cardNumber === undefined) return 0;
  return db.require(cardNumber).cost ?? 0;
}

/**
 * Whether a `play` node's target is a Stage rather than a Character.
 *
 * Only OP12-080 Baratie prints a clause that plays one ("[Trigger] Play this
 * card"), and a Stage has its own area: it is bound by neither the
 * five-Character limit nor a "cannot play Character cards" restriction, and
 * playing one over an existing Stage trashes the old one.
 */
export function stagePlay(
  state: GameState,
  instanceId: string,
  context: MechanicContext,
  db: CardDatabase,
): boolean {
  const located = findCardZone(state, instanceId);
  if (!located) {
    // A Trigger's own card is held outside every zone while its program runs,
    // which is exactly the case OP12-080 Baratie's "[Trigger] Play this card"
    // reaches -- so the category comes off the source rather than off a zone.
    return (
      instanceId === context.source.instanceId &&
      db.get(context.source.cardNumber)?.category === "stage"
    );
  }
  const card = zoneCards(state, located.playerId, located.zone).find(
    (candidate) => candidate.instanceId === instanceId,
  );
  return card !== undefined && db.require(card.cardNumber).category === "stage";
}

/** Whether `instanceId` is an Event card sitting in a zone. */
export function eventPlay(
  state: GameState,
  instanceId: string,
  db: CardDatabase,
): boolean {
  const located = findCardZone(state, instanceId);
  if (!located) return false;
  const card = zoneCards(state, located.playerId, located.zone).find(
    (candidate) => candidate.instanceId === instanceId,
  );
  return card !== undefined && db.require(card.cardNumber).category === "event";
}

/**
 * Whether `card` has `keyword`, counting printed text, auras and turn-scoped
 * grants -- the same three sources `hasKeyword` in `engine.ts` folds.
 *
 * Duplicated rather than imported because `engine.ts` imports this module, and
 * the halves it needs are reachable from here: `hasStaticKeyword` for printed
 * text and auras, and the `BoardCard` flags for the grants. Keep the two in
 * step -- a keyword that grows a fourth source has to be taught to both.
 *
 * A Leader is not handled: no selector in the pool asks a Leader for a keyword,
 * and a Leader reached through `includeLeader` carries no `BoardCard` flags.
 */
function cardHasKeyword(
  state: GameState,
  playerId: PlayerId,
  card: CardInstance,
  keyword: Keyword,
  db: CardDatabase,
): boolean {
  if (!("rested" in card)) return false;
  const board = card as BoardCard;
  if (
    keyword === "Blocker" &&
    (board.blockerDisabledUntilTurn ?? -1) >= state.turn
  ) {
    return false;
  }
  const granted =
    keyword === "Blocker"
      ? (board.blockerUntilTurn ?? -1) >= state.turn
      : keyword === "Rush"
        ? (board.rushUntilTurn ?? -1) >= state.turn
        : keyword === "Rush: Character"
          ? (board.rushCharacterUntilTurn ?? -1) >= state.turn
          : keyword === "Unblockable"
            ? (board.unblockableUntilTurn ?? -1) >= state.turn
            : (board.doubleAttackUntilTurn ?? -1) >= state.turn;
  return granted || hasStaticKeyword(state, playerId, board, keyword, db);
}

/**
 * The card number of a bound instance, wherever on the table it now sits.
 *
 * `sameNameAsBinding` asks about a card the program has already moved -- the
 * cost EB02-039 trashed is in the trash by the time the payoff selects -- so
 * the lookup walks the zones rather than one of them.
 */
function boundCardNumber(
  state: GameState,
  instanceId: string,
): string | undefined {
  for (const playerId of ["p1", "p2"] as const) {
    for (const zone of REMOVABLE_ZONES) {
      const found = zoneCards(state, playerId, zone).find(
        (card) => card.instanceId === instanceId,
      );
      if (found) return found.cardNumber;
    }
  }
  return undefined;
}

export function selectCards(
  state: GameState,
  context: MechanicContext,
  selector: CardSelector,
  bindings: Record<string, string[]>,
  db: CardDatabase = defaultCardDatabase,
): CardInstance[] {
  // "1 Character", with no side named: both boards are eligible, and each side
  // is filtered as its own owner's -- which is what keeps `canBeTargeted`,
  // `canRest`'s rest-immunity question and `effectiveCost`'s controller-scoped
  // layers reading each card against the player who actually controls it. The
  // controller's own cards come first, the order every other selector presents.
  if (selector.player === "either") {
    // `limit` is dropped from each half and applied to the pair: a cap of one
    // over "1 Character" means one card in total, not one per side.
    const unlimited = { ...selector };
    delete unlimited.limit;
    const both = [
      ...selectCards(
        state,
        context,
        { ...unlimited, player: "self" },
        bindings,
        db,
      ),
      ...selectCards(
        state,
        context,
        { ...unlimited, player: "opponent" },
        bindings,
        db,
      ),
    ];
    return selector.limit === undefined ? both : both.slice(0, selector.limit);
  }
  const playerId = resolvePlayer(context, selector.player);
  const zones: readonly CardZone[] =
    typeof selector.zone === "string" ? [selector.zone] : selector.zone;
  const zoneOf = new Map<string, CardZone>();
  let cards = zones.flatMap((zone) =>
    zoneCards(state, playerId, zone).map((card) => {
      zoneOf.set(card.instanceId, zone);
      return card;
    }),
  );
  // A resolving [Trigger] card is parked in the trash while its effect is
  // still asking, but by the rules it gets there only once the effect has
  // resolved -- so its own effect cannot find it there: OP15-079 Absalom's
  // Trigger cannot return Absalom (Bandai's OP15-079#2).
  if (context.viaTrigger && zones.includes("trash")) {
    cards = cards.filter(
      (card) => card.instanceId !== context.source.instanceId,
    );
  }
  if (selector.includeLeader) {
    cards = [
      {
        instanceId: `${playerId}-leader`,
        cardNumber: state.players[playerId].leaderCardNumber,
      },
      ...cards,
    ];
  }
  if (selector.binding !== undefined) {
    // Before `position`, so "the top card of the ones you looked at" means the
    // first of them rather than the top of the whole zone.
    const bound = new Set(bindings[selector.binding] ?? []);
    cards = cards.filter((card) => bound.has(card.instanceId));
  }
  if (selector.excludeBinding !== undefined) {
    const chosen = new Set(bindings[selector.excludeBinding] ?? []);
    cards = cards.filter((card) => !chosen.has(card.instanceId));
  }
  if (selector.position === "top")
    cards = cards.slice(0, selector.positionCount ?? 1);
  if (selector.position === "bottom")
    cards = cards.slice(-(selector.positionCount ?? 1));
  if (selector.position === "edge" && cards.length > 1) {
    cards = [cards[0]!, cards.at(-1)!];
  }
  const matches = cards.filter((card) => {
    const definition = db.require(card.cardNumber);
    // Printed *and* granted attributes, so `attribute` and an `anyOf` branch
    // that names one cannot disagree about the same card. A board Character can
    // have been handed an attribute for the turn; a card in hand or deck has
    // only what it prints.
    const attributes =
      "rested" in card
        ? boardCardAttributes(state, card as BoardCard, db)
        : cardAttributes(definition);
    return (
      canBeTargeted(
        state,
        playerId,
        card,
        {
          ...(selector.category === undefined
            ? {}
            : { category: selector.category }),
          ...(selector.type === undefined ? {} : { type: selector.type }),
          ...(selector.maxCost === undefined
            ? {}
            : { maxCost: selector.maxCost }),
          ...(selector.minCost === undefined
            ? {}
            : { minCost: selector.minCost }),
          ...(selector.maxPower === undefined
            ? {}
            : { maxPower: selector.maxPower }),
          ...(selector.minPower === undefined
            ? {}
            : { minPower: selector.minPower }),
          ...(selector.maxCurrentPower === undefined
            ? {}
            : { maxCurrentPower: selector.maxCurrentPower }),
          ...(selector.minCurrentPower === undefined
            ? {}
            : { minCurrentPower: selector.minCurrentPower }),
          ...(selector.rested === undefined ? {} : { rested: selector.rested }),
          ...(selector.faceUp === undefined ? {} : { faceUp: selector.faceUp }),
          ...(selector.excludeSource
            ? { excludeInstanceId: context.source.instanceId }
            : {}),
        },
        db,
      ) &&
      (selector.typeIncluding === undefined ||
        hasCardTypeIncluding(card.cardNumber, selector.typeIncluding)) &&
      (selector.minBaseCost === undefined ||
        (definition.cost ?? 0) >= selector.minBaseCost) &&
      (selector.maxBaseCost === undefined ||
        (definition.cost ?? 0) <= selector.maxBaseCost) &&
      (selector.hasTrigger === undefined ||
        definition.rules.hasTrigger === selector.hasTrigger) &&
      (selector.noBaseEffect === undefined ||
        !(definition.rules.hasPrintedEffect || definition.rules.hasTrigger) ===
          selector.noBaseEffect) &&
      (selector.lacksClause === undefined ||
        !definition.rules.clauses.includes(selector.lacksClause)) &&
      (selector.hasClause === undefined ||
        definition.rules.clauses.includes(selector.hasClause)) &&
      (selector.excludeName === undefined ||
        definition.name !== selector.excludeName) &&
      (selector.differentColorFromBinding === undefined ||
        (bindings[selector.differentColorFromBinding] ?? []).every(
          (instanceId) => {
            const named = boundCardNumber(state, instanceId);
            if (named === undefined) return true;
            const theirs = new Set(db.require(named).colors ?? []);
            return !(definition.colors ?? []).some((color) =>
              theirs.has(color),
            );
          },
        )) &&
      (selector.sameNameAsBinding === undefined ||
        (bindings[selector.sameNameAsBinding] ?? []).some((instanceId) => {
          const named = boundCardNumber(state, instanceId);
          return (
            named !== undefined &&
            cardNames(named).some((name) => hasCardName(card.cardNumber, name))
          );
        })) &&
      (selector.name === undefined ||
        hasCardName(card.cardNumber, selector.name)) &&
      (selector.anyOf === undefined ||
        selector.anyOf.some(
          (clause) =>
            (clause.zone === undefined ||
              zoneOf.get(card.instanceId) === clause.zone) &&
            (clause.name === undefined ||
              hasCardName(card.cardNumber, clause.name)) &&
            (clause.type === undefined ||
              hasCardType(card.cardNumber, clause.type)) &&
            (clause.typeIncluding === undefined ||
              hasCardTypeIncluding(card.cardNumber, clause.typeIncluding)) &&
            (clause.category === undefined ||
              definition.category === clause.category) &&
            (clause.color === undefined ||
              definition.colors?.includes(clause.color) === true) &&
            (clause.attribute === undefined ||
              attributes.includes(clause.attribute)) &&
            (clause.hasTrigger === undefined ||
              definition.rules.hasTrigger === clause.hasTrigger) &&
            (clause.maxPower === undefined ||
              (cardBasePower(state, playerId, card, db) ?? 0) <=
                clause.maxPower) &&
            (clause.minCost === undefined ||
              effectiveCost(state, playerId, card, db) >= clause.minCost),
        )) &&
      (selector.canRest !== true ||
        (("cannotRestUntilTurn" in card
          ? ((card as BoardCard).cannotRestUntilTurn ?? -1)
          : -1) < state.turn &&
          !isRested(state, card) &&
          // "[printed text omitted -- pnpm card:text <card>]"
          // is continuous rather than a window, so it is asked of the card
          // itself. Only an opposing effect is barred, which is exactly what a
          // selector reaching across the table is.
          !(
            selector.player === "opponent" &&
            isRestImmune(state, playerId, card, db)
          ))) &&
      (selector.keyword === undefined ||
        cardHasKeyword(state, playerId, card, selector.keyword, db)) &&
      (selector.excludeAttackTarget !== true ||
        card.instanceId !== state.activeAttack?.targetInstanceId) &&
      (selector.color === undefined ||
        definition.colors?.includes(selector.color) === true) &&
      (selector.attribute === undefined ||
        attributes.includes(selector.attribute)) &&
      (selector.minGivenDon === undefined ||
        ("attachedDon" in card
          ? ((card as BoardCard).attachedDon?.length ?? 0)
          : 0) >= selector.minGivenDon) &&
      (selector.maxCostFromZoneCount === undefined ||
        effectiveCost(state, playerId, card, db) <=
          (
            (selector.maxCostFromZoneCount.player === "either"
              ? ["self", "opponent"]
              : [selector.maxCostFromZoneCount.player]) as readonly PlayerRef[]
          ).reduce(
            (total, side) =>
              total +
              zoneCards(
                state,
                resolvePlayer(context, side),
                selector.maxCostFromZoneCount!.zone,
              ).length,
            0,
          )) &&
      (selector.maxCostFromFieldDon === undefined ||
        effectiveCost(state, playerId, card, db) <=
          fieldDonCount(
            state,
            resolvePlayer(context, selector.maxCostFromFieldDon),
          )) &&
      (selector.remembered !== true ||
        card.instanceId === rememberedTargetOf(state, context)) &&
      (selector.costEqualsGivenDon !== true ||
        effectiveCost(state, playerId, card, db) ===
          ("attachedDon" in card
            ? ((card as BoardCard).attachedDon?.length ?? 0)
            : 0))
    );
  });
  if (selector.includeActiveDon === true) {
    const excluded = new Set(
      selector.excludeBinding === undefined
        ? []
        : (bindings[selector.excludeBinding] ?? []),
    );
    matches.push(
      ...state.players[playerId].activeDon
        .filter((instanceId) => !excluded.has(instanceId))
        .map((instanceId) => ({ instanceId, cardNumber: DON_CARD_NUMBER })),
    );
  }
  // `limit` used to be applied after an unconditional return, so it silently
  // did nothing. Every current caller pairs it with an equal `count`, which is
  // why nothing broke; applying it here makes the selector mean what it says.
  return selector.limit === undefined
    ? matches
    : matches.slice(0, selector.limit);
}

/**
 * A card's *base* power -- the highest live "base power becomes N" setter, or
 * its printed power -- for a Leader or a board Character.
 *
 * `undefined` for an instance that is on neither, which is what a binding
 * pointing at a card that has since left the field resolves to.
 */
export function baseCardPower(
  state: GameState,
  instanceId: string,
  db: CardDatabase,
): number | undefined {
  const leaderPlayerId = (["p1", "p2"] as const).find(
    (playerId) => instanceId === `${playerId}-leader`,
  );
  if (leaderPlayerId) {
    const player = state.players[leaderPlayerId];
    return (
      storedBasePower(player.leaderBasePowers, state.turn) ??
      db.require(player.leaderCardNumber).power ??
      0
    );
  }
  for (const playerId of ["p1", "p2"] as const) {
    const card = state.players[playerId].board.find(
      (candidate) => candidate.instanceId === instanceId,
    );
    if (!card) continue;
    return (
      storedBasePower(card.basePowerOverrides, state.turn) ??
      db.require(card.cardNumber).power ??
      0
    );
  }
  return undefined;
}

/**
 * The write half of {@link baseCardPower}: record one more "base power
 * becomes N" on a Leader or a Character.
 *
 * Added beside whatever setters the card already carries rather than over
 * them, because rule 4-9-2-1 applies the highest live one -- a 6000 written
 * over a 7000 leaves the card at 7000, and still applies once that lapses.
 *
 * Returns the card's owner and, when a higher setter (stored or a static
 * `set-base` layer) keeps this one from applying, the base that does -- so the
 * event can say so rather than announce a number the board is not at.
 * `undefined` for an instance on neither side.
 */
export function addBasePowerSetter(
  state: GameState,
  instanceId: string,
  setter: BasePowerSetter,
  db: CardDatabase,
): { owner: PlayerId; outrankedBy?: number } | undefined {
  const leaderPlayerId = (["p1", "p2"] as const).find(
    (playerId) => instanceId === `${playerId}-leader`,
  );
  let owner: PlayerId | undefined;
  let written: CardInstance | undefined;
  if (leaderPlayerId) {
    const player = state.players[leaderPlayerId];
    player.leaderBasePowers = withBasePowerSetter(
      player.leaderBasePowers,
      setter,
      state.turn,
    );
    owner = leaderPlayerId;
    written = { instanceId, cardNumber: player.leaderCardNumber };
  } else {
    for (const playerId of ["p1", "p2"] as const) {
      const card = state.players[playerId].board.find(
        (candidate) => candidate.instanceId === instanceId,
      );
      if (!card) continue;
      card.basePowerOverrides = withBasePowerSetter(
        card.basePowerOverrides,
        setter,
        state.turn,
      );
      owner = playerId;
      written = card;
      break;
    }
  }
  if (!owner || !written) return undefined;
  const applied = cardBasePower(state, owner, written, db);
  return applied !== undefined && applied > setter.value
    ? { owner, outrankedBy: applied }
    : { owner };
}

/** {@link addBasePowerSetter} for this turn or this battle, as a swap writes. */
export function setBaseCardPower(
  state: GameState,
  instanceId: string,
  value: number,
  scope: "turn" | "battle",
  db: CardDatabase,
): void {
  addBasePowerSetter(
    state,
    instanceId,
    {
      value,
      expiresAtTurn: state.turn,
      ...(scope === "battle" ? { battleScoped: true as const } : {}),
    },
    db,
  );
}

/** A board card's current power, for the one effect that copies it. */
export function currentPowerOfBoardCard(
  state: GameState,
  playerId: PlayerId,
  instanceId: string,
  db: CardDatabase,
): number {
  const card = state.players[playerId].board.find(
    (candidate) => candidate.instanceId === instanceId,
  );
  return card ? boardCardPower(state, playerId, card, true, db) : 0;
}

export function conditionMatches(
  state: GameState,
  context: MechanicContext,
  condition: MechanicCondition,
  bindings: Record<string, string[]>,
  db: CardDatabase = defaultCardDatabase,
): boolean {
  if (condition.kind === "combined-life") {
    const total = state.players.p1.life.length + state.players.p2.life.length;
    return condition.operator === "lte"
      ? total <= condition.value
      : total >= condition.value;
  }
  if (condition.kind === "life-versus") {
    const playerId = resolvePlayer(context, condition.player);
    const mine = state.players[playerId].life.length;
    const theirs = state.players[playerId === "p1" ? "p2" : "p1"].life.length;
    return condition.operator === "lt"
      ? mine < theirs
      : condition.operator === "gt"
        ? mine > theirs
        : condition.operator === "lte"
          ? mine <= theirs
          : mine >= theirs;
  }
  if (condition.kind === "all-of") {
    return condition.conditions.every((inner) =>
      conditionMatches(state, context, inner, bindings, db),
    );
  }
  if (condition.kind === "hand-count-versus") {
    const playerId = resolvePlayer(context, condition.player);
    const mine = state.players[playerId].hand.length;
    const theirs = state.players[playerId === "p1" ? "p2" : "p1"].hand.length;
    const by = condition.by ?? 1;
    return condition.operator === "lt"
      ? mine + by <= theirs
      : mine >= theirs + by;
  }
  if (condition.kind === "character-count-versus") {
    const playerId = resolvePlayer(context, condition.player);
    const characters = (candidate: PlayerId): number =>
      state.players[candidate].board.filter(
        (card) => db.require(card.cardNumber).category === "character",
      ).length;
    const mine = characters(playerId);
    const theirs = characters(playerId === "p1" ? "p2" : "p1");
    const by = condition.by ?? 1;
    return condition.operator === "lt"
      ? mine + by <= theirs
      : mine >= theirs + by;
  }
  if (condition.kind === "turn-player") {
    return state.turnPlayerId === resolvePlayer(context, condition.player);
  }
  if (condition.kind === "leader-battled-character") {
    const playerId = resolvePlayer(context, condition.player);
    return state.oncePerTurn.includes(
      leaderBattledCharacterKey(state.turn, playerId),
    );
  }
  if (condition.kind === "source-played-this-turn") {
    const playerId = context.sourcePlayerId;
    const card = state.players[playerId].board.find(
      (candidate) => candidate.instanceId === context.source.instanceId,
    );
    return card?.playedTurn === state.turn;
  }
  if (condition.kind === "event-activated-this-turn") {
    const playerId = resolvePlayer(context, condition.player);
    const stamp = state.eventsActivatedOnTurn;
    if (!stamp || stamp.turn !== state.turn) return false;
    return (stamp[playerId] ?? -1) >= condition.minBaseCost;
  }
  if (condition.kind === "character-koed-this-turn") {
    const playerId = resolvePlayer(context, condition.player);
    return state.characterKoedOnTurn?.[playerId] === state.turn;
  }
  if (condition.kind === "source-cost") {
    const playerId = context.sourcePlayerId;
    const card = state.players[playerId].board.find(
      (candidate) => candidate.instanceId === context.source.instanceId,
    );
    if (!card) return false;
    const cost = effectiveCost(state, playerId, card, db);
    return condition.operator === "lte"
      ? cost <= condition.value
      : cost >= condition.value;
  }
  if (condition.kind === "source-attached-don") {
    const playerId = context.sourcePlayerId;
    const card = state.players[playerId].board.find(
      (candidate) => candidate.instanceId === context.source.instanceId,
    );
    // A source that is no longer on the board falls back to its own snapshot:
    // OP14-051 Hatchan prints `[DON!! x2]` on an `[On K.O.]`, and by the time
    // that clause is dispatched the Character is in the trash and its DON!! has
    // gone back to the rested pile. The rule reads the state the Character left
    // in, which is what the K.O. paths preserve by handing over the whole board
    // entry.
    // A Leader keeps its DON!! on the player rather than in a board entry, so
    // neither lookup above can see it: OP10-002 Caesar Clown and OP10-022
    // Trafalgar Law print `[DON!! xN]` on a Leader's own clause, and without
    // this the gate answered zero and the clause never fired.
    const attached =
      context.source.instanceId === `${playerId}-leader`
        ? state.players[playerId].leaderAttachedDon.length
        : (card?.attachedDon?.length ??
          (context.source as BoardCard).attachedDon?.length ??
          0);
    return condition.operator === "lte"
      ? attached <= condition.value
      : attached >= condition.value;
  }
  if (condition.kind === "every-character-matches") {
    const playerId = resolvePlayer(context, condition.player);
    const characters = state.players[playerId].board.filter(
      (card) => db.require(card.cardNumber).category === "character",
    );
    const matching = selectCards(
      state,
      context,
      { ...condition.selector, player: condition.player, zone: "board" },
      bindings,
      db,
    ).map((card) => card.instanceId);
    return (
      characters.length > 0 &&
      characters.every((card) => matching.includes(card.instanceId))
    );
  }
  if (condition.kind === "battle-target") {
    const attack = state.activeAttack;
    if (!attack) return false;
    const target = battleParticipant(state, attack.defenderPlayerId);
    return target !== null && battleTargetMatches(condition.filter, target);
  }
  if (condition.kind === "battle-attacker") {
    const attack = state.activeAttack;
    if (!attack) return false;
    const attacker = battleParticipant(state, attack.attackerPlayerId);
    if (!attacker) return false;
    if (!battleTargetMatches(condition.filter, attacker)) return false;
    if (condition.attribute === undefined) return true;
    // Granted attributes count as well as printed ones, the same reading
    // `CardSelector.attribute` takes -- a Character handed <Slash> for the turn
    // is a <Slash> attacker.
    const board = state.players[attack.attackerPlayerId].board.find(
      (card) => card.instanceId === attacker.instanceId,
    );
    const attributes = board
      ? boardCardAttributes(state, board, db)
      : cardAttributes(db.require(attacker.cardNumber));
    return attributes.includes(condition.attribute);
  }
  if (condition.kind === "deck-top-cost") {
    const top = state.players[resolvePlayer(context, condition.player)].deck[0];
    if (top === undefined) return false;
    const cost = db.require(top.cardNumber).cost;
    // A card with no printed cost -- a Leader -- answers no band and no
    // equality, rather than reading as zero.
    if (cost === null) return false;
    if (condition.operator === "lte") return cost <= condition.value;
    if (condition.operator === "gte") return cost >= condition.value;
    return cost === condition.value;
  }
  if (condition.kind === "selector-cost-total") {
    const sides: readonly PlayerRef[] =
      condition.player === "either" ? ["self", "opponent"] : [condition.player];
    const total = sides.reduce((sum, player) => {
      const playerId = resolvePlayer(context, player);
      return (
        sum +
        selectCards(
          state,
          context,
          { ...condition.selector, player },
          bindings,
          db,
        ).reduce(
          (cost, card) => cost + effectiveCost(state, playerId, card, db),
          0,
        )
      );
    }, 0);
    return condition.operator === "lte"
      ? total <= condition.value
      : total >= condition.value;
  }
  if (condition.kind === "selector-count") {
    const sides: readonly PlayerRef[] =
      condition.player === "either" ? ["self", "opponent"] : [condition.player];
    const matched = sides.flatMap((player) =>
      selectCards(
        state,
        context,
        { ...condition.selector, player },
        bindings,
        db,
      ),
    );
    const total = condition.distinctNames
      ? new Set(matched.map((card) => db.require(card.cardNumber).name)).size
      : matched.length;
    if (condition.operator === "eq") return total === condition.value;
    if (condition.operator === "lte") return total <= condition.value;
    return total >= condition.value;
  }
  if (condition.kind === "any-of") {
    return condition.conditions.some((inner) =>
      conditionMatches(state, context, inner, bindings, db),
    );
  }
  if (condition.kind === "source-current-power") {
    // The source is only ever on a board when a clause asks this -- every
    // printed use is a `[When Attacking]` on a Character -- so a source that
    // has left the field answers 0 rather than throwing.
    const owner = (["p1", "p2"] as const).find((candidate) =>
      state.players[candidate].board.some(
        (card) => card.instanceId === context.source.instanceId,
      ),
    );
    const power = owner
      ? currentPowerOfBoardCard(state, owner, context.source.instanceId, db)
      : 0;
    return condition.operator === "lte"
      ? power <= condition.value
      : power >= condition.value;
  }
  const playerId = resolvePlayer(context, condition.player);
  if (condition.kind === "leader-type-including") {
    return hasCardTypeIncluding(
      state.players[playerId].leaderCardNumber,
      condition.text,
    );
  }
  if (condition.kind === "rested-cards") {
    const owner = state.players[playerId];
    const rested =
      (owner.leaderRested ? 1 : 0) +
      owner.board.filter((card) => card.rested).length +
      (owner.stage?.rested ? 1 : 0) +
      owner.restedDon.length;
    return condition.operator === "lte"
      ? rested <= condition.value
      : rested >= condition.value;
  }
  if (condition.kind === "active-don") {
    const active = state.players[playerId].activeDon.length;
    return condition.operator === "lte"
      ? active <= condition.value
      : active >= condition.value;
  }
  if (condition.kind === "rested-don") {
    const rested = state.players[playerId].restedDon.length;
    return condition.operator === "lte"
      ? rested <= condition.value
      : rested >= condition.value;
  }
  if (condition.kind === "leader-power") {
    const power = currentPower(
      state,
      playerId,
      `${playerId}-leader`,
      donPowerApplies(state, playerId),
      db,
    );
    return condition.operator === "lte"
      ? power <= condition.value
      : power >= condition.value;
  }
  const leader = db.require(state.players[playerId].leaderCardNumber);
  if (condition.kind === "leader-has-type") {
    return hasCardType(
      state.players[playerId].leaderCardNumber,
      condition.type,
    );
  }
  if (condition.kind === "leader-has-name") {
    return hasCardName(
      state.players[playerId].leaderCardNumber,
      condition.name,
    );
  }
  if (condition.kind === "leader-has-attribute") {
    return cardAttributes(leader).includes(condition.attribute);
  }
  if (condition.kind === "leader-has-color") {
    const playerId = resolvePlayer(context, condition.player);
    return (
      db
        .require(state.players[playerId].leaderCardNumber)
        .colors?.includes(condition.color) === true
    );
  }
  if (condition.kind === "leader-multicolored") {
    return (leader.colors?.length ?? 0) > 1;
  }
  if (condition.kind === "given-don") {
    const owner = state.players[resolvePlayer(context, condition.player)];
    const given =
      owner.leaderAttachedDon.length +
      owner.board.reduce(
        (total, card) => total + (card.attachedDon?.length ?? 0),
        0,
      );
    return condition.operator === "lte"
      ? given <= condition.value
      : given >= condition.value;
  }
  if (condition.kind === "field-don") {
    const don = fieldDonCount(state, playerId);
    return condition.operator === "lte"
      ? don <= condition.value
      : don >= condition.value;
  }
  if (condition.kind === "field-don-versus") {
    const own = fieldDonCount(state, playerId);
    const other = fieldDonCount(state, opponentOf(playerId));
    if (condition.operator === "lte") return own <= other;
    if (condition.operator === "lt") return own < other;
    if (condition.operator === "gt") return own > other;
    return own >= other;
  }
  const count = zoneCards(state, playerId, condition.zone).length;
  if (condition.operator === "eq") return count === condition.value;
  if (condition.operator === "lte") return count <= condition.value;
  return count >= condition.value;
}

/**
 * The condition gating a program whose entire effect is a bare `if` with
 * nothing unconditional in front of it, or `null` when there is no such gate
 * to pre-check.
 *
 * An `[Activate: Main]` printed as "If [condition], [effect]" with no cost is
 * always legal to declare under the real rules -- the `if` is resolved, not a
 * legality check -- but offering it when the condition is already known false
 * is a repeatable-looking no-op with nothing behind it, the same trap
 * `ActivateMainProgram.requires`'s doc comment names for an unaffordable
 * cost. This only covers the bare-`if` shape deliberately: a program that
 * pays a real cost before its `if` (OP17-063 Kaido's DON!! −1) is left alone,
 * because paying that cost is itself part of what "activating" means, and
 * this project isn't taking a rules opinion on whether that's ever offered.
 */
export function bareGateCondition(
  program: MechanicProgram,
): MechanicCondition | null {
  return program.effect.kind === "if" ? program.effect.condition : null;
}

/**
 * True when every card selection this program makes would find nothing.
 *
 * The trap this exists to name: an "up to N" clause is legal to activate
 * whatever the board looks like -- 8-4-4-1 lets a player choose 0 -- so the
 * engine offers `[Main]` and `[Activate: Main]` programs whose only effect is
 * a selection even when that selection has no candidates. A pilot that fires
 * the first activation it is offered then pays the cost, trashes the Event and
 * resolves nothing. Five decks each grew their own rule against exactly this:
 * `op13-sabo`'s "K.O. with nothing in range", `op16-enel`'s "Event with
 * nothing on the board to answer", `op17-shanks`'s "no rested Character to
 * freeze", and two in `op12-rosinante`.
 *
 * Unlike {@link bareGateCondition}, the answer is *reported* on the action
 * rather than used to withhold it. A failed bare gate means the program does
 * nothing either way, so not offering it is semantically identical to
 * resolving it. An empty selection is not: the cost is still paid and the
 * Event still leaves the hand, and a player may legally want that. Withholding
 * it would be a rules opinion, so this only tells the caller what it is
 * looking at.
 *
 * Conservative by construction -- it answers `true` only for programs built
 * entirely out of selections, and `false` for anything it cannot fully
 * account for. A program that draws, rests or ramps *and* selects is doing
 * something whatever the board holds; `seq[draw,choose]` and `seq[rest,choose]`
 * are both in the pool and neither is inert. Of the 231 `[Main]` programs in
 * the card pool, 104 are selection-only and so can ever be reported.
 */
export function programSelectsNothing(
  state: GameState,
  context: MechanicContext,
  program: MechanicProgram,
  db: CardDatabase = defaultCardDatabase,
): boolean {
  const bindings: Record<string, string[]> = {
    [SOURCE_BINDING]: [context.source.instanceId],
  };
  return effectSelectsNothing(state, context, program.effect, bindings, db);
}

/**
 * True when a sequence step only charges the controller -- it moves no card and
 * grants no resource the controller could not have had for free at the same
 * decision.
 *
 * ## Why this exists
 *
 * `[Activate: Main]` text is written "<price>: <payoff>", and the DSL builds
 * that as one `sequence` with the price in front. Until this function the
 * `sequence` case of {@link effectSelectsNothing} required *every* step to
 * select nothing, so a single price step -- which selects nothing because it
 * selects at all -- made the whole program non-inert, and `inert-activation` in
 * `packages/agents` could never see it.
 *
 * The reach, probed over all 196 `[Activate: Main]` programs in the pool
 * against a bare table with an empty opposing board: **69 reported inert
 * before, 122 after**. Of the 58 programs written as a price followed by a
 * single `min: 0` selection, 47 are now reachable and 11 stay out because a
 * step beside the price is a genuine payoff; the other 6 of the 53 come from
 * outside that shape, mostly `donMinus`, which is `sequence[return-don,
 * payoff]`. Nothing that was reported inert before stopped being so -- the
 * change is a strict widening, which is the property to re-check if the price
 * vocabulary below ever grows.
 *
 * The card that found it is OP13-007 Ace & Sabo & Luffy, in a real game
 * (`open-optcg-trace(20).jsonl`, turn 3): the seat activated it into an *empty*
 * opposing board, which trashed the Character to give a DON!! the same Main
 * phase was offering for free. Its own mechanic entry calls the two front steps
 * "two costs joined by 'and'", which is what this function had no way to know.
 *
 * ## The test, and why each kind passes or fails it
 *
 * "Grants nothing the controller could not have for free" is the whole
 * discrimination, and it is deliberately narrow -- a step wrongly called a price
 * suppresses an offer that was worth taking, which is worse than the waste this
 * catches. Every kind the census actually found, decided:
 *
 *  - `rest` of the source, `move` of the source off the field, `return-don` and
 *    `rest-don` of the controller's own DON!!: prices. The first two are also
 *    exactly what `costOfEffect` in `legal-actions/action-costs.ts` cannot
 *    summarise, which is why that function could not have been reused here.
 *  - `attach-don` and `give-rested-don` **from `"active"`**: prices, because
 *    `donOffers` in `legal-actions/main/don.ts` offers an unconditional, free
 *    `attach-don` to the Leader and to every board Character whenever the
 *    controller holds one active DON!!. Moving an active DON!! onto one's own
 *    card is therefore already available at this decision at no charge, so a
 *    program doing it grants nothing.
 *  - the same two **from `"rested"`**: payoffs. A *rested* DON!! cannot be
 *    attached by any free action, so +1000 power out of one is real value. This
 *    is the single distinction that keeps OP16-021 Moby Dick and EB03-015 out,
 *    and it is why the `from` field is read rather than the kind.
 *  - `draw`, `add-don`, `trash-top`, `update` and everything else: payoffs, by
 *    falling through. `draw` is the trap worth naming -- OP10-082 and OP10-093
 *    trash themselves to draw *and* then offer a `min: 0` selection, so calling
 *    a self-trash a price is only safe because the `draw` beside it is not.
 *
 * Static except for the source's identity, which the `rest` guard needs.
 */
export function stepIsPriceOnly(
  context: MechanicContext,
  effect: MechanicEffect,
): boolean {
  switch (effect.kind) {
    case "return-don":
    case "rest-don":
      return effect.player === "self";
    case "attach-don":
    case "give-rested-don":
      // `give-rested-don` defaults to `"rested"` when the field is absent, so
      // an omitted `from` is a payoff. `attach-don` always states it.
      return effect.player === "self" && effect.from === "active";
    case "rest":
      // Only the source, and only when resting it is not itself a trigger:
      // `whenRestedInvocation` fires the rested card's own program, which would
      // make this a payoff. Registered through a seam because
      // `mechanics/index.ts` cannot be imported here -- see
      // {@link registerWhenRestedCards}.
      return (
        effect.binding === SOURCE_BINDING &&
        !whenRestedCards.has(context.source.cardNumber)
      );
    case "move":
      // "Trash this Character", and the two neighbouring shapes the census
      // found: back to the owner's hand, and to the bottom of the owner's deck.
      // All three take the source off the field and give nothing back; a `move`
      // of anything *else* is a payoff, which is why the binding is checked.
      return (
        effect.binding === SOURCE_BINDING &&
        (effect.to.player === "self" || effect.to.player === "owner") &&
        (effect.to.zone === "trash" ||
          effect.to.zone === "hand" ||
          effect.to.zone === "deck")
      );
    default:
      return false;
  }
}

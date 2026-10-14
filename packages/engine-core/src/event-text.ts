/**
 * Turning engine events into prose, from a seat.
 *
 * Pure: every function here is a value in, a string out, with no DOM and no
 * store. That is what makes the match history, the opponent-action notice and
 * the LLM's own request all able to phrase the same event without three copies
 * of the phrasing.
 *
 * It sits in the engine rather than in the app because the app is no longer the
 * only reader. An LLM seat is shown the same recent events a person is shown in
 * the history modal, and the alternative -- the agents package importing the
 * web package -- is a cycle, since the web worker constructs the agents.
 *
 * `viewer` is the seat the text is written for. Passing it yields "You drew a
 * card"; omitting it yields the neutral "P1 drew a card" a log wants.
 */
import { requireKnownCard } from "@one-piece-sim/cards";
import type {
  GrantableKeyword,
  PlayerId,
  PublicEvent,
} from "@one-piece-sim/protocol";

/** Big numbers as the cards print them: 5000 power reads as "5k". */
export function formatCompactStat(value: number): string {
  return Math.abs(value) >= 1000 ? `${value / 1000}k` : String(value);
}

/**
 * Whose step this is, from `viewer`'s seat.
 *
 * With no viewer this is a neutral log, so the raw seat id is right. Note the
 * upper-casing is on the seat id alone, not the sentence: a card number must
 * survive verbatim, so this never touches anything but `p1`/`p2`.
 */
export function seat(playerId: PlayerId, viewer: PlayerId | undefined): string {
  if (!viewer) return playerId.toUpperCase();
  return playerId === viewer ? "You" : "Opponent";
}

/** The possessive form of {@link seat}. */
export function seatOwns(
  playerId: PlayerId,
  viewer: PlayerId | undefined,
): string {
  if (!viewer) return `${playerId.toUpperCase()}'s`;
  return playerId === viewer ? "your" : "the opponent's";
}

/** A card number as something readable, falling back to the number itself. */
export function cardLabel(cardNumber: string | null): string {
  if (!cardNumber) return "a card";
  try {
    return requireKnownCard(cardNumber).name;
  } catch {
    return cardNumber;
  }
}

/**
 * " (via Nami [OP11-041])" -- what attributes a step to the card that caused it.
 *
 * A step with no source reads as if the rules did it, which is right for the
 * draw phase and for battle damage but wrong for everything an ability does.
 *
 * The card number is not decoration. The deck that surfaced this runs two
 * different Namis, a Leader and a Character, and both fire on the same play --
 * "via Nami" twice in a row says nothing about which did what.
 */
export function sourceSuffix(sourceCardNumber: string | undefined): string {
  return sourceCardNumber
    ? ` (via ${cardLabel(sourceCardNumber)} [${sourceCardNumber}])`
    : "";
}

/**
 * instanceId -> cardNumber, for the cards a log has to name but events only
 * identify by instance.
 *
 * An attack, a DON!! attachment and a power buff all carry `...InstanceId` and
 * no card number, so the line they produce could only ever say "a Character".
 * The board's current state cannot answer it either -- half of what a history
 * names is already in the trash -- so the index is built from the log itself,
 * which mentions every card's number at least once when it enters play.
 */
export type CardInstanceNames = ReadonlyMap<string, string>;

/**
 * The index above, over a whole event log.
 *
 * `seed` carries what no event states: the two Leaders, whose numbers are in
 * the match config rather than in a step.
 */
export function collectCardInstances(
  events: readonly PublicEvent[],
  seed: readonly (readonly [string, string])[] = [],
): Map<string, string> {
  const names = new Map<string, string>(
    seed.map(([id, number]) => [id, number]),
  );
  for (const event of events) {
    if ("cardInstanceId" in event && event.cardInstanceId && event.cardNumber) {
      names.set(event.cardInstanceId, event.cardNumber);
    }
    if ("targetCardNumber" in event) {
      names.set(event.targetInstanceId, event.targetCardNumber);
    }
    if (
      (event.type === "power-changed" || event.type === "base-power-set") &&
      event.sourceInstanceId &&
      event.sourceCardNumber
    ) {
      names.set(event.sourceInstanceId, event.sourceCardNumber);
    }
  }
  return names;
}

/**
 * The seat an instance id belongs to.
 *
 * Instance ids are minted as `${playerId}-leader` and `${playerId}-card-N`
 * (see `engine.ts`), so the prefix is the owner -- which is what lets a log say
 * "the opponent's Zoro" for a card no longer on the board to be looked up.
 */
function instanceOwner(instanceId: string): PlayerId | undefined {
  return instanceId.startsWith("p1-")
    ? "p1"
    : instanceId.startsWith("p2-")
      ? "p2"
      : undefined;
}

/**
 * "the opponent's Zoro", or undefined when the card cannot be named.
 *
 * Undefined rather than a placeholder: every caller has a shorter sentence to
 * fall back to, and "a Character attacked a Character" is worse than the
 * unadorned line that came before.
 */
function instanceLabel(
  instanceId: string,
  names: CardInstanceNames | undefined,
  viewer: PlayerId | undefined,
): string | undefined {
  const owner = instanceOwner(instanceId);
  const isLeader = instanceId.endsWith("-leader");
  const cardNumber = names?.get(instanceId);
  if (!cardNumber) {
    if (!isLeader || !owner) return undefined;
    return `${seatOwns(owner, viewer)} Leader`;
  }
  const name = `${cardLabel(cardNumber)}${isLeader ? " (Leader)" : ""}`;
  return owner ? `${seatOwns(owner, viewer)} ${name}` : name;
}

/** A label that opens a sentence. */
function capitalize(text: string): string {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

/** A signed power change, the way the cards word it. */
function signedPower(amount: number): string {
  return `${amount > 0 ? "+" : "\u2212"}${formatCompactStat(Math.abs(amount))}`;
}

const ZONE_LABELS: Record<string, string> = {
  deck: "deck",
  hand: "hand",
  life: "Life",
  board: "the field",
  trash: "trash",
  stage: "stage",
  leader: "Leader",
  revealed: "the revealed cards",
};

function cardMovedText(
  event: Extract<PublicEvent, { type: "card-moved" }>,
  viewer: PlayerId | undefined,
): string {
  const owns = seatOwns(event.playerId, viewer);
  const zone = (name: string) => ZONE_LABELS[name] ?? name;
  const card = cardLabel(event.cardNumber);
  const source = sourceSuffix(event.sourceCardNumber);
  // Both ends are named, because "a card moved to hand" leaves the one thing
  // the player wants to know -- whose hand -- unsaid.
  const body =
    event.to === "life"
      ? `${card} went from ${zone(event.from)} to the ${event.position ?? "top"} of ${owns} Life${event.faceUp ? " face-up" : ""}`
      : event.from === "life"
        ? `${card} went from the ${event.position ?? "top"} of ${owns} Life to ${owns} ${zone(event.to)}`
        : event.to === "deck" && event.position === "bottom"
          ? `${card} went from ${zone(event.from)} to the bottom of ${owns} ${zone(event.to)}`
          : `${card} went from ${zone(event.from)} to ${owns} ${zone(event.to)}`;
  return `${body.charAt(0).toUpperCase()}${body.slice(1)}${source}.`;
}

/**
 * What a granted keyword actually lets the card do.
 *
 * The keyword alone is a complete answer only to someone who has the list
 * memorised, and the case that surfaced this -- a Character attacking on the
 * turn it was played -- is exactly the thing a player is trying to explain to
 * themselves when they go looking.
 */
export const GRANTED_KEYWORD_CONSEQUENCE: Record<GrantableKeyword, string> = {
  Rush: "it can attack on the turn it was played",
  "Rush: Character": "it can attack Characters on the turn it was played",
  Blocker: "it can be rested to become the target of an attack",
  Unblockable: "its attacks cannot be blocked",
  "Double Attack": "its successful attacks deal 2 damage",
  Banish:
    "the Life card its damage takes is trashed instead of going to the hand, and its Trigger never opens",
};

/**
 * What a player-scoped restriction stops the restricted player doing, as a
 * clause a sentence can be built round.
 *
 * `subject` is the player as the sentence's subject ("You"), `possessive` the
 * same player as its owner ("your"): a restriction that bans an action wants
 * the first and one that switches a player's own cards off wants the second,
 * and both readings exist in the union.
 *
 * The cost bounds are part of the clause, not decoration. "You cannot play
 * Characters" is a different game from "You cannot play Characters with a cost
 * of 5 or more", and OP12-030 Dracule Mihawk prints the second.
 */
export function restrictionClause(
  event: Extract<PublicEvent, { type: "player-restricted" }>,
  subject: string,
  possessive: string,
): string {
  switch (event.restriction) {
    case "cannot-play-characters":
      return `${subject} cannot play Characters${
        event.minBaseCost === undefined
          ? ""
          : ` with a cost of ${event.minBaseCost} or more`
      }`;
    case "cannot-play-from-hand":
      return `${subject} cannot play cards from hand`;
    case "cannot-draw-by-effect":
      return `${subject} cannot draw cards with effects`;
    case "cannot-activate-don-by-character":
      return `${subject} cannot set DON!! active with a Character's effect`;
    case "on-play-negated":
      return `${capitalize(possessive)} [On Play] effects are negated`;
    case "leader-cannot-attack-characters":
      return `${capitalize(possessive)} Leader cannot attack Characters${
        event.maxBaseCost === undefined
          ? ""
          : ` with a base cost of ${event.maxBaseCost} or less`
      }`;
    case "cannot-attack-leaders":
      return `${subject} cannot attack Leaders`;
    case "cannot-life-to-hand":
      return `${subject} cannot add Life cards to hand with their own effects`;
  }
}

/**
 * One step as a line of text. `viewer` renders it from a seat ("You drew...");
 * omit it for a neutral log ("P1 drew...").
 *
 * `names` is what turns "You attacked for 6k" into "You attacked the
 * opponent's Leader with Zoro for 6k". It is optional, and every clause it
 * feeds falls back to the shorter sentence when a card cannot be named, so a
 * caller with no index still gets a correct line.
 */
export function eventText(
  event: PublicEvent,
  viewer?: PlayerId,
  names?: CardInstanceNames,
): string {
  const who = (playerId: PlayerId) => seat(playerId, viewer);
  const owns = (playerId: PlayerId) => seatOwns(playerId, viewer);
  const named = (instanceId: string | undefined) =>
    instanceId ? instanceLabel(instanceId, names, viewer) : undefined;
  switch (event.type) {
    case "game-created":
      return `Game created. ${who(event.activePlayer)} ${viewer ? "go" : "goes"} first.`;
    case "mulligan-decided":
      return `${who(event.playerId)} chose to ${event.decision}.`;
    case "setup-complete":
      return "Setup complete.";
    case "card-played":
      return `${who(event.playerId)} played ${cardLabel(event.cardNumber)} [${event.cardNumber}].`;
    case "stage-played":
      return `${who(event.playerId)} played stage ${cardLabel(event.cardNumber)} [${event.cardNumber}].`;
    case "attack-declared": {
      const attacker = named(event.attackerInstanceId);
      const target = named(event.targetInstanceId);
      return `${who(event.playerId)} attacked${target ? ` ${target}` : ""}${attacker ? ` with ${attacker}` : ""} for ${formatCompactStat(event.power)}.`;
    }
    case "attack-blocked": {
      const blocker = named(event.blockerInstanceId);
      return `${who(event.playerId)} blocked the attack${blocker ? ` with ${blocker}` : ""}.`;
    }
    case "attack-redirected": {
      const target = named(event.targetInstanceId);
      return `${who(event.playerId)} changed the attack target${target ? ` to ${target}` : ""} with ${cardLabel(event.sourceCardNumber)} [${event.sourceCardNumber}].`;
    }
    case "battle-resolved": {
      // The target is named where it is the news ("K.O.'d whose Character?");
      // for the damage outcomes the Life total in `damage-taken` says more than
      // repeating the Leader that was always the target.
      const target = named(event.targetInstanceId);
      const on = target ? ` on ${target}` : "";
      return event.outcome === "defended"
        ? `Attack${on} stopped (${formatCompactStat(event.attackPower)} vs ${formatCompactStat(event.defensePower)}).`
        : event.outcome === "character-ko"
          ? `Attack K.O.'d ${target ?? "a Character"}.`
          : event.outcome === "game-win"
            ? `Attack${on} dealt the final hit.`
            : `Attack${on} dealt 1 damage.`;
    }
    case "counter-used":
      return `${who(event.playerId)} countered with ${cardLabel(event.cardNumber)} (${signedPower(event.power)} defense).`;
    case "event-activated":
      return `${who(event.playerId)} activated ${cardLabel(event.cardNumber)} [${event.cardNumber}].`;
    case "ability-triggered":
      // "fired on its own" is the whole news: the steps under it already say
      // what it did, and this line is the one that says nobody asked for them.
      // A `noEffect` one has no steps under it, so the line carries the news
      // itself: it fired, did nothing, and will not fire again this turn.
      return event.noEffect
        ? `${capitalize(`${owns(event.playerId)} ${cardLabel(event.sourceCardNumber)} [${event.sourceCardNumber}]`)} fired on its own but had nothing to do; it is spent for this turn.`
        : `${capitalize(`${owns(event.playerId)} ${cardLabel(event.sourceCardNumber)} [${event.sourceCardNumber}]`)} fired on its own.`;
    case "ability-activated":
      // The mirror of the line above, and the same news in reverse: the player
      // asked for this one. A Leader is the case that needs saying -- it never
      // leaves the board, so its activation has no card movement to stand in
      // for this line.
      return `${who(event.playerId)} activated ${cardLabel(event.sourceCardNumber)} [${event.sourceCardNumber}].`;
    case "damage-taken":
      return `${who(event.playerId)} took damage (${event.lifeRemaining} Life).`;
    case "cards-drawn":
      return `${who(event.playerId)} drew ${event.count} card${event.count === 1 ? "" : "s"}${sourceSuffix(event.sourceCardNumber)}.`;
    case "turn-ended":
      return `${who(event.playerId)} ended the turn.`;
    case "extra-turn-granted":
      return `${who(event.playerId)} will take an extra turn after this one${sourceSuffix(event.sourceCardNumber)}.`;
    case "game-ended":
      return `${who(event.winner)} won by ${event.reason.replace("-", " ")}.`;
    case "don-attached": {
      const target = named(event.targetInstanceId);
      return `${who(event.playerId)} attached ${event.count} DON!!${target ? ` to ${target}` : ""}.`;
    }
    case "don-activated":
      return `${who(event.playerId)} set ${event.count} DON!! as active${sourceSuffix(event.sourceCardNumber)}.`;
    case "player-restricted":
      return `${restrictionClause(event, who(event.playerId), owns(event.playerId))} through turn ${event.untilTurn}${sourceSuffix(event.sourceCardNumber)}.`;
    case "don-added":
      return `${who(event.playerId)} added ${event.count} ${event.rested ? "rested" : "active"} DON!!${sourceSuffix(event.sourceCardNumber)}.`;
    case "don-returned":
      return `${who(event.playerId)} returned ${event.count} DON!! to ${owns(event.playerId)} DON!! deck${sourceSuffix(event.sourceCardNumber)}.`;
    case "character-ko":
      return `${capitalize(`${owns(event.playerId)} ${cardLabel(event.cardNumber)}`)} was K.O.'d${sourceSuffix(event.sourceCardNumber)}.`;
    case "character-trashed":
      return `${who(event.playerId)} trashed ${cardLabel(event.cardNumber)} to make room.`;
    case "character-rested":
      return `${capitalize(`${owns(event.playerId)} ${cardLabel(event.cardNumber)}`)} was rested${sourceSuffix(event.sourceCardNumber)}.`;
    case "power-changed": {
      const target = named(event.targetInstanceId);
      if (!target)
        return `Power changed by ${formatCompactStat(event.amount)}.`;
      const source = event.sourceCardNumber
        ? `${cardLabel(event.sourceCardNumber)} [${event.sourceCardNumber}]`
        : "A card effect";
      return `${source} gave ${target} ${signedPower(event.amount)} power through turn ${event.expiresAtTurn}.`;
    }
    case "base-power-set": {
      const target = named(event.targetInstanceId);
      const source = event.sourceCardNumber
        ? `${cardLabel(event.sourceCardNumber)} [${event.sourceCardNumber}]`
        : "A card effect";
      // "Base power became", not "gained": the printed figure is replaced, so
      // whatever the target was printed at no longer bears on the total.
      if (event.outrankedBy !== undefined)
        return `${source} set ${target ?? "a card"}'s base power to ${formatCompactStat(event.basePower)} through turn ${event.expiresAtTurn}, but it stays ${formatCompactStat(event.outrankedBy)}: the higher base-power effect applies.`;
      return `${source} made ${target ?? "a card"}'s base power ${formatCompactStat(event.basePower)} through turn ${event.expiresAtTurn}.`;
    }
    case "attack-prevented":
      return `${cardLabel(event.sourceCardNumber)} prevented ${cardLabel(event.targetCardNumber)} from attacking through turn ${event.expiresAtTurn}.`;
    case "rest-prevented":
      return `${cardLabel(event.sourceCardNumber)} barred ${cardLabel(event.targetCardNumber)} from being rested through turn ${event.expiresAtTurn} — it can neither attack nor use [Blocker], both of which cost a rest.`;
    case "refresh-prevented":
      return `${cardLabel(event.sourceCardNumber)} kept ${cardLabel(event.targetCardNumber)} rested through turn ${event.expiresAtTurn} — it will not become active in the Refresh Phase.`;
    case "keyword-granted":
      return `${cardLabel(event.sourceCardNumber)} gave ${cardLabel(event.targetCardNumber)} [${event.keyword}] through turn ${event.expiresAtTurn} — ${GRANTED_KEYWORD_CONSEQUENCE[event.keyword]}.`;
    case "effect-negated":
      return `${cardLabel(event.sourceCardNumber)} negated ${cardLabel(event.targetCardNumber)}'s effects through turn ${event.expiresAtTurn}.`;
    case "card-moved":
      return cardMovedText(event, viewer);
    case "life-flipped":
      return `${who(event.playerId)} turned the ${event.position} card of ${owns(event.playerId)} Life ${event.faceUp ? "face-up" : "face-down"}${event.cardNumber ? ` — ${cardLabel(event.cardNumber)}` : ""}${sourceSuffix(event.sourceCardNumber)}.`;
    case "card-revealed":
      // A Trigger window reveals the Life card itself, so its number is both
      // the reveal and the source; "(via X [X])" would be redundant noise.
      return `${who(event.playerId)} revealed ${cardLabel(event.cardNumber)} [${event.cardNumber}]${event.sourceCardNumber === event.cardNumber ? "" : sourceSuffix(event.sourceCardNumber)}.`;
    case "characters-refreshed": {
      const refreshed = event.cardInstanceIds
        .map((instanceId) => names?.get(instanceId))
        .filter((cardNumber): cardNumber is string => cardNumber !== undefined)
        .map((cardNumber) => cardLabel(cardNumber));
      return `${who(event.playerId)} refreshed ${event.cardInstanceIds.length} character(s)${refreshed.length === event.cardInstanceIds.length && refreshed.length > 0 ? ` (${refreshed.join(", ")})` : ""}.`;
    }
  }
}

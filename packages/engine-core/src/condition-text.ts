/**
 * Mechanic conditions, in words.
 *
 * The DSL's conditions are data, so a condition that is *not* met can say what
 * it is waiting for rather than merely withholding whatever it gates. That is
 * the whole reason this file exists: `bareGateCondition` withholds an
 * `[Activate: Main]` offer whose gate fails, correctly -- taking it would
 * resolve nothing -- but a withheld offer is indistinguishable from an ability
 * the card does not have. A recorded game turned on exactly that gap: ST21-001
 * Monkey.D.Luffy's Leader gift is gated on `[DON!! x1]`, its holder had 7
 * rested DON!! and a Stage able to give one to the Leader, and the observation
 * said nothing about the ability at all, so the line that switched the Leader
 * gift on -- and through it a 9000-power [Rush] attacker -- was never
 * considered.
 *
 * Two questions, both answered off the condition tree:
 *
 * - {@link describeMechanicCondition} renders it. Deliberately terse and
 *   uniform: this ends up under a card in an observation next to `5000 power`,
 *   not in a rules document.
 * - {@link conditionFixedForGame} answers whether it could ever change. A gate
 *   on the Leader's own type or name is settled the moment decks are chosen, so
 *   reporting it every turn to a deck that will never satisfy it is noise, and
 *   telling a deck that *does* satisfy it costs a line for nothing.
 *
 * Unhandled kinds return `null` rather than a guess: the caller says "its
 * printed condition is not met" and the reader has the card's text.
 */
import type { CardSelector, MechanicCondition } from "./mechanics.js";

function comparison(operator: string, value: number, noun: string): string {
  return operator === "lte"
    ? `${value} or fewer ${noun}`
    : `${value} or more ${noun}`;
}

const ZONE_NOUNS: Record<string, string> = {
  hand: "cards in hand",
  life: "Life cards",
  trash: "cards in the trash",
  deck: "cards in the deck",
  board: "Characters",
};

/**
 * The part of a selector that reads as a noun phrase.
 *
 * Only the filters gate conditions actually use are spelled out; anything else
 * falls back to the bare category, because a half-rendered selector that drops
 * a `minGivenDon` would name a wider set of cards than the gate accepts and
 * read as a promise the engine does not keep.
 */
function describeSelector(selector: Omit<CardSelector, "player">): string {
  const noun = selector.category === "character" ? "Characters" : "cards";
  const filters: string[] = [];
  if (selector.name !== undefined) filters.push(`named [${selector.name}]`);
  if (selector.type !== undefined)
    filters.push(`of the {${selector.type}} type`);
  if (selector.typeIncluding !== undefined) {
    filters.push(`with {${selector.typeIncluding}} in their type`);
  }
  if (selector.anyOf !== undefined) {
    const alternatives = selector.anyOf
      .map((option) =>
        option.type !== undefined
          ? `{${option.type}}`
          : option.name !== undefined
            ? `[${option.name}]`
            : null,
      )
      .filter((text): text is string => text !== null);
    if (alternatives.length === selector.anyOf.length) {
      filters.push(`of the ${alternatives.join(" or ")} type`);
    }
  }
  if (selector.minCurrentPower !== undefined) {
    filters.push(`with ${selector.minCurrentPower} power or more`);
  }
  if (selector.maxCurrentPower !== undefined) {
    filters.push(`with ${selector.maxCurrentPower} power or less`);
  }
  if (selector.maxCost !== undefined) {
    filters.push(`with a cost of ${selector.maxCost} or less`);
  }
  if (selector.minCost !== undefined) {
    filters.push(`with a cost of ${selector.minCost} or more`);
  }
  if (selector.rested === true) filters.push("that are rested");
  if (selector.rested === false) filters.push("that are active");
  return filters.length === 0 ? noun : `${noun} ${filters.join(" ")}`;
}

function side(player: string, possessive: string, other: string): string {
  return player === "opponent" ? other : possessive;
}

/**
 * One condition in words, or `null` when this file cannot say it exactly.
 */
export function describeMechanicCondition(
  condition: MechanicCondition,
): string | null {
  switch (condition.kind) {
    case "source-attached-don":
      return comparison(
        condition.operator,
        condition.value,
        "DON!! attached to this card",
      );
    case "field-don":
      return `${comparison(condition.operator, condition.value, "DON!! cards")} in ${side(condition.player, "your", "your opponent's")} cost area and given out`;
    case "given-don":
      return `${comparison(condition.operator, condition.value, "given DON!! cards")} on ${side(condition.player, "your", "your opponent's")} field`;
    case "active-don":
      return `${comparison(condition.operator, condition.value, "active DON!! cards")} in ${side(condition.player, "your", "your opponent's")} cost area`;
    case "rested-don":
      return `${comparison(condition.operator, condition.value, "rested DON!! cards")} in ${side(condition.player, "your", "your opponent's")} cost area`;
    case "zone-count": {
      const zone = Array.isArray(condition.zone)
        ? condition.zone.join("/")
        : condition.zone;
      const noun = ZONE_NOUNS[zone] ?? `cards in the ${zone}`;
      return `${comparison(condition.operator, condition.value, noun)} on ${side(condition.player, "your", "your opponent's")} side`;
    }
    case "selector-count":
      return `${comparison(condition.operator, condition.value, describeSelector(condition.selector))} on ${
        condition.player === "either"
          ? "either side"
          : side(condition.player, "your", "your opponent's") + " side"
      }`;
    case "selector-cost-total":
      return `${side(condition.player, "your", "your opponent's")} ${describeSelector(condition.selector)} totalling ${condition.value} cost or ${condition.operator === "lte" ? "less" : "more"}`;
    case "every-character-matches":
      return `every one of ${side(condition.player, "your", "your opponent's")} Characters to be ${describeSelector(condition.selector)}`;
    case "source-played-this-turn":
      return "this card to have been played this turn";
    case "source-current-power":
      return `this card at ${condition.value} power or ${condition.operator === "lte" ? "less" : "more"}`;
    case "source-cost":
      return `this card at a cost of ${condition.value} or ${condition.operator === "lte" ? "less" : "more"}`;
    case "leader-power":
      return `${side(condition.player, "your", "your opponent's")} Leader at ${condition.value} power or ${condition.operator === "lte" ? "less" : "more"}`;
    case "leader-battled-character":
      return `${side(condition.player, "your", "your opponent's")} Leader to have battled a Character this turn`;
    case "life-versus":
      return `${side(condition.player, "your", "your opponent's")} Life at or ${condition.operator === "lte" ? "below" : "above"} the other side's`;
    case "combined-life":
      return comparison(
        condition.operator,
        condition.value,
        "Life cards between both players",
      );
    case "event-activated-this-turn":
      return `an Event with a base cost of ${condition.minBaseCost} or more activated this turn`;
    default:
      return null;
  }
}

/**
 * Whether this condition's answer is settled for the whole game.
 *
 * A Leader's identity, type, attribute and colours are chosen before the first
 * turn and cannot change, so nothing a player does moves such a gate. Every
 * other kind can turn on within a game, which is what makes it worth reporting.
 */
export function conditionFixedForGame(condition: MechanicCondition): boolean {
  switch (condition.kind) {
    case "leader-has-type":
    case "leader-has-name":
    case "leader-has-attribute":
    case "leader-has-color":
    case "leader-type-including":
    case "leader-multicolored":
      return true;
    case "all-of":
    case "any-of":
      return condition.conditions.every(conditionFixedForGame);
    default:
      return false;
  }
}

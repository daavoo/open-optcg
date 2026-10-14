/**
 * What rules a recorded game was played under.
 *
 * A trace is the project's bug-report currency, and an action list is only
 * replayable against the rules that produced it: change a card's text or add a
 * program, and a trace recorded last week can become illegal halfway through.
 * Before this stamp existed, that failed as `REPLAY_ILLEGAL_ACTION` at whatever
 * revision happened to diverge -- a message about the wrong thing, since the
 * trace was not wrong, it was old.
 *
 * So every export carries this stamp and every loader compares it, which turns
 * "replays illegal at r43" into "this trace predates the current rules".
 */
import { cardRegistry } from "@one-piece-sim/cards";
import { canonicalJson } from "./canonical.js";
import { RULES_VERSION } from "./rules-version.js";
import { mechanicProgramsByClause } from "./card-mechanics.js";
import { sha256Hex } from "./sha256.js";
import { STATIC_ABILITIES } from "./static-abilities.js";

export interface RulesStamp {
  /** The engine's own rules version, as `GameState.rulesVersion` reports it. */
  rulesVersion: string;
  /**
   * Content hash of every card's rules-relevant printed fields.
   *
   * Cost, power, counter, colours, types, attribute, effect and trigger text --
   * the inputs legality reads. Deliberately not the whole `CardDefinition`:
   * rarity, art and provenance change without changing a single decision.
   */
  cardDataHash: string;
  /**
   * Content hash of which clauses have programs, and which cards have static
   * layers.
   *
   * Catches a card gaining or losing an implementation, which is the common
   * cause of a trace going illegal. It does not catch a change *inside* an
   * existing program -- that would need hashing the program trees, which are
   * closures in places. A mismatch is therefore proof of incompatibility, and a
   * match is strong but not total evidence of compatibility.
   */
  programHash: string;
}

let cached: RulesStamp | undefined;

/** The stamp for the rules this build implements. Computed once. */
export function rulesStamp(): RulesStamp {
  if (cached) return cached;
  const cards = [...cardRegistry.values()]
    .map((card) => ({
      cardNumber: card.cardNumber,
      category: card.category,
      cost: card.cost,
      power: card.power,
      counter: card.counter,
      colors: card.colors,
      types: card.types,
      attribute: card.attribute,
      // The text itself is not in the build; what the rules read off it is,
      // and the hash of the text it was read from proves which reading.
      rules: card.rules,
      officialTextHash: card.officialTextHash ?? null,
    }))
    .sort((left, right) => left.cardNumber.localeCompare(right.cardNumber));
  const programs = [...mechanicProgramsByClause()]
    .map(([clause, claimed]) => [clause, [...claimed].sort()] as const)
    .sort((left, right) => left[0].localeCompare(right[0]));
  const statics = STATIC_ABILITIES.map((ability) => ability.cardNumber).sort();

  cached = {
    rulesVersion: RULES_VERSION,
    cardDataHash: sha256Hex(canonicalJson(cards)),
    programHash: sha256Hex(canonicalJson({ programs, statics })),
  };
  return cached;
}

export { RULES_VERSION } from "./rules-version.js";

/**
 * Why a stamp does not match, phrased for whoever is holding the trace.
 *
 * Returns null when the recording is replayable. `null` for a missing stamp is
 * deliberate: traces exported before stamping existed are still worth trying,
 * and the replay's own legality check reports it if they have gone stale.
 */
export function describeStampMismatch(
  recorded: RulesStamp | undefined,
  current: RulesStamp = rulesStamp(),
): string | null {
  if (!recorded) return null;
  if (recorded.rulesVersion !== current.rulesVersion) {
    return `This recording was made under rules ${recorded.rulesVersion}; this build implements ${current.rulesVersion}.`;
  }
  if (recorded.cardDataHash !== current.cardDataHash) {
    return "This recording was made under different card data (text or stats changed since), so its actions may no longer be legal.";
  }
  if (recorded.programHash !== current.programHash) {
    return "This recording was made before a card-implementation change, so its actions may no longer be legal.";
  }
  return null;
}

import {
  clauseParts,
  clauseTextOf,
  counterClauseParts,
  type ClauseMarker,
} from "@one-piece-sim/cards";
import { formatCompactStat } from "@one-piece-sim/engine-core";

export function defenseStopsAttack(
  attackPower: number,
  defensePower: number,
): boolean {
  return defensePower > attackPower;
}

type BattleCounterEvent = {
  type: string;
  playerId?: string;
  /** Nullable because a redacted `card-moved` step carries no identity. */
  cardNumber?: string | null;
  power?: number;
};

export function opponentCounterCardsForLatestBattle(
  events: readonly BattleCounterEvent[],
  viewer: string,
): { cardNumber: string; power?: number }[] {
  const counters: { cardNumber: string; power?: number }[] = [];
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]!;
    if (event.type === "attack-declared") break;
    if (
      (event.type === "counter-used" || event.type === "event-activated") &&
      event.playerId !== viewer &&
      typeof event.cardNumber === "string"
    ) {
      counters.unshift({
        cardNumber: event.cardNumber,
        ...(event.type === "counter-used" && typeof event.power === "number"
          ? { power: event.power }
          : {}),
      });
    }
  }
  return counters;
}

/**
 * A cost that is not the number printed on the card, and which way it moved.
 *
 * Returned rather than rendered so the rule -- show this only when the engine
 * and the art disagree -- is testable without a DOM. `null` means the printed
 * number is the truth and the face should stay as it is: an overlay that
 * repeats what the art already says is noise on every card in the hand.
 *
 * Both zones feed this. In hand it is the play price, which is the figure the
 * player is deciding on: ST33-004 Borsalino prints 6 and is played for 3 on
 * the turn an effect trashed a card from its controller's hand, and nothing on
 * the board or the card said so. On the field it is `currentCost`, what a
 * "cost N or less" effect measures this Character by -- OP15-088 Pirates
 * Docking Six prints 5 and stands there as an 11.
 */
export function costOverlay(
  printedCost: number | undefined,
  currentCost: number | undefined,
): { cost: number; direction: "lowered" | "raised"; title: string } | null {
  if (printedCost === undefined || currentCost === undefined) return null;
  if (currentCost === printedCost) return null;
  const direction = currentCost < printedCost ? "lowered" : "raised";
  return {
    cost: currentCost,
    direction,
    title: `Cost ${direction} from ${printedCost} to ${currentCost} by an effect`,
  };
}

/** For interpolating a card's name -- dots, quotes and all -- into a regex. */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The summary with the parts the picture already carries taken out.
 *
 * A button that prints a card face prints most of the offer beside its words:
 * the card that acts is the one the reader selected to get here, and the card
 * acted on is the face on the button. "Activate Monkey.D.Luffy: give 1 rested
 * DON!! to Jinbe" therefore spends thirteen words, and three lines of wrap, to
 * say the one thing that is not on screen -- how many DON!!. Only the pictured
 * card's own name is removed from the tail, by name, so a summary that ends in
 * anything else keeps it -- along with the identifiers the engine appends for
 * a text-only caller, "[ST21-001] (Leader, 5000 power)", which the face and
 * the board beside it already say.
 *
 * `sourceName` is passed only where the acting card is the one the reader
 * selected to open the panel: a cost the summary states as "Rest Thousand
 * Sunny and ..." is then the selected card's own name and its printed "You
 * may rest this Stage", both quoted directly above the button.
 */
export function picturedSummary(
  actionSummary: string,
  cardName: string,
  sourceName?: string,
): string {
  const summary = actionSummary.replace(/^Activate [^:]+: /, "");
  // When the cost is the only thing between the verb and the pictured card
  // -- "Rest Kuina and the opponent's Brook [ST31-003] (Character, 7000
  // power, active)" -- taking the cost out leaves a button labelled with a
  // bare card description and no verb at all. The verb is the half of that
  // sentence the picture cannot draw, so this keeps it: "Rest Brook".
  const restingTarget = sourceName
    ? new RegExp(
        `^(\\w+) ${escapeRegExp(sourceName)} and (?:the opponent's |your )?${escapeRegExp(cardName)}(?:\\s+\\[[^\\]]+\\])?(?:\\s+\\([^)]*\\))?$`,
      ).exec(summary)
    : null;
  if (restingTarget) return `${restingTarget[1]} ${cardName}`;
  const trimmed = summary
    .replace(
      sourceName ? new RegExp(`^Rest ${escapeRegExp(sourceName)} and `) : /^$/,
      "",
    )
    .replace(
      new RegExp(
        `\\s+(?:to|on|of|from)\\s+${escapeRegExp(cardName)}(?:\\s+\\[[^\\]]+\\])?(?:\\s+\\([^)]*\\))?$`,
      ),
      "",
    )
    // When the pictured card is named mid-sentence -- "Activate Trigger
    // targeting the opponent's Sabo [OP13-004] (Leader, 8000 power); it cannot
    // attack this turn" -- the whole phrase cannot go: which side owns the
    // target is the difference between a trade and a mistake, and the button's
    // face does not say it. The identifiers can: the number and the
    // parenthesised role and power are the three things the face prints.
    .replace(
      new RegExp(
        `${escapeRegExp(cardName)}(?:\\s+\\[[^\\]]+\\])?(?:\\s+\\((?:Leader|Character|Stage)[^)]*\\))?`,
      ),
      cardName,
    );
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

type RevealEvent = {
  type: string;
  cardNumber?: string | null;
  sourceCardNumber?: string;
  visibleTo?: string;
};

/**
 * The cards a private look showed the viewer, and the card that showed them.
 *
 * "Look at 5 cards from the top of your deck; reveal up to 1 <match> and add it
 * to your hand" is two things to the player and the engine only ever surfaced
 * one of them. The pick is a decision, so it becomes a prompt; the *look* is
 * information, and it arrived only as `card-revealed` rows in the history
 * drawer, which is closed by default.
 * When nothing matched there was not even that -- `executeMechanicProgram`
 * drops a `choose` whose candidate set is empty, so a whiffed Otama resolved
 * with no prompt at all and the five cards the player is entitled to have seen
 * went to the bottom of the deck unseen.
 *
 * A private look is a `card-revealed` carrying a `visibleTo`; a public reveal
 * omits it and is already on the board for both players. Grouped by source and
 * reduced to the last group because the decision on screen belongs to the last
 * look: two searches in one action would otherwise show one strip of faces
 * under a prompt that only asks about half of them.
 */
export function lookedAtCards(
  events: readonly RevealEvent[],
  viewer: string,
): { sourceCardNumber: string; cardNumbers: string[] } | null {
  const looks: { sourceCardNumber: string; cardNumbers: string[] }[] = [];
  for (const event of events) {
    const { cardNumber, sourceCardNumber } = event;
    if (
      event.type !== "card-revealed" ||
      event.visibleTo !== viewer ||
      typeof cardNumber !== "string" ||
      typeof sourceCardNumber !== "string"
    )
      continue;
    const current = looks.at(-1);
    if (current?.sourceCardNumber === sourceCardNumber)
      current.cardNumbers.push(cardNumber);
    else looks.push({ sourceCardNumber, cardNumbers: [cardNumber] });
  }
  return looks.at(-1) ?? null;
}

/**
 * The two events that name a clause as the cause of the steps behind it:
 * one the player was never asked about, one they clicked.
 */
const MARKER_TYPES = new Set(["ability-triggered", "ability-activated"]);

/**
 * The steps of an action that fired on their own, or null if none did.
 *
 * A player's own click can still move the board without them: their Leader
 * answering a `DON!! −N` (OP09-061 Monkey.D.Luffy refunds two), an `[On K.O.]`
 * paying out on a Character they just killed. An `[Activate: Main]` is the
 * same problem from the other end -- the click is theirs, but on a Leader,
 * which never leaves the board, the consequence has no card movement to show
 * it (OP14-020 Dracule Mihawk stands three DON!! up; OP15-058 Enel pulls five
 * out of the DON!! deck).
 *
 * The engine announces each such clause with a marker step naming the card --
 * `ability-triggered` for the ones nobody asked for, `ability-activated` for
 * the ones the player clicked -- and every step the clause then reports names
 * that same card as its source, so a group is the marker plus the run behind
 * it that still names it.
 *
 * A step naming no source at all ends the group rather than joining it: this
 * is the list a panel will draw beside one card's face, and a step with
 * nothing to check the attribution against is one it cannot honestly claim.
 *
 * The marker itself is dropped from a group that has any such step behind it.
 * Every one of them draws the card that fired, so keeping it printed the
 * Leader's face three times over -- once to say it had acted, twice for the
 * two DON!! it put back -- and "it fired on its own" is what the panel's own
 * heading says. A group with nothing behind it keeps the marker: a clause
 * whose steps all name no source (DON!! attaching, damage) would otherwise
 * vanish from the panel entirely, and *that it fired* is then the only thing
 * there is to report.
 *
 * Typed structurally, like the readers above it, so the whole derivation can
 * be tested without a match.
 */
export function automaticSteps<Event extends { type: string }>(
  events: readonly Event[],
): readonly Event[] | null {
  const steps: Event[] = [];
  for (const [index, event] of events.entries()) {
    if (!MARKER_TYPES.has(event.type)) continue;
    const source = (event as { sourceCardNumber?: string }).sourceCardNumber;
    const caused: Event[] = [];
    for (const later of events.slice(index + 1)) {
      if ((later as { sourceCardNumber?: string }).sourceCardNumber !== source)
        break;
      caused.push(later);
    }
    // A bare `ability-activated` is dropped rather than kept: the player
    // clicked the ability, so "it fired" is the one thing they already know,
    // and a panel saying only that is a click to dismiss news of their own
    // click. The automatic marker keeps its bare form for the opposite
    // reason -- that it fired at all is precisely what nobody asked for.
    if (caused.length === 0 && event.type === "ability-activated") continue;
    steps.push(...(caused.length > 0 ? caused : [event]));
  }
  return steps.length > 0 ? steps : null;
}

/**
 * The heading for the panel those steps go in.
 *
 * Read off the raw events rather than the steps, because `automaticSteps`
 * drops the marker row that says which of the two kinds this was. An action
 * carrying both -- a clicked ability whose steps woke an automatic one -- is
 * titled for the automatic half, which is the half the player did not ask for
 * and so the half the heading has to account for.
 */
export function automaticNoticeTitle(
  events: readonly { type: string }[],
): string {
  return events.some((event) => event.type === "ability-triggered")
    ? "Fired on its own"
    : "Ability resolved";
}

/**
 * Whether a DON!! payment on offer still has to be named.
 *
 * `DON!! −N` is paid before it is chosen: the engine takes the cheapest DON!!
 * off the field, runs the clause, and asks which pool each one came out of
 * once the action has finished resolving. A Leader watching for returned DON!!
 * -- OP09-061 Monkey.D.Luffy -- has therefore already fired by the time that
 * prompt is raised, and a panel reporting it lands on top of a decision the
 * player has not been given yet. Steps that fired on their own wait for this
 * to go false.
 *
 * Both printed shapes count: the count prompt a "return 1 or more" asks first,
 * and the per-DON!! pool prompts both shapes end on.
 *
 * Typed structurally, like the readers above it, so the rule can be tested
 * without a match.
 */
export function donPaymentUnsettled(
  actions: readonly { type: string; option?: { kind: string } }[],
): boolean {
  return actions.some(
    (action) =>
      action.type === "resolve-effect" &&
      (action.option?.kind === "don-return" ||
        action.option?.kind === "don-return-count"),
  );
}

/**
 * A [Counter] Event offer, as short as the counter cards beside it.
 *
 * The engine's summary quotes the printed clause and then spells the
 * arithmetic out -- "You may trash 1 card from your hand: Up to 1 of your
 * Leader or Character cards gains +3000 power during this battle. (+3000;
 * defense becomes 6000 vs 3000 attack: attack is stopped)" -- because a
 * text-only caller has nothing else to read. This screen already prints the
 * card, and the battle context above the list already prints both powers, so
 * all that is left to say is the cost, the number, and whatever the Event does
 * that is not adding power: "Trash 1 · Counter +3k".
 *
 * `power` is the engine's, which has resolved the clause's board-state
 * conditions; `undefined` means it will not promise one before the Event
 * resolves, and the printed number is then the most that can be offered.
 */
export function counterEventSummary(
  cardNumber: string,
  power: number | undefined,
): string {
  const parts = counterClauseParts(cardNumber);
  if (!parts) return "";
  const printed = parts.power;
  const counter =
    power === undefined
      ? printed
        ? `Counter up to +${formatCompactStat(printed)}`
        : "Counter"
      : power > 0
        ? `Counter +${formatCompactStat(power)}`
        : // Only a Counter with a second half is offered once it can add no
          // power, so this labels that half rather than reading as a no-op.
          "No counter power";
  return [parts.cost, counter, parts.rest].filter(Boolean).join(" · ");
}

/**
 * An optional-effect offer, as short as the Counter beside it.
 *
 * The engine names the card on every one of these -- "Activate Charlotte
 * Linlin [OP17-112]: [printed text omitted -- pnpm card:text <card>]" -- because a text-only
 * caller reads nothing else. On screen it reads the card twice: the decision
 * modal already heads itself "Resolve Charlotte Linlin's card effect", and for
 * an `[On Your Opponent's Attack]` prints both battle powers above the buttons
 * as well. So the name comes back off the button and what is left is the part
 * that differs between the two buttons.
 *
 * For an `[On Your Opponent's Attack]` that is the cost, the number, and
 * whatever the ability does that is not adding power: "Trash 1 · +1k power".
 * For every other optional effect it is the clause the engine quoted, or --
 * in a build with no text pack, which is the shipped one -- the printed marker
 * and cost the engine fell back to.
 *
 * Falls back to the engine's summary whenever there is nothing shorter to say,
 * so a button is never labelled with less than the action it takes.
 */
export function optionalEffectSummary(
  actionSummary: string,
  sourceCardNumber: string,
): string {
  // The engine writes the pair as "Activate <name> [<number>]..." and "Don't
  // apply <name> [<number>]'s effect". Matching the card number keeps the
  // shortening off every other resolve-effect summary, which names no card
  // and says its own thing.
  const marker = `[${sourceCardNumber}]`;
  const at = actionSummary.indexOf(marker);
  if (at < 0) return actionSummary;
  // The refusal carries no information past the card the heading already
  // names, so on screen it is the word itself.
  if (actionSummary.startsWith("Don't apply ")) return "Don't apply";
  // A later "up to" step of a clause already paid for: the step is the
  // decision, and the heading already names the card and the clause.
  if (actionSummary.startsWith("Skip this step ")) return "Skip this step";
  if (actionSummary.startsWith("Continue ")) {
    const colon = actionSummary.indexOf(": ", at);
    const step = colon < 0 ? "" : actionSummary.slice(colon + 2).trim();
    return step ? `${step[0]!.toUpperCase()}${step.slice(1)}` : actionSummary;
  }
  if (!actionSummary.startsWith("Activate ")) return actionSummary;
  const parts =
    clauseParts(sourceCardNumber, "[On Your Opponent's Attack]") ??
    // OP17-064 King prints the short spelling of the same marker.
    clauseParts(sourceCardNumber, "[On Opponent's Attack]");
  if (parts) {
    const gain = parts.power
      ? `+${formatCompactStat(parts.power)} power`
      : undefined;
    const label = [parts.cost, gain, parts.rest].filter(Boolean).join(" · ");
    if (label) return label;
  }
  const rest = actionSummary
    .slice(at + marker.length)
    .replace(/^:\s*/, "")
    .trim();
  if (!rest) return actionSummary;
  // A build with no text pack has only the printed marker left, which names a
  // clause rather than describing an action -- so it takes the verb its
  // "Don't apply" counterpart already has.
  return rest.startsWith("[") && rest.endsWith("]") ? `Apply ${rest}` : rest;
}

/**
 * The placement order after the player moves one card along it.
 *
 * "[printed text omitted -- pnpm card:text <card>]" is one action
 * carrying the whole order, so the order is built on screen before anything is
 * spent, one neighbour swap at a time. A move off either end is not an error to
 * report -- the arrow that would make it is disabled -- so it returns the order
 * it was given and the panel redraws unchanged.
 */
export function moveInOrder(
  order: readonly number[],
  position: number,
  delta: number,
): number[] {
  const target = position + delta;
  if (position < 0 || position >= order.length) return [...order];
  if (target < 0 || target >= order.length) return [...order];
  const moved = [...order];
  [moved[position], moved[target]] = [moved[target]!, moved[position]!];
  return moved;
}

/**
 * One place DON!! can be taken from to pay a `DON!! −N`, and how many are
 * there.
 *
 * `key` matches the engine's own pool identity: the two loose pools by name,
 * and a card holding given DON!! by its instance id. Ordered cheapest-first by
 * the caller, in the same order `donReturnPools` offers them, so the default
 * allocation below agrees with the one the engine already made.
 */
export interface DonReturnPool {
  key: string;
  available: number;
}

/**
 * How a DON!! payment is split across the pools that could supply it.
 *
 * Returned rather than rendered, and pure, because the interesting cases are
 * the ones that are awkward to reach through a board: a pool that cannot cover
 * what was asked of it, a manual split that no longer fits a count the player
 * has since lowered, a card whose DON!! were spent while the modal was open.
 *
 * `manual` is what the player has said explicitly, per pool. Anything they have
 * not spoken for fills cheapest-first -- the same order the engine takes DON!!
 * in when nobody chooses, so opening the modal and pressing confirm pays
 * exactly what it would have paid on its own.
 *
 * A manual figure is honoured up to what its pool actually holds. Manual
 * figures totalling more than `count` are trimmed from the last pool
 * backwards: the player is lowering the count with a split already in place,
 * and the DON!! they picked first is the one they meant most.
 */
export function allocateDonReturn(
  pools: readonly DonReturnPool[],
  count: number,
  manual: Readonly<Record<string, number>>,
): Record<string, number> {
  const taken = clampToPools(pools, manual, count);
  let spoken = totalDonReturned(Object.fromEntries(taken));
  for (const pool of pools) {
    if (spoken >= count) break;
    const already = taken.get(pool.key) ?? 0;
    const room = Math.min(pool.available - already, count - spoken);
    if (room <= 0) continue;
    taken.set(pool.key, already + room);
    spoken += room;
  }
  return Object.fromEntries([...taken].filter(([, held]) => held > 0));
}

/**
 * A split the player is editing, held to what each pool actually has and to
 * the largest payment on offer.
 *
 * The difference from {@link allocateDonReturn} is that nothing is filled in:
 * the size of the payment *is* the split here, so a pool the player empties
 * stays empty rather than being topped back up from the next one along.
 *
 * `ceiling` is the largest count the engine offered, which is what the field
 * can afford. Anything past it is trimmed from the last pool backwards, so
 * raising one pool past the limit gives back the DON!! spoken for most
 * recently rather than refusing the click.
 */
export function clampDonReturn(
  pools: readonly DonReturnPool[],
  manual: Readonly<Record<string, number>>,
  ceiling: number,
): Record<string, number> {
  return Object.fromEntries(
    [...clampToPools(pools, manual, ceiling)].filter(([, held]) => held > 0),
  );
}

/** How many DON!! a split pays in total, which is the payment's size. */
export function totalDonReturned(
  allocation: Readonly<Record<string, number>>,
): number {
  return Object.values(allocation).reduce((sum, held) => sum + held, 0);
}

function clampToPools(
  pools: readonly DonReturnPool[],
  manual: Readonly<Record<string, number>>,
  ceiling: number,
): Map<string, number> {
  const taken = new Map<string, number>();
  let spoken = 0;
  for (const pool of pools) {
    const asked = manual[pool.key];
    if (asked === undefined) continue;
    const held = Math.max(0, Math.min(asked, pool.available));
    taken.set(pool.key, held);
    spoken += held;
  }
  // Trim from the last spoken-for pool backwards until the split fits.
  for (
    let index = pools.length - 1;
    index >= 0 && spoken > ceiling;
    index -= 1
  ) {
    const key = pools[index]!.key;
    const held = taken.get(key);
    if (held === undefined) continue;
    const trimmed = Math.max(0, held - (spoken - ceiling));
    spoken -= held - trimmed;
    taken.set(key, trimmed);
  }
  return taken;
}

/**
 * The allocation as the sequence of answers the engine will ask for, one per
 * DON!! returned, cheapest-first.
 *
 * The engine asks "which pool did this one come from" a card at a time and
 * stops early once only one pool could still supply the rest, so this is a
 * queue to be drawn from rather than a fixed number of answers.
 */
export function donReturnPlan(
  pools: readonly DonReturnPool[],
  allocation: Readonly<Record<string, number>>,
): string[] {
  return pools.flatMap((pool) =>
    Array.from({ length: allocation[pool.key] ?? 0 }, () => pool.key),
  );
}

/**
 * The printed clause a decision modal is asking about, when it can be named.
 *
 * The modal heads itself "Resolve Lucy's card effect" and then lists the
 * cards; what it never said is what the effect *is*. A player reading "Choose
 * Fire Fist" over a hand of Events has to remember, mid-battle, that their
 * Leader trades Events for battle power -- and a Leader never moves off the
 * mat, so there is nowhere to click to find out.
 *
 * Named from the card's committed clause list plus the timing the decision
 * arrives at, and `undefined` where those two do not settle it: a card with
 * one printed clause is that clause, and a card with several is the one
 * matching the battle the player is in. An `[Activate: Main]` quoted at a
 * defender would be worse than quoting nothing, which is the same bar
 * `optionalClauseMarker` sets engine-side.
 */
export function resolvingClauseMarker(
  clauses: readonly string[],
  timing: "attacking" | "defending" | null,
): string | undefined {
  if (clauses.length === 0) return undefined;
  if (clauses.length === 1) return clauses[0];
  // Both spellings of the opponent's-attack marker are in the pool -- OP17-064
  // King prints the short one -- and a card prints one or the other.
  const timed =
    timing === "attacking"
      ? ["[When Attacking]"]
      : timing === "defending"
        ? ["[On Your Opponent's Attack]", "[On Opponent's Attack]"]
        : [];
  return timed.find((marker) => clauses.includes(marker));
}

/**
 * The text of one printed clause, for quoting above the options.
 *
 * `clauseTextOf` cuts the clause at the next marker, which leaves nothing at
 * all for the first half of a clause printed under two markers at once:
 * OP15-002 Lucy's "[When Attacking]/[On Your Opponent's Attack] You may trash
 * any number of Event or Stage cards..." is one sentence owned by both. The
 * siblings are stepped over so either marker quotes the sentence they share.
 *
 * Takes the effect string rather than a card number so it is testable without
 * a printed-text pack -- the words are a runtime asset, and the shipped build
 * has none until the player loads one.
 */
export function clauseQuote(
  effect: string,
  marker: string,
): string | undefined {
  const start = effect.indexOf(marker);
  if (start === -1) return undefined;
  let owner = marker;
  let cursor = start + marker.length;
  for (;;) {
    const joined = /^\s*\/\s*(\[[^\]]+\])/.exec(effect.slice(cursor));
    if (!joined) break;
    owner = joined[1]!;
    cursor += joined[0].length;
  }
  return clauseTextOf(effect, owner as ClauseMarker) || undefined;
}

/**
 * What choosing this card does to it, for a button whose face already names it.
 *
 * "Choose Fire Fist" beside a picture of Fire Fist says only the word
 * "choose", and the choice it is labelling spends the card. The engine reports
 * where the card is going whenever that move is the whole of the choice, so
 * the verb is the engine's own answer rather than a reading of the printed
 * text.
 *
 * Only the three moves whose verb is unambiguous from the zone alone. A card
 * going to the deck is going to one of its two ends and the field does not say
 * which; one arriving on the board may be played, given or returned. Both keep
 * the summary the engine wrote.
 */
export function destinationVerb(destination: {
  zone: string;
  player: "self" | "opponent" | "owner";
}): string | undefined {
  if (destination.zone === "trash") return "Trash";
  if (destination.zone === "hand")
    return destination.player === "self" ? "Add to hand" : "Return to hand";
  if (destination.zone === "life") return "Add to Life";
  return undefined;
}

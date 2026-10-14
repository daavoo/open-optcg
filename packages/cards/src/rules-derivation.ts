import type {
  CardKeyword,
  CardRules,
  ClauseSummary,
} from "@one-piece-sim/protocol";
import type { PrintedText } from "./text.js";

/**
 * Everything the rules read off a card's printed text, derived in one place.
 *
 * The text is Bandai's copyright, so it is neither committed nor shipped. What
 * is committed is the output of {@link deriveRules}: `pnpm reference:audit`
 * runs it over the text it fetched and writes the result into the generated
 * card modules, and every consumer -- engine, agents, deck builders, UI -- reads
 * those fields. A hand-authored record that still carries its text derives the
 * same fields at load time through the same function, so the two kinds of
 * record are indistinguishable to a reader.
 *
 * Every regex here used to live beside its one consumer: `keywordsOf` in the
 * registry, `LEADER_CANNOT_ATTACK` in the engine, `isDeadWeightDebuff` in a
 * policy, `REMOVAL_TEXT` in the sealed builder. They moved unchanged; the
 * comments explaining each came with them. Deriving rather than hand-listing
 * is what keeps a card that arrives through the audit from needing a second
 * edit, and keeping the derivations together is what lets the text leave.
 */

/**
 * Printed keywords, derived from official card text.
 *
 * `STATIC_ABILITIES` in the engine stays the authority for *conditional*
 * keywords, which depend on board state and therefore cannot live in a
 * per-card-number table.
 */
const KEYWORD_MARKERS: ReadonlyArray<[string, CardKeyword]> = [
  ["[Rush: Character]", "Rush: Character"],
  ["[Rush]", "Rush"],
  ["[Blocker]", "Blocker"],
  ["[Double Attack]", "Double Attack"],
  ["[Banish]", "Banish"],
  ["[Unblockable]", "Unblockable"],
];

/**
 * Text that *grants* the keyword the marker names, rather than printing it.
 *
 * "gains [Blocker]" is a clause somebody has to pay for or satisfy a condition
 * for -- an [Activate: Main] cost, an [Opponent's Turn] condition, or a grant
 * aimed at another card entirely. Reading it as printed text handed the keyword
 * over for free and permanently: OP15-060 Enel blocked without ever paying the
 * DON!! −1 and the card from hand its text charges, OP16-048 Buggy blocked in
 * place of the [Prisoner of Impel Down] it is supposed to give [Blocker] to,
 * and OP15-047 Sanji attacked as [Unblockable] while granting that to someone
 * else. The chain is matched because "gains [Rush] and [Blocker]" grants both.
 */
const GRANTED_KEYWORD = /gains?\s+(?:\[[^\]]+\]\s*(?:and|or|,)\s*)*$/;

/**
 * Text that *denies* the keyword the marker names, rather than printing it.
 *
 * "[printed text omitted -- pnpm card:text OP15-047]" is a restriction the card imposes on
 * somebody else, and reading it as printed text handed the card the keyword:
 * ST21-003 Sanji and OP16-063 Kuzan are Characters, so the Event-only exemption
 * in `printedClauses` never reached them, and both could block. The `[Blocker]`
 * they mention belongs to the opponent's board, not to them.
 */
const DENIED_KEYWORD = /cannot activate\s+$/;

/**
 * Text that watches *somebody else* use the keyword, rather than printing it.
 *
 * OP09-118 Gol.D.Roger reads "when your opponent activates [Blocker], ... you
 * win the game". The keyword named there is the opponent's, and reading it as
 * printed text made a 13000 [Rush] body a [Blocker] as well -- the same class
 * of mistake `DENIED_KEYWORD` exists for, from the other direction: that one is
 * a restriction imposed on the opponent, this one is an observation of them.
 *
 * The article is optional because the pool prints the sentence both ways:
 * Roger's reads "activates [Blocker]" and ST10-006 Monkey.D.Luffy's reads
 * "activates a [Blocker]". Without it the second spelling slipped through and
 * made a 10-cost 11000 [Rush] body a [Blocker] too -- and a Character that
 * blocks for free is a different card from the one that punishes a block.
 *
 * OP15-119 Monkey.D.Luffy names the Event first -- "activates an Event or
 * [Blocker]" -- so the watched pair is allowed ahead of the marker too; without
 * it the 7000 [Rush] finisher read as a [Blocker].
 */
const OPPONENT_KEYWORD =
  /(?:opponent|they)\s+activates?\s+(?:an?\s+)?(?:Event\s+or\s+)?$/;

/**
 * Text that uses the keyword to *pick out* Characters, rather than printing it.
 *
 * ST30-012 Monkey.D.Luffy's "[When Attacking] Rest up to 1 of your opponent's
 * [Blocker] Characters" names the keyword as a filter on its target, and
 * reading it as printed text made Luffy a [Blocker] himself. A printed keyword
 * is followed by its reminder text or the next clause, never by the noun it
 * qualifies, so this reads what comes after the marker rather than before it.
 */
const FILTER_KEYWORD = /^\s*Characters?\b/;

/**
 * Every occurrence has to be a grant or a denial before the keyword is dropped:
 * OP15-047 Sanji prints [Blocker] and grants [Unblockable] in the same text, and
 * only the granted one is somebody else's.
 */
function keywordsOf(effect: string): CardKeyword[] {
  return KEYWORD_MARKERS.filter(([marker]) => {
    let printed = false;
    for (
      let index = effect.indexOf(marker);
      index !== -1 && !printed;
      index = effect.indexOf(marker, index + marker.length)
    ) {
      const before = effect.slice(0, index);
      const after = effect.slice(index + marker.length);
      printed =
        !FILTER_KEYWORD.test(after) &&
        !GRANTED_KEYWORD.test(before) &&
        !DENIED_KEYWORD.test(before) &&
        !OPPONENT_KEYWORD.test(before);
    }
    return printed;
  }).map(([, keyword]) => keyword);
}

/**
 * The DON!! count a card's own text demands, from its `[DON!! xN]` condition.
 *
 * Takes the largest when a card prints several, because that is the point at
 * which all of its conditional text is live.
 */
function donRequirementOf(effect: string): number {
  const counts = [...effect.matchAll(/\[DON!!\s*[x×]\s*(\d+)\]/g)].map(
    (match) => Number(match[1]),
  );
  return counts.length > 0 ? Math.max(...counts) : 0;
}

/**
 * Markers that open a new timed clause, and so close the one before them.
 *
 * Deliberately not every bracketed token: `[Once Per Turn]` and `[DON!! xN]`
 * qualify the clause they sit in rather than starting one, and `[Blocker]`,
 * `[Rush]` and card names like `[Enel]` appear mid-sentence. Cutting on those
 * would truncate the text at its first keyword.
 */
export const CLAUSE_MARKERS = [
  "[Activate: Main]",
  "[Main]",
  "[Counter]",
  "[On Play]",
  "[On K.O.]",
  "[When Attacking]",
  "[When Blocking]",
  "[On Block]",
  "[On Your Opponent's Attack]",
  // OP17-064 King prints the short spelling. Both are listed because clause
  // markers are matched literally, and a marker missing from this list is a
  // clause `clauseText` cannot name and cannot use as a boundary.
  "[On Opponent's Attack]",
  "[End of Your Turn]",
  "[End of Your Opponent's Turn]",
  "[Opponent's Turn]",
  "[Your Turn]",
  "[Trigger]",
] as const;

export type ClauseMarker = (typeof CLAUSE_MARKERS)[number];

/**
 * The text of one timed clause, against printed text the caller holds.
 *
 * A caller that asks "what does this card's [On K.O.] do" must not answer it by
 * testing the *whole* effect string: a Character with "[On Play] ... add 1 card
 * to your Life" and "[On K.O.] Draw 1 card" reads as a K.O. that pays its
 * controller Life, and does not. Splitting on the same {@link CLAUSE_MARKERS}
 * the coverage gate uses is what keeps the two readings of a card the same
 * reading.
 */
export function clauseTextOf(
  effect: string,
  marker: ClauseMarker,
): string | undefined {
  const start = effect.indexOf(marker);
  if (start === -1) return undefined;
  const body = effect.slice(start + marker.length);
  const end = CLAUSE_MARKERS.map((candidate) => body.indexOf(candidate))
    .filter((index) => index !== -1)
    .reduce((earliest, index) => Math.min(earliest, index), body.length);
  // Reminder text in parentheses restates a keyword the reader already has.
  return body
    .slice(0, end)
    .replace(/\([^()]*\)/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([:,.])/g, "$1")
    .trim();
}

/**
 * A printed clause, split into the parts a label needs.
 *
 * Nearly every Counter Event prints the same sentence -- "[printed text omitted -- pnpm card:text <card>]" -- and a UI
 * that quotes it spends six lines saying what the engine already states as a
 * number. Splitting the clause leaves the two things the number does not say:
 * what the clause costs, and what it does *besides* adding power. The
 * `[On Your Opponent's Attack]` abilities print that same sentence behind that
 * same kind of cost, which is why the split is taken per marker rather than
 * per Event.
 *
 * `hasOtherEffect` is also the test for "this only adds power", which is how
 * the Counter step knows an Event is worth offering into a battle the defender
 * has already won. `rest` is the text of that other effect and is only present
 * when the caller holds the text; the summary committed with the card carries
 * the other three fields.
 */
export type ClauseParts = ClauseSummary & {
  /** Whatever the clause does beyond granting power during this battle. */
  rest?: string;
};

/** A whole sentence that only grants power for the current battle. */
const BATTLE_POWER_SENTENCE =
  /^(?:then, )?(?:if [^,]+, )?(?:up to \d+ of your .+?|your leader|that card) gains(?: an additional)? \+\d+ power during this battle\.?$/i;

function compactCostPhrase(phrase: string): string {
  const trash = /^trash (\d+) cards? from your hand$/i.exec(phrase);
  if (trash) return `Trash ${trash[1]}`;
  const rest = /^rest (\d+) of your cards$/i.exec(phrase);
  if (rest) return `Rest ${rest[1]}`;
  const restedDon = /^rest (\d+) of your DON!! cards$/i.exec(phrase);
  if (restedDon) return `Rest ${restedDon[1]} DON!!`;
  const returned = /^return (\d+) of your Characters\b/i.exec(phrase);
  if (returned) return `Return ${returned[1]}`;
  return phrase.charAt(0).toUpperCase() + phrase.slice(1);
}

/**
 * The printed cost, compacted -- each half of a conjunction on its own.
 *
 * An `[On Your Opponent's Attack]` cost is more often two things than a
 * Counter's is -- OP17-057 Fullalead rests its own Stage *and* trashes a card
 * -- and compacting the whole string as one phrase would leave both halves
 * quoted in full.
 */
function compactClauseCost(cost: string): string {
  const [first, ...others] = cost
    .replace(/^You may /i, "")
    .split(/ and (?=\w)/)
    .map(compactCostPhrase);
  return [
    first,
    ...others.map((phrase) => phrase.charAt(0).toLowerCase() + phrase.slice(1)),
  ].join(" and ");
}

export function clausePartsOf(
  effect: string,
  marker: ClauseMarker,
): ClauseParts | undefined {
  const printed = clauseTextOf(effect, marker);
  if (printed === undefined) return undefined;
  // `[Once Per Turn]` and `[DON!! xN]` qualify the clause rather than opening
  // one, so `clauseText` keeps them; a label states a cost and an effect, and
  // the engine only offers an ability whose qualifiers are already satisfied.
  const clause = printed
    .replace(/^(?:\[Once Per Turn\]|\[DON!!\s*[x×]\s*\d+\])\s*/g, "")
    .trim();
  // A cost is printed ahead of a colon: "[printed text omitted -- pnpm card:text <card>]"
  // or "DON!! -1:". Only the first colon can be one -- the effect after it may
  // print its own -- and a sentence never precedes it.
  const colon = clause.indexOf(":");
  const cost =
    colon !== -1 && !clause.slice(0, colon).includes(".")
      ? compactClauseCost(clause.slice(0, colon).trim())
      : undefined;
  const body = colon !== -1 && cost ? clause.slice(colon + 1).trim() : clause;
  // Split on sentence ends only where a space follows, because card names
  // print dots without one -- [Monkey.D.Luffy].
  const sentences = body
    .split(/(?<=\.)\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
  const grants = sentences.filter((sentence) =>
    BATTLE_POWER_SENTENCE.test(sentence),
  );
  const power = grants.reduce(
    (total, sentence) =>
      total + Number(/\+(\d+) power/.exec(sentence)?.[1] ?? 0),
    0,
  );
  const rest = sentences
    .filter((sentence) => !BATTLE_POWER_SENTENCE.test(sentence))
    .join(" ")
    .replace(/^Then,\s*/, "");
  return {
    ...(cost ? { cost } : {}),
    ...(rest ? { rest: rest.charAt(0).toUpperCase() + rest.slice(1) } : {}),
    ...(power > 0 ? { power } : {}),
    hasOtherEffect: rest !== "",
  };
}

/**
 * Printed text that no clause marker or keyword accounts for.
 *
 * A card prints its untimed text first and its timed clauses after, so the
 * static text is whatever sits before the first marker -- minus the keywords
 * that are their own clauses and the reminder text in parentheses that restates
 * them. Three letters is the floor because what survives on a card with no
 * static text is punctuation and stray conjunctions.
 */
function staticTextOf(effect: string): string {
  const firstMarker = CLAUSE_MARKERS.map((marker) => effect.indexOf(marker))
    .filter((index) => index !== -1)
    .reduce((earliest, index) => Math.min(earliest, index), effect.length);
  const residual = effect
    .slice(0, firstMarker)
    .replace(/\([^()]*\)/g, "")
    .replace(/\[[^\]]+\]/g, "")
    .replace(/[^a-zA-Z]/g, "");
  return residual.length >= 3 ? residual : "";
}

/**
 * Every printed piece of behaviour on a card, as the unit a test can cover.
 *
 * `[On Play]` is one clause, a printed `[Blocker]` is another, and untimed text
 * ("[printed text omitted -- pnpm card:text <card>]") is `static`. The ids are what
 * `covers()` in `test/support` takes and what `pnpm coverage:clauses` requires
 * a test for.
 */
export type ClauseId = ClauseMarker | `[${CardKeyword}]` | "static";

/**
 * Whether a timing marker at `index` opens a clause, or is only *mentioned*
 * inside one.
 *
 * OP09-081 Marshall.D.Teach's Leader reads "Your [On Play] effects are
 * negated": the marker names a window the card never fires in, and a plain
 * scan reads it as a printed `[On Play]` -- which asks `card-support.test.ts`
 * for a handler that would be wrong to write, and `pnpm coverage:clauses` for a
 * test of a clause the card does not have.
 *
 * A marker opens a clause when nothing but whitespace precedes it, or when the
 * text before it ends a sentence, a bracket or a reminder: "[DON!! x1] [When
 * Attacking]" is two markers in a row, "... during this turn. [On K.O.]" is a
 * new one, every printed keyword is followed by its parenthesised reminder
 * before the next clause starts, and OP17-058 Kaido prints two windows for one
 * clause as "[When Attacking]/[On Your Opponent's Attack]". Anything else -- a marker with words in front
 * of it in the same sentence -- is a mention.
 */
function opensClause(effect: string, index: number): boolean {
  const before = effect.slice(0, index).trimEnd();
  return before.length === 0 || /[.!?:)\]"/]$/.test(before);
}

/** Every occurrence of `marker` that opens a clause rather than mentioning one. */
function markerIsPrinted(effect: string, marker: string): boolean {
  for (
    let index = effect.indexOf(marker);
    index !== -1;
    index = effect.indexOf(marker, index + marker.length)
  ) {
    if (opensClause(effect, index)) return true;
  }
  return false;
}

/**
 * A marker written as the *object* of a sentence rather than as a clause of its
 * own -- "a [When Attacking] effect", "the [Main] effect of ... Event card".
 *
 * EB-03 prints both: its Leader (EB03-001) grants [Rush] to a Character that has
 * no [When Attacking] clause, and EB03-031 Vinsmoke Reiju resolves the [Main]
 * clause of an Event in the trash. In each case the marker names a clause on
 * *another* card, or the absence of one, and the card printing the sentence
 * carries no such clause itself -- so counting it makes the coverage gate demand
 * a test for a clause the card does not have, and `card-support` demand a
 * handler for a timing the card never fires in.
 *
 * This is a second, independent filter alongside `markerIsPrinted`: that one
 * catches a mention embedded mid-sentence, this one catches a mention phrased
 * as its own sentence ("A [Main] effect ... is resolved."), which reads as
 * sentence-initial and would otherwise pass `opensClause`. Matched on the
 * determiner and the trailing noun, so a genuine clause -- which is always
 * followed by its own sentence, never by "effect" -- is untouched.
 */
const clauseMention = (marker: ClauseMarker): RegExp =>
  new RegExp(
    `(?:a|an|the|no|your|card's)\\s+${marker.replace(/[[\]]/g, "\\$&")}\\s+effect`,
    "gi",
  );

/** Whether every occurrence of `marker` in `effect` is such a mention. */
function onlyMentioned(effect: string, marker: ClauseMarker): boolean {
  const occurrences = effect.split(marker).length - 1;
  const mentions = effect.match(clauseMention(marker))?.length ?? 0;
  return mentions >= occurrences;
}

export function printedClausesOf(
  text: PrintedText,
  category: string,
): readonly ClauseId[] {
  const effect = text.effect === "-" ? "" : text.effect;
  const clauses: ClauseId[] = [];

  // Markers in printed order, so a test file reads top-to-bottom like the card.
  const markers = CLAUSE_MARKERS.filter(
    (marker) =>
      markerIsPrinted(effect, marker) && !onlyMentioned(effect, marker),
  ).sort((a, b) => effect.indexOf(a) - effect.indexOf(b));
  clauses.push(...markers);

  // Only a Character or Leader can carry a keyword. An Event that *mentions*
  // one -- OP12-077's "[printed text omitted -- pnpm card:text OP12-077]" -- reads as a
  // printed keyword to `keywordsOf`, and demanding a [Blocker] test of an Event
  // asks for evidence the card cannot produce.
  if (category !== "event") {
    for (const keyword of keywordsOf(effect)) clauses.push(`[${keyword}]`);
  }

  if (staticTextOf(effect).length > 0) clauses.push("static");
  // A Trigger is printed in its own field, so it is never in `effect`.
  if (text.trigger.length > 0 && !clauses.includes("[Trigger]")) {
    clauses.push("[Trigger]");
  }
  return clauses;
}

/** Default DON!! deck size, overridden only by a Leader that prints otherwise. */
const DEFAULT_DON_DECK_SIZE = 10;

function eventCostLimitOf(effect: string): number | null {
  const match = DECK_EVENT_COST_LIMIT.exec(effect);
  return match?.[1] ? Number(match[1]) : null;
}

function costLimitOf(effect: string): number | null {
  const match = DECK_COST_LIMIT.exec(effect);
  return match?.[1] ? Number(match[1]) : null;
}

function donDeckSizeOf(effect: string): number {
  const match = /DON!!\s*deck consists of (\d+) cards/.exec(effect);
  return match?.[1] ? Number(match[1]) : DEFAULT_DON_DECK_SIZE;
}

/**
 * "[printed text omitted -- pnpm card:text <card>]"
 *
 * A printed clause that changes what the card *is* rather than what it does, so
 * nothing dispatches it: every question about a card's name has to route through
 * `hasCardName`. EB04-038 Rosinante & Law is the first card in the pool to print
 * it, and it matters three ways at once -- OP12-108's search for a
 * "[Trafalgar Law]", the OP12-061 Leader's K.O. protection for one, and that
 * Leader's cost reduction on the next one played -- so a search that only
 * compared `definition.name` would miss the deck's best target for all three.
 */
function nameAliasesOf(effect: string, name: string): string[] {
  const clause =
    /also treat this card's name as ((?:\[[^\]]+\](?:,| and)? ?)+)/i.exec(
      effect,
    );
  const aliases = clause?.[1]
    ? [...clause[1].matchAll(/\[([^\]]+)\]/g)].map((match) => match[1]!)
    : [];
  return aliases.filter((alias) => alias !== name);
}

/**
 * "This Leader is treated as a card with all card names, types, and attributes."
 *
 * The Sealed Battle promo Leader's clause, and the second identity-rewriting
 * clause in the pool after the alias above. Where that one adds named aliases,
 * this one makes every identity question answer yes, so it cannot be expressed
 * as a list and has to be a predicate.
 */
const IDENTITY_WILDCARD =
  /treated as a card with all card names, types, and attributes/i;

/**
 * "This Leader cannot attack." and "This Character cannot attack." -- OP14-056
 * Wadatsumi, a 3-cost 5000 body with a 2000 Counter that exists to block and to
 * be trashed for value.
 *
 * The full stop is load-bearing: OP12-020 Roronoa Zoro prints "[printed text omitted -- pnpm card:text OP12-020]", a conditional restriction on *what* it may attack, and a looser
 * match would stop that Leader attacking at all.
 */
const CANNOT_ATTACK = /this (?:Leader|Character) cannot attack\./i;

/**
 * A Leader that rewrites the losing condition, in the same way "this Leader
 * cannot attack" is -- both are clauses that change the rules rather than doing
 * anything, so nothing dispatches them.
 */
const SURVIVES_EMPTY_DECK = /you do not lose when your deck has 0 cards/i;

/**
 * The stronger reading of the same rewrite: running out of cards is not
 * survived, it is *won*.
 *
 * P-117 Nami is the only printing, and it is why the two cannot share a field:
 * `survivesEmptyDeck` defers the loss to the end of the turn, and this one ends
 * the game the other way.
 */
const WINS_ON_EMPTY_DECK =
  /when your deck is reduced to 0, you win the game instead of losing/i;

/**
 * "Under the rules of this game, you can only include {X} type cards in your
 * deck" -- a deck-construction restriction rather than a game rule, so nothing
 * dispatches it and the deck editor is where it is enforced.
 */
const DECK_TYPE_RESTRICTION =
  /you can only include \{([^}]+)\} type cards in your deck/i;

/**
 * A Leader that bars Events from a printed cost upwards -- OP13-079 Imu's
 * "cannot include Events with a cost of 2 or more". A deck-construction rule,
 * enforced by the deck editor like `DECK_TYPE_RESTRICTION`.
 */
const DECK_EVENT_COST_LIMIT =
  /cannot include Events with a cost of (\d+) or more in your deck/i;

/**
 * A Leader that bars every card from a printed cost upwards -- OP12-001
 * Silvers Rayleigh's "cannot include cards with a cost of 5 or more". The
 * Events-only bar above is a different phrase, so neither pattern matches the
 * other's Leader.
 */
const DECK_COST_LIMIT =
  /cannot include cards with a cost of (\d+) or more in your deck/i;

/**
 * A Leader that plays a Stage from its deck "at the start of the game" --
 * OP13-079 Imu's {Mary Geoise}. A setup rule, so it has to be readable before
 * the first action, the same as `donDeckSize`.
 */
const OPENING_STAGE_TYPE =
  /at the start of the game, play up to 1 \{([^}]+)\} type Stage card from your deck/i;

/**
 * A [Trigger] that only gives an opponent's card −N power for the turn.
 *
 * The last clause is the important one. A Trigger that *also* K.O.s, draws,
 * rests or plays something is doing durable work, and the debuff being dead does
 * not make the whole Trigger dead. Only a Trigger that does nothing else
 * qualifies.
 */
function isDeadWeightDebuff(triggerText: string): boolean {
  if (!/opponent/i.test(triggerText)) return false;
  if (!/[−-]\s?\d[\d,]*\s*power/i.test(triggerText)) return false;
  if (!/during this (turn|battle)/i.test(triggerText)) return false;
  return !/\b(K\.O\.|draw|rest|play|trash|add|return|search)/i.test(
    triggerText,
  );
}

/**
 * Sealed: an Event whose condition the pool has to supply.
 *
 * Any conditional clause reads as `if ...`, and the Leader-identity kind always
 * reads `if your Leader ...`, which the Sealed Battle promo Leader satisfies
 * for every name and type there is. An Event without an `if` at all has no
 * condition to fail either.
 */
function eventConditionDependsOnPool(effect: string): boolean {
  if (!/\bif\b/i.test(effect)) return false;
  return !/if your leader/i.test(effect);
}

/**
 * Sealed: removes, rests, bounces, or bottom-decks something of the opponent's.
 *
 * Word-bounded (`\b...\b`) so "rest" doesn't match inside "rested" -- an
 * adjective describing a card's own state, not the action -- which is what
 * misclassified OP17-044 Captain John (a taunt/lock card) as removal. Two false
 * positives remain (OP17-021, -054): those need the verb's grammatical object
 * to be "the opponent's", which a word-proximity regex cannot tell apart from
 * "opponent" merely appearing nearby in the same clause.
 */
const REMOVAL_TEXT =
  /(K\.O\.|\brest\b|\breturn\b|\bbottom\b)[^.]{0,70}opponent|opponent[^.]{0,70}(K\.O\.|\brest\b|\breturn\b|\bbottom\b)/i;

/**
 * A card's own timing tag (e.g. `[On Your Opponent's Attack]`) can mention
 * "opponent" without describing what the effect *does* -- OP17-057 Fullalead's
 * `[On Your Opponent's Attack] You may rest this Stage...` reads as removal to
 * a plain scan otherwise, since its cost rests a Stage the controller owns.
 */
function stripLeadingTriggerTag(effect: string): string {
  return effect.replace(/^\[[^\]]*\]\s*/, "");
}

/** Sealed: draws, searches/digs, or makes the opponent discard. */
const ADVANTAGE_TEXT =
  /\bdraw\b|\bsearch\b|look at[^.]{0,40}top[^.]{0,20}(deck|life)|add[^.]{0,40}to your hand|opponent[^.]{0,40}(discard|trash)/i;

/**
 * Every distinct bracketed token, in printed order, minus a timing marker the
 * card only *mentions*.
 *
 * The mention filter is on timing markers alone: a keyword token has its own
 * grant/denial reading in `keywordsOf`, and `sealed.ts` and the web card dialog
 * read those tokens for what a card *is*.
 */
function tokensOf(effect: string): string[] {
  const markers = new Set<string>(CLAUSE_MARKERS);
  return [
    ...new Set([...effect.matchAll(/\[[^\]]+\]/g)].map((m) => m[0])),
  ].filter((token) => !markers.has(token) || markerIsPrinted(effect, token));
}

/**
 * Deck construction: "any number of this card" and "up to N copies of this
 * card" override the default of four.
 */
function copyLimitOf(effect: string): number {
  if (/any number of this card/i.test(effect)) return 50;
  const statedLimit = /up to (\d+) copies? of this card/i.exec(effect);
  return statedLimit ? Number(statedLimit[1]) : 4;
}

/** The card as the derivation needs to see it. */
export interface RulesSource extends PrintedText {
  name: string;
  category: string;
}

/** Everything the rules read off the printed text, derived once. */
export function deriveRules(card: RulesSource): CardRules {
  const effect = card.effect === "-" ? "" : card.effect;
  const trigger = card.trigger;
  const clauseSummaries: Record<string, ClauseSummary> = {};
  for (const marker of CLAUSE_MARKERS) {
    const parts = clausePartsOf(effect, marker);
    if (!parts) continue;
    clauseSummaries[marker] = {
      ...(parts.cost !== undefined ? { cost: parts.cost } : {}),
      ...(parts.power !== undefined ? { power: parts.power } : {}),
      hasOtherEffect: parts.hasOtherEffect,
    };
  }
  const koClause = clauseTextOf(effect, "[On K.O.]");
  return {
    keywords: keywordsOf(effect),
    donRequirement: donRequirementOf(effect),
    donDeckSize: donDeckSizeOf(effect),
    hasTrigger: trigger.trim().length > 0,
    hasCounterEvent: effect.includes("[Counter]"),
    // The effect box, not the card: a `[Trigger]`-only Character prints
    // nothing here and is a legal "no base effect" target. See the field's
    // own comment in `CardRules`.
    hasPrintedEffect: effect.trim().length > 0,
    clauses: printedClausesOf({ effect, trigger }, card.category),
    tokens: tokensOf(effect),
    nameAliases: nameAliasesOf(effect, card.name),
    identityWildcard: IDENTITY_WILDCARD.test(effect),
    cannotAttack: CANNOT_ATTACK.test(effect),
    mentionsCannotAttack: effect.includes("cannot attack"),
    survivesEmptyDeck: SURVIVES_EMPTY_DECK.test(effect),
    winsOnEmptyDeck: WINS_ON_EMPTY_DECK.test(effect),
    deckTypeRestriction: DECK_TYPE_RESTRICTION.exec(effect)?.[1] ?? "",
    deckEventCostLimit: eventCostLimitOf(effect),
    deckCostLimit: costLimitOf(effect),
    openingStageType: OPENING_STAGE_TYPE.exec(effect)?.[1] ?? "",
    searchRevealPublic: effect.includes("reveal"),
    clauseSummaries,
    copyLimit: copyLimitOf(effect),
    eventRestricted: /can only be used in designated events/i.test(effect),
    triggerIsDeadWeightDebuff: isDeadWeightDebuff(trigger),
    buffsAllCharacters: /all of your Characters/i.test(effect),
    koClauseMentionsLife: koClause !== undefined && /\bLife\b/i.test(koClause),
    costBoosts: [...effect.matchAll(/\+(\d+) cost/g)].map((m) => Number(m[1])),
    addsDonFromDonDeck: effect.includes("DON!! card from your DON!! deck"),
    eventConditionDependsOnPool: eventConditionDependsOnPool(effect),
    removalText: REMOVAL_TEXT.test(stripLeadingTriggerTag(effect)),
    advantageText: ADVANTAGE_TEXT.test(effect),
  };
}

import type { GameObservation, LegalAction } from "@one-piece-sim/protocol";
import {
  bestSearchResult,
  decision,
  isSearchResult,
  nonSkipEffects,
  type PolicyDecision,
} from "../generic-policy.js";
import { WEIGHT, prefer, type Heuristic } from "../heuristics.js";

/**
 * ST32 card knowledge, in one place.
 *
 * These three things -- what a card is worth, which card to play, which
 * option to take on an effect -- belong in one place because they were once
 * written twice, and the copy that decided most of ST32's matchups was the
 * one nobody had priced. Keeping them here is also what makes an ST31 matchup
 * module unnecessary.
 *
 * ## What ST32 actually does
 *
 * Reading the ladder without reading the deck makes the sequencing rules below
 * look arbitrary, so: ST32 is a rested-DON!! engine, not a power-up deck.
 *
 * Its Leader, Roronoa Zoro (OP12-020), restands once per turn if it battled a
 * Character, but only with three DON!! attached. Two cards supply those three
 * DON!! *from the rested pool* -- Tashigi's [On Play] and Kuina's repeatable
 * [Activate: Main] both read "[printed text omitted -- pnpm card:text OP12-020]". Rested DON!! is DON!! that has already been spent, so those
 * three DON!! are free: the Leader gets its ability and the turn keeps its whole
 * cost pool.
 *
 * Two consequences drive the policy:
 *
 *  - **Develop before activating the engines.** DON!! is rested by *paying costs*.
 *    Activating Kuina at the top of the turn, when every DON!! is active and the
 *    rested pool is empty, gives the Leader nothing at all. The same activation
 *    after a five-cost play gives it three.
 *  - **Attach active DON!! to the Leader last, if at all.** An active DON!! spent
 *    on the Leader is a body not played, and the engines will supply that DON!!
 *    from the rested pool for free once something has been paid for.
 */

type EffectAction = Extract<LegalAction, { type: "resolve-effect" }>;
export type PlayAction = Extract<LegalAction, { type: "play-card" }>;

/**
 * Strategic worth of each ST32 card, independent of the current board.
 *
 * Ordinal, not a power estimate: it decides which of two cards to play, trash or
 * search for, and is never compared against an in-game quantity. The engine
 * pieces sit at the top because they convert rested DON!! into Leader DON!!,
 * which is the deck's whole reason to exist.
 */
export const ST32_CARD_VALUE: ReadonlyMap<string, number> = new Map([
  ["OP15-036", 95], // Ryuma: K.O.s a rested cost-4 body on play and on attack
  ["OP12-031", 90], // Tashigi: rests a body, then loads the Leader with 3 DON!!
  ["OP12-026", 88], // Kuina: the same, repeatable every turn
  ["OP10-036", 86], // Perona: refunds a DON!! whenever an effect rests a body
  ["ST32-003", 84], // Mihawk: 7000 body that free-plays a cost-5 follow-up
  ["OP12-039", 82], // Event: a second Leader restand
  ["ST24-005", 78],
  ["ST32-004", 75],
  ["ST32-002", 72],
  ["OP12-027", 68],
  ["ST32-001", 62],
  ["OP12-028", 55],
  ["ST32-005", 45],
  ["OP12-023", 40],
  // The OP-17 post-ban list's identities. The same Leader runs this policy for
  // both lists, and a card missing here scores 0: last to be played or
  // searched for, first to be trashed.
  ["OP13-037", 80], // Zoro: sets 2 DON!! active on play, restands each turn
  ["OP13-031", 76], // Law: replays an [On Play] -- most often Tashigi's
  ["ST12-003", 70], // Mihawk: puts a second Slash body into play from hand
  ["OP12-034", 60], // Perona: a Slash search on play
  ["OP15-023", 58], // Arlong: locks rested cards when K.O.'d; Decken's fuel
  ["OP06-033", 50], // Vander Decken: K.O.s a rested body for a Fish-Man
  ["OP13-040", 48],
  ["OP12-037", 48],
]);

/**
 * Cards worth spending Counter to save.
 *
 * Everything here either generates DON!! or removes a body every turn it
 * survives, so trading a Counter card to keep one on the field is a profit. The
 * vanilla bodies are deliberately absent: they are replaceable, and Counter is
 * the same resource that keeps the Leader alive.
 */
export const ST32_PROTECTED_CARDS: ReadonlySet<string> = new Set([
  "OP10-036",
  "OP12-026",
  "OP12-031",
  "OP15-036",
  "ST32-003",
]);

/** Cards that make a hand keepable: an engine piece or an early play. */
export const ST32_KEEPABLE_OPENERS: ReadonlySet<string> = new Set([
  "OP12-028",
  "OP10-036",
  "OP12-026",
  "OP12-031",
  "ST32-001",
  "ST32-004",
]);

export function st32CardValue(cardNumber: string): number {
  return ST32_CARD_VALUE.get(cardNumber) ?? 0;
}

export function cardNumberForPlay(
  observation: GameObservation,
  action: PlayAction,
): string | undefined {
  return observation.self.hand.find(
    (card) => card.instanceId === action.cardInstanceId,
  )?.cardNumber;
}

function effectCard(observation: GameObservation, action: EffectAction) {
  return observation.self.hand.find(
    (card) => card.instanceId === action.optionId,
  );
}

/**
 * How much removing or resting an opposing Character is worth.
 *
 * Cost dominates power because cost is what the opponent actually paid, and a
 * cheap Character with a repeatable ability is still a cheap Character to
 * replace.
 */
export function opponentThreatValue(card: {
  cost: number;
  currentPower: number;
}): number {
  return card.cost * 10 + card.currentPower / 1000;
}

/**
 * Choose among the options of a pending effect.
 *
 * Split by `effectKind` rather than by a single "highest cost wins" sort,
 * because the same shape of option means opposite things in different effects:
 * Kin'emon's draw-two-trash-one asks which card to *lose*, and Mihawk's free
 * play asks which card to *keep on the field*. Ranking both by cost meant ST32
 * answered the first by trashing the best card in its hand.
 */
export function chooseSt32Effect(
  observation: GameObservation,
  effects: EffectAction[],
): PolicyDecision {
  const nonSkip = nonSkipEffects(effects);
  const kind = effects[0]?.effectKind;

  // Koushirou's replacement names both the Character it saves and the card
  // paying for it, so a `via` on the typed descriptor is exactly the option
  // that trades a rest for a K.O.
  const protectedKo = nonSkip.find(
    (action) =>
      action.option.kind === "card" && action.option.via !== undefined,
  );
  if (protectedKo)
    return decision(protectedKo, "Use the available ST32 K.O. protection.");

  if (kind === "kinemon-cost") {
    const donCost = nonSkip.find((action) => action.optionId === "don");
    if (donCost) {
      return decision(
        donCost,
        "Pay Kin'emon with DON!! and preserve the active Leader's attack.",
      );
    }
    const leaderCost = nonSkip.find((action) => action.optionId === "leader");
    if (leaderCost && observation.self.leader.rested) {
      return decision(
        leaderCost,
        "The Leader is already rested, so the optional cost removes no attack.",
      );
    }
    const skip = effects.find((action) => action.optionId === "skip");
    return decision(
      skip ?? effects[0]!,
      "Skip Kin'emon rather than exchange an active Leader attack for filtering.",
    );
  }

  if (kind === "draw-trash" || kind === "bad-manners-counter") {
    const trash = nonSkip
      .map((action) => ({ action, card: effectCard(observation, action) }))
      .filter((entry) => entry.card)
      .sort(
        (left, right) =>
          st32CardValue(left.card!.cardNumber) -
            st32CardValue(right.card!.cardNumber) ||
          left.card!.counter - right.card!.counter,
      )[0];
    if (trash)
      return decision(trash.action, "Trash the lowest strategic-value card.");
  }

  if (kind === "free-play") {
    const freePlay = nonSkip
      .map((action) => ({ action, card: effectCard(observation, action) }))
      .filter((entry) => entry.card)
      .sort(
        (left, right) =>
          st32CardValue(right.card!.cardNumber) -
          st32CardValue(left.card!.cardNumber),
      )[0];
    if (freePlay)
      return decision(
        freePlay.action,
        "Free-play the highest-value compatible card.",
      );
  }

  if (effects.some(isSearchResult)) {
    return decision(
      bestSearchResult(effects, st32CardValue) ?? effects[0]!,
      "Take the highest-value ST32 search result.",
    );
  }

  // A full Character area asks which of *your own* bodies to trash to make room,
  // and it is mandatory -- there is no skip. Answering it with the first offered
  // option gives up whichever Character was played longest ago, which for a deck
  // that develops as hard as ST32 is usually its best one. This is the same
  // "one ranking cannot answer opposite questions" failure as the free play
  // above, arriving through an effect kind that did not exist when this file
  // was written.
  if (kind === "character-area-replacement") {
    const own = new Map(
      observation.self.board.map((card) => [card.instanceId, card]),
    );
    const giveUp = [...nonSkip]
      .filter((action) => own.has(action.optionId))
      .sort((left, right) => {
        const leftCard = own.get(left.optionId)!;
        const rightCard = own.get(right.optionId)!;
        return (
          st32CardValue(leftCard.cardNumber) -
            st32CardValue(rightCard.cardNumber) ||
          leftCard.currentPower - rightCard.currentPower
        );
      })[0];
    if (giveUp)
      return decision(
        giveUp,
        "Make room with the least valuable body on the board.",
      );
  }

  const opponentValue = new Map(
    observation.opponent.board.map((card) => [
      card.instanceId,
      opponentThreatValue(card),
    ]),
  );
  const target = [...nonSkip]
    .filter((action) => opponentValue.has(action.optionId))
    .sort(
      (left, right) =>
        (opponentValue.get(right.optionId) ?? 0) -
        (opponentValue.get(left.optionId) ?? 0),
    )[0];
  if (target)
    return decision(
      target,
      "Target the opposing Character with the highest tempo value.",
    );
  return decision(
    nonSkip[0] ?? effects[0]!,
    "Resolve the best available non-skip effect.",
  );
}

/**
 * The play-ordering claims, one named rule each.
 *
 * The table above says what a card is worth in the abstract; each rule here says
 * whether *this turn* is the turn to spend it -- Ryuma with nothing rested to
 * K.O. is an 8000 body with no text, Tashigi with nothing to rest still loads
 * the Leader but wastes half its value.
 *
 * One named `prefer` each rather than one scoring function, so
 * `pnpm deck:ab --deck "(Green) Roronoa Zoro - Starter Deck 32" --disable
 * st32#<rule>` prices each claim alone.
 *
 * **Only the play ordering moves.** ST32's ladder is a whole-turn *sequencing*
 * claim -- take the restand, attack with a loaded Leader, develop, then activate
 * the engines, then attach, then attack -- and that sequence is most of what
 * the deck is worth. `rank` compares candidates of one action type and so cannot
 * express "developing beats powering up right now"; `heuristics.ts` says as much
 * at {@link Heuristic.tier}. So the sequence stays a `decide` ladder in
 * `st32-policy.ts`, and these rules narrow the play it reaches for at step 3.
 *
 * The weights keep the old function's ordering. They were ordinal there and are
 * ordinal here, and the bonuses were larger than the gaps in the table so that a
 * live ability beat a nominally better card; `WEIGHT.deck` over the table's
 * hundredths preserves that.
 *
 * Each rule is named so `pnpm deck:ab ... --disable st32#<rule>` prices it
 * alone. Almost all of what the split from the old `scoreSt32Play` was worth
 * came from pricing the six claims separately and then *deleting* one --
 * `rest-target`, a large negative; see the note above {@link ST32_PLAY_RULES}'
 * Perona rule.
 *
 * The three board-condition gates carry the file, and the shape is the same in
 * each: they are all "this card's clause is live this turn", which is the one
 * thing a static card table cannot say.
 *
 * The table itself is the result worth reading twice. `develop-by-value` is the
 * whole fourteen-entry ordinal map above, and it is close to a wash: it does
 * plenty of work and wins about as often as it loses. Its control arm is not
 * "no ordering": with it disabled
 * the gated rules become commitments and the ungated plays fall to the generic
 * ladder's highest-cost sort, so the number says that hand-ranking these
 * fourteen cards is worth about as much as sorting them by cost. It is kept
 * because it is also what keeps every play in the running -- without a
 * total-order rule a gated `prefer` hides every card it does not name -- but
 * nobody should spend time tuning it.
 *
 * `perona-refund` is an exact zero on 265 flipped games, which is the same
 * reading: Perona already sits fourth in the table, and lifting it further
 * changes which games are won without changing how many.
 */
export const ST32_PLAY_RULES: readonly Heuristic[] = [
  // The table, as the total order that keeps every play in the running. Without
  // one of these a gated `prefer` hides every card it does not name -- the
  // failure `heuristics.ts` describes.
  prefer("Develop the highest strategic-value ST32 card.")
    .as("develop-by-value")
    .play((card) => st32CardValue(card.cardNumber) / 100),

  // OP15-036 Ryuma K.O.s a rested Character with a cost of 4 or less, on play
  // and again on attack. With nothing rested in range it is an 8000 body with no
  // text, and the deck has cheaper 8000s to spend the turn on.
  prefer("Land Ryuma while a rested body is in K.O. range.")
    .as("ryuma-target")
    .when((t) =>
      t.observation.opponent.board.some(
        (card) => card.rested && card.cost <= 4,
      ),
    )
    .by(WEIGHT.deck)
    .play((card) => card.cardNumber === "OP15-036"),

  // OP12-031 Tashigi rests a body *and* loads the Leader with three rested
  // DON!!. The second half happens whatever the board looks like, so this ranks
  // the turn where both halves land.
  prefer(
    "Land Tashigi while there is a body worth resting as well as DON!! to move.",
  )
    .as("tashigi-target")
    .when((t) =>
      t.observation.opponent.board.some(
        (card) => !card.rested && card.cost <= 6,
      ),
    )
    .by(WEIGHT.deck)
    .play((card) => card.cardNumber === "OP12-031"),

  // ST32-003 Mihawk free-plays a cost-5 follow-up, so it is two bodies for one
  // play -- but only with a follow-up in hand to name.
  prefer("Land Mihawk while its free play has something to bring with it.")
    .as("mihawk-follow-up")
    .by(WEIGHT.deck)
    .play(
      (card, t) =>
        card.cardNumber === "ST32-003" &&
        t.hand.some(
          (held) =>
            held.instanceId !== card.instanceId &&
            ["OP10-036", "ST32-004"].includes(held.cardNumber),
        ),
    ),

  // OP10-036 Perona refunds a DON!! every time an effect rests a body, and this
  // deck rests bodies with four different cards. Ungated in the old scorer and
  // left ungated here: the refund is a property of the deck's own plan rather
  // than of the current board.
  // There is deliberately no `rest-target` preferring ST24-005 and ST32-004
  // while an unrested opposing Character sits inside each one's cost ceiling
  // -- 6 and 2 respectively. It was two of the six bonuses in the old
  // `scoreSt32Play`, and it is a clear loss.
  //
  // Why resting is not worth reaching for in this deck, when K.O.'ing is:
  // ST24-005 and ST32-004 are the deck's *cheap filler*, and the gate fires on
  // almost any board, so the rule spent the turn on a 2-cost body whenever the
  // opponent had anything untapped. A rested Character is denied for one turn;
  // Ryuma's K.O. and Tashigi's three DON!! are permanent. The bonus was large
  // enough to pull the play ahead of both.
  //
  // The clearest argument in this file for naming each claim: inside one
  // additive scorer a term like that is invisible, because the function is
  // priced as a whole and the whole is positive.
  prefer(
    "Land Perona, which refunds a DON!! for every rest this deck already makes.",
  )
    .as("perona-refund")
    .by(WEIGHT.archetype)
    .play((card) => card.cardNumber === "OP10-036"),
];

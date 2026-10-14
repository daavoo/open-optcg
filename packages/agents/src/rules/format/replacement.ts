/**
 * Format rules for choices that give a card up: a full Character area, a
 * Stage being replaced, a cost paid in bodies.
 *
 * One of the files `format-heuristics.ts` is the map of; see that file for what
 * lives where and why the split is by decision rather than by deck.
 */
import { avoid, heuristics, never, prefer } from "../heuristics.js";
import { optionCard } from "../generic-policy.js";
import type { PolicyModule } from "../policy-module.js";
import { CHARACTER_AREA_LIMIT, type Tactics } from "../tactics.js";
import {
  BLOCKER_WORTH_IN_THOUSANDS,
  BOTH_BOARDS_BOTTOM_CARDS,
  BoardCard,
  blockStillAvailable,
  worthInHand,
} from "./shared.js";

/**
 * Never answer a "place a Character at the bottom of the owner's deck" effect by
 * naming one of your own.
 *
 * The reason a rule is needed at all is that the printed text is symmetric. "[printed text omitted -- pnpm card:text OP06-058]" names no side, so the
 * engine correctly offers both boards, and every policy in the repository -- the
 * deck ones and `chooseGenericRules` alike -- answers an effect it has no
 * specific rule for with `actions.find((action) => action.optionId !== "skip")`.
 * First offered is the active player's own board.
 *
 * Registered for {@link EVERY_DECK} because it names a card's printed text rather
 * than a deck: the engine resolves that text the same way for whoever holds it,
 * and three other cards in the pool (OP11-061, OP02-068, EB04-028) offer both
 * boards on their `[Trigger]`. Today only OP16-LUFFY-GREENBLUE reaches it, since
 * OP16-NAMI-6738 -- the other deck running OP06-058 -- never activates the card.
 *
 * Deliberately restricted to `bottom-deck-character` rather than every effect
 * that can name your own card:
 *
 *  - It is *permanent*. The Character goes under the deck, out of reach, so
 *    unlike a return-to-hand there is no line where naming your own is a re-buy
 *    of an `[On Play]`.
 *  - `skip` is always offered alongside it (`effects.ts`), so removing the
 *    self-owned options can never leave a policy with nothing to choose.
 *
 * Effects that legitimately name your own cards -- Crocodile's return-a-Character
 * cost, Ivankov's free play, a full-board replacement -- are different
 * `effectKind`s and are untouched, which is why this reads the kind rather than
 * guessing from `option.owner` alone.
 *
 */
export function createOwnBoardRemovalModule(): PolicyModule {
  return heuristics("own-board-removal", [
    never(
      "Bottoming your own Character is a permanent loss the effect never has to take.",
    ).effect(
      (action) =>
        (action.effectKind === "bottom-deck-character" ||
          BOTH_BOARDS_BOTTOM_CARDS.has(action.sourceCardNumber)) &&
        optionCard(action)?.owner === "self",
    ),
  ]);
}

/**
 * The Character area holds five. Both `effectKind`s the engine uses when a
 * sixth Character arrives and one already there has to go.
 *
 * Two exist because two code paths place a Character: `placeCharacter` in
 * `effects.ts` suspends on `character-area-replacement`, and the mechanic DSL's
 * own placement in `mechanics.ts` suspends on `area-replacement`. A rule that
 * reads only one of them silently does nothing for half the cards that can
 * reach the position, so both are named here rather than at each use.
 */
export const AREA_REPLACEMENT_KINDS: readonly string[] = [
  "character-area-replacement",
  "area-replacement",
];

/**
 * What a body is worth standing on a full board, in thousands: the composite
 * the replacement choice scores it at once the play has resolved --
 * {@link createAreaReplacementChoiceModule}'s power term plus
 * {@link createReplacementBlockerModule}'s credit for a block still available.
 * The veto in {@link createBoardReplacementModule} reads the same number, so
 * "the weakest body" means one thing on both sides of the play. A third
 * choice-step term that changes which body is weakest belongs here too.
 */
function worthOnBoard(card: BoardCard, turn: number): number {
  return (
    card.currentPower / 1000 +
    (blockStillAvailable(card, turn) ? BLOCKER_WORTH_IN_THOUSANDS : 0)
  );
}

/**
 * With five Characters already down, a play is a *swap*, and a swap that trades
 * down is not development.
 *
 * The engine does not stop the play: `placeCharacter` accepts the sixth
 * Character and suspends on a replacement choice, so `play-card` is offered with
 * a summary -- "Play Mr.2.Bon.Kurei(Bentham) (cost 2 DON!!)" -- that says nothing
 * about the body it is going to cost. Every deck policy in the repository sorts
 * affordable plays by a value table and takes the top one, and none of them read
 * `self.board.length`. Only `st31-policy.ts` does, in a deck-local
 * `replacementAdjustment` -- which is this rule, written once for one deck.
 *
 * Unguarded, that is how a board flooder arrives at *Trash Crocodile to make
 * room for Crocodile*: the value table says the incoming card is worth playing
 * and nothing asks what the sixth Character costs.
 *
 * The veto is deliberately narrow -- it fires only where the swap cannot pay,
 * meaning the incoming card is worth no more than the weakest body on the
 * field. Any swap with an upgrade survives, and the rank below then prefers
 * the largest one. Stated the other way round: this removes plays that spend a
 * card and DON!! to make the board worse, and leaves every judgement call to
 * the deck policy.
 *
 * Cost does not enter it. A cheap card is not exempted on the theory that its
 * `[On Play]` is the point of playing it -- a cost-1 searcher played over a
 * cost-3 Blocker is the shape that argument licenses. A swap that trades down is
 * not development, whatever it costs.
 *
 * Printed power rather than a card table, because at format scope there is no
 * table to consult; `currentPower` is read on the board side since a body's
 * worth there includes whatever is already boosting it.
 *
 * "Weakest" is read through {@link worthOnBoard} -- power plus the credit a
 * Blocker gets for a block still available -- and not power alone, because it
 * has to name the body the replacement choice will actually give up. Priced on
 * power alone the two disagree, and the swap walks through the gap: this veto
 * prices the incoming body against a 1000-power Blocker and reads it as an
 * upgrade, while the choice, crediting the block, gives up a larger bare body
 * instead. An incoming Blocker is credited the same way, so a Blocker played
 * over a bare body of equal power still reads as the upgrade it is.
 *
 * Note when measuring this rule and {@link createAreaReplacementChoiceModule}
 * against a whole field: the field is zero-sum and the decks that flood a
 * board gain most, so every column moves a long way. That is redistribution,
 * not a cost to the decks whose rate falls.
 */
export function createBoardReplacementModule(): PolicyModule {
  const weakestBody = (
    t: Tactics,
  ): { cost: number; worth: number } | undefined =>
    t.observation.self.board
      .map((card) => ({
        cost: card.cost,
        worth: worthOnBoard(card, t.observation.turn),
      }))
      .sort(
        (left, right) => left.worth - right.worth || left.cost - right.cost,
      )[0];
  return heuristics("board-replacement-cost", [
    never(
      "The Character area is full, so this play trashes a body no weaker than itself.",
    )
      .when((t) => t.observation.self.board.length >= CHARACTER_AREA_LIMIT)
      .play((card, t) => {
        const worst = weakestBody(t);
        if (!worst) return false;
        return worthInHand(card) <= worst.worth;
      }),

    prefer("Among swaps onto a full board, take the largest power upgrade.")
      .as("largest-upgrade")
      .when((t) => t.observation.self.board.length >= CHARACTER_AREA_LIMIT)
      .play((card, t) => {
        const worst = weakestBody(t);
        if (!worst) return false;
        // Already in thousands, so one point of rank is one point of power,
        // which keeps this comparable to the other power-shaped ranks here.
        return worthInHand(card) - worst.worth;
      }),
  ]);
}

/**
 * Answer a full-board replacement by naming the body worth least, not the first
 * one offered.
 *
 * `chooseEffect` in every deck policy filters for the option shapes it knows --
 * a search result, a card in hand -- and a board Character matches neither, so
 * the choice falls through to `actions.find((action) => action.optionId !==
 * "skip")`. First offered is the oldest body on the field, which is reliably the
 * engine piece the deck built its turn around.
 *
 * So a deck holding Mr.2, two copies of OP16-034 Luffy, Ivankov and Mr.1 plays a
 * second Mr.2 and answers the replacement by trashing *the first Mr.2* --
 * spending a card and two DON!! to draw one card and leave the board exactly as
 * it was. The answer the position wants is the duplicate Luffy: preserve unique
 * names and active attackers.
 *
 * Three terms, in the order they matter:
 *
 *  - **Current power**, ascending. The cheapest thing to give up is the body
 *    doing the least.
 *  - **A duplicated name**, as a tie-break. Several cards in the pool scale off
 *    the number of *differently named* Characters you control -- OP16-034 and
 *    OP16-038 both do -- so a second copy of a name already on the field is
 *    worth strictly less than the first. It is also the printed-text reading of
 *    a `[DON!! x1]` name count, which is why this is a format rule and not a
 *    deck one.
 *  - **Attached DON!!**, avoided. `resolveCharacterAreaReplacement` pushes the
 *    trashed Character's DON!! into `restedDon`, so trashing a powered body
 *    throws away that DON!! for the rest of the turn on top of the body.
 *
 * Ranked rather than vetoed: the engine's replacement is mandatory once the play
 * resolves, so there is always exactly one action type here and narrowing it can
 * never leave a policy with nothing to answer.
 *
 * Not a clever rule: it is what answering this decision with the first option
 * offered was costing. See {@link createBoardReplacementModule}, which is the
 * veto half of the same pair.
 */
export function createAreaReplacementChoiceModule(): PolicyModule {
  return heuristics("area-replacement-choice", [
    prefer(
      "Give up the weakest body on the field, not the first one offered.",
    ).effect((action, t) => {
      if (!AREA_REPLACEMENT_KINDS.includes(action.effectKind)) return false;
      const option = optionCard(action);
      if (!option || option.owner !== "self") return false;
      const body = t.observation.self.board.find(
        (card) => card.cardNumber === option.card.cardNumber,
      );
      const duplicated =
        t.observation.self.board.filter(
          (card) => card.name === option.card.name,
        ).length > 1;
      const power = option.currentPower ?? option.card.power ?? 0;
      // Weakest first, so the score rises as the body is worth less. Scaled to
      // thousands to sit alongside the power-shaped ranks in this file; the
      // name and DON!! terms are single points so they only ever break a tie
      // between bodies of equal power.
      return -power / 1000 + (duplicated ? 1 : 0) - (body?.attachedDon ?? 0);
    }),
  ]);
}

/**

/**
 * How much a swing still owed this turn is worth, in thousands of power.
 *
 * The unit is set by {@link createAreaReplacementChoiceModule}, which scores a
 * body to give up at `-power / 1000`, so this is "an attack left in it is worth
 * about 1500 power". Deliberately smaller than the gaps between the format's
 * body sizes: it breaks a tie between comparable bodies and outranks a
 * 1000-power difference, and it will not talk a deck into giving up a 6000 body
 * to keep a 2000 one.
 */
const SWING_WORTH_IN_THOUSANDS = 1.5;

/**
 * Among bodies to give up, spend one that has no attack left in it this turn.
 *
 * {@link createAreaReplacementChoiceModule} prices a body by what it is worth
 * standing there -- power, a duplicated name, the DON!! on it. That is the whole
 * question on the opponent's turn and only half of it on your own, where a body
 * is also an attack you have not made yet. A summoning-sick Character played
 * this turn and an active one that has been on the board since turn 3 are the
 * same card by every term in that rule; only one of them can swing before the
 * turn ends.
 *
 * The board it decides: five bodies, three of them able to attack, and a
 * replacement choice between a 2000-power OP16-054 active since turn 3 with an
 * attack on the table and a 1000-power OP16-055 played this turn that cannot
 * attack at all. Priced on power alone the two tie at -1 (2000 with a duplicated
 * name against 1000 without), and the tie falls to whichever the engine offered
 * first -- which gives up the swing.
 *
 * `couldAttack` rather than `canAttack` is the whole reason this rule can be
 * written: no `attack` action is on offer while a replacement choice is
 * pending, so the question has to be asked of the board rather than of
 * `legalActions`. That distinction is documented at both helpers in
 * `tactics.ts`.
 *
 * Registered separately from the rule it adjusts, rather than as another term
 * inside it, so `pnpm deck:ab --disable replacement-tempo` measures this claim
 * on its own.
 *
 * Expect no win rate from it. It fires often and reads flat: it is kept
 * because it answers a decision the previous behaviour got wrong *for a
 * reason* -- first-offered among tied bodies -- not because the field can see
 * it.
 */
export function createReplacementTempoModule(): PolicyModule {
  return heuristics("replacement-tempo", [
    prefer(
      "Give up a body with no attack left this turn, not one that can still swing.",
    ).effect((action, t) => {
      if (!AREA_REPLACEMENT_KINDS.includes(action.effectKind)) return false;
      const option = optionCard(action);
      if (!option || option.owner !== "self" || option.zone !== "board") {
        return false;
      }
      // By `instanceId`, not by card number: the position this rule is for is a
      // board holding several copies of one Character, where a card-number
      // lookup answers for whichever copy happens to sit first.
      return t.couldAttack(option.card.instanceId)
        ? 0
        : SWING_WORTH_IN_THOUSANDS;
    }),
  ]);
}

/**
 * A [Blocker] is not worth its power, so do not give it up as the cheapest body.
 *
 * {@link createAreaReplacementChoiceModule} prices a body to give up by what it
 * is worth standing there and reads that worth off `currentPower`. For every
 * body without printed keywords that is the right document. For a Blocker it is
 * the wrong one, and *reliably* wrong in one direction: the format prints
 * Blockers small precisely because they block, so the lowest-power body on a
 * full board is very often the one keyword body on it. Priced on power alone,
 * a Blocker is the standing default sacrifice.
 *
 * The same argument is made for a *search* by `createSearchBlockerModule` in
 * `format/selection.ts` -- "a 4000-power Blocker and a 6000-power vanilla body
 * are the same card to a cost ranking". The area limit is the other place the
 * engine asks a policy to compare two bodies, and this is that half.
 *
 * The board it decides: a full area holding a spent cost-1 body and a cost-3
 * 1000-power [Blocker]. On power alone the Blocker is the cheapest thing there
 * and is given up, at whatever Life total, while the bare body with nothing left
 * in it survives.
 *
 * Eligible is "the block is still available", which is narrower than holding
 * the keyword:
 *
 *  - **`blocker`, not `CardFacts.keywords`.** The observation's board field is
 *    the state of this card *instance*: it goes false for a printed Blocker
 *    whose text is negated, which is a body with no block to lose.
 *  - **Not rested.** This decision happens in the controller's own Main phase,
 *    and the Refresh Phase that would stand the Blocker up is at the start of
 *    the controller's *next* turn (CR 6-2-3) -- so a Blocker already rested
 *    cannot block anything on the turn in between. This is the one gate that
 *    stops the rule from reading as "never trash a Blocker".
 *  - **Not rest-locked through the opponent's turn.** Resting is the cost of
 *    the block, so a Character that cannot be rested cannot use [Blocker] at
 *    all -- the reason `cannotRestUntilTurn` is in the observation.
 *
 * By `instanceId` rather than card number, for the reason
 * {@link createReplacementTempoModule} gives: the boards this rule is for hold
 * several copies of one Character, and a card-number lookup answers for
 * whichever copy sits first. `area-replacement-choice` still reads its own
 * `attachedDon` term by card number; that is a separate defect, left alone here
 * so this rule states one claim.
 *
 * Registered separately from the rule it adjusts, rather than as another term
 * inside it, so `pnpm deck:ab --disable replacement-blocker` measures this
 * claim on its own.
 *
 * ## Measuring it
 *
 * Establish where it fires before reading any headline number. Most of the
 * roster never fills the Character area at all, so a whole-roster mirror is
 * mostly null rows: measure this on the decks that actually reach a contested
 * area-replacement decision with a Blocker on offer, which `pnpm census` names.
 *
 * The credit is the rule's only knob, and the direction is a plateau across
 * settings from 2500 to 6000 rather than a peak at one of them; 4000 is the
 * middle of it. Shipped on the same terms as
 * {@link createReplacementTempoModule}: it answers a decision the previous
 * behaviour got wrong *for a reason* -- a keyword body priced by its power --
 * rather than because the field can see it. Anyone who prices the block
 * better than a flat credit should beat it on those eight decks.
 */
export function createReplacementBlockerModule(): PolicyModule {
  return heuristics("replacement-blocker", [
    avoid(
      "Keep the [Blocker]: its worth is the block it still has, not the power printed on it.",
    ).effect((action, t) => {
      if (!AREA_REPLACEMENT_KINDS.includes(action.effectKind)) return false;
      const option = optionCard(action);
      if (!option || option.owner !== "self" || option.zone !== "board") {
        return false;
      }
      const card = t.observation.self.board.find(
        (candidate) => candidate.instanceId === option.card.instanceId,
      );
      if (!card || !blockStillAvailable(card, t.observation.turn)) return false;
      return BLOCKER_WORTH_IN_THOUSANDS;
    }),
  ]);
}

/**
 * Do not play a Stage over a live copy of itself.
 *
 * The engine trashes the incumbent when a Stage is played
 * (`actions/play-card.ts`), so playing a second copy of a Stage already on the
 * field spends a card from hand and 1 DON!! to arrive at the field it had.
 *
 * The rule is keyed on the card *number*, not on "a Stage is in play". A
 * different Stage may well be an upgrade -- that is a judgement about two cards'
 * text and belongs to whichever deck holds both -- while a copy of the same
 * card provably changes nothing about what the field can do.
 *
 * The one thing it does change, and the reason this is a veto rather than a
 * dominance argument: every Stage `[Activate: Main]` in the pool that costs
 * anything spends `sourceActive`, so an activated Stage is rested, and
 * `state.oncePerTurn` is keyed by `instanceId` -- a fresh copy is therefore an
 * un-used ability. That line is still card-negative in every deck the app
 * ships: Fullalead's ability trashes a card from hand, so re-arming it costs
 * the Stage from hand, 1 DON!! and a hand card to select one card. A deck whose
 * Stage ability paid more than a card would want a narrower rule of its own.
 *
 * Two decks had already written this rule for themselves before it was a format
 * fundamental -- `op14-mihawk-policy.ts` scores `self.stage === null` at 80
 * against 10, and `op17-xebec-policy.ts` reads `stageInPlay` -- which is the
 * signature section 6 of the deck-policy playbook names: a rule about a
 * game-state property, written per deck. Both are left in place; they are
 * redundant with this and not in conflict with it.
 *
 * Expect a mirror to read it as a wash and expect that to be misleading: the
 * seat it fires most for is OP-16 Teach, the only list holding four copies of
 * a Stage with a repeatable ability, and both seats of a Teach mirror get the
 * same benefit. It ships on the dominance argument, as `inert-trigger` and
 * `free-block` do: the card and the DON!! are spent either way, and what they
 * buy is the field the seat already had.
 */
export function createStageReplacementModule(): PolicyModule {
  return heuristics("stage-replacement", [
    never(
      "A Stage of this name is already on the field, so playing this copy trashes it and replaces it with itself.",
    ).play(
      (card, t) => t.observation.self.stage?.cardNumber === card.cardNumber,
    ),
  ]);
}

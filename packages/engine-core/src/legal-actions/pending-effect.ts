/**
 * Answers to the suspended effect. A pending effect outranks the phase: nothing else is legal until it resolves.
 *
 * One of the per-phase offer generators `getLegalActions` dispatches to.
 */
import {
  cards as defaultCardDatabase,
  type CardDatabase,
} from "@one-piece-sim/cards";
import { describeEffectOption } from "../effect-options.js";
import { getEffectOptions, opponentOf } from "../effects.js";
import { type GameState } from "../model.js";
import type { MechanicEffect, PlayerRef } from "../mechanics.js";
import {
  costOfEffect,
  donAddedByOptionalPayoff,
  payoffOfEffect,
} from "./action-costs.js";
import {
  type ActionCost,
  type CardZoneName,
  type LegalAction,
  type PayoffKind,
  type PlayerId,
} from "@one-piece-sim/protocol";

/**
 * What a choice buys, when the whole of it is handing a card a keyword.
 *
 * Read off the pending node rather than off the card's printed text: the node is
 * what will actually run, and `expiresAfterTurns` is the field that decides
 * whether a wasted grant can be recovered later in the game or not at all.
 *
 * Only a `cards` choice whose effect is the grant itself qualifies. A grant
 * inside a longer sequence is left alone, because there the choice is about the
 * rest of the sequence too and a one-line summary of it would be a half-truth.
 */
function grantedByChoice(
  pendingEffect: NonNullable<GameState["pendingEffect"]>,
): { keyword: string; expiresThisTurn: boolean } | undefined {
  if (pendingEffect.kind !== "mechanic-choice") return undefined;
  const choice = pendingEffect.choice;
  if (choice.kind !== "cards") return undefined;
  const effect = choice.effect;
  if (effect.kind !== "grant-keyword") return undefined;
  return {
    keyword: effect.keyword,
    expiresThisTurn: effect.expiresAfterTurns === 0,
  };
}

/**
 * What a choice does to the card it names, when the whole of it is a power
 * change. Read off the pending node for the same reason {@link grantedByChoice}
 * is: the node is what will run, and the sign of `amount` is what separates a
 * debuff aimed at the battle from a buff aimed at the chooser's own attacker.
 */
function powerChangedByChoice(
  pendingEffect: NonNullable<GameState["pendingEffect"]>,
): { amount: number; expiresThisTurn: boolean } | undefined {
  if (pendingEffect.kind !== "mechanic-choice") return undefined;
  const choice = pendingEffect.choice;
  if (choice.kind !== "cards") return undefined;
  const effect = choice.effect;
  if (effect.kind !== "modify-power" || effect.binding !== choice.bind) {
    return undefined;
  }
  return {
    amount: effect.amount,
    expiresThisTurn: effect.expiresAfterTurns === 0,
  };
}

/**
 * What a choice gives away, when the whole of it is handing a card DON!!.
 *
 * Read off the pending node for the same reason {@link grantedByChoice} is: the
 * node is what will run, and `count` and `from` are the two fields that decide
 * what the gift is worth to whoever receives it.
 */
function donGivenByChoice(
  pendingEffect: NonNullable<GameState["pendingEffect"]>,
): { count: number; from: "active" | "rested" | "cost-area" } | undefined {
  const choice =
    pendingEffect.kind === "mechanic-choice" ? pendingEffect.choice : undefined;
  if (choice?.kind !== "give-rested-don") return undefined;
  return { count: choice.count, from: choice.from ?? "rested" };
}

/**
 * Where the chosen card lands, when the whole of the choice is moving it there.
 *
 * The two imperative searches are named outright: `search-top-five` and
 * `navy-search` lift cards out of the deck and their only option is which one
 * joins the hand. Everything else is read off the pending node, for the same
 * reason {@link grantedByChoice} is -- the node is what will actually run, and
 * the DSL spells the destination out.
 *
 * The `cards` guard is what keeps this honest. A `choose` whose effect is a
 * single `move` of the very binding being chosen is a choice *about* that move;
 * a `move` over a different binding is a choice about more than the move, and
 * reporting only the destination would be a half-truth a policy would then
 * rank on.
 *
 * A cost paid out of the hand is the one `sequence` that passes the same test.
 * `payFromHand` builds "you may trash N cards from your hand: <payoff>" as a
 * `choose` over the hand whose effect is `sequence[move -> trash, payoff]`, so
 * the move is there but it is not the whole effect. What makes the choice
 * nonetheless only about the move is that the payoff is the *same whichever
 * card pays* -- it is what the cost buys, not a function of what was spent --
 * and the 92 cards built this way are then the largest group of card choices in
 * the format with nothing on the action saying where the card goes. A pilot
 * could only tell "which card do I trash" from "which card do I play" by the
 * printing on the source, which is the guess `effectKindOf` below exists to
 * remove.
 *
 * `payoffNamesBinding` is what holds the "same whichever card pays" claim up.
 * A payoff that reads the bound card back -- "trash 1 card: this gains power
 * equal to its cost" -- makes the choice about the payoff too, and the
 * destination goes unreported for it exactly as it does for any other
 * sequence. No card in the pool prints one today, so it is a guard rather than
 * a behaviour: it is here because the claim above is about the shape and not
 * about the 92 cards that currently have it. The scan is over the node as data
 * and refuses on any mention, so a DSL node added later cannot quietly widen
 * what is claimed here.
 */
function destinationOfChoice(
  pendingEffect: NonNullable<GameState["pendingEffect"]>,
  decidingPlayerId: PlayerId,
): { zone: CardZoneName; player: "self" | "opponent" | "owner" } | undefined {
  // `self` and `opponent` in a program are the program's controller and their
  // opponent, which is not the deciding player when the choice is handed to
  // someone else: EB03-001's "trash a card from your hand instead", answering
  // the opponent's removal, is a choice inside *their* program that Vivi makes,
  // and its move reads `opponent` for the card going to Vivi's own trash.
  const side = (
    controller: PlayerId,
    reference: PlayerRef | "owner",
  ): "self" | "opponent" | "owner" => {
    if (reference === "owner") return "owner";
    const resolved = reference === "self" ? controller : opponentOf(controller);
    return resolved === decidingPlayerId ? "self" : "opponent";
  };
  if (
    pendingEffect.kind === "search-top-five" ||
    pendingEffect.kind === "navy-search"
  ) {
    return { zone: "hand", player: side(pendingEffect.playerId, "self") };
  }
  if (pendingEffect.kind !== "mechanic-choice") return undefined;
  const choice = pendingEffect.choice;
  if (choice.kind !== "cards") return undefined;
  const effect = costPaidByChoice(choice) ?? choice.effect;
  if (effect.kind !== "move" || effect.binding !== choice.bind)
    return undefined;
  return {
    zone: effect.to.zone,
    player: side(choice.execution.context.sourcePlayerId, effect.to.player),
  };
}

/**
 * The `move` a `payFromHand`-shaped cost opens with, when the rest of the
 * sequence does not read the card that paid.
 *
 * Returns the move so the caller treats it exactly as it treats a bare one;
 * `undefined` leaves every other sequence unreported, as before.
 */
function costPaidByChoice(choice: {
  bind: string;
  effect: MechanicEffect;
}): MechanicEffect | undefined {
  const { effect, bind } = choice;
  if (effect.kind !== "sequence") return undefined;
  const [first, ...rest] = effect.effects;
  if (!first || first.kind !== "move" || first.binding !== bind)
    return undefined;
  if (rest.some((step) => payoffNamesBinding(step, bind))) return undefined;
  return first;
}

/**
 * Whether a DSL node mentions `bind` anywhere inside it.
 *
 * Walked as data rather than by node kind: the question is "could this read the
 * card that was chosen", and a conservative yes on any mention is the answer
 * that stays correct when a node kind is added. A binding name is a string
 * chosen by the card's own program, so a false positive costs only an
 * unreported destination.
 *
 * `perCard` and `perCards` are the exception, and the only one: they multiply
 * by *how many* cards the binding holds and never look at which ones, so the
 * payoff behind them is still the same whichever card pays -- which is the
 * claim {@link destinationOfChoice} makes. OP15-002 Lucy is the shape: "trash
 * any number of Event or Stage cards from your hand. This Leader gains +1000
 * power during this battle for every card trashed" is one `choose` over the
 * hand whose every option moves a card to the trash, and counting them left
 * the whole clause labelled "Choose <name>" with nothing saying the card was
 * being spent.
 */
function payoffNamesBinding(node: unknown, bind: string): boolean {
  if (typeof node === "string") return node === bind;
  if (Array.isArray(node)) {
    return node.some((entry) => payoffNamesBinding(entry, bind));
  }
  if (node && typeof node === "object") {
    return Object.entries(node).some(
      ([key, value]) =>
        key !== "perCard" &&
        key !== "perCards" &&
        payoffNamesBinding(value, bind),
    );
  }
  return false;
}

/**
 * What accepting an optional prompt pays, when the prompt is an optional cost.
 *
 * Two DSL shapes carry one. "You may DON!! −N: <effect>" is
 * `optional(sequence[return-don, effect])`, built by `donMinus` in
 * `mechanics/shared.ts`; "you may trash N cards from your hand: <effect>" is
 * `optional(choose(hand, min N) -> sequence[move to trash, effect])`, built by
 * `payFromHand`. Both are read off the pending node, for the same reason
 * {@link grantedByChoice} is: the node is what will run.
 *
 * Nothing else is summarised. An optional whose effect merely *contains* a
 * `return-don` further in is a choice about the rest of it too, and a cost
 * reported for it would be half the price.
 */
function costOfChoice(
  pendingEffect: NonNullable<GameState["pendingEffect"]>,
): ActionCost | undefined {
  if (pendingEffect.kind !== "mechanic-choice") return undefined;
  const choice = pendingEffect.choice;
  if (choice.kind !== "optional") return undefined;
  return costOfEffect(choice.effect);
}

/**
 * What accepting an optional prompt does past its cost, read off the pending
 * node for the same reason {@link costOfChoice} is. The two together are the
 * whole of the offer: the price, and what it buys.
 */
function payoffOfChoice(
  pendingEffect: NonNullable<GameState["pendingEffect"]>,
): readonly PayoffKind[] | undefined {
  if (pendingEffect.kind !== "mechanic-choice") return undefined;
  const choice = pendingEffect.choice;
  if (choice.kind !== "optional") return undefined;
  return payoffOfEffect(choice.effect);
}

/**
 * The DON!! accepting an optional prompt would add, when that is all it buys.
 *
 * Read off the pending node for the same reason {@link costOfChoice} is, and
 * paired with it: together they say "this prompt pays X and buys N DON!!", which
 * is what lets a pilot notice that N of them cannot arrive. A ten-card DON!!
 * deck empties by the tenth turn of a long game, and from that point OP09-062's
 * Leader is a prompt that trashes a card from hand for nothing --
 * `open-optcg-trace(12).jsonl` turn 9, where the Robin seat paid a
 * 1000-Counter Charlotte Pudding at 10 DON!! on the field.
 *
 * Reported, not withheld, on {@link programSelectsNothing}'s reasoning: the
 * cost is paid either way, so refusing to offer it would be a rules opinion.
 * `dead-ramp` in `format-heuristics.ts` is the pilot that acts on it.
 */
function donAddedByChoice(
  pendingEffect: NonNullable<GameState["pendingEffect"]>,
): { active: number; rested: number } | undefined {
  if (pendingEffect.kind !== "mechanic-choice") return undefined;
  const choice = pendingEffect.choice;
  if (choice.kind !== "optional") return undefined;
  return donAddedByOptionalPayoff(choice.effect);
}

/**
 * The `effectKind` a policy reads off a `resolve-effect` action.
 *
 * Usually the pending effect's own kind. The one exception is a Character-area
 * replacement raised by the mechanic DSL: `placeCharacter` suspends on
 * `character-area-replacement`, and a `play` step inside a card program suspends
 * on a `mechanic-choice` whose *choice* is `area-replacement` -- the same
 * decision, "which of your five Characters goes to make room", reached through
 * a second door. Reported as `mechanic-choice` it was indistinguishable from a
 * search or a K.O. target, so every rule written for the replacement -- which
 * body to give up, keep the Blocker, keep the one that can still attack --
 * matched neither the kind nor the summary and the first body offered won. In a
 * recorded Robin game that was a 12000-power Charlotte Linlin, trashed for a
 * 4000 Oven that OP17-110 Perospero's `[On Play]` had just put into play.
 */
function effectKindOf(
  pendingEffect: NonNullable<GameState["pendingEffect"]>,
): string {
  if (
    pendingEffect.kind === "mechanic-choice" &&
    pendingEffect.choice.kind === "area-replacement"
  ) {
    return "area-replacement";
  }
  return pendingEffect.kind;
}

export function pendingEffectActions(
  state: GameState,
  playerId: PlayerId,
  db: CardDatabase = defaultCardDatabase,
): LegalAction[] {
  const pendingEffect = state.pendingEffect;
  // `getLegalActions` only reaches this generator with an effect pending; the
  // guard keeps that contract local rather than assumed.
  if (!pendingEffect) return [];
  const grants = grantedByChoice(pendingEffect);
  const donGift = donGivenByChoice(pendingEffect);
  const destination = destinationOfChoice(pendingEffect, playerId);
  const cost = costOfChoice(pendingEffect);
  const payoff = payoffOfChoice(pendingEffect);
  const ramps = donAddedByChoice(pendingEffect);
  const modifiesPower = powerChangedByChoice(pendingEffect);
  return getEffectOptions(state, db).map(
    ({ optionId, summary, ...optionMetadata }) => {
      const option = describeEffectOption(state, playerId, optionId, db);
      return {
        actionId: `r${state.revision}:effect:${optionId}`,
        type: "resolve-effect",
        optionId,
        ...optionMetadata,
        effectKind: effectKindOf(pendingEffect),
        sourceCardNumber: pendingEffect.sourceCardNumber,
        option,
        ...(grants ? { grants } : {}),
        // A `give:<id>:<n>` option gives `n`, short of the printed "up to N"
        // -- the describer reads that count off the option as its `amount`.
        ...(donGift
          ? {
              donGift:
                option.kind === "card" && option.amount !== undefined
                  ? { ...donGift, count: option.amount }
                  : donGift,
            }
          : {}),
        // Only where a card is being named: the "add no card" option of the
        // same choice moves nothing, and a destination on it would read as an
        // option that puts something in the hand.
        ...(destination && option.kind === "card" ? { destination } : {}),
        ...(modifiesPower && option.kind === "card" ? { modifiesPower } : {}),
        // Only on the acceptance: declining an optional cost pays nothing.
        ...(cost && option.kind === "confirm" ? { cost } : {}),
        ...(payoff && option.kind === "confirm" ? { payoff } : {}),
        ...(ramps && option.kind === "confirm" ? { ramps } : {}),
        summary,
      };
    },
  );
}

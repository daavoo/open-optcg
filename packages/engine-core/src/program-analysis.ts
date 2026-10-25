/**
 * Static walks over a program tree, run without executing it: whether a
 * program would select nothing, whether it is only a price, what power or
 * keyword it grants. Offer gates, agents and the DON!!-count audit ask these
 * before a program runs.
 */
import type { CardDatabase } from "@one-piece-sim/cards";
import type { GameState } from "./model.js";
import {
  type BattleParticipant,
  battleTargetMatches,
  type CardSelector,
  type CardZone,
  type MechanicContext,
  type MechanicEffect,
  type MechanicProgram,
  type PlayerRef,
} from "./mechanic-dsl.js";
import {
  baseCardPower,
  conditionMatches,
  selectCards,
  stepIsPriceOnly,
} from "./mechanic-conditions.js";
import { resolvePlayer, SOURCE_BINDING } from "./mechanics.js";

/**
 * Card numbers with a "when this Character becomes rested" clause, injected at
 * startup.
 *
 * The same seam, and for the same reason, as {@link registerReplacementPrograms}
 * above: `mechanics/index.ts` merges the registry out of the set modules and
 * every one of those imports this file, so importing it back would close a
 * cycle through every set. {@link stepIsPriceOnly} is the only reader -- it has
 * to know that resting the source is a bare price and not the way this
 * particular card pays off.
 */
export let whenRestedCards: ReadonlySet<string> = new Set();

export function registerWhenRestedCards(cards: ReadonlySet<string>): void {
  whenRestedCards = cards;
}

/**
 * Where the source went when a price step earlier in the same sequence took it
 * off the field, so the selections after it stop counting it.
 *
 * The walk is static: it reads the board as it is when the action is offered,
 * and the source is on it then. OP11-004 Kujyaku prints "You may trash this
 * Character: Up to 1 of your Characters gains +1000 power"; alone on the board
 * it would count itself as the +1000's one candidate, though the trash it pays
 * leaves nothing for the +1000 to land on.
 */
interface Departed {
  instanceId: string;
  zone: CardZone;
}

/** Selected cards less a source a price has already moved off the field. */
function remaining(
  state: GameState,
  context: MechanicContext,
  selector: CardSelector,
  bindings: Record<string, string[]>,
  db: CardDatabase,
  departed: Departed | undefined,
): number {
  const cards = selectCards(state, context, selector, bindings, db);
  if (!departed) return cards.length;
  // A selector reading the zone the source moved to can still find it there
  // ("trash this: play a card from your trash"), so it keeps its candidate.
  const zones: readonly CardZone[] =
    typeof selector.zone === "string" ? [selector.zone] : selector.zone;
  if (zones.includes(departed.zone)) return cards.length;
  return cards.filter((card) => card.instanceId !== departed.instanceId).length;
}

export function effectSelectsNothing(
  state: GameState,
  context: MechanicContext,
  effect: MechanicEffect,
  bindings: Record<string, string[]>,
  db: CardDatabase,
  departed?: Departed,
): boolean {
  switch (effect.kind) {
    case "choose": {
      // A `choose` short of its `min` is skipped whole by the resolver, the
      // same as one with no candidates: OP01-055's "rest 2 of your
      // Characters" with one Character on the board rests nothing and draws
      // nothing, though the Event still leaves the hand.
      const candidates = remaining(
        state,
        context,
        effect.selector,
        bindings,
        db,
        departed,
      );
      return candidates === 0 || candidates < effect.min;
    }
    case "select":
      // The inner effect hangs off the binding this node makes, so with no
      // candidate to bind it never runs and there is nothing to recurse into.
      return (
        remaining(state, context, effect.selector, bindings, db, departed) === 0
      );
    case "pick-from-hand":
      // `choose`'s reading over a hand: an empty one binds nothing.
      return (
        state.players[resolvePlayer(context, effect.player)].hand.length === 0
      );
    case "sequence": {
      // A sequence is inert when nothing it *buys* can happen. Steps that only
      // charge the controller are not part of what it buys: see
      // `stepIsPriceOnly`, and the `[Activate: Main]` census in its doc comment
      // for why requiring *every* step to select nothing was too strict to
      // catch the commonest shape printed text has.
      //
      // At least one payoff step is still required. A program built purely out
      // of prices buys nothing whose emptiness could be reported, so "its
      // payoff finds nothing" is not a claim about it -- and every caller's
      // veto is argued from the payoff being the whole point of paying.
      //
      // Asking "not a price" rather than "is a selection" is deliberate: a
      // payoff can be a selection wrapped in the printed gate that decides
      // whether it happens at all (OP11-034 Hatchan is `rest(source)` then
      // `if(Fish-Man Leader) -> choose`), and a gate whose condition is false
      // with no `else` is inert for a stronger reason than an empty selection.
      // Recursing into every non-price step reaches both without a second
      // unwrapping rule that could drift from the one below.
      //
      // Steps are read in order so a price that takes the source off the field
      // is seen by every payoff after it: see `Departed`.
      let left = departed;
      let payoffs = 0;
      for (const step of effect.effects) {
        if (stepIsPriceOnly(context, step)) {
          if (step.kind === "move" && step.binding === SOURCE_BINDING) {
            left = {
              instanceId: context.source.instanceId,
              zone: step.to.zone,
            };
          }
          continue;
        }
        payoffs += 1;
        if (!effectSelectsNothing(state, context, step, bindings, db, left)) {
          return false;
        }
      }
      return payoffs > 0;
    }
    case "optional":
      return effectSelectsNothing(
        state,
        context,
        effect.effect,
        bindings,
        db,
        departed,
      );
    case "choice":
      // Every branch is offered whenever the node is reached, so the node is
      // inert only if there is nothing behind any of them. A branch with no
      // effect at all is the printed "or do nothing", which selects nothing by
      // definition.
      return effect.branches.every(
        (branch) =>
          branch.effect === undefined ||
          effectSelectsNothing(
            state,
            context,
            branch.effect,
            bindings,
            db,
            departed,
          ),
      );
    case "if": {
      // Only the branch that will actually be taken matters. A false condition
      // with no `else` is the bare-gate shape, which resolves to nothing at all
      // -- inert for a stronger reason than an empty selection, and reported the
      // same way.
      const taken = conditionMatches(
        state,
        context,
        effect.condition,
        bindings,
        db,
      )
        ? effect.then
        : effect.else;
      return (
        taken === undefined ||
        effectSelectsNothing(state, context, taken, bindings, db, departed)
      );
    }
    default:
      // Anything that is not a selection does something on its own.
      return false;
  }
}

/**
 * True when no way of resolving this program changes the game: whatever the
 * controller picks, every card ends where and as it was.
 *
 * Stricter than {@link programSelectsNothing}, which lets a price stand in
 * front of an empty payoff -- the price is still paid, and an Event still
 * leaves the hand. Here nothing may be paid: every step must be a no-op,
 * so a `[Once Per Turn]` spent on such a program is the only thing taking it
 * buys.
 *
 * The no-op leaves it recognises:
 *  - a `choose` or `select` with no candidate (or fewer than its `min`), which
 *    the resolver skips whole;
 *  - a `choose` whose whole effect is `swap-base-power` over the cards it
 *    picks, when every candidate already has the same base power. OP14-001
 *    Trafalgar Law's Leader swaps two of its own {Supernovas} or {Heart
 *    Pirates} Characters, and a board of two 2000-power bodies swaps 2000 for
 *    2000 -- the base powers it writes are the ones already in force.
 *  - an `if` whose taken branch is one of these, or absent.
 *
 * Anything else answers `false`, so absent means "not known to change
 * nothing".
 */
export function programChangesNothing(
  state: GameState,
  context: MechanicContext,
  program: MechanicProgram,
  db: CardDatabase,
): boolean {
  const bindings: Record<string, string[]> = {
    [SOURCE_BINDING]: [context.source.instanceId],
  };
  const visit = (effect: MechanicEffect): boolean => {
    switch (effect.kind) {
      case "choose": {
        const candidates = selectCards(
          state,
          context,
          effect.selector,
          bindings,
          db,
        );
        if (candidates.length === 0 || candidates.length < effect.min) {
          return true;
        }
        const swap = effect.effect;
        if (
          swap.kind !== "swap-base-power" ||
          swap.first !== effect.bind ||
          swap.second !== undefined
        ) {
          return false;
        }
        const powers = new Set(
          candidates.map((card) => baseCardPower(state, card.instanceId, db)),
        );
        return powers.size === 1 && !powers.has(undefined);
      }
      case "select":
        return (
          selectCards(state, context, effect.selector, bindings, db).length ===
          0
        );
      case "sequence":
        return effect.effects.every(visit);
      case "if": {
        const taken = conditionMatches(
          state,
          context,
          effect.condition,
          bindings,
          db,
        )
          ? effect.then
          : effect.else;
        return taken === undefined || visit(taken);
      }
      default:
        return false;
    }
  };
  return visit(program.effect);
}

/**
 * True when the whole of a program is a power boost to the controller's own
 * cards that expires with the turn.
 *
 * The mirror of the fact `POWER_FOR_THE_TURN_TRIGGERS` in
 * `legal-actions/trigger.ts` states about the attacker's side, asked of the
 * defender's. Its doc comment used to call a defender-side buff "never inert",
 * on the grounds that the power is read as defence for the rest of the
 * opponent's turn. That holds only while the opponent has an attack left: a
 * [Trigger] flipped off the last attack of a turn raises a number nothing will
 * read, and the card goes to the trash instead of to hand.
 *
 * Static, like {@link programKeywordGrant} and unlike
 * {@link programSelectsNothing}: it asks what the program *is*, not what the
 * board would make of it, so the caller can state the fact and leave the
 * board reading to a pilot.
 *
 * Conservative by construction. Every leaf must be a positive `modify-power`
 * with `expiresAfterTurns: 0` over a binding made by a `player: "self"`
 * selector; a program that also draws, rests, plays or reaches across the
 * table is doing durable work and answers `false`. A negative amount is
 * `dead-trigger`'s question, not this one.
 */
export function programBuffsOwnPowerForTheTurn(
  program: MechanicProgram,
): boolean {
  return effectBuffsOwnPowerForTheTurn(program.effect, new Set());
}

function effectBuffsOwnPowerForTheTurn(
  effect: MechanicEffect,
  ownBindings: ReadonlySet<string>,
): boolean {
  switch (effect.kind) {
    case "modify-power":
      return (
        effect.amount > 0 &&
        effect.expiresAfterTurns === 0 &&
        effect.perGivenDonOf === undefined &&
        effect.perCards === undefined &&
        effect.perCostOf === undefined &&
        ownBindings.has(effect.binding)
      );
    case "choose":
    case "select": {
      if (effect.selector.player !== "self") return false;
      const inner = new Set(ownBindings);
      inner.add(effect.bind);
      return effectBuffsOwnPowerForTheTurn(effect.effect, inner);
    }
    case "optional":
      return effectBuffsOwnPowerForTheTurn(effect.effect, ownBindings);
    case "sequence":
      return effect.effects.every((step) =>
        effectBuffsOwnPowerForTheTurn(step, ownBindings),
      );
    default:
      // Anything else is durable work, or work this cannot account for.
      return false;
  }
}

/**
 * What a `[Main]` activation buys, when the whole of it is handing a card a
 * keyword.
 *
 * The static counterpart of `grantedByChoice` in `legal-actions/pending-effect`,
 * which answers the same question about a pending choice. That one is asked
 * *during* resolution, one step too late for the decision that matters here: by
 * then the Event is cast, its cost is paid and the only question left is which
 * card takes the keyword. This is asked while the activation is still an offer.
 *
 * Read off the program rather than the printed text, and only for a program
 * whose entire effect is the grant -- a `choose` or `select` whose inner effect
 * is `grant-keyword` and nothing else. A grant bundled with a draw or a power
 * boost is not summarised, for the same reason `grantedByChoice` skips one
 * inside a longer sequence: the activation is about the rest of it too, and a
 * one-line summary of it would be a half-truth. Five of the pool's seven
 * keyword-granting `[Main]` programs bundle something else and are left alone.
 *
 * `expiresThisTurn` is the field the caller acts on: a keyword that expires at
 * end of turn is wasted for good on a card that cannot read it this turn, where
 * a lasting one is merely early.
 */
export function programKeywordGrant(
  program: MechanicProgram,
): { keyword: string; expiresThisTurn: boolean } | undefined {
  let effect = program.effect;
  // An `[Main]` printed as "you may X" or "if C, X" is still only the grant.
  while (effect.kind === "optional" || effect.kind === "if") {
    if (effect.kind === "if" && effect.else !== undefined) return undefined;
    effect = effect.kind === "optional" ? effect.effect : effect.then;
  }
  if (effect.kind !== "choose" && effect.kind !== "select") return undefined;
  const granted = effect.effect;
  if (granted.kind !== "grant-keyword") return undefined;
  return {
    keyword: granted.keyword,
    expiresThisTurn: granted.expiresAfterTurns === 0,
  };
}

/**
 * What a `[Main]` activation buys, when the whole of it is handing one of the
 * controller's own cards a rested DON!! card.
 *
 * The sibling of {@link programKeywordGrant}, and for the same decision one
 * step earlier than the choice. A `give-rested-don` node reaches a policy as a
 * `resolve-effect` naming its recipient -- which is the question "who takes
 * it" -- but the question worth asking about OP16-021 Moby Dick is whether to
 * activate at all: the program is `sequence[move(source -> trash),
 * give-rested-don]`, so by the time the recipient is offered the Stage is
 * already in the trash and every branch of that choice is worth the same
 * nothing.
 *
 * `stepIsPriceOnly` is what separates the two halves, so the price vocabulary
 * cannot drift from the one `programSelectsNothing` uses. Exactly one payoff
 * step, and it must be the gift: an activation that also draws, ramps or
 * removes is worth taking on the rest of it, and a caller that declined on the
 * gift alone would be throwing that away. The price steps it stepped over are
 * reported as `priced`, since a gift charged for is the only one where taking
 * it and leaving it are not both worth the same nothing.
 *
 * The recipient is deliberately not named. A `give-rested-don` node picks one
 * when it resolves, and reporting a stand-in here would be inventing an answer
 * the program has not given -- so `targetInstanceId` stays absent, which is
 * what tells a reader this gift is the untargeted shape rather than OP15-058's.
 */
/** Which pile a reported gift comes out of, as the action carries it. */
type DonGiftSource = "active" | "rested" | "cost-area";

export function programRestedDonGift(
  context: MechanicContext,
  program: MechanicProgram,
): { count: number; from: DonGiftSource; priced?: true } | undefined {
  let effect = program.effect;
  // An `[Activate: Main]` printed as "you may X" or "if C, X" is still only
  // the gift, the same unwrapping `programKeywordGrant` does.
  while (effect.kind === "optional" || effect.kind === "if") {
    if (effect.kind === "if" && effect.else !== undefined) return undefined;
    effect = effect.kind === "optional" ? effect.effect : effect.then;
  }
  const steps = effect.kind === "sequence" ? effect.effects : [effect];
  const payoffs = steps.filter((step) => !stepIsPriceOnly(context, step));
  const gift = payoffs[0];
  if (payoffs.length !== 1) return undefined;
  if (gift?.kind !== "give-rested-don" || gift.player !== "self") {
    return undefined;
  }
  return {
    count: gift.count,
    from: gift.from ?? "rested",
    // Whether anything is charged for it, which is what separates a gift worth
    // refusing from one worth taking on the off chance. `costOfEffect` in
    // `legal-actions/action-costs.ts` cannot answer this -- resting the source
    // and trashing the source are the two prices it has no summary for -- so
    // the same `stepIsPriceOnly` that found the payoff reports it.
    ...(steps.length > payoffs.length ? { priced: true as const } : {}),
  };
}

/**
 * Binding every program starts with, holding the card the program is printed on.
 *
 * Card text says "play this card" and "trash this card" often enough that a
 * program with no way to name its own source cannot express them. OP09-112 Belo
 * Betty's Trigger was left unimplemented for exactly this reason rather than
 * registered as a silent no-op.
 */
/**
 * The battle power a program would add for `playerId`, if every "you may" in it
 * were taken.
 *
 * The forecast half of `battle-power`. A defender's unpaid-for ability is
 * invisible in `currentPower`, so an attacker reading only the board is told an
 * attack connects that the ability alone turns away -- see `pendingDefenseBoost`
 * in `engine.ts`, and the run it lost. Walking the program rather than
 * restating the number in the registry is what stops the two from drifting:
 * there is one place the amount is written.
 *
 * `participant` is passed rather than read off `state` so the forecast can ask
 * about a battle that has not been declared yet.
 */
/**
 * Whether a program's outcome includes battle-scoped power at all.
 *
 * The companion to `programBattlePower`, which cannot distinguish "this program
 * adds no power" from "this program's power cannot reach the card being
 * attacked". An offer gate needs to tell those apart: the second is a prompt
 * with nothing behind it, and a player who pays a card for it has been
 * misled.
 */
export function programUsesBattlePower(program: MechanicProgram): boolean {
  const visit = (effect: MechanicEffect): boolean => {
    switch (effect.kind) {
      case "battle-power":
        return true;
      case "sequence":
        return effect.effects.some(visit);
      case "optional":
      case "select":
      case "choose":
        return visit(effect.effect);
      case "if":
        return visit(effect.then) || (effect.else ? visit(effect.else) : false);
      case "choice":
        return effect.branches.some((branch) =>
          branch.effect ? visit(branch.effect) : false,
        );
      default:
        return false;
    }
  };
  return visit(program.effect);
}

/**
 * The selectors a program would pick a `redirect-attack` target with.
 *
 * The redirect counterpart of `programUsesBattlePower`: an offer whose only
 * payoff is changing the attack target is a prompt with nothing behind it when
 * every card it could name is the card already being attacked, and a player who
 * pays a card from hand or a DON!! for that has been misled.
 */
export function programRedirectSelectors(
  program: MechanicProgram,
): CardSelector[] {
  const visit = (effect: MechanicEffect): CardSelector[] => {
    switch (effect.kind) {
      case "choose":
      case "select":
        return [
          ...(redirects(effect.effect) ? [effect.selector] : []),
          ...visit(effect.effect),
        ];
      case "sequence":
        return effect.effects.flatMap(visit);
      case "optional":
        return visit(effect.effect);
      case "if":
        return [
          ...visit(effect.then),
          ...(effect.else ? visit(effect.else) : []),
        ];
      case "choice":
        return effect.branches.flatMap((branch) =>
          branch.effect ? visit(branch.effect) : [],
        );
      default:
        return [];
    }
  };
  const redirects = (effect: MechanicEffect): boolean =>
    effect.kind === "redirect-attack" ||
    (effect.kind === "sequence" && effect.effects.some(redirects));
  return visit(program.effect);
}

export function programBattlePower(
  program: MechanicProgram,
  playerRef: PlayerRef,
  participant: BattleParticipant,
): number {
  const visit = (effect: MechanicEffect): number => {
    switch (effect.kind) {
      case "battle-power":
        return effect.player === playerRef &&
          battleTargetMatches(effect.target, participant)
          ? effect.amount
          : 0;
      case "sequence":
        return effect.effects.reduce((total, child) => total + visit(child), 0);
      case "optional":
        return visit(effect.effect);
      case "select":
      case "choose":
        return visit(effect.effect);
      case "if":
        // The condition is not evaluated: a forecast of what the defender *can*
        // still gain is allowed to be generous, and both branches of an `if` are
        // reachable from where the attacker is standing.
        return Math.max(
          visit(effect.then),
          effect.else ? visit(effect.else) : 0,
        );
      case "choice":
        // Exclusive branches: the player takes one, so the best of them.
        return Math.max(
          0,
          ...effect.branches.map((branch) =>
            branch.effect ? visit(branch.effect) : 0,
          ),
        );
      default:
        return 0;
    }
  };
  return visit(program.effect);
}

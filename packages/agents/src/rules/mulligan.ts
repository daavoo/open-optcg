import type { GameObservation } from "@one-piece-sim/protocol";
import { decision, type PolicyDecision } from "./generic-policy.js";
import type { PolicyContext, PolicyModule } from "./policy-module.js";

/**
 * The opening hand, as one module shape every deck fills in.
 *
 * ## Why this is shared and the predicate is not
 *
 * The mulligan is the only decision in the game with no position to read: five
 * cards, a 50-card deck, and one bit of output. Everything a deck can say about
 * it is "keep when the hand holds *this*", and everything else -- finding the
 * two `mulligan-decision` actions, picking the one matching the verdict,
 * attaching a reason -- is plumbing that does not vary.
 *
 * It was nonetheless written out twelve times, once per deck policy, as the same
 * fifteen lines:
 *
 * ```ts
 * const mulligan = actions.filter((a) => a.type === "mulligan-decision");
 * if (mulligan.length > 0) {
 *   const keep = observation.self.hand.some(...);
 *   return decision(
 *     mulligan.find((a) => a.decision === (keep ? "keep" : "mulligan"))!,
 *     keep ? "..." : "...",
 *   );
 * }
 * ```
 *
 * Twelve copies of a branch is not merely repetitive, it has already been wrong
 * in the way copies are wrong. OP13-004 fronts two shipped decks and
 * `registerPolicy` keys on the Leader, so the ST-35 policy piloted the OP-17
 * Elbaph list as well -- with a keep predicate naming four ST-35 cards that list
 * does not contain, so **every opening hand went back**, for as long as the
 * second deck existed. A benchmark cannot tell that apart from a weak deck. The
 * same shape, less severely: `pnpm census` read Enel keeping **120 of 120**
 * opening hands, because the generic rule it fell through to keeps on "any card
 * costs 2 or less" and this deck's [Counter] Event costs 1.
 *
 * So: the plumbing lives here once, the predicate stays in the deck's own file
 * next to the card numbers it names, and the deck's registration is one line.
 *
 * ## Registered per deck, not format-wide
 *
 * This could have been one `EVERY_DECK` module reading a table. It is not,
 * because the registry's scope is what makes a rule addressable: a per-deck
 * registration gives each keep its own `pnpm deck:ab --disable <deck>-mulligan`
 * and makes `pnpm census` attribute the decision to the deck rather than to the
 * format band. A deck's opening hand is deck knowledge even when the deck has
 * nothing interesting to say about it.
 *
 * @see DECKS_ON_THE_GENERIC_MULLIGAN for the decks that have no predicate yet.
 */
export interface MulliganRule {
  /**
   * Module id. By convention `<deck>-mulligan`, so `--disable` reads as the
   * decision it turns off.
   */
  id: string;
  /** Whether this opening hand is worth keeping. */
  keep: (observation: GameObservation) => boolean;
  /** Trace reason when {@link keep} holds. */
  keepBecause: string;
  /** Trace reason when it does not. */
  mulliganBecause: string;
  /**
   * Narrows the rule below its registration, for the case one Leader fronts two
   * decks: OP13-004 is both Sabo lists, and a keep predicate naming one list's
   * cards is actively wrong for the other. Card identity is the only
   * discriminator available -- nothing in the observation names a deck, and
   * correctly so, since that is not public information.
   */
  applies?: (context: PolicyContext) => boolean;
}

/**
 * Turns one keep predicate into a module that answers only the mulligan.
 *
 * A `decide`, because the decision is a single bit: there is nothing for `rank`
 * to narrow between "keep" and "mulligan", and a `veto` on one of them is the
 * same thing as deciding the other. It answers `undefined` for every other
 * decision, so it composes with whatever else pilots the deck rather than
 * standing in front of it.
 */
export function createMulliganModule(rule: MulliganRule): PolicyModule {
  return {
    id: rule.id,
    // Spread rather than assigned: `exactOptionalPropertyTypes` distinguishes
    // an absent `applies` from one set to `undefined`, and the resolver reads
    // the property's presence.
    ...(rule.applies ? { applies: rule.applies } : {}),
    decide: ({ observation }): PolicyDecision | undefined => {
      const offers = observation.legalActions.filter(
        (action) => action.type === "mulligan-decision",
      );
      if (offers.length === 0) return undefined;
      const keep = rule.keep(observation);
      const chosen = offers.find(
        (action) => action.decision === (keep ? "keep" : "mulligan"),
      );
      // The engine offers both decisions or neither, so this is unreachable;
      // answering `undefined` rather than asserting leaves the fallthrough to
      // decide instead of failing a game on a mulligan.
      if (!chosen) return undefined;
      return decision(chosen, keep ? rule.keepBecause : rule.mulliganBecause);
    },
  };
}

/**
 * The generic keep: any card the first two turns can pay for.
 *
 * Worth stating once what a mulligan costs, because every number in this file
 * rests on it: nothing. `actions/mulligan-decision.ts` reshuffles the hand back
 * into the deck and draws five more, before Life is dealt, so shipping a hand is
 * a free redraw from the same 50 cards. A keep predicate is therefore only ever
 * worth the difference between the hands it keeps and a fresh random five --
 * which is why a rule that ships *above-average* hands loses points rather than
 * merely wasting them, and why the ceiling on the whole decision is small.
 *
 * What `chooseGenericRules` has always done, named so a deck that has not been
 * audited yet says "the default, deliberately" instead of falling through
 * silently. It is a weak rule and known to be: a cost bound cannot tell a body
 * from a [Counter] Event, which is exactly how it kept 120 of Enel's 120 hands.
 */
export function anyEarlyPlay(observation: GameObservation): boolean {
  return observation.self.hand.some((card) => card.cost <= 2);
}

/**
 * Decks with no keep predicate of their own, and so still on
 * {@link anyEarlyPlay} by way of the generic fallthrough.
 *
 * A reviewable admission held to a ratchet, in the shape
 * `UNIMPLEMENTED_CLAUSES` already uses for the engine: `test/mulligan.test.ts`
 * fails if a Leader outside this list has no rule, and fails if the list grows.
 * It is deliberately *not* a table of registrations mapping these Leaders to
 * `anyEarlyPlay` -- registering the default per deck would move them from
 * `no rule at all` to `deck` in `pnpm census` and hide the gap this list exists
 * to record, while changing not one decision.
 *
 * Every entry is a real gap in the sense that matters for attribution:
 * `pnpm census --format --seeds 6` reads **100.0% of its mulligan decisions
 * with no rule scoped to the deck** for each of them. Writing one is a
 * behaviour change on a measured deck, so each gets its own
 * `pnpm deck:ab --deck <id> --disable <deck>-mulligan` and its own change --
 * the work #172 tracks, one deck at a time. The list started at seven.
 *
 * It is not, however, a list of decks with points on the table. Three of the
 * four entries left are there because the decision itself is not worth
 * winning, not for want of trying.
 *
 * ## How much the decision is worth at all, per deck
 *
 * "A rule reads flat" and "the decision cannot be won" are different claims,
 * and only the second justifies leaving a deck here. Bracket the decision
 * before designing a predicate: register the two *extreme* rules -- keep every
 * hand, ship every hand -- against the same generic control. Any predicate is
 * a blend of those two and is bounded by them, so if both endpoints sit within
 * a point of the generic keep there is under a point of leverage in the whole
 * decision and no predicate can find it. It is two `deck:ab` runs with no
 * predicate to design, so it is worth taking *before* writing a keep for a
 * deck whose dossier looks transcribable.
 *
 * One thing it does not rule out: a deck's opening hand can only be worth what
 * the rest of its policy can convert. A deck with no other deck-scoped module
 * has its better hands piloted by `chooseGenericRules`, so its bracket has to
 * be re-run if that changes.
 *
 * ## What separates the decks a keep predicate pays on
 *
 * **What the deck's cheap slot is made of**, not how many cards are in it.
 * `anyEarlyPlay` is a cost bound, so what it cannot see is whether a cheap
 * card is a *play*. On a list where a large part of the cheap slot is Events
 * it keeps hands that cannot act, and replacing it is worth points; where the
 * cheap slot is bodies it is already answering the question, and a tighter
 * rule only ships hands the deck wanted. The keep rate on its own predicts
 * neither result: two decks keeping 99% of hands sit on opposite sides of it,
 * and the deck with the *tightest* generic keep is the flattest of all.
 *
 * That column predicts where a *tightening* pays and says nothing about a
 * loosening. OP16-001 Ace is the case in point: its rule is the only one here
 * that **keeps hands the generic rule ships** -- a hand holding OP16-015 and
 * nothing cheap -- and half its margin is there. A cost bound cannot express a
 * loosening, and no other dossier in this set has asked for one.
 *
 * ## OP17-079 Black Luffy
 *
 * On the arithmetic this looks like the clearest gap in the field: 28 of its
 * 50 Characters and both its Events cost 2 or less, so `anyEarlyPlay` is true
 * on **99.6%** of opening hands and the deck effectively has no mulligan. Its
 * dossier has a populated `mulligan:` array, so the work looks like
 * transcription.
 *
 * It is not. The direction is the opposite of the one the keep rate suggests:
 * hands this deck ships for want of a giant are hands it wanted. That is what
 * 28 cheap Characters means -- nearly every opening is a real first two turns,
 * the enablers are 20 cards deep, and two of the cheap bodies dig for one.
 * Every tightening the dossier's list allows sits on one monotone run, so
 * there is no third predicate hiding between the loose and tight readings.
 *
 * Registering the loose reading anyway would move this deck from `no rule at
 * all` to `deck` for 100% of its mulligans while deciding nothing, which is
 * precisely the hiding this list exists to prevent.
 *
 * ## OP16-060 Sengoku
 *
 * The loosest generic keep in the field: twenty-six of this deck's fifty cards
 * cost 2 or less, so `anyEarlyPlay` is true on 98.0% of openings, and twelve
 * of those twenty-six are Events -- the shape the section above says a
 * tightening should pay on. It does not: both endpoints of the bracket sit
 * inside a point of the generic keep, because at a 98.0% keep rate the generic
 * rule and "keep everything" are nearly the same rule.
 *
 * This deck's gap is somewhere else entirely and much larger -- its Leader's
 * eight-DON!! activation is offered every turn and never taken. See
 * `op16-sengoku-policy.ts`.
 *
 * ## OP16-080 Teach
 *
 * The generic keep is true on 86.9% of this deck's hands, and the sixteen
 * cards that satisfy it are the nine 1-cost {Blackbeard Pirates} bodies, four
 * OP09-099 Fullalead and three OP09-096 My Era...Begins!!. So `anyEarlyPlay`
 * here already *is* the dossier's disjunction, "a 1-drop or a search", and the
 * only thing a rule can add is its conjunction: "at least one 1-cost
 * Blackbeard Pirates body **and** at least one card printing a [Trigger]", the
 * [Trigger] being what the Leader's `[On Your Opponent's Attack]` redirect
 * costs. The [Trigger] term costs points rather than earning them, and the
 * 1-drop half alone is a wash.
 *
 * Nine of this deck's sixteen cheap cards are bodies and the seven that are
 * not are both searchers, so a hand the generic rule keeps here can nearly
 * always do something. Shipping 37.5% of hands buys nothing, which is the
 * failure mode #172 names: a rule that brings the keep rate down without
 * bringing the *right* hands down.
 *
 * ## OP17-099 Charlotte Linlin
 *
 * Six of this deck's fifty cards cost 2 or less -- four OP17-113 Streusen and
 * two of the Event -- so the generic keep is already nearly the keep this deck
 * wants, and the one hand shape the two bounds disagree about is the
 * Event-only opening this section says a cost bound cannot see.
 *
 * The bracket says there is nothing there. Keep everything and ship everything
 * both sit within half a point of the generic keep, and the transcribable
 * predicate between them -- keep on the 1-cost search or on the 3-cost that
 * refills the hand -- measures in the same band, so no predicate can find more.
 * The deck's opening is not where its decisions are: its Leader spends the hand
 * every turn it attacks, which is what `op17-linlin` answers instead.
 *
 * ## OP11-041 Nami
 *
 * The tightest generic keep of the seven at **72.8%**, because all eleven of
 * this deck's cost-2-or-less cards are Characters and it runs no cheap Event
 * at all. So there is no "hand that cannot act" to catch, and the only thing a
 * predicate can add is *which* cheap body -- four of the eleven are OP14-102
 * Kumacy, whose printed text is a dash.
 *
 * The dossier asks for "an early hand-size or Life setup card ... and a
 * playable 4-cost Character", the setup half being OP06-106 Kouzuki Hiyori and
 * OP11-106 Zeus. Both matter for a reason: the Leader draws a card whenever
 * one is removed from *either* player's Life, so a cheap card that moves Life
 * starts the engine before the opponent has attacked. Neither the setup half
 * alone nor the dossier's conjunction separates from the generic keep, and the
 * conjunction ships 61% of this deck's opening hands to get there. That is a
 * lot of churn for a margin that will not resolve at five times the arm size
 * the rules that did pay needed.
 *
 * ## ST29-001 Monkey.D.Luffy
 *
 * Bracketed, like OP16-060 above, and the bracket is the whole argument.
 * Eighteen of this deck's fifty cards cost 2 or less and ten of those eighteen
 * are [Counter] Events, which is exactly the shape the section above says a
 * tightening should pay on -- a cost bound that cannot tell a body from a card
 * that is never a turn-two play. It does not pay. Three predicates were
 * measured against the generic keep at 50 seeds across the field, and between
 * them they span the range a cost-and-identity predicate can express here:
 *
 *  - the two cheap *bodies* only, ST29-011 and ST29-012: -0.6pt (z=-1.26);
 *  - those plus ST29-002 Usopp, the first body that also acts on the way in:
 *    -0.4pt (z=-1.09);
 *  - any Character costing 4 or less: +0.1pt (z=0.21).
 *
 * All three sit inside a point of the generic keep, and the ordering is the
 * finding: the looser the predicate the better it does, so this deck is not
 * being hurt by keeping hands it cannot play -- it is hurt by shipping hands
 * it can. The widest arm is both the nearest to the generic bound and the only
 * non-negative one, which is a direction no predicate between those endpoints
 * improves on. Registering the widest anyway would move this deck to `deck`
 * for every mulligan while deciding almost nothing against the generic rule,
 * which is the hiding this list exists to prevent.
 *
 * Where this deck's real gap is has not been measured. It ships with no
 * in-game policy at all, so `pnpm census` reports every surface it has.
 *
 * ## OP15-022 Brook
 *
 * Bracketed, like OP16-060 and OP17-099 above. Twenty of this deck's fifty
 * cards cost 2 or less and all but the two Gum-Gum Storms are Characters, so
 * the generic keep already holds a turn-two play in nearly every hand it
 * keeps. Keep everything and ship everything both sit inside two points of the
 * generic keep, and so do the two transcribable predicates between them --
 * keep on the feature page's early cards, OP15-085 Chopper and OP15-088
 * Pirates Docking Six, with or without the EB02-017 Nami that digs for them.
 * The deck's decisions are later: how much of its own deck to trash, which is
 * what `op15-brook-deck-budget` answers.
 *
 * ## OP11-021 Jinbe
 *
 * Bracketed, like the four above. Its only cards of cost 2 or less are the
 * two 1-cost diggers, OP11-030 Shirahoshi and OP06-025 Camie, and the two
 * 1-cost Counter Events, so the generic keep is already "hold something cheap".
 * Keep everything matches the generic keep, and ship everything and the feature
 * page's own opener predicate -- Shirahoshi or Camie -- both sit under a point
 * below it. The deck's decisions are in the Counter step, which
 * `op11-jinbe-counter` and `op11-jinbe-defend` answer.
 */
export const DECKS_ON_THE_GENERIC_MULLIGAN: readonly string[] = [
  "OP17-079", // (Black) Monkey.D.Luffy - see above
  "OP16-080", // (Black/Yellow) Marshall.D.Teach - see above
  "OP11-041", // (Blue/Yellow) Nami - see above
  "OP16-060", // (Purple) Sengoku - bracketed, see above
  "ST29-001", // ST-29 (Yellow) Monkey.D.Luffy - bracketed, see above
  "OP17-099", // (Yellow) Charlotte Linlin - bracketed, see above
  "OP15-022", // (Green/Black) Brook - bracketed, see above
  "OP11-021", // (Green) Jinbe - bracketed, see above
];

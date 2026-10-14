import type { GameObservation, LegalAction } from "@one-piece-sim/protocol";
import { avoid, heuristics, never, prefer } from "../heuristics.js";
import { createMulliganModule } from "../mulligan.js";
import type { PolicyModule } from "../policy-module.js";

const SHANKS_LEADER = "OP17-020";
/** ST16-004 Shanks: "[On Play] K.O. up to 1 of your opponent's *rested* Characters." */
const REST_PAYOFF = "ST16-004";
/** OP17-038: "[Main] You may rest 4 of your cards: Rest up to 1 ..." */
const REST_FOUR_EVENT = "OP17-038";
/** The bodies whose [On Play] rests something, i.e. the deck's engine. */
const REST_ON_PLAY = ["OP17-029", "OP17-031", "OP17-027", "OP17-022"];
/** The 1-cost card and the 1-cost Event that dig for the above. */
const SEARCHERS = ["OP17-032", "OP17-037"];
/** OP17-021 Crone Oli, the removal tax. */
const CRONE_OLI = "OP17-021";

/** Opposing Characters that are rested right now, i.e. what this deck preys on. */
const restedOpponents = (
  observation: GameObservation,
): GameObservation["opponent"]["board"] =>
  observation.opponent.board.filter((card) => card.rested);

/** Crone Oli's protection is on as soon as one copy is on the field. */
const hasCroneOli = (observation: GameObservation): boolean =>
  observation.self.board.some((card) => card.cardNumber === CRONE_OLI);

/** True for an option that names a card in this player's own hand. */
function isOwnHandOption(action: LegalAction, source: string): boolean {
  return (
    action.type === "resolve-effect" &&
    action.sourceCardNumber === source &&
    action.option.kind === "card" &&
    action.option.owner === "self" &&
    action.option.zone === "hand"
  );
}

/** The cost branch of the Leader's ability, by its printed alternative. */
function isLeaderCostBranch(action: LegalAction, mode: string): boolean {
  return (
    action.type === "resolve-effect" &&
    action.sourceCardNumber === SHANKS_LEADER &&
    action.option.kind === "mode" &&
    action.option.mode === mode
  );
}

/**
 * OP-17 Green Shanks, the rest-lock control deck.
 *
 * ## The engine, in one paragraph
 *
 * The Leader converts a *rested* opposing Character into a permanently rested
 * one: `[Activate: Main] [Once Per Turn] You may trash 1 card from your hand or
 * [printed text omitted -- pnpm card:text <card>]
 * not become active in your opponent's next Refresh Phase.` A Character that
 * never wakes is a body removed without removal, and it is also the only legal
 * target for ST16-004 Shanks, the deck's one hard K.O. Every meaningful body
 * rests something on the way in -- OP17-029 Hongo two cost-2s, OP17-031 Yasopp
 * an 8-cost, OP17-027 Benn.Beckman two of anything, OP17-022 Shanks the whole
 * board -- so the rest effects are what make the removal legal, and the freeze
 * is what makes them stick. Attacks rest the attacker, so the opponent's own
 * turn also supplies targets for free.
 *
 * Source for the plan: the OPDeckGuide mini guide this deck's list comes from
 * (https://opdeckguide.com/deck-guides/shanks-op17/, retrieved 21 Aug 2026),
 * restated in `packages/agents/src/llm/dossiers/op17-shanks.ts`, which the LLM
 * seat has been piloting from while the rules seat had no policy at all.
 *
 * ## Why this file exists
 *
 * The deck had no registered policy: every decision fell through to
 * `chooseGenericRules`, which fires the first `activate-main` it is offered.
 * Two lines out of one traced game (`pnpm trace:match --p1 "(Green) Shanks -
 * Official Feature Deck" --p2 "(Red) Monkey.D.Luffy - Starter Deck 31" --seed
 * rules-benchmark-2`) are the whole argument for it:
 *
 *  - Turn 2 and turn 4, with no rested Character anywhere on the opponent's
 *    board, it paid the Leader's cost anyway and trashed OP17-022 Shanks -- the
 *    deck's 10-cost finisher -- for an effect whose target selector was empty.
 *    The cost is paid before the target is chosen and the target is `up to 1`,
 *    so the engine will happily let a pilot buy nothing.
 *  - Turn 6 it activated OP17-038, whose printed `[Main]` cost is "rest 4 of
 *    your cards", and rested its Leader and its entire board to rest one
 *    opposing Character. The card is a [Counter] that happens to have a Main
 *    clause; the Main clause is a trap for a policy that takes any activation.
 *
 * `rank` and `veto` only: the generic policy still decides, these rules narrow
 * what it decides between.
 *
 * This is an *unpiloted* deck's first policy, so expect every matchup to
 * move: the lines it replaces were not close calls, they were a card trashed
 * per turn for nothing and a board rested for one rest.
 *
 * The worst matchup remains ST31 aggro -- a rest-lock deck that has to reach
 * four DON!! before its engine starts is structurally behind the format's
 * fastest deck, and no ordering rule changes that.
 *
 * ## Why the freeze is not skipped when the turn can K.O. instead
 *
 * The freeze and a K.O. buy the same thing -- that body does nothing on the
 * opponent's next turn -- so paying for both looks like paying twice: the
 * Leader's `[Activate: Main]` freezes a rested body, then the Leader's only
 * attack K.O.s the same body. Skipping the freeze there is worse, at both a
 * wide gate (every rested opposing Character inside the turn's reach) and a
 * tight one (the defender would need two Counter cards to save the body).
 *
 * The two halves are not the same price. The freeze costs a
 * DON!! this deck usually has spare, and it is certain. The K.O. costs the
 * Leader's attack and is not -- the defender's Counter cards are hidden, and a
 * body that survives the swing wakes up in a Refresh Phase the freeze would
 * have held it through. Paying for both is insurance, and it is worth buying
 * against a deck whose bodies have to be answered twice.
 *
 * The other half of the fork is in `format-heuristics.ts`: `threat-removal`
 * does not aim an attack at a body already held down, so the freeze stays and
 * the attack goes at the Leader.
 */
export function createOp17ShanksRulesPolicy(): PolicyModule {
  return heuristics("op17-shanks", [
    // The freeze has no target, so the cost buys nothing. `up to 1` means the
    // engine offers the activation regardless of the board, and the cost -- a
    // card out of hand, or a DON!! -- is paid first.
    never("Do not pay the Leader's cost with no rested Character to freeze.")
      .when((t) => restedOpponents(t.observation).length === 0)
      .activate((action) => action.sourceCardNumber === SHANKS_LEADER),

    // A card every turn is the deck's real cost, so a card is worth spending
    // only on a body worth denying. The dossier's own priority: "freeze an
    // attacker or a Blocker rather than a spent 1-drop." With a spare DON!! to
    // pay with instead, the rule above applies and any target is worth it.
    never("Do not spend a card to freeze a body that is not worth denying.")
      .when(
        (t) =>
          t.don === 0 &&
          !restedOpponents(t.observation).some(
            (card) => card.cost >= 3 || card.blocker,
          ),
      )
      .activate((action) => action.sourceCardNumber === SHANKS_LEADER),

    // OP17-034 Rockstar sets a DON!! active *and* puts the Leader's base power
    // at 6000 until the end of the opponent's next End Phase, which is the one
    // card in the deck that answers a 5000-power Leader attacking into 5000.
    // It refunds its own DON!!, so it is never the reason a play is skipped.
    prefer(
      "Take Rockstar's free DON!! and the 6000 Leader before anything else.",
    )
      .by(30)
      .activate((action) => action.sourceCardNumber === "OP17-034"),

    // Between the two printed payments, spend the DON!! that is about to go
    // unused rather than a card. Gated on there being an active DON!! at all,
    // which is also the engine's own gate on that branch: `activateMain` runs
    // after the turn's plays, so a turn that spent everything has only the hand
    // branch available and this rule stays out of the way.
    prefer("Pay the freeze with a DON!! that would otherwise go unspent.")
      .when((t) => t.don > 0)
      .by(20)
      .action((action) => isLeaderCostBranch(action, "don")),
    avoid("Do not spend a card on the freeze while a DON!! is spare.")
      .when((t) => t.don > 0)
      .by(20)
      .action((action) => isLeaderCostBranch(action, "hand")),

    // When a card *is* the payment, give up the least useful one. The generic
    // policy takes the first option offered, which in the traced game was the
    // 10-cost Shanks.
    prefer("Pay the freeze with the least useful card in hand.")
      .by(1)
      .action((action, t) => {
        if (!isOwnHandOption(action, SHANKS_LEADER)) return false;
        const card =
          action.type === "resolve-effect" && action.option.kind === "card"
            ? action.option.card
            : undefined;
        if (!card) return false;
        const held = t.hand.find(
          (candidate) => candidate.instanceId === card.instanceId,
        );
        // Cheap and Counter-less first; a body this turn's DON!! could still
        // pay for is the last thing to give up.
        return (
          12 -
          (card.cost ?? 0) -
          (card.counter ?? 0) / 1000 -
          (held && held.cost <= t.don ? 4 : 0)
        );
      }),

    // The Main clause rests four of your own cards -- Leader included, since it
    // says "cards" and not "Characters" -- to rest one of theirs. That is four
    // attacks and four blocks for one, and the card's [Counter] half is what the
    // deck actually wants it for.
    never("Do not rest four of your own cards to rest one of theirs.").activate(
      (action) => action.sourceCardNumber === REST_FOUR_EVENT,
    ),

    // OP17-021 Crone Oli: "[printed text omitted -- pnpm card:text OP17-021]"
    //
    // The engine gates the replacement on a copy being on the field (its
    // entry in `mechanics/op17-replacements.ts` is keyed on Crone Oli),
    // and the effect is not [Once Per Turn], does not rest Crone Oli itself
    // and does not require it to be active. One copy therefore taxes every
    // removal for the rest of the game, and the second adds nothing but a
    // 0-power body -- while costing the 2000 Counter it would have been in
    // hand -- which is what an unranked ladder does with them, dropping both
    // copies onto a board with nothing either can protect.
    // Note the sibling claim that does *not* hold: holding Crone Oli until a
    // body of cost 4 or more is on the field, on the theory that a 0-power
    // body is worth less than the 2000 Counter it costs. The tax is worth
    // pre-committing before the threat arrives, because the opponent chooses
    // when the removal comes and a Counter held for a turn that never happens
    // is worth nothing either.
    never("One Crone Oli already taxes every removal; do not play a second.")
      .when((t) => hasCroneOli(t.observation))
      .play((card) => card.cardNumber === CRONE_OLI),

    // ST16-004 only shoots a rested Character. Into an all-active board its
    // [On Play] has no legal target and a 9-cost 11000 vanilla is not what nine
    // DON!! is for in a deck that wants to be developing two bodies.
    never("Hold the K.O. until something is rested for it to shoot.")
      .when((t) => restedOpponents(t.observation).length === 0)
      .play((card) => card.cardNumber === REST_PAYOFF),
    prefer("Shoot the rested body while it is still down.")
      .when((t) => restedOpponents(t.observation).length > 0)
      .by(40)
      .play((card) => card.cardNumber === REST_PAYOFF),

    // The rest bodies are the deck's engine, and their [On Play] is worth
    // nothing against an empty board -- Hongo and Benn.Beckman rest Characters,
    // not the Leader.
    prefer(
      "Deploy a body that rests something while there is something to rest.",
    )
      .when((t) => t.observation.opponent.board.length > 0)
      .by(25)
      .play((card) => REST_ON_PLAY.includes(card.cardNumber)),

    // "Keep a hand with an early searcher": the guide's own mulligan advice, and
    // at 1 DON!! they cost nothing to land on the way to the real turns.
    prefer("Land a 1-cost searcher early; the deck digs for its engine.")
      .when((t) => t.turn <= 6)
      .by(15)
      .play((card) => SEARCHERS.includes(card.cardNumber)),

    // Otherwise develop the biggest body affordable, as every deck does.
    prefer("Develop the largest body the DON!! can pay for.").play(
      (card) => card.facts.power / 1000,
    ),
  ]);
}

/**
 * The two cards that go looking for the rest of the deck.
 *
 * Both cost 1 and both reveal a "Red-Haired Pirates" card off the top -- the
 * Character looks 3 deep, the Event 5. Eight cards between them, and the
 * dossier names them by number: "keep a hand with an early searcher --
 * OP17-032 Limejuice or the OP17-037 Event".
 */
const SHANKS_SEARCHERS: ReadonlySet<string> = new Set([
  "OP17-032", // Limejuice, 1 -- [On Play] look at 3.
  "OP17-037", // Are You That Afraid of the New Era?!!, 1 -- [Main] look at 5.
]);

/**
 * The opening hand: something that finds the rest of the deck.
 *
 * The generic keep -- "any card costs 2 or less" -- is true on 88.8% of this
 * deck's opening hands, and seven of the seventeen cards that satisfy it are
 * Events. This keeps 59.9%, and it ships a hand that has to play the top of its
 * curve off the top of its deck.
 *
 * ## The dossier's second half is churn
 *
 * The dossier states a conjunction: "keep a hand with an early searcher --
 * OP17-032 Limejuice or the OP17-037 Event -- plus at least one rest effect to
 * give the Leader ability a target", with "throw back hands that are only large
 * bodies" behind it. The second half has a real mechanism behind it, which is
 * why it was written first: the Leader's `[Activate: Main]` reads
 * "up to 1 of your opponent's **rested** Characters will not become active",
 * and it cannot rest anything itself, so with no rested Character on the other
 * board the deck's removal is not a legal action at all. Twenty-one cards
 * supply one -- OP17-038, OP17-026, OP17-029, OP17-031, OP17-027, OP17-022 --
 * and requiring one alongside a searcher keeps 55.2%.
 *
 * It does not pay for itself. The conjunction and the searcher alone find the
 * same margin, and the conjunction gets there while disturbing considerably
 * more games. So the rest-effect term is churn: 21 of the 50 supply one, this
 * deck draws two cards a turn once a searcher lands, and the hands where the
 * term bites are hands that had found their removal by the time it mattered.
 * It is the OP16-080 Teach finding again -- the second half of a dossier
 * conjunction costing points rather than earning them -- and the reason to
 * price each half separately rather than ship them together.
 *
 * The shipped rule is worth a fraction of a point, which needs a large arm to
 * resolve: `pnpm deck:ab --deck "(Green) Shanks - Official Feature Deck"
 * --disable op17-shanks-mulligan --seeds 500`.
 *
 * Over 144 openings the rule kept 56.3% of hands against the generic rule's
 * 87.5%, shipping **45 hands the generic kept** and keeping none it would have
 * shipped -- every card it keeps for costs 1.
 */
export function createOp17ShanksMulliganModule(): PolicyModule {
  return createMulliganModule({
    id: "op17-shanks-mulligan",
    keep: (observation) =>
      observation.self.hand.some((card) =>
        SHANKS_SEARCHERS.has(card.cardNumber),
      ),
    keepBecause:
      "Keep a hand with an early searcher: this list is top-heavy and OP17-032 or OP17-037 is how it finds the half of the curve it is missing.",
    mulliganBecause:
      "Mulligan a hand with no searcher: seven of this deck's cheap cards are Events, and a hand of them plays nothing while waiting to draw its own threats.",
  });
}

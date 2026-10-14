import type { LegalAction } from "@one-piece-sim/protocol";
import { avoid, heuristics, prefer, WEIGHT } from "../heuristics.js";
import type { PolicyModule } from "../policy-module.js";
import type { HandCard, Tactics } from "../tactics.js";

/**
 * The bodies whose `[On K.O.]` pays the redirect back.
 *
 * Every one of them draws a card when it dies, and three of them also answer
 * something: Vasco Shot rests a cost-6-or-less Character, Doc Q sweeps two
 * 1-drops, Van Augur shrinks a Leader or Character by 3000, Sanjuan.Wolf turns
 * something into a 7000. That is what makes absorbing an attack a resource
 * engine rather than a cost, and it is the single most important fact for this
 * seat: an attack redirected into one of these is a card *gained*.
 */
const PAYOFF_ON_KO = new Set(["OP16-103", "OP16-106", "OP16-109", "OP16-110"]);

/** The searchers. Cheap, and the reason a 50 with three one-ofs is consistent. */
const SEARCHERS = new Set(["OP09-096", "OP09-099"]);

/**
 * Trigger cards in hand -- the deck's real defensive resource.
 *
 * The Leader's redirect is paid with one, so the count is a budget rather than a
 * property of the hand. The guide's own words: "if you have already trashed four
 * Trigger cards and only two remain in hand, you are heading into redirect
 * debt."
 */
const triggerCards = (t: Tactics): readonly HandCard[] =>
  t.hand.filter((card) => card.facts.hasTrigger);

/**
 * The cards the deck's plan is made of, which must never be spent as fuel.
 *
 * Learned from a trace: without this the seat paid its first redirect with
 * OP16-116 Zehahahahaha!, because an Event has no Counter value and so scored as
 * the cheapest thing in hand. It is the deck's win condition, and the 8- and
 * 10-cost Teach it plays for free are what it wins with.
 */
const PLAN_CARDS = new Set(["OP16-116", "OP09-093", "OP16-119", "EB04-059"]);

/**
 * How much a card in hand is worth *keeping* rather than spending as fuel.
 *
 * Three terms, in descending order of weight. A card the plan needs is not fuel
 * at any price. Counter value comes next, because Counter is the other thing a
 * card in hand does during the opponent's turn, and spending a 2000 Counter to
 * redirect an attack that a 2000 Counter would have survived is a wash at best.
 * Cost breaks the remaining ties: an expensive card is harder to replace.
 */
const keepValue = (card: {
  cardNumber: string;
  counter: number | null;
  cost: number | null;
}): number =>
  (PLAN_CARDS.has(card.cardNumber) ? 20 : 0) +
  (card.counter ?? 0) / 1000 +
  (card.cost ?? 0) / 10;

/**
 * Every clause in this deck that pays a card out of hand.
 *
 * The Leader's redirect, Fullalead's search and Shiryu's recursion all read "[printed text omitted -- pnpm card:text <card>]", and all three arrive as a `mechanic-choice`
 * over the hand. They want the same answer -- spend the least valuable card --
 * and a trace found the generic policy feeding Zehahahahaha! to Fullalead, which
 * is the deck's win condition paid for a card off the top three.
 */
const HAND_COST_SOURCES = new Set(["OP16-080", "OP09-099", "OP16-108"]);

/**
 * Rank a card being spent out of hand as a cost, least valuable first.
 *
 * Deliberately not gated on which clause is asking: the question "which card in
 * hand can I most afford to lose" has one answer per hand, and answering it in
 * one place is what keeps the three clauses from drifting apart.
 */
function scoreHandCost(action: LegalAction): number | undefined {
  if (
    action.type !== "resolve-effect" ||
    !HAND_COST_SOURCES.has(action.sourceCardNumber) ||
    action.option.kind !== "card" ||
    action.option.owner !== "self" ||
    action.option.zone !== "hand"
  ) {
    return undefined;
  }
  return 30 - keepValue(action.option.card);
}

/**
 * What an attack landing on one body rather than another is worth.
 *
 * One scale for both halves of the redirect decision, which is the point: step
 * 3 below ranks the offered targets with it, and step 1 -- which runs two
 * decisions earlier, before any target is offered -- uses it to compare the best
 * body on the board against the one the attack already has. Scoring only the
 * offered options means the pay/skip question has to *assume* what a redirect is
 * worth, and both easy assumptions are wrong: that it always costs a card (it
 * does not, when the body it kills draws one) and that there is always somewhere
 * better to point it (there is not).
 *
 * The scale is roughly "cards gained", which is why a payoff body that dies
 * leads it: the attack is spent, a card is drawn, and something of the
 * opponent's is answered on the way out.
 */
const REDIRECT_PAYS_FOR_ITSELF = 8;
const REDIRECT_WORTH_A_CARD = 4;

interface RedirectTarget {
  instanceId: string;
  cardNumber: string;
  currentPower: number;
  isLeader: boolean;
}

function targetValue(
  target: RedirectTarget,
  battle: NonNullable<Tactics["observation"]["activeBattle"]>,
  selfLife: number,
): number {
  const dies = battle.attackPower >= target.currentPower;
  // The Leader absorbs into Life, and a Life card lost comes back to hand as a
  // card that can pay the next redirect -- cheaper than losing a real body, but
  // not free, and not something to do down to the last Life card.
  if (target.isLeader) return selfLife >= 2 ? REDIRECT_WORTH_A_CARD : 1;
  if (PAYOFF_ON_KO.has(target.cardNumber))
    return dies ? REDIRECT_PAYS_FOR_ITSELF : 3;
  // Anything else: only worth being the target if it survives. Feeding a real
  // body to an attack the Leader could have taken is how this deck loses its own
  // board.
  return dies ? 0 : 5;
}

/**
 * The bodies the Leader could name, read off the observation.
 *
 * Off the observation rather than off the legal actions, because at the moment
 * the ability is offered the only actions on the table are "apply" and "skip";
 * the targets appear two decisions later. The candidate set is deliberately
 * every Character plus the Leader: the engine gates the choose on {Blackbeard
 * Pirates} / [Marshall.D.Teach], and a body that fails that gate scores here as
 * an ordinary body (`dies ? 0 : 5`), which can only make this estimate more
 * conservative, never less.
 */
function redirectCandidates(t: Tactics): RedirectTarget[] {
  return [
    {
      instanceId: `${t.observation.viewer}-leader`,
      cardNumber: t.observation.self.leader.cardNumber,
      currentPower: t.observation.self.leader.currentPower,
      isLeader: true,
    },
    ...t.observation.self.board.map((card) => ({
      instanceId: card.instanceId,
      cardNumber: card.cardNumber,
      currentPower: card.currentPower,
      isLeader: false,
    })),
  ];
}

/**
 * The whole redirect decision: whether to pay, what to pay with, and where to
 * point it.
 *
 * All three steps arrive as `resolve-effect` with `sourceCardNumber` OP16-080,
 * and they have to be scored together because they are one judgement. Left to
 * `chooseGenericRules` -- which takes the first non-skip option -- the seat pays
 * a card on every attack, including attacks that were already going to fail, and
 * points the result at whatever the engine happened to offer first.
 */
function scoreRedirect(action: LegalAction, t: Tactics): number | undefined {
  if (
    action.type !== "resolve-effect" ||
    action.sourceCardNumber !== "OP16-080"
  ) {
    return undefined;
  }
  const battle = t.observation.activeBattle;
  if (!battle) return undefined;

  // Step 1: pay at all?
  if (action.option.kind === "skip" || action.option.kind === "confirm") {
    const paying = action.option.kind === "confirm";
    // An attack that already fails needs no answer, and redirecting it onto the
    // Leader would *give* it a target it can beat.
    const connects = battle.attackPower >= battle.targetPower;
    const candidates = redirectCandidates(t);
    const current = candidates.find(
      (target) => target.instanceId === battle.targetInstanceId,
    );
    // Where the attack is already going, on the same scale. Without this term
    // the seat pays a card to move an attack that was already killing a body
    // whose [On K.O.] it wanted to cash -- and, in the position that prompted
    // this, pays a card to "move" an attack on the Leader onto the Leader.
    const staying = current ? targetValue(current, battle, t.selfLife) : 0;
    const best = candidates
      .filter((target) => target.instanceId !== battle.targetInstanceId)
      .reduce(
        (top, target) => Math.max(top, targetValue(target, battle, t.selfLife)),
        0,
      );
    // Redirect debt, but only where the debt is real. Below two Triggers a card
    // is worth more as the next turn's answer than as this turn's -- except that
    // a redirect into a body whose [On K.O.] draws pays its own card back, so it
    // never touches the budget and holding it back is declining a free absorb.
    // The dossier's words: an attack redirected into one of these is a card
    // *gained*.
    const affordable =
      best >= REDIRECT_PAYS_FOR_ITSELF ||
      triggerCards(t).length >= 2 ||
      t.facingLethal;
    const worthIt =
      connects && affordable && best >= REDIRECT_WORTH_A_CARD && best > staying;
    return paying === worthIt ? 1 : 0;
  }

  if (action.option.kind !== "card") return undefined;
  const { card, zone } = action.option;

  // Step 2: which Trigger card pays. Handled by `scoreHandCost`, which answers
  // the same question for every clause in the deck that spends a card.
  if (zone === "hand") return undefined;

  // Step 3: where the attack lands, on the same scale step 1 decided with, so
  // the target the payment was made for is the target that gets chosen.
  //
  // The target the attack already has needs no guard here: `excludeAttackTarget`
  // drops it from the offer, and `onOpponentAttackSources` withholds the prompt
  // when it was the only choice. That is the right place for it -- naming it is
  // legal and buys nothing, for every deck with redirect text rather than for
  // this one. Step 1 still has to reason about it, because "where the attack is
  // already going" is what decides whether moving it is worth a card.
  return targetValue(
    {
      instanceId: card.instanceId,
      cardNumber: card.cardNumber,
      currentPower: action.option.currentPower ?? 0,
      isLeader: zone === "leader",
    },
    battle,
    t.selfLife,
  );
}

/**
 * OP-16 Black/Yellow Marshall.D.Teach.
 *
 * `rank`-only, like `op16-nami-policy.ts` and for the same reason: every rule
 * below narrows what `chooseGenericRules` chooses from, and none of them takes a
 * decision over. That containment is what lets a single rule be A/B'd
 * (`pnpm heuristic:ab`) rather than a whole turn ladder.
 *
 * The archetype, from the published guides: control, and the deck with the
 * highest skill ceiling in the set, because its central decision is one the
 * generic policy cannot even see. The Leader raises its own Characters' cost by
 * 1 on the opponent's turn -- which is what puts them out of reach of the
 * format's "cost N or less" removal -- and then, once per opponent's attack,
 * trashes a card with a `[Trigger]` from hand to choose which of them the attack
 * hits. So the opponent's swings are answered by redirection rather than by
 * Blockers, and the answer costs a card from hand.
 *
 * Three facts do most of the work:
 *
 *  1. **Trigger cards are the defensive resource**, not Counter power. Almost
 *     every Character in the list prints one, so the deck can afford to redirect
 *     -- but only while it holds them, which makes "play a Trigger card" a
 *     decision with a hidden cost that no format fundamental knows about.
 *  2. **The cheap bodies want to die.** Doc Q, Vasco Shot, Van Augur and
 *     Sanjuan.Wolf all draw on `[On K.O.]`, so redirecting an attack into one of
 *     them is card advantage. They are not chaff to be protected; they are the
 *     point.
 *  3. **The finisher is played, not developed into.** OP09-093 Marshall.D.Teach
 *     costs 10 and its `[Activate: Main]` only fires on the turn it lands, so it
 *     is either cheated out by OP16-116 Zehahahahaha! at 10 DON!! or it is a
 *     12000 [Blocker] with no text.
 *
 * Price these with `pnpm deck:ab --deck OP16-TEACH-ZAGREB --disable op16-teach`.
 * Two things to hold in mind when reading the result. The engine withholds a
 * redirect onto the attack's current target (`excludeAttackTarget`), so the
 * control cannot make the worst blunder available here -- paying a [Trigger]
 * card to move an attack onto the body it was already hitting -- and what these
 * rules are worth is what they add over that. And a matchup the control already
 * wins outright is where a future regression would hide, so watch it rather than
 * dismiss it.
 *
 * `scoreRedirect` values the *target* rather than assuming the redirect's price,
 * and the two-Trigger reserve applies only to redirects that actually spend a
 * card -- otherwise the seat declines a redirect whose payoff body would have
 * refunded it. `test/op16-teach-policy.test.ts` pins each position.
 *
 * The matchup left visible rather than tuned away is **ST31**, the Red aggro
 * deck, where this seat is well behind. The published guides call Red aggro
 * a *favourable* matchup for this Leader, on the reasoning that the redirect
 * absorbs a linear plan. The gap is the next thing to look at, and it is more
 * likely a rule this file does not have than a rule it has wrong -- redirecting
 * costs a card per attack it cannot cash, and against a deck that attacks three
 * times a turn the budget rule above is doing the arithmetic but nothing is
 * helping the seat *stabilise* once the budget is gone.
 */
export function createOp16TeachRulesPolicy(): PolicyModule {
  return heuristics("op16-teach", [
    // --- the redirect ----------------------------------------------------
    prefer(
      "Redirect only attacks that connect, and land them on a body whose [On K.O.] pays for itself.",
    )
      .as("redirect")
      .by(WEIGHT.deck)
      .action((action, t) => scoreRedirect(action, t) ?? false),

    // Whichever clause is asking, spend the card the plan can most afford.
    prefer("Pay a hand cost with the least valuable card, never a plan card.")
      .as("hand-cost")
      .by(WEIGHT.deck)
      .action((action) => scoreHandCost(action) ?? false),

    // Keeping fuel is a rule about *playing* cards, because playing a Character
    // spends the Trigger printed on it. The reserve is two rather than one: the
    // Leader's ability is once per *attack*, so a turn with two attacks in it
    // wants two cards, and the guide names two as the floor against a deck that
    // chains Rush attacks.
    avoid("Hold a Trigger card back rather than spend the redirect reserve.")
      .as("trigger-reserve")
      .when((t) => triggerCards(t).length <= 2 && !t.lethalInRange)
      .by(30)
      .play((card) => card.facts.hasTrigger),

    // --- development -----------------------------------------------------
    // The 1-drops are the redirect targets, so they want to be on the board
    // early and in numbers -- a redirect with nothing but the Leader to point at
    // is a redirect that spends Life. Ranked above raw power for the first few
    // turns only; after that the deck wants its real bodies.
    prefer("Build the redirect targets before the big bodies.")
      .as("early-payoff-bodies")
      .when((t) => t.turn <= 5)
      .by(35)
      .play((card) => PAYOFF_ON_KO.has(card.cardNumber)),

    // Fullalead is a 1-cost Stage that converts a dead card into a live one
    // every turn it is active. It is the cheapest thing in the deck and the only
    // repeatable card selection, so it belongs down before anything competes for
    // the DON!!.
    prefer(
      "Land Fullalead early: it is the only repeatable search in the deck.",
    )
      .as("stage-first")
      .when((t) => t.turn <= 6)
      .by(40)
      .play((card) => card.cardNumber === "OP09-099"),

    // The 1-cost Event digs three for a Blackbeard Pirates card and trashes the
    // rest, which is also how Jesus Burgess grows. Cheap enough to cast on any
    // turn with a spare DON!!, and best cast early while the deck is dense.
    prefer("Spend a spare DON!! on the cheap search rather than hold it.")
      .as("cheap-search")
      .when((t) => t.hand.length <= 6)
      .by(12)
      .play((card) => SEARCHERS.has(card.cardNumber)),

    // --- the pieces that need a state to be worth playing ----------------
    // EB04-059's K.O.s are gated on having *fewer* Characters than the opponent,
    // so cast from an equal or wider board it is six DON!! for a face-up Life
    // card. The engine offers it either way -- the gate is inside the effect,
    // after the cost -- which is exactly the offered-but-useless action a deck
    // policy exists to decline.
    avoid("Do not cast Black Rope Dragon Twister from an equal or wider board.")
      .as("twister-gate")
      .when(
        (t) =>
          t.observation.self.board.length >=
          t.observation.opponent.board.length,
      )
      .by(60)
      .play((card) => card.cardNumber === "EB04-059"),

    // Zehahahahaha! is the deck's finisher enabler and only reads "if you have
    // 10 DON!! cards on your field" for the half that matters. Below ten it is
    // an 8-cost Event that strips one Life card, which is a rate this deck
    // cannot afford; at ten with a [Marshall.D.Teach] in hand it plays a 10-cost
    // body for free and then strips the Life card as well.
    avoid("Hold Zehahahahaha! until 10 DON!! and a Teach in hand make it free.")
      .as("zehaha-gate")
      .when(
        (t) =>
          t.donOnField < 10 ||
          !t.hand.some((card) => card.facts.name === "Marshall.D.Teach"),
      )
      .by(60)
      .play((card) => card.cardNumber === "OP16-116"),

    // The 10-cost Teach's whole text is gated on "[printed text omitted -- pnpm card:text OP16-116]", so a turn that lands it and does not activate it has thrown the
    // clause away. The engine only offers the activation while the gate holds,
    // so preferring it whenever offered is safe -- and it is worth more than any
    // other Main-phase activation this deck has.
    prefer("Activate the 10-cost Teach on the turn it lands, always.")
      .as("teach-activation")
      .by(WEIGHT.deck)
      .activate((action) => action.sourceCardNumber === "OP09-093"),

    // Shiryu and the 8-cost Teach both put a card on top of Life, which is this
    // deck's stabiliser *and* its Trigger supply: a Life card lost comes back as
    // a card in hand, and the deck's cards are the ones that pay for redirects.
    // Worth most when Life is the binding constraint.
    prefer("Stack Life while it is the binding constraint.")
      .as("life-stack")
      .when((t) => t.selfLife <= 2)
      .by(30)
      .play((card) => ["OP16-108", "OP16-119"].includes(card.cardNumber)),

    // Jesus Burgess is +1000 for every four cards in the trash and cannot be
    // K.O.'d by an effect, so he is a wall that grows. Early he is a 5000 for 4;
    // once the searchers have filled the trash he is the body the opponent has
    // to attack into rather than remove.
    prefer("Play Burgess once the trash has made him a wall.")
      .as("burgess-timing")
      .when((t) => t.trash.length >= 8)
      .by(20)
      .play((card) => card.cardNumber === "OP09-086"),

    // Otherwise develop the largest body the DON!! can pay for -- a magnitude
    // rather than a card table, so it needs no maintenance as the list changes.
    prefer("Develop the largest body the DON!! can pay for.")
      .as("develop-biggest")
      .play((card) => card.facts.power / 1000),
  ]);
}

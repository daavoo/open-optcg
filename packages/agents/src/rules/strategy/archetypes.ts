import { donThresholdRule } from "../format-heuristics.js";
import {
  mustAct,
  never,
  prefer,
  WEIGHT,
  type Heuristic,
} from "../heuristics.js";
import { opponentLeaderId, selfLeaderId, type Tactics } from "../tactics.js";
import type { AttackAction } from "../generic-policy.js";
import type { CardFacts } from "@one-piece-sim/protocol";
import {
  registerStrategyProfile,
  type StrategyParams,
  type StrategyProfile,
} from "./profile.js";

/**
 * The format's archetypes, as inheritable strategy profiles.
 *
 * The taxonomy follows how the game is actually described by the people who play
 * it -- aggro, midrange and control, with colour archetypes underneath -- rather
 * than an abstraction of our own, so a claim from a deck guide maps onto a profile
 * without translation:
 *
 * The shape, with one deck profile shown per root rather than all of them:
 *
 * ```
 * aggro                          the race: clock, Life-as-resource, board width
 * |-- red-aggro                  Rush, press Life over board
 * |   |-- red-aggro-luffy-st31   Straw Hat chains (parameters only)
 * |   `-- red-aggro-zoro-st32    no development at all inside the kill range
 * `-- aggro-unenrolled           claims a Leader, adds nothing
 * midrange                       curve out, shape the board to the opponent, convert
 * |-- midrange-sabo-st35         reach cost 8, switch on the aura, stop paying for Life
 * |-- midrange-kid-st36          keep the restand legal, fall to Life parity
 * `-- midrange-unenrolled        claims a Leader, adds nothing
 * control                        answer the board, win on cards, keep the Life
 * |-- control-kuzan-st33         answers that deny attacks rather than K.O. them
 * |-- control-katakuri-st34      a Leader that pays DON!! to defend, and the ramp for it
 * `-- control-unenrolled         claims a Leader, adds nothing
 * ```
 *
 * The three roots hold what an archetype is; a deck profile holds only what is
 * true of that deck alone, which is usually one or two printed clauses nobody
 * else has. The three `*-unenrolled` profiles carry no rules at all: they exist
 * to claim the Leaders that already have a hand-written deck policy, because
 * layering a root's rules underneath a measured policy is its own change and
 * needs its own A/B rather than arriving as a side effect of this file.
 *
 * ## Every rule cites its claim, and none of them are trusted
 *
 * Community piloting advice is a hypothesis generator with a good prior, never an
 * authority. A community fundamental can be right for one deck in this pool
 * and badly wrong for another -- "attach DON!! only where it crosses a Counter
 * threshold" is registered for ST35 and nowhere else for exactly that reason.
 * The claim behind each rule below is quoted at the
 * rule; the sources are collected in
 * `docs/proposals/archetype-strategy-layer.md`, and no rule is believed until
 * `pnpm deck:ab --deck <ID> --disable strategy:<layer>` says so.
 *
 * ## Weights
 *
 * Every rule states its band from {@link WEIGHT}. `applyRanking` sums
 * contributions and keeps the per-action-type maximum, so a deeper layer's
 * preference must be able to outrank a shallower one on the same candidate
 * without either rule being deleted -- that is what inheritance means here. The
 * bands make that ordering specified rather than emergent.
 */

/**
 * Whether an attack presses the plan: the Leader, or the Blocker in the way.
 *
 * Shared by the `aggro` and `red-aggro` press rules, which differ only in how
 * far behind the clock they are still willing to press from. Writing the subject
 * once and the gate twice is the shape a child override is supposed to take: the
 * refinement is *when* the parent's judgement applies, not what it is.
 *
 * A Blocker counts as pressing rather than as a detour because it is: a Blocker
 * absorbs one attack per turn, so it removes a hit from the clock exactly as a
 * point of Life does, and `race.ts` prices it that way. This is the one exception
 * to "aggro takes Life, not board", and it is not really an exception.
 */
function pressesTheClock(attack: AttackAction, t: Tactics): boolean {
  if (attack.targetInstanceId === opponentLeaderId(t.observation)) return true;
  const target = t.observation.opponent.board.find(
    (card) => card.instanceId === attack.targetInstanceId,
  );
  return target?.blocker === true;
}

/**
 * True when the format-wide `threat-removal` rule has jurisdiction here.
 *
 * The exact inverse of that module's own gate, and the press rules below turn
 * themselves off when it holds. Both layers have an opinion about the same
 * `attack` candidates, and without this they fight: the archetype claim ("aggro
 * takes Life, not board") is unmeasured, while `threat-removal` is measured and
 * shipped format-wide. An unmeasured rule must not silently override a measured
 * one, so the two are made disjoint by
 * construction rather than arbitrated by weight -- which also means a later
 * change to `threat-removal`'s target filter cannot quietly re-open the
 * conflict, because this predicate is what the deferral is written against.
 *
 * The narrower claim that survives is still the interesting one: press the
 * Leader rather than chip at *marginal* bodies. That is what aggro gets wrong
 * without a race model, and it is untouched by the deferral.
 */
function threatRemovalHasJurisdiction(t: Tactics): boolean {
  return t.observation.opponent.board.some(
    (card) => card.rested && (card.blocker || card.cost >= 4),
  );
}

/** Remaining Counter power the defender must find to survive the current hit. */
function counterDemandOfCurrentBattle(t: Tactics): number | undefined {
  const battle = t.observation.activeBattle;
  if (!battle?.targetInstanceId.endsWith("-leader")) return undefined;
  return battle.attackPower - battle.targetPower - battle.counterPower + 1;
}

const RUSH_KEYWORDS = ["Rush", "Rush: Character"] as const;

function hasRush(keywords: readonly string[]): boolean {
  return RUSH_KEYWORDS.some((keyword) => keywords.includes(keyword));
}

/**
 * Static `+N cost` text, as a number.
 *
 * The observation reports a board card's **printed** cost, and five of ST35's
 * bodies reach cost 8 -- the Leader aura's condition -- only through static text
 * that raises it on the field. Without this, "do I have a cost-8 Character"
 * reads false in every position where the deck's whole plan has succeeded.
 *
 * Parsed rather than tabulated for the same reason `answersTheBoard` is, and
 * summed rather than maxed because the clauses stack in principle; no card in the
 * format prints two of them today, so the two readings agree.
 *
 * Deliberately optimistic about conditions. `OP12-043 Kuzan` gains its +1 only
 * while its controller holds five cards, and this counts it anyway. That is
 * acceptable for the one rule that reads it -- ST35's own cost bonuses are gated
 * on a {Revolutionary Army} Leader, which ST35 always has -- and it is written
 * down here so the next reader does not discover it from a wrong answer.
 */

function onFieldCost(facts: CardFacts | undefined): number {
  if (!facts) return 0;
  let bonus = 0;
  for (const boost of facts.rules.costBoosts) bonus += boost;
  return facts.cost + bonus;
}

/** The cost band ST36's Leader restand can reach, from its printed text. */
const KID_RESTAND_MIN_COST = 3;
const KID_RESTAND_MAX_COST = 8;

/** Whether a cost is inside ST36's Leader restand band. */
function withinRestandBand(cost: number | undefined): boolean {
  return (
    cost !== undefined &&
    cost >= KID_RESTAND_MIN_COST &&
    cost <= KID_RESTAND_MAX_COST
  );
}

// --- aggro ------------------------------------------------------------------

/**
 * The race, as rules.
 *
 * Everything here is a consequence of one fact about this game that is not true
 * of most: Life *is* card advantage. A Leader hit taken moves a Life card into
 * hand, so absorbing is close to card-neutral while a multi-card Counter line is
 * a straight loss. Whether that trade is good is therefore a fact about the
 * clock, not about the board -- right at 4 Life against a three-turn clock, wrong
 * at 4 Life against a one-turn clock -- which is why every rule below gates on
 * `t.race` and none of them gate on Life alone.
 */
function aggroRules(params: StrategyParams): readonly Heuristic[] {
  return [
    // "Aggro decks want to put the opponent out of the game before they can set
    // themselves up ... they have pretty good matchups against decks that need
    // to build a board." The corollary is the rule: while the clock is being
    // won, Life is the win condition and the board is not.
    prefer(
      "Press the Leader while ahead on the clock: Life is the win condition, the board is not.",
    )
      .by(WEIGHT.archetype)
      .as("press-leader")
      .when(
        (t) =>
          t.observation.phase === "main" &&
          t.race.role === "beatdown" &&
          !threatRemovalHasJurisdiction(t),
      )
      .attack(pressesTheClock),

    // "Early, your counters are often better spent developing the board, since
    // burning two cards to prevent one point of chip damage on turn two costs
    // more than falling behind on board." Strictly narrower than the format-wide
    // `counter-budget` (which allows 2), so the two vetoes compose: the tighter
    // one simply bites first.
    never(
      "Absorb this Leader hit: a racing deck spends Life to buy cards, not cards to buy Life.",
    )
      .as("counter-budget")
      .when((t) => {
        const required = counterDemandOfCurrentBattle(t);
        if (required === undefined) return false;
        // A hit at 0 Life ends the game; nothing is worth preserving past it.
        if (t.selfLife <= 0) return false;
        // At or below the floor, Life has stopped being a resource -- and if the
        // race is already lost, this deck is not the beatdown any more.
        if (t.selfLife <= params.lifeFloor) return false;
        if (t.race.mustStabilise) return false;
        return t.counterCardsNeeded(required) > params.leaderCounterBudget;
      })
      .counter(() => true),

    // "Aim for a swift victory by playing one low-cost Character card after
    // another, focusing first on getting Characters onto the field."
    //
    // Width is counted in *hits*, not in bodies, which is the correction that
    // makes the rule true. A body that does not already out-power the defending
    // Leader adds nothing to the clock -- `race.ts` does not count it either --
    // so two 2000-power bodies against a 5000 Leader are not two hits, they are
    // none, and preferring them over one real threat is strictly worse. A first
    // draft counted bodies and hid ST31's turn-4 Franky in favour of two small
    // ones; `test/decision-scenarios.test.ts` pins that line.
    prefer(
      "Build board width before body quality: two attackers that already out-power the Leader are two hits per turn, one bigger body is one.",
    )
      .by(WEIGHT.archetype)
      .as("board-width")
      .when(
        (t) =>
          t.observation.phase === "main" &&
          t.observation.self.board.length < params.targetBoardWidth &&
          t.affordablePlays.length >= 2,
      )
      .play((card, t) => {
        const threatens = (power: number): boolean =>
          power >= t.opponentLeaderPower;
        if (!threatens(card.facts.power)) return false;
        const remaining = t.don - card.cost;
        return t.affordablePlays.some((action) => {
          const other = t.playedCard(action);
          return (
            other !== undefined &&
            other.instanceId !== card.instanceId &&
            other.cost <= remaining &&
            threatens(other.facts.power)
          );
        });
      }),

    // "Attach DON!! where it crosses a Counter threshold" is registered
    // format-wide for exactly one deck, because format-wide it is a wash made of
    // two significant opposite effects. It is not a format rule: draining the
    // defender's Counter cards is an *aggro* plan, and this is the widest scope
    // on which the claim is actually true. Reused rather than copied, so the
    // arithmetic stays in one place.
    donThresholdRule(WEIGHT.archetype, "don-threshold"),

    // The additive rule, and the reason `mustAct` exists. Every other tier here
    // is subtractive, so without it the agent can be talked out of an attack but
    // never into one -- and a racing deck that ends its turn holding a winning
    // attack has handed a turn back. Terminating: each attack it forces
    // rests an attacker, so `viableAttacks` strictly shrinks.
    mustAct(
      "Keep attacking: an unused winning attack while ahead on the clock is a turn given back.",
    )
      .as("keep-attacking")
      .when(
        (t) =>
          t.observation.phase === "main" &&
          t.race.role === "beatdown" &&
          !t.race.mustStabilise,
      )
      .insteadOfPass((t) => t.viableAttacks.length > 0),

    // The gear change. "Because Life becomes cards, trading Life for tempo early
    // is often smart; near zero, you must block or Counter." `chooseGenericBlock`
    // preserves Blockers against any hit the Leader can absorb, which is correct
    // for a deck with time and fatal for one that has run out of it: the race is
    // lost, so the Blocker's next-turn contribution is worth nothing.
    mustAct("The race is lost: block this hit rather than absorb it.")
      .as("stabilise")
      .when((t) => t.race.mustStabilise && t.leaderUnderAttack)
      .insteadOfPass((t) =>
        t.actions.some((action) => action.type === "block"),
      ),
  ];
}

const aggro: StrategyProfile = {
  id: "aggro",
  summary:
    "Win the race. Spend Life to buy cards, spend cards to buy hits, and press until the clock is lost.",
  pattern: "aggro",
  params: {
    // One, against the format's two: this deck's cards are its pressure and its
    // Life is what it is spending to buy them.
    leaderCounterBudget: 1,
    lifeFloor: 2,
    targetCloseTurn: 6,
    targetBoardWidth: 3,
    raceAbandonMargin: 1,
  },
  rules: aggroRules,
};

// --- red-aggro --------------------------------------------------------------

/**
 * Red's version of the race: [Rush], and a lower bar for pressing.
 *
 * Red "wants to pressure your opponent from Turn 2 and end the game before they
 * can set up defenses", and its distinguishing tool is [Rush] -- a body that
 * attacks the turn it lands, which is the only card in the game that buys a turn
 * off the clock rather than a hit on it.
 */
function redAggroRules(params: StrategyParams): readonly Heuristic[] {
  return [
    // "Playing Characters with [Rush] amps up the pressure ... an extra attack."
    prefer(
      "Prefer a [Rush] body: it attacks the turn it lands, which is the only way to buy a turn off the clock.",
    )
      .by(WEIGHT.subArchetype)
      .as("prefer-rush")
      .when((t) => t.observation.phase === "main")
      .play((card) => hasRush(card.facts.keywords)),

    // The child override the inheritance model is for. The parent presses only
    // while `role === "beatdown"`; red aggro has no second win condition, so it
    // presses whenever the race is not *already* lost. Same subject, wider gate,
    // heavier band -- the parent rule is untouched and still explains the
    // narrower case in a trace.
    prefer(
      "Red aggro presses Life whenever the race is not already lost: the deck has no other win condition.",
    )
      .by(WEIGHT.subArchetype)
      .as("press-unless-lost")
      .when(
        (t) =>
          t.observation.phase === "main" &&
          !t.race.mustStabilise &&
          !threatRemovalHasJurisdiction(t),
      )
      .attack(pressesTheClock),

    // "Aggro decks attack every turn and kill by turn 5-6." Inside the kill
    // range a body played now never attacks, so the DON!! it costs is DON!! not
    // spent on damage.
    //
    // Two exemptions:
    //
    //  - **[Rush].** The body does attack; that is the whole point of the keyword.
    //  - **[On Play] text.** The *body* cannot attack, but the play can still add
    //    to this turn's damage -- and for a deck built on chains it usually does.
    //    The premise "a body played now never attacks" is true of the body and
    //    false of the turn: ST31's Sanji fetches Chopper, Chopper gives the Leader
    //    rested DON!!, and the Leader gives a fresh Sanji [Rush]. Reading the text
    //    is how `no-hopeless-attack` and `dead-trigger` make the same kind of
    //    distinction.
    //
    // The `[On Play]` exemption is what makes the rule safe for ST31 and is
    // wrong for ST32, which gets the broad version back in
    // `red-aggro-zoro-st32`; see there for what the reasoning above does
    // *not* explain.
    never(
      "Inside kill range a body played now never attacks; spend the turn on damage instead.",
    )
      .as("no-late-development")
      .when(
        (t) =>
          t.observation.phase === "main" &&
          t.maxLeaderHits > 0 &&
          t.opponentLife <= t.maxLeaderHits &&
          t.turn >= params.targetCloseTurn - 2,
      )
      .play(
        (card) =>
          !hasRush(card.facts.keywords) &&
          !card.facts.rules.clauses.includes("[On Play]"),
      ),
  ];
}

const redAggro: StrategyProfile = {
  id: "red-aggro",
  extends: "aggro",
  summary:
    "Aggro with [Rush]. Press Life from turn two and close by turn five; the board is a means, never the plan.",
  pattern: "aggro",
  // No Leader pilots `red-aggro` directly: ST32 goes through
  // `red-aggro-zoro-st32` and ST31 through `red-aggro-luffy-st31`. A profile with
  // no leaders is not dead -- it is where the shared rules live.
  params: { targetCloseTurn: 5, targetBoardWidth: 4 },
  rules: redAggroRules,
};

// --- red-aggro-luffy-st31 ---------------------------------------------------

/**
 * ST31 Monkey.D.Luffy, as parameter overrides only.
 *
 * Deliberately no rules yet. The inheritance mechanism has to be measured
 * before deck knowledge is poured into it, and ST31 is the strongest deck in
 * the field -- which makes it the best control for "did the archetype layer do
 * anything?" and the worst place to also be adding new card knowledge.
 *
 * The lines to encode when it is time are already written down, in
 * `packages/agents/src/llm/dossiers/index.ts` under `ST31`: give the Leader rested DON!!
 * from Thousand Sunny *before* declaring its attack, run the
 * Sanji -> Chopper -> Leader chain to give a fresh Sanji [Rush], and order
 * Character attacks smallest-to-largest so a whole-turn defence cannot be baited
 * by a small one. Each of those is a `rank` rule at {@link WEIGHT.deck}.
 */
const redAggroLuffySt31: StrategyProfile = {
  id: "red-aggro-luffy-st31",
  extends: "red-aggro",
  summary:
    "ST31 Straw Hat red aggro: search chains and rested-DON!! gifts feeding an earlier clock.",
  pattern: "aggro",
  leaders: ["ST21-001"],
  // No parameter overrides, and in particular no `lifeFloor` override. Lowering
  // it widens the inherited `counter-budget` veto's window, letting the rule
  // decline Counter lines all the way down to 2 Life, and nothing about a deck
  // chaining searchers says that is right for this seat.
};

// --- red-aggro-zoro-st32 ----------------------------------------------------

/**
 * Base cost the ST32 Leader may no longer attack once its restand is spent.
 *
 * Taking the restand writes a `leader-cannot-attack-characters` restriction for
 * the rest of the turn, and the printed bound on it is a base cost of 7 or
 * less. It is read here as evidence rather than as a rule: see
 * {@link zoroRestandAvailable}.
 */
const ZORO_RESTAND_RESTRICTED_COST = 7;

/**
 * Whether this Leader can still turn a Character battle into a second attack.
 *
 * Two conditions, both read off the engine rather than assumed:
 *
 *  - **The `[DON!! x3]` is switched on.** `needsDonForAbility` asks the clause's
 *    own question, and below three DON!! there is no ability to earn -- the
 *    Leader is an ordinary attacker and the press rules are right about it.
 *    The raw predicate and not `canCompleteDonAbility`: this reads whether the
 *    restand is live *now*, and a Leader that could still assemble the count
 *    later in the turn has not assembled it yet.
 *  - **The restand is unspent.** Taking it forbids the Leader from attacking
 *    Characters with a base cost of 7 or less for the rest of the turn, so one
 *    of those attacks still being offered is proof the ability has not fired.
 *    That is the same proof `st32-policy.ts` uses to order its own attacks, and
 *    it is proof rather than bookkeeping: a once-per-turn counter of our own
 *    would be a second, quietly diverging opinion of what the engine already
 *    knows.
 */
function zoroRestandAvailable(t: Tactics): boolean {
  const leaderId = selfLeaderId(t.observation);
  if (t.needsDonForAbility(leaderId)) return false;
  const opponentLeader = opponentLeaderId(t.observation);
  return t.observation.legalActions.some(
    (action) =>
      action.type === "attack" &&
      action.attackerInstanceId === leaderId &&
      action.targetInstanceId !== opponentLeader &&
      (t.observation.opponent.board.find(
        (card) => card.instanceId === action.targetInstanceId,
      )?.cost ?? Number.POSITIVE_INFINITY) <= ZORO_RESTAND_RESTRICTED_COST,
  );
}

/**
 * A Leader attack that earns the restand: any of them aimed at a Character.
 *
 * Not narrowed to the battles the Leader wins, and not narrowed to the cost
 * band above. The engine records `leader-battled-character` on *declaration*,
 * before it compares power, so every Character target pays the ability equally
 * and the choice between them is a question about the board -- which body is
 * worth removing -- that `st32-policy.ts` already answers. This rule exists
 * only to keep those candidates in front of it.
 */
function earnsZoroRestand(action: AttackAction, t: Tactics): boolean {
  return (
    action.attackerInstanceId === selfLeaderId(t.observation) &&
    action.targetInstanceId !== opponentLeaderId(t.observation)
  );
}

/**
 * ST32 Roronoa Zoro, whose closing turns are worth more than a generic red
 * deck's -- so development inside the kill range is worth less.
 *
 * Two rules. The parent's `no-late-development` vetoes non-[Rush] plays inside
 * the kill range, but exempts cards with `[On Play]` text, because for most
 * red decks the play still adds to the turn's damage. That exemption is right
 * for the archetype and wrong here, so this profile restores the broad version
 * for this seat only: two vetoes compose, and this one covers a superset of
 * the parent's.
 *
 * The deck-level reason it is true here and not one level up: this Leader
 * restands to attack again when it battled a Character, so a closing turn holds
 * more damage than a generic red deck's does, and DON!! spent on a body instead
 * of on that second attack costs proportionally more.
 *
 * That reason is honest about being partial. It does not explain the whole
 * gap -- Tashigi and Kuina both have `[On Play]` text that hands the Leader
 * rested DON!! and therefore *does* add damage, yet vetoing them is still
 * better here. Some of it is likely this deck's ladder being weaker in
 * the closing window rather than a truth about the archetype, which is an
 * argument for auditing that ladder, not for widening the parent rule.
 *
 * The second rule is what makes the first one's premise reachable: it keeps the
 * Character battle that earns the restand in front of the deck's own ladder.
 * See {@link earnsZoroRestand}.
 */
function redAggroZoroSt32Rules(params: StrategyParams): readonly Heuristic[] {
  return [
    never(
      "This Leader's closing turn holds a restand, so no development inside the kill range at all.",
    )
      .as("no-development-in-kill-range")
      .when(
        (t) =>
          t.observation.phase === "main" &&
          t.maxLeaderHits > 0 &&
          t.opponentLife <= t.maxLeaderHits &&
          t.turn >= params.targetCloseTurn - 2,
      )
      .play((card) => !hasRush(card.facts.keywords)),

    prefer(
      "Battle a Character with the Leader while the restand is unspent: the extra attack it earns is a hit on the clock, not a detour off it.",
    )
      .by(WEIGHT.deck)
      .as("earn-the-restand")
      .when((t) => t.observation.phase === "main" && zoroRestandAvailable(t))
      .attack(earnsZoroRestand),
  ];
}

const redAggroZoroSt32: StrategyProfile = {
  id: "red-aggro-zoro-st32",
  extends: "red-aggro",
  summary:
    "ST32 red aggro: a Leader that restands off a Character battle, so closing turns beat development outright.",
  pattern: "aggro",
  leaders: ["OP12-020"],
  rules: redAggroZoroSt32Rules,
};

// --- midrange ---------------------------------------------------------------

/**
 * The board plan, as rules.
 *
 * Midrange is described by the people who play it as developing a board and then
 * parleying that board into a win: "they maintain a good presence in the early
 * game and build boards too big for aggro to get through before closing the game
 * in the mid-to-late game". Two claims follow from that and both are here.
 *
 * The first is **playing on curve** -- "utilizing every DON!! available to you to
 * develop your board ... playing the strongest possible play available to your
 * deck on every turn up to turn 5-6". For a deck whose win condition is the
 * board, a DON!! not spent on a body is a DON!! spent on nothing.
 *
 * The second is that the *shape* of the board is a function of the opponent:
 * "against a controlling deck, flooding the board with cheap Characters can be
 * effective; against an aggressive deck, concentrating resources on fewer,
 * harder-to-remove threats is often more sustainable". Only the go-tall half of
 * that survives here. Its `go-wide` complement is not implementable as stated:
 * a `rank` rule preferring the cheap play hides the expensive one, so "go
 * wide" becomes "never go tall", which is a stronger and worse claim. What is
 * left still reads
 * `opponentArchetype`: the curve rule holds its tongue against control rather
 * than pressing the opposite claim there.
 *
 * What midrange does *not* get is a Counter rule. `aggro` spends Life to buy
 * cards because it will not be alive to use the last two; `control` protects Life
 * because it plans to win from behind. Midrange sits between them, which is
 * exactly the position where the format-wide budget of 2 is already the right
 * answer -- so the honest thing is to write no rule rather than to guess a third
 * number.
 */
function midrangeRules(params: StrategyParams): readonly Heuristic[] {
  return [
    // Playing on curve, and the go-tall half of the shape claim. Ranked by cost
    // rather than by power because cost is what the curve is measured in and
    // what removal reads: the same 1000 power is worth more on a body an
    // opponent's cost-gated answer cannot reach.
    //
    // `cost + 1` because `contribute` treats 0 as an abstention, and a 0-cost
    // body is a real play in this format -- ST36's OP10-103 Bege is one. Without
    // the offset it would be the one card the rule silently could not rank.
    prefer(
      "Play on curve: spend the turn's DON!! on the biggest body the board still wants, because a midrange deck's win condition is the board.",
    )
      .by(WEIGHT.archetype)
      .as("play-on-curve")
      .when(
        (t) =>
          t.observation.phase === "main" &&
          t.opponentArchetype !== "control" &&
          t.turn <= params.targetCloseTurn &&
          t.observation.self.board.length < params.targetBoardWidth,
      )
      .play((card) => card.cost + 1),

    // The corollary of the curve claim, and the one rule here that has to be a
    // veto: "develop rather than power up" compares two *different action types*,
    // and `rank` never compares across groups. Removing the attachment leaves the
    // deck policy to fall through to its own play logic.
    //
    // The format-wide `don-reservation` module already refuses an attachment that
    // would block *all* development. This is the wider midrange version of the
    // same claim -- while the board is still being built, +1000 power on one body
    // is worth less than another body -- and it keeps that module's exemption for
    // a unit still waiting on its own `[DON!! xN]` condition, because that DON!!
    // is buying an ability rather than power.
    never(
      "Curve out before powering up: while the board is still being built, another body beats +1000 power.",
    )
      .as("develop-before-power")
      .when(
        (t) =>
          t.observation.phase === "main" &&
          t.turn <= params.targetCloseTurn &&
          t.observation.self.board.length < params.targetBoardWidth &&
          t.affordablePlays.length > 0,
      )
      .attachDon(
        (action, t) => !t.canCompleteDonAbility(action.targetInstanceId),
      ),

    // "A midrange deck develops a board and tries to parley that board presence
    // into a win." The parley is the half a board-building ladder leaves out: a
    // board built and never converted is how a midrange policy draws a game it
    // had won. Gated on the board actually being built, which is what separates this from
    // `aggro`'s `press-leader` -- same subject, but the archetype presses only
    // once the plan has been carried out, and defers to `threat-removal` on the
    // same terms.
    prefer("The board is built: convert it into Life while ahead on the clock.")
      .by(WEIGHT.archetype)
      .as("convert-the-board")
      .when(
        (t) =>
          t.observation.phase === "main" &&
          t.observation.self.board.length >= params.targetBoardWidth &&
          t.race.role === "beatdown" &&
          !threatRemovalHasJurisdiction(t),
      )
      .attack(pressesTheClock),
  ];
}

const aggroUnenrolled: StrategyProfile = {
  id: "aggro-unenrolled",
  summary:
    "Aggro decks with a hand-written deck policy of their own: pattern declared, archetype rules deliberately not inherited.",
  pattern: "aggro",
  // OP16 Red Portgas.D.Ace. The third of these, and for the same reason as the
  // midrange and control pair: its seat is piloted by `op16-ace-policy.ts`,
  // written against the Leader's own [Rush] grant and the "8000 power" currency
  // three other clauses spend. The `red-aggro` root's rules are about pressing
  // Life over board with cheap bodies, and this deck presses Life with 8000s it
  // also wants to hold in hand as Counters -- so layering the root underneath is
  // a change to a measured policy and needs its own `pnpm heuristic:ab` run
  // before it is believed, not a free ride on this enrollment.
  //
  // ST30-001 Luffy & Ace is the fourth: `red-aggro`'s rules are about pressing
  // Life over board with cheap bodies, and this Leader's second clause pays
  // its Characters +3000 on the *opponent's* turn -- so what looks like a
  // wasted development turn to a pure race model is this deck putting up a
  // 9000 wall. `st30-luffy-ace-policy.ts` is written against that; the root
  // would argue with it.
  //
  // OP15-058 Purple Enel is the fifth. Its dossier calls it "one of the
  // format's fastest, most aggressive decks", so the `aggro` pattern is the
  // right declaration -- but the root's rules add nothing here. The deck's own
  // Counter policy and Event gate already say what the root would say, and
  // `press-leader`'s "attack while beatdown" pushes 2000 vassals into battles
  // the Leader gift was going to win anyway. Pattern declared, root not
  // inherited.
  //
  // OP15-039 Blue Rebecca is the sixth, and the only one unenrolled on a
  // measurement of the root rather than on a deck policy it would disturb. Of
  // the root's rules one pays here -- `don-threshold`, which the deck registers
  // for its own Leader in `registry.ts` -- and the rest are no help to a Leader
  // that never attacks: `stabilise` blocks a lost race's hits with the bodies
  // that are this deck's whole clock, and a Life card taken is a card for a
  // hand that replays 1-costs every turn.
  leaders: ["OP16-001", "ST30-001", "OP15-058", "OP15-039"],
};

/**
 * (Green/Yellow) Yamato, OP06-022.
 *
 * Enrolled under the `aggro` root rather than listed in `aggroUnenrolled`,
 * because there is no measured deck policy here to protect: this deck ships
 * with a mulligan and nothing else, so the root's rules are its first piloting
 * rather than a change to an existing one.
 *
 * It is the obvious next candidate for the `audit-deck-policy` playbook, and
 * the reason is specific. Four of the list's Characters print
 * "[printed text omitted -- pnpm card:text OP06-022]", so
 * the *opponent's* Life total decides whether damage refills this board or
 * merely draws a card -- and no archetype rule in this file knows that a Life
 * threshold on the other side of the table changes what a turn is worth.
 * `pnpm heuristic:ab --deck "(Green/Yellow) Yamato - Official Feature Deck"`
 * is what would price a rule for it.
 */
const aggroYamatoOp06: StrategyProfile = {
  id: "aggro-yamato-op06",
  extends: "aggro",
  summary:
    "OP06 (Green/Yellow) Yamato: get the opponent to three Life with [Double Attack], then collect on the Triggers that play their own Characters for free.",
  pattern: "aggro",
  leaders: ["OP06-022"],
};

/**
 * OP14 (Blue) Jinbe.
 *
 * Enrolled under the `aggro` root for the same reason as Yamato: the deck
 * ships with its own rules for the Leader's discard and nothing that speaks to
 * when to press Life, so the root's rules are its first piloting of that
 * question rather than a change to a measured one.
 */
const aggroJinbeOp14: StrategyProfile = {
  id: "aggro-jinbe-op14",
  extends: "aggro",
  summary:
    "OP14 (Blue) Jinbe: trash a card from hand to give two rested DON!! to a Fish-Man, and swing a board of cheap bodies above their cost.",
  pattern: "aggro",
  leaders: ["OP14-040"],
};

/**
 * OP12 (Red) Silvers Rayleigh.
 *
 * Enrolled under the `aggro` root: the Leader forbids any card of cost 5 or
 * more, so the deck has no top end to wait for, and its clauses -- the
 * Leader's +2000, Luffy's extra body, Shanks's [Rush] -- all spend a turn
 * adding attacks rather than building a board to hold. The deck's own rule is
 * its opening hand. See `op12-rayleigh-policy.ts`.
 */
const aggroRayleighOp12: StrategyProfile = {
  id: "aggro-rayleigh-op12",
  extends: "aggro",
  summary:
    "OP12 (Red) Silvers Rayleigh: hold two Events to pay the reveal clauses, and attack wide with 4-or-less bodies the Leader lifts by +2000.",
  pattern: "aggro",
  leaders: ["OP12-001"],
};

const midrange: StrategyProfile = {
  id: "midrange",
  summary:
    "Develop a board, make it too big for aggro to get through, then convert it in the mid-game.",
  pattern: "midrange",
  // No Leader pilots the root directly. Every midrange deck goes through a deck
  // profile of its own, whether or not that profile adds rules -- which is what
  // makes `--disable strategy:midrange-luffy-op17` address one deck.
  params: {
    // Wider and slower than `aggro`'s: this deck wins with the board, so it is
    // still developing on the turn aggro is closing.
    targetBoardWidth: 4,
    targetCloseTurn: 7,
  },
  rules: midrangeRules,
};

// --- control ----------------------------------------------------------------

/**
 * Answer the board, win on cards.
 *
 * The colour guides put it in one sentence: blue "offers many control options,
 * whether you want to constantly remove your opponent's cards from play ... or
 * draw cards to defend your life", and a control deck "excels in calculated
 * plays, deck manipulation, and control". What the rules layer needs out of that
 * is the inversion of `aggro`: cards are the win condition and Life is what buys
 * the turns to spend them in.
 *
 * One rule remains, and it is `aggro`'s Life clause mirrored: aggro spends Life
 * to buy cards, control refuses to, because it is the one archetype that expects
 * to still be alive on the turn the last Life card matters.
 *
 * **What cannot be written here, and why.** `applyRanking` keeps the
 * per-action-type maximum, so a `prefer` rule that abstains on every play
 * outside its own category does not merely fail to promote the others -- it
 * *hides* them. At this altitude, where no deck policy is underneath to
 * re-widen the set, "prefer X" silently becomes "play nothing but X". So the
 * two claims that open every control guide -- prefer a play that answers the
 * opponent's board, prefer a [Blocker] while losing the race -- are not
 * expressible as archetype rules: they become "never develop while the
 * opponent has a board" and "develop nothing but Blockers".
 *
 * Measure any candidate here on the control decks that have *no* deck policy
 * of their own. A deck with a bespoke `decide` policy reaches past the
 * narrowed set and hides the fault.
 *
 * The narrow version of the first claim survives one level down in
 * `control-kuzan-st33`, which is the shape a rule of this kind has to take
 * today. Both become expressible here again the day `rank` can distinguish
 * "no opinion" from "worse".
 */
function controlRules(params: StrategyParams): readonly Heuristic[] {
  return [
    // The mirror of `aggro`'s `counter-budget`, and the second use of `mustAct`:
    // `chooseGenericBlock` answers any survivable hit with `pass`, which is
    // right for a deck that is spending Life on purpose and wrong for the one
    // archetype that is not. A control deck at its Life floor has already spent
    // the Life that was a resource.
    //
    // `battleHitLands` is what keeps that from becoming "block every attack
    // aimed at the Leader". The Block step opens after the
    // `[On Your Opponent's Attack]` ladder, so the defender may already have
    // paid a card to put this hit out of reach -- and there is then no Life to
    // preserve, only a Blocker to throw away on top of the card. Every colour
    // that prints such a clause is a colour this profile pilots.
    mustAct(
      "Life is not a resource for a deck that wins late: block this hit rather than absorb it.",
    )
      .as("preserve-life")
      .when(
        (t) =>
          t.selfLife <= params.lifeFloor &&
          t.leaderUnderAttack &&
          t.battleHitLands,
      )
      .insteadOfPass((t) =>
        t.actions.some((action) => action.type === "block"),
      ),
  ];
}

const control: StrategyProfile = {
  id: "control",
  summary:
    "Answer the board, win on cards. Life is spent buying answers, not tempo.",
  pattern: "control",
  params: {
    // Three, against the format's two and `aggro`'s two. The floor is where
    // `preserve-life` starts refusing to absorb, and a control deck reaches its
    // own win condition later than the hit it is declining.
    lifeFloor: 3,
    // The game goes long on purpose; nothing here closes by turn six.
    targetCloseTurn: 9,
  },
  rules: controlRules,
};

// --- control-kuzan-st33 -----------------------------------------------------

/**
 * ST33 Kuzan: answers that stop attacks rather than K.O. them.
 *
 * The list is unusual, and both rules come from reading it rather than from the
 * archetype. Its removal does not remove:
 *
 *  - **EB04-028 Ice Time** and **OP12-043 Kuzan** make Characters *unable to
 *    attack* until the end of the opponent's next End Phase. The body stays on
 *    the field; what is taken away is its contribution to the opponent's clock.
 *    That is worth a great deal against a field that already out-paces this
 *    Leader and nothing at all against a field of blockers, which no rule in the
 *    layer above could know.
 *  - **ST33-003 Smoker** and **EB04-026 Bluegrass** place bodies at the bottom of
 *    the owner's deck -- real removal, but only up to cost 2 and cost 1.
 *
 * The rule below is therefore about *timing* an answer rather than about
 * preferring one, which is why an archetype-level "answer the board" cannot
 * express it: that ranks every removal play alike, while the value of these is
 * a fact about the opponent's clock.
 */
function controlKuzanSt33Rules(): readonly Heuristic[] {
  return [
    prefer(
      "Stop the attacker rather than trade with it: this deck's answers take a body off the clock without taking it off the field.",
    )
      .by(WEIGHT.deck)
      .as("stop-the-attacker")
      .when(
        (t) => t.observation.phase === "main" && t.race.opponentHitsPerTurn > 1,
      )
      .play((card) => card.facts.rules.mentionsCannotAttack),
  ];
}

const controlKuzanSt33: StrategyProfile = {
  id: "control-kuzan-st33",
  extends: "control",
  summary:
    "ST33 blue Navy control: answers that deny attacks rather than K.O., and a Leader that turns its own discards into draws.",
  pattern: "control",
  leaders: ["OP12-040"],
  rules: controlKuzanSt33Rules,
};

// --- control-katakuri-st34 --------------------------------------------------

/**
 * ST34 Katakuri: a Leader that spends DON!! to defend, and a deck built to
 * refund it.
 *
 * The printed text is the whole argument. The Leader reads "[printed text omitted -- pnpm card:text OP12-040]" -- so this is the one Leader in the format that pays a *resource* for
 * defence, every turn, and the guides are explicit about what that costs:
 * "you have multiple ways to ramp to recover the DON!! spent on activating Leader
 * Katakuri's effect, allowing you to trigger it early in the game without falling
 * behind on DON!! and slowing down Character development."
 *
 * Five cards in the list add DON!! back from the DON!! deck, and ST34-001
 * Katakuri turns the Leader's own cost into a two-DON!! refund. The rule is
 * therefore about *when* to buy that engine rather than which body is bigger:
 * a refund bought on turn three pays for six defensive activations, and the same
 * card bought on turn eight pays for one.
 *
 * Expect it to be inert: it is kept on the same terms as `counter-budget`, as
 * a correct statement of this deck's economics that its ladder already
 * satisfies, and should be read as unstated rather than as a win.
 *
 * The guide's headline synergy is not here. Preferring bodies whose text reads
 * the opponent's top card (OP11-066 Oven, OP11-071 Perospero) changes a large
 * share of this deck's games and returns nothing.
 */
function controlKatakuriSt34Rules(
  params: StrategyParams,
): readonly Heuristic[] {
  return [
    prefer(
      "Buy the DON!! refund early: this Leader pays a DON!! to defend every turn, and a refund bought now pays for every turn after it.",
    )
      .by(WEIGHT.deck)
      .as("ramp-first")
      .when(
        (t) =>
          t.observation.phase === "main" &&
          t.turn <= params.targetCloseTurn - 2,
      )
      .play((card) => card.facts.rules.addsDonFromDonDeck),
  ];
}

const controlKatakuriSt34: StrategyProfile = {
  id: "control-katakuri-st34",
  extends: "control",
  summary:
    "ST34 purple Big Mom control: a Leader that spends DON!! to defend, and the ramp package that pays it back.",
  pattern: "control",
  leaders: ["OP11-062"],
  rules: controlKatakuriSt34Rules,
};

// --- midrange-sabo-st35 -----------------------------------------------------

/**
 * ST35 Sabo, whose whole deck is one printed condition.
 *
 * The Leader reads: "[printed text omitted -- pnpm card:text OP11-062]"
 *
 * Both halves are rules nobody else in the format has, and the guides describe
 * the deck the same way -- "Sabo's Leader effect strengthens all of your
 * Characters while helping you rapidly deploy members of the Revolutionary Army",
 * "an aggressive mid-range strategy" fusing red's buffs with black's removal.
 *
 * Reaching cost 8 is not a curve problem, because five of the deck's bodies get
 * there by their own static text at cost 4 to 7: ST35-005 Kuma is +3, OP12-093
 * Morley and P-105 Sabo are +4 under a {Revolutionary Army} Leader, OP13-081
 * Koala is +3, ST35-004 Koala is +1 at cost 7. Which of them is a cost-8
 * Character is therefore a fact about the printed text, not about the printed
 * cost -- and it is invisible in the observation, which reports a board card's
 * *printed* cost. {@link onFieldCost} is what closes that gap.
 *
 * The Life clause is the more interesting one, and it is the reason this deck gets
 * a Counter rule where the `midrange` root deliberately has none: at 4 or more
 * Life this Leader is a 4000-power Leader, and a hit taken is not merely a card
 * gained -- it removes the penalty. Spending a Counter card to prevent it pays
 * twice for the wrong thing.
 */
const AURA_COST = 8;
/** Life at which OP13-004's own -1000 penalty switches off. */
const SABO_LIFE_PENALTY = 4;

function midrangeSaboSt35Rules(): readonly Heuristic[] {
  return [
    prefer(
      "Land a cost-8 body first: the Leader's aura gives the whole team +1000, and nothing else in the deck switches it on.",
    )
      .by(WEIGHT.deck)
      .as("enable-the-aura")
      .when(
        (t) =>
          t.observation.phase === "main" &&
          !t.observation.self.board.some(
            (card) => onFieldCost(t.facts(card.cardNumber)) >= AURA_COST,
          ),
      )
      .play((card) => onFieldCost(card.facts) >= AURA_COST),

    // Half of this rule cannot work as written, and the half that can is the
    // less important one. `rank` narrows within an action type, and the order of
    // plays against attachments is fixed inside `chooseGenericRules`, so a
    // preference for an `attach-don` can only choose *which* unit the DON!! goes
    // to once the ladder has run out of plays -- it can never move the
    // attachment ahead of one. `aura-attachment` in `format-heuristics.ts` is
    // the sequencing half,
    // expressed as a veto on the plays, which is the tier that can say it; this
    // rule keeps the targeting half.
    prefer(
      "Then put one DON!! on the Leader: with the aura's condition met that DON!! is +1000 for the whole board, not for one body.",
    )
      .by(WEIGHT.deck)
      .as("switch-on-the-aura")
      .when(
        (t) =>
          t.observation.phase === "main" &&
          t.observation.self.board.some(
            (card) => onFieldCost(t.facts(card.cardNumber)) >= AURA_COST,
          ),
      )
      .attachDon(
        (action, t) =>
          action.targetInstanceId === selfLeaderId(t.observation) &&
          t.canCompleteDonAbility(action.targetInstanceId),
      ),

    // The sequencing half again, for the case `aura-attachment` deliberately
    // will not take. That format rule vetoes the turn's plays only while the
    // most expensive affordable play survives the attachment, which makes it a
    // dominance argument at format scope -- and it is what its own doc comment
    // names as the residual it cannot read: whether the `[DON!! x1]` clause's
    // *other* condition holds. Here it can be read, so this rule can go on
    // where dominance runs out -- but going on means it is making a trade, and a
    // trade has to name a price.
    //
    // With a cost-8 body on the board the DON!! is +1000 on the Leader and
    // +1000 on every Character, and it holds through the opponent's turn. So
    // what the attachment is worth is `board.length + 1` thousand power, where
    // an ordinary attachment is worth one -- and that ratio is the price, in
    // DON!!, of the play it is allowed to displace. A body the turn can buy for
    // no more DON!! than the aura buffs cards is the cheaper of the two and
    // waits a decision; a body that costs more than that is not something
    // +1000-a-card outbids, and it is gone for the turn rather than deferred,
    // because the DON!! that would have paid for it is now rested on the
    // Leader.
    //
    // This rule needs the `canCompleteDonAbility` exemption in `don-reservation`
    // to do anything at all, and the two have to be read together. The
    // exemption is the enabler, not a second effect: without this rule the
    // ladder still reaches the plays first, and with this rule but without the
    // exemption both candidates are vetoed and the turn falls through to
    // `attack`. It reaches only the two OP13-004 seats.
    never(
      "Switch the live aura on before the turn's last bodies: with a cost-8 Character out this DON!! is +1000 on everything you have, not 1000 on one attack.",
    )
      .as("aura-before-bodies")
      .when((t) => {
        const observation = t.observation;
        if (observation.phase !== "main") return false;
        if (observation.turnPlayer !== observation.viewer) return false;
        const leaderId = selfLeaderId(observation);
        if (!t.canCompleteDonAbility(leaderId)) return false;
        // `currentCost` is the cost the board actually shows, boosts included,
        // which is what the clause asks and what {@link onFieldCost} has to
        // reconstruct from printed text for a card still in hand.
        if (
          !observation.self.board.some((card) => card.currentCost >= AURA_COST)
        )
          return false;
        return observation.legalActions.some(
          (action) =>
            action.type === "attach-don" &&
            action.targetInstanceId === leaderId,
        );
      })
      // The price, per play rather than for the whole turn: the aura is +1000
      // on the Leader and on every Character, so it outbids a body the turn
      // could have bought for that many DON!! or fewer, and nothing dearer.
      .play((card, t) => card.cost <= t.observation.self.board.length + 1),

    never(
      "Above three Life this Leader is paying 1000 power for the buffer: take the hit rather than spend a card on it.",
    )
      .as("spend-life-to-four")
      .when((t) => {
        const required = counterDemandOfCurrentBattle(t);
        if (required === undefined) return false;
        if (t.selfLife < SABO_LIFE_PENALTY) return false;
        if (t.race.mustStabilise) return false;
        return t.counterCardsNeeded(required) > 0;
      })
      .counter(() => true),
  ];
}

const midrangeSaboSt35: StrategyProfile = {
  id: "midrange-sabo-st35",
  extends: "midrange",
  summary:
    "ST35 red/black Revolutionary Army: reach a cost-8 body, switch on the team-wide aura, and stop paying for Life above three.",
  pattern: "midrange",
  leaders: ["OP13-004"],
  rules: midrangeSaboSt35Rules,
};

// --- midrange-kid-st36 ------------------------------------------------------

/**
 * ST36 Kid, where Life is the deck's currency in both directions.
 *
 * Yellow's colour identity is Life manipulation -- "you start a game wanting to
 * be attacked ... every hit your opponent lands activates a free effect in your
 * favour" -- and this Leader spends Life rather than banking it: "[printed text omitted -- pnpm card:text OP13-004]"
 *
 * Two printed facts follow, and neither is visible one layer up:
 *
 *  - The Leader's restand has a **cost band**. A cost-1 Bartolomeo and a cost-10
 *    body are both outside it, so a board with no Character between 3 and 8 turns
 *    the Leader's ability off entirely -- the deck's only repeatable source of a
 *    Blocker, and therefore of a hit removed from the opponent's clock every turn.
 *  - The deck's two interaction pieces both read "[printed text omitted -- pnpm card:text OP13-004]": P-085
 *    Bonney and OP10-114 Drake. Being *ahead* on Life switches them off. A Leader
 *    hit taken while ahead is not a cost, it is what turns the deck on.
 */
function midrangeKidSt36Rules(params: StrategyParams): readonly Heuristic[] {
  return [
    prefer(
      "Keep a cost 3-8 {Supernovas} body on the field: it is the only thing the Leader's end-of-turn restand can make a Blocker out of.",
    )
      .by(WEIGHT.deck)
      .as("keep-a-restand-target")
      .when(
        (t) =>
          t.observation.phase === "main" &&
          !t.observation.self.board.some((card) =>
            withinRestandBand(t.facts(card.cardNumber)?.cost),
          ),
      )
      .play(
        (card) =>
          card.facts.types.includes("Supernovas") &&
          withinRestandBand(card.facts.cost),
      ),

    never(
      "This deck's interaction needs Life parity: a hit taken while ahead on Life switches it on, so absorb rather than pay for it.",
    )
      .as("life-parity")
      .when((t) => {
        const required = counterDemandOfCurrentBattle(t);
        if (required === undefined) return false;
        if (t.selfLife <= t.opponentLife) return false;
        if (t.selfLife <= params.lifeFloor) return false;
        if (t.race.mustStabilise) return false;
        return t.counterCardsNeeded(required) > 0;
      })
      .counter(() => true),
  ];
}

const midrangeKidSt36: StrategyProfile = {
  id: "midrange-kid-st36",
  extends: "midrange",
  summary:
    "ST36 yellow Supernovas: keep the Leader's restand a legal target, and let Life fall to parity because that is what the deck reads.",
  pattern: "midrange",
  leaders: ["OP10-099"],
  rules: midrangeKidSt36Rules,
};

// --- enrolled on measurement, no rules of their own -------------------------

/**
 * The decks outside the six-deck format, enrolled in their archetype roots.
 *
 * They carry no rules of their own. What enrolling buys them is the archetype
 * root's rules and parameters instead of the format fundamentals alone; a
 * deck-specific rule on top is the next step for whichever of them earns one,
 * not a prerequisite for being listed here.
 *
 * Each is measurable despite being outside the format: a mirror match needs a
 * deck list and a Leader, both of which `deckManifests` has for every selectable
 * deck, so `pnpm heuristic:ab --deck <id>` takes any of them and `--all` sweeps
 * them. Note that `preserve-life` never fires for OP14 Mihawk at all, because
 * that deck's own answers reach the attacker before its Life floor does.
 */
const midrangeLuffyOp17: StrategyProfile = {
  id: "midrange-luffy-op17",
  extends: "midrange",
  summary:
    "OP17 Black Elbaph Luffy: cheap Straw Hats switched on by a cost-12 giant, contesting the board rather than racing.",
  pattern: "midrange",
  leaders: ["OP17-079"],
};

const midrangeUnenrolled: StrategyProfile = {
  id: "midrange-unenrolled",
  summary:
    "Midrange decks with a hand-written deck policy of their own: pattern declared, archetype rules deliberately not inherited.",
  pattern: "midrange",
  leaders: [
    // Already has a bespoke policy (`op16-luffy-policy.ts`), written against
    // the deck rather than the archetype. Layering the root's rules under it
    // is a change to a *measured* policy, so it needs its own A/B rather than
    // riding along with the enrollment above; until someone runs it, the
    // pattern is declared and no rule is inherited. OP15-058 Enel is in
    // `aggroUnenrolled`, where its pattern belongs.
    "OP16-022", // OP16 Green/Blue Luffy
    // The synthetic sealed Leader. "midrange" is a neutral default rather than
    // a claim, and a sealed pool is a different 66 cards every seed, so there
    // is no archetype here to inherit rules from. Sealed is measured by
    // `pnpm sealed:heuristic:ab`, not by this instrument.
    "SEALED-LUFFY",
    // OP13-079 Imu pilots through its own `op13-imu-policy.ts`, whose rules
    // (the Stage first, the Leader's payment, OP13-082's gate) were written
    // against the deck. The root has not been measured under it, so the
    // pattern is declared and nothing is inherited.
    "OP13-079",
  ],
};

/**
 * EB04 Red/Yellow Jewelry Bonney.
 *
 * Enrolled under the `midrange` root rather than listed as unenrolled, because
 * there is no measured deck policy here to protect: this deck ships without one,
 * so the root's rules are its first piloting rather than a change to an existing
 * one. `pnpm heuristic:ab --deck "<id>"` is what would price them, and the deck
 * is the obvious next candidate for the `audit-deck-policy` playbook -- its whole
 * plan turns on a Life threshold no archetype rule knows about, and the root's
 * `preserve-life` reading is the first thing that has to be checked against a
 * Leader whose own activation spends Life on purpose.
 */
const midrangeBonneyEb04: StrategyProfile = {
  id: "midrange-bonney-eb04",
  extends: "midrange",
  summary:
    "EB04 Red/Yellow Jewelry Bonney: spends its own Life for cards, then curves into bodies that are paid for being behind on it.",
  pattern: "midrange",
  leaders: ["EB04-001"],
};

/**
 * OP15 Green/Black Brook.
 *
 * Enrolled under the `midrange` root for the same reason as EB04 Bonney: the
 * deck ships without a measured policy to protect, so the root's rules are its
 * first piloting. Its plan is a combo turn built out of its own trash, and
 * its deck budget -- how much of the deck the mill may spend -- is deck
 * knowledge in `op15-brook-policy.ts`, not an archetype rule.
 */
const midrangeBrookOp15: StrategyProfile = {
  id: "midrange-brook-op15",
  extends: "midrange",
  summary:
    "OP15 Green/Black Brook: mills its own deck into a trash that powers Straw Hat bodies, then empties it on the winning turn.",
  pattern: "midrange",
  leaders: ["OP15-022"],
};

/**
 * EB03 Red/Blue Nefeltari Vivi.
 *
 * Enrolled under the `midrange` root, with the deck's own rules registered in
 * `registry.ts` beside it: those rules answer the Leader's activation and the
 * [On Play] targets, which no root rule speaks to, so the two layers do not
 * contest the same decision. See `eb03-vivi-policy.ts`.
 */
const midrangeViviEb03: StrategyProfile = {
  id: "midrange-vivi-eb03",
  extends: "midrange",
  summary:
    "EB03 Red/Blue Nefeltari Vivi: removal bodies given [Rush] by the Leader the turn they land, and a Leader that trades a card from hand to keep them.",
  pattern: "midrange",
  leaders: ["EB03-001"],
};

/**
 * OP14 Red Trafalgar Law.
 *
 * Enrolled under the `midrange` root, with the deck's own rules registered in
 * `registry.ts` beside it: those rules answer the Leader's base-power swap,
 * which no root rule speaks to. See `op14-law-policy.ts`.
 */
const midrangeLawOp14: StrategyProfile = {
  id: "midrange-law-op14",
  extends: "midrange",
  summary:
    "OP14 Red Trafalgar Law: a board of small {Supernovas} bodies, each lent a heavy hitter's base power by the Leader for one more attack.",
  pattern: "midrange",
  leaders: ["OP14-001"],
};

/**
 * OP14 Blue/Yellow Boa Hancock.
 *
 * Enrolled under the `midrange` root with only its mulligan registered beside
 * it. The deck's plan runs through [Trigger] windows on the opponent's turn,
 * which the engine offers and the ladder takes; see `op14-hancock-policy.ts`.
 */
const midrangeHancockOp14: StrategyProfile = {
  id: "midrange-hancock-op14",
  extends: "midrange",
  summary:
    "OP14 Blue/Yellow Boa Hancock: Characters that play themselves off Life cards, and a Leader that draws for each one played on the opponent's turn.",
  pattern: "midrange",
  leaders: ["OP14-041"],
};

/**
 * OP13 Red/Purple Gol.D.Roger.
 *
 * Enrolled under the `midrange` root, and the reason is the one ST-26 is: the
 * deck's only knowledge of its own is an opening-hand rule
 * (`op13-roger-policy.ts`), so the root's rules are a first layer of deck
 * knowledge rather than a change to a measured ladder.
 */
const midrangeRogerOp13: StrategyProfile = {
  id: "midrange-roger-op13",
  extends: "midrange",
  summary:
    "OP13 Red/Purple Gol.D.Roger: ramp to ten DON!! off {Roger Pirates} bodies gated on a given DON!!, then land OP13-064 Roger to switch off the Leader's -2000 and shrink the opponent's board.",
  pattern: "midrange",
  leaders: ["OP13-003"],
};

/**
 * OP16 Black Yamato.
 *
 * Enrolled under the `midrange` root, with the deck's own rules registered in
 * `registry.ts` beside it: those rules answer when an 8-cost Yamato goes to
 * the trash and when OP16-098 swaps it back out, which no root rule speaks
 * to. See `op16-yamato-policy.ts`.
 */
const midrangeYamatoOp16: StrategyProfile = {
  id: "midrange-yamato-op16",
  extends: "midrange",
  summary:
    "OP16 Black Yamato: fill the trash with {Land of Wano} diggers, then play 8-cost Yamatos back out of it, each with [Rush] off the Leader.",
  pattern: "midrange",
  leaders: ["OP16-079"],
};

/**
 * OP14 Black Crocodile.
 *
 * Enrolled under the `midrange` root, with the deck's own rules registered in
 * `registry.ts` beside it: they answer whether the Leader's [Activate: Main]
 * is worth taking and which of your own bodies it K.O.s, which no root rule
 * speaks to. See `op14-crocodile-policy.ts`.
 */
const midrangeCrocodileOp14: StrategyProfile = {
  id: "midrange-crocodile-op14",
  extends: "midrange",
  summary:
    "OP14 Black Crocodile: K.O. your own {Baroque Works} bodies to drop an opposing Character to 0 cost, and cash both halves -- the [On K.O.]s and everything that reads a 0-cost Character.",
  pattern: "midrange",
  leaders: ["OP14-079"],
};

/**
 * OP14 Black/Yellow Gecko Moria.
 *
 * Enrolled under the `midrange` root, with the deck's own rules registered in
 * `registry.ts` beside it: they answer whether the Leader's [Activate: Main]
 * is worth taking and which of your own bodies it K.O.s, which no root rule
 * speaks to. See `op14-moria-policy.ts`.
 */
const midrangeMoriaOp14: StrategyProfile = {
  id: "midrange-moria-op14",
  extends: "midrange",
  summary:
    "OP14 Black/Yellow Gecko Moria: fill the trash with {Thriller Bark Pirates} bodies, then play them back through [Trigger]s, [On K.O.]s and the two Gecko Morias.",
  pattern: "midrange",
  leaders: ["OP14-080"],
};

/**
 * EB02 Green/Purple Monkey.D.Luffy.
 *
 * Enrolled under the `midrange` root, with the deck's own rules registered in
 * `registry.ts` beside it. See `eb02-luffy-policy.ts`.
 */
const midrangeLuffyEb02: StrategyProfile = {
  id: "midrange-luffy-eb02",
  extends: "midrange",
  summary:
    "EB02 Green/Purple Luffy: return DON!! through the Leader and Sanji & Pudding to keep DON!! active, build ST-18's eight-DON!! board, and close with EB02-061 Luffy attacking twice.",
  pattern: "midrange",
  leaders: ["EB02-010"],
};

/**
 * OP12 Black/Yellow Koala.
 *
 * Enrolled under the `midrange` root, with the deck's own rules registered in
 * `registry.ts` beside it. See `op12-koala-policy.ts`.
 */
const midrangeKoalaOp12: StrategyProfile = {
  id: "midrange-koala-op12",
  extends: "midrange",
  summary:
    "OP12 Black/Yellow Koala: land two {Revolutionary Army} bodies that count as cost 8, draw off every Leader attack, and tax the opponent's big plays a Life card.",
  pattern: "midrange",
  leaders: ["OP12-081"],
};

/**
 * OP06 Blue/Purple Vinsmoke Reiju, OP06-042.
 *
 * Enrolled under the `midrange` root with nothing but a mulligan of its own,
 * so the root's rules are part of its first baseline. See
 * `op06-reiju-policy.ts`.
 */
const midrangeReijuOp06: StrategyProfile = {
  id: "midrange-reiju-op06",
  extends: "midrange",
  summary:
    "OP06 Blue/Purple Vinsmoke Reiju: return DON!! to trade small {GERMA 66} bodies for bigger copies, draw off each return, and keep at or under the opponent's DON!! count so the [On Play]s fire.",
  pattern: "midrange",
  leaders: ["OP06-042"],
};

/**
 * EB05 Green/Yellow Nico Robin, EB05-010.
 *
 * Enrolled under the `midrange` root with nothing but a mulligan of its own,
 * for the reason `midrangeReijuOp06` gives. See `eb05-robin-policy.ts`.
 */
const midrangeRobinEb05: StrategyProfile = {
  id: "midrange-robin-eb05",
  extends: "midrange",
  summary:
    "EB05 Green/Yellow Nico Robin: a board of 6000-power <Wisdom> bodies the Leader stands back up for a second attack, refilling its Life when one is K.O.'d.",
  pattern: "midrange",
  leaders: ["EB05-010"],
};

/**
 * OP11 Red/Black Koby, OP11-001.
 *
 * Enrolled under the `midrange` root with nothing but a mulligan of its own,
 * for the reason `midrangeReijuOp06` gives. See `op11-koby-policy.ts`.
 */
const midrangeKobyOp11: StrategyProfile = {
  id: "midrange-koby-op11",
  extends: "midrange",
  summary:
    "OP11 Red/Black Koby: {SWORD} bodies that attack Characters the turn they land, debuffs to make those attacks win, and the trash as a shield against removal.",
  pattern: "midrange",
  leaders: ["OP11-001"],
};

/**
 * OP13 Red/Blue Portgas.D.Ace, OP13-002.
 *
 * Enrolled under the `midrange` root for the reason `midrangeLuffyOp13` is:
 * the deck arrived with nothing but a mulligan of its own, so the root's rules
 * are part of its first baseline rather than a change to one.
 */
const midrangeAceOp13: StrategyProfile = {
  id: "midrange-ace-op13",
  extends: "midrange",
  summary:
    "OP13 Red/Blue Portgas.D.Ace: a 3-Life Leader that draws off the damage it takes and the 6000s it loses, walls with Marco and a 12000 Newgate, and opens the last attack with OP13-057.",
  pattern: "midrange",
  leaders: ["OP13-002"],
};

/**
 * OP11 Green Jinbe.
 *
 * Enrolled under the `midrange` root, with the deck's own rules registered in
 * `registry.ts` beside it. See `op11-jinbe-policy.ts`.
 */
const midrangeJinbeOp11: StrategyProfile = {
  id: "midrange-jinbe-op11",
  extends: "midrange",
  summary:
    "OP11 Green Jinbe: stand a {Fish-Man} body and a DON!! up at the end of each turn, rest the opposing board, and attack rested Characters with 7000 and 8000 bodies.",
  pattern: "midrange",
  leaders: ["OP11-021"],
};

/**
 * OP12 Blue/Purple Sanji.
 *
 * Enrolled under the `midrange` root, with the deck's own rules registered in
 * `registry.ts` beside it: which Event the Leader's DON!! −1 activates, which
 * no root rule speaks to. See `op12-sanji-policy.ts`.
 */
const midrangeSanjiOp12: StrategyProfile = {
  id: "midrange-sanji-op12",
  extends: "midrange",
  summary:
    "OP12 Blue/Purple Sanji: activate a {Straw Hat Crew} Event a turn through the Leader's DON!! −1, and grow the Characters that read the Events in the trash.",
  pattern: "midrange",
  leaders: ["OP12-041"],
};

/**
 * OP09 Blue Buggy.
 *
 * Enrolled under the `midrange` root: the Leader's [Activate: Main] is a play
 * from hand like any other, and the root's development and removal rules
 * already speak to what the deck does with it. See `op09-buggy-policy.ts`.
 */
const midrangeBuggyOp09: StrategyProfile = {
  id: "midrange-buggy-op09",
  extends: "midrange",
  summary:
    "OP09 Blue Buggy: assemble {Cross Guild} Characters of cost 5 or more, then play the 10-cost OP09-051 Buggy through the Leader for five DON!! and keep it.",
  pattern: "midrange",
  leaders: ["OP09-042"],
};

/**
 * OP10 Blue/Black Usopp.
 *
 * Enrolled under the `control` root, with the deck's own rules registered in
 * `registry.ts` beside it. See `op10-usopp-policy.ts`.
 */
const controlUsoppOp10: StrategyProfile = {
  id: "control-usopp-op10",
  extends: "control",
  summary:
    "OP10 Blue/Black Usopp: protect a {Dressrosa} board the Leader makes costlier to remove, rest the Leader or Corrida Coliseum to dig and K.O., and close with Rebecca into Kyros.",
  pattern: "control",
  leaders: ["OP10-042"],
};

/**
 * OP11 Green/Yellow Shirahoshi.
 *
 * Enrolled under the `midrange` root, with the deck's own rules registered in
 * `registry.ts` beside it. See `op11-shirahoshi-policy.ts`.
 */
const midrangeShirahoshiOp11: StrategyProfile = {
  id: "midrange-shirahoshi-op11",
  extends: "midrange",
  summary:
    "OP11 Green/Yellow Shirahoshi: a Leader that cannot attack plays a {Neptunian} for one DON!! every turn, and the deck turns its Life card back face-down to pay for the next one.",
  pattern: "midrange",
  leaders: ["OP11-022"],
};

/**
 * OP08 (Purple/Yellow) Charlotte Pudding.
 *
 * Enrolled under the `control` root beside OP17 Linlin, whose OP-17 yellow
 * [Trigger] package it shares: it banks its own deck onto its Life and waits
 * for the 10-cost aura. See `op08-pudding-policy.ts`.
 */
const controlPuddingOp08: StrategyProfile = {
  id: "control-pudding-op08",
  extends: "control",
  summary:
    "OP08 (Purple/Yellow) Charlotte Pudding: ramps off the Leader's face-up Life, banks the deck's [Trigger] bodies back onto Life, and re-prices them at 8000 with OP17-112 Linlin.",
  pattern: "control",
  leaders: ["OP08-058"],
};

/**
 * OP07 Yellow Vegapunk, OP07-097.
 *
 * Enrolled under the `control` root with nothing but a mulligan of its own:
 * the Leader cannot attack, so the deck is piloted as one that survives. See
 * `op07-vegapunk-policy.ts`.
 */
const controlVegapunkOp07: StrategyProfile = {
  id: "control-vegapunk-op07",
  extends: "control",
  summary:
    "OP07 Yellow Vegapunk: a Leader that cannot attack, puts {Egghead} bodies onto the field or face-up into Life, and turns every Life card taken back into a body through [Trigger]s.",
  pattern: "control",
  leaders: ["OP07-097"],
};

const controlShanksOp17: StrategyProfile = {
  id: "control-shanks-op17",
  extends: "control",
  summary:
    "OP17 Green Shanks: rests a body on the way in and keeps it rested, winning by denying attackers rather than racing.",
  pattern: "control",
  leaders: ["OP17-020"],
};

const controlXebecOp17: StrategyProfile = {
  id: "control-xebec-op17",
  extends: "control",
  summary:
    "OP17 Blue Rocks D. Xebec: draws off every attack, freezes and stalls, and rebuilds a board late out of the hand it filled.",
  pattern: "control",
  leaders: ["OP17-039"],
};

const controlDoflamingoOp14: StrategyProfile = {
  id: "control-doflamingo-op14",
  extends: "control",
  summary:
    "OP14 Purple Donquixote Doflamingo: spends DON!! to redirect attacks onto {Donquixote Pirates} bodies whose [On K.O.] pays it back, and ramps the DON!! it spends.",
  pattern: "control",
  leaders: ["OP14-060"],
};

const controlMihawkOp14: StrategyProfile = {
  id: "control-mihawk-op14",
  extends: "control",
  summary:
    "OP14 Green Dracule Mihawk: a rest-lock deck that refunds its own DON!!, denying attackers rather than building a clock.",
  pattern: "control",
  leaders: ["OP14-020"],
};

/**
 * OP17 (Red) Edward.Newgate, OP17-001.
 *
 * Enrolled under the `control` root rather than listed in `controlUnenrolled`,
 * which holds the Leaders whose own policy stands on its own. Here the root and
 * `op17-newgate-policy.ts` ship as one baseline, so the root is not a change to
 * the policy.
 *
 * `pnpm census` reads `strategy:control#preserve-life` as registered for this
 * deck and never reached, which is the row to look at next: the rule refuses to
 * absorb below a Life floor of 3, and this deck's whole defence is a Leader
 * ability that makes absorbing unnecessary. Whether the floor is doing anything
 * here is an open question with an obvious arm --
 * `pnpm deck:ab --disable strategy:control-newgate-op17`.
 */
const controlNewgateOp17: StrategyProfile = {
  id: "control-newgate-op17",
  extends: "control",
  summary:
    "OP17 (Red) Edward.Newgate: every card in hand is 4000 Counter power once a turn, so the deck defends with cards nobody else can spend and converts with 8000-plus bodies late.",
  pattern: "control",
  leaders: ["OP17-001"],
};

/**
 * OP09 (Purple/Yellow) Nico Robin, OP09-062.
 *
 * Enrolled under the `midrange` root for the same reason `controlNewgateOp17`
 * is enrolled under `control`: the root and `op09-robin-policy.ts`'s mulligan
 * ship as one baseline, so neither is a change to the other.
 *
 * `pnpm census --deck "(Purple/Yellow) Nico Robin - 2nd Place EU Championship 26-27 S1"`
 * reads the row to look at next: `main:resolve-effect` is the largest unpiloted
 * surface the deck has. Much of it is one clause -- the
 * Leader's `[When Attacking]`, which the generic ladder takes on every attack,
 * trading a [Trigger] card out of hand for a *rested* DON!! that cannot be
 * spent until next turn. OP17-109 Charlotte Pudding buys three cards with the
 * same [Trigger] card, so the two costs compete, and whether the default
 * spends them too cheaply is the open question with the obvious arm.
 */
const midrangeRobinOp09: StrategyProfile = {
  id: "midrange-robin-op09",
  extends: "midrange",
  summary:
    "OP09 (Purple/Yellow) Nico Robin: banks the top of its deck onto its own Life, plays the bodies back out of it when it is damaged, and turns them into 8000s with OP17-112.",
  pattern: "midrange",
  leaders: ["OP09-062"],
};

/**
 * ST-18 (Purple) Monkey.D.Luffy, OP05-060.
 *
 * Enrolled under the `midrange` root on the same grounds as ST-26 below:
 * there is no measured piloting policy here for the root to disturb. What the
 * deck ships is an opening-hand rule and two vetoes on its Leader's activation
 * (`st18-luffy-policy.ts`) -- when to take it and when to stop -- rather than
 * a ladder the root could argue with, so the root's `rank` and `veto` are the
 * first archetype knowledge the seat gets about anything else.
 *
 * The one call worth stating is that this is not a `control` deck despite the
 * shape of its answer suite. Its Leader pays a Life card a turn for an active
 * DON!!, and `control`'s `preserve-life` is the exact rule that would argue
 * with the deck's own engine.
 */
const midrangeLuffySt18: StrategyProfile = {
  id: "midrange-luffy-st18",
  extends: "midrange",
  summary:
    "ST-18 (Purple) Monkey.D.Luffy: trades a Life card a turn for an active DON!! so the field reaches the eight DON!! nine of its fifteen identities are gated on.",
  pattern: "midrange",
  leaders: ["OP05-060"],
};

/**
 * ST-26 (Purple/Black) Monkey.D.Luffy, OP09-061.
 *
 * Enrolled under the `midrange` root rather than listed in
 * `midrangeUnenrolled`, and the reason is the reverse of the entries there:
 * those decks each have a hand-written policy the root would be a change to,
 * and this one has no piloting policy at all. Its only deck knowledge is an
 * opening-hand rule (`st26-luffy-policy.ts`); every in-game decision falls to
 * the generic ladder, so the root's `rank` and `veto` rules are the first deck
 * knowledge the seat gets rather than a layer under something measured.
 *
 * Midrange for the reason the pattern table gives: ten of the fifty slots pay
 * a `DON!! -2` or a "return 1 or more DON!!" cost, and what those returns buy
 * is a body on the board this turn rather than a saved-up payoff. It neither
 * spends Life as a resource nor sits behind answers -- one 2-cost removal
 * Event and a -2000 debuff is the whole answer suite.
 *
 * The enrollment is a wash: the root's rules barely reach this deck.
 *
 * It stays enrolled anyway, which is the opposite call to a flat *mulligan*
 * predicate (see `DECKS_ON_THE_GENERIC_MULLIGAN`) and for a reason: that list
 * exists so a missing keep stays visible to `pnpm census`, whereas
 * `midrangeUnenrolled` means "this deck's own measured policy would be
 * disturbed by the root". Neither is true here -- one narrowing rule is not a
 * ladder the root can disturb, and no gap is being hidden -- so the deck
 * belongs under the root it matches, on the grounds that putting it there is
 * free rather than that it earned its place.
 */
const midrangeLuffySt26: StrategyProfile = {
  id: "midrange-luffy-st26",
  extends: "midrange",
  summary:
    "ST-26 (Purple/Black) Monkey.D.Luffy: returns its own DON!! to the DON!! deck to pay for its bodies, and the Leader refunds two of them once each turn.",
  pattern: "midrange",
  leaders: ["OP09-061"],
};

/**
 * ST-22 (Blue) Ace & Newgate, ST22-001.
 *
 * Enrolled under the `midrange` root for the same reason as ST-29 below: the
 * deck ships no piloting policy beyond its opening hand, so the root's `rank`
 * and `veto` rules are the first deck knowledge the seat gets rather than a
 * layer under something measured. `preserve-life` is the rule to check first
 * if it is audited: the deck's only Life clause is ST22-015 taking a Life card
 * for a Leader buff, which is a trade the root's rule does not see.
 */
const midrangeAceNewgateSt22: StrategyProfile = {
  id: "midrange-ace-newgate-st22",
  extends: "midrange",
  summary:
    "ST-22 Blue Whitebeard Pirates: reveals its own all-on-type deck for draws, DON!! and power, filters with the Leader, and closes with Oden and a Double Attack Newgate.",
  pattern: "midrange",
  leaders: ["ST22-001"],
};

/**
 * ST-23 (Red) Shanks, OP09-001.
 *
 * Enrolled under the `aggro` root for the reason ST-22 is under `midrange`:
 * the deck ships no piloting policy beyond its opening hand, so the root's
 * `rank` and `veto` rules are the first deck knowledge the seat gets. The
 * deck's own lever the root does not see is its power cuts -- Hongo, ST23-004
 * Luffy and Yasopp shrink a defender before the swing -- which is where an
 * audit would look first.
 */
const aggroShanksSt23: StrategyProfile = {
  id: "aggro-shanks-st23",
  extends: "aggro",
  summary:
    "ST-23 Red Red-Haired Pirates: a 3-to-5-cost curve that wins its battles with power cuts, topped by a 10000 Shanks that buffs the Leader.",
  pattern: "aggro",
  leaders: ["OP09-001"],
};

/**
 * ST-29 (Yellow) Monkey.D.Luffy, ST29-001.
 *
 * Enrolled under the `midrange` root for the same reason as ST-26 above: the
 * deck ships no piloting policy the root could disturb, so the root's `rank`
 * and `veto` rules are the first deck knowledge the seat gets rather than a
 * layer under something measured.
 *
 * The enrollment is safe in the one way that is not obvious from the label.
 * This is a Yellow deck built to be *behind* on Life -- nine of its seventeen
 * identities read the Life counter and every one of them wants the number low
 * -- so the rule to check before enrolling anywhere is whether the root has a
 * Life clause. `midrange` has none: its two rules are `play-on-curve` and
 * `develop-before-power`, both about the board. The clause that would argue
 * with this deck is `control`'s `preserve-life`, which blocks rather than
 * absorbs at 3 Life or less -- exactly the trade ST-29 is built to refuse, and
 * the reason the pattern call in `patterns.ts` matters here beyond labelling.
 *
 * What the deck still has no rule for is the decision that label does not
 * reach: whether to take a hit it could answer, given that four identities
 * play themselves off a [Trigger] and ST29-007's [On K.O.] puts a card back on
 * top of Life. That is a deck policy to measure, not an archetype rule.
 *
 * Its opening hand is not that gap, and that has been measured: three keep
 * predicates spanning the range from "a cheap body" to "any Character costing
 * 4 or less" all sit inside a point of the generic keep, and get better the
 * looser they are. See `ST29-001` in `mulligan.ts`.
 */
const midrangeLuffySt29: StrategyProfile = {
  id: "midrange-luffy-st29",
  extends: "midrange",
  summary:
    "ST-29 (Yellow) Monkey.D.Luffy: develops vanilla bodies while its Life falls, and cashes the low-Life half of nine identities once it is behind.",
  pattern: "midrange",
  leaders: ["ST29-001"],
};

/**
 * OP13 (Red/Green) Monkey.D.Luffy, OP13-001.
 *
 * Enrolled under the `midrange` root for the reason `midrangeBonneyEb04` is:
 * the deck arrived with no measured policy of its own, so the root's rules are
 * part of its first baseline rather than a change to one. The root's
 * `preserve-life` is the first rule to check if it is audited -- this Leader
 * defends with DON!! rather than with cards, so a hand that would block to
 * keep a Life card may be spending a body the Leader's clause had covered.
 */
const midrangeLuffyOp13: StrategyProfile = {
  id: "midrange-luffy-op13",
  extends: "midrange",
  summary:
    "OP13 Red/Green Luffy: refreshes spent DON!! with its Straw Hats so the Leader can rest them for +2000 apiece on the opponent's turn, and rests the attackers it cannot outsize.",
  pattern: "midrange",
  leaders: ["OP13-001"],
};

/**
 * OP15 (Yellow) Monkey.D.Luffy, OP15-098.
 *
 * Enrolled under the `midrange` root for the reason `midrangeLuffyOp13` is:
 * the deck arrived with nothing but a mulligan of its own, so the root's rules
 * are part of its first baseline rather than a change to one. `preserve-life`
 * is the rule to check first if it is audited: this Leader spends a Life card
 * to keep a {Sky Island} body in play, so Life here is a resource the deck
 * converts into board rather than a total to guard.
 */
const midrangeLuffyOp15: StrategyProfile = {
  id: "midrange-luffy-op15",
  extends: "midrange",
  summary:
    "OP15 Yellow Sky Island Luffy: spends the top Life card to keep its 6000-plus bodies in play, banks cards back onto Life, and closes with a Luffy that has [Rush] at six DON!!.",
  pattern: "midrange",
  leaders: ["OP15-098"],
};

/**
 * (Purple) Sengoku, OP16-060.
 *
 * Enrolled under the `control` root rather than listed in `controlUnenrolled`,
 * and unlike most enrollments the root's rules pay here rather than merely
 * being harmless. What this deck ships is not a piloting policy the root could
 * disturb: four rules that make two of its activations reachable at all, and a
 * place on `DECKS_ON_THE_GENERIC_MULLIGAN`.
 *
 * Control rather than midrange, which is the call worth writing down because
 * the deck's own dossier calls it a ramp deck and ramp usually reads as
 * midrange. Two facts decide it. Its Life total is never a resource -- nothing
 * in the fifty spends a Life card, and the whole plan needs the deck to still
 * be alive on the turn it reaches eight *active* DON!!, which is what
 * `preserve-life` is for. And what it does before that turn is answer the
 * board: Sakazuki's -6000 lasts through the opponent's next End Phase and
 * Kuzan switches off a [Blocker] for a turn, so the ramp turns are spent
 * denying attacks rather than building a clock. That is
 * `control-kuzan-st33`'s description of itself, one colour over.
 *
 * `preserve-life` is the rule doing the work, and it is worth knowing which
 * way round that is: this deck's binding constraint is surviving to turn 8
 * rather than having DON!! on turn 8 -- see the Borsalino boundary in
 * `op16-sengoku-policy.ts`. A Life floor is the archetype rule that agrees
 * with that, which is why this is one of the few decks the root pays on.
 */
const controlSengokuOp16: StrategyProfile = {
  id: "control-sengoku-op16",
  extends: "control",
  summary:
    "OP16 (Purple) Sengoku: ramps the DON!! deck onto the field with {Navy} bodies, answers the board while it does, and cashes eight active DON!! for three Admirals at once.",
  pattern: "control",
  leaders: ["OP16-060"],
};

/**
 * OP17 (Yellow) Charlotte Linlin, OP17-099.
 *
 * Enrolled under the `control` root rather than listed in
 * `controlUnenrolled`, for the reason `controlNewgateOp17` is: the root and
 * `op17-linlin-policy.ts` ship as one baseline, so neither is a change to the
 * other. The root's `preserve-life` is the rule to look at first if the deck
 * is re-measured -- it blocks rather than absorbs at 3 Life or less, and this
 * is the one deck in the field that is paid for absorbing, since a Life card
 * taken goes to hand and nine of its thirteen slots print
 * "[Trigger] Play this card".
 */
const controlLinlinOp17: StrategyProfile = {
  id: "control-linlin-op17",
  extends: "control",
  summary:
    "OP17 (Yellow) Charlotte Linlin: banks its own deck onto its Life, develops off the Triggers the opponent opens, and re-prices a board of 4000s at 8000 with one 10-cost.",
  pattern: "control",
  leaders: ["OP17-099"],
};

/**
 * OP05 (Yellow) Enel, OP05-098.
 *
 * Enrolled under the `control` root beside `controlLinlinOp17`, whose card
 * pool it shares: the deck's own module is only its mulligan, so the root is
 * what pilots it. See `op05-enel-policy.ts`.
 */
const controlEnelOp05: StrategyProfile = {
  id: "control-enel-op05",
  extends: "control",
  summary:
    "OP05 (Yellow) Enel: trades Life for cards and removal, banks the deck's [Trigger] bodies back onto it, and relies on the Leader to refill the last Life card once.",
  pattern: "control",
  leaders: ["OP05-098"],
};

const controlUnenrolled: StrategyProfile = {
  id: "control-unenrolled",
  summary:
    "Control decks with a hand-written deck policy of their own: pattern declared, archetype rules deliberately not inherited.",
  pattern: "control",
  // Same reasoning as `midrange-unenrolled`: `op16-nami-policy.ts` is a
  // measured `rank`-only policy, so adding the control root underneath it is a
  // change to a measured deck and needs its own A/B.
  leaders: [
    "OP11-041", // OP15 Blue/Yellow Nami
    // OP16 Black/Yellow Marshall.D.Teach, for the same reason: its seat is
    // piloted by `op16-teach-policy.ts`, whose redirect and Trigger-budget
    // rules are written against this Leader's own ability rather than against
    // the archetype. Layering the control root under it is a change to a
    // measured policy and needs its own `pnpm heuristic:ab` run first.
    "OP16-080",
    // OP17 Purple Kaido, for the third time the same reason:
    // `op17-kaido-policy.ts` is a measured `rank`/`veto` policy plus a Counter
    // `decide`, and the control root's own rules -- `preserve-life` above all
    // -- have never been run underneath it. Declared here so the pattern is
    // stated and no rule is inherited on the strength of the label alone.
    "OP17-058",
    // ST-27 (Black) Marshall.D.Teach, and this one is unenrolled on more than
    // caution: the control root's rules are actively wrong for it. The pattern
    // label is not in doubt -- see `patterns.ts` -- but a Black removal deck
    // whose whole plan is spending its own hand is not served by rules written
    // for decks that hold, and `preserve-life` argues with the deck's own
    // `st27-teach#leader-negation-price`.
    "OP09-081",
    // OP15 (Red/Green) Krieg, and this one is unenrolled on a reading of the
    // deck rather than on caution. `preserve-life` blocks a hit rather than
    // absorbing it at 3 Life or less, and in this fifty the bodies that can
    // block are the two that keep paying while they stand -- the [Blocker] whose
    // activation hands over a DON!! every turn, and the 7-cost [Blocker] in
    // front of the Leader. A Life card taken instead goes to hand, where this
    // deck's cheap half is all Counter; a blocker traded away is a gift a turn
    // and a body gone. `op15-krieg-counter` answers the same window by naming
    // those two bodies as worth a card, which is the narrower claim.
    "OP15-001",
    // OP15 (Red/Blue) Lucy, unenrolled while the deck's own decisions are
    // measured. `preserve-life` blocks rather than absorbs at 3 Life or less,
    // and this deck's defence is the opposite trade: the Leader buys +1000 a
    // card by trashing Events out of hand, and a Life card taken refills that
    // hand. Its only [Blocker]s are the 7-cost body whose [On Play] is the
    // deck's free high-cost Event and a 1-cost that needs a DON!! on it, so
    // blocking spends the cards the plan is made of.
    "OP15-002",
  ],
};

/** Every built-in profile, in tree order. */
export const BUILT_IN_STRATEGY_PROFILES: readonly StrategyProfile[] = [
  aggro,
  redAggro,
  redAggroLuffySt31,
  redAggroZoroSt32,
  aggroUnenrolled,
  aggroYamatoOp06,
  aggroJinbeOp14,
  aggroRayleighOp12,
  midrange,
  midrangeSaboSt35,
  midrangeKidSt36,
  midrangeLuffyOp17,
  midrangeBonneyEb04,
  midrangeBrookOp15,
  midrangeViviEb03,
  midrangeLawOp14,
  midrangeHancockOp14,
  midrangeYamatoOp16,
  midrangeCrocodileOp14,
  midrangeMoriaOp14,
  midrangeKoalaOp12,
  midrangeLuffyEb02,
  midrangeShirahoshiOp11,
  midrangeReijuOp06,
  midrangeRobinEb05,
  midrangeKobyOp11,
  midrangeAceOp13,
  midrangeSanjiOp12,
  midrangeJinbeOp11,
  midrangeBuggyOp09,
  midrangeRogerOp13,
  controlPuddingOp08,
  controlUsoppOp10,
  controlVegapunkOp07,
  midrangeUnenrolled,
  midrangeRobinOp09,
  midrangeLuffySt18,
  midrangeLuffySt26,
  midrangeAceNewgateSt22,
  aggroShanksSt23,
  midrangeLuffySt29,
  midrangeLuffyOp13,
  midrangeLuffyOp15,
  control,
  controlKuzanSt33,
  controlKatakuriSt34,
  controlShanksOp17,
  controlXebecOp17,
  controlMihawkOp14,
  controlDoflamingoOp14,
  controlNewgateOp17,
  controlSengokuOp16,
  controlLinlinOp17,
  controlEnelOp05,
  controlUnenrolled,
];

for (const profile of BUILT_IN_STRATEGY_PROFILES) {
  registerStrategyProfile(profile);
}

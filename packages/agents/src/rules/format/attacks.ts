/**
 * Format rules about attacking: whether to declare, what to declare at, and
 * in what order.
 *
 * One of the files `format-heuristics.ts` is the map of; see that file for what
 * lives where and why the split is by decision rather than by deck.
 */
import {
  heuristics,
  mustAct,
  never,
  prefer,
  preferAmong,
  WEIGHT,
  type Heuristic,
} from "../heuristics.js";
import {
  chooseGenericRules,
  decision,
  opponentLeaderId,
  type AttackAction,
} from "../generic-policy.js";
import { ownAttackerLeaderDamage } from "../combat.js";
import type { PolicyContext, PolicyModule } from "../policy-module.js";
import { selfLeaderId, type Tactics } from "../tactics.js";
import type { GameObservation } from "@one-piece-sim/protocol";
import {
  getOnKoMechanicProgram,
  mechanicProgramEffects,
  mechanicProgramsByClause,
} from "@one-piece-sim/engine-core";
import { clauseParts } from "@one-piece-sim/cards";
import { blockStillAvailable, isWorthRemoving } from "./shared.js";

/**
 * The cards whose `[When Attacking]` clause is worth declaring a lost battle
 * for: the engine runs it, and it charges nothing to run.
 *
 * The cost test is the whole of the second condition and it is not a detail.
 * This rule's entire argument is that the clause is *free* -- value the ladder
 * declined only because it judged the battle -- and a clause with a price is
 * not free, it is a trade. Asked at the end of a turn the trade is at its
 * worst: the cards it charges are the hand that answers the opponent's next
 * turn, and the DON!! it charges has nothing left to buy. OP17-068 Sasaki is
 * the case in the pool -- "Trash 2" for two rested DON!! -- and `op17-kaido`'s
 * dossier already says it is only the right trade while the ramp has somewhere
 * to go and the hand is deep enough to lose two. Neither holds here.
 *
 * `clauseParts` reads the committed `rules.clauseSummaries`, so this agrees
 * with a process that holds no printed text.
 */
const CLAUSE_SWING_CARDS: ReadonlySet<string> = new Set(
  [...(mechanicProgramsByClause().get("[When Attacking]") ?? [])].filter(
    (cardNumber) =>
      clauseParts(cardNumber, "[When Attacking]")?.cost === undefined,
  ),
);

/**
 * Never rest a Character on an attack it cannot win.
 *
 * An attack whose power is below the defender's resolves for nothing: no damage,
 * no K.O. either way. The attacker is rested and the turn is shorter by one
 * action.
 *
 * Three exemptions, all real:
 *
 *  - **Leaders may battle to lose.** ST32's own Leader reads "[printed text omitted -- pnpm card:text <card>]", and battling happens whether or not the battle is won. Restricting
 *    this rule to Characters keeps that line intact.
 *  - **[When Attacking] text.** Bluegrass draws on attack declaration, so the
 *    attack is paid for even when the battle is not.
 *  - **Anything left that could still raise the power.** Vetoing on power alone
 *    would break ST31, whose matchup policy plans "give Franky two rested DON!!
 *    so it reaches the threshold and *then* attack" and reads the attack it
 *    intends to enable off the offered actions -- hiding the not-yet-good attack
 *    hides the plan. Active DON!! alone is not the test either, because ST31's
 *    Leader pays with *rested* DON!!. So the rule waits until no attachment and
 *    no Main activation are on the table at all, which is the point where the
 *    attack genuinely cannot improve.
 */
export function createNoHopelessAttackModule(): PolicyModule {
  return heuristics("no-hopeless-attack", [
    never("This attack cannot win its battle, so it only rests the attacker.")
      .when(
        (t) =>
          t.observation.phase === "main" &&
          !t.actions.some(
            (action) =>
              action.type === "attach-don" || action.type === "activate-main",
          ),
      )
      .attack((attack, t) => {
        if (attack.attackerInstanceId === selfLeaderId(t.observation)) {
          return false;
        }
        const attacker = t.observation.self.board.find(
          (card) => card.instanceId === attack.attackerInstanceId,
        );
        if (
          attacker &&
          t
            .facts(attacker.cardNumber)
            ?.rules.clauses.includes("[When Attacking]")
        ) {
          return false;
        }
        return !t.viableAttacks.some(
          (viable) => viable.actionId === attack.actionId,
        );
      }),
  ]);
}

/**
 * Whether this attack is the removal the rule is about: a viable swing at a
 * target {@link isWorthRemoving} accepts.
 *
 * The attack-shaped wrapper exists because the rule has to ask the question
 * about a *second* attack -- "could another attacker take this target
 * instead" -- and asking it twice from one place is what keeps the two answers
 * the same.
 */
function isRemovalAttack(attack: AttackAction, t: Tactics): boolean {
  const target = t.observation.opponent.board.find(
    (card) => card.instanceId === attack.targetInstanceId,
  );
  if (!target || !isWorthRemoving(target, t)) return false;
  return t.viableAttacks.some((viable) => viable.actionId === attack.actionId);
}

/*
 * Which body a promoted removal takes, and which attacker pays for it, are
 * both still answered by `chooseGenericRules`' "use the remaining viable
 * Character attack" -- offer order, which is the order the opponent happened
 * to play its board in. Ranking those removals by the size of the body they
 * take is not the fix: a big attacker into a small body is a K.O. the defender
 * cannot buy back, and into a big body it is one a single Counter card saves,
 * so preferring the bigger name spends certainty for value at even money.
 *
 * The open question is the *assignment* of a whole turn's attacks, which needs
 * an objective that prices what the defender spends across the sequence --
 * `don-sequence-module.ts`'s shape -- rather than a per-attack rank.
 */
export function createThreatRemovalModule(): PolicyModule {
  return heuristics("threat-removal", [
    prefer(
      "Remove a rested opposing Blocker or engine before pressing the Leader.",
    )
      .when(
        (t) =>
          t.observation.phase === "main" &&
          // `lethalInRange` reads false at 0 Life (its guard demands > 0), but
          // a Leader at 0 Life dies to any hit this turn -- the press is the
          // game-winner, not a detour. Test the raw Life count for both.
          !t.lethalInRange &&
          t.opponentLife > 0 &&
          t.observation.opponent.board.some((card) => isWorthRemoving(card, t)),
      )
      .attack((attack, t) => {
        if (!isRemovalAttack(attack, t)) return false;
        if (
          ownAttackerLeaderDamage(t.observation, attack.attackerInstanceId) < 2
        )
          return true;
        // A [Double Attack] attacker pays two Life for this removal where every
        // other body pays one, so it is the wrong body to spend on it -- but
        // only when the swap is free. Both conditions below are what make it
        // free rather than a trade: the attacker must have a Leader hit to
        // forgo, and some attacker without the keyword must be able to take the
        // same removal. Where either fails the choice is a genuine trade of one
        // body for one Life, which this rule already prefers; leave it alone.
        const pressesLeaderInstead = t.leaderAttacks.some(
          (other) => other.attackerInstanceId === attack.attackerInstanceId,
        );
        if (!pressesLeaderInstead) return true;
        const substitute = t.viableAttacks.some(
          (other) =>
            other.attackerInstanceId !== attack.attackerInstanceId &&
            ownAttackerLeaderDamage(t.observation, other.attackerInstanceId) <
              2 &&
            isRemovalAttack(other, t),
        );
        return !substitute;
      }),
  ]);
}

/**
 * The opposing bodies whose `[On K.O.]` puts another *active* body on the board
 * when they lose a battle.
 *
 * Three filters, and each one is a card the rule must not veto an attack into.
 *
 *  - **Fires from a battle.** `cause: "battle"` drops an `[On K.O.]` that names
 *    "K.O.'d by your opponent's effect" -- OP09-052 Marco, OP12-113 Roronoa
 *    Zoro. An attack never triggers those, so declining a Life hit to avoid one
 *    pays for a clause that was never going to resolve.
 *  - **Reaches a `play`.** Of the 131 cards whose `[On K.O.]` fires from a lost
 *    battle, 35 do. The rest draw, move or rest something: those charge the
 *    attacker a card or a tempo point, but the Character is gone and the
 *    removal did what it was for. Only a replacement means the attack removed
 *    nothing.
 *  - **The replacement arrives active.** 29 of the 35. A body played rested --
 *    OP07-105, OP09-028, OP10-090, OP13-023, ST27-003, ST30-008 -- blocks
 *    nothing on the turn it arrives and swings on none of it, and it was bought
 *    with a card out of hand or the trash. That is a refund, not a replacement:
 *    the attack still took the board position it was aimed at, which is what
 *    this rule exists to notice it failing to do.
 *
 * Built from the registered programs rather than a card list, so the pool
 * gaining such a card gains the rule with it, and from programs rather than
 * text because nothing above the engine holds the words. Same construction as
 * {@link CLAUSE_SWING_CARDS}.
 */
const SELF_REPLACING_KO_CARDS: ReadonlySet<string> = new Set(
  [...(mechanicProgramsByClause().get("[On K.O.]") ?? [])].filter(
    (cardNumber) => {
      const program = getOnKoMechanicProgram(cardNumber, "battle");
      return (
        program !== undefined &&
        mechanicProgramEffects(program, "play").some(
          (play) =>
            play.rested !== true &&
            (play.player === undefined || play.player === "self"),
        )
      );
    },
  ),
);

/**
 * Whether K.O.ing this opposing Character puts another body in its place.
 *
 * A negated Character is excluded because its text does not run, which is the
 * same reason {@link Tactics.koRefundsDefender} excludes it.
 */
function koReplacesItself(
  card: GameObservation["opponent"]["board"][number],
): boolean {
  if (card.negated === true) return false;
  return SELF_REPLACING_KO_CARDS.has(card.cardNumber);
}

/**
 * Do not spend an attack K.O.ing a body that replaces itself with an active
 * one, while that same attacker has the opposing Leader to hit instead.
 *
 * ## The position
 *
 * A Leader declares its only attack of the turn at a rested ST21-015 Zoro and
 * K.O.s it. Zoro's `[On K.O.]` puts ST31-001 Sanji on the board it has just
 * been cleared from, and Sanji's own `[On Play]` draws. The attack removed
 * nothing, gave up a Life hit, and paid for the replacement.
 *
 * `threat-removal` is what aims it there: Zoro is rested, costs 4, and is not
 * held down, so `isWorthRemoving` promoted it over the Leader. That rule's one
 * `[On K.O.]` gate is `koRefundsDefender`, which reads `koClauseMentionsLife`
 * and so sees only the clause shape that hands back Life -- its own doc says
 * "a body-replacing `[On K.O.]` does not qualify". Zoro is the other shape.
 *
 * ## Why a veto rather than a gate inside `isWorthRemoving`
 *
 * Because the promotion is not the only way the attack gets made. Narrowing
 * `isWorthRemoving` would stop `threat-removal` preferring the target and leave
 * `chooseGenericRules`' "use the remaining viable Character attack" free to
 * pick it anyway, off offer order. The veto answers both, and it composes the
 * right way round with the rank: with the self-replacing bodies gone from the candidate
 * set, `threat-removal` still promotes any *other* rested body worth removing,
 * and only falls through to the Leader when there is none.
 *
 * ## What makes it a sequencing claim rather than a trade
 *
 * The gate is "this attacker has a viable Leader attack of its own", which is
 * `threat-removal`'s own substitution test. So the veto never costs an attack:
 * it moves one from a body that replaces itself to the opponent's Life. Where
 * the attacker has no Leader hit to fall back on -- it cannot reach, or the
 * Leader is out of range -- the choice is a genuine trade of a body for
 * nothing, and this abstains and leaves it to the rank.
 *
 * Two further guards, both shared with `threat-removal` so the two rules cannot
 * disagree about the same board:
 *
 *  - **Only a viable attack.** An attack that loses its battle K.O.s nothing,
 *    so there is no replacement to decline and nothing to say.
 *  - **Not while the Leader is in lethal range.** When the game ends this turn
 *    what the opponent gets back never resolves into a turn they take.
 *
 * ## Scope
 *
 * `EVERY_DECK`: the claim names a printed clause and the engine resolves
 * printed text globally, exactly as `no-hopeless-attack` does. The card set is
 * derived from the registered programs rather than written out, so a pool that
 * gains a self-replacing `[On K.O.]` gains the rule with it.
 *
 * Measure it with `pnpm heuristic:probe --deck <ID> --module ko-payoff-target`,
 * which forks at the decision itself. The mirror-match instrument is the wrong
 * shape here: a deck that runs no self-replacing body never presents the target
 * to its own mirror, so `pnpm heuristic:ab` has nothing to fork on for most of
 * the field. It is still worth running as the check that no deck regresses.
 */
export function createKoPayoffTargetModule(): PolicyModule {
  return heuristics("ko-payoff-target", [
    never(
      "K.O.ing this body only replaces it, and this attacker can hit the Leader instead.",
    )
      .when(
        (t) =>
          t.observation.phase === "main" &&
          !t.lethalInRange &&
          t.opponentLife > 0,
      )
      .attack((attack, t) => {
        const target = t.observation.opponent.board.find(
          (card) => card.instanceId === attack.targetInstanceId,
        );
        if (!target || !koReplacesItself(target)) return false;
        if (
          !t.viableAttacks.some((viable) => viable.actionId === attack.actionId)
        ) {
          return false;
        }
        return t.leaderAttacks.some(
          (other) => other.attackerInstanceId === attack.attackerInstanceId,
        );
      }),
  ]);
}

/**
 * Life the opposing Leader would still lose if every remaining viable swing
 * went at it, once the Blockers that can still block have each absorbed one.
 *
 * The defender chooses which attack to block, so the largest hits are the ones
 * assumed absorbed: a [Double Attack] swing is the one a Blocker is kept for,
 * and pricing the block against the smallest hit would read a kill on a board
 * that has none. Counter cards are hidden, so this stays an upper bound -- the
 * same standing {@link Tactics.lethalInRange} carries, and for the same reason.
 *
 * `blockStillAvailable` is asked about the turn *after* the one named, because
 * its other two callers price a body against the opponent's next turn. Asked
 * here about a block that would happen now, it therefore counts a Blocker
 * rest-locked through this turn alone as an absorber when it cannot actually
 * pay to block. That error has one direction -- a hit assumed answered that
 * would have landed -- so it can only keep this rule quiet, never fire it on a
 * press that does not exist.
 */
function lifeTheRemainingSwingsTake(t: Tactics): number {
  const damages = t.leaderAttacks
    .map((attack) =>
      ownAttackerLeaderDamage(t.observation, attack.attackerInstanceId),
    )
    .sort((left, right) => right - left);
  const absorbed = t.observation.opponent.board.filter((card) =>
    blockStillAvailable(card, t.observation.turn),
  ).length;
  return damages.slice(absorbed).reduce((total, damage) => total + damage, 0);
}

/**
 * While the Life stack runs out this turn, do not spend a swing on a Character.
 *
 * {@link createThreatRemovalModule} prefers K.O.ing a rested Blocker or engine
 * over "a marginal Leader hit", and it is right to, up to the point where the
 * hit stops being marginal. Its gate for that point is `lethalInRange`, which
 * reads false as soon as the defender holds **any** Blocker -- and a board with
 * a Blocker on it is the normal late-game board, so the exception it is meant
 * to carve out almost never opens. A Blocker absorbs one attack; it does not
 * turn four swings into none.
 *
 * The board this is about: more attackers that out-power the Leader than the
 * defence has answers for. A Blocker takes one of them and is rested by the
 * block, at which point `threat-removal` promotes K.O.ing it -- spending a
 * second swing on a body that is already spent, while the Life stack the other
 * swings would have emptied survives.
 *
 * So this is the same claim `threat-removal` makes in its second gate, counted
 * properly: a removal is a detour when the press finishes the Life stack. The
 * count is of Blockers that can still block -- `blockStillAvailable`, not the
 * printed keyword -- because a rested Blocker is exactly the board this rule is
 * about.
 *
 * `never`, not a rank: `threat-removal` is a `prefer`, which hides every
 * candidate it does not score, so a competing preference on the Leader attacks
 * would tie rather than win. Removing the detour leaves the Leader attacks for
 * `attack-order` to lead with the smallest, which is the sequencing the press
 * wants anyway.
 *
 * Two things it deliberately leaves alone:
 *
 *  - **An attacker with no Leader hit of its own.** A `[Rush: Character]` body
 *    (OP17-003 Izo) and one too small to out-power the Leader can only spend
 *    their swing on a Character, so vetoing it leaves them idle and takes a
 *    K.O. off the board for nothing. The veto asks for the swap to be free, the
 *    way `threat-removal`'s own [Double Attack] branch does.
 *  - **A defender already on 0 Life.** `lethal-close` owns that board, and the
 *    arithmetic here answers "does the stack empty", which is trivially true at
 *    zero and says nothing about whether a hit lands.
 *
 * Registered for OP17-001 alone while it is measured, per
 * `.claude/skills/audit-deck-policy` section 6b. It is a trade -- Life pressure
 * now against a body that would have attacked or blocked later -- and a deck
 * that wins by holding the board prices it the other way round.
 */

/**
 * Life the press must take beyond the stack before the detour is refused.
 *
 * `lifeTheRemainingSwingsTake` prices the Blockers and stops there, and the
 * hidden half of `maxLeaderHits`' own warning is the one left: every hit that
 * lands hands the defender the Life card it took, and that card comes back as
 * the Counter answering a later swing. A press counted dead level against the
 * stack is therefore not a press at all against a deck that defends with what
 * it loses -- one card turns the last swing away and the removal declined to
 * buy it was free.
 *
 * One spare hit, because one Counter card is what the defence buys per Life
 * taken.
 */
const PRESS_MARGIN = 1;

export function createPressThroughBlockersModule(): PolicyModule {
  return heuristics("press-through-blockers", [
    never(
      "Every remaining swing at the Leader empties their Life this turn, so a K.O. on a Character gives up the press.",
    )
      .when(
        (t) =>
          t.observation.phase === "main" &&
          t.opponentLife > 0 &&
          lifeTheRemainingSwingsTake(t) >= t.opponentLife + PRESS_MARGIN,
      )
      .attack((attack, t) => {
        if (attack.targetInstanceId === opponentLeaderId(t.observation)) {
          return false;
        }
        return t.leaderAttacks.some(
          (other) => other.attackerInstanceId === attack.attackerInstanceId,
        );
      }),
  ]);
}

/**
 * Leaders whose own policy decides attack selection and does it better. See
 * the ST32 paragraph in {@link createAttackOrderModule}.
 */
const ATTACK_ORDER_EXCLUDED_LEADERS: ReadonlySet<string> = new Set([
  "OP12-020",
]);

export function createAttackOrderModule(): PolicyModule {
  const module = heuristics("attack-order", [
    preferAmong(
      "Lead with the smallest attack that still connects, so the defender's Counter cards are spent before the large one arrives.",
    )
      .by(WEIGHT.format)
      .when((t) => t.observation.phase === "main")
      .attack((action, t) => {
        if (action.targetInstanceId !== opponentLeaderId(t.observation)) {
          return false;
        }
        if (
          !t.viableAttacks.some((viable) => viable.actionId === action.actionId)
        ) {
          return false;
        }
        // `attackPower` is optional on the action, and a rule that read a
        // missing one as 0 would score it as the smallest attack there is and
        // hide every real candidate behind it. Abstain instead.
        if (action.attackPower === undefined) return false;
        // Negated so the smallest attack scores highest. Divided by 1000
        // because power is printed in thousands and the scores are only ever
        // compared with each other.
        return -action.attackPower / 1_000;
      }),
  ]);
  return {
    ...module,
    applies: (context) =>
      !ATTACK_ORDER_EXCLUDED_LEADERS.has(context.selfLeader) &&
      (module.applies?.(context) ?? true),
  };
}

/**
 * Swing a Character whose `[When Attacking]` clause pays, rather than end the
 * turn because the battle cannot be won.
 *
 * `viableAttacks` -- the filter the generic ladder puts every attack through --
 * asks only whether the attacker outpowers its target. That is the right
 * question about a *battle* and the wrong one about a clause: a `[When
 * Attacking]` ability resolves when the attack is **declared**, so it is
 * collected in full whether the battle is won, lost, blocked or countered. A
 * 2000-power body swinging into a 5000 Leader wins nothing and still fires its
 * clause, and the ladder declines it every time because the battle is hopeless.
 *
 * This is the Character half of the claim `op17-xebec`'s `leaderEngineAttack`
 * already makes about a Leader, and it is registered format-wide because
 * nothing in it is about a deck: it names a printed clause's timing, and the
 * engine resolves printed text globally.
 *
 * Where the two differ is the price, and it is the whole of the gating here. A
 * Leader that attacks rests and costs nothing -- it refreshes, it was never
 * going to block, and it cannot be attacked. A Character that attacks rests
 * too, and a rested Character is both unable to block and a legal attack
 * target. So:
 *
 *  - **Only a clause that charges nothing.** See {@link CLAUSE_SWING_CARDS}: a
 *    clause with a price is a trade rather than free value, and the end of a
 *    turn is the worst moment to make it.
 *  - **Never a body that can still block.** `board.blocker` is `canBlock`, so
 *    resting one trades a block the defence has already paid for against a
 *    clause -- and the block is worth more than any clause in the pool.
 *  - **Only when the ladder was going to pass anyway.** Asked of
 *    `chooseGenericRules` rather than inferred, so this can never displace a
 *    play, an activation, an attachment or a winnable attack. It answers one
 *    question: given that the turn was over, is a free clause better than
 *    nothing?
 *
 * `decide` rather than a rank contribution, and for the reason
 * `insteadOfPass` exists: the choice being overridden is "attack at all versus
 * end the turn", `pass` can never be vetoed by a rank, and removing `pass`
 * outright would leave the ladder free to pick some other action instead of the
 * swing this rule is arguing for.
 *
 * The target is the opponent's Leader. The ladder only passes once no attack
 * wins its battle, so every swing this rule reaches is unwinnable and the
 * battle adds nothing wherever it points; the Leader is the one target that can
 * still cost the opponent a Counter card if they misjudge it.
 */
function clauseSwings(context: PolicyContext): AttackAction[] {
  const observation = context.observation;
  const opponentLeader = opponentLeaderId(observation);
  return context.actions.filter((action): action is AttackAction => {
    if (action.type !== "attack") return false;
    if (action.targetInstanceId !== opponentLeader) return false;
    const body = observation.self.board.find(
      (card) => card.instanceId === action.attackerInstanceId,
    );
    return (
      body !== undefined &&
      !body.blocker &&
      CLAUSE_SWING_CARDS.has(body.cardNumber)
    );
  });
}

export function createClauseSwingModule(): PolicyModule {
  return {
    id: "clause-swing",
    decide(context) {
      if (context.observation.phase !== "main") return undefined;
      const swings = clauseSwings(context);
      if (swings.length === 0) return undefined;
      if (chooseGenericRules(context.observation).action.type !== "pass") {
        return undefined;
      }
      // Ties go to the smallest body. Every one of these battles is lost, so
      // what separates them is what resting costs: the larger body is the one
      // still worth something as a defender, and the one the opponent has to
      // spend more to remove once it is rested.
      const smallest = [...swings].sort(
        (left, right) => (left.attackPower ?? 0) - (right.attackPower ?? 0),
      )[0]!;
      return decision(
        smallest,
        "Declare the attack for its [When Attacking] clause rather than end the turn: the clause resolves on declaration, so it is collected whether or not the battle can be won.",
      );
    },
  };
}

/**
 * At 0 Life, do not end the turn with the winning attack still unbought.
 *
 * An opponent holding no Life cards loses the moment any attack connects with
 * their Leader. Every deck policy in this repository filters its attacks to the
 * ones that win their battle *right now*, so an attacker sitting 1000 short of
 * the Leader is invisible to the ladder: nothing is viable, nothing is chosen,
 * and the turn ends with the DON!! that would have bought the swing still
 * active. This removes `pass` on exactly that board, and the deck policy then
 * finds the attachment itself.
 *
 * ## Why it removes `pass` and nothing more
 *
 * Deciding *which* attack the DON!! should buy, or *how much* the swing should
 * demand, is a whole-sequence question -- what the defender must pay across
 * every swing of the turn, not what one attachment buys -- and a gate here can
 * only see one attachment at a time. A "kill" is also an upper bound against a
 * hidden hand: a rule that spends the turn's development on it has skipped a
 * turn whenever the defender's hand survives the swing. `don-sequence-module.ts`
 * prices the sequence and is unshipped; that is where this board's next rule
 * belongs rather than in another gate here.
 *
 * `donToWinBattle` rather than `donToReach`: the number is "does this battle
 * close as the board stands", not "does it beat everything the defender might
 * still pay for" -- a defender's unpaid ability is not a cost the attacker can
 * price.
 */
export const LETHAL_CLOSE_RULES: readonly Heuristic[] = [
  mustAct(
    "The opponent holds no Life and an attack on their Leader is still reachable this turn.",
  )
    .as("do-not-pass")
    .when(closingKillIsReachable)
    .insteadOfPass(closingKillIsReachable),
];

export function createLethalCloseModule(): PolicyModule {
  return heuristics("lethal-close", LETHAL_CLOSE_RULES);
}

/** Attacks on a Leader whose player holds no Life: each one wins the game. */

function closingAttacks(t: Tactics): AttackAction[] {
  if (t.observation.phase !== "main" || t.opponentLife !== 0) return [];
  const leaderId = opponentLeaderId(t.observation);
  return t.actions.filter(
    (action): action is AttackAction =>
      action.type === "attack" && action.targetInstanceId === leaderId,
  );
}

/**
 * DON!! this attack still needs to win its battle. Absent means it already
 * does, which the engine reports by omitting the field rather than by zero.
 */
function closingDon(attack: AttackAction): number {
  return attack.donToWinBattle ?? 0;
}

/**
 * Whether a hit can actually be put on the Leader this turn.
 *
 * Not "some attack could connect": a [Blocker] that can still block absorbs one
 * attack apiece, so a board with one Blocker and one connecting swing has no
 * kill on it at all, and the turn is an ordinary turn that should develop. The
 * count is greedy over a shared DON!! budget -- cheapest battle closed first --
 * because the DON!! that closes one attacker's battle is not available to the
 * next, and a rule that priced each attack against the whole pool would read a
 * kill on a board holding one DON!! and four swings that each need it.
 *
 * Counters are hidden, so this is still an upper bound; what it removes is the
 * case where the line does not exist even against an empty hand, which is the
 * one that turns "spend the turn killing" into "spend the turn doing nothing".
 */
function closingKillIsReachable(t: Tactics): boolean {
  const needs = closingAttacks(t)
    .map((attack) => closingDon(attack))
    .sort((left, right) => left - right);
  let budget = t.don;
  let hits = 0;
  for (const need of needs) {
    if (need > budget) break;
    budget -= need;
    hits += 1;
  }
  return hits > t.opponentBlockers;
}

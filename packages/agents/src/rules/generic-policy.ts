import type {
  GameObservation,
  KnownCardRef,
  LegalAction,
} from "@one-piece-sim/protocol";
import { incomingLeaderDamage, nextTurnLeaderDamage } from "./combat.js";

export interface PolicyDecision {
  action: LegalAction;
  reasons: string[];
  /**
   * Which policy module produced this decision. Set by the module resolver for
   * traces and debugging; never part of the reason text, which stays stable.
   */
  moduleId?: string;
  /**
   * Modules that narrowed the candidates without choosing among them -- `veto`
   * and `rank` contributors. Set by the module resolver alongside `moduleId`.
   *
   * A module can shape a decision it does not own, and `moduleId` cannot say so:
   * a `rank`-only deck policy hides every candidate but the best and then leaves
   * the choice to `chooseGenericRules`, which reports no module at all. Traces
   * and the attribution census both need to tell that apart from a decision no
   * rule touched.
   */
  narrowedBy?: readonly string[];
}

export interface CounterPolicyOptions {
  protectedCards?: ReadonlySet<string>;
  economicalCharacterDefense?: boolean;
  /**
   * What a protected Character is worth defending, in power, by card number.
   *
   * Defaults to 1000 everywhere -- one ordinary Counter card -- which is the
   * field's price for a body that can simply be played again. A deck raises it
   * for a card whose removal takes power off *other* cards, because there the
   * trade is not one card for one body: it is one card against everything the
   * removed card was holding up.
   *
   * Read only where {@link economicalCharacterDefense} is on; a deck that turns
   * the cap off entirely is already saying every protected card is worth the
   * whole hand. The Life guard beside it is unaffected either way, so no
   * Character is ever worth the Counter cards that stop a lethal Leader hit.
   */
  characterDefensePower?: (cardNumber: string) => number;
  efficientCombination?: boolean;
  /**
   * Spend a [Counter] Event rather than an ordinary Counter line this many
   * cards long or longer. Omitted, the Event stays a last resort.
   *
   * ST33 sets it to 2 because its Event is genuinely cheaper than its cards:
   * OP12-057 trashes a card after resolving and OP12-040 draws that card back,
   * so the Event costs one card where a two-card Counter line costs two.
   */
  counterEventBeatsCards?: number;
  /**
   * The Life total at or below which a Leader hit is judged against the
   * *refreshed* board rather than only this turn's remaining attacks.
   *
   * Defaults to 2, which is the number the whole field is measured on. A deck
   * raises it when a Life card is worth less to it than the field average: the
   * horizon decides how early Counter is spent, and spending early is only
   * right for a seat whose Life converts into a card it cannot cast.
   */
  refreshedBoardHorizonAtLife?: number;
  /**
   * Treat a {@link protectedCards} entry as spendable while a second copy of it
   * is in hand.
   *
   * `protectedCards` is a set of card *numbers*, so every copy of a named card
   * is equally shielded from the Counter step. That is right where the card is
   * protected for what it does on the board -- one is on the field or it is not
   * -- and wrong where it is protected for being a card the deck needs to cast,
   * because a list running four of it needs one. With four in hand the shield
   * makes the policy spend a card it *can* replace in order to keep three it
   * cannot use, which inverts the order the protection was written to produce.
   *
   * Off by default: which of the two readings a deck's protected set has is a
   * property of why the cards are in it.
   */
  duplicateCopiesAreSpendable?: boolean;
}

/** The default for {@link CounterPolicyOptions.refreshedBoardHorizonAtLife}. */
const DEFAULT_REFRESHED_BOARD_HORIZON = 2;

export type AttackAction = Extract<LegalAction, { type: "attack" }>;
export type EffectAction = Extract<LegalAction, { type: "resolve-effect" }>;
type CounterAction = Extract<LegalAction, { type: "counter" }>;

/**
 * Helpers over the typed `option` descriptor on `resolve-effect` actions.
 *
 * These exist so deck policies express intent ("the opponent's strongest
 * Character on the board") instead of parsing `optionId` strings or matching on
 * summary text, both of which silently break when the engine renames anything.
 */
export function optionCard(action: EffectAction) {
  return action.option.kind === "card" ? action.option : undefined;
}

export function isOptionCardIn(
  action: EffectAction,
  owner: "self" | "opponent",
  ...zones: readonly string[]
): boolean {
  const option = optionCard(action);
  return (
    option !== undefined &&
    option.owner === owner &&
    zones.includes(option.zone)
  );
}

/**
 * The options of a pending effect that actually do something.
 *
 * Every deck policy opens `chooseEffect` by dropping the "skip" option, and five
 * of them spelled that `optionId !== "skip" && optionId !== "search-select:skip"`
 * -- an allowlist of the two strings the two imperative searches happen to use,
 * hand-synced with nothing. `describeEffectOption` already classifies every way
 * an option can decline, prefixed forms and `"none"` included, so the typed
 * descriptor is both shorter and complete. `st33-policy.ts` was already written
 * this way; this is the same test, shared.
 */
export function nonSkipEffects(
  effects: readonly EffectAction[],
): EffectAction[] {
  return effects.filter((action) => action.option.kind !== "skip");
}

/**
 * The search result a deck values most, by its own table.
 *
 * The shared half of answering a search. `isSearchResult` says *that* a decision
 * is a search; this answers it, and every deck that ranks searches was doing it
 * with the same three lines -- filter the skips, sort the rest by a
 * `cardNumber -> integer` table, take the top one. `st32-cards.ts`,
 * `st33-policy.ts`, `st34-policy.ts` and `st36-policy.ts` differed only in which
 * table they consulted.
 *
 * What stays with the caller is the part that is genuinely per-deck: the table,
 * and what to do when nothing scores. Those differ on purpose -- ST32, ST34 and
 * ST36 fall back to the first offer and always decide, while ST31 and ST33 let
 * the decision fall through to the rest of their ladder -- so this returns the
 * candidate rather than a `PolicyDecision`, and cannot flatten that difference.
 *
 * Only options that name a card are considered, and ties keep the order the
 * engine offered them in (`Array.prototype.sort` is stable), so a deck with no
 * opinion about any of the candidates behaves exactly as before.
 *
 * `among` narrows the candidates before ranking, for the one deck whose priority
 * is not a single table: `st31-policy.ts` walks a list of card *names* and wants
 * the most valuable copy of each. "The best of these by the table" is the same
 * question over a subset, so it is a parameter rather than a second helper.
 */
export function bestSearchResult(
  effects: readonly EffectAction[],
  value: (cardNumber: string) => number,
  among?: (card: KnownCardRef) => boolean,
): EffectAction | undefined {
  return nonSkipEffects(effects)
    .filter((action) => {
      const card = optionCard(action)?.card;
      return card !== undefined && (among?.(card) ?? true);
    })
    .sort(
      (left, right) =>
        value(optionCardNumberOf(right)) - value(optionCardNumberOf(left)),
    )[0];
}

/**
 * Whether this option is a search result: a card being added to the deciding
 * player's hand out of their own deck.
 *
 * Five files -- `generic-policy.ts` and four deck policies -- detected a search
 * as `optionId !== "skip" && optionId !== "search-select:skip"`, which is not a
 * test for a search at all but for "not one of the two option ids the two
 * imperative searches happen to spell skip with". Four more keyed on
 * `effectKind === "search-top-five"` or `"navy-search"`, which is a test for a
 * search written imperatively: every search expressed in the mechanic DSL is a
 * `look-at` followed by a `choose` and reports `effectKind: "mechanic-choice"`,
 * so those branches silently skipped it -- and ten of the nineteen selectable
 * decks answer such a search several times a game.
 *
 * `destination` is the engine's own answer to the question, derived from the
 * pending node rather than from the id or the summary text, so this holds for
 * both spellings and cannot drift as more cards are added. The zone guard is
 * what keeps a *recursion* out: a Character added to hand off the board or out
 * of the trash is a bounce, and what a card is worth there is a different
 * question from what it is worth found on top of the deck.
 *
 */
export function isSearchResult(action: EffectAction): boolean {
  if (action.destination?.zone !== "hand") return false;
  if (action.destination.player !== "self") return false;
  const option = optionCard(action);
  return (
    option !== undefined &&
    option.owner === "self" &&
    (option.zone === "deck" || option.zone === "revealed")
  );
}

export function optionCardCost(action: EffectAction): number {
  return optionCard(action)?.card.cost ?? 0;
}

export function optionCardNumberOf(action: EffectAction): string {
  return optionCard(action)?.card.cardNumber ?? "";
}

export function optionCurrentPower(action: EffectAction): number {
  const option = optionCard(action);
  return option?.currentPower ?? option?.card.power ?? 0;
}

export function decision(
  action: LegalAction,
  ...reasons: string[]
): PolicyDecision {
  return { action, reasons };
}

/**
 * Answers a `DON!! −N` pool choice, cheapest DON!! first.
 *
 * Rested DON!! has already been spent this turn, so returning it costs nothing;
 * active DON!! could still pay for a card; DON!! given to a Character is worth
 * 1000 power the moment it leaves. Among Characters, strip the one already
 * carrying the most, which is the least likely to drop below a relevant
 * threshold from losing a single card.
 */
export function chooseDonReturn(
  effects: readonly EffectAction[],
): PolicyDecision | undefined {
  const options = effects.filter(
    (action) => action.option.kind === "don-return",
  );
  if (options.length === 0) return undefined;
  const rank = (action: EffectAction): number => {
    const option = action.option;
    if (option.kind !== "don-return") return 4;
    if (option.pool === "rested") return 0;
    if (option.pool === "active") return 1;
    return 2;
  };
  const best = [...options].sort((left, right) => {
    const byPool = rank(left) - rank(right);
    if (byPool !== 0) return byPool;
    const available = (action: EffectAction): number =>
      action.option.kind === "don-return" ? action.option.available : 0;
    return available(right) - available(left);
  })[0]!;
  return decision(best, "Pay DON!! −N with the least useful DON!! available.");
}

/**
 * Answers a choose over the opponent's board by naming their strongest body.
 *
 * Nearly every effect that names "[printed text omitted -- pnpm card:text <card>]" scales with
 * the Character it names: OP16-104 Catarina Devon *becomes* that power, a K.O.
 * removes whatever it hits, a rest denies whatever it stops. The biggest body is
 * the one worth naming. The generic fallback below takes the first non-skip
 * option in board order instead, which is not a choice at all -- it hands the
 * effect whichever Character happens to sit earliest in the zone.
 *
 * Board order decides it otherwise: a Devon copying the first Character in the
 * zone becomes a 3000 rather than the rested 6000 beside it, and one 1000
 * Counter turns the attack away.
 *
 * It sits here rather than in ST31's policy, which states the same rule, per the
 * widest-scope rule in the audit-deck-policy playbook; `chooseST31Rules` calls
 * this rather than keeping a second copy to drift from.
 *
 * When pricing this against a whole field, read *which* decks move rather
 * than the sign. The field is a closed round-robin, so the deltas net to zero
 * by construction: the decks that gain are the ones that had been taking the
 * first offer, and the decks below the line -- ST31 among them, since its own
 * policy already carried this rule -- are not playing worse, they are facing
 * opponents that stopped aiming removal at the smallest body on the board.
 */
export function chooseStrongestOpponentTarget(
  effects: readonly EffectAction[],
): PolicyDecision | undefined {
  const targets = effects.filter((action) =>
    isOptionCardIn(action, "opponent", "board"),
  );
  if (targets.length === 0) return undefined;
  const best = [...targets].sort(
    (left, right) => optionCurrentPower(right) - optionCurrentPower(left),
  )[0]!;
  return decision(best, "Apply the effect to the strongest target.");
}

/**
 * Keywords whose value is entirely in declaring an attack.
 *
 * A card that cannot attack this turn reads none of them, so a grant that
 * expires with the turn is spent for nothing. [Blocker] is deliberately absent:
 * it is read on the *opponent's* turn, so whether a turn-scoped grant of it is
 * live depends on whose turn it is, and this rule does not know enough to say.
 */
const ATTACK_ONLY_KEYWORDS = new Set(["Unblockable", "Double Attack"]);

/** Keywords whose whole purpose is to cure summoning sickness. */
const RUSH_KEYWORDS = new Set(["Rush", "Rush: Character"]);

/**
 * Answer "if you would take damage, you may trash this Character instead"
 * (EB05-052 Gloriosa): take the damage unless it would lose the game.
 *
 * The engine asks it in two shapes -- a `damage-replacement` effect for a lost
 * battle, whose decline is `skip`, and a `take-damage` mode on an effect's
 * `deal-damage` -- and both list the replacement first, so the fallback below
 * would always pay it. That trades a 6000-power body for one Life card, and the
 * Life card comes to hand (or flips a [Trigger]), so the trade only pays when
 * there is no Life left to take: at 0 Life the damage ends the game.
 */
export function chooseDamageReplacement(
  observation: GameObservation,
  effects: readonly EffectAction[],
): PolicyDecision | undefined {
  const takeDamage = effects.find(
    (action) =>
      (action.effectKind === "damage-replacement" &&
        action.option.kind === "skip") ||
      (action.option.kind === "mode" && action.option.mode === "take-damage"),
  );
  if (!takeDamage) return undefined;
  if (observation.self.lifeCount > 0) {
    return decision(
      takeDamage,
      "Take the damage: a Life card is cheaper than the Character.",
    );
  }
  const replace = effects.find((action) => action !== takeDamage);
  return replace
    ? decision(replace, "Trash the Character: the damage would lose the game.")
    : undefined;
}

/**
 * A keyword granted for this turn goes on a card that can use it this turn.
 *
 * OP17-084 Chopper's `[On Play]` offers `[Unblockable]` to any of your
 * Characters, and the fallback below takes the first non-skip option -- which
 * can be a rested giant that is on the board to switch Chopper's own condition
 * on and will not attack again this turn. The keyword then expires unused, while
 * the same grant on an attacker wins past two Blockers.
 *
 * The two families are opposites and both matter:
 *
 * - [Unblockable] and [Double Attack] are read by an attack, so the target must
 *   be able to declare one: active, not summoning-sick, not attack-locked.
 * - [Rush] is read by a Character that *is* summoning-sick -- that is what it
 *   cures -- so granting it to a card that could already attack is the waste,
 *   and the preference inverts.
 *
 * Strongest eligible target, because an unblockable swing is worth what it hits
 * for. Declines to have an opinion when nothing is eligible, so the fallback
 * still resolves the effect rather than the engine stalling: a grant with no
 * good home is still a grant, and "up to 1" is not always declinable.
 *
 * Fourteen cards route a choice into a keyword grant, so this is registered here
 * rather than in one deck, per the widest-scope rule in the audit-deck-policy
 * playbook; OP16's Ace policy states the [Rush] half deck-scoped, as ST31's does
 * for `chooseStrongestOpponentTarget`.
 *
 * Its evidence is the position `test/policy-keyword-grant.test.ts` pins, not
 * the standings: a field-wide instrument cannot see a rule about a card most
 * matchups never draw, and there the wrong choice loses a game that was won.
 */
export function chooseKeywordGrantTarget(
  observation: GameObservation,
  effects: readonly EffectAction[],
): PolicyDecision | undefined {
  const grants = effects.find((action) => action.grants)?.grants;
  if (!grants?.expiresThisTurn) return undefined;
  const wantsRush = RUSH_KEYWORDS.has(grants.keyword);
  if (!wantsRush && !ATTACK_ONLY_KEYWORDS.has(grants.keyword)) return undefined;

  const eligible = effects.filter((action) => {
    const option = optionCard(action);
    if (!option || option.owner !== "self" || option.zone !== "board") {
      return false;
    }
    const card = observation.self.board.find(
      (candidate) => candidate.instanceId === option.card.instanceId,
    );
    if (!card || card.rested) return false;
    if ((card.cannotAttackUntilTurn ?? -1) >= observation.turn) return false;
    return wantsRush ? Boolean(card.summoningSick) : !card.summoningSick;
  });
  if (eligible.length === 0) return undefined;

  const best = [...eligible].sort(
    (left, right) => optionCurrentPower(right) - optionCurrentPower(left),
  )[0]!;
  return decision(
    best,
    wantsRush
      ? `Give ${grants.keyword} to the strongest Character it lets attack this turn.`
      : `Give ${grants.keyword} to the strongest Character that can still attack this turn.`,
  );
}

/**
 * Aims a power debuff raised during a battle at the opposing card in that battle.
 *
 * "Give up to 1 of your opponent's Characters -2000 power during this battle" is
 * paid to decide the battle in front of the chooser, and it decides nothing on a
 * card that is not in it. `chooseStrongestOpponentTarget` below names the
 * strongest opposing body, which is right for a K.O. and wrong here: the
 * strongest body on the board is usually not the one in the battle, so the
 * debuff is spent -- along with whatever the clause cost -- on a card the battle
 * never reads.
 *
 * Gated on the change being a debuff (`amount < 0`) and on a battle being open,
 * so a Main-phase -1000 or a buff on the chooser's own attacker falls through
 * to the rules that already handle them. Which side of the battle is "opposing"
 * depends on who is choosing: the attack's target on the chooser's own turn,
 * the attacker on the opponent's.
 *
 * Read it on (Purple) Kaido, the deck the probe found it on. It is not a
 * subtle rule finding a subtle edge -- that deck was paying a DON!! off its
 * own field, every turn, for nothing, and the Leader's ability is the only
 * removal support in the list.
 *
 * Format-scoped rather than written into `op17-kaido-policy.ts`, by the test in
 * the audit playbook's section 6: the rule names a printed clause and a rule of
 * the game -- a "during this battle" debuff decides the battle it is in -- both
 * of which mean the same thing in every deck. The committed standings are the
 * containment check.
 */
export function chooseBattleDebuffTarget(
  observation: GameObservation,
  effects: readonly EffectAction[],
): PolicyDecision | undefined {
  const battle = observation.activeBattle;
  if (!battle) return undefined;
  const opposing =
    observation.turnPlayer === observation.viewer
      ? battle.targetInstanceId
      : battle.attackerInstanceId;
  const target = effects.find((action) => {
    if ((action.modifiesPower?.amount ?? 0) >= 0) return false;
    const option = optionCard(action);
    return (
      option !== undefined &&
      option.owner === "opponent" &&
      option.zone === "board" &&
      option.card.instanceId === opposing
    );
  });
  if (!target) return undefined;
  return decision(
    target,
    "Put the debuff on the card in this battle: anywhere else it decides nothing.",
  );
}

export function pass(actions: readonly LegalAction[]): LegalAction {
  const action = actions.find((candidate) => candidate.type === "pass");
  if (!action) throw new Error("NO_LEGAL_ACTION");
  return action;
}

/**
 * `pass`, when declining is still on the table.
 *
 * It may not be. `resolveWithModules` lets a module veto `pass` as long as
 * something else survives -- that is how a `mustAct` rule says "the race is lost,
 * block this hit" to a policy that would otherwise preserve its Blocker. The
 * candidate set this file is handed can therefore be one with no `pass` in it,
 * and a branch below that reached for `pass` unconditionally would throw
 * `NO_LEGAL_ACTION` on the way to the decision the rule was asking for.
 *
 * So: a missing `pass` is not an error, it is an instruction. Each caller reads
 * `undefined` as "declining is not available; do the thing".
 */
export function passOrNone(
  actions: readonly LegalAction[],
): LegalAction | undefined {
  return actions.find((candidate) => candidate.type === "pass");
}

export function selfLeaderId(observation: GameObservation): string {
  return `${observation.viewer}-leader`;
}

export function opponentLeaderId(observation: GameObservation): string {
  return `${observation.viewer === "p1" ? "p2" : "p1"}-leader`;
}

/**
 * What this attacker would actually swing for if the attack were declared now.
 *
 * Reads the engine's own `attackPower` and only falls back to the board when
 * the action does not carry one, which the protocol says happens solely in
 * hand-built test fixtures -- "every attack action the engine offers reports
 * all of them".
 *
 * The fallback is not merely a cheaper route to the same number, and that is
 * the whole point of preferring the field. A "while attacking" power layer is
 * read continuously while the attack is open and reads *nothing* before
 * declaration, so it is absent from `currentPower` by construction:
 * OP16-055 Mr.2.Bon.Kurei's base power becomes the opposing Leader's, and
 * OP16-036 is the same clause one set earlier without the `[DON!! x1]` gate.
 * `legal-actions/main.ts` already simulates `state.activeAttack` when pricing
 * the offered action, precisely "otherwise the preview would understate an
 * attack that only becomes accurate once actually declared". Recomputing from
 * the board here would understate it again: a policy that attaches the one DON!!
 * switching Mr.2 on would then price the 6000 body it just bought at 2000,
 * filter the attack out, and end the turn on the Leader swing alone.
 *
 * Only two printed clauses in the pool read `state.activeAttack` this way, and
 * one shipped deck runs either of them, so read this on (Green/Blue)
 * Monkey.D.Luffy -- the deck whose every power source is `[DON!! x1]`-gated, and
 * so the one that feels a mispricing most. Not a `pnpm deck:ab` module: a shared
 * arithmetic helper is not registered and cannot be switched off.
 */
export function attackerPower(
  observation: GameObservation,
  action: AttackAction,
): number {
  if (action.attackPower !== undefined) return action.attackPower;
  if (action.attackerInstanceId === selfLeaderId(observation)) {
    return observation.self.leader.currentPower;
  }
  return (
    observation.self.board.find(
      (card) => card.instanceId === action.attackerInstanceId,
    )?.currentPower ?? 0
  );
}

export function targetPower(
  observation: GameObservation,
  action: AttackAction,
): number {
  if (action.targetInstanceId === opponentLeaderId(observation)) {
    return observation.opponent.leader.currentPower;
  }
  return (
    observation.opponent.board.find(
      (card) => card.instanceId === action.targetInstanceId,
    )?.currentPower ?? Number.POSITIVE_INFINITY
  );
}

export function viableAttacks(
  observation: GameObservation,
  actions: readonly LegalAction[],
): AttackAction[] {
  return actions.filter(
    (action): action is AttackAction =>
      action.type === "attack" &&
      attackerPower(observation, action) >= targetPower(observation, action),
  );
}

/**
 * Whether this Leader hit has to be stopped rather than absorbed.
 *
 * The test is `>=`, not `>`: the danger line is *reaching* 0 Life, not being
 * hit past it. A defender at 1 Life who takes the hit is not dead yet, but it
 * holds no Life to trade on the opponent's next turn, and the opponent's board
 * refreshes before the defender's Life does -- so the next Leader hit, this
 * turn or next, ends the game. Reaching 0 while the attacker still has any way
 * to swing is the same as losing, one turn early.
 *
 * `>=` and not `>`: at 1 Life `incomingLeaderDamage` reads 0 once every attacker
 * that swung is rested, so the strict comparison declines the last attack of the
 * turn and then loses to a Rush Character deployed with the DON!! left over.
 *
 * The low-Life clause is the same gap one Life higher, and it lives here
 * because this predicate is the *Counter* path's test. `incomingLeaderDamage`
 * is deliberately pessimistic during the opponent's turn: it prices only
 * attackers that can still swing *this* turn, so a Character the opponent just
 * played (summoning sickness) and a Leader that has already swung both read 0.
 * Low on Life that is the wrong horizon for a Counter -- the hit in front of
 * the defender is often the last of the turn, and the board that refreshes
 * after it is the one that ends the game. `nextTurnLeaderDamage` prices that
 * refreshed board, and below `horizonAtLife` it is the number that decides --
 * otherwise a seat absorbs a nonlethal hit down to 1 Life holding a Counter
 * card it could have spent, and loses to the refreshed board the turn after.
 * Where that line falls is a per-deck judgement, because it is really a claim
 * about what a Life card is worth to the hand that receives it; see
 * {@link CounterPolicyOptions.refreshedBoardHorizonAtLife}.
 *
 * The Block path deliberately does *not* share this clause. A Blocker is a
 * reusable board asset and blocking rests -- and often loses -- it, so spending
 * it on a hit the defender can absorb at 2 Life is throwing away the card that
 * stops the refreshed board next turn. That is the behaviour the ST36 matchups
 * pin down ("does not block for a summoning-sick future attacker"); Counter, by
 * contrast, spends a hand card that cannot be saved for later anyway.
 */
export function mustPreventCurrentLeaderHit(
  observation: GameObservation,
  horizonAtLife: number = DEFAULT_REFRESHED_BOARD_HORIZON,
): boolean {
  const battle = observation.activeBattle;
  if (!battle || !battle.targetInstanceId.endsWith("-leader")) return false;
  // `lifeCost` rather than 1: the hit in front of the defender takes two Life
  // when the attacker has [Double Attack], and pricing it at one is how a
  // defender at 2 Life talked itself into absorbing a hit that ends the game.
  const currentDamage =
    battle.attackPower >= battle.targetPower + battle.counterPower
      ? battle.lifeCost
      : 0;
  const threats =
    observation.self.lifeCount <= horizonAtLife
      ? nextTurnLeaderDamage(observation)
      : incomingLeaderDamage(observation);
  return currentDamage + threats >= observation.self.lifeCount;
}

/**
 * Whether this Leader hit has to be stopped *with a Blocker*.
 *
 * The Counter path's `mustPreventCurrentLeaderHit` widens the horizon to the
 * refreshed board at 1-2 Life, because a Counter spends a hand card that cannot
 * be saved. A Blocker is different: blocking rests it, and against an attack
 * that outpowers it, K.O.s it outright. Spending it on a hit the Leader can
 * absorb is throwing away the card that stops the next turn's attacks. So the
 * Block path stays on the this-turn horizon: block only when the current hit
 * plus everything that can still swing *this* turn reaches 0 Life.
 */
function mustBlockCurrentLeaderHit(observation: GameObservation): boolean {
  const battle = observation.activeBattle;
  if (!battle || !battle.targetInstanceId.endsWith("-leader")) return false;
  const currentDamage =
    battle.attackPower >= battle.targetPower + battle.counterPower
      ? battle.lifeCost
      : 0;
  return (
    currentDamage + incomingLeaderDamage(observation) >=
    observation.self.lifeCount
  );
}

type BlockAction = Extract<LegalAction, { type: "block" }>;

/**
 * The block to make once blocking is settled: survive first, then spend least.
 *
 * The old sort was `currentPower` ascending alone, which reads as "spend the
 * cheapest body" but is exactly backwards whenever a bigger Blocker would live
 * through the hit. Against a 4000 attacker with a 2000 and a 5000 Blocker
 * available it chose the 2000, which stops the same hit and dies; the 5000
 * stops it and is still on the board next turn. A Blocker that outpowers the
 * attacker costs only the rest, and the rest is refunded at the next Refresh
 * Phase -- so a surviving block is strictly better than a dying one, whatever
 * the two bodies cost.
 *
 * Within each group the lowest power still wins: among survivors that keeps the
 * biggest body free for the next attack, and among the dying it throws away the
 * smallest one.
 *
 * `battle` is undefined only if the caller reached here off a block window with
 * no active battle, which the engine does not produce; that case falls back to
 * the old cheapest-body order rather than inventing a survival verdict.
 */
function cheapestSurvivingBlock(
  observation: GameObservation,
  blocks: readonly BlockAction[],
): BlockAction {
  const power = new Map(
    observation.self.board.map((card) => [card.instanceId, card.currentPower]),
  );
  // A `redirect` block names the redirect *target*, which may be the Leader --
  // it is on no board list, so reading it off `self.board` alone scored it 0
  // and sorted every redirect to the front regardless of how it fares.
  power.set(
    `${observation.viewer}-leader`,
    observation.self.leader.currentPower,
  );
  const attackPower = observation.activeBattle?.attackPower;
  const survives = (block: BlockAction) =>
    attackPower !== undefined &&
    (power.get(block.blockerInstanceId) ?? 0) > attackPower;
  return [...blocks].sort(
    (left, right) =>
      Number(survives(right)) - Number(survives(left)) ||
      (power.get(left.blockerInstanceId) ?? 0) -
        (power.get(right.blockerInstanceId) ?? 0),
  )[0]!;
}

export function chooseGenericBlock(
  observation: GameObservation,
  actions: readonly LegalAction[],
): PolicyDecision | undefined {
  const blocks = actions.filter(
    (action): action is Extract<LegalAction, { type: "block" }> =>
      action.type === "block",
  );
  if (blocks.length === 0) return undefined;
  const declining = passOrNone(actions);
  const required = mustBlockCurrentLeaderHit(observation);
  if (declining && !required) {
    return decision(
      declining,
      "Preserve Blockers because this hit is not required to survive the remaining attacks.",
    );
  }
  const block = cheapestSurvivingBlock(observation, blocks);
  return decision(
    block,
    required
      ? "Block the cheapest way because the projected attack count otherwise exceeds remaining Life."
      : "Block the cheapest way because declining this hit is no longer an option.",
  );
}

function bestCounterCombination(
  observation: GameObservation,
  actions: readonly LegalAction[],
  required: number,
  protectedCards: ReadonlySet<string>,
  duplicateCopiesAreSpendable = false,
): CounterAction[] | undefined {
  // Copies of each card the hand is holding, so a protected card with a spare
  // can be priced as the spare rather than as the one the deck needs.
  const copies = new Map<string, number>();
  for (const card of observation.self.hand) {
    copies.set(card.cardNumber, (copies.get(card.cardNumber) ?? 0) + 1);
  }
  const isProtected = (cardNumber: string): boolean => {
    if (!protectedCards.has(cardNumber)) return false;
    if (!duplicateCopiesAreSpendable) return true;
    return (copies.get(cardNumber) ?? 0) < 2;
  };
  const options = actions
    .filter((action): action is CounterAction => action.type === "counter")
    .map((action) => {
      const card = observation.self.hand.find(
        (candidate) => candidate.instanceId === action.cardInstanceId,
      );
      return {
        action,
        // The offered action's own figure first: `counterActions` prices a
        // granted Counter that the printed stat does not carry, and
        // `currentCounter` is the same number when a fixture built the action
        // without one.
        power: action.counterPower ?? card?.currentCounter ?? 0,
        protected: isProtected(card?.cardNumber ?? "") ? 1 : 0,
      };
    });
  const combinations = new Map<number, Array<(typeof options)[number]>>([
    [0, []],
  ]);
  const strategicLoss = (combination: Array<(typeof options)[number]>) =>
    combination.reduce((total, option) => total + option.protected, 0);
  const isBetter = (
    candidate: Array<(typeof options)[number]>,
    existing: Array<(typeof options)[number]>,
  ) =>
    candidate.length < existing.length ||
    (candidate.length === existing.length &&
      strategicLoss(candidate) < strategicLoss(existing));

  for (const option of options) {
    for (const [power, combination] of [...combinations]) {
      const nextPower = power + option.power;
      const candidate = [...combination, option];
      const existing = combinations.get(nextPower);
      if (!existing || isBetter(candidate, existing)) {
        combinations.set(nextPower, candidate);
      }
    }
  }

  return [...combinations]
    .filter(([power]) => power >= required)
    .sort(
      ([leftPower, left], [rightPower, right]) =>
        left.length - right.length ||
        strategicLoss(left) - strategicLoss(right) ||
        leftPower - rightPower,
    )[0]?.[1]
    .sort(
      (left, right) =>
        left.protected - right.protected || right.power - left.power,
    )
    .map((option) => option.action);
}

/**
 * Whether the Counter window will spend cards to save one of the viewer's own
 * Characters from the attack in front of it.
 *
 * Exported because the block window has to ask the same question one decision
 * earlier. `block-discount` declines a Leader hit's damage by putting a body in
 * front of it, which is only cheaper than paying the Leader's shortfall if this
 * window then pays the body's smaller one. A promise priced differently from the
 * payment is the failure `leaderCounterBudget` already exists to prevent: the
 * seat blocks on the strength of a save, this window refuses the save as
 * uneconomical, and the body dies for nothing.
 *
 * `shortfall` is the Counter power still needed, which differs between the two
 * callers -- the block window asks about the body it is about to interpose, this
 * one about the body already under attack.
 */
export function willSpendToSaveCharacter(
  observation: GameObservation,
  cardNumber: string,
  shortfall: number,
  options: CounterPolicyOptions,
): boolean {
  const protectedCards = options.protectedCards ?? new Set<string>();
  if (!protectedCards.has(cardNumber)) return false;
  // A deck that turns the cap off has already said every protected card is
  // worth the whole hand.
  if (!(options.economicalCharacterDefense ?? true)) return true;
  const defenceBudget = options.characterDefensePower ?? (() => 1_000);
  return (
    shortfall <= defenceBudget(cardNumber) &&
    observation.self.lifeCount > incomingLeaderDamage(observation)
  );
}

/**
 * What a [Counter] Event actually adds to the defense in front of it.
 *
 * The engine computes this and puts it on the action: `counterPower` comes from
 * `counterEventPower`, which knows the Event's printed clause *and* whether the
 * card being defended is a legal target for it. This helper exists so the
 * policy reads that number instead of re-deriving it.
 *
 * A card-number table cannot stand in for it, which is the drift `tactics.ts`
 * exists to prevent: it is wrong in both directions for any deck the table has
 * not heard of. Purple Enel is twenty Events of that -- Varie, El Thor and
 * Lightning Beast Kiten add +2000 and only to an `[Enel]` card, Mamaragan adds
 * +1000, and every one of them adds **0** when the body under attack is a vassal
 * rather than an [Enel] one. Priced at a flat figure, a policy both spends Events
 * on gaps they cannot close and passes over ones that would close the gap for a
 * single card.
 *
 * `counterPower` is omitted, not zero, when the Event's contribution "is decided
 * as it resolves" -- the value genuinely is not known until then. The
 * card-number table is kept for that case only, where a guess is all there is,
 * and reads `sourceCardNumber` off the action rather than looking the instance
 * up in the hand.
 *
 * This is a shared-code correctness fix rather than a rule, so it can only be
 * read on a deck that sees it. Correcting the price *alone*, keeping the old
 * "the Event must close the whole gap alone" test, is a *loss* for Purple
 * Enel: the policy stops spending Events it cannot win with in one card, and
 * passes instead of playing the two-card line that does win. Dropping that
 * test -- see the selector below, the Counter step is a loop -- is what makes
 * the corrected price pay.
 *
 * Nineteen of the twenty other registered decks are a zero-flip control on the
 * `counterPower` half: the two Events the old table named by number, OP11-079
 * and OP12-057, are priced identically either way, so only a deck holding an
 * Event the table had never heard of can tell the difference.
 */
function counterEventDefense(
  action: Extract<LegalAction, { type: "activate-counter-event" }>,
): number {
  if (action.counterPower !== undefined) return action.counterPower;
  return action.sourceCardNumber === "OP11-079"
    ? 5000
    : action.sourceCardNumber === "OP12-057"
      ? 4000
      : 3000;
}

export function chooseGenericCounter(
  observation: GameObservation,
  actions: readonly LegalAction[],
  options: CounterPolicyOptions = {},
): PolicyDecision {
  const battle = observation.activeBattle;
  // May be absent: a `mustAct` rule can remove it. See `passOrNone`.
  const passAction = passOrNone(actions);
  if (!battle) {
    return decision(
      passAction ?? actions[0]!,
      "No active battle requires Counter.",
    );
  }
  const required =
    battle.attackPower - battle.targetPower - battle.counterPower + 1;
  if (required <= 0 && passAction) {
    return decision(
      passAction,
      "Current defense already exceeds attack power.",
    );
  }

  const protectedCards = options.protectedCards ?? new Set<string>();
  const protectsLeader = battle.targetInstanceId.endsWith("-leader");
  const protectedCharacter = observation.self.board.find(
    (card) => card.instanceId === battle.targetInstanceId,
  );
  const shouldDefend = protectsLeader
    ? mustPreventCurrentLeaderHit(
        observation,
        options.refreshedBoardHorizonAtLife ?? DEFAULT_REFRESHED_BOARD_HORIZON,
      )
    : protectedCharacter !== undefined &&
      willSpendToSaveCharacter(
        observation,
        protectedCharacter.cardNumber,
        required,
        options,
      );
  if (!shouldDefend && passAction) {
    return decision(
      passAction,
      protectsLeader
        ? "Take nonlethal Life rather than spend future defense prematurely."
        : "Do not spend hand resources protecting a replaceable Character.",
    );
  }

  const counters = actions.filter(
    (action): action is CounterAction => action.type === "counter",
  );
  const counterPower = new Map(
    observation.self.hand.map((card) => [card.instanceId, card.currentCounter]),
  );
  const available = counters.reduce(
    (total, action) =>
      total +
      (action.counterPower ?? counterPower.get(action.cardInstanceId) ?? 0),
    0,
  );
  const counterCombination =
    (options.efficientCombination ?? true)
      ? bestCounterCombination(
          observation,
          actions,
          required,
          protectedCards,
          options.duplicateCopiesAreSpendable ?? false,
        )
      : available >= required
        ? counters.sort(
            (left, right) =>
              (counterPower.get(left.cardInstanceId) ?? 0) -
              (counterPower.get(right.cardInstanceId) ?? 0),
          )
        : undefined;
  // Which [Counter] Event to reach for, if any.
  //
  // The Counter step is a *loop*: each decision spends one card and the engine
  // asks again with the shortfall reduced. So the test is not "does this Event
  // close the whole gap on its own" -- an Event that closes half of it is still
  // the right opening card of a two-card line. Requiring a solo close is a
  // loss on Purple Enel,
  // whose Events add 2000 against shortfalls that are routinely larger: the
  // policy correctly stopped spending Events it could not win with alone, and
  // passed instead of playing the line that did win.
  //
  // What is genuinely worthless is an Event that adds *nothing*, and an Event
  // spent into a gap the whole hand cannot close. "The whole hand" includes
  // the other [Counter] Events: the loop asks again after each one, so a line
  // of two +2000 Events and a 1000 card is a line, and pricing the rest of
  // the hand as ordinary Counter alone passes a lethal hit the hand could stop.
  const eventDefense = actions.reduce(
    (total, action) =>
      action.type === "activate-counter-event"
        ? total + counterEventDefense(action)
        : total,
    0,
  );
  const counterEvent = actions.find((action) => {
    if (action.type !== "activate-counter-event") return false;
    const power = counterEventDefense(action);
    // Adds no defense at all -- an [Enel] Event defending a body that is not
    // [Enel]. The old card-number table scored this 3000.
    if (power === 0) return false;
    // Either the Event finishes the job, or the rest of the hand can finish
    // it after the Event has cut the shortfall down.
    return required <= power || required <= available + eventDefense;
  });
  // A [Counter] Event is normally the last resort, because it is a whole card
  // spent where an ordinary Counter card is also a whole card. That stops being
  // true once the ordinary line needs several cards to reach the same defence,
  // so a deck may name the length at which the Event becomes the cheaper half of
  // the trade. Default Infinity keeps every existing caller's behaviour.
  const eventBeatsCards =
    options.counterEventBeatsCards ?? Number.POSITIVE_INFINITY;
  if (
    counterEvent &&
    counterCombination &&
    counterCombination.length >= eventBeatsCards
  ) {
    return decision(
      counterEvent,
      "Use the Counter Event because it costs fewer cards than the ordinary Counter line.",
    );
  }
  if (counterCombination?.[0]) {
    return decision(
      counterCombination[0],
      `Use the ${counterCombination.length}-card Counter line that preserves the most strategic hand value.`,
    );
  }
  if (counterEvent) {
    return decision(
      counterEvent,
      "Use the Counter Event because ordinary Counter is insufficient.",
    );
  }
  return decision(
    passAction ?? actions[0]!,
    "Available Counter cannot save the target, so preserve the hand.",
  );
}

export function chooseGenericTrigger(
  actions: readonly LegalAction[],
): PolicyDecision | undefined {
  const triggers = actions.filter(
    (action) => action.type === "resolve-trigger",
  );
  if (triggers.length === 0) return undefined;
  const useful = triggers.find((action) => action.optionId !== "skip");
  return decision(
    useful ?? triggers[0]!,
    "Resolve the available beneficial Trigger.",
  );
}

export function chooseGenericRules(
  observation: GameObservation,
): PolicyDecision {
  const actions = observation.legalActions;
  if (actions.length === 1) {
    return decision(actions[0]!, "Only one legal action is available.");
  }

  const mulligan = actions.filter(
    (action) => action.type === "mulligan-decision",
  );
  if (mulligan.length > 0) {
    const keep = observation.self.hand.some((card) => card.cost <= 2);
    return decision(
      mulligan.find(
        (action) => action.decision === (keep ? "keep" : "mulligan"),
      )!,
      keep
        ? "Keep a hand with an early play."
        : "Mulligan a hand without an early play.",
    );
  }

  const effects = actions.filter((action) => action.type === "resolve-effect");
  if (effects.length > 0) {
    // `DON!! −N` lets the payer say which DON!! goes back. Spend a rested one
    // first -- it has already done its work this turn -- then an active one,
    // and only strip a Character of DON!! when nothing else is left, since that
    // costs it 1000 power on the spot.
    const donReturn = chooseDonReturn(effects);
    if (donReturn) return donReturn;
    const damage = chooseDamageReplacement(observation, effects);
    if (damage) return damage;
    // Before the strongest-opponent rule too: a debuff paid during a battle
    // goes on the card in the battle, whatever else is on the board.
    const debuffed = chooseBattleDebuffTarget(observation, effects);
    if (debuffed) return debuffed;
    // Before the strongest-opponent rule: a keyword grant names *your own*
    // cards, so that rule never fires on one and the first offer would win.
    const granted = chooseKeywordGrantTarget(observation, effects);
    if (granted) return granted;
    const strongest = chooseStrongestOpponentTarget(effects);
    if (strongest) return strongest;
    const nonSkip = nonSkipEffects(effects)[0];
    return decision(
      nonSkip ?? effects[0]!,
      "Resolve a legal beneficial effect before optional actions.",
    );
  }

  const trigger = chooseGenericTrigger(actions);
  if (trigger) return trigger;
  const block = chooseGenericBlock(observation, actions);
  if (block) return block;
  if (observation.phase === "counter") {
    return chooseGenericCounter(observation, actions);
  }

  const costs = new Map(
    observation.self.hand.map((card) => [card.instanceId, card.cost]),
  );
  const play = actions
    .filter((action) => action.type === "play-card")
    .sort(
      (left, right) =>
        (costs.get(right.cardInstanceId) ?? 0) -
        (costs.get(left.cardInstanceId) ?? 0),
    )[0];
  if (play) return decision(play, "Develop the highest-cost legal card.");

  const activation = actions.find((action) => action.type === "activate-main");
  if (activation)
    return decision(activation, "Use an available Main-phase effect.");
  const attachment = actions.find((action) => action.type === "attach-don");
  if (attachment)
    return decision(attachment, "Convert unused DON!! into attack power.");

  const attacks = viableAttacks(observation, actions);
  const leaderAttack = attacks.find(
    (action) => action.targetInstanceId === opponentLeaderId(observation),
  );
  if (leaderAttack)
    return decision(leaderAttack, "Use a viable attack to pressure Life.");
  if (attacks[0])
    return decision(attacks[0], "Use the remaining viable Character attack.");
  const declining = passOrNone(actions);
  if (declining) {
    return decision(declining, "No remaining legal action improves the turn.");
  }
  // A `mustAct` rule removed `pass`, so ending the turn here is not on offer.
  // Whatever is left is what the rule was asking for.
  return decision(
    actions[0]!,
    "Declining is not available, so take the remaining action.",
  );
}

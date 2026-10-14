/**
 * Format rules about [Trigger]s and the turn-scoped effects that read like
 * them: whether a clause is worth spending, and what it should land on.
 *
 * One of the files `format-heuristics.ts` is the map of; see that file for what
 * lives where and why the split is by decision rather than by deck.
 */
import { heuristics, never, preferAmong } from "../heuristics.js";
import { opponentLeaderId, optionCard } from "../generic-policy.js";
import { characterCanStillAttack, opponentCanStillAttack } from "../combat.js";
import type { PolicyModule } from "../policy-module.js";

/**
 * Do not spend a [Trigger] on a debuff that can no longer change anything.
 *
 * A [Trigger] like OP04-016 Bad Manners Kick Course gives an opposing Leader
 * −3000 until end of turn. Flipped on a turn where that Leader has already
 * attacked and nothing else can, the debuff expires having done nothing and the
 * card -- a [Counter] Event worth +3000 in a later battle -- goes to the trash
 * instead of to hand.
 *
 * Expressible only because `LegalAction.resolve-trigger` carries
 * `sourceCardNumber`; without it `chooseGenericTrigger` cannot tell the offers
 * apart and takes the first non-skip option.
 *
 * The argument for it is a dominance one, not a judgement call: a debuff that
 * expires unused is worth exactly zero, and the same card in hand is worth at
 * least zero. Deliberately narrow -- it fires only when the debuff is the
 * Trigger's entire effect and the opponent has no attack left that it could
 * blunt.
 *
 */
export function createDeadTriggerModule(): PolicyModule {
  return heuristics("dead-trigger", [
    never(
      "This Trigger is only a power debuff and the opponent has no attack left for it to blunt, so the card is worth more in hand.",
    )
      .when((t) => t.incomingLeaderAttacks === 0)
      .trigger((action, t) => {
        // Never veto the "add this card to hand" branch, or the decision has no
        // surviving option at all.
        if (action.optionId === "skip") return false;
        const facts = t.facts(action.sourceCardNumber);
        return facts !== undefined && facts.rules.triggerIsDeadWeightDebuff;
      }),
  ]);
}

/**
 * Aim a [Trigger]'s power debuff at a unit that still has an attack to make.
 *
 * `dead-trigger` above answers "activate or keep the card"; this answers "and
 * at what", which is a different decision and was going unanswered. A
 * targeting [Trigger] raises one offer per candidate and nothing ranked them,
 * so `chooseGenericTrigger` took the first the board produced.
 *
 * A debuff that expires at the end of this turn does nothing to a unit that
 * cannot attack again in it -- a Leader that has already declared, say -- while
 * the same debuff on a body still holding its attack is the whole point of the
 * card. `dead-trigger` cannot catch that: an attack is still left on the board,
 * just not on the unit the debuff landed on.
 *
 * `preferAmong` rather than `prefer`, because the claim is a comparison and not
 * a commitment: it says which target, never whether to activate. Scoring only
 * the live targets under `prefer` would hide `skip` along with the dead ones
 * and take the "add this card to hand" branch off the table, which is the
 * branch `dead-trigger` exists to reach.
 *
 * Narrow by the same construction as `dead-trigger`, and for the same reason:
 * it reads `triggerIsDeadWeightDebuff`, so it speaks only about a [Trigger]
 * whose entire effect is a power reduction that expires. A debuff attached to a
 * K.O., a rest or a draw buys something that outlives the turn, and which body
 * should carry it is then a judgement this rule has no standing to make.
 */
export function createTriggerDebuffTargetModule(): PolicyModule {
  return heuristics("trigger-debuff-target", [
    preferAmong(
      "Put the expiring debuff on a unit that still has an attack to make, not on one that has already swung.",
    ).trigger((action, t) => {
      const { targetInstanceId } = action;
      if (targetInstanceId === undefined) return false;
      const facts = t.facts(action.sourceCardNumber);
      if (facts?.rules.triggerIsDeadWeightDebuff !== true) return false;
      // Every target is scored, and a spent one is scored *below* zero rather
      // than at it: `rankAmong` reads a bare 0 as "no opinion" and drops the
      // candidate from its subset, which would leave the spent bodies in the
      // running instead of behind the live one.
      if (targetInstanceId === opponentLeaderId(t.observation)) {
        return t.observation.opponent.leader.rested ? -1 : 1;
      }
      const target = t.observation.opponent.board.find(
        (card) => card.instanceId === targetInstanceId,
      );
      if (!target) return false;
      return characterCanStillAttack(t.observation, target) ? 1 : -1;
    }),
  ]);
}

/**
 * Aim a Main-phase power debuff at a body this turn's attacks can reach.
 *
 * `trigger-debuff-target` above is the defender's half of this decision, and
 * its preference is the opposite one: a [Trigger] fires on the opponent's
 * turn, so the debuff is worth something on a body that still has an attack to
 * make. Spent from the chooser's own Main phase the arithmetic inverts, and
 * neither that rule nor `battle-debuff-target` -- which needs an open battle --
 * speaks to it. What was left answering it is
 * `chooseStrongestOpponentTarget`, which names the largest body on the board.
 *
 * Left to that, a −2000 lands on the largest body on the board even when that
 * body is active and keywordless. The debuff expires with the turn, and only two
 * things read it in that window -- a battle the chooser declares, and a block.
 * An active Character without [Blocker] is in neither: it cannot be attacked and
 * it cannot interpose itself, so the debuff is spent for nothing, while on a
 * rested body it puts that body inside what the board can kill.
 *
 * So the two live targets, and they are the two the rules of the game allow to
 * be in a battle this turn:
 *
 *  - **A rested Character**, which is the only kind an attack may be declared
 *    against.
 *  - **An active [Blocker]**, which may put itself in front of an attack aimed
 *    elsewhere. `board[].blocker` is read rather than the printed keyword
 *    because it is the "can block right now" answer -- a rested Blocker reads
 *    false, and it is already covered by the first case.
 *
 * `preferAmong` rather than `prefer`, because the claim is a comparison and
 * not a commitment. A spent body is scored *below* zero rather than at it:
 * `rankAmong` reads a bare 0 as "no opinion" and drops the candidate from its
 * subset, which would leave the spent bodies in the running beside the live
 * one. Unscored candidates -- the opposing Leader, the chooser's own cards -- are
 * left alone deliberately: this rule is about which opposing Character, not
 * about whether the Leader is the better home.
 *
 * Gated off an open battle, where `battle-debuff-target` already has the
 * answer and narrowing ahead of it would hide the card in the battle.
 *
 * Registered for one deck rather than format-wide, because it is a trade and
 * not a dominance argument. The turn-scoped debuff has a third reader the two
 * above do not cover: a K.O. clause elsewhere in the same Main phase that
 * selects on *current* power, which is the line that wants the debuff on the
 * biggest body the removal can then reach. A deck whose plan is removal rather
 * than attacks should price this the other way round, so each one is asked
 * separately.
 */
export function createMainDebuffTargetModule(): PolicyModule {
  return heuristics("main-debuff-target", [
    preferAmong(
      "Put the expiring debuff where an attack can read it: a rested body you may attack, or a Blocker that may step in front of one.",
    ).effect((action, t) => {
      const { observation } = t;
      if (observation.turnPlayer !== observation.viewer) return false;
      if (observation.activeBattle) return false;
      const power = action.modifiesPower;
      if (!power || power.amount >= 0 || !power.expiresThisTurn) return false;
      const option = optionCard(action);
      if (option?.owner !== "opponent" || option.zone !== "board") return false;
      const target = observation.opponent.board.find(
        (card) => card.instanceId === option.card.instanceId,
      );
      if (!target) return false;
      return target.rested || target.blocker ? 1 : -1;
    }),
  ]);
}

/**
 * The same rule with the sign flipped: do not spend a [Trigger] on a power
 * boost to your own side when nothing is left to attack it.
 *
 * A [Trigger] such as OP17-019 gives its own Leader +1000 until end of turn.
 * Flipped on the last attack of the turn it defends nothing and expires, while
 * declining puts the card in hand -- which at 0 Life is the difference between a
 * Counter next turn and none.
 *
 * `dead-trigger` above cannot see it. That rule is about a debuff aimed across
 * the table and reads `triggerIsDeadWeightDebuff`; this one is about a boost on
 * the resolver's own cards, which the engine reports on the offer as
 * `selfPowerForTheTurn` (see `legal-actions/trigger.ts`).
 *
 * ## Why the gate is not `incomingLeaderAttacks === 0`
 *
 * `dead-trigger`'s gate is the count of *threats*, which excludes an attacker
 * weaker than the defending Leader. That is the right reading for a rule that
 * decides whether to spend defence, and the wrong one here: a boost can also
 * save a Character from an attack aimed at it, and a small attacker is exactly
 * the one a +1000 turns away. `opponentCanStillAttack` asks the pessimistic
 * question instead -- can anything on that side declare an attack at all --
 * so every doubt leaves the Trigger alone.
 *
 * ## The dominance argument, and the one thing that could break it
 *
 * Power that expires at the end of the opponent's turn is read by exactly one
 * thing once no attack can be declared: an effect selecting on *current*
 * power. Only two selectors in the pool do so against the opposing board from a
 * card in a shipped deck -- ST21-017, which is itself a [Trigger] and so fires
 * on the other seat, and OP15-114 Wyper at `maxCurrentPower: 0`, whose
 * selector is Characters only. Every self-boost [Trigger] reachable in a
 * shipped deck aims at the Leader (OP17-019 by its selector, OP12-039 by the
 * pilot's choice), which Wyper cannot name. `maxPower` reads *printed* power
 * and is untouched by a modifier. So the boost is worth exactly zero here and
 * the card in hand is worth at least zero, which is `free-block`'s argument
 * and `dead-trigger`'s.
 *
 * It ships on that dominance argument rather than on a win, as `inert-trigger`
 * and `free-block` do: what it saves is one card in hand, which a mirror match
 * hands to both seats equally.
 */
export function createDeadBuffTriggerModule(): PolicyModule {
  return heuristics("dead-buff-trigger", [
    never(
      "This Trigger is only a power boost that expires with this turn and nothing can attack again, so the card is worth more in hand.",
    )
      .when((t) => !opponentCanStillAttack(t.observation))
      .trigger((action) => {
        // Vetoing `skip` would leave the decision with no surviving action;
        // it is also the option this rule steers towards.
        if (action.optionId === "skip") return false;
        return action.selfPowerForTheTurn === true;
      }),
  ]);
}

/*
 * `dead-main-event` stood here, and `inert-activation` replaced it.
 *
 * "Would this Event resolve for nothing" is asked of the engine's own selectors
 * rather than of the printed English, so it cannot drift from the text: it *is*
 * the text as the engine compiled it. See `createInertActivationModule` for the
 * `[Main]` half and `mechanics.ts` `programSelectsNothing` for what the engine
 * reports.
 */

/**
 * The same rule one zone over: do not activate a [Trigger] that resolves nothing.
 *
 * OP14-110 Dr. Hogback's Trigger plays a {Thriller Bark Pirates} Character of
 * cost 4 or less from the trash. Activated over a trash holding no such body it
 * selects nothing: Hogback goes to the trash instead of to hand, and the reveal
 * that activation performs tells the opponent for free which card the Life slot
 * was holding.
 *
 * `dead-trigger` above cannot see it: `isDeadWeightDebuff` bails on any text
 * containing "play", and rightly so -- a Trigger that plays something is doing
 * durable work whenever it can find a body. The question is whether it can, and
 * that is the one `selectsNothing` answers, off the compiled program rather than
 * the printed English.
 *
 * The same shape reaches a second card: OP06-038, flipped with no rested body in
 * range. The word "K.O." is what makes `dead-trigger` decline it, and the card
 * is a [Counter] Event worth +2000 -- the same loss OP04-016 takes one clause
 * type over.
 *
 * The dominance argument is stronger here than for `inert-activation`. An inert
 * `[Main]` activation wastes a card and the DON!! it cost; an inert Trigger
 * wastes the card *and* pays the reveal, while `skip` puts the same card in hand
 * face-down. There is no board state in which activating is worth more, with one
 * exception the engine deliberately leaves available: a "when a [Trigger]
 * activates" clause (OP13-106 Conney) reads the activation itself. Twenty-eight
 * cards in the pool print such a clause and not one of them appears in any
 * selectable deck, so the veto is free as registered; a deck that adds one wants
 * a narrower rule of its own, which is the trade `dead-trigger` makes too.
 *
 * Expect a mirror A/B to read as a wash even though the rule fires in about half
 * the games it is offered and changes the line every time: what it saves is one
 * Counter card, in a mirror where both seats are equally starved. It ships on
 * the dominance argument, as `free-block` does.
 */
export function createInertTriggerModule(): PolicyModule {
  return heuristics("inert-trigger", [
    never(
      "This Trigger would select nothing, so activating it trashes the card and reveals it for no effect; declining keeps it in hand.",
    ).trigger((action) => {
      // `skip` is the option this rule steers *towards*, and vetoing it would
      // leave the decision with no surviving action at all.
      if (action.optionId === "skip") return false;
      return action.selectsNothing === true;
    }),
  ]);
}

/**
 * Keywords whose value is entirely in declaring an attack.
 *
 * The same pair `chooseKeywordGrantTarget` in `generic-policy.ts` reads, and
 * for the same reason: a card that cannot attack this turn reads none of them,
 * so a grant that expires with the turn is spent for nothing. [Blocker] is
 * deliberately absent -- it is read on the *opponent's* turn.
 */
const ATTACK_ONLY_GRANTS = new Set(["Unblockable", "Double Attack"]);

/**
 * Do not pay for an attack-only keyword on a turn that cannot attack with it.
 *
 * `chooseKeywordGrantTarget` already knows [Unblockable] and [Double Attack] are
 * read by an attack, and uses it to pick *which* card takes a grant. That is one
 * step too late for the decision this makes: by the time it is asked, the Event
 * has been cast, the DON!! is rested and the card is out of hand. The question
 * it never gets to ask is whether to pay for the grant at all.
 *
 * From a real game, `traces/` export 37: OP-17 Xebec cast OP17-055 on **turn 1
 * as the starting player** and handed its Leader [Unblockable] -- a turn the
 * rules do not allow an attack on, against an empty board -- resting the deck's
 * only DON!! and spending one of the two Events that are its whole Counter
 * supply. `chooseGenericRules` fires the first `activate-main` it is offered.
 *
 * Two ways the grant is dead, and turn 1 is both at once:
 *
 *  - **Nothing can attack.** The grant expires at end of turn, so a keyword read
 *    only by an attack is worth nothing on a turn with no attack to read it.
 *    True of both keywords, and the half that catches the first player's first
 *    turn.
 *  - **Nothing can block.** [Unblockable] is read only in the Block step, so
 *    with no opposing Blocker able to rest -- not already rested, not held by a
 *    `cannotRest` clause -- the attack goes through identically without it.
 *    [Double Attack] is not in this half: it takes a second Life card whether or
 *    not anything could have blocked.
 *
 * Format-wide, because none of it is about a deck: the engine resolves printed
 * text the same way whoever holds the card. Both halves are tested, because a
 * rule that reads only the Blocker half goes on casting the Event on turns
 * that have no attack to make.
 *
 * It reads {@link LegalAction} `grants` on the activation, which the engine sets
 * only for a program whose entire effect is the grant. The five cards in the
 * pool that bundle a grant with a draw or a pump are therefore never touched:
 * those are worth casting for the rest of the card, and deciding *that* is a
 * per-card judgement rather than a rule.
 */
export function createDeadKeywordGrantModule(): PolicyModule {
  return heuristics("dead-keyword-grant", [
    never(
      "This keyword is read by an attack and expires at end of turn, and no attack this turn can read it.",
    )
      .when((t) => t.observation.phase === "main")
      .activate((action, t) => {
        const grants = action.grants;
        if (!grants?.expiresThisTurn) return false;
        if (!ATTACK_ONLY_GRANTS.has(grants.keyword)) return false;
        const canAttack = t.actions.some(
          (candidate) => candidate.type === "attack",
        );
        if (!canAttack) return true;
        if (grants.keyword !== "Unblockable") return false;
        return !t.observation.opponent.board.some(
          (card) =>
            card.blocker &&
            !card.rested &&
            (card.cannotRestUntilTurn ?? -1) < t.observation.turn,
        );
      }),
  ]);
}

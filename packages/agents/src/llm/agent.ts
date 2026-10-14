import type {
  CardFacts,
  GameObservation,
  LegalAction,
} from "@one-piece-sim/protocol";
import type { Plan } from "@one-piece-sim/engine-core";
import type { Agent } from "../rules/local.js";
import { leaderHitDamage } from "../rules/combat.js";
import type {
  LlmChatClient,
  LlmChatMessage,
  LlmChatResponse,
  ReasoningEffort,
} from "./clients/types.js";
import { formatDeckDossierContext } from "./dossiers/prompt.js";
import {
  renderDecisionRequest,
  type PreviousDecision,
  type RenderedRequest,
} from "./render.js";
import {
  expandFollowUps,
  followUpSequence,
  type FollowUpOffer,
} from "./follow-ups.js";
import { escapeXml, promptRecord, type PromptRecord } from "./prompt-record.js";
import { attacksCharactersOnly } from "./attackers.js";

/**
 * The instructions every decision is asked against.
 *
 * ## What prose in this prompt cannot fix
 *
 * Two gaps in the model's play are well documented and *not* addressed by a
 * bullet here, because adding one does not move the answer:
 *
 *  - **`[DON!! xN]` completion.** A DON!! that completes a `[DON!! xN]`
 *    clause is not 1000 power, it is the ability -- and a clause reading "all
 *    of your Characters" turns one DON!! into +1000 on every unit. The model
 *    is measurably worse at this than a human. The rules agent's half of the
 *    same finding did ship, as `aura-attachment` in `format-heuristics.ts`,
 *    where a veto can express it.
 *  - **Removal versus a body.** The model prefers spending a turn's DON!! on
 *    removal over spending it on a Character, and prices the choice by what
 *    the removal answers rather than by what each line leaves standing. It
 *    held OP17-119 Loki -- cost 6, a body at 18 cost and 8000 power whose own
 *    [On Play] is removal, and the first giant its dossier names -- on seven
 *    of the nine turns it could have cast it, where the human cast it the one
 *    turn it was affordable and won every recorded game.
 *
 * In both cases the deck's own dossier already states the claim in as many
 * words, so the prompt would be the second place it had been said.
 *
 * ## Where the bias actually lives
 *
 * `--recorded-context` re-asks a position with the conversation the trace
 * recorded instead of a fresh one, which separates "the prompt never says
 * this" from "the conversation had already decided it". The same model, the
 * same prompt and the same board is markedly more likely to develop from a
 * fresh context than from the conversation it actually held. That is evidence
 * about where the bias lives rather than an effect size, and it is the only
 * thing in this area that has moved anything.
 *
 * That is why prose does not work: the system prompt is one message of eighty-
 * eight by turn 9, and it competes with a line the conversation has already
 * committed to. Note what it does *not* license, because the cheap versions are
 * all already closed:
 *
 *  - **Resetting per turn** throws away the turn plan the instructions ask for;
 *    see the `responseSequence` comment in `chooseAction`.
 *  - **Compacting more often** resets the provider's reusable prefix, which is
 *    why `COMPACT_THRESHOLD` in `clients/openai.ts` is deliberately near the
 *    price cliff rather than low.
 *  - **More card text** costs a large payload increase for no behaviour
 *    change; see the note above `actionRequest`.
 *
 * What is left is a design rather than a tweak: one conversation, but a decision
 * message that carries the seat's own committed plan explicitly -- `#mainPlan` is
 * already tracked -- so the plan survives without the exchanges that anchored it.
 * That is measurable the ordinary way, with a `pnpm matchup:llm` series.
 */
const systemPrompt = `# Identity

You choose actions for a deterministic One Piece Card Game engine.
You receive only information legally visible to your player, plus exact legal actions.
Choose exactly one listed action. Never invent an action or action ID.
Each request is self-contained: it carries the complete current state and the complete legal actions, and there is no conversation to read back through. Printed card text lives in two places. Match Context below lists your own deck in full and the opponent's common key cards; unlistedCardFacts in the request carries the text of any visible card that those lists do not cover, which is how a card outside the scouted list reaches you. Between them every card named in the state has its text available, so look there rather than recalling an earlier message -- there is none.

# Instructions

## Rules Reference

### Game and Turn Flow

- Players alternate turns until a Leader takes damage while it has 0 Life or a player has 0 cards in their deck. An attack wins the game exactly when it is a successful attack against a Leader that already has 0 Life. A turn, not a shared round, is the unit of play.
- During setup, each player draws 5 cards and may return the entire hand, shuffle, and redraw 5 cards once. Life is then placed from the deck according to the Leader's Life value.
- A turn proceeds through Refresh, Draw, DON!!, Main, and End Phases. Refresh returns given DON!! to the cost area and sets rested cards active; Draw draws 1 card; the DON!! Phase adds up to 2 DON!!; then the active player makes decisions in the Main Phase. The player going first skips the Draw Phase on turn 1 and adds only 1 DON!!; those exceptions apply to the first player only.
- Neither player can battle on their first turn (Comprehensive Rules 6-5-6-1): the player going first cannot attack on turn 1, and the player going second cannot attack on turn 2. The observation's "turn" field counts player-turns, so when you went second, turn 2 is your first turn. The engine enforces this by listing no attack actions on turns 1 and 2 at all -- no amount of power, DON!!, or Rush can create one -- so on your first turn, develop your board and end the turn; do not hunt for an attack that is not there.
- During the Main Phase, the active player may play cards, give active DON!!, activate Main effects, attack with eligible active Leaders or Characters, or end the turn in any legal order.
- A player may control at most 5 Characters and 1 Stage. Playing a Character into a full Character area, by cost or by any effect, first trashes one of your own Characters, chosen by you; playing a Stage replaces the current one. A trash caused by this limit is not a K.O., so On K.O. effects do not trigger. Count the limit before committing to a play or a recursion effect: the replacement is part of the price.
- The DON!! deck is finite: 10 cards unless a Leader prints otherwise, and the observation reports what remains. Once it is empty the DON!! Phase and DON!! effects add nothing, so a plan that assumes more DON!! later must check that the cards for it still exist.
- Playing a card pays its DON!! cost, then its effects and any resulting choices resolve before the Main Phase continues. One effect may enable another action that is not legal yet, so follow card text through the complete resulting chain instead of considering only the currently listed actions.
- Each DON!! given to a Leader or Character gives it +1000 power and counts toward [DON!! xN] conditions. The +1000 applies during your own turn only (Comprehensive Rules 6-5-5-2), so it never defends: a card you gave DON!! to is back to its own power while your opponent attacks it. The DON!! card itself is a separate matter -- it stays under the card until your next Refresh (6-2-3), which means it still counts toward [DON!! xN] on the opponent's turn and still cannot be spent there. So a DON!! given once your attacks are done buys nothing at all, and costs you the active DON!! a [Counter] Event would have been cast with. Manually giving DON!! uses active DON!!; effects may instead give rested DON!!. Once given, a DON!! card is neither active nor rested, and it is still yours: it leaves the cost area but not your side, so a card in hand is not uncastable merely because the cost area is smaller than its cost. Each state block states that sum for you as \`DON!! next turn\`, with its addends beside it -- the cost area, the given DON!! coming back at that seat's Refresh, and what the DON!! deck will add -- and it is the figure to read when asking what a seat can pay for next turn, on either side of the table. What a given DON!! does not do is bank anything past that Refresh, so it buys nothing for the turn after next. Conditions and continuous abilities are reevaluated after every action.
- A Character normally cannot attack on the turn it is played. If it gains Rush later that turn, it becomes eligible to attack. Restanding an attacker may create another attack unless an effect restricts it.
- Life is an ordered face-down stack, not a counter. Effects move cards into it from a deck, a hand, or the field, take cards out of it to a hand or the trash, and turn cards in it face-up; a face-up Life card is public to both players. Placement is on top unless the text says otherwise, and a card added to Life raises the number of attacks the Leader can survive.
- An attack proceeds through Attack, Block, Counter, Damage, and End of Battle steps. The attacker rests and targets the opposing Leader or a rested Character. The defender may redirect with one Blocker, then use Character Counters and Counter Events. If attacking power is at least defending power, the attacker wins the battle. Leader damage takes the top Life card; damage while at 0 Life loses the game.
- An attack that cannot reach the target's current power simply fails, and failing costs the defender NOTHING. No Life is taken, no Character is K.O.'d, no card leaves their hand, and they are under no obligation to Block or Counter -- they just decline and the battle ends. Such an attack is not pressure, does not "force a counter", and does not tax the hand; the only thing it changes is that your attacker is now rested. An attack action whose counterShortfall is 0 is exactly this case: do not declare it unless you first raise its power above the target.
- Declaring an attack rests the attacker for the rest of the turn, and a rested card cannot block. Attacking with a Blocker therefore trades away your defence on the opponent's next turn, which is worth it when the attack connects and never worth it when counterShortfall is 0. Before declaring, count the Blockers that would still be active when the turn passes -- at 1 or 2 Life, one active Blocker is often the difference between surviving the next turn and losing. Holding a Blocker back only buys that difference when the blocks you keep actually change the outcome: compare the attacks the opponent can declare next turn against your Life plus the Blockers you would retain. One Blocker held against four incoming attacks absorbs one of them and still loses, so it is worth more as an attacker; a Blocker held against one or two incoming attacks can be the whole defence.
- An attack's power is captured when the attack is declared and never rises afterward. DON!! given to the attacker, Main activations, and effects resolved after the declaration do not join that battle, and the attacker is now rested, so it gets no second attack this turn. Every power-raising action must therefore happen BEFORE the declaration: give the DON!!, resolve the Leader, Stage, and Character activations, then declare. A Leader that attacks before its own turn's DON!! is spent has thrown that DON!! away.
- Each attack action states the arithmetic it would freeze: attackPower, targetPower, effectiveTargetPower, counterShortfall (the Counter power the defender must add to survive, 0 when the attack already fails outright and achieves nothing), attackerIsBlocker (true when declaring rests one of your Blockers), attackerIsLeader (true when the attacker is your Leader), and unspentActiveDon (active DON!! you would be leaving behind). Read those before declaring. Declare attacks in increasing order of power so the defender's once-per-turn defensive abilities are spent on the small attacks, and keep the largest attacker for last -- never the reverse.
- attackerIsLeader flips the usual "a failing attack still rests the attacker for nothing" caution: a Leader can never block and is a legal attack target whether rested or active, so declaring with it gives up nothing that mattered. Do not fold a Leader attack into the "drop attacks that cannot exceed effectiveTargetPower" rule below -- that rule exists to stop you spending a Character (a real asset) to bait a card that will not pay off; a Leader is not that asset, so swing it even when it cannot beat effectiveTargetPower, since the worst case is identical to not attacking and the best case is a free card from the defender or a caught misplay.
- effectiveTargetPower, not targetPower, is the number an attack has to beat. targetPower and counterShortfall describe the board as it stands; effectiveTargetPower adds the defensive ability the defender still holds and has not paid for. When the two differ, plan against effectiveTargetPower: an attack whose power does not exceed it is a failing attack that the defender turns away for one card or for free.
- Ordering only baits a defensive ability that lasts for one battle. An ability that raises power "during this turn" cannot be baited: once it is paid the target defends at the boosted number against every remaining attack that turn, so spending it costs the defender one card and costs you the attacker you spent baiting it. Against those, drop every Character attack that cannot exceed effectiveTargetPower and order only the attacks that survive that filter, rather than leading with a small attacker to draw the ability out -- but keep the Leader attack even when it cannot exceed effectiveTargetPower (see attackerIsLeader above), since it is not the attacker being spent to bait the ability, it is a free swing.
- In the End Phase, end-of-turn effects resolve, effects lasting for the turn expire, and play passes to the other player.

### Glossary

- activePlayer/turnPlayer: \`activePlayer\` is whose decision the engine is waiting on -- you, whenever you are asked. \`turnPlayer\` is whose turn it is, and it does not move when a Block step, a Counter step or one of your own reactions hands you a decision on the opponent's turn. Read \`turnPlayer\` for anything turn-scoped: whether given DON!! is adding power, whether a [Your Turn] layer is on, and whether a Character of yours can still attack at all. A "during this turn" debuff put on a Character that cannot act this turn does nothing.
- active/rested: Active cards can attack, block, or pay costs when permitted. Resting turns a card sideways and usually spends that use; setting it active makes it usable again if no other restriction applies.
- play/activate: Playing a Character or Stage puts it on the field after paying its cost. Activating an Event or effect resolves its text. Complete mandatory text in order; "up to" and "may" choices can choose zero or be declined.
- give DON!!/DON!! minus: Giving places DON!! under a Leader or Character. DON!! minus returns the stated number of DON!! from the field to the DON!! deck as a cost; you choose which DON!! go back, and the legal actions list one option per pool -- active, rested, or DON!! already given to a specific card. Returning a given DON!! takes 1000 power off that card at once, and off an attack it is already committed to. Resting DON!! pays costs but does not give it to a card.
- base/current values: Base power and base cost are printed values before temporary changes. Current power includes given DON!! and modifiers; current cost includes cost modifiers. Apply the value named by the effect. On a Character in the observation, "cost" is the printed number and "currentCost" is the one on the field: a clause reading "a Character with a cost of N or more" is measured against currentCost, and for some cards the two differ by twelve. Read currentCost on both boards -- a clause saying "if there is a Character with ..." counts the opponent's Characters too, while "if you have" counts only yours.
- On Play/When Attacking/On K.O.: On Play resolves after the card enters play; When Attacking triggers when the attack is declared; On K.O. triggers when the Character is K.O.'d. Timing effects resolve before play continues.
- Activate: Main/Main: An effect the active player may use during their Main Phase when its conditions and costs can be met. Once Per Turn can resolve only once for that card each turn.
- Your Turn/Opponent's Turn/End of Turn: These effects apply only in the named window and expire or trigger at the stated timing.
- Rush: A Character may attack on the turn it was played. Rush: Character allows that immediate attack only against Characters.
- Double Attack/Banish: Double Attack deals 2 Life damage instead of 1 when it damages a Leader -- one attack, two points of damage dealt in sequence, not two attacks, and the card may still attack only once per turn. Because the second point lands after the first, a hit from a [Double Attack] attacker on a Leader at 1 Life wins the game. Banish trashes a Life card instead of adding it to hand, and that card's Trigger cannot activate.
- Blocker/Unblockable: An active Blocker may rest during the Block Step to become the attack target. An Unblockable attack cannot be redirected this way.
- Counter/Counter Event: During the Counter Step, Character cards may be discarded for their printed Counter power and Counter Events may be activated by paying their costs. Counter power lasts for that battle.
- Trigger: When a Life card with Trigger is taken as damage, its owner may reveal and activate the Trigger instead of adding that card to hand. A Trigger applies only to a Life card taken as damage: a Life card moved to a hand, to the trash, or turned face-up by an effect never activates one. A Trigger is not automatically beneficial; evaluate its timing and targets. Printed Trigger text is not proof the engine will offer it -- treat the listed legal actions as the authority on what a revealed Trigger can do, and do not plan around a Trigger that the engine does not present.
- K.O./trash/remove: Battle or effects may K.O. a Character and send it to trash. Trashing a card is not necessarily a K.O.; returning a card to hand, deck, or Life is removal but not a K.O. unless text says otherwise.

## Decision Process

### Race Arithmetic

- You win by taking the opponent's Life, not by trading efficiently. The SITUATION section carries the standing numbers -- \`opponentLife\`, \`ownLife\`, \`counterPowerInHand\`, \`opponentAttackersNextTurn\`, \`blockersYouHold\`, \`opponentBlockersActive\` -- and your own attacks are deliberately NOT among them. How many of your attacks reach the opposing Leader is not a figure to be handed to you and trusted; it is the AVAILABLE ACTIONS list, which is the engine's own answer and cannot be wrong. Count it there at the first decision of each Main Phase, before planning anything else, and answer to that count in every later choice in the turn. Every attack you may declare is listed, one line per attacker-and-target pair, each stating the power it would freeze and the Counter power the defender would have to find; the attacks that can take Life are exactly the ones whose target is the opposing Leader. Three things that count will not survive being taken carelessly: one attacker appears once per legal target and can still be spent only once, so count attackers, not lines; a body played this turn with [Rush: Character] is offered against Characters and never against a Leader, which its board line states outright; and an attack the defender can blank with the Counter power in their hand is not a Life card, so read each line's requirement against their hand size before counting it. \`opponentAttackersNextTurn\` counts bodies and cannot know what their DON!! will deploy, so it is a floor, and it is stated in bodies rather than Life because a keyword their side gains only on their own turn is switched off while you are looking. Those figures describe your own turn, so a decision that reaches you on the opponent's turn -- a Block step, a Counter step, a [Trigger] -- serves the mirror instead: \`incomingAttacksLeftThisTurn\` is the attacks they can still declare from the board as it stands, not counting the one resolving in front of you, \`incomingLifeDamageLeftThisTurn\` prices the ones that reach your Leader in Life, and \`yourAttackersNextTurn\` counts the bodies you will have when the turn passes to you. The two sets never appear together; read whichever the message carries, and never read an absent one as a zero.
- When your connecting attacks this turn plus the ones you can expect next turn reach the opponent's Life total, you are racing: point every attack at the Leader, spend Blockers as attackers, and prefer the line that maximises connecting attacks over the line that maximises board.
- When you cannot reach their Life before they reach yours, say so and play for board, cards, and survival instead. Attacking a Character is then the plan, not a consolation: it is worth an attack only when removing that Character changes how many attacks reach you, or removes the piece that is generating the opponent's advantage.
- "This is a survival turn" is a claim with an arithmetic behind it, so do the arithmetic before making it. Your answers to the coming turn are \`blockersYouHold\` -- one attack each, and only the ones still active when you pass -- plus the Counter cards in hand that can cover a whole shortfall; \`opponentAttackersNextTurn\` is what they have to answer, and the caveat beside it states the difference. Every attack past that difference lands, and \`ownLife\` is how many landings you have left. When the difference already exceeds your Life, defence does not save you next turn and will not save you the turn after either -- the only lines that change the result are the ones that shorten the game on their side of the table: remove their attackers, rest them, or take their Life while you still have turns to take it in. Name the specific attack each held-back card or body is going to answer; if you cannot name it, it is not defending anything.
- Holding a Blocker back is worth one attack per turn, no more. A second Blocker held back is a second attack, not a wall, and a body with no [Blocker] keyword answers nothing at all by staying active -- it is only harder to attack, which is worth an attack of your own only when the body itself is worth more than the Life or the Counter card that attack would have taken. Count answers as a number, never as a posture.
- An attack into a Character whose text rewards being K.O.'d gives the value straight back. Before targeting a Character, read its On K.O. text and the recursion available to its controller: a Character that replaces itself from the trash, locks one of your attackers, or triggers a Life effect when it dies is usually worth more to the opponent dead than alive. Bounce, bottom-deck, or simply leave it and attack the Leader.
- DON!! buys defence as well as offence, and unspent DON!! expires either way. Abilities that cost resting DON!! -- stopping a Character from attacking, forcing attacks onto one body, resting or debuffing an attacker -- are paid for on your turn and cash in on theirs, and their price is DON!! rather than cards. When \`opponentAttackersNextTurn\` and \`ownLife\` say the next turn is the dangerous one, the last DON!! is better spent switching off their biggest attacker than adding 1000 to a swing the defender can simply Counter. Budget the turn across both halves rather than pouring every DON!! into development and attack power by habit.
- Bodies played this turn mostly cannot attack this turn. Spending the last DON!! on a Character that arrives summoning-sick, while a Character already on the board sits one DON!! short of reaching the Leader, buys a body and throws away an attack -- read \`donToReach\` against \`unspentActiveDon\` on every attack that currently fails before committing DON!! to a play.
- An ability your side holds is not always in AVAILABLE ACTIONS. An \`[Activate: Main]\` whose condition is unmet is not offered at all -- taking it would resolve nothing -- so the card's own line states it instead: \`[Activate: Main] not available right now: needs ...\`, naming the exact thing it wants. Read such a line as a lever rather than a limit: a gate on DON!! attached to that card, on given DON!! anywhere on your field, or on a Character you can still play is frequently something this same Main Phase can satisfy, and satisfying it puts a new action in the list -- so plan the order, because the enabling action has to come first. A keyword works the same way: \`keywords: none\` on a card whose line says its own text can switch on [Rush] or [Blocker] means the keyword is a condition away rather than absent, and a body played this turn can still attack once that condition is met.
- Being behind on Life does not by itself mean playing defence. Holding cards and Blockers while an opponent whose deck out-grinds yours accumulates board is the losing half of the race. If your remaining turns are few, spend the resources that only matter on turns you may not get.

### Lethal

- An attack is lethal only when damage lands on a Leader that already has 0 Life; that ends the game immediately. An ordinary attack that takes the opponent from 1 Life to 0 Life is NOT lethal: the opponent takes a Life card, survives at 0 Life, and still gets their next turn.
- Count damage, not hits. A successful hit normally takes 1 Life, and a successful hit from an attacker with [Double Attack] takes 2, dealt one after the other by that single attack. Each point checks a Life card, so a point with no Life card left to check does nothing: a [Double Attack] attacker reaches 0 Life from 2 and does NOT win from 1 -- it takes the one card there is and the opponent still gets their turn. Nothing wins except an attack declared while the opponent is already at 0 Life. Read \`effectiveKeywords\` on your Leader and on each of your Characters before counting: the keyword is often granted by a *different* card's text -- your own Leader can have it while its own card says nothing about it -- so the only reliable place to see it is that field.
- Before calling a line lethal, name the attacks it is made of -- one line each from AVAILABLE ACTIONS, all of them targeting the opposing Leader, no attacker used twice -- and add up the Life they take. Each Leader-attack line states its own stake -- how many of the defender's Life cards a hit takes, [Double Attack] included, or that the attack wins the game -- so read it off the line rather than recomputing it, and check that the sequence ends with the line that says it wins. Check it against their hand as well as their board: a lethal line needs every attack in it to survive the Counters they can pay, so spend DON!! raising the requirements they can still meet rather than the one they already cannot. If the last point of damage cannot land this turn, the line is not lethal and the opponent keeps playing. Where the count and the damage differ, order matters: lead with the attacks that drain Counters and finish with the [Double Attack] swing only if it still connects, or open with it while it is cheapest to defend -- but never leave it undeclared because a hit count said the turn was one attack short.
- When the opponent is at 0 Life, every attack that can exceed the Leader's effective defence wins the game. Point every remaining attack at the Leader. Before declaring them, check whether DON!!, Leader, Stage, or Character abilities can raise a currently-failing attacker into range, because attack power freezes at declaration -- pump first, then swing. Attacking a Character while the opponent sits at 0 Life throws the win away unless no attacker can reach the Leader at all.
- Mirror it when defending: while you are at 0 Life, every successful hit on your Leader loses the game, so each counter decision is win-or-lose, not chip damage. Above 0 Life no single hit is the game -- \`activeBattle.lifeCost\` states the Life the hit in front of you will actually take, capped at what you hold, so a 2 there costs two cards and a 1 costs one and neither ends it. What decides a Counter is whether the hits still to come this turn reach 0 Life and leave one more attack over. And an opponent left at 0 Life is not dead: they still get a turn, so leaving them at 0 only wins if you have the follow-up hit this turn, or they cannot kill you first.

### Planning Loop

1. At your FIRST action of each of your own turns, think the whole turn through before acting and write it out in the \`turnPlan\` field: the intended development and effect chain, the DON!! budget, every attack the turn can create, the order to declare them in, and the resources expected to remain. One step per action you intend to take, each a short imperative naming the request's own labels -- "attach 2 DON!! to board-1", "attack op-leader with board-3", "end turn". The request says outright, under YOUR PLAN FOR THIS TURN, when it is your first action of a turn.
2. Compare complete candidate lines, not only the immediate legal actions. Account for actions that become legal only after playing a card, resolving an effect, satisfying a condition, granting Rush, or setting a card active.
3. That plan is read back to you under YOUR PLAN FOR THIS TURN at every later decision of the turn, beside the actions you have actually taken. Continue it or revise it, and say which: continue by taking the first step still outstanding and returning the outstanding steps in \`turnPlan\` with the finished ones dropped; revise by returning the whole new plan and naming in \`reasoning\` what changed. A revision has to be earned by something that changed since you wrote the plan -- a Trigger, a Block, a Counter, a K.O., a card drawn or revealed, an opponent's choice, a power figure that moved. Re-reading the same board is not a change, and re-deciding the frame of the turn on it is how a won turn is lost: a recorded game called "race for lethal", declared the first attack of the race, then at the very next decision recast the same board as a survival turn, spent the attacker the race needed on a Character, and finished one Leader hit short. A plan also binds only the steps it names, and most decisions of a turn are not steps: an optional effect that fires off a step, a cost a step asked for, a card chosen inside a step. Continuing the plan is not an argument about any of those -- decide them on the board, and never write "continue the plan" as the reason for one. A recorded game declined OP09-062 Nico Robin's ramp, its deck's whole ramp, on the stated grounds of continuing a two-step plan that said only "attack" and "end turn". On the opponent's turn there is no plan of yours to keep, and no plan section: return \`turnPlan\` empty there.
4. Attack last. Before declaring any attack, spend the DON!! and resolve the activations that raise it, and confirm no development can add an attacker, rest a target, or preserve an effect. An attack declared with active DON!! still in the cost area, or before a Leader, Stage, or Character ability that could have fed the attacker, has permanently wasted the difference: check the attack action's attackPower, counterShortfall, and unspentActiveDon against what they would be after the rest of your plan. Discard every attack whose counterShortfall is 0 -- it cannot reach the target, so it gains nothing and only rests your attacker. Before ending the turn, audit all active DON!!, eligible attackers, Main effects, and useful legal actions.
5. Do not end the turn while a useful legal action remains unless preserving the card has greater future value. Active DON!! cannot be preserved for the next turn: left in the cost area it expires unused at your Refresh, while the same DON!! given to your Leader or a Character is +1000 defending against every attack the opponent is about to declare. A last DON!! with no attack left to raise is therefore still worth giving, and the Leader is the usual target -- it cannot be attacked around, and giving to it costs nothing that resting a Blocker would. A pass action reports unspentActiveDon, availablePlayCount, availableActivationCount, and eligibleAttackCount; audit all four before ending the turn and never describe expiring DON!! as being banked for later.

### Defending

- Counter arithmetic. Compare Counter power against the *shortfall*, never against the attack. The target already defends with its own current power, so the Counter power needed is attackPower - (targetPower + counterPower) + 1, which the request states directly as counterShortfall under THE ATTACK IN FRONT OF YOU. A 9000 attack on your 5000 Leader needs 4001, not 9000.
- Counters add up, and each action says whether the rest of the hand closes the gap. A Counter that reads "still hit; N more Counter power from other cards in hand stops it" is one half of a defense that works; only "the hand cannot reach it" means the attack cannot be answered.
- All or nothing. Counter power that falls short of the shortfall buys nothing at all: the attack lands exactly as it would have and the cards are gone anyway. Decide whether the whole shortfall is worth paying before spending the first card, and if it is not, pass and keep every card. Reaching 8000 against an 8000 attack is falling short -- the attacker wins ties, which is why the shortfall ends in 1.
- A Counter costs the card, not the 1000. Compare what the card does in the Counter step against what it does for the rest of the game: a Character you were going to play is a permanent body, a blocker for every future turn, and an attacker, and spending it as a Counter buys its printed Counter value once. Cards printed at 1000 Counter on an expensive body are the worst version of that trade -- they are bodies whose Counter half exists for emergencies. Cheap bodies printed at 1000-2000 Counter, and Events with a Counter half, are the cards the defence is meant to be made of. Spend those first and check what is left in hand before reaching for a card the board wants.
- Declining is a trade too, and the cheap save is usually the good one. Passing on a Counter keeps the card and spends the target: a Character K.O.'d is a body, a blocker, and an attacker gone for the rest of the game, and its shortfall is often 1000 or 2000 because Characters defend with their own power. Compare that shortfall against what the same cards would stop later -- one Life -- rather than treating "conserve Counters for the Leader" as automatic. A hand held to the end of the game bought nothing; check \`counterPowerInHand\` before deciding you cannot afford to save the board, and remember that Counter power sitting on counterless bodies is not Counter power at all.
- Life is a resource with a floor. Trading a card to save a Life is usually bad early and usually right late. Reaching 0 Life is not survival: your board and Life do not refresh, the opponent's attackers all do, and the next Leader hit ends the game. Do not take a Leader hit that leaves you at 0 Life while you hold a line that stops it, and count the whole hand before deciding you do not.
- Count what the attacker can still do this turn, not only what is on the board. \`incomingAttacksLeftThisTurn\` and \`incomingLifeDamageLeftThisTurn\` are that count and its price in Life for the board as it stands, and they are floors: unspent DON!! can deploy a Rush Character or grow an attacker after you decline. An opponent with DON!! to spare still has attacks left even when every Character they control is rested. Weigh a card spent now against the Life those remaining attacks will take -- and against \`yourAttackersNextTurn\`, which is what surviving this turn buys you.
- Blocking is not free but it is often cheap. A Blocker whose power exceeds the attack stops it and survives, and it refreshes on your turn, so the only real cost is that it cannot block again this turn. Prefer it to spending cards when the numbers work.

## Output Contract

For a normal decision, return exactly one action ID. To give DON!! in one step, list one attach-don action ID per DON!! you want to give, in the order you want them given -- repeat an ID to give that target several DON!!, and name different IDs to spread them across several targets. Both shapes are one plan: naming the same ID three times puts three DON!! on one body, and naming one ID once then another twice puts one DON!! on the first target and two on the second; this is the only case where repeating an ID is correct. Spreading is usually the stronger half of the choice and the one that is easy to miss: DON!! poured into an attack the defender already cannot answer buys nothing, while the same DON!! split across two attackers can put both of them out of Counter range. When you are giving DON!! in order to swing, name the attack in the same response: list the attach-don IDs and then the attack action ID last, and the attack is declared for you once the DON!! are on. The attack must be the last ID, because attack power freezes at declaration and DON!! given afterwards cannot raise it. Plan the whole sequence against the board in front of you: if the DON!! change what you would attack, the plan is dropped and the decision comes back to you. When the legal actions are Counter cards, Counter Events, and pass-counter, decide the entire defense now: return zero or more hand-counter action IDs in commitment order, followed by the pass-counter action ID. A Counter Event must be the only action because it can create new choices; the Counter step then comes back to you, so spending an Event that does not stop the attack by itself commits you to finishing that defense on the next decision. If you would not pay the rest, do not spend the Event. Effect choices that occur during the Counter phase are normal single-action decisions. Do not return duplicate cards.
Some actions are followed immediately by your own effect choices, and followUps lists them for every action that has one: its "then" field holds the ordered steps, each with the exact option IDs it will offer. Answer such an action and its effect choices in one response by returning that action ID followed by one option ID per step, in step order; the steps are taken for you as they arrive. Decide the whole chain against the board in front of you, and answer only the leading steps you are sure of -- whatever you leave unanswered is asked as a normal decision. A step marked conditional lists the options of every branch, so the one you name may be unavailable after your earlier picks; when that happens the sequence stops there and the decision comes back to you. An action with no followUps entry has no chain to fold: name it alone. Never name follow-up option IDs after a DON!! attachment plan -- attaching DON!! renumbers every later ID, so those steps are asked normally.
Every action id is copied verbatim from the AVAILABLE ACTIONS list, and is shaped "action-<n>" -- "action-3", never the wording of the line beside it and never an id that is not listed. Naming an action the list does not offer costs a correction round and nothing else is gained by it.
Think before you answer, every time: weigh the candidate lines against the board in front of you and choose out of that, rather than naming an action and justifying it afterwards. At the first decision of a Main Phase, think the full turn through first -- the plan step 1 of the Planning Loop asks for: whether the turn is spent on Life or on board, the DON!! budget, and the attacks it ends in, counted off the AVAILABLE ACTIONS list.
Then respond with JSON only in this exact shape: {"turnPlan":["<step>","..."],"reasoning":"<why>","actionIds":["action-<n>","..."]}. The three fields are written in that order because that is the order they are decided in: the plan is the turn, the reasoning is why this step of it is the one to take now, and the action IDs are the step. \`turnPlan\` holds the steps of this turn still to come, this action's own step first, and is empty on the opponent's turn; it replaces the plan you are holding, so returning it empty on your own turn while a plan is shown to you keeps that plan rather than clearing it -- to change a plan, send the changed one. Keep \`reasoning\` to one or two sentences: the line you chose, the candidate you rejected, and what decided between them. It is a record of the decision for whoever reads the match back, not a restatement of your whole thinking, and it must be written before the action IDs rather than after them.`;

function formatStableMatchContext(value: unknown): string {
  const dossier = promptRecord(value);
  const formattedDossier = dossier && formatDeckDossierContext(dossier);
  if (formattedDossier) return formattedDossier;
  return `# Match Context\n\n<stable_match_context>\n${escapeXml(JSON.stringify(value))}\n</stable_match_context>`;
}

function promptCacheKey(content: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < content.length; index += 1) {
    hash ^= content.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `open-optcg:decision:v1:${(hash >>> 0).toString(16)}`;
}

/**
 * The numbers the Race Arithmetic section asks for, computed rather than
 * requested.
 *
 * The prompt tells the model to state them at the first decision of each Main
 * Phase, and across a 64-decision LLM game not one answer did: two of them
 * are not in the snapshot at all. `counterPowerInHand` needs each hand
 * card's printed Counter, which `compactSnapshotCard` strips because
 * `cardFacts` already carries it -- cumulatively, across dozens of earlier
 * messages, which is not a place a total gets re-derived per decision.
 * `opponentAttackersNextTurn` needs refresh semantics applied to a board the
 * snapshot shows mid-turn. So the run held 10 counterless cards while its own
 * dossier warned "a large hand is not a safe board", and read every turn as a
 * race while sitting on less Life than the opponent.
 *
 * Every turn-relative number here is computed for the seat whose turn it is,
 * which is not always the viewer: a Block step, a Counter step and a [Trigger]
 * all ask the defender for a decision without the turn changing hands. Served
 * unchanged there, `opponentAttackersNextTurn` counted `turn + 1`, which on the
 * opponent's turn is the viewer's own turn, so it reported the viewer's own
 * offence as incoming pressure. It is replaced on a defensive decision by the
 * mirror the defender actually needs, rather than dropped, because the Life at
 * risk before this turn ends is the whole question a Counter step asks.
 *
 * A projection, not a promise: the "next turn" counts count the bodies that
 * will be able to declare, and cannot know what DON!! will deploy next turn --
 * the Defending section already says an opponent with DON!! to spare has
 * attacks beyond their board.
 *
 * ## Removed, not replaced: `attacksReachingLeaderNow` and its Life twin
 *
 * The offensive half of this brief used to count the attacks that reach the
 * opposing Leader, and the Life those attacks take. Both were derived from
 * power against power over the whole board, and a derived count is exactly the
 * wrong shape for this question: it has to re-decide, outside the engine, which
 * of a seat's bodies may attack a Leader at all. It got that wrong. A body
 * played with [Rush: Character] may attack Characters and not a Leader, and the
 * filter here asked only whether the body could attack *something* -- so a
 * recorded game was told `attacksReachingLeaderNow: 4` with three such attacks
 * on offer, planned "five Leader attacks" on the strength of it, and spent its
 * one un-Counterable swing on a Character.
 *
 * The engine already answers the question exactly, in the place the answer
 * cannot drift from legality: `legalActions` lists one attack per legal
 * attacker-target pair, and each one's summary states the arithmetic it would
 * freeze. Counting the offers whose target is the opposing Leader is both the
 * true number and a number the model can check, where a figure in this section
 * is one it has to take on trust -- and, as the four measured interventions
 * above show, a figure taken on trust is one it will follow off a cliff. So the
 * counts are gone, the board block says which bodies are barred from a Leader
 * (`attackAvailability`), the action list labels which body each offer spends
 * (`actionCardLabels`), and the Race Arithmetic section counts off the offers.
 */
/** Active [Blocker] bodies: each answers at most one attack per turn. */
function activeBlockers(board: GameObservation["self"]["board"]): number {
  return board.filter(
    (card) => !card.rested && card.effectiveKeywords.includes("Blocker"),
  ).length;
}

function turnBrief(observation: GameObservation): PromptRecord {
  const { self, opponent, turn, turnPlayer, viewer } = observation;
  const defending = turnPlayer !== viewer;
  // Neither player can battle on turns 1 and 2 (CR 6-5-6-1), and the engine
  // lists no attack action at all there, so every "now" count is zero however
  // the boards look.
  const battlesAllowed = turn > 2;
  const canAttackNow = (card: GameObservation["self"]["board"][number]) =>
    battlesAllowed &&
    !card.rested &&
    !card.summoningSick &&
    (card.cannotAttackUntilTurn ?? -1) < turn;
  // The bodies that will still be able to declare when the turn passes. The
  // Leader always gets to declare, so the count starts at 1; bodies held down
  // past that turn -- by an attack lock or by being kept from refreshing -- are
  // the ones that do not. Next turn belongs to whoever is not the turn player,
  // so this is always the non-turn seat's board.
  const attackersNextTurn = (board: GameObservation["self"]["board"]) =>
    1 +
    board.filter(
      (card) =>
        (card.cannotAttackUntilTurn ?? -1) < turn + 1 &&
        (card.cannotRefreshUntilTurn ?? -1) < turn + 1,
    ).length;
  const base = {
    ownLife: self.lifeCount,
    opponentLife: opponent.lifeCount,
    counterPowerInHand: self.hand.reduce((sum, card) => sum + card.counter, 0),
    counterCardsInHand: self.hand.filter((card) => card.counter > 0).length,
  };
  if (defending) {
    const ownLeaderDefence = self.leader.currentPower;
    // Attacks the turn player can still declare from the board as it stands.
    // Whatever is resolving right now is not among them: declaring rests the
    // attacker, so the attack in front of the defender has already left this
    // count and `activeBattle` is the authority on it.
    const incoming = opponent.board.filter(canAttackNow);
    const leaderAttack = battlesAllowed && !opponent.leader.rested;
    // Unlike the projection for a turn that has not started, this one runs on
    // the opponent's own turn, so their [Your Turn] layers are switched on and
    // their `currentPower` and `effectiveKeywords` are the real numbers. The
    // Life is therefore worth stating: it is what the rest of this turn costs
    // if every reaching attack connects unanswered. A body that may attack
    // Characters only this turn is still an attack the defender has to answer,
    // so it stays in `incoming` -- but it cannot take Life, so it is kept out
    // of the Life projection, the same reading the engine does when it decides
    // which attacks to offer. See `attacksCharactersOnly`.
    const reaching = incoming.filter(
      (card) =>
        card.currentPower >= ownLeaderDefence &&
        !attacksCharactersOnly(card, turn),
    );
    return {
      ...base,
      incomingAttacksLeftThisTurn: incoming.length + (leaderAttack ? 1 : 0),
      incomingLifeDamageLeftThisTurn:
        (leaderAttack && opponent.leader.currentPower >= ownLeaderDefence
          ? leaderHitDamage(opponent.leader)
          : 0) +
        reaching.reduce((total, card) => total + leaderHitDamage(card), 0),
      yourAttackersNextTurn: attackersNextTurn(self.board),
    };
  }
  return {
    ...base,
    opponentAttackersNextTurn: attackersNextTurn(opponent.board),
    // The other half of that comparison, and the half a recorded game got
    // wrong on every turn it mattered: how many of those attacks the seat can
    // answer without spending Life. A Blocker answers one attack per turn and
    // only while it stays active, so two Blockers facing five attackers are
    // three attacks short however the reasoning describes them. Stated as
    // bodies, next to the body count it exists to be read against.
    blockersYouHold: activeBlockers(self.board),
    // The same price on your own attacks: an opposing active Blocker turns one
    // connecting attack away, which is why the standard advice counts it as a
    // Life card the attacker has to get through first.
    opponentBlockersActive: activeBlockers(opponent.board),
  };
}

/**
 * Why the printed text of every card on the table is **not** re-sent in every
 * message.
 *
 * The motivation is real and is visible in any recorded game. `cardFacts` is
 * sent once and never repeated, on the reasoning that the conversation
 * replays its own history -- true of the transcript, and a retrieval problem
 * for the task. By turn 9 of a recorded game the request carried **88
 * messages and 338 KB**, and by turn 10 of another, 145 messages and 688 KB,
 * with the text of a Character sitting on the board having appeared once,
 * dozens of messages earlier. The opponent across the table does not have
 * that problem: they can see the card.
 *
 * Subtracting the durably-visible cards -- both Leaders, both boards, both
 * Stages, both trashes, the viewer's hand -- from `#sentCardFacts` before
 * building the request costs roughly **+45% payload** and moves no behaviour
 * at all. The card text is not what the model is missing, and a payload
 * increase that size needs a signal rather than the absence of one. Note what
 * a three-game behavioural probe cannot settle, though: a change this cheap
 * to re-apply deserves a `matchup:llm` series if anyone revisits it.
 *
 * What *did* come out of the same investigation is the `reset` fix below it: the
 * conversation and `#sentCardFacts` have to be cleared together, and they were
 * not, so a re-asked decision was sending a board with no card text at all.
 */

/**
 * The decision request: the whole position as Markdown, plus the action labels.
 *
 * Card text is deduped against the system prompt, which lists the seat's own
 * deck in full and the opponent's scouted key cards. Repeating that in a
 * message that is fresh on every call pays for it twice, once cached and once
 * not, so only the remainder goes out -- in practice the opponent's cards
 * outside the scouted list, learned by seeing them played. The dedupe reads
 * `matchContextCards` back out of the rendered prompt rather than assembling it
 * alongside, so the two cannot drift: a card whose text the prompt does not
 * carry is a card this sends, whether or not the prompt names it.
 */
function actionRequest(
  observation: GameObservation,
  recentPublicEvents: GameObservation["publicEvents"],
  previousDecision: PreviousDecision | undefined,
  matchContextCards: MatchContextCards,
  followUps: readonly FollowUpOffer[],
  turnPlan: readonly string[],
  correction?: string,
): RenderedRequest {
  const unlisted = Object.keys(observation.cardFacts).filter((cardNumber) => {
    if (matchContextCards.withText.has(cardNumber)) return false;
    if (!matchContextCards.named.has(cardNumber)) return true;
    // Named without its text. Send what the engine holds when that is more
    // than the prompt already shows -- stats it repeats are pure tokens, and
    // with no pack anywhere that would be every card in the game.
    const facts = observation.cardFacts[cardNumber]!;
    return Boolean(facts.effect || facts.trigger);
  });
  // Mutually exclusive: one is a Main Phase that can give DON!!, the other a
  // Counter step. Read once so the two halves of the answer shape agree.
  const donPlan = isDonPlanDecision(observation);
  const counterPlan = isCounterPlanDecision(observation);
  return renderDecisionRequest(
    observation,
    recentPublicEvents,
    previousDecision,
    Object.fromEntries(
      unlisted.map((cardNumber) => {
        // The derived `rules` block is the engine's reading of the text, not
        // something a model should reason from; the text itself is what it
        // needs, and it is present whenever the process holds a text pack.
        const facts: Partial<CardFacts> = {
          ...observation.cardFacts[cardNumber]!,
        };
        delete facts.rules;
        return [cardNumber, facts];
      }),
    ),
    followUps,
    turnBrief(observation) as unknown as Record<string, number>,
    {
      thinkFirst: donPlan
        ? "the whole turn: whether it is spent on Life or on board, the DON!! budget, and the attacks it ends in, counted off the attack actions offered below"
        : counterPlan
          ? "the whole defense, weighed against counterShortfall and against what the cards are worth kept"
          : "the candidate lines, before naming one",
      actionIds: donPlan
        ? `one action id; or one attach-don action id per DON!! to give -- repeated for one target, or different ids to spread them -- optionally followed by one attack action id to declare after them${followUpShape(followUps)}`
        : counterPlan
          ? "ordered hand-counter action ids followed by the pass-counter action id; or one counter-event action id"
          : `one action id${followUpShape(followUps)}`,
    },
    // Only on this seat's own Main Phase. A Block, Counter or [Trigger]
    // decision is one inside the opponent's turn, with no plan of this seat's
    // to continue; and a mulligan is not a turn to plan at all, though it is
    // the starting player's own.
    observation.turnPlayer === observation.viewer &&
      observation.phase === "main"
      ? turnPlan
      : undefined,
    correction,
  );
}

/** The sequence clause, present only when an action actually offers a chain. */
function followUpShape(followUps: readonly FollowUpOffer[]): string {
  return followUps.length > 0
    ? "; or a followUps[].actionId followed by one option actionId per step, in step order"
    : "";
}

/**
 * Whether this decision can carry a Main Phase plan.
 *
 * Only when giving DON!! is one of the offers: without an attach-don to repeat
 * there is no plan to make, and telling the model about a shape it cannot use
 * invites it to invent one.
 */
function isDonPlanDecision(observation: GameObservation): boolean {
  return (
    observation.phase === "main" &&
    observation.legalActions.some((action) => action.type === "attach-don")
  );
}

function isCounterPlanDecision(observation: GameObservation): boolean {
  return (
    observation.phase === "counter" &&
    observation.legalActions.every(
      (action) =>
        action.type === "counter" ||
        action.type === "activate-counter-event" ||
        action.type === "pass",
    )
  );
}

interface LlmDecision {
  actionIds: string[];
  /** What the model wrote before naming the actions. */
  reasoning?: string;
  /**
   * The seat's plan for the rest of its own turn, as it last stated it.
   *
   * Absent and empty mean the same thing here and are both kept out of the
   * decision: the plan already held is not cleared by an answer that says
   * nothing about it. Only a stated plan replaces a stated plan -- otherwise a
   * turn's frame would be dropped by the first answer that forgot to restate
   * it, which is the failure the field exists to prevent.
   */
  turnPlan?: string[];
}

function parseDecision(content: string): LlmDecision {
  const normalized = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(normalized);
  } catch {
    throw new Error("LLM_INVALID_ACTION_RESPONSE: expected JSON");
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("actionIds" in parsed) ||
    !Array.isArray(parsed.actionIds) ||
    parsed.actionIds.length === 0 ||
    !parsed.actionIds.every((actionId) => typeof actionId === "string")
  ) {
    throw new Error("LLM_INVALID_ACTION_RESPONSE: missing actionIds");
  }
  // Required by the schema, but read defensively: a conversation replayed from
  // a trace written while the answer carried no reasoning -- or carried it as
  // `rationale` -- still parses, with whatever words the model wrote.
  const written =
    readTrimmed(parsed, "reasoning") ?? readTrimmed(parsed, "rationale");
  const turnPlan = readSteps(parsed, "turnPlan");
  return {
    actionIds: parsed.actionIds,
    ...(written ? { reasoning: written } : {}),
    ...(turnPlan ? { turnPlan } : {}),
  };
}

/**
 * A list of plan steps from an answer, or nothing.
 *
 * Read as defensively as `reasoning` is, and for the same reason: a trace
 * recorded before the field existed, or a transport that does not enforce the
 * schema, still has to produce a usable decision. A step is trimmed and a blank
 * one dropped, so `["", ""]` is no plan rather than a two-step plan of nothing.
 */
function readSteps(parsed: object, key: string): string[] | undefined {
  const value = (parsed as Record<string, unknown>)[key];
  if (!Array.isArray(value)) return undefined;
  const steps = value
    .filter((step): step is string => typeof step === "string")
    .map((step) => step.trim())
    .filter(Boolean);
  return steps.length > 0 ? steps : undefined;
}

function readTrimmed(parsed: object, key: string): string | undefined {
  const value = (parsed as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * Match an action ID the model returned against the legal list.
 *
 * Exact match first. Failing that, one narrow repair: the separators. A run was
 * lost to `r77-pass-counter` where the legal ID was `r77:pass-counter` -- the
 * right decision, punctuated wrong. Comparing with every `:` and `-` flattened
 * recovers that without ever choosing between two different actions, because
 * the flattened forms are checked for uniqueness before one is accepted.
 */
function matchLegalAction(
  legalActions: readonly LegalAction[],
  actionId: string,
): LegalAction | undefined {
  const exact = legalActions.find(
    (candidate) => candidate.actionId === actionId,
  );
  if (exact) return exact;
  const flatten = (value: string) =>
    value.toLowerCase().replace(/[:\-_]+/g, "");
  const wanted = flatten(actionId);
  const matches = legalActions.filter(
    (candidate) => flatten(candidate.actionId) === wanted,
  );
  return matches.length === 1 ? matches[0] : undefined;
}

/** Identifies the battle a Counter plan was made for. */
function battleKey(observation: GameObservation): string | undefined {
  const battle = observation.activeBattle;
  return battle
    ? `${observation.turn}:${battle.attackerInstanceId}:${battle.targetInstanceId}:${battle.attackPower}`
    : undefined;
}

type CounterPlanStep =
  { type: "counter"; cardInstanceId: string } | { type: "pass" };

/**
 * A Main Phase step the model committed to before it was legal to take.
 *
 * `attach-don` only ever moves one DON!! per engine action, and every action ID
 * embeds the revision, so an ID changes after every step and a plan cannot be
 * written in IDs the way a Counter plan is. It is written in the pieces of the
 * action that survive a revision instead -- the instance IDs -- and matched
 * against whatever `legalActions` offers when the step comes round.
 *
 * The model gives DON!! by naming one attach-don ID per DON!! it wants to give
 * -- the same ID repeated to load one target, different IDs to spread them --
 * and may name one attack to follow them. That pairing is what makes the plan
 * worth having: pumping the attackers and swinging is one decision a pilot
 * makes, and it cost one model call per DON!! plus another for the attack.
 * Both are in `legalActions` when the plan is made -- an attack is declarable
 * from the Main Phase -- so nothing here is a guess about what the engine will
 * offer, only about whether it will still offer it.
 *
 * Spreading was rejected at first, on the theory that one target per plan was
 * the shape a pilot thinks in. It is not, and the restriction cost a game: with
 * three DON!!, a Rush Character already 5000 above what the defender's whole
 * hand could Counter, and two more attackers sitting one Counter point short of
 * connecting, the only plan the grammar could express was to pour all three
 * into the attack that was already unanswerable.
 */
type MainPlanStep =
  | { type: "attach-don"; targetInstanceId: string }
  | { type: "attack"; attackerInstanceId: string; targetInstanceId: string };

function counterPlan(
  observation: GameObservation,
  actionIds: readonly string[],
): { action: LegalAction; remaining: CounterPlanStep[] } {
  const actions = actionIds.map((actionId) => {
    const action = matchLegalAction(observation.legalActions, actionId);
    if (!action) throw new Error(`LLM_ILLEGAL_ACTION: ${actionId}`);
    return action;
  });
  const counterEvent = actions.find(
    (action) => action.type === "activate-counter-event",
  );
  if (counterEvent) {
    if (actions.length !== 1) {
      throw new Error("LLM_INVALID_COUNTER_PLAN: counter event must be alone");
    }
    return { action: counterEvent, remaining: [] };
  }
  const pass = observation.legalActions.find(
    (action) => action.type === "pass",
  );
  const plannedActions: LegalAction[] =
    pass && actions.every((action) => action.type === "counter")
      ? [...actions, pass]
      : actions;
  const last = plannedActions.at(-1)!;
  if (
    last.type !== "pass" ||
    plannedActions.slice(0, -1).some((action) => action.type !== "counter")
  ) {
    throw new Error(
      "LLM_INVALID_COUNTER_PLAN: hand counters must end with pass-counter",
    );
  }
  const cardIds = plannedActions
    .slice(0, -1)
    .map((action) => (action.type === "counter" ? action.cardInstanceId : ""));
  if (new Set(cardIds).size !== cardIds.length) {
    throw new Error("LLM_INVALID_COUNTER_PLAN: duplicate counter card");
  }
  // The attacker wins ties, so a plan that spends some cards but not enough
  // to clear the shortfall is strictly worse than passing with none: the
  // attack lands exactly the same either way, and the spent cards are gone
  // for it. A run committed a 2000 Usopp and a 1000 Jinbe -- 3000 -- against
  // a 3001 shortfall and lost both cards to a Zoro that died regardless.
  // `counterShortfall` is undefined only for fixtures that build an
  // observation without an `activeBattle`, so the check is skipped rather
  // than assumed to be 0.
  const totalCommittedPower = plannedActions
    .slice(0, -1)
    .reduce(
      (total, action) =>
        total + (action.type === "counter" ? (action.counterPower ?? 0) : 0),
      0,
    );
  const shortfall = observation.activeBattle?.counterShortfall;
  if (
    shortfall !== undefined &&
    totalCommittedPower > 0 &&
    totalCommittedPower < shortfall
  ) {
    throw new Error(
      `LLM_INSUFFICIENT_COUNTER_PLAN: this plan commits ${totalCommittedPower} Counter power against a shortfall of ${shortfall}. The attack lands unchanged and every spent card is wasted. Either commit enough hand counters (and Counter Events) to reach or exceed ${shortfall} total, or pass-counter immediately with none spent.`,
    );
  }
  const steps: CounterPlanStep[] = [
    ...cardIds.map((cardInstanceId) => ({
      type: "counter" as const,
      cardInstanceId,
    })),
    { type: "pass" },
  ];
  const first = steps.shift()!;
  const action =
    first.type === "counter"
      ? plannedActions.find(
          (candidate) =>
            candidate.type === "counter" &&
            candidate.cardInstanceId === first.cardInstanceId,
        )!
      : last;
  return { action, remaining: steps };
}

/**
 * Turns a Main Phase response of several action IDs into a plan.
 *
 * Two shapes are a plan and everything else is a mistake. `attach-don` moves
 * exactly one DON!! per action -- see the engine's own
 * `player.activeDon.splice(0, 1)` -- so asking for several means naming one
 * attach-don ID per DON!!, the same one repeated to load a single target or
 * different ones to spread them across the board. Those repeats may be followed by one
 * attack, which is the sequence a pilot actually decides in one thought: give
 * the attacker its DON!! and swing with it. Attack power freezes at
 * declaration, so DON!! given after the swing cannot raise it -- the attack has
 * to come last, and an ID naming it before the DON!! is a misunderstanding
 * worth correcting rather than a plan worth replaying.
 */
function mainPhasePlan(
  observation: GameObservation,
  actionIds: readonly string[],
): {
  action: LegalAction;
  remaining: CounterPlanStep[];
  mainPlanRemaining: MainPlanStep[];
  followUpRemaining: string[];
} {
  const actions = actionIds.map((actionId) => {
    const action = matchLegalAction(observation.legalActions, actionId);
    if (!action) throw new Error(`LLM_ILLEGAL_ACTION: ${actionId}`);
    return action;
  });
  // Order first: an attack in the wrong place is a misread of when power
  // freezes, and saying so is more use than the generic shape complaint.
  const attacks = actions.filter((action) => action.type === "attack");
  if (attacks.length > 1 || (attacks[0] && attacks[0] !== actions.at(-1))) {
    throw new Error(
      "LLM_INVALID_ACTION_RESPONSE: a Main Phase plan may name at most one attack, and the attack must be last -- attack power freezes at declaration, so DON!! named after it would arrive too late to raise it.",
    );
  }
  const first = actions[0]!;
  if (first.type !== "attach-don") {
    throw new Error(
      `LLM_INVALID_ACTION_RESPONSE: expected one actionId, received ${actionIds.length}. Several action IDs are only accepted to give DON!! -- one attach-don action ID per DON!! to give, repeated for one target or naming different targets to spread them -- optionally followed by one attack action ID.`,
    );
  }
  const donActions = (attacks[0] ? actions.slice(0, -1) : actions).map(
    (action) => {
      if (action.type !== "attach-don") {
        throw new Error(
          `LLM_INVALID_ACTION_RESPONSE: every action ID before the attack must be an attach-don -- one per DON!! to give, repeated for one target or naming different targets to spread them; ${action.actionId} is not one.`,
        );
      }
      return action;
    },
  );
  const attack = attacks[0];
  return {
    action: first,
    remaining: [],
    followUpRemaining: [],
    mainPlanRemaining: [
      ...donActions.slice(1).map((action): MainPlanStep => ({
        type: "attach-don",
        targetInstanceId: action.targetInstanceId,
      })),
      ...(attack
        ? [
            {
              type: "attack" as const,
              attackerInstanceId: attack.attackerInstanceId,
              targetInstanceId: attack.targetInstanceId,
            },
          ]
        : []),
    ],
  };
}

export interface LlmAgentOptions {
  /**
   * Reasoning effort per decision phase, and the default for the rest.
   *
   * Left unset the provider decides, which is what every recorded run used.
   * The knob exists because effort is where the latency is -- output tokens
   * decide how long a call takes, reasoning is four fifths of them, and a
   * Counter step picking between three cards is not a Main Phase with thirty
   * legal actions. It is off by default because spending less thought on a
   * decision is a play-strength trade, and that is a call to make against
   * measured win rates rather than by assumption.
   */
  reasoningEffort?: {
    default?: ReasoningEffort;
    byPhase?: Partial<Record<GameObservation["phase"], ReasoningEffort>>;
  };
}

/** What the system prompt's card entries cover. */
interface MatchContextCards {
  /** Every card number the prompt names, with or without its text. */
  readonly named: ReadonlySet<string>;
  /** Those whose entry actually carries printed text. */
  readonly withText: ReadonlySet<string>;
}

/**
 * What the system prompt's card entries cover, read back out of the rendered
 * prompt rather than collected while building it. The two would otherwise be
 * free to disagree, and the direction they would disagree in is the dangerous
 * one: a card believed to be covered is a card whose text nothing else sends.
 *
 * Naming a card and carrying its text are separate answers because the prompt
 * routinely does the first without the second -- printed text is a runtime
 * asset, so `promptCard` renders stats alone wherever the process holds no
 * pack, and a dedupe that read the card number alone dropped the text the
 * engine had. That is how an LLM seat came to read its opponent's cards and
 * not its own: its own 50 were all named, so all 50 were treated as covered.
 */
function matchContextCardNumbers(systemContent: string): MatchContextCards {
  const named = new Set<string>();
  const withText = new Set<string>();
  for (const entry of systemContent.split("<card ").slice(1)) {
    const number = /^number="([^"]+)"/.exec(entry)?.[1];
    if (!number) continue;
    named.add(number);
    // A card the prompt has no text for renders self-closing, so the presence
    // of an element body is what separates the two answers.
    const head = entry.slice(0, entry.indexOf(">") + 1);
    if (head.endsWith("/>")) continue;
    const body = entry.slice(0, entry.indexOf("</card>"));
    if (body.includes("<effect>") || body.includes("<trigger>")) {
      withText.add(number);
    }
  }
  return { named, withText };
}

/**
 * Where this seat's own previous turn begins in the public event log.
 *
 * With no conversation to read back through, the event log is the only place
 * the recent past is recounted, and neither obvious bound is right. Sending
 * everything means the whole game in every call, which is what statelessness
 * was meant to stop paying for. Sending only what has happened since this seat
 * last decided assumes the earlier events are still readable in an earlier
 * message, and here there is no earlier message -- a seat that countered
 * mid-turn would resume with no account of how the board reached that point.
 *
 * Two turns is the bound that holds: this seat's own last turn and the
 * opponent's turn since. `turn-ended` names the player about to act, so the
 * events opening this seat's turns are the ones whose `nextPlayerId` is the
 * viewer.
 *
 * Which of those opens "the last own turn" depends on whose turn it is now.
 * Answering on the seat's own turn, the most recent one opened the turn in
 * progress and the one before it opened the previous. Answering during the
 * opponent's turn -- a Counter step, a Blocker, a [Trigger] -- the most recent
 * one opened the seat's own last turn, and reaching back further would send
 * three turns rather than two. Before the seat has had enough turns the whole
 * log goes, which is exactly when the log is short enough not to matter.
 */
function ownPreviousTurnStart(observation: GameObservation): number {
  const starts: number[] = [];
  observation.publicEvents.forEach((event, index) => {
    if (
      event.type === "turn-ended" &&
      event.nextPlayerId === observation.viewer
    ) {
      starts.push(index + 1);
    }
  });
  const own = observation.turnPlayer === observation.viewer;
  const index = starts.length - (own ? 2 : 1);
  return index >= 0 ? starts[index]! : 0;
}

export class LlmAgent implements Agent {
  readonly #client: LlmChatClient;
  readonly #messages: LlmChatMessage[];
  readonly #promptCacheKey: string;
  readonly #reasoningEffort: LlmAgentOptions["reasoningEffort"];
  #previousDecision: PreviousDecision | undefined;
  #counterPlan: CounterPlanStep[] = [];
  #counterPlanBattle: string | undefined;
  #mainPlan: MainPlanStep[] = [];
  #mainPlanTurn: number | undefined;
  /**
   * The turn plan the model last stated, and the turn it belongs to.
   *
   * Distinct from `#mainPlan`, which is a queue of engine actions the runner
   * plays out of one answer. This is prose the model wrote for itself: nothing
   * here is executed, and it is sent back on every later decision of the same
   * turn so that a turn's frame survives the calls that make it up. It is
   * dropped when the turn number moves, because a plan is a plan for one turn.
   */
  #turnPlan: string[] = [];
  #turnPlanTurn: number | undefined;
  /**
   * Effect choices already answered, in the order the engine will ask for them.
   *
   * Held as exact action IDs, unlike a DON!! plan: these were read off a
   * simulation of the very action that produces them, so each ID names the
   * revision it will be offered at. A step that is not offered when it comes
   * round drops the rest -- the board diverged from the line the model answered
   * against, and the answers left were reasoned about that line.
   */
  #followUps: string[] = [];
  #plan: Plan | undefined;
  #lastReasoning: string | undefined;
  /**
   * The provider's own thinking summary, kept apart from what the model wrote
   * in its answer. They used to share one field, so a provider that returned no
   * summary made the answer's reasoning masquerade as one and the match history
   * printed the same sentence twice, once under each heading. Usually unset:
   * the summary is opt-in now, and the answer carries the reasoning.
   */
  #lastReasoningSummary: string | undefined;
  #lastRawExchange: LlmChatResponse["rawExchange"];
  /** Cards the system prompt already describes; see `actionRequest`. */
  readonly #matchContextCards: MatchContextCards;

  constructor(
    client: LlmChatClient,
    stableMatchContext?: unknown,
    options?: LlmAgentOptions,
  ) {
    this.#client = client;
    this.#reasoningEffort = options?.reasoningEffort;
    this.#messages = [
      {
        role: "system",
        content: stableMatchContext
          ? `${systemPrompt}\n\n${formatStableMatchContext(stableMatchContext)}`
          : systemPrompt,
      },
    ];
    this.#promptCacheKey = promptCacheKey(this.#messages[0]!.content);
    this.#matchContextCards = matchContextCardNumbers(
      this.#messages[0]!.content,
    );
  }

  /**
   * Lookahead for the current decision, supplied by the runner before each call.
   *
   * Optional by design: without it the agent answers one action at a time, which
   * is what every caller did before follow-up sequences existed.
   */
  usePlanner(plan: Plan | undefined): void {
    this.#plan = plan;
  }

  async chooseAction(
    observation: GameObservation,
    signal?: AbortSignal,
  ): Promise<LegalAction> {
    this.#lastReasoning = undefined;
    this.#lastRawExchange = undefined;
    // A plan is a plan for one turn. Keyed on the turn number rather than on
    // the phase: a seat's own turn is one number, and its Main Phase can be
    // interrupted by a [Trigger] of its own without the plan going stale.
    if (this.#turnPlanTurn !== observation.turn) {
      this.#turnPlan = [];
      this.#turnPlanTurn = observation.turn;
    }
    if (this.#counterPlan.length > 0) {
      // Only replay a plan into the battle it was made for. The runner plays
      // single-legal-action steps itself without calling `chooseAction`, so a
      // plan's trailing pass can go unconsumed; without this check it would be
      // spent on the *next* attack, silently declining a defence the model
      // never saw.
      if (
        observation.phase === "counter" &&
        battleKey(observation) === this.#counterPlanBattle
      ) {
        const step = this.#counterPlan[0]!;
        const plannedAction = observation.legalActions.find((candidate) =>
          step.type === "counter"
            ? candidate.type === "counter" &&
              candidate.cardInstanceId === step.cardInstanceId
            : candidate.type === "pass",
        );
        if (plannedAction) {
          this.#counterPlan.shift();
          return plannedAction;
        }
      }
      this.#counterPlan = [];
      this.#counterPlanBattle = undefined;
    }
    if (this.#mainPlan.length > 0) {
      // Scoped to the Main Phase of the turn the plan was made in, the same
      // way a Counter plan is scoped to its battle: a plan that outlives its
      // turn would attach DON!! the model never saw the following turn's
      // board to justify. A step whose action is no longer offered ends the
      // whole plan rather than being skipped -- the board moved, and the rest
      // of the plan was reasoned about the board before it moved.
      if (
        observation.phase === "main" &&
        observation.turn === this.#mainPlanTurn
      ) {
        const step = this.#mainPlan[0]!;
        const plannedAction = observation.legalActions.find((candidate) =>
          step.type === "attach-don"
            ? candidate.type === "attach-don" &&
              candidate.targetInstanceId === step.targetInstanceId
            : candidate.type === "attack" &&
              candidate.attackerInstanceId === step.attackerInstanceId &&
              candidate.targetInstanceId === step.targetInstanceId,
        );
        if (plannedAction) {
          this.#mainPlan.shift();
          return plannedAction;
        }
      }
      this.#mainPlan = [];
      this.#mainPlanTurn = undefined;
    }
    if (observation.legalActions.length === 0) {
      throw new Error("NO_LEGAL_ACTION");
    }
    if (observation.legalActions.length === 1) {
      this.#lastReasoning = undefined;
      this.#lastReasoningSummary = undefined;
      this.#lastRawExchange = undefined;
      // The queue is left alone: a forced step is one the sequence never named,
      // because a decision with one answer costs no call to make.
      return observation.legalActions[0]!;
    }
    if (this.#followUps.length > 0) {
      const step = observation.legalActions.find(
        (candidate) => candidate.actionId === this.#followUps[0],
      );
      if (step) {
        this.#followUps.shift();
        return step;
      }
      this.#followUps = [];
    }
    // One decision is one call. The model is sent the system prompt and one
    // user message describing the whole position, and nothing carries over --
    // no replayed provider output, no accumulated exchanges, so no compaction
    // and no growing prefix. What the conversation used to supply is supplied
    // instead by the message itself: `state` is complete, the card text is
    // split between the system prompt and `unlistedCardFacts`, and the last two
    // turns are recounted from the event log.
    const recentPublicEvents = observation.publicEvents.slice(
      ownPreviousTurnStart(observation),
    );
    // ~130 bytes naming the action this seat took last. Cheap, and with no
    // previous message left to read it off, this is the only place it appears.
    const followUps = this.#plan
      ? expandFollowUps(observation, this.#plan)
      : [];
    const request = actionRequest(
      observation,
      recentPublicEvents,
      this.#previousDecision,
      this.#matchContextCards,
      followUps,
      this.#turnPlan,
    );
    const userMessage: LlmChatMessage = {
      role: "user",
      content: request.content,
    };
    // The labels, not the engine IDs: they are what the request offers and what
    // the response schema's pattern matches.
    const allowedActionIds = request.actionIds.map(
      (_engineId, index) => `action-${index + 1}`,
    );
    /**
     * Turn the answer's labels back into engine action IDs.
     *
     * A raw engine ID is accepted too. The schema's pattern rejects one from a
     * provider that enforces it, but not every transport does, and a model that
     * copies an ID out of an action summary has still named the move it meant.
     */
    const toEngineIds = (ids: readonly string[]): string[] =>
      ids.map((id) => {
        const label = /^action-(\d+)$/.exec(id.trim());
        if (!label) return id;
        return request.actionIds[Number(label[1]) - 1] ?? id;
      });
    const effort =
      this.#reasoningEffort?.byPhase?.[observation.phase] ??
      this.#reasoningEffort?.default;
    // Two messages, every call: the cached system prompt and this position.
    const ask = (message: LlmChatMessage) =>
      this.#client.complete({
        messages: structuredClone([this.#messages[0]!, message]),
        promptCacheKey: this.#promptCacheKey,
        allowedActionIds,
        ...(effort ? { reasoningEffort: effort } : {}),
        ...(signal ? { signal } : {}),
      });

    let response = await ask(userMessage);
    let decision = parseDecision(response.content);
    decision = { ...decision, actionIds: toEngineIds(decision.actionIds) };
    let attempt = this.#resolve(observation, decision, followUps);
    // Record the exchange before it can throw: a rejected answer is the one
    // most worth reading afterwards.
    const record = () => {
      this.#lastRawExchange = response.rawExchange;
      this.#messages.splice(1, Infinity, userMessage, {
        role: "assistant",
        content: response.content,
      });
    };
    record();
    if ("error" in attempt) {
      // One correction round. The schema constrains `actionIds` to an enum, so
      // this only fires against a provider that does not enforce it -- but an
      // unusable answer must cost a retry, not the rest of the run.
      // The whole position again, not just the complaint: with no conversation
      // behind it a bare correction would arrive against no board at all.
      const retryMessage: LlmChatMessage = {
        role: "user",
        content: actionRequest(
          observation,
          recentPublicEvents,
          this.#previousDecision,
          this.#matchContextCards,
          followUps,
          this.#turnPlan,
          `Your previous answer to this request was rejected. ${attempt.error} Choose again, copying action ids exactly from the AVAILABLE ACTIONS list, e.g. ${allowedActionIds[0] ?? "action-1"}. Reply in the same JSON shape.`,
        ).content,
      };
      response = await ask(retryMessage);
      decision = parseDecision(response.content);
      decision = { ...decision, actionIds: toEngineIds(decision.actionIds) };
      attempt = this.#resolve(observation, decision, followUps);
      record();
      if ("error" in attempt) throw new Error(attempt.error);
    }
    const action = attempt.action;
    this.#counterPlan = attempt.remaining;
    this.#counterPlanBattle = battleKey(observation);
    this.#mainPlan = [...attempt.mainPlanRemaining];
    this.#mainPlanTurn =
      this.#mainPlan.length > 0 ? observation.turn : undefined;
    this.#followUps = [...attempt.followUpRemaining];
    // Only a stated plan replaces one. An answer that says nothing about the
    // plan leaves the one already held standing, so a turn's frame is never
    // dropped by an answer that merely forgot to restate it -- and a seat that
    // means to change plan changes it by sending the new one. On the opponent's
    // turn no plan is shown and none is kept.
    if (
      decision.turnPlan &&
      observation.turnPlayer === observation.viewer &&
      observation.phase === "main"
    ) {
      this.#turnPlan = [...decision.turnPlan];
      this.#turnPlanTurn = observation.turn;
    }
    // The model's own stated reason travels with the action it chose. A
    // request is self-contained and carries no conversation, so without this
    // the next decision of the same sequence sees what it did and not why --
    // and a sequence is exactly where that bites: a discard that trashes two
    // cards is two decisions, and a recorded one wrote "retain Linlin" at the
    // first and trashed Linlin at the second. `turnPlan` cannot carry it,
    // because no plan is shown or kept on the opponent's turn, which is when
    // most such sequences arrive -- a [Trigger], a Block step, a Counter step.
    this.#previousDecision = {
      actionId: action.actionId,
      summary: action.summary,
      ...(decision.reasoning ? { reasoning: decision.reasoning } : {}),
    };
    // The model's own words first: it wrote them knowing the board, whereas a
    // summary is the provider's account of thinking the answer already spent.
    this.#lastReasoning = decision.reasoning ?? response.reasoningSummary;
    this.#lastReasoningSummary = response.reasoningSummary;
    return action;
  }

  /**
   * Turn a parsed decision into an action, or into the message to send back.
   *
   * Returns the failure rather than throwing so `chooseAction` can spend one
   * correction round on it. Every message is written to be actionable by the
   * model that produced the mistake.
   */
  #resolve(
    observation: GameObservation,
    decision: LlmDecision,
    followUps: readonly FollowUpOffer[] = [],
  ):
    | {
        action: LegalAction;
        remaining: CounterPlanStep[];
        mainPlanRemaining: MainPlanStep[];
        followUpRemaining: string[];
      }
    | { error: string } {
    try {
      if (isCounterPlanDecision(observation)) {
        const result = counterPlan(observation, decision.actionIds);
        return { ...result, mainPlanRemaining: [], followUpRemaining: [] };
      }
      const [actionId, ...rest] = decision.actionIds as [string, ...string[]];
      const selected = matchLegalAction(observation.legalActions, actionId);
      if (rest.length > 0) {
        // A DON!! plan and a follow-up sequence are told apart by the action
        // they start from, not by their length: attaching DON!! is the one
        // sequence whose later IDs cannot be read off a simulation, because it
        // repeats an ID the engine renumbers after every attachment.
        if (!selected || selected.type === "attach-don" || !this.#plan) {
          return mainPhasePlan(observation, decision.actionIds);
        }
        return {
          action: selected,
          remaining: [],
          mainPlanRemaining: [],
          followUpRemaining: followUpSequence(
            observation,
            this.#plan,
            selected,
            rest,
            // What was actually put in front of the model, so a step whose
            // conditional union listed the ID truncates the sequence instead
            // of ending the game. See `followUpSequence`.
            followUps.find((offer) => offer.actionId === selected.actionId),
          ),
        };
      }
      if (!selected) return { error: `LLM_ILLEGAL_ACTION: ${actionId}.` };
      return {
        action: selected,
        remaining: [],
        mainPlanRemaining: [],
        followUpRemaining: [],
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /** The why to show a reader: what the model wrote, or failing that, the summary. */
  get lastReasoning(): string | undefined {
    return this.#lastReasoning;
  }

  /** Only the provider's summary, for a reader already shown the answer's reasoning. */
  get lastReasoningSummary(): string | undefined {
    return this.#lastReasoningSummary;
  }

  /**
   * The reasoning in the shape the trace recorder reads.
   *
   * `TraceRecorder` looks for `lastDecision` on whichever agent acted, which
   * only `RulesAgent` used to expose -- so every `llm-agent` transition landed
   * in the trace with `decision: undefined` and its reasoning was recoverable
   * only by joining the `.llm.jsonl` on revision.
   */
  get lastDecision(): { reasons: string[] } | undefined {
    return this.#lastReasoning ? { reasons: [this.#lastReasoning] } : undefined;
  }

  get history(): readonly LlmChatMessage[] {
    return structuredClone(this.#messages);
  }

  get lastRawExchange(): LlmChatResponse["rawExchange"] {
    return structuredClone(this.#lastRawExchange);
  }

  reset(): void {
    // `#messages` is only a debugging record now -- the last exchange, for the
    // `history` getter -- so dropping it drops no state the next call needs.
    // Card text cannot go stale with it: what the model is shown comes from the
    // system prompt and from the observation, both rebuilt on every call.
    this.#messages.splice(1);
    this.#previousDecision = undefined;
    this.#counterPlan = [];
    this.#counterPlanBattle = undefined;
    this.#mainPlan = [];
    this.#mainPlanTurn = undefined;
    this.#turnPlan = [];
    this.#turnPlanTurn = undefined;
    this.#followUps = [];
    this.#lastReasoning = undefined;
    this.#lastReasoningSummary = undefined;
    this.#lastRawExchange = undefined;
  }
}

/**
 * The registry entry types.
 *
 * Each of these describes the *offer* side of a clause -- what the engine has to
 * know to put the ability on the table -- with the behaviour itself in the
 * `MechanicProgram` they carry.
 */
import {
  type BattleTargetFilter,
  type CardSelector,
  type CardZone,
  type MechanicCondition,
  type MechanicProgram,
} from "../mechanics.js";

/**
 * `[Main]` programs for Event cards, with the DON!! the Event itself costs.
 *
 * Events used to need a bespoke branch in `getLegalActions` and another in
 * `applyAction` each -- there are six such pairs in `engine.ts` already. Purple
 * Enel runs twenty-one Events across six identities, so they are a table here
 * instead: the engine offers any Event with an entry, pays its cost, trashes it
 * and runs the program.
 */
export interface EventMainProgram {
  /** DON!! the Event costs to play, from its printed cost. */
  cost: number;
  /** Additional DON!! returned to the DON!! deck as part of the text. */
  donMinus?: number;
  /** Active DON!! rested as part of the text, without leaving the field. */
  restDon?: number;
  /**
   * Cards the text trashes from hand as part of its cost.
   *
   * Declared here rather than only inside `program` so the *offer* can check the
   * cost is payable: the Event leaves the hand when it is played, so OP17-078's
   * "trash 2 cards from your hand" needs two further cards behind it. Without
   * the gate a player down to the Event alone would be offered a cost they
   * cannot pay and get the effect for free. The trashing itself stays in the
   * program, because the player chooses which cards go.
   */
  trashFromHand?: number;
  program: MechanicProgram;
}

/**
 * `[Counter]` Events, as a table.
 *
 * The `[Main]` half of an Event has had `eventMainPrograms` for a while; the
 * `[Counter]` half was still a hand-maintained allow-list in `getLegalActions`
 * and a matching `else if` chain in `applyAction`, one pair of branches per card
 * number. An Event added to one and forgotten in the other is offered and then
 * resolves as something else, which is exactly what the `[Main]` table was
 * introduced to stop.
 *
 * `power` is added to the open battle's Counter total, which is how the engine
 * models a Counter buff: a single number on the battle rather than a modifier on
 * a card. That is why `program` runs *after* the power lands and must not
 * re-apply it.
 */
export interface CounterEventProgram {
  /** DON!! the Event costs to play, from its printed cost. */
  cost: number;
  /**
   * Additional DON!! returned to the DON!! deck as part of the text --
   * OP09-078 Gum-Gum Giant's `DON!! −2`.
   *
   * Declared here rather than only inside `program` for the same reason
   * `EventMainProgram` declares it: the *offer* has to know the price, or a
   * defender with no DON!! on the field is shown a Counter they cannot pay for
   * and the power lands anyway.
   */
  donMinus?: number;
  /**
   * Cards the text trashes from hand as part of its cost. The Event itself has
   * left the hand by then, so the gate is on the cards behind it.
   */
  trashFromHand?: number;
  /** Counter power the Event adds to the open battle. */
  power: number;
  /**
   * Which card in the battle the power is printed for.
   *
   * The engine models Counter power as one number added to the battle's target,
   * so an Event whose buff names a *particular* card only helps when that card is
   * the thing being attacked. "[printed text omitted -- pnpm card:text <card>]" does
   * nothing while a Character is blocking, and OP17's Counters restrict
   * themselves in three different ways: to the Leader (OP17-097, OP17-098), to a
   * type (OP17-017), and to a name (OP17-115).
   *
   * The same filter `battle-power` carries, evaluated by the same
   * `battleTargetMatches` -- which is what makes a name or type restriction read
   * the card's *derived* identity, so the sealed wildcard Leader satisfies one
   * exactly as the clause it prints says it should. This was a hand-written
   * predicate over printed strings, and it answered "no" for that Leader.
   *
   * Absent, the power always applies. When it does not match, the offer and the
   * resolution must agree on 0 -- both read `counterEventPower`, so a summary can
   * never promise power the resolution will not add.
   */
  target?: BattleTargetFilter;
  /**
   * A board-state gate on whether the power is paid out at all -- "[printed text omitted -- pnpm card:text <card>]" (OP10-117 ROOM), "[printed text omitted -- pnpm card:text OP10-117]" and the rest of OP10's conditional Counters.
   *
   * Distinct from `target`, which asks *which card* the power may land on. This
   * asks whether there is any power to land, and it is the declarative form of
   * a reading `counterEventPower` had accumulated seven hand-written card-number
   * branches for. Deterministic from state the defender can see before the offer
   * is made, so the forecast in the action summary stays honest: a condition
   * that is false reads "adds nothing to this battle".
   *
   * A clause whose payout depends on a *choice* still belongs in `program` with
   * `power: 0` -- see OP17-037's branch in `counterEventPower` -- because no
   * number can be promised before the player answers.
   */
  powerWhen?: MechanicCondition;
  /** The rest of the printed text, resolved after the power is added. */
  program?: MechanicProgram;
}

/**
 * `[On Your Opponent's Attack]` programs, offered to the defender during the
 * block step.
 *
 * The registry is the easy half; the dispatch is not, and the shape of this
 * table is chosen for it. The ability lives inside the battle flow as a priority
 * ladder of offers -- see `offerAttackReactions` in `engine.ts` -- which is
 * re-entered every time a pending effect resolves. While each ability in that
 * ladder had a single source (a Leader), the ladder could guard on the *kind* of
 * effect that had just resolved. A registry has many sources at once -- OP17-064
 * King and OP17-072 Black Maria can both be on the board -- so the guard is
 * per-source instead, recorded on the battle itself.
 *
 * Every program here is `optional`-wrapped, because every printed clause is a
 * "you may" with a cost. That is deliberate and load-bearing in two ways: the
 * apply/skip prompt comes for free, and declining is what tells the engine not
 * to spend the `[Once Per Turn]` use -- the key is marked when the offer is
 * accepted, not when it is made. `activate-main` marks its key before dispatch,
 * which is right for an ability the player went looking for and wrong for one
 * pushed at them mid-battle. `test/op17.test.ts` pins both halves.
 */
export interface OnOpponentAttackProgram {
  /** Whether the printed text carries `[Once Per Turn]`. */
  oncePerTurn: boolean;
  /**
   * What the defender must have before the ability is offered at all.
   *
   * Every clause here is "you may <pay>: <effect>", so an offer the player
   * cannot pay for is a prompt with nothing behind it -- and worse, a number in
   * the attacker's forecast that the defender cannot actually reach.
   * `sourceActive` is for a cost paid by the source itself: OP17-057 Fullalead
   * rests its own Stage.
   */
  requires?: {
    handCards?: number;
    fieldDon?: number;
    activeDon?: number;
    sourceActive?: boolean;
    /**
     * A cost paid with cards of a specific type, as OP17-048 Shiki's "you may
     * trash 1 card with a type including Rocks Pirates from your hand".
     * `handCards` alone cannot gate this: a hand full of cards none of which
     * qualify would still be offered a cost it cannot pay.
     */
    handCardsOfType?: { type: string; count: number };
    /**
     * A cost paid with cards of particular *categories*, as OP15-057 Dressrosa
     * Kingdom's "[printed text omitted -- pnpm card:text OP15-057]". `handCards` alone
     * cannot gate it -- a hand of Characters would be offered a cost it cannot
     * pay -- and `handCardsOfType` asks a different question, so the category
     * disjunction is its own field.
     */
    handCardsOfCategory?: { categories: readonly string[]; count: number };
    /**
     * A cost paid with hand cards the two fields above cannot describe --
     * OP16-015's "[printed text omitted -- pnpm card:text OP16-015]" and OP16-080's "1 card with
     * a [Trigger]". `handCards` alone is a card count, so a hand of the wrong
     * cards is offered a cost it cannot pay: the prompt appears, the player
     * takes it, and the `min: 1` choose finds nothing.
     */
    handCardsMatching?: {
      match: Omit<CardSelector, "player" | "zone">;
      count: number;
    };
    /**
     * A cost paid with the defender's own Life cards -- ST36-005
     * Eustass"Captain"Kid's "you may turn 1 card from the top or bottom of your
     * Life cards face-down".
     *
     * The Life-zone sibling of `handCardsMatching`, and needed for the same
     * reason: the cost names particular cards (the two at the edges, and only
     * while they are face-up), so no count of Life cards can gate it. A
     * defender on three face-down Life would otherwise be prompted for a cost
     * with nothing to pay it, and taking the prompt would spend the
     * `[Once Per Turn]` on nothing.
     */
    lifeCardsMatching?: {
      match: Omit<CardSelector, "player" | "zone">;
      count: number;
    };
    /**
     * A board-state gate the *offer* has to clear, not a cost -- "[printed text omitted -- pnpm card:text <card>]"GERMA"" (OP11-043 Vinsmoke Ichiji).
     *
     * Written here rather than as the program's own outermost `if` because this
     * table's offers are pushed at a player mid-battle: a prompt whose clause
     * will do nothing is worse than no prompt, and it would spend the
     * `[Once Per Turn]` use on nothing.
     */
    everyCharacterMatches?: Omit<CardSelector, "player">;
    /**
     * A gate on the card that declared the attack -- "[printed text omitted -- pnpm card:text <card>]"
     * (OP11-088 Shu). Same reasoning as `everyCharacterMatches`: the answer is
     * known before the offer is made, so the offer should not be made at all.
     */
    battleAttacker?: { filter: BattleTargetFilter; attribute?: string };
    /**
     * A gate on the Leader's type, read as a substring the way
     * `leader-type-including` reads it -- OP12-069 Crocodile's buff behind its
     * `DON!! −1` (`pnpm card:text OP12-069`). The same reasoning as
     * `everyCharacterMatches`: known before the offer, and a prompt that pays
     * a DON!! for nothing would spend the `[Once Per Turn]` on it too.
     */
    leaderTypeIncluding?: string;
  };
  program: MechanicProgram;
}

/**
 * Programs for a bench card that reacts when its own controller's Leader
 * attacks or is attacked -- distinct from both tables above it. Neither fits:
 * `onOpponentAttackPrograms` asks the *defender* about an opponent's attack on
 * them, and `whenAttackingPrograms` asks the *attacking card itself* about its
 * own declaration. Here the watcher is never a participant in the battle at
 * all; it sits on the bench and watches its own side's Leader from either end
 * of the fight. `leaderWatcherSources` in `engine.ts` is the source scan that
 * plays the same role `onOpponentAttackSources` plays for that table, and
 * `offerLeaderWatcherEffect` is the ladder that offers it.
 *
 * OP17-040 Edward.Newgate is the only entry: "[printed text omitted -- pnpm card:text OP17-040]" The `leaderType` requirement is checked
 * against the *watcher's controller's* Leader, not the battle's target --
 * "your Leader" always means the controller's own, on both ends of the
 * clause.
 */
export interface LeaderWatcherProgram {
  /** Whether the printed text carries `[Once Per Turn]`. */
  oncePerTurn: boolean;
  requires?: {
    handCards?: number;
    /** A type the watcher's controller's Leader must carry, e.g. Rocks Pirates. */
    leaderType?: string;
  };
  program: MechanicProgram;
}

/**
 * `[On K.O.]` programs whose printed text names *how* the Character died.
 *
 * Every entry before OP09-052 Marco is a bare `MechanicProgram`: an `[On K.O.]`
 * fires however the body left the board, which is what those cards print. Marco
 * answers only "K.O.'d by your opponent's effect", so battle destruction has to
 * be excluded -- and no condition can express it, because a condition reads the
 * state rather than the cause. A bare program is still accepted and normalized,
 * the same way `WhenAttackingEntry` accepts both shapes.
 *
 * The gate is on the *cause*, not on whose effect it was: `createOnKoResult` is
 * reached from every removal path but is not told which player's effect ran it,
 * and the one clause that needs the distinction also prints `[Opponent's Turn]`,
 * where a K.O. by the controller's own effect is vanishingly rare.
 */
export interface OnKoProgram {
  opponentEffectOnly: boolean;
  program: MechanicProgram;
}

export type OnKoEntry = MechanicProgram | OnKoProgram;

/**
 * `[On Block]` programs, dispatched when this card blocks.
 *
 * The mirror of `[When Attacking]` from the other side of the fight, and a
 * distinct window from both tables around it: `onOpponentAttackPrograms` is
 * offered to the *defender* when an attack is declared and fires whether or not
 * anything blocks, and this one fires only because this card activated
 * [Blocker] and became the target. Two cards print it -- OP10-077 Bellamy and
 * OP12-081 Sabo -- and both read "you may <pay>: <effect>", so `requires` gates
 * the offer exactly as the other reaction tables do.
 *
 * Dispatched from `actions/block.ts` with `pendingEffectResume` pointed at the
 * Counter step, which is where the block hands the battle next.
 */
export interface OnBlockProgram {
  /** Whether the printed text carries `[Once Per Turn]`. */
  oncePerTurn: boolean;
  /** What the blocker's controller must have before the clause is dispatched. */
  requires?: {
    handCards?: number;
    activeDon?: number;
    fieldDon?: number;
  };
  program: MechanicProgram;
}

/**
 * `[When Attacking]` programs, dispatched when an attack is declared.
 *
 * The engine dispatched On Play, On K.O. and Trigger but had no When Attacking
 * hook at all -- the two cards that needed one before this were handled by
 * hardcoded branches at the attack site, and OP15-061 Ohm and OP15-066 Satori
 * were simply playing without their second ability.
 *
 * Every entry before OP17-048/058 was a bare `MechanicProgram`: none of them
 * printed `[Once Per Turn]`, so there was nothing to gate on beyond the
 * program's own internal `if`. Those two do, and 058 is also printed
 * `[On Your Opponent's Attack]` on the same card, so its `[Once Per Turn]`
 * budget has to be shared with that table -- see `WhenAttackingProgram` and
 * the dispatch site in `engine.ts`. Rather than touch every existing entry, a
 * bare `MechanicProgram` is still accepted and normalized to
 * `{ oncePerTurn: false, program }`, distinguished by which of the two shapes'
 * keys is present.
 */
export interface WhenAttackingProgram {
  /** Whether the printed text carries `[Once Per Turn]`. */
  oncePerTurn: boolean;
  /**
   * What the attacker must have before the ability is offered at all, the
   * same shape `OnOpponentAttackProgram.requires` uses -- OP17-048/058 are
   * dual-timed onto both tables and share the one gate.
   */
  requires?: OnOpponentAttackProgram["requires"];
  program: MechanicProgram;
}

export type WhenAttackingEntry = MechanicProgram | WhenAttackingProgram;

/**
 * `[Activate: Main]` programs sourced from a Character on the field.
 *
 * The same table treatment the Events got. Before this, every Main activation
 * was a hand-written pair of branches keyed on card number, which is why
 * P-096 Girl's DON!! gift went unimplemented even after the selector could
 * express "your [Nami] cards".
 */
export interface ActivateMainProgram {
  /** Whether the ability may only be used once per turn. */
  oncePerTurn: boolean;
  /**
   * What the player must have before the ability is offered at all.
   *
   * An `[Activate: Main]` without a once-per-turn clause is repeatable, so an
   * activation that resolves to nothing is not merely wasteful -- it is a legal
   * action that leaves the state untouched, which a rules agent will take
   * forever. Requiring the resources the printed cost consumes makes every
   * offered activation change something.
   */
  requires?: {
    fieldDon?: number;
    activeDon?: number;
    handCards?: number;
    /**
     * Life cards the ability's cost consumes -- PRB02-016 Otama pays "[printed text omitted -- pnpm card:text PRB02-016]".
     *
     * A player on 0 Life cannot pay it, and Otama's activation is repeatable,
     * so without this gate the offer stands all turn and resolves to nothing.
     * `handCards` is the nearest existing field and asks about the wrong zone.
     */
    lifeCards?: number;
    /**
     * Given DON!! -- the Leader's pile plus every Character's -- the ability
     * needs before it is offered. ST28-004 Kouzuki Momonosuke pays "[printed text omitted -- pnpm card:text ST28-004]", and
     * none of the three fields around this one can gate it: `fieldDon` counts
     * the cost area too, and `activeDon`/`restedDon` count only the cost area.
     * Without it the activation is offered on an empty board, spends the
     * turn's one use and returns nothing.
     */
    givenDon?: number;
    /**
     * Rested DON!! the ability needs to pay out at all -- "[printed text omitted -- pnpm card:text <card>]" (OP10-001 Smoker, OP10-030 Smoker) and "give up to
     * N rested DON!! cards" (OP10-016 Monet, OP10-021 Punk Hazard).
     *
     * `activeDon` asks the opposite question and `fieldDon` counts both, so
     * neither can gate these: a player whose DON!! are all active would be
     * offered a `[Once Per Turn]` activation that sets nothing active, and
     * taking it would spend the turn's use for nothing.
     */
    restedDon?: number;
    /**
     * Whether DON!! may still be set active by a Character effect this turn --
     * OP10-030 Smoker, whose own text bans it after the first use.
     *
     * Without this the activation stays on offer all turn and resolves to
     * nothing, which is the one thing a repeatable `[Activate: Main]` must never
     * be: a legal action that changes no state is one a rules agent will take
     * forever.
     */
    donActivationAllowed?: boolean;
    /** For a cost paid by the source itself (e.g. resting it): the source must not already be rested. */
    sourceActive?: boolean;
    /**
     * The mirror: the source must *be* rested, for a clause whose whole payout
     * is setting it active again -- OP12-020 Roronoa Zoro's Leader.
     *
     * Not expressible as the absence of `sourceActive`, which is what "no gate
     * at all" already means. Without it the activation stands on an active
     * Leader, where taking it spends the `[Once Per Turn]` and the attack
     * restriction the clause charges for, and sets active something already
     * active.
     */
    sourceRested?: boolean;
    /**
     * A cost paid with particular cards from hand -- OP14-105 Gorgon Sisters'
     * "[printed text omitted -- pnpm card:text OP14-105]". `handCards` alone cannot gate it: a hand of three unrelated cards
     * would be offered a cost it cannot pay, and the ability is repeatable
     * enough for a rules agent to keep taking the empty offer.
     */
    handCardsMatching?: {
      match: Omit<CardSelector, "player" | "zone">;
      count: number;
    };
    /**
     * A cost paid with particular Life cards -- OP11-022 Shirahoshi's Leader
     * turns the top one face-up, which it cannot do to a card already face-up
     * (Bandai's OP11-022#1: the ability cannot be activated). `lifeCards`
     * counts the zone and cannot tell the two apart. The same field
     * `OnOpponentAttackProgram` carries.
     */
    lifeCardsMatching?: {
      match: Omit<CardSelector, "player" | "zone">;
      count: number;
    };
  };
  program: MechanicProgram;
}

/**
 * "[printed text omitted -- pnpm card:text <card>]" -- OP14's Green package
 * prints it on six cards, and Purple's OP14-070 Buffalo prints the narrower
 * "[printed text omitted -- pnpm card:text OP14-070]".
 *
 * A timing window with no printed marker and no zone change behind it, so
 * nothing in the eleven registries could dispatch it: `[On K.O.]` needs a card
 * to leave the board, `[When Attacking]` needs the card to be the attacker, and
 * the rest of the table is keyed to a phase. This one hangs off the rest itself.
 *
 * Two dispatch sites, and they are the two ways a Character becomes rested in
 * the declarative path: the `rest` node's own `card-rested` signal, and
 * declaring an attack. Resting to block is deliberately not one -- every clause
 * here but OP14-070 is `[Your Turn]`, and a block only ever happens on the
 * other player's -- and neither are the older imperative rests in
 * `resolve-effect/` and `actions/activate-main.ts`, which rest one hardcoded
 * card each for a card that predates this registry.
 */
export interface WhenRestedProgram {
  /** `[Your Turn]`: only while the card's controller is the turn player. */
  yourTurnOnly: boolean;
  /**
   * Narrows which rests count. Absent, any rest does -- including the card
   * resting itself to attack, which is the common case for the Green clauses.
   *
   * `"opponent-character-effect"` is OP14-070 Buffalo's, and excludes both the
   * controller's own effects and an opposing *Leader* or Event.
   * `"opponent-effect"` is PRB02-009 Mr.3's wider "your opponent's effect":
   * any effect the opponent controls, Leader and Event included, but still
   * not the rest an attack or a block pays.
   */
  source?: "opponent-character-effect" | "opponent-effect";
  program: MechanicProgram;
}

/**
 * Replacement effects: "If <a Character> would be K.O.'d, you may <pay> instead."
 *
 * The fifth kind of printed clause with no timing marker, and the last one still
 * written as a hand-made branch per card in `removal.ts` for some cards -- each
 * a `cardNumber === "..."` test plus a matching `optionId.startsWith(...)` arm in
 * `resolve-effect/removal.ts`. A registry collapses the pair into one generic
 * branch, and -- because `mechanicProgramCards` reads it -- lets a card whose
 * *only* printed clause is a replacement be claimed declaratively rather than
 * exempted from the coverage ratchet.
 *
 * `cost` is a closed set rather than a free `MechanicProgram` on purpose. A
 * replacement is offered from inside a suspended battle or effect, and the
 * pending effects that already know how to resume one -- `hand-trash-replacement`
 * and the K.O. pipeline -- are what these two shapes reuse. A free program would
 * suspend on a `mechanic-choice`, which carries no resumption point, and the
 * battle it interrupted would never continue.
 *
 * The hand-written ones left in `removal.ts` are not migrated: they sit in
 * shipped decks and rewriting them would move those decks' replay hashes. They
 * are also only offered by the older `ko-character` path -- never by the
 * `knock-out` or `move` node, nor by battle destruction -- so a replacement
 * that has to answer those belongs here. This is the path for new ones.
 */
export interface ReplacementProgram {
  /**
   * Whether the printed text says "by your opponent's effect".
   *
   * Most do, which is what keeps battle destruction and a player's own removal
   * out of scope. A clause reading only "would be K.O.'d" sets this false.
   */
  opponentEffectOnly: boolean;
  /**
   * Whether the clause also answers *any* K.O., however caused, on top of
   * whatever `opponentEffectOnly` and `removal` say -- OP08-045 Thatch's
   * "if this Character would be removed from the field by your opponent's
   * effect **or K.O.'d**".
   *
   * The only printed clause in the pool that joins the two readings, and no
   * combination of the flags around it can express it: `opponentEffectOnly`
   * narrows to the other player's effect and so drops a lost fight, and
   * dropping the flag admits the controller's own bounces, which the first half
   * of the sentence does not.
   */
  alsoAnyKo?: boolean;
  /**
   * Whether the printed text says "by your opponent" and stops there --
   * OP15-098 Monkey.D.Luffy's Leader, which answers the opponent's effects
   * *and* a battle their attacker wins.
   *
   * `opponentEffectOnly` drops the battle half, and leaving every flag off
   * admits the controller's own removal, which "by your opponent" excludes.
   */
  opponentOnly?: boolean;
  /**
   * Whether the printed text says "would be K.O.'d **by an effect**" without
   * naming a side -- OP09-012 Monster, which answers its own controller's
   * effects as well as the opponent's but not a lost fight.
   *
   * Neither flag beside it can say this: `opponentEffectOnly` narrows to the
   * other player, and leaving both off admits battle destruction, which "by an
   * effect" excludes.
   */
  effectOnly?: boolean;
  /**
   * A precondition on the board, for a replacement whose printed clause opens
   * with an "If ..." that is not about the threatened card.
   *
   * EB04-044 Koby is the first: its "instead" is available only while its
   * controller's Leader type includes "Navy". `protects` filters the
   * *threatened* card on printed facts and can say nothing about the Leader,
   * so without this the gate would simply be dropped -- and a 6-cost 7000
   * would be protected behind every Leader in the format.
   *
   * Evaluated with the threatened card as the source and its controller as the
   * acting player, the same context `protects` is selected in, so a condition
   * reading `"self"` reads the defender's side.
   */
  requires?: MechanicCondition;
  /** Whether the printed text carries `[Once Per Turn]`. */
  oncePerTurn: boolean;
  /**
   * Whether the printed text is a prevention rather than a "you may": the
   * controller is not offered the K.O. instead. OP10-118 Monkey.D.Luffy is the
   * one, and Bandai's OP10-118#1 ruling is that its first K.O. by an opponent's
   * effect in a turn cannot be allowed through.
   */
  mandatory?: true;
  /**
   * DON!! that must be given to the protected player's Leader -- OP05-001
   * Sabo's `[DON!! x1]`, the first replacement in the pool printed on a Leader
   * behind a DON!! gate. Read by `eligibleReplacements`, so an unpaid Leader
   * is never offered the save.
   */
  leaderAttachedDon?: number;
  /**
   * Whether the printed text carries `[Opponent's Turn]` -- OP14-016 X.Drake,
   * OP14-029 Tashigi and OP14-092 Mr.3(Galdino) all do.
   *
   * `opponentEffectOnly` is the nearest existing gate and is a different
   * question: a player can point their own removal at their own Character on
   * their own turn, and a `[Opponent's Turn]` replacement is not available for
   * it either way.
   */
  opponentTurnOnly?: boolean;
  /**
   * Whether the printed text says "would be K.O.'d **in battle**" -- OP10-034
   * Franky.
   *
   * The exact complement of `opponentEffectOnly`: that reading excludes battle
   * destruction, and this one admits nothing else. Losing a fight is not an
   * effect, so neither flag can stand in for the other -- and a clause naming
   * battle must not answer a removal Event.
   */
  battleOnly?: boolean;
  /**
   * Which removals the clause answers.
   *
   * `"ko"` (the default) is "if <a Character> would be K.O.'d". `"off-field"` is
   * the wider printed reading -- "[printed text omitted -- pnpm card:text <card>]" -- which
   * covers a K.O. *and* a bounce to hand, a bury to the deck, and a move into
   * Life. Ten cards across OP10-OP13 print it, and before this the whole family
   * answered nothing but a K.O.: the `move` node offers these entries too.
   */
  removal?: "ko" | "off-field";
  /**
   * What is done instead, when it is not paying a cost.
   *
   * OP11-101 Capone"Gang"Bege reads "[printed text omitted -- pnpm card:text OP11-101]": the threatened Character *itself* moves somewhere else,
   * and there is nothing to pay. Every other entry in this registry spends
   * something and leaves the Character where it is, which is why this is a
   * separate field rather than another `cost` kind -- the two do different things
   * to different cards.
   */
  redirect?: "own-life-face-down";
  /**
   * Which of the controller's Characters this protects, as a filter on the
   * threatened card. Absent means it guards only its own printing, which is how
   * "[printed text omitted -- pnpm card:text <card>]" reads.
   */
  protects?: Omit<CardSelector, "player" | "zone">;
  /**
   * Whether the printed text says "other than this Character" -- OP15-094
   * Roronoa Zoro.
   *
   * Only meaningful alongside `protects`, and not expressible inside it: the
   * selector filters the *threatened* card on printed facts, and this asks
   * whether that card is the protector itself, which is an instance question.
   * It matters because the cost is `trash-self`: without it, Zoro would be
   * offered as an answer to his own removal, paid by trashing himself, which is
   * no answer at all.
   */
  excludesSelf?: boolean;
  /** How the option reads on the table, before "instead of K.O. <target>". */
  label: string;
  /** What is paid. Paying it is what cancels the removal. */
  cost:
    | {
        kind: "trash-from-hand";
        count: number;
        /** Restricts which cards may pay, e.g. "1 Event" or "8000 power". */
        match?: Omit<CardSelector, "player" | "zone">;
        /**
         * Whether the protector rests as well -- "you may rest this Character
         * *and* trash 1 card from your hand instead" (OP12-048 Donquixote
         * Rosinante), the only entry in the registry that charges two things at
         * once.
         */
        restsSelf?: boolean;
      }
    /** "…you may K.O. this Character instead" -- the protector dies in its place. */
    | { kind: "ko-self" }
    /**
     * "…you may rest 1 of your cards instead" (OP14-029 Tashigi), "…you may
     * rest 1 of your Characters instead" (OP14-034 Monkey.D.Luffy).
     *
     * "Your cards" is the Leader, the Characters and the Stage; `match`
     * narrows it where the text does. Only an active card can pay, so the
     * offer is withheld when there is none -- resting a rested card is not a
     * payment.
     */
    | {
        kind: "rest-own-cards";
        count: number;
        match?: Omit<CardSelector, "player" | "zone">;
        /**
         * Which zones the cards may come from, when the printed text names
         * something other than "your cards" or "your Characters" -- OP11-110
         * Fukaboshi's "[printed text omitted -- pnpm card:text OP11-110]", where one half is a Stage and the other is the Leader and
         * neither is on the board at all.
         *
         * Absent, `match` decides as it always has: with a `match` the cards
         * come from the board, and without one they are "your cards" -- the
         * Leader, the Characters and the Stage.
         */
        zones?: readonly CardZone[];
        /** Whether the Leader is eligible, alongside `zones`. */
        includeLeader?: boolean;
      }
    /**
     * "[printed text omitted -- pnpm card:text <card>]" --
     * OP14-016 X.Drake. Always payable, which is what makes it the cheapest
     * protection in the set and the reason it is `[Once Per Turn]`.
     */
    | { kind: "leader-power-penalty"; amount: number }
    /**
     * "…you may give that Character −1000 power during this turn instead of
     * that Character being K.O.'d" -- OP05-001 Sabo's Leader.
     *
     * The penalty lands on the *threatened* card, where
     * `leader-power-penalty` charges the protector's Leader. A save that
     * shrinks the body it saves is what makes it a `[DON!! x1]` rather than a
     * free `[Once Per Turn]`.
     */
    | { kind: "power-penalty"; amount: number }
    /**
     * "…you may trash 1 card from the top of your Life cards instead" --
     * OP05-100 Enel, whose "would leave the field" is also the widest removal
     * reading in the pool.
     *
     * Not `life-to-hand`: the card is lost rather than kept, and no Trigger
     * opens on the way out. Payable only while there is Life to trash.
     */
    | { kind: "trash-life"; count: number }
    /**
     * "[printed text omitted -- pnpm card:text OP14-016]" -- OP14-092 Mr.3(Galdino). Paid only by a player with
     * that many cards in the trash, which in Black is most turns.
     */
    | { kind: "bury-from-trash"; count: number }
    /**
     * "[printed text omitted -- pnpm card:text OP14-092]" -- OP10-034 Franky.
     *
     * Paying with Life is not a loss of the card: it joins the hand, which is
     * what damage would have done anyway. What it costs is the Life total, and
     * it is payable only while there is Life to spend.
     */
    | { kind: "life-to-hand"; count: number }
    /**
     * "[printed text omitted -- pnpm card:text OP10-034]" -- OP10-074 Pica.
     *
     * Distinct from `rest-own-cards`, which rests cards on the field: DON!! sits
     * in the cost area, which `CardZone` cannot name at all. Payable only out of
     * *active* DON!! -- resting a rested DON!! is not a payment.
     */
    | { kind: "rest-don"; count: number }
    /**
     * No cost at all -- "[printed text omitted -- pnpm card:text OP10-074]" (OP10-118 Monkey.D.Luffy).
     *
     * The printed clause is not a "you may pay: instead"; it is an outright
     * prevention, and the once-per-turn budget is the whole price. Modelled as a
     * replacement rather than as an immunity because that budget has to be
     * *spent*: an immunity in `isRemovalImmune` is continuous and would answer
     * every K.O. in the turn, where this answers one.
     */
    | { kind: "none" }
    /**
     * "[printed text omitted -- pnpm card:text <card>]"
     * (OP12-102 Shirahoshi, OP13-109 Jewelry Bonney).
     *
     * The price is information rather than a card: the Life total does not move,
     * and what the opponent gains is knowing what their next attack turns over.
     * Payable only while there is a face-down Life card left to turn, which is
     * what keeps a repeatable protection from being free forever.
     */
    | { kind: "turn-life-face-up" }
    /**
     * "[printed text omitted -- pnpm card:text <card>]" -- EB04-030 Kaido and EB04-031 King, the OP-17 Purple ramp
     * deck's two protected bodies.
     *
     * A cost paid in the resource that deck has most of, which is why neither
     * printing bothers with `[Once Per Turn]`. Payable by anyone with a DON!!
     * on the field, so `eligibleReplacements` gates on `fieldDonCount` and
     * nothing else -- and note that paying it is itself the trigger OP17-062
     * Kaido watches, so on that board the protection can refund itself.
     */
    | { kind: "return-don"; count: number }
    /**
     * "…you may trash this Character instead" -- OP15-094 Roronoa Zoro.
     *
     * Deliberately not `ko-self`: a card trashed by an effect was not K.O.'d,
     * so nothing keyed on a K.O. fires. That is the whole difference between
     * this and OP16-014 Marco, whose `[On K.O.]` plays it straight back, and
     * the reason the two shapes are separate kinds rather than one with a flag.
     * Always payable -- the protector is on the board by definition -- so
     * `eligibleReplacements` has no affordability gate for it.
     */
    | { kind: "trash-self" }
    /**
     * "…you may rest 1 of your **opponent's** Characters instead" -- OP07-029
     * Basil Hawkins, the only printed clause in the pool whose replacement is
     * paid out of the other player's board.
     *
     * `rest-own-cards` is the nearest existing kind and reaches the wrong side
     * of the table: the price here is not a resource the protected player
     * spends, it is tempo taken off the player doing the removing. Payable only
     * while that player has an active Character -- resting a rested Character
     * is not a payment, and neither is having nothing to rest.
     */
    | { kind: "rest-opponent-characters"; count: number }
    /**
     * "…you may place 1 of your Characters other than [X] at the bottom of the
     * owner's deck instead" -- OP07-042 Gecko Moria.
     *
     * A teammate is buried to save the threatened body, which no cost here can
     * express: `bury-from-trash` spends cards already dead, and `ko-self` and
     * `trash-self` both spend the protector rather than letting it choose
     * something else. `match` carries the printed "other than", so a second copy
     * cannot pay for the first with itself.
     */
    | {
        kind: "bottom-deck-own-character";
        count: number;
        match?: Omit<CardSelector, "player" | "zone">;
      }
    /**
     * "…trash this Character and draw 1 card instead" -- OP08-045 Thatch.
     *
     * `trash-self` with a payout, and a separate kind rather than an optional
     * field on it because the two are different cards: Thatch replaces its own
     * removal with a cantrip, which is why it is printed without a
     * `[Once Per Turn]` and without a cost the controller could decline for
     * value. Always payable -- the protector is on the board by definition.
     */
    | { kind: "trash-self-and-draw"; draw: number }
    /**
     * "…you may rest this Character instead" -- ST30-011 Buggy.
     *
     * The cheapest protection in the pool and the only one whose protector
     * survives paying: the body stays on the field and simply cannot block or
     * attack again this turn. `rest-own-cards` is the nearest existing kind and
     * asks a different question -- it lets the controller pick *any* of their
     * active cards, where this names the protector itself, so with two copies
     * out one could pay for the other and the printed clause does not say that.
     *
     * Payable only by an active protector: resting a rested Character is not a
     * payment, and an offer that pays nothing would cancel a removal for free.
     */
    | { kind: "rest-self" }
    /**
     * "…you may return this Character to the owner's hand instead" -- OP10-049
     * Sabo.
     *
     * `trash-self` with the card kept: the protector leaves the field without
     * being K.O.'d, so nothing keyed on a K.O. fires, and it can be played
     * again. Always payable -- the protector is on the board by definition.
     */
    | { kind: "return-self-to-hand" };
}

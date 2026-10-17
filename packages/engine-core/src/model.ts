import type { Phase, PlayerId, PublicEvent } from "@one-piece-sim/protocol";
import type { MechanicInvocation, MechanicPendingChoice } from "./mechanics.js";

import type { RngState } from "@one-piece-sim/protocol";
import { RULES_VERSION } from "./rules-version.js";

export type { RngState };

export interface CardInstance {
  instanceId: string;
  cardNumber: string;
  faceUp?: boolean;
}

/**
 * One "base power becomes N" effect still in force on a Leader or Character.
 *
 * Several can be live on one card at once; `storedBasePower` in
 * `base-power.ts` is the rule that picks between them.
 */
export interface BasePowerSetter {
  value: number;
  expiresAtTurn: number;
  /**
   * "…during this battle" rather than "during this turn" -- OP14-009
   * Trafalgar Law swaps a base power for the length of one fight and no
   * longer. A turn-scoped setter would leave the swap in place for every
   * *later* attack that turn, which on a defensive clause is the difference
   * between one saved battle and a whole turn of them.
   *
   * `expiresAtTurn` is still set, so a battle end that is somehow missed
   * cannot leak the setter past the turn.
   */
  battleScoped?: true;
}

export interface BoardCard extends CardInstance {
  rested: boolean;
  playedTurn?: number;
  attachedDon?: string[];
  powerModifiers?: PowerModifier[];
  costModifiers?: CostModifier[];
  cannotRestUntilTurn?: number;
  /** The card whose effect set `cannotRestUntilTurn`, for surfacing "why" in the UI. */
  cannotRestSourceCardNumber?: string;
  cannotRefreshUntilTurn?: number;
  cannotAttackUntilTurn?: number;
  /**
   * Turn through which this Character may attack only by paying a hand trash --
   * OP08-043 Edward.Newgate's "none of the selected Characters can attack
   * unless your opponent trashes 2 cards from their hand whenever they attack".
   *
   * Not `cannotAttackUntilTurn`, which is an outright ban: this one is a price,
   * and a player holding cards can still swing. `attackTaxHandCards` is how
   * many, because the two halves are read in different places -- `canAttack`
   * asks whether the price is payable and `applyAttack` charges it.
   */
  attackTaxUntilTurn?: number;
  attackTaxHandCards?: number;
  /** The card whose effect set the tax, for surfacing "why" in the UI. */
  attackTaxSourceCardNumber?: string;
  /** The card whose effect set `cannotAttackUntilTurn`, for surfacing "why" in the UI. */
  cannotAttackSourceCardNumber?: string;
  blockerUntilTurn?: number;
  /**
   * Turn through which this Character's attacks cannot be blocked.
   *
   * Granted [Unblockable] is turn-scoped state, exactly like granted [Blocker],
   * so it lives here rather than in the static-ability table. Printed
   * [Unblockable] is read off card text by `hasStaticKeyword`.
   */
  unblockableUntilTurn?: number;
  /**
   * Turn through which this Character may attack the turn it was played.
   *
   * Granted [Rush], the third turn-scoped keyword grant. Printed [Rush] and the
   * conditional kind (ST31-004's field-wide DON!! count) are read by
   * `hasStaticKeyword` off text and `STATIC_ABILITIES`; this is for effects that
   * hand [Rush] to a Character for the turn, like OP17-004.
   */
  rushUntilTurn?: number;
  /**
   * Turn through which this Character's damage banishes the Life card it deals
   * -- trashed instead of taken into hand, and its `[Trigger]` never opens.
   *
   * The fourth turn-scoped keyword grant, and the one the pool prints as a
   * *conditional* reward rather than as a stat: OP10-043 Moocy hands it to a
   * [Monkey.D.Luffy] for a turn, and OP10-097 Gum-Gum Rhino Schneider hands it
   * to whatever it just buffed once the trash is ten deep. Printed [Banish]
   * (OP10-030 Smoker, OP17-024, OP17-065) is read off card text by
   * `hasStaticKeyword`, the same split every other keyword here has.
   */
  banishUntilTurn?: number;
  /**
   * Turn through which this card may attack the opponent's *active* Characters
   * as well as their rested ones.
   *
   * "[printed text omitted -- pnpm card:text OP17-065]" -- OP11's Navy/SWORD package prints it
   * on five cards. Ordinarily only a rested Character is a legal target (the
   * Leader always is), so this widens the target list for one attacker rather
   * than granting a keyword: it changes what the card may point at, not what it
   * may do on the turn it lands the way [Rush: Character] does.
   */
  attacksActiveUntilTurn?: number;
  /**
   * Turn through which this Character cannot be K.O.'d by the opponent's
   * effects.
   *
   * "[printed text omitted -- pnpm card:text <card>]"
   * (OP10-070 Trebol). Written onto each Character the clause reached when it
   * resolved, rather than held as a rule on the player: a lasting effect names
   * the objects on the field at resolution, so a body played afterwards is not
   * protected. Distinct from the continuous immunities in `isRemovalImmune`,
   * which are printed on the card itself and never expire.
   */
  koImmuneToOpponentEffectsUntilTurn?: number;
  /**
   * Turn through which this Character cannot be K.O.'d by *any* effect,
   * its own controller's included.
   *
   * OP04-083 Sabo names no player, where OP10-070 Trebol names the opponent,
   * so the two are separate fields: a protection that also stops its owner's
   * own K.O. effects -- and makes the body unselectable for a "K.O. 1 of your
   * Characters" cost -- must not be read as Trebol's narrower one. Written
   * onto the Characters the clause reached when it resolved, for the same
   * reason as the field above.
   */
  koImmuneToEffectsUntilTurn?: number;
  /**
   * The "base power becomes N" effects in force on this Character.
   *
   * "Becomes" rather than "gains": OP16-058 sets every [Prisoner of Impel Down]
   * to 7000 and OP16-106 sets one card to 7000, and two such clauses must not
   * stack the way modifiers do. Every live setter is kept, because rule 4-9-2-1
   * applies the highest of them rather than the latest, and a lower one comes
   * back into force when a higher one lapses -- see `base-power.ts`. The Leader
   * carries the same thing as `leaderBasePowers`. Optional, so a card nothing
   * has set hashes as it did before.
   */
  basePowerOverrides?: BasePowerSetter[];
  /**
   * Turn through which this Character survives losing a fight.
   *
   * "…cannot be K.O.'d in battle" as a *granted* window rather than as printed
   * text: OP06-030 Dosun hands it to itself until its next turn, and the
   * OP06-096 Event hands it to a whole board for one turn. Distinct from
   * `koImmuneToOpponentEffectsUntilTurn` beside it, which answers the other
   * half of the question -- that one stops an effect's K.O. and leaves a lost
   * battle lethal, and this one is the reverse. Read through `survivesBattleKo`,
   * so the continuous form printed on a card and this granted one are one
   * question at the single site that asks it.
   */
  battleKoImmuneUntilTurn?: number;
  /**
   * Turn through which this Character cannot activate [Blocker].
   *
   * Distinct from not having the keyword: OP16-063 Kuzan switches the ability
   * off for a turn without touching the card's printed text, so a Character
   * negated this way still reads as a Blocker everywhere the text is shown.
   */
  blockerDisabledUntilTurn?: number;
  /** Turn through which this Character's successful attacks deal 2 damage. */
  doubleAttackUntilTurn?: number;
  /** Turn through which this Character may attack Characters the turn it landed. */
  rushCharacterUntilTurn?: number;
  /**
   * Attributes an effect has granted for the turn, and when they lapse.
   *
   * OP15-093 The Risky Brothers is the only clause in the pool that hands a
   * Character an attribute it does not print, and attribute is otherwise a
   * printed fact -- so this is turn-scoped board state beside the keyword
   * grants rather than anything the card database knows about.
   */
  grantedAttributes?: { attributes: string[]; expiresAtTurn: number };
  /**
   * A Character this card's own earlier clause named, and the turn it named it.
   *
   * OP15-008 Krieg is the only card in the pool whose second clause refers back
   * to the target of its first -- "give all of your opponent's Characters −1000
   * power ... for every DON!! card given to *that* Character" -- so the link has
   * to be remembered on the source between the two.
   */
  rememberedTarget?: { instanceId: string; turn: number };
}

export interface StageCard extends CardInstance {
  rested: boolean;
}

export interface PowerModifier {
  amount: number;
  expiresAtTurn: number;
  sourceCardNumber?: string;
  sourceInstanceId?: string;
  /**
   * Lasts until the battle it was given in ends. A Counter played onto a card
   * that is not being attacked is one (Bandai rules Q&A, Keywords #4): the
   * battle's `counterPower` pool defends only the attack's target, so a boost
   * to any other card has to sit on that card. `clearBattleScopedPower` drops
   * it once no battle is open; `expiresAtTurn` is still set as a backstop.
   */
  battleScoped?: true;
}

export interface CostModifier {
  amount: number;
  expiresAtTurn: number;
}

export interface PlayerState {
  leaderCardNumber: string;
  deck: CardInstance[];
  hand: CardInstance[];
  life: CardInstance[];
  board: BoardCard[];
  stage: StageCard | null;
  trash: CardInstance[];
  donDeck: string[];
  activeDon: string[];
  restedDon: string[];
  leaderAttachedDon: string[];
  leaderPowerModifiers: PowerModifier[];
  leaderRested: boolean;
  activateDonAtEndOfTurn: number;
  handTrashedByEffectTurn?: number;
  /**
   * A pending discount on the next card played from hand that matches it, as
   * the OP12-061 Leader's `[Activate: Main]` grants.
   *
   * Optional, and cleared the moment it is spent or the turn it was granted
   * ends, so a game in which nobody grants one serializes and hashes exactly as
   * it did before discounts existed.
   */
  playDiscount?: {
    name: string;
    minCost: number;
    amount: number;
    turn: number;
  };
  /**
   * The "base power becomes N" effects in force on this player's Leader --
   * OP17-034 Rockstar and its set, OP16-106, OP14-009's battle-long swap.
   *
   * Setters rather than modifiers because the clause replaces rather than adds:
   * two deltas over printed power would sum where the printed text says the
   * Leader simply takes a number. Rule 4-9-2-1 then picks the highest live one
   * (`storedBasePower`), which `currentPower` reads in place of the printed
   * power, so static layers and modifiers still land on top of it. Optional,
   * so a game in which nobody prints the clause hashes as it did before.
   */
  leaderBasePowers?: BasePowerSetter[];
  /**
   * Turn through which this player's Leader cannot be blocked.
   *
   * The Leader's half of `BoardCard.unblockableUntilTurn`, and separate from it
   * because a Leader is in no zone: it has no `BoardCard` to carry the flag.
   * OP17-115 is the first card in the pool to grant the keyword to a Leader
   * rather than to a Character. Optional, so a game in which nobody grants it
   * hashes exactly as it did before.
   */
  leaderUnblockableUntilTurn?: number;
  /** Turn through which the Leader's successful attacks deal 2 damage. */
  leaderDoubleAttackUntilTurn?: number;
  /**
   * Turn through which the Leader has a granted [Blocker].
   *
   * The Leader's half of `BoardCard.blockerUntilTurn`. OP16-048 Buggy grants
   * [Blocker] to a "[Prisoner of Impel Down]", and a Leader treated as having
   * every card name is one. Optional, so a game in which nobody grants it
   * hashes exactly as it did before.
   */
  leaderBlockerUntilTurn?: number;
  /**
   * Turn through which the Leader's damage trashes the Life card instead of
   * handing it over.
   *
   * The Leader's half of `BoardCard.banishUntilTurn`, and separate for the
   * reason every other Leader flag here is: a Leader is in no zone and has no
   * board entry to carry one. ST28-002 Izo is the first card in the pool to
   * grant [Banish] to a Leader rather than to a Character -- which is worth
   * more on OP06-022 than on any Character, because [Double Attack] takes two
   * Life cards and would otherwise hand back two Triggers.
   */
  leaderBanishUntilTurn?: number;
  /**
   * Turn through which this player's *Leader* may attack active Characters --
   * the Leader's half of `BoardCard.attacksActiveUntilTurn`, and separate for
   * the same reason every other Leader flag here is: a Leader has no board
   * entry to carry one. OP11-010 Hibari and OP11-014 Borsalino both name the
   * Leader as an eligible recipient.
   */
  leaderAttacksActiveUntilTurn?: number;
  /**
   * Cards this player's effects have booked something for at the end of the
   * turn, and what is owed on each.
   *
   * "[printed text omitted -- pnpm card:text OP11-014]" (OP11-092 Helmeppo) and "[printed text omitted -- pnpm card:text OP11-092]" (OP11-107 Topknot Neptunian).
   * Neither is an `[End of Your Turn]` clause -- nothing is printed on the card
   * that *does* it; the clause that resolved earlier owes it -- so it is booked
   * here and paid by `completeEndTurn`, the same shape
   * `activateDonAtEndOfTurn` has.
   *
   * `turn` is the turn it was booked on, so a debt that somehow survives its own
   * turn is dropped rather than paid late.
   */
  endOfTurnCardActions?: readonly {
    kind: "bury" | "set-active" | "trash";
    instanceId: string;
    turn: number;
  }[];
  /**
   * DON!! this player owes back at the end of the turn, down to the opponent's
   * field count -- OP08-074 Black Maria's borrowed five.
   *
   * Booked the same way `endOfTurnCardActions` is, and for the same reason:
   * nothing is printed on a card that *does* the return. The source is carried
   * so that `returnDonToDeck` can attribute the choice of which DON!! go back,
   * which is a decision the player still makes.
   */
  endOfTurnDonEqualize?: readonly {
    turn: number;
    sourceCardNumber: string;
    sourceInstanceId: string;
  }[];
  /**
   * Life cards this player is owed off the top of their own deck at the end of
   * the turn -- OP08-101 Charlotte Angel.
   *
   * A count rather than a bound card: the printed clause takes whatever is on
   * top when the turn ends, which is not the card that was there when the
   * activation resolved.
   */
  endOfTurnLifeFromDeck?: readonly { turn: number; count: number }[];
  /**
   * Turn through which this player cannot set DON!! cards as active using
   * Character effects -- "[printed text omitted -- pnpm card:text <card>]" (OP10-030 Smoker).
   *
   * A restriction on the *player* rather than on any card, which is why it sits
   * here beside `cannotPlayCharactersUntilTurn`: it applies to every Character
   * effect the player might resolve for the rest of the turn, including ones
   * from cards not yet played. A Leader's or an Event's activation is untouched,
   * which is the whole reason the clause names Characters.
   */
  cannotActivateDonByCharacterUntilTurn?: number;
  /**
   * Rested DON!! that will not become active in this player's next Refresh
   * Phase -- "[printed text omitted -- pnpm card:text <card>]" (OP10-033 Nami).
   *
   * A count rather than a set of DON!! ids: the cards are interchangeable, and
   * the printed clause is about how many come back rather than which. Spent by
   * the next refresh that reads it, so it never survives into a second turn.
   */
  donHeldFromRefresh?: number;
  /**
   * Active DON!! this player rests at the start of their next Main Phase --
   * "your opponent rests 1 of their active DON!! cards at the start of their
   * next Main Phase" (PRB02-005 Monkey.D.Luffy).
   *
   * Distinct from {@link donHeldFromRefresh} above, which the two clauses make
   * easy to confuse: that one holds back DON!! that is *already rested* when
   * the Refresh Phase reads it, so a player who ended the turn with everything
   * active pays nothing. This one is booked against the DON!! pool as it stands
   * after the refresh and the turn's two new DON!!, which is what "at the start
   * of their next Main Phase" names, and so always costs its target a DON!!.
   *
   * A count rather than a set of ids, for the same reason every other DON!!
   * node takes one: the cards are interchangeable. Spent by the turn that reads
   * it, so it never survives into a second one.
   */
  donRestedAtNextMain?: number;
  /**
   * The turn through which this player's Leader stays rested past a Refresh
   * Phase -- the Leader half of {@link BoardCard.cannotRefreshUntilTurn}.
   *
   * On the player because a Leader is in no zone and has no `BoardCard` to
   * carry the flag, the same reason `leaderRested` lives here. The one clause
   * that writes it is the OP07-059 Foxy Leader's, which names "your opponent's
   * rested Leader and up to 1 Character card" in one sentence -- so the two
   * halves of a single printed selection would otherwise be honoured for the
   * Character and dropped for the Leader.
   *
   * Optional, so a game in which nobody holds a Leader back serializes and
   * hashes exactly as it did before the field existed.
   */
  leaderCannotRefreshUntilTurn?: number;
  /**
   * The turn on which this player's deck last stood at 0 cards, recorded only
   * under a Leader that defers the deck-out loss (OP15-022 Brook).
   *
   * That Leader loses at the end of the turn in which the deck *became* 0, and
   * Bandai rules a deck refilled later in the same turn still loses (OP15-022
   * Q1), so the end-of-turn check cannot read the deck's size alone.
   * Optional, so every other game serializes and hashes as before.
   */
  deckEmptiedOnTurn?: number;
  /**
   * The turn through which this player's Leader cannot attack at all --
   * OP06-023 Arlong names "your opponent's rested Leader" and locks it out of
   * attacking until the end of its controller's next turn.
   *
   * On the player for the same reason `leaderCannotRefreshUntilTurn` is: a
   * Leader has no `BoardCard` to carry a flag. Distinct from
   * `leaderCannotAttackCharactersUntilTurn`, which narrows *which* attacks are
   * legal -- this one bars the declaration outright, which is what the printed
   * sentence says.
   */
  leaderCannotAttackUntilTurn?: number;
  /**
   * Turn through which this player cannot attack the opposing *Leader* --
   * OP06-026 Koushirou's price for setting one of its own Characters active.
   *
   * The mirror of `leaderCannotAttackCharactersUntilTurn`: that one restricts
   * one attacker and leaves every target but Characters open, and this one
   * restricts every attacker and closes one target. Read in
   * `legal-actions/main/attacks.ts`, where an attack's target list is built.
   */
  cannotAttackLeadersUntilTurn?: number;
  /**
   * Turn through which this player cannot move their own Life cards to their
   * hand with their own effects -- the second half of the OP06-020 Hody Jones
   * Leader's activation.
   *
   * The Fish-Man decks spend Life as a resource, so this is a real price: the
   * Leader's own rest-and-lock costs it the turn's Life draws. Enforced in the
   * `move` node, the same seam `cannotDrawByEffectUntilTurn` is enforced at,
   * and for the same reason -- every declarative clause that adds a Life card
   * to a hand goes through it.
   */
  cannotLifeToHandUntilTurn?: number;
  mulliganDecision: "pending" | "keep" | "mulligan";
  /**
   * Private knowledge this player holds about a deck's top card, recorded when
   * an effect legitimately shows it to them.
   *
   * Stored by instance so it self-invalidates: `observe` only reports the entry
   * when the referenced instance is still the top card of the relevant deck.
   * Both fields are optional so a game in which nobody looks at a deck
   * serializes and hashes exactly as it did before knowledge existed.
   */
  knownOwnDeckTop?: CardInstance;
  knownOpponentDeckTop?: CardInstance;
  /**
   * Turn through which this player cannot play Character cards.
   *
   * "[printed text omitted -- pnpm card:text <card>]" (OP17-085
   * Dorry, OP17-092 Brogy) is the format's first player-wide restriction --
   * every other `restrict` in the pool is scoped to one card instance. A
   * Stage and an Event stay playable; only the Character half of the turn
   * is shut off. Optional, so a game in which nobody grants it hashes
   * exactly as it did before the restriction existed.
   */
  cannotPlayCharactersUntilTurn?: number;
  /**
   * A K.O. replacement this player installed for a window, rather than one
   * printed on a card that is on the field.
   *
   * EB02-030 "And That's When Somebody Makes Fun of Their Friend's Dream!!!!"
   * is the only clause in the pool shaped this way: its `[Counter]` buys "if
   * any of your Characters would be K.O.'d in battle during this turn, you may
   * trash 1 card from your hand instead", and the Event that bought it is in
   * the trash before the first Character is threatened. Every other entry in
   * the replacement registry is found by walking the board and the Leader, so
   * nothing there can see it.
   *
   * The card number is the registry key, so what the protection costs and what
   * it answers stay in `mechanics/eb02-triggers.ts` with the rest of the set's
   * programs. A second copy played in the same turn overwrites the first rather
   * than stacking: the printed clause is a permission for the turn, and two
   * permissions are one.
   *
   * Optional, so a game in which nobody plays it hashes exactly as it did
   * before the clause existed.
   */
  installedReplacements?: readonly {
    cardNumber: string;
    expiresAtTurn: number;
  }[];
  /**
   * A printed-cost floor on `cannotPlayCharactersUntilTurn` -- "[printed text omitted -- pnpm card:text OP17-092]" (OP12-030
   * Dracule Mihawk, whose own clause sets four DON!! active and then bars the
   * expensive plays that DON!! would have paid for).
   *
   * Absent, the ban is total, which is the reading OP17-085 and OP17-092 print.
   */
  cannotPlayCharactersMinCost?: number;
  /**
   * Turn through which this player's *Leader* cannot attack the opponent's
   * cheap Characters -- OP12-020 Roronoa Zoro's "[Activate: Main] ... Then,
   * this Leader cannot attack your opponent's Characters with a base cost of 7
   * or less during this turn."
   *
   * A restriction on one card rather than on the player, but that card is the
   * Leader, which has no `BoardCard` to carry it -- the same reason
   * `leaderRested` and `leaderAttachedDon` live here. It also narrows *which*
   * attacks are illegal rather than banning them outright, which is why it is
   * not `cannotAttackUntilTurn`: the Leader may still hit the opposing Leader,
   * and that is the whole point of the clause it is the price of.
   */
  leaderCannotAttackCharactersUntilTurn?: number;
  /** The printed-cost ceiling on the restriction above. */
  leaderCannotAttackCharactersMaxBaseCost?: number;
  /**
   * Turn through which this player cannot draw cards with their own effects --
   * "[printed text omitted -- pnpm card:text OP17-092]"
   * (OP12-099 Kalgara, the price of its own free draw).
   *
   * A restriction on the player, like the two above it: it applies to every
   * effect they might resolve for the rest of the turn. The draw *for the turn*
   * is untouched -- that is a rule, not an effect -- which is what "using your
   * own effects" says.
   */
  cannotDrawByEffectUntilTurn?: number;
  /**
   * Turn through which this player's `[On Play]` effects do not resolve --
   * OP09-081 Marshall.D.Teach's Leader switches the *opponent's* off for a
   * turn, and its own side's off permanently through a static rule.
   *
   * A restriction on the player rather than on any card: it reaches every
   * Character they play for the rest of the window, including one played by
   * another card's effect, which is what the printed clause says.
   */
  onPlayNegatedUntilTurn?: number;
  /**
   * Turn through which this player cannot play *any* card from hand -- "[printed text omitted -- pnpm card:text <card>]" (OP13-028 Shanks,
   * which sets all ten DON!! active and then bars spending them).
   *
   * Wider than `cannotPlayCharactersUntilTurn`: Events and Stages are barred
   * too, and so is a play an effect makes out of hand.
   */
  cannotPlayFromHandUntilTurn?: number;
  /**
   * DON!! to add from the DON!! deck at the end of this turn -- "[printed text omitted -- pnpm card:text OP13-028]" (OP13-066 Silvers Rayleigh).
   *
   * The sibling of `activateDonAtEndOfTurn`, which un-rests DON!! already on the
   * field; this brings new DON!! on. Both are paid by `completeEndTurn`, and for
   * the same reason: the clause is owed *after* the turn's spending, not before.
   */
  addDonAtEndOfTurn?: number;
  /**
   * Extra turns this player is owed once the current one ends -- "take an
   * extra turn after this one" (OP05-119 Monkey.D.Luffy).
   *
   * A count on the player rather than a flag on the state, because two copies
   * resolving in one turn owe two turns, and because the booking belongs to
   * whoever made it rather than to whoever's turn it happens to be. Read and
   * decremented by `completeEndTurn`; optional, so a game in which nobody
   * prints the clause hashes exactly as it did before.
   */
  extraTurns?: number;
}

export interface ActiveAttack {
  attackerPlayerId: PlayerId;
  defenderPlayerId: PlayerId;
  attackerInstanceId: string;
  targetInstanceId: string;
  /**
   * Power this battle has granted the attacker on top of its live board power
   * -- "gains +N power during this battle", and nothing else. The attacker's
   * actual power is `battleAttackPower`, which adds this to `currentPower` at
   * every read, exactly as the defending side adds `counterPower`.
   *
   * Never the attacker's total. A battle-scoped bonus has to live somewhere
   * outside the card (a `powerModifier` is turn-scoped at its shortest, and
   * would leave the card defending later attacks that turn at the raised
   * number), but a total frozen here at declaration silently dropped every
   * mid-battle change to the card underneath it.
   */
  battleAttackBonus: number;
  counterPower: number;
  /**
   * Whether the defender has already been asked about a replacement for this
   * battle's K.O.
   *
   * `resolveBattle` is re-entered once the answer comes back, so without this it
   * would ask again and never resolve. Only the OP12-061 Leader reaches it: its
   * protection is the one in the pool that is not scoped to "your opponent's
   * effect", and battle destruction is therefore inside it.
   */
  /**
   * Whether [Blocker] has been switched off for this battle -- OP06-055
   * Monkey.D.Garp's "[When Attacking] ... your opponent cannot activate
   * [Blocker] during this battle".
   *
   * On the battle rather than on the defending cards because that is the
   * clause's own window: the shortest card-scoped hold the engine has
   * (`blockerDisabledUntilTurn`) lasts the rest of the turn, and would go on
   * barring blocks against the attacker's later attacks.
   */
  blockersDisabled?: boolean;
  /**
   * DON!! given to the defender's Leader when the attack was declared.
   *
   * An `[On Your Opponent's Attack]` ability triggers on the declaration, so a
   * `[DON!! xN]` in front of it has to be met then: a DON!! the attacker's own
   * `[When Attacking]` hands the defender's Leader afterwards does not switch
   * it on (OP15-012 Q5, against OP11-041 Nami). Absent on a battle built
   * without a declaration, where the current count is all there is to read.
   */
  defenderLeaderDonAtDeclaration?: number;
  koReplacementOffered?: boolean;
  /**
   * Instance ids whose `[On Your Opponent's Attack]` ability has already been
   * offered in this battle.
   *
   * Scoped to the battle rather than to the turn because that is the ability's
   * actual window: the same Character may be offered again when the next attack
   * comes in, and a `[Once Per Turn]` clause is held to one *use* by
   * `state.oncePerTurn` separately. Keeping it here rather than in `oncePerTurn`
   * also makes the guard exact -- a turn key would have to name the attack, and
   * two attacks by the same attacker in one turn would collide.
   *
   * Getting this wrong fails quietly in both directions: an ability offered
   * forever, or a second source silently dropped. See `offerAttackReactions`.
   */
  onOpponentAttackOffered?: string[];
  /**
   * The `[On Your Opponent's Attack]` offer waiting for an answer, and the
   * `[Once Per Turn]` key its acceptance spends.
   *
   * Absent for a clause with no `[Once Per Turn]`. Declining must not spend the
   * turn's use -- the player was pushed into the decision by an attack, unlike
   * an `[Activate: Main]` they went looking for -- so the key cannot be marked
   * when the offer is made. It is marked here on the first answer that is not
   * "skip".
   */
  onOpponentAttackPending?: {
    sourceInstanceId: string;
    oncePerTurnKey: string;
  };
  /**
   * Instance ids whose "your Leader attacks or is attacked" watcher ability
   * (e.g. OP17-040 Edward.Newgate) has already been offered in this battle.
   *
   * Mirrors `onOpponentAttackOffered`, but the source scanned is not always the
   * defender's board: a watcher fires from its own controller's board whether
   * that controller is the attacker (their Leader is attacking) or the
   * defender (their Leader is the target), so one attack can offer sources on
   * both sides. Instance ids never collide across players, so one array
   * suffices for both. See `leaderWatcherSources` in `engine.ts`.
   */
  leaderWatcherOffered?: string[];
  /**
   * The leader-watcher offer waiting for an answer, and the `[Once Per Turn]`
   * key its acceptance spends. Same contract as `onOpponentAttackPending`.
   */
  leaderWatcherPending?: {
    sourceInstanceId: string;
    oncePerTurnKey: string;
  };
}

export interface PendingTrigger {
  playerId: PlayerId;
  card: CardInstance;
  /**
   * Where to hand control back once the Trigger resolves.
   *
   * Battle damage does not need it: the attack itself says where to return, so
   * a Trigger raised by `resolveBattle` leaves this unset and resumes into the
   * attacker's Main phase. Damage dealt by an *effect* has no battle to read --
   * EB03-055 Nico Robin deals 1 damage from an [On K.O.] that can resolve in the
   * middle of the opponent's Main phase -- so that path records the phase and
   * player it interrupted.
   */
  resume?: {
    phase: "main" | "block" | "counter";
    playerId: PlayerId;
  };
  /**
   * Set while the damaged card is still waiting for the engine to decide
   * whether a Trigger window opens at all.
   *
   * Damage from an effect is raised inside the mechanics interpreter, which
   * cannot see which Triggers the engine knows how to run. It parks the card
   * here and `settleEffectDamage` either opens the window or puts the card in
   * its owner's hand.
   */
  fromEffect?: boolean;
}

/**
 * DON!! already sent back to the DON!! deck by `DON!! −N`, recorded between the
 * moment the cost is paid and the moment its controller says where each card
 * should have come from. See `returnDonToDeck`.
 */
export interface DonReturnRecord {
  playerId: PlayerId;
  sourceCardNumber: string;
  sourceInstanceId: string;
  /**
   * One pool name per returned DON!!: `"active"`, `"rested"`, or the instance
   * id of the Leader or Character it had been given to.
   */
  origins: string[];
  /**
   * The DON!! still on the field once the automatic pick had taken its share:
   * the only cards a re-homing may swap for. A reaction to the return --
   * OP14-068 Trebol, ST34-001 Katakuri -- adds DON!! in the same action, and
   * those arrived because the cost was paid, so they cannot have paid it.
   */
  onFieldAtPayment: string[];
}

export type PendingEffect =
  | {
      /**
       * Naming which DON!! a `DON!! −N` cost took off the field.
       *
       * Raised after the paying action has finished resolving, so the effect
       * bodies that pay the cost never have to stop mid-flight. `displaced`
       * holds whatever decision the action had already queued -- returning DON!!
       * is frequently the prelude to a K.O. or a search -- and is restored once
       * every returned DON!! has a home.
       */
      kind: "return-don";
      playerId: PlayerId;
      sourceCardNumber: string;
      sourceInstanceId: string;
      /** Pools the automatic pick drew from, still awaiting confirmation. */
      origins: string[];
      /**
       * `DonReturnRecord.onFieldAtPayment`, carried only when a DON!! has
       * reached the field since the cost was paid -- otherwise every DON!! on
       * the field qualifies and the list would say nothing.
       */
      onFieldAtPayment?: string[];
      resumePhase: Phase;
      resumePlayerId: PlayerId;
      displaced: PendingEffect | null;
    }
  | {
      kind: "mechanic-choice";
      playerId: PlayerId;
      sourceCardNumber: string;
      sourceInstanceId: string;
      choice: MechanicPendingChoice;
      continuations?: MechanicInvocation[];
      /**
       * Set when this choice came from an `[End of Your Turn]` program, so
       * answering it re-enters `endTurn` rather than completing it.
       *
       * Keyed on the pending effect rather than on the source card number,
       * which is what it used to be: OP16-030 Trafalgar Law prints both an
       * `[On Play]` and an `[End of Your Turn]`, and answering the On Play's
       * target choice re-entered the end-of-turn flow mid-Main-phase -- which
       * ran Law's own board refresh five turns early.
       */
      endOfTurn?: true;
      /**
       * Set when this choice came from an `[Activate: Main]` the player
       * clicked, so the marker that names the cause can be raised on the
       * action the clause's steps actually land on.
       *
       * Carried rather than recomputed: an ability that stops to ask which
       * card pays its cost resolves on the *answer*, and by then the only
       * thing still pointing at the activation is this pending effect. See
       * `ability-activated`.
       */
      activatedBy?: PlayerId;
    }
  | {
      kind: "character-area-replacement";
      playerId: PlayerId;
      sourceCardNumber: string;
      sourceInstanceId: string;
      eligibleInstanceIds: string[];
      card: CardInstance;
      rested: boolean;
    }
  | {
      kind: "st35-attack-cost";
      playerId: PlayerId;
      targetPlayerId: PlayerId;
      sourceCardNumber: "ST35-003" | "OP12-090";
      sourceInstanceId: string;
      eligibleInstanceIds: string[];
      resumePlayerId: PlayerId;
    }
  | {
      kind: "reduce-cost";
      playerId: PlayerId;
      targetPlayerId: PlayerId;
      sourceCardNumber: string;
      sourceInstanceId: string;
      eligibleInstanceIds: string[];
      amount: number;
      expiresAtTurn: number;
      resumePlayerId: PlayerId;
    }
  | {
      kind: "p105-life-cost";
      playerId: PlayerId;
      sourceCardNumber: "P-105";
      sourceInstanceId: string;
      eligibleInstanceIds: string[];
    }
  | {
      kind: "add-top-deck-to-life";
      playerId: PlayerId;
      sourceCardNumber: string;
      sourceInstanceId: string;
    }
  | {
      kind: "ko-character";
      playerId: PlayerId;
      targetPlayerId: PlayerId;
      sourceCardNumber: string;
      sourceInstanceId: string;
      eligibleInstanceIds: string[];
      resumePhase?: "main" | "block" | "counter";
      resumePlayerId?: PlayerId;
    }
  | {
      kind: "rest-character";
      playerId: PlayerId;
      targetPlayerId: PlayerId;
      sourceCardNumber: string;
      sourceInstanceId: string;
      eligibleInstanceIds: string[];
      remaining?: number;
      afterRest?: "give-three-don-to-leader" | "schedule-active-don";
    }
  | {
      kind: "draw-trash";
      playerId: PlayerId;
      sourceCardNumber: string;
      sourceInstanceId: string;
      trashCount: number;
      resumePhase?: "main" | "block" | "counter";
      resumePlayerId?: PlayerId;
    }
  | {
      kind: "kinemon-cost";
      playerId: PlayerId;
      sourceCardNumber: string;
      sourceInstanceId: string;
    }
  | {
      kind: "prevent-rest";
      playerId: PlayerId;
      targetPlayerId: PlayerId;
      sourceCardNumber: string;
      sourceInstanceId: string;
      eligibleInstanceIds: string[];
      expiresAtTurn: number;
    }
  | {
      kind: "rest-opponent-card";
      playerId: PlayerId;
      targetPlayerId: PlayerId;
      sourceCardNumber: string;
      sourceInstanceId: string;
      eligibleInstanceIds: string[];
      remaining: number;
    }
  | {
      kind: "prevent-refresh";
      playerId: PlayerId;
      targetPlayerId: PlayerId;
      sourceCardNumber: string;
      sourceInstanceId: string;
      eligibleInstanceIds: string[];
      remaining: number;
      expiresAtTurn: number;
    }
  | {
      kind: "search-top-five";
      playerId: PlayerId;
      sourceCardNumber: string;
      sourceInstanceId: string;
      revealed: CardInstance[];
      eligibleInstanceIds: string[];
      /** Cards to trash from hand once the search resolves, as OP15-118 asks. */
      thenTrash?: number;
      resumePhase?: "main";
      resumePlayerId?: PlayerId;
    }
  | {
      kind: "free-play";
      playerId: PlayerId;
      sourceCardNumber: string;
      sourceInstanceId: string;
      eligibleInstanceIds: string[];
      returnDon?: number;
      resumePhase?: "main";
      resumePlayerId?: PlayerId;
    }
  | {
      kind: "navy-discard";
      playerId: PlayerId;
      sourceCardNumber: string;
      sourceInstanceId: string;
      eligibleInstanceIds: string[];
      remaining: number;
      optional: boolean;
      leaderDrawCount?: number;
      after:
        | { kind: "draw"; count: number }
        | {
            kind: "bottom-deck";
            targetPlayerId: PlayerId;
            eligibleInstanceIds: string[];
            remaining: number;
          }
        | {
            kind: "prevent-attack";
            targetPlayerId: PlayerId;
            eligibleInstanceIds: string[];
            expiresAtTurn: number;
            remaining: number;
          }
        | { kind: "opponent-discard"; targetPlayerId: PlayerId }
        | { kind: "none" };
      resumePhase?: "main" | "block" | "counter";
      resumePlayerId?: PlayerId;
    }
  | {
      /**
       * OP07-056 Slave Arrow: the [Counter] Event is paid for by returning one
       * of your own Characters with a cost of 2 or more to hand.
       *
       * Every other Counter Event in the format either costs only DON!! or
       * discards from hand, so this is the first one whose cost is paid off the
       * board. The counter power is only added once the cost is paid, which is
       * what "You may X: Y" means.
       */
      kind: "slave-arrow-cost";
      playerId: PlayerId;
      sourceCardNumber: string;
      sourceInstanceId: string;
      eligibleInstanceIds: string[];
      power: number;
      resumePhase: "counter";
      resumePlayerId: PlayerId;
    }
  | {
      /**
       * The target's controller deciding whether a replacement effect applies.
       *
       * By the rules "would be K.O.'d ... you may X instead" is the *target
       * controller's* choice. The engine used to offer the replacements in the
       * same list as the K.O. targets, which handed the decision to the player
       * whose effect was doing the removing -- documented as a known defect in
       * `analysis/architecture-refactor-2026-08-07.md`. This is the second step
       * that document said it needed: the source picks the target, then control
       * passes here.
       */
      kind: "replacement-choice";
      /** The deciding player: the controller of the threatened Character. */
      playerId: PlayerId;
      /** The player whose effect is doing the removing. */
      sourcePlayerId: PlayerId;
      targetInstanceId: string;
      sourceCardNumber: string;
      sourceInstanceId: string;
      options: Array<{ optionId: string; summary: string; mandatory?: true }>;
      resumePhase?: "main" | "block" | "counter";
      resumePlayerId?: PlayerId;
    }
  | {
      kind: "bottom-deck-character";
      playerId: PlayerId;
      targetPlayerId: PlayerId;
      sourceCardNumber: string;
      sourceInstanceId: string;
      eligibleInstanceIds: string[];
      remaining: number;
      resumePhase?: "main" | "block" | "counter";
      resumePlayerId?: PlayerId;
    }
  | {
      kind: "prevent-attack";
      playerId: PlayerId;
      targetPlayerId: PlayerId;
      sourceCardNumber: string;
      sourceInstanceId: string;
      eligibleInstanceIds: string[];
      remaining: number;
      expiresAtTurn: number;
      resumePhase?: "main" | "block" | "counter";
      resumePlayerId?: PlayerId;
    }
  | {
      /**
       * OP17-045 Kyo's replacement: "[printed text omitted -- pnpm card:text OP17-045]" One card at a time from hand to
       * trash.
       */
      kind: "hand-trash-replacement";
      playerId: PlayerId;
      sourceCardNumber: string;
      sourceInstanceId: string;
      eligibleInstanceIds: string[];
      remaining: number;
      /**
       * Cards OP12-040 Kuzan's Leader owes for the cards already trashed in
       * this payment, drawn once the last one is paid so a drawn card is never
       * offered as the rest of the payment. See `navyHandTrashDraws`.
       */
      leaderDrawCount?: number;
      resumePhase?: "main" | "block" | "counter";
      resumePlayerId?: PlayerId;
    }
  | {
      kind: "opponent-discard";
      playerId: PlayerId;
      sourcePlayerId: PlayerId;
      sourceCardNumber: string;
      sourceInstanceId: string;
      eligibleInstanceIds: string[];
      /** Cards still to trash. Absent means one, which is what ST35-003 asks. */
      remaining?: number;
      resumePhase: "main" | "block";
      resumePlayerId: PlayerId;
    }
  /**
   * "[printed text omitted -- pnpm card:text ST35-003]" -- the OP12-061 Leader's
   * protection, offered to the defender in the middle of `resolveBattle` and
   * before the target is moved to the trash.
   *
   * Every other replacement in the pool is scoped to "your opponent's effect"
   * and reaches the player through `knockOut`'s hook. This one is not scoped
   * that way, so battle destruction is inside it and the battle itself has to
   * stop and ask.
   */
  | {
      kind: "battle-ko-replacement";
      playerId: PlayerId;
      targetInstanceId: string;
      sourceCardNumber: string;
      sourceInstanceId: string;
      /**
       * Whether the OP12-061 Leader's own "add the top Life card instead" is
       * one of the answers. It is not, when the window was opened only by a
       * registered replacement.
       */
      lifeProtection?: boolean;
      /**
       * Registered replacements (`mechanic:…`) that may answer this battle.
       *
       * OP14-092 Mr.3(Galdino) is the first entry whose printed text does not
       * say "by your opponent's effect", so battle destruction is inside it and
       * the registry has to reach this window rather than only `knockOut`'s.
       */
      mechanicOptions?: { optionId: string; summary: string }[];
    }
  | {
      kind: "navy-search";
      playerId: PlayerId;
      sourceCardNumber: string;
      sourceInstanceId: string;
      revealed: CardInstance[];
      eligibleInstanceIds: string[];
      remaining: number;
    }
  | {
      kind: "reduce-power";
      playerId: PlayerId;
      targetPlayerId: PlayerId;
      sourceCardNumber: string;
      sourceInstanceId: string;
      amount: number;
      expiresAtTurn: number;
      remaining: number;
      applyAllAtOnce?: boolean;
      resumePhase: "main" | "block";
      resumePlayerId: PlayerId;
      afterKoPowerAtMost?: number;
    }
  | {
      kind: "give-rested-don";
      playerId: PlayerId;
      sourceCardNumber: string;
      sourceInstanceId: string;
      eligibleInstanceIds: string[];
      maxCount: number;
      remainingTargets?: number;
      /**
       * Which DON!! pile the card comes out of. Absent means rested, the
       * printed "give up to N rested DON!! cards" every card but OP15-023
       * Arlong carries -- whose text takes it "from its owner's cost area".
       */
      from?: "active";
      resumePhase: "main";
      resumePlayerId: PlayerId;
    }
  | {
      kind: "return-own-for-free-play";
      playerId: PlayerId;
      sourceCardNumber: "OP16-045";
      sourceInstanceId: string;
      eligibleInstanceIds: string[];
    }
  | {
      kind: "grant-prisoner-blocker";
      playerId: PlayerId;
      sourceCardNumber: "OP16-048";
      sourceInstanceId: string;
      eligibleInstanceIds: string[];
      resumePlayerId: PlayerId;
    }
  | {
      kind: "gatling-gun";
      playerId: PlayerId;
      sourceCardNumber: "OP13-021";
      sourceInstanceId: string;
      stage: "give-don" | "reduce-power";
      eligibleInstanceIds: string[];
    }
  | {
      kind: "bad-manners-counter";
      playerId: PlayerId;
      sourceCardNumber: string;
      sourceInstanceId: string;
      eligibleInstanceIds: string[];
    }
  | {
      kind: "discard-for-life";
      playerId: PlayerId;
      sourceCardNumber: string;
      sourceInstanceId: string;
      eligibleInstanceIds: string[];
      resumePhase?: "main";
      resumePlayerId?: PlayerId;
    }
  | {
      kind: "discard-supernova-draw-two";
      playerId: PlayerId;
      sourceCardNumber: string;
      sourceInstanceId: string;
      eligibleInstanceIds: string[];
      resumePhase?: "main";
      resumePlayerId?: PlayerId;
    }
  | {
      kind: "bege-life-swap";
      playerId: PlayerId;
      sourceCardNumber: string;
      sourceInstanceId: string;
      stage: "take-life" | "place-life";
      eligibleInstanceIds: string[];
    }
  | {
      kind: "move-character-to-life";
      playerId: PlayerId;
      targetPlayerId: PlayerId;
      sourceCardNumber: string;
      sourceInstanceId: string;
      eligibleInstanceIds: string[];
    }
  | {
      kind: "free-play-rested";
      playerId: PlayerId;
      sourceCardNumber: string;
      sourceInstanceId: string;
      eligibleInstanceIds: string[];
      resumePhase?: "main";
      resumePlayerId?: PlayerId;
    }
  | {
      kind: "trash-opponent-life";
      playerId: PlayerId;
      targetPlayerId: PlayerId;
      sourceCardNumber: string;
      sourceInstanceId: string;
      resumePhase?: "main";
      resumePlayerId?: PlayerId;
    }
  | {
      kind: "kid-leader-end-turn";
      playerId: PlayerId;
      sourceCardNumber: "OP10-099";
      sourceInstanceId: string;
      eligibleInstanceIds: string[];
    }
  /**
   * OP16-073 Borsalino: "[printed text omitted -- pnpm card:text OP16-073]"
   *
   * Each copy on the board is its own decision, so this is offered once per
   * eligible Borsalino rather than once per turn; `endTurn` re-runs after each
   * resolution until none is left.
   */
  | {
      kind: "borsalino-end-turn";
      playerId: PlayerId;
      sourceCardNumber: "OP16-073";
      sourceInstanceId: string;
      eligibleInstanceIds: string[];
    }
  | {
      kind: "st34-discard";
      playerId: PlayerId;
      targetPlayerId: PlayerId;
      sourceCardNumber: string;
      sourceInstanceId: string;
      eligibleInstanceIds: string[];
      after: "linlin" | "perospero";
    }
  | {
      kind: "st34-guess-cost";
      playerId: PlayerId;
      targetPlayerId: PlayerId;
      sourceCardNumber: string;
      sourceInstanceId: string;
      outcome: "oven" | "perospero" | "counter-event" | "cognac";
      resumePhase: "main" | "block" | "counter";
      resumePlayerId: PlayerId;
    }
  | {
      kind: "set-base-power-zero";
      playerId: PlayerId;
      targetPlayerId: PlayerId;
      sourceCardNumber: string;
      sourceInstanceId: string;
      eligibleInstanceIds: string[];
      expiresAtTurn: number;
    }
  | {
      kind: "st34-power-boost";
      playerId: PlayerId;
      sourceCardNumber: "EB03-032";
      sourceInstanceId: string;
      eligibleInstanceIds: string[];
      amount: 2000;
      expiresAtTurn: number;
    }
  | {
      kind: "st34-don-minus-ko";
      playerId: PlayerId;
      targetPlayerId: PlayerId;
      sourceCardNumber: string;
      sourceInstanceId: string;
      eligibleInstanceIds: string[];
      resumePhase: "block";
      resumePlayerId: PlayerId;
    }
  | {
      kind: "katakuri-leader";
      playerId: PlayerId;
      sourceCardNumber: "OP11-062";
      sourceInstanceId: string;
      resumePhase: "block";
      resumePlayerId: PlayerId;
    }
  | {
      /**
       * OP11-041 Nami's second Leader ability: `[DON!! x1] [On Your
       * [printed text omitted -- pnpm card:text OP11-041]
       * hand: This Leader gains +2000 power during this turn.`
       *
       * The card to trash is the choice, so the options are the hand rather
       * than a bare apply/skip -- which card the deck gives up is a real
       * decision, not a formality.
       */
      kind: "nami-leader";
      playerId: PlayerId;
      sourceCardNumber: "OP11-041";
      sourceInstanceId: string;
      eligibleInstanceIds: string[];
      resumePhase: "block";
      resumePlayerId: PlayerId;
    };

/**
 * A pending effect together with anything it displaced, outermost first.
 *
 * `return-don` parks the decision its action had already queued so it can ask
 * its own question first, and a displaced effect can still be holding cards --
 * a search keeps its revealed cards on the pending, where they exist in no
 * zone. Anything that reads the pending for game state has to walk the whole
 * chain rather than just the top, or those cards vanish.
 */
export function pendingEffectChain(
  effect: PendingEffect | null,
): PendingEffect[] {
  const chain: PendingEffect[] = [];
  let current = effect;
  while (current) {
    chain.push(current);
    current = current.kind === "return-don" ? current.displaced : null;
  }
  return chain;
}

/**
 * Move an attack onto a different card, and drop the defence bought for the one
 * it is leaving.
 *
 * `counterPower` is a pool on the battle rather than a modifier on a card, and
 * that is right for the Counter step, where every point of it is spent on
 * whatever the attack is pointed at by then. It is wrong across a change of
 * target. A defensive clause that resolves earlier -- the
 * `[On Your Opponent's Attack]` ladder, which runs before the Block step opens
 * -- names the card it buffs: OP17-040 Edward.Newgate gives "your Leader"
 * +3000, and a Character that blocks afterwards was never given anything. Left
 * in the pool that +3000 would defend whoever steps in front of the attack, so
 * a 1000-power Blocker would win the battle at 4000.
 *
 * Zeroing is the whole correction, and it is exact rather than approximate:
 * nothing can have bought defence for a card that was not in the battle yet, so
 * everything standing in the pool at the moment the target moves belongs to the
 * card being left behind. `[On Block]` programs add theirs after this runs, and
 * so keep it.
 *
 * Both target moves go through here: `applyBlock`, and the `redirect-attack`
 * effect that shifts a battle without resting anything.
 */
export function retargetAttack(
  attack: ActiveAttack,
  targetInstanceId: string,
): void {
  attack.targetInstanceId = targetInstanceId;
  attack.counterPower = 0;
}

export interface GameState {
  /**
   * Battle damage still owed after the point already dealt -- [Double Attack].
   *
   * Held on the state rather than on `activeAttack` because the attack is over
   * by the time the second point lands: the first may open a Trigger window,
   * and the window is settled after the battle has handed control back. The
   * settle step in `applyAction` deals it once nothing is pending, which is
   * what keeps the two points from colliding on `pendingTrigger` -- `dealDamage`
   * refuses two open windows at once, for exactly this reason.
   */
  pendingBattleDamage?: {
    playerId: PlayerId;
    remaining: number;
    /**
     * Whether the attacker that owed this damage had [Banish].
     *
     * "[printed text omitted -- pnpm card:text <card>]" is per point of damage, and the second
     * point of [Double Attack] is settled after the battle has ended -- by
     * which time `activeAttack` is gone and there is no attacker left to read
     * the keyword off. So the answer is captured when the debt is recorded.
     *
     * Nothing in the pool could hold both keywords at once until ST28-002 Izo
     * granted [Banish] to a Leader: OP06-022 Yamato prints [Double Attack], and
     * the pair is the deck's whole reason for playing a 2-cost 1000 body. Until
     * then the second point always handed its Life card over.
     */
    banish?: true;
  };
  /**
   * Turn on which a Character was last K.O.'d, per player, for the clauses that
   * ask whether one has been this turn -- OP16-100 Hallowed Glacier Slash.
   */
  characterKoedOnTurn?: { p1?: number; p2?: number };
  /**
   * The highest printed cost among the Events each player has activated this
   * turn, and the turn it was recorded on.
   *
   * "[printed text omitted -- pnpm card:text OP16-100]" -- OP15-002 Lucy's Leader -- is a fact about the turn's history that
   * no zone can reconstruct: an Event goes to the trash whether it was
   * activated or discarded.
   */
  eventsActivatedOnTurn?: {
    turn: number;
    p1?: number;
    p2?: number;
  };
  protocolVersion: "1";
  /** Always `RULES_VERSION`; typed from it so the two cannot drift. */
  rulesVersion: typeof RULES_VERSION;
  gameId: string;
  revision: number;
  seed: string;
  rngState: RngState;
  turn: number;
  /**
   * Whose decision the engine is waiting on -- *not* whose turn it is.
   *
   * The Block and Counter steps hand this to the defender, and a pending effect
   * hands it to whoever must resolve it, so it changes several times inside a
   * single turn. Read `turnPlayerId` for anything turn-scoped.
   */
  activePlayer: PlayerId;
  /**
   * Whose turn it is. Set at setup and changed only when a turn ends.
   *
   * Every turn-scoped rule asks this: DON!! given to a card adds power only on
   * its controller's turn, `[Your Turn]` and `[Opponent's Turn]` layers switch
   * on it, and `observe` projects it. It used to be reconstructed as
   * `activeAttack?.attackerPlayerId ?? activePlayer` -- correct for as long as a
   * battle was open, and wrong the moment one closed with the defender still
   * holding a decision. An [On K.O.] reaction is the everyday case: the attack
   * is gone, `activePlayer` is the defender, and the turn silently changed
   * hands mid-turn, taking the attacker's DON!! bonuses and the defender's
   * `[Opponent's Turn]` auras with it.
   */
  turnPlayerId: PlayerId;
  phase: Phase;
  players: Record<PlayerId, PlayerState>;
  winner: PlayerId | null;
  resultReason: "deck-exhaustion" | "life" | null;
  pendingEffect: PendingEffect | null;
  /**
   * Reactions waiting for the current pending effect to finish.
   *
   * `pendingEffect.continuations` already parks them for a mechanic DSL choice,
   * but only that kind of effect can carry them, and the imperative `[On Play]`
   * handlers all suspend on one of the other forty-odd kinds. So a watcher
   * queued behind such a clause -- OP12-081 Koala's Leader answering the play
   * that just happened -- had nowhere to wait and was dropped.
   *
   * Kept off the pending effect itself because it outlives any single one of
   * them: a chain of effects drains this only once it has fully unwound, in
   * `resolveEffect`. Absent rather than empty when there is nothing waiting, so
   * a state that never had a continuation hashes exactly as it did before.
   */
  pendingContinuations?: MechanicInvocation[];
  /**
   * Set while a Leader's start-of-turn program (OP11-040) is resolving ahead
   * of the turn's Refresh, Draw and DON!! steps, and cleared by
   * `resumeStartOfTurn` once nothing is left to answer.
   *
   * Kept on the state rather than on the pending effect because the program
   * can stop on any kind of decision, not only its own card or option picks:
   * a `DON!! −N` return choice, a K.O. replacement, a reaction to what it
   * moved, or the opponent's Trigger from damage it dealt. Each is answered by
   * its own action, and the turn resumes after whichever settles last.
   * Absent otherwise, so every other position hashes as it did before.
   */
  startOfTurnSuspended?: true;
  /**
   * DON!! returned by `DON!! −N` this action whose origin is still unconfirmed.
   *
   * Set by `returnDonToDeck` and drained by `offerDonReturnChoice` at the end of
   * the action, so it is never observed by a player.
   */
  donReturn: DonReturnRecord | null;
  /**
   * Where to return once a pending effect finishes.
   *
   * `block` was added for `[When Attacking]` programs, which resolve between the
   * attack declaration and the Block window; the resume logic already just
   * restored whatever phase and player it was handed.
   */
  pendingEffectResume: null | {
    /**
     * `"counter"` is reachable from a Counter Event whose text asks a question
     * after its power lands, e.g. OP12-115 I Love You!!.
     *
     * `"trigger"` is the window battle damage opens: a reaction to a card
     * leaving Life -- OP08-105 Jewelry Bonney -- can stop to ask something
     * while the damaged player still has a Trigger to answer, and the Trigger
     * offer is held in `pendingTrigger` rather than in the phase, so restoring
     * the phase is all it takes to hand it back.
     */
    phase: "main" | "block" | "counter" | "trigger";
    playerId: PlayerId;
  };
  activeAttack: ActiveAttack | null;
  pendingTrigger: PendingTrigger | null;
  /**
   * Characters whose own printed effects are switched off, by instance.
   *
   * Kept on the state rather than on the `BoardCard` because the flag has to
   * outlive the card's stay on the field: OP16-119 Marshall.D.Teach's Trigger
   * negates a Character for the turn, and the question "was it negated?" is
   * asked again when that Character is K.O.'d and its `[On K.O.]` would fire,
   * by which point the board entry is gone.
   *
   * Optional so a game in which nothing is ever negated serializes and hashes
   * exactly as it did before negation existed. An instance stays listed for the
   * rest of the turn even if it leaves the field, so a Character bounced and
   * replayed on the same turn is still negated -- a corner no card in the
   * format currently reaches.
   */
  negatedEffects?: { instanceId: string; expiresAtTurn: number }[];
  /**
   * "Set up to N of your DON!! cards as active **at the end of this turn**" --
   * OP14-031 Nami, the only clause in the pool that schedules a DON!! refund
   * for later in the same turn rather than paying it out now.
   *
   * Not an ordinary `[End of Your Turn]` program: that registry is keyed by
   * card number and fires for every copy on the board every turn, and this is
   * one instance's promise, made once, for one turn. Recorded on the state and
   * paid out in `runEndOfTurnEffects`, which is also what drops it.
   */
  /**
   * The turn on which each player last had a card trashed from their hand by
   * an effect.
   *
   * "[printed text omitted -- pnpm card:text <card>]" -- OP14-045 Kuroobi and OP14-049 Jinbe -- and its
   * mirror on OP14-056 Wadatsumi, whose own text switches *off* the same way.
   * Blue pays for its draw with hand trashes, so the whole colour's tempo is
   * gated on this having happened, and a static keyword layer has no other way
   * to know it did: the cards are back in the trash with everything else.
   *
   * Recorded rather than counted, because every clause reading it asks only
   * "has one this turn", and a turn number needs no clearing.
   */
  handTrashedByEffectOnTurn?: { p1?: number; p2?: number };
  endOfTurnDonActivation?: {
    playerId: PlayerId;
    turn: number;
    count: number;
  }[];
  oncePerTurn: string[];
  eventSequence: number;
  events: PublicEvent[];
}

export type GameAction =
  | {
      type: "mulligan-decision";
      actionId: string;
      revision: number;
      decision: "keep" | "mulligan";
    }
  | {
      type: "play-card";
      actionId: string;
      revision: number;
      cardInstanceId: string;
    }
  | {
      type: "resolve-effect";
      actionId: string;
      revision: number;
      optionId: string;
    }
  | {
      type: "attach-don";
      actionId: string;
      revision: number;
      targetInstanceId: string;
    }
  | {
      type: "activate-main";
      actionId: string;
      revision: number;
      optionId: string;
    }
  | {
      type: "attack";
      actionId: string;
      revision: number;
      attackerInstanceId: string;
      targetInstanceId: string;
    }
  | {
      type: "block";
      actionId: string;
      revision: number;
      blockerInstanceId: string;
    }
  | {
      type: "counter";
      actionId: string;
      revision: number;
      cardInstanceId: string;
    }
  | {
      type: "activate-counter-event";
      actionId: string;
      revision: number;
      eventInstanceId: string;
    }
  | {
      type: "resolve-trigger";
      actionId: string;
      revision: number;
      optionId: string;
    }
  | { type: "pass"; actionId: string; revision: number };

export interface TransitionResult {
  state: GameState;
  events: PublicEvent[];
}

import type { GameObservation, LegalAction } from "@one-piece-sim/protocol";
import {
  chooseGenericCounter,
  isOptionCardIn,
  isSearchResult,
  optionCard,
  type EffectAction,
  type PolicyDecision,
} from "../generic-policy.js";
import {
  avoid,
  never,
  prefer,
  preferAmong,
  WEIGHT,
  type Heuristic,
} from "../heuristics.js";
import type { RulesPolicy } from "../policy-chain.js";
import { CHARACTER_AREA_LIMIT, type Tactics } from "../tactics.js";

/** OP16-060 Sengoku, the Leader whose activation is the deck's whole plan. */
const SENGOKU_LEADER = "OP16-060";

/**
 * The three {Admiral} Characters the Leader's activation can play, and the only
 * three the set prints: OP16-063 Kuzan, OP16-065 Sakazuki, OP16-073 Borsalino.
 *
 * All three cost 7, and the activation asks for "different card names" -- so
 * what matters in hand is how many of these three *numbers* are present, not
 * how many cards. Two Kuzan is one name.
 */
const ADMIRALS = ["OP16-063", "OP16-065", "OP16-073"];

/**
 * The number of differently-named Admirals that makes the Leader's activation
 * worth its eight active DON!!.
 *
 * Two, which is not what Bandai's own guide describes: the ramp rules
 * underneath it reach eight DON!! often enough that a two-Admiral turn is an
 * extra payoff rather than a worse one. See the threshold section in
 * {@link OP16_SENGOKU_RULES}.
 */
const ADMIRALS_FOR_THE_LEADER_TURN = 2;

/**
 * An activation that hands back more active DON!! than it rests, and returns
 * none to the DON!! deck.
 *
 * `strategy/ramp.ts`'s `free-ramp-first` is the same claim one step narrower:
 * it names an activation costing *nothing*, because King is the card in the
 * shipped lists that shape describes. OP16-065 Sakazuki is the next one along
 * -- rest 1 DON!! and, under a {Navy} Leader, add 2 active ones, so the engine
 * reports `cost.restsDon: 1` with `ramps.active: 2` -- and the argument is
 * identical: the DON!! it nets is DON!! this turn's plays can spend, and taken
 * after them it arrives with nothing left to buy.
 *
 * Written against the metadata rather than the card number, so it is a claim
 * about the shape and not about Sakazuki. It lives here rather than in
 * `strategy/ramp.ts` only because shipping it there would change four other
 * purple seats it has never been priced on; whoever prices it on Kaido,
 * Enel, Rosinante and ST34 should move it. Note that Kaido's Queen is *not*
 * this shape and must not become collateral: it converts two active DON!! into
 * three rested ones, so its `ramps.active` is 0 and whether its price is worth
 * a play stays `op17-kaido-policy.ts`'s question.
 */
function netActiveRampOffered(t: Tactics): boolean {
  return t.actions.some(isNetActiveRamp);
}

function isNetActiveRamp(action: LegalAction): boolean {
  if (action.type !== "activate-main") return false;
  if (action.cost?.returnsDon) return false;
  return (action.ramps?.active ?? 0) > (action.cost?.restsDon ?? 0);
}

/** Differently-named Admirals in hand. The activation's own gate. */
function admiralNamesInHand(t: Tactics): number {
  return ADMIRALS.filter((cardNumber) =>
    t.hand.some((card) => card.cardNumber === cardNumber),
  ).length;
}

/** OP15-078 Mamaragan and OP16-078 Marineford: a DON!! off the field for one card. */
const MAMARAGAN = "OP15-078";
const MARINEFORD = "OP16-078";
/** OP16-076 The Three Admirals!!: both halves are blank without an {Admiral} out. */
const THREE_ADMIRALS = "OP16-076";

/** The printed DON!! cap. */
const DON_CAP = 10;

/**
 * The DON!! each `[On Play]` in the fifty puts on the field, for the four
 * bodies that put any there: OP16-063 Kuzan and OP16-066 Sengoku add 2 rested,
 * OP16-075 Monkey.D.Garp adds 1 active and 1 rested, and OP16-070 Rosinante
 * rests 2 to add 1, so its net is a single DON!! and only once it can pay.
 *
 * Written as card numbers rather than off `CardRules.addsDonFromDonDeck`,
 * which is a *mention* of the DON!! deck and not an addition to the field:
 * it reads false for OP16-066, whose clause adds two, and true for OP16-073
 * Borsalino, whose only DON!! clause takes two off the field.
 */
const ON_PLAY_FIELD_DON: ReadonlyMap<string, number> = new Map([
  ["OP16-063", 2],
  ["OP16-066", 2],
  ["OP16-075", 2],
  ["OP16-070", 1],
]);

/** DON!! this card's `[On Play]` would add to the field, or 0 for the rest. */
function onPlayFieldDon(cardNumber: string): number {
  return ON_PLAY_FIELD_DON.get(cardNumber) ?? 0;
}

/** The most DON!! any play at the dearest affordable cost would add to the field. */
function bestRampAtDearestCost(t: Tactics): number {
  let best = 0;
  for (const action of t.affordablePlays) {
    const card = t.playedCard(action);
    if (card?.currentCost !== t.dearestAffordablePlay) continue;
    best = Math.max(best, onPlayFieldDon(card.cardNumber));
  }
  return best;
}

/**
 * Whether adding DON!! from the DON!! deck can do anything at all right now.
 *
 * Two ways for a ramp clause to be blank, and both leave a body that is
 * otherwise fine to play: the field is already at the printed cap, or the
 * DON!! deck is empty. Neither is recoverable by waiting, so a rule that
 * prices the ramp has to stop pricing it here -- and unlike a `DON!! −N` cost,
 * an `add-don` cannot refill the deck it draws from.
 */
function rampStillPays(t: Tactics): boolean {
  return t.fieldDon < DON_CAP && t.observation.self.donDeckCount > 0;
}

/**
 * The clauses in this list that make the player trash a card from hand after
 * resolving: OP16-066 Sengoku (two), OP16-067 Tsuru, OP16-077 "Buddha" Sengoku
 * and OP16-078 Marineford's activation (one each). None is a cost, so none
 * reaches the policy as `cost.trashesFromHand`; each is a `choose` over the
 * hand whose only effect is the move to the trash.
 */
const HAND_TRASH_CLAUSES: ReadonlySet<string> = new Set([
  "OP16-066",
  "OP16-067",
  "OP16-077",
  MARINEFORD,
]);

function isHandTrash(action: LegalAction): action is EffectAction {
  return (
    action.type === "resolve-effect" &&
    HAND_TRASH_CLAUSES.has(action.sourceCardNumber) &&
    action.destination?.zone === "trash" &&
    action.destination.player === "self" &&
    isOptionCardIn(action, "self", "hand")
  );
}

function isAdmiral(cardNumber: string): boolean {
  return ADMIRALS.includes(cardNumber);
}

function admiralsOnBoard(t: Tactics): number {
  return t.observation.self.board.filter((card) => isAdmiral(card.cardNumber))
    .length;
}

/**
 * What this deck wants a search to hand it, higher first.
 *
 * Scores every card in the fifty, so a candidate the rule is silent about
 * cannot survive beside the one it asked for. The order is the deck's plan
 * read forwards: the missing Admiral name completes the activation, the ramp
 * bodies bring the eighth DON!! closer, a searcher keeps digging, and a
 * second copy of a held Admiral is a hard-castable 8000 and nothing more.
 */
function searchValue(cardNumber: string, t: Tactics): number {
  if (isAdmiral(cardNumber)) {
    return t.copiesInHand(cardNumber) === 0 ? 100 : 30;
  }
  switch (cardNumber) {
    case "OP16-075": // Garp: +1 active +1 rested
    case "OP16-066": // Sengoku: +2 rested, draw 2 trash 2
      return t.fieldDon < DON_CAP ? 70 : 20;
    case "OP16-070": // Rosinante: rest 2 for +1, and a Blocker
      return t.fieldDon < DON_CAP ? 60 : 25;
    case "OP16-064": // Koby: the only dig with no trash after it
      return 50;
    case "OP16-067": // Tsuru
    case "OP16-077": // "Buddha" Sengoku
      return 45;
    case MARINEFORD:
      return 40;
    case "OP16-062": // Younger Brother Marine: the Counter reserve
      return 35;
    case MAMARAGAN:
      return 30;
    case THREE_ADMIRALS:
      return admiralsOnBoard(t) > 0 ? 55 : 10;
    default:
      return 1;
  }
}

/**
 * The turn the deck has been ramping towards: the Leader's activation is on
 * offer, and the hand can actually cash it.
 *
 * The engine offers the activation on eight active DON!! whether or not there
 * is an {Admiral} to play, because the printed choice is "up to 3" -- so an
 * offer is not by itself the payoff turn. Taking it with an empty hand returns
 * eight DON!! to the DON!! deck for nothing at all, which in this deck is four
 * turns of ramp -- and the probe below caught the ladder doing exactly that
 * nowhere, because it never took the activation at all.
 */
function leaderActivationReady(t: Tactics): boolean {
  return (
    t.activationOffered(SENGOKU_LEADER) &&
    admiralNamesInHand(t) >= ADMIRALS_FOR_THE_LEADER_TURN
  );
}

/**
 * OP-16 (Purple) Sengoku: take the two activations the ladder never reaches.
 *
 * ## What the ladder misses
 *
 * The deck's two payoff clauses -- OP16-078 Marineford's `[Activate: Main]` and
 * OP16-077 "Buddha" Sengoku's `[Main]` -- are offered on most decisions of a
 * turn and lose to a play every time, because the generic ladder answers the
 * Main phase with "develop the highest-cost legal card" before it looks at an
 * activation. A probe of optional clauses is how to see that: what matters is
 * which rows never win, not the raw rate, since an offer repeated every decision
 * of a turn and taken once reads as low either way.
 * | OP15-078 Mamaragan `[Main]` | 758 | 332 |
 * | **OP16-065 Sakazuki `[Activate: Main]`** | **668** | **143 (21%)** |
 * | OP16-063 Kuzan `DON!! −1` | 117 | 117 (100%) |
 * | OP16-070 Rosinante rest-2 cost | 130 | 130 (100%) |
 * | **OP16-060 Sengoku (Leader)** | **308** | **0** |
 *
 * Both bolded rows are the same bug, which is `chooseGenericRules` answering
 * the Main phase with "develop the highest-cost legal card" *before* it looks
 * at activations at all:
 *
 *  - **The Leader's activation was taken zero times.** Return 8 active DON!!
 *    and play up to 3 differently-named {Admiral} Characters is the entire
 *    reason this fifty is built the way it is, and on any turn the deck holds
 *    eight active DON!! it also holds something to spend them on. It reached
 *    the payoff about 1.3 times a game and never cashed it once.
 *  - **Sakazuki's ramp was taken only when nothing else was left.** Rest 1
 *    DON!! and, under a {Navy} Leader, add 2 active ones: net +1 active DON!!
 *    and +1 card on the field, once a turn. Taken after the plays, the extra
 *    DON!! arrives on a turn with nothing left to spend it on.
 *
 * This is the same class as `op17-kaido-economy`'s X.Drake row and the
 * opposite sign: there the ladder took an optional clause 100% of the time
 * whose cost was the deck's own plan, here it took 0% and 21% of the two
 * clauses the plan is made of.
 *
 * ## The rules
 *
 * Two claims, four rules, because each claim needs both tiers. `rank` never
 * compares across action types, so a preference among activations does nothing
 * while a `play-card` is on the table; the veto is what makes the preference
 * reachable, exactly as `king-ramp-first` does for Kaido. Vetoing every play is
 * safe for the same reason it is there: taking the activation spends the DON!!
 * or the `[Once Per Turn]` key, the offer disappears, and the same decision
 * point is re-entered with the plays back on the table.
 *
 * ## The threshold
 *
 * `ADMIRALS_FOR_THE_LEADER_TURN` is the number of differently-named Admirals
 * the gate insists on, and it is 2 rather than the 3 Bandai's own guide
 * describes. The reason is the interaction with the ramp rules below: they
 * put the deck on eight active DON!! earlier and more often, so a
 * two-Admiral turn is an extra payoff turn rather than one taken instead of a
 * three-Admiral turn. Re-price the gate whenever the ramp underneath it
 * changes -- a gate measured against a seat that ramped worse is a gate
 * measured on a different deck.
 *
 * Nothing loosens the gate at low Life. Falling to 2 names when the deck is
 * about to die collapses into the flat 2 it already uses, since the Leader
 * starts at 5 Life.
 *
 * ## The Counter step
 *
 * `pnpm census` reads this deck's Counter step as its largest unpiloted
 * surface, and the generic step underneath it is wrong about this deck in two
 * ways that a probe of the cards it spends makes visible. It prices a Counter
 * card by the Counter it prints, so OP16-066 Sengoku's 2000 and OP16-062
 * Younger Brother Marine's 2000 are the same card to it and hand order picks --
 * and Sengoku is the body whose `[On Play]` adds two DON!! and draws two, where
 * the Marine has no text. And it defends a Character only up to one ordinary
 * Counter card, the price of a body that can simply be played again, which an
 * 8000 Admiral cannot: it cost seven DON!! from hand or a third of the eight
 * the Leader returned, and it is the only thing on this board worth attacking.
 * `createOp16SengokuDefensePolicy` is the generic step told both things, plus
 * that OP16-076's `[Counter]` +4000 is one card where the ordinary line to the
 * same defence is two.
 *
 * ## Pricing a DON!! off the field
 *
 * The two DON!! vetoes are this file's central claim, and the boundary matters.
 * Borsalino's `[End of Your Turn] DON!! −2` is *not* vetoed: an active 8000
 * [Blocker] through the opponent's next End Phase is worth two DON!! to a deck
 * whose binding constraint is surviving to turn 8, not having DON!! on turn 8.
 * Mamaragan's and Marineford's clauses buy one card each, and in a deck whose
 * payoff needs eight *active* DON!! on one turn, one DON!! is a quarter of a
 * turn of ramp. The DON!! cap is the gate because it is where the trade
 * inverts: with the DON!! deck empty, the returned DON!! is the only thing
 * OP16-066, OP16-075 and the Admirals' `[On Play]` could add back.
 *
 * ## The search rule, and the hand costs
 *
 * `search-for-missing-admiral` is written against the hand rather than as a
 * `search-values.ts` table because the value of an Admiral is not a constant:
 * a name the hand lacks completes the activation and a second copy of one it
 * holds can never be played by it. Everything else in the fifty is scored too,
 * so a card the rule is silent about cannot survive beside the one it asked
 * for (`rankAmong` hides only what it scored).
 *
 * The hand-cost rules are deliberately only two claims -- spare the Admirals,
 * pitch the blank Event -- and not a full pitch order. A general order scored
 * by cost and Counter value points at the 7-cost Admirals themselves on every
 * turn before the eighth DON!!, and this deck's Admirals are the plan. Beyond
 * the two claims that are unarguable on the card text, first-offered is hard
 * to beat here.
 *
 * Sakazuki's -6000 goes at the opponent's strongest Character, not at their
 * [Blocker], whatever Bandai's guide and the dossier say: a -6000 that lasts
 * through the opponent's turn is removal, and removal wants the biggest body.
 *
 * ## Equal-cost plays
 *
 * `chooseGenericRules` develops the highest-cost legal card and its sort is
 * stable, so at equal cost the play falls to offer order, which is hand order
 * -- OP16-062 Younger Brother Marine, a 5-cost 6000 with no printed text,
 * ahead of OP16-075 Garp, the same 5-cost 6000 whose `[On Play]` adds two
 * DON!!. `equal-cost-ramp-first` vetoes, at `dearestAffordablePlay` only, a
 * body whose `[On Play]` adds less DON!! than a peer of the same cost, so it
 * cannot become `op17-kaido-policy.ts`'s failure mode where naming the ramp
 * bodies hid the deck's own finishers. It is a veto and not a ranking because
 * the format's `equal-cost-play` ranks the same band by power, and a second
 * ranking that disagrees with it protects its own winner without hiding the
 * other's -- OP16-066 Sengoku's 5000 body loses that argument to the Marine's
 * 6000 and the tie goes back to hand order.
 *
 * OP16-070 Rosinante is left alone despite reading like the same shape: its
 * `[On Play]` rests 2 DON!! to add 1, and the engine gates the clause on
 * `active-don >= 2` *after* the play cost is paid, so on three active DON!!
 * the offer never appears and the seat gets a 2-cost 1000 [Blocker] with no
 * ramp. Bandai's guide says to wait for four DON!!, and it is worth nothing
 * here: Rosinante is the fifty's only [Blocker], so a turn of it is worth
 * about what the rested DON!! is.
 */
export const OP16_SENGOKU_RULES: readonly Heuristic[] = [
  // --- The payoff turn -----------------------------------------------------
  never("Cash the Leader's eight DON!! before spending them on a body.")
    .as("admirals-before-bodies")
    .when(leaderActivationReady)
    .action(
      (action) => action.type === "play-card" || action.type === "attach-don",
    ),

  prefer("Take the Leader's activation ahead of the deck's other effects.")
    .as("leader-activation-first")
    .by(WEIGHT.deck)
    .when(leaderActivationReady)
    .activate((action) => action.sourceCardNumber === SENGOKU_LEADER),

  // --- Ramp before development -------------------------------------------
  //
  // Sakazuki's activation rests one DON!! and hands back two active ones, so
  // taking it before a play strictly increases what the turn can spend --
  // which is `strategy/ramp.ts`'s `free-ramp-first` claim with a price on it.
  // Safe to veto every play: the activation spends its `[Once Per Turn]` key,
  // the offer disappears, and the same decision point is re-entered with the
  // plays back on the table and one more active DON!! to pay for them.
  never("Take the net DON!! before spending DON!! on a body.")
    .as("net-ramp-first")
    .when(netActiveRampOffered)
    .play(() => true),

  // With the plays vetoed the ladder takes the *first* activation in the list,
  // which in this deck is as likely to be Marineford's or Kuzan's `DON!! −1`
  // -- both of which take DON!! off the field. Gated off on the payoff turn so
  // it never argues with the rule above it.
  prefer("Among activations, the ramp that pays for itself comes first.")
    .as("net-ramp-order")
    .by(WEIGHT.deck)
    .when((t) => !leaderActivationReady(t))
    .action(isNetActiveRamp),

  // --- Searches: the Admiral name the hand is missing --------------------
  //
  // Every search in the fifty looks 5 deep for {Navy}, and the generic ladder
  // answered each with whatever the engine offered first -- an Event over the
  // Admiral sitting beside it. The activation is gated on *names*, so the one
  // thing a search can do that a draw cannot is complete the set.
  preferAmong("Search out the Admiral name the hand does not hold yet.")
    .as("search-for-missing-admiral")
    .by(WEIGHT.deck)
    .effect((action, t) => {
      if (!isSearchResult(action)) {
        return false;
      }
      const card = optionCard(action)?.card;
      if (!card) return false;
      return searchValue(card.cardNumber, t);
    }),

  // --- Hand costs: never the lone Admiral ---------------------------------
  //
  // The four trash-after clauses were paid with the first card offered, which
  // in one traced game was the only Kuzan in hand. A name the hand holds once
  // is a third of the payoff; a second copy of the same name is not.
  avoid("Do not pitch an Admiral name the hand holds only once.")
    .as("hand-costs-spare-the-admirals")
    .by(WEIGHT.deck)
    .effect((action, t) => {
      if (!isHandTrash(action)) return false;
      const cardNumber = optionCard(action)?.card.cardNumber ?? "";
      return isAdmiral(cardNumber) && t.copiesInHand(cardNumber) === 1;
    }),

  prefer("Pitch The Three Admirals!! while there is no Admiral to buff.")
    .as("hand-costs-pitch-the-blank-event")
    .by(WEIGHT.deck)
    .when((t) => admiralsOnBoard(t) === 0)
    .effect((action) => {
      if (!isHandTrash(action)) return false;
      return optionCard(action)?.card.cardNumber === THREE_ADMIRALS;
    }),

  // --- DON!! for a card, only at the cap ----------------------------------
  //
  // Both activations return DON!! to the DON!! deck for one card. Below the
  // cap that is a turn of ramp spent on a draw; at the cap the DON!! deck is
  // empty and the returned card is the only thing the ramp bodies could add.
  never(
    "A DON!! off the field for one card is not this deck's trade below the cap.",
  )
    .as("mamaragan-main-below-cap")
    .when((t) => t.fieldDon < DON_CAP)
    .activate((action) => action.sourceCardNumber === MAMARAGAN),

  never("Marineford's draw costs the DON!! the Leader is counting.")
    .as("marineford-draw-below-cap")
    .when((t) => t.fieldDon < DON_CAP)
    .activate((action) => action.sourceCardNumber === MARINEFORD),

  // --- A full board of Admirals is not a place for a searcher -------------
  //
  // The format's `board-replacement-cost` vetoes a swap only when the new body
  // is no *cheaper* than the one it trashes, which lets a 1-cost 2000 searcher
  // replace an 8000 Admiral. In this deck the bodies worth keeping are exactly
  // the expensive ones, so the comparison is power alone.
  never("Do not trash a bigger body off a full board to play a smaller one.")
    .as("no-downgrade-onto-a-full-board")
    .when((t) => t.observation.self.board.length >= CHARACTER_AREA_LIMIT)
    .play((card, t) => {
      const weakest = Math.min(
        ...t.observation.self.board.map((body) => body.currentPower),
      );
      return card.facts.power < weakest;
    }),

  // --- Equal-cost bodies: the one that brings DON!! with it ----------------
  //
  // `chooseGenericRules` develops the highest-cost legal card and breaks a tie
  // by *offer order*, which is hand order. This deck's five-drops are three
  // cards with the same price and very different text: OP16-062 Younger
  // Brother Marine is a 6000 body and nothing else, OP16-075 Garp is the same
  // body plus two DON!!, and OP16-066 Sengoku is 5000 plus two DON!! and a
  // draw-2. A traced game against ST31 had the seat play the Marine off hand
  // index 0 with Garp sitting at index 3 -- the whole difference between the
  // two decided by which one was drawn first.
  //
  // A veto rather than a ranking, because the format's `equal-cost-play` ranks
  // the same band by power, and two `rankAmong` modules that disagree each
  // protect their own winner -- so a ranking here that put Sengoku's 5000 over
  // the Marine's 6000 left both on the table for hand order to settle, and the
  // Marine was played with Sengoku beside it. A veto composes with nothing: the
  // body that adds no DON!! is simply not a play while a body of the same cost
  // that adds some is. Where two survivors tie on DON!! the format's power
  // order still picks between them, which is Garp's 6000 over Sengoku's 5000.
  //
  // Scoped to the plays the ladder is actually choosing between: only those at
  // `dearestAffordablePlay` are vetoed, so this reorders a tie instead of
  // hiding a ramp body's cheaper peers or promoting one over an Admiral.
  never("Among bodies of equal cost, the one that adds no DON!! waits.")
    .as("equal-cost-ramp-first")
    .when(rampStillPays)
    .play((card, t) => {
      if (card.currentCost !== t.dearestAffordablePlay) return false;
      return onPlayFieldDon(card.cardNumber) < bestRampAtDearestCost(t);
    }),

  // --- Kuzan's DON!! −1 buys exactly the attack it lets through ------------
  //
  // The clause targets any opposing Character, so the engine offers it with no
  // [Blocker] across the table, and the ladder took it every turn: a DON!! off
  // the field for nothing.
  never("Kuzan's DON!! −1 is worth a DON!! only against a [Blocker].")
    .as("kuzan-silence-needs-a-blocker")
    .when((t) => t.opponentBlockers === 0)
    .activate((action) => action.sourceCardNumber === "OP16-063"),
];

/**
 * The cards the Counter step must not spend while a line of the same length
 * exists without them: the two 5-cost bodies whose `[On Play]` adds two DON!!.
 *
 * OP16-066 Sengoku and OP16-075 Garp both print Counter -- 2000 and 1000 --
 * and both are the deck's ramp. The generic Counter step prices a card by the
 * Counter it prints, so between Sengoku's 2000 and OP16-062 Younger Brother
 * Marine's 2000 it sees no difference and takes whichever is earlier in hand.
 * The Marine has no printed text; it is the fifty's Counter reserve, which the
 * deck's own manifest says of it, and it is what should go first.
 *
 * The three Admirals print no Counter, so their membership here reaches only
 * the other half of `protectedCards`: whether an Admiral under attack is worth
 * defending at all. See {@link ADMIRAL_DEFENSE_POWER}.
 */
const COUNTER_PROTECTED_CARDS: ReadonlySet<string> = new Set([
  "OP16-066",
  "OP16-075",
  ...ADMIRALS,
]);

/**
 * What an Admiral on the board is worth defending, in Counter power.
 *
 * The generic step defends a protected Character only up to a 1000 shortfall,
 * one ordinary Counter card, which is the price of a body that can simply be
 * played again. An 8000 Admiral cannot: it cost seven DON!! from hand, or a
 * third of the eight the Leader returned, and the deck has nothing else on the
 * board worth attacking. 4000 is the Counter that OP16-076 The Three Admirals!!
 * prints while an {Admiral} is out, so the price is exactly the one card the
 * fifty carries for this purpose, or two ordinary ones.
 */
const ADMIRAL_DEFENSE_POWER = 4000;

/**
 * How long an ordinary Counter line has to be before OP16-076 The Three
 * Admirals!!'s `[Counter]` is the cheaper card to spend.
 *
 * Two. The Event is +4000 for one card and one DON!! while an {Admiral} is on
 * the board; the ordinary line to the same defence is two 2000s, and every
 * card in this hand is either a ramp body, a searcher or an Admiral. The DON!!
 * it costs is one the opponent's turn was not going to spend.
 */
const EVENT_BEATS_COUNTER_CARDS = 2;

/**
 * The Counter step, which is `chooseGenericCounter` with this deck's protected
 * set, the price of an Admiral, and the length at which its Event is the
 * cheaper card. Kept as a `decide` module rather than dissolved into rules
 * because these parameterise the generic policy's own Counter arithmetic,
 * which is where that arithmetic belongs -- the same shape as
 * `createSt35DefensePolicy`.
 */
export function createOp16SengokuDefensePolicy(): RulesPolicy {
  return (observation: GameObservation): PolicyDecision | undefined => {
    if (observation.self.leader.cardNumber !== SENGOKU_LEADER) return undefined;
    if (observation.phase !== "counter") return undefined;
    return chooseGenericCounter(observation, observation.legalActions, {
      protectedCards: COUNTER_PROTECTED_CARDS,
      characterDefensePower: (cardNumber) =>
        isAdmiral(cardNumber) ? ADMIRAL_DEFENSE_POWER : 1_000,
      counterEventBeatsCards: EVENT_BEATS_COUNTER_CARDS,
    });
  };
}

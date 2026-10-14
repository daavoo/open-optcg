import type { DeckStrategyDossier } from "./types.js";

export const op17XebecDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Blue) Rocks.D.Xebec - Official Feature Deck",
  archetype: "OP-17 Blue Rocks D. Xebec draw engine",
  gamePlan: [
    "Attack every turn the Leader can, and pay its [When Attacking] cost: trash 1 card from hand, reveal the top card, and draw 2 if the revealed card's type includes {Rocks Pirates}. Every one of the 50 slots is on the tribe, so the reveal cannot miss and the trade is always profitable.",
    "Convert the resulting hand into board control rather than damage: OP17-054 Miss Buckingham Stussy stops a Character attacking, OP17-046 Gloriosa bottoms a cost-5-or-less body, OP17-042 Kaido debuffs, OP17-048 Shiki debuffs on either turn.",
    "Close with OP17-118 Rocks D. Xebec at 10 DON!!: draw 1, then play up to 2 {Rocks Pirates} cards with different names and a total cost of 9 or less straight out of hand. That is a whole board from one card. Pick the two as a pair, because the 9 is shared: leading with the biggest body spends most of the budget on it and leaves room for a 2-drop, where OP17-049 at 5 beside OP17-042 at 4 is the same power and a [Blocker] as well.",
    "Both 0-cost Events (OP17-055, OP17-056) are dual-purpose: Counters when needed, and cards the Leader is happy to trash when they are not.",
    "OP17-057 Fullalead is a Stage, so it survives everything that removes Characters. Land one early: on the opponent's attack it rests and trashes 1 card from hand for +1000 during that battle.",
    "This deck's defence is not in the Counter step, which is what makes it easy to misplay. It is four [On Your Opponent's Attack] clauses that each cost a card out of hand -- OP17-057 Fullalead and OP17-049 Charlotte Linlin for +1000, OP17-040 Edward.Newgate for +3000 on the Leader, OP17-048 Shiki for -3000 on an opposing Character -- plus the two Events and OP17-118. Every point of defence is bought with the same currency the Leader spends to draw.",
  ],
  mulligan: [
    "Keep cheap bodies that draw -- OP17-050 Streusen, OP17-045 Kyo -- so the early Leader attacks have something to trash and something to refill with.",
    "Keep at least one Event: with no Character in the list printing a Counter, the two Events and OP17-057 Fullalead are the entire hand defence.",
  ],
  priorities: [
    "Remember that no Character in this list has a printed Counter. A large hand is not a safe board -- count actual Counter power before assuming a defensive turn is covered.",
    "Fire an [On Your Opponent's Attack] pump only when it decides that battle by itself. Two failures cost the same card for nothing: the attack that was already going to fail, and the gap too wide for the pump to close. Do not stack a pump with two Counter Events to force one battle either -- three cards for one Life is not a rate this deck should take, because the Life it loses goes to its hand anyway.",
    "The exception is the turn the opponent's board can finish you. Holding a card for a later battle is only worth anything if there is a later battle, so once their swings add up to the game, spend whatever wins the one in front of you -- and count the clauses together rather than one at a time. They are offered one at a time, each as its own yes-or-no, but they all land on the same battle: OP17-040's 3000 and OP17-048's 3000 are 6000 against that attack, and each asked alone would have been declined.",
    "When something asks you to trash a card from hand -- the Leader every turn, and each of the four defensive clauses -- pay with a body, not with OP17-055, OP17-056, or an unplayed Fullalead. Those are the deck's whole hand defence and the reveal does not care what was trashed, only what is on top of the deck.",
    "OP17-118 is an exception worth stating, because it reads the other way: its 'if you only have Characters without a Counter' clause is unconditional here, so it looks like a third Counter Event. Spend the spare copies as fuel anyway -- the Leader asks every single turn, and a hand this full will offer another Counter before you miss that 2000. Keep the last one. It is the only card in the fifty that puts a board back after the opponent clears one, and you will reach the 10 DON!! it costs in almost every game that goes long, so a hand with one copy left is holding a rebuild rather than a Counter.",
    "This deck defends with DON!! and with bodies, not from hand, because the tribe prints almost no Counters. OP17-044 Captain John rested under a {Rocks Pirates} Leader forces the opponent to attack it and nothing else; OP17-054 Miss Buckingham Stussy's [Activate: Main] rests 3 DON!! and itself to switch off an opposing attacker for their whole turn. Both are paid for in DON!! rather than cards, so spare DON!! at the end of a turn belongs there rather than on a swing the defender can Counter. Being behind on Life is not by itself the moment for it -- this deck spends Life for cards on purpose and is behind for most of most games. The moment is when their board can end the game on their next turn: a rested Captain John makes itself their only legal target, Leader included, so it buys the whole turn, and a turn is worth more than a bigger body only when you would not otherwise get another one.",
    "Your Characters are the only defence that renews itself, so saving one is usually a better rate than saving a Life card. A Character defends with its own power, which makes its shortfall small -- often a single 1000 Counter -- while a Leader hit costs the full shortfall for one Life. Losing the board to keep Counters and then spending those same Counters on a Life card two attacks later is the worst of both.",
    "Attacking a Character is this deck's plan, not a consolation. The Leader engine wins the card game on its own; what loses the game is an opponent's board growing wide enough to attack four or five times a turn. Rested Characters are free removal -- an attack that reaches one K.O.s it -- and clearing them is what keeps the Life total you are drawing cards to protect.",
    "OP17-049 Charlotte Linlin's [On Play] lets the *opponent* choose between giving you 2 cards and discarding 2 of their own, so play it when either branch is good rather than when only one is.",
    "Do not read OP17-057 Fullalead as a spare card to trash. It is the deck's only repeatable +1000 on defence and it costs nothing to leave on the field, so a copy in hand is worth playing rather than feeding to the Leader. The exception is a second copy while one is already on the Stage: you have one Stage, so the second is the deck's only strictly dead card and it should pay the next cost you are asked for.",
    "Develop the biggest body you can afford, not the most bodies. It is tempting to empty a full hand of counterless Characters onto an empty board, and it loses badly: the turn goes on 2000-power bodies the opponent removes for free while Edward.Newgate and Shiki stay in hand.",
  ],
  commonVariants: [
    "Pre-release guide lists ran 3 OP08-051 Buckin, whose printed type is 'Former Rocks Pirates' and therefore satisfies no {Rocks Pirates} clause at all; Bandai's own list cuts it for a fourth OP17-057 Fullalead. Treat a Buckin in an opposing list as three dead slots.",
    "Counts on OP17-050 Streusen, OP17-045 Kyo and OP17-052 Don Marlon are the tuning dials; the tribe package itself is close to fixed by the Leader's reveal.",
  ],
  commonCombos: [
    "Leader attack trashes a spare Event, reveals a Rocks Pirates card, draws 2 -- repeated every turn, this is the deck's whole engine.",
    "OP17-118 at 10 DON!! deploys two different tribe members totalling 9 or less, rebuilding a board the opponent has just cleared.",
    "OP17-052 Don Marlon returns a 0-cost blue Event from the trash, recycling a Counter the Leader trashed earlier.",
  ],
  keyCardNumbers: [
    "OP17-039",
    "OP17-118",
    "OP17-054",
    "OP17-046",
    "OP17-049",
    "OP17-048",
  ],
  counterplay: [
    "Pressure Life early. The deck spends cards and DON!! on control and draw rather than on tempo, so it is at its weakest before OP17-118 comes online. Against a fast Red deck it loses around turn 10 still holding seven or eight cards and two empty Character slots -- it dies rich, before the hand it built can be converted into anything.",
    "Attack into the counterless bodies: much of the tribe cannot defend itself from hand, so a wide board trades badly against removal and direct attacks.",
    "Expect a rebuilt board at 10 DON!!; clearing the field the turn before OP17-118 lands accomplishes less than holding removal for after it.",
  ],
  sources: [
    {
      url: "https://note.com/happy_robin1243/n/nefebd1212d52",
      retrievedAt: "2026-08-30",
      note: "Archetype guide. Two claims used here: the Leader must attack every turn or the hand does not grow, and the 5 Life is spent deliberately -- 'prioritise resource accumulation over life preservation'.",
    },
    {
      url: "https://en.onepiece-cardgame.com/feature/deck/deck_111.php",
      retrievedAt: "2026-08-30",
      note: "Bandai's own featured deck for OP17-039; the deck's 50 is this page's list.",
    },
    {
      url: "https://opdeckguide.com/deck-guides/rocks-d-xebec-op17/",
      retrievedAt: "2026-08-21",
      note: "The pre-release guide list this deck used to be; kept for the game plan, which the official list does not restate.",
    },
    {
      url: "https://www.thornberrymedia.com/post/op-17-rocks-d-xebec-deck-list",
      retrievedAt: "2026-08-21",
      note: "Independent pre-release assessment calling OP17-039 the set's highest-ceiling Leader; corroborates the archetype, not the counts.",
    },
  ],
};

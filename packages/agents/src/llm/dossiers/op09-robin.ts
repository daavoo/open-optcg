import type { DeckStrategyDossier } from "./types.js";

export const op09RobinDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Purple/Yellow) Nico Robin - 2nd Place EU Championship 26-27 S1",
  archetype:
    "OP-17 (Purple/Yellow) Nico Robin {Big Mom Pirates} Life-stack midrange",
  gamePlan: [
    "Your Life stack is your board. Four cards in this deck put the top of your deck onto the top of your Life -- OP17-106 Charlotte Smoothie, OP17-114 Sweet 3 Generals, OP16-119 Marshall.D.Teach and OP17-112 Charlotte Linlin -- and five of your Characters print '[Trigger] Play this card'. So every point of damage you take has a chance to deploy a body for free, and the cards you bank are the ones that do it.",
    "OP17-112 Charlotte Linlin is what makes that trade lopsided. On your turn, every one of your Characters with a [Trigger] and 4000 base power has a base power of 8000 instead: Daifuku, Oven, Smoothie, Sweet 3 Generals and Perospero are all printed 4000, so a board that arrived off Life attacks as 8000s.",
    "The Leader does two things and both are about [Trigger] cards. It prints [Banish], so damage it deals trashes the opponent's Life card without giving them the Trigger -- attack with the Leader, not only with Characters, when the opponent is the one holding a stacked Life. And its [When Attacking] trades one [Trigger] card out of your hand for a rested DON!! card from your DON!! deck: ramp that arrives too late to spend this turn and pays for the next one.",
    "Two cards want the same [Trigger] cards in hand, so plan which pays. OP17-109 Charlotte Pudding trashes one for three cards, which is usually the better rate. The Leader's ramp is what you do with the ones you cannot cast.",
    "The Purple splash is three cards: ST34-003 Charlotte Brulee and OP17-113 Streusen search {Big Mom Pirates} for 1, OP17-074 Yamato is a 3-cost [Blocker] that adds a rested DON!! when it lands, and OP09-078 Gum-Gum Giant is the deck's only [Counter] -- DON!! -2 and a card for +4000 in the battle and two cards back, behind a {Straw Hat Crew} Leader, which this Robin is.",
    "OP12-112 Baby 5 is the one card that is neither {Big Mom Pirates} nor Purple, and it is in the list for its Trigger: behind a multicolored Leader, which this one is, it draws two cards when it comes off Life. In hand it is a 5000 body the aura never reaches and a 2000 Counter, and it prints a [Trigger], so it is the card the Leader's ramp and OP17-109's draw are paid with.",
  ],
  mulligan: [
    "Keep any hand with ST34-003 Charlotte Brulee or OP17-113 Streusen. Both cost 1, both play on turn 1, and both dig three deep for the {Big Mom Pirates} cards the whole deck is made of.",
    "Do not keep a hand whose only cheap card is OP09-078 Gum-Gum Giant. It is real defence, but it is never a play and it costs two DON!! off the field on top of its own cost.",
    "A hand of 5-, 6- and 7-drops with no searcher goes back. The deck's ramp is one rested DON!! at a time and it does not come until you are attacking.",
  ],
  priorities: [
    "Bank cards onto Life whenever the clause is free: OP17-106 and OP17-114 both cost two rested DON!! rather than spent ones, so the DON!! is still on the field. The card you bank is a card you will be paid for losing.",
    "Attack with the Leader into a stacked Life stack. [Banish] is the reason: it denies the Trigger entirely, where a Character's attack hands it over.",
    "Spend a [Trigger] card on OP17-109's draw before spending it on the Leader's ramp. Three cards beats one rested DON!!, and the ramp clause is repeatable every turn while Pudding is once per copy.",
    "Play OP17-110 Charlotte Perospero with a {Big Mom Pirates} card of cost 6 or less already in hand: its deploy reads your hand at the moment it lands, and it gains [Rush] for the turn, so the pair is a seven-DON!! tempo swing rather than a body.",
    "Hold OP17-102 Charlotte Oven for the trade you want to make twice. When it dies it plays a Character of 4000 power or less other than itself out of your trash, and by then the trash is full of the 4000-power bodies Linlin turns into 8000s.",
    "OP16-119 Marshall.D.Teach is a Life-stacker on your turn and removal from Life: its Trigger negates one of the opponent's Characters and K.O.s one costing 5 or less. Banking it is not a waste.",
    "When the Leader's ramp or OP17-109 asks which [Trigger] card to trash, pay with OP12-112 Baby 5 first, then OP17-107 Charlotte Daifuku: neither prints anything but its Trigger, and Baby 5 is the one 4000-or-more body the aura does not lift. Never pay with OP16-119 or with a card whose [On Play] you still mean to cast.",
    "OP16-119 Marshall.D.Teach's [On Play] is the only banking clause in the deck that lets you choose the card. Take a body that plays itself off Life over anything else; take OP12-112 Baby 5 or another [Trigger] over a card with none; and bank a card with no Trigger rather than nothing, because a Life card is still a Life card.",
    "EB04-058 Borsalino is a [Blocker] whose [On Play] only banks a Life card while you are at two Life or fewer. It is a late card, not an early one.",
    "OP09-078 is the only Counter in the deck. Do not spend the two DON!! it costs off the field on a battle you were winning: it is four copies of one answer, and the deck has no other.",
  ],
  commonVariants: [
    "Five Robin lists from the Utrecht weekend are recorded on onepiecetopdecks -- a 10-0 first, a 9-1 top four, two finals placings and a side-event win -- and they agree on forty-four of fifty. This is the EU Final's runner-up; the 10-0 list differs from it only in trading a ST34-003 for a fourth OP17-113, which is the same 1-cost search.",
    "OP12-112 Baby 5 is the negotiable slot: two to four copies in four of the five lists, and the fifth runs OP17-111 in its place. Two lists reach into OP-05 and OP-08 for extra 2-cost Counters instead of the third Baby 5.",
    "ST34-003 Charlotte Brulee runs at two to four across the lists, always paired with OP17-113 Streusen so that the two searchers total seven or eight.",
  ],
  commonCombos: [
    "OP17-112 Charlotte Linlin on the board turns Daifuku, Oven, Smoothie, Sweet 3 Generals and Perospero into 8000s on your turn -- including the ones that arrived from Life while the opponent was attacking you.",
    "OP17-110 Charlotte Perospero deploying OP17-106 Charlotte Smoothie: a second body, a card banked onto Life, a card stripped from the opponent's hand, and an attack from the Perospero the same turn.",
    "OP17-114 Sweet 3 Generals into a board of two: a card drawn, a card banked, and two of the opponent's Characters down 3000 -- often two K.O.s' worth of blocking gone for two rested DON!!.",
    "The Leader's ramp on a turn you were going to attack anyway: a [Trigger] card you cannot cast becomes the DON!! that casts OP17-112 next turn.",
    "OP17-102 Charlotte Oven blocking, dying, and replaying a 4000-power body out of the trash under Linlin's aura, which makes the replacement an 8000.",
  ],
  keyCardNumbers: [
    "OP09-062",
    "OP17-112",
    "OP17-114",
    "OP17-106",
    "OP17-102",
    "OP17-109",
    "OP16-119",
    "OP09-078",
    "ST34-003",
    "OP17-113",
    "OP12-112",
  ],
  sources: [
    {
      url: "https://onepiecetopdecks.com/deck-list/english-op17-deck-list-the-worlds-strongest-warriors/",
      retrievedAt: "2026-09-19",
      note: "The five Nico Robin lists recorded from BCG Fest 26-27 Utrecht, taken from the page's own deckgen links. The manifest is KDZ Millan's, 2nd Place at the EU Final, 6 September 2026; the shared core and the slot differences above are read off all five.",
    },
  ],
  counterplay: [
    "Do not attack into a stacked Life stack you cannot finish. Every point of damage this deck takes may play a Character for free, and five of its bodies do exactly that -- a race against it is a race that builds its board.",
    "Answer OP17-112 Charlotte Linlin rather than the bodies around it. Without the aura the deck's board is 4000s; with it, the same board is 8000s on their turn.",
    "It has one [Counter] Event, four copies, and it costs two DON!! off their field on top of its own cost. Force it early, then attack again into a hand that is holding cards for the Leader's ramp rather than for defence.",
    "Its Leader is a 5000 and its removal is thin: one Trigger on OP16-119, which only fires when you hit its Life, and OP17-114's -3000. A board of Characters printed at 6000 or more is largely untouchable.",
    "The [Banish] only matters when the Leader itself connects. Blocking the Leader's attack with a Character, or keeping your own Life stack shallow late, takes the keyword out of the game.",
  ],
};

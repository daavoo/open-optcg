import type { DeckStrategyDossier } from "./types.js";

/**
 * ST-22 is a precon, so there is no tournament write-up to cite: the sources
 * below are the product itself and the two published lists of its contents,
 * and every line here is read off the seventeen cards.
 *
 * The thing this dossier exists to say is that the deck's random-looking
 * clauses are not random. Five cards pay out when the top card of the deck is
 * {Whitebeard Pirates}, every main-deck card in the fifty is, and the Leader
 * can put a card of your choice on top -- so a reveal is a near-certainty the
 * pilot sets up, not a coin to hope on.
 */
export const st22Dossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Blue) Ace & Newgate - Starter Deck 22",
  archetype:
    "ST-22 Blue Whitebeard Pirates: a card-flow midrange deck whose payoffs reveal the top of its own deck, closing with a 7-cost Oden that refuses removal and a 9-cost Double Attack Newgate",
  gamePlan: [
    "Every card in your main deck has a type including \"Whitebeard Pirates\", so 'reveal 1 card from the top of your deck; if it is Whitebeard Pirates' is true unless your deck is empty. Treat ST22-003 Edward.Newgate's and ST22-006 Jozu's draws, ST22-007 Squard's DON!!, ST22-012 Marco's +1000 and ST22-016's +4000 as what those cards do, not as a gamble.",
    "Use the Leader's [Activate: Main] every turn you can. It shows a Whitebeard Pirates card from your hand, draws the top card, and puts the shown card on top -- so it swaps a card you hold for the next card of the deck, and leaves a card you chose waiting for the next reveal or draw. Show the card you least want this turn and most want next turn.",
    "Build the board with the 2-to-4-cost bodies -- ST22-008 Decalvan Brothers, ST22-004 Elmy, ST22-012 Marco, ST22-014 A.O. -- and keep the 1-cost cards for what their text does: ST22-002 Izo digs five deep, ST22-007 Squard moves a rested DON!! once a turn, ST22-009 Vista blocks.",
    "Reach seven DON!! for ST22-005 Kouzuki Oden and ST22-006 Jozu, and nine for ST22-003 Edward.Newgate. Oden is the body that sticks: an opponent's effect cannot remove him while you can trash two cards from hand instead. Newgate is the finisher: 10000 power and [Double Attack].",
  ],
  mulligan: [
    "Keep a hand with a Character costing 2 to 4, or with ST22-002 Izo. Those are the cards that put pressure on the opponent on turns two to four; Izo finds one.",
    "Ship a hand whose only cheap cards are 1-cost text -- Squard, Vista, Whitey Bay -- and ST22-016. They are good cards, but none of them can attack a 5000 Leader on curve.",
  ],
  priorities: [
    "ST22-005 Kouzuki Oden's [Activate: Main] rests three DON!! and returns one of your other Characters to hand to set Oden active again. That is a second Oden attack, or an 8000 body standing up for the opponent's turn -- and the Character you return can be ST22-002 Izo or ST22-011 Whitey Bay, whose [On Play] you get again when you replay it.",
    "ST22-011 Whitey Bay's [On Play] costs nothing: it only shows two Whitebeard Pirates cards from your hand. Play it before attacking with the Leader, for +2000 this turn.",
    "ST22-017 Fire Fist also shows two cards rather than spending them, and then draws one and puts a cost-5-or-less Character at the bottom of its owner's deck. Without two Whitebeard Pirates cards to show beside it, it does nothing at all -- do not cast it from a hand of one.",
    "ST22-015 I Am Whitebeard!! plays ST22-003 Edward.Newgate from your hand, then lets you take a Life card for +2000 on your Leader through the opponent's next turn. Cast it with Newgate in hand; the Life half is optional, so decline it when the card in Life is worth more than the defence.",
    "ST22-012 Marco's +1000 lasts until the end of the opponent's next turn, so the attack that reveals a hit also leaves a 6000 defender behind.",
    "ST22-002 Izo can trash itself when the opponent attacks to draw one card and put one from your hand on the bottom. Spend it when Izo is about to be attacked or removed anyway.",
  ],
  commonVariants: [
    "This is the sealed product, unchanged. Blue Ace & Newgate lists built from boosters keep the Leader's reveal engine and the top-end Newgate, and replace the vanillas -- Elmy, Decalvan Brothers, LittleOars Jr., A.O., Portgas.D.Ace -- with OP-08's Whitebeard Pirates package.",
  ],
  commonCombos: [
    "The Leader's [Activate: Main] before ST22-003 Edward.Newgate or ST22-006 Jozu: you choose the card that goes on top, so the reveal hits, and the card you showed is one of the two you then draw.",
    "ST22-005 Oden returning ST22-002 Izo: Oden stands back up, and the replayed Izo digs another five deep.",
    "ST22-015 into ST22-003: Newgate arrives without paying nine DON!!, on top of the Event's own eight.",
  ],
  keyCardNumbers: [
    "ST22-001",
    "ST22-002",
    "ST22-003",
    "ST22-005",
    "ST22-012",
    "ST22-015",
  ],
  counterplay: [
    "Do not spend effect removal on ST22-005 Kouzuki Oden while their hand holds two cards: they trash two from hand and he stays. Attack him, or wait until the hand is empty.",
    "ST22-012 Marco answers an effect K.O. once a turn with one card from hand, but only a K.O. -- returning him to hand or putting him under the deck goes through.",
    "Count ST22-016 as a live +4000 Counter. Their deck is all Whitebeard Pirates, so the reveal almost never misses.",
    "ST22-003 Edward.Newgate deals two damage. Keep a blocker or the Counter for it once they reach nine DON!!.",
  ],
  sources: [
    {
      url: "https://en.onepiece-cardgame.com/cardlist/?series=569022",
      retrievedAt: "2026-10-04",
      note: "Bandai's own ST-22 card list: the seventeen identities the product contains, with the printed text every line above is read from.",
    },
    {
      url: "https://deckbuilder.egmanevents.com/api/gamedata/optcg",
      retrievedAt: "2026-08-22",
      note: "The ST22 entry in the structure-deck list, which is where the per-slot counts in the manifest come from -- 50 main-deck cards behind ST22-001.",
    },
    {
      url: "https://cardgamebase.com/one-piece-st22-decklist-card-list/",
      retrievedAt: "2026-10-04",
      note: "A second published list of the product. It agrees with the egman counts on twelve of the sixteen slots and swaps two pairs (Oden and Vista at 4, Ace and A.O. at 2); the manifest keeps the egman split, which puts both Super Rares at 2 as every Bandai starter does.",
    },
  ],
};

import type { DeckStrategyDossier } from "./types.js";

export const op08PuddingDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Purple/Yellow) Charlotte Pudding - Open OPTCG",
  archetype:
    "OP-08 Purple/Yellow Charlotte Pudding Big Mom Pirates ramp: DON!! off the Leader and purple bodies on one side, the OP-17 yellow [Trigger] package that banks the deck onto Life on the other, finishing with OP17-112 Charlotte Linlin.",
  gamePlan: [
    "The Leader's [When Attacking] turns two Life cards face-up for a rested DON!!. Attack with the Leader every turn you can: it is the deck's most reliable ramp, and a face-up Life card is still a Life card.",
    "The purple side ramps as well: ST34-002 Charlotte Cracker adds a rested DON!! and K.O.s a 2-cost, OP17-074 Yamato is a 3-cost [Blocker] that adds a rested DON!!, and OP11-067 Charlotte Katakuri adds one at the end of your turn.",
    "The yellow side refills Life on your turn: OP17-103 Charlotte Katakuri, OP17-104 Charlotte Cracker and OP17-114 Sweet 3 Generals each add the top of the deck to Life, and each is played for free when it is taken as damage.",
    "OP17-112 Charlotte Linlin at 10 is the finisher: on your turn every 4000-base [Trigger] Character becomes an 8000 -- OP17-107 Daifuku, OP17-109 Pudding, OP17-104, OP17-103 and OP17-114 all are.",
    "OP08-062 Charlotte Katakuri trashes itself to play a [Charlotte Katakuri] from hand costing no more than the opponent's DON!! on the field: a 2-cost that becomes OP17-103 or OP11-067 early.",
  ],
  mulligan: [
    "Keep a 1-cost digger -- ST34-003 Charlotte Brulee, OP17-113 Streusen -- or OP07-077, or OP17-074 Yamato for the DON!! it adds.",
    "Throw back a hand of only 6-, 8- and 10-costs and Events: nothing in it acts on the opening turns.",
  ],
  priorities: [
    "Take the Leader's DON!! whenever it is offered while you have face-down Life to turn: the rested DON!! pays next turn's curve.",
    "Cast OP17-103, OP17-104 and OP17-114 on your own turn: their Life banking only happens on your turn, and the Life card they add is often another [Trigger] body.",
    "OP17-109 Charlotte Pudding's [On Play] trashes a [Trigger] card from hand to draw three. Pay with OP17-107 Daifuku first: it has no clause beyond its [Trigger].",
    "OP11-106 Zeus K.O.s a 5-cost or less for a Life card taken into hand; take it when the K.O. is worth a card and you are not about to be attacked at low Life.",
    "OP11-067 Charlotte Katakuri sets two rested Big Mom Pirates costing 3 or more active at the end of your turn: attack with them first, then they stand back up as blockers and Counter targets.",
    "OP13-076 Divine Departure's [Main] gives −8000 for five rested DON!! but needs a DON!! given to one of your cards; attach one first.",
  ],
  commonVariants: [],
  commonCombos: [
    "Leader attack for a DON!!, then OP17-114 Sweet 3 Generals the next turn: a card, a Life card back, and −3000 on two of the opponent's Characters.",
    "OP17-112 Linlin with a board of 4000-base [Trigger] bodies: every one of them attacks as an 8000.",
    "OP08-062 Katakuri trashing itself into OP11-067 once the opponent has eight DON!! out.",
  ],
  keyCardNumbers: [
    "OP08-058",
    "OP17-112",
    "OP17-114",
    "OP17-103",
    "OP11-067",
    "ST34-002",
    "OP17-109",
  ],
  counterplay: [
    "Every Leader attack costs them two face-down Life cards, so the Life they have left is visible: count it before deciding how hard to press.",
    "Their Life is full of [Trigger] bodies, so damage taken often puts a Character on their board for free; press with the attack that ends the game rather than trading Life for board.",
    "K.O. OP17-112 Linlin, or the 4000-base bodies before it lands: once it is out each of them is an 8000.",
  ],
  sources: [],
};

import type { DeckStrategyDossier } from "./types.js";

export const op09LuffyTournamentDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Purple/Black) Monkey.D.Luffy - 1st Place 2v2 2025-06-13",
  archetype:
    "Purple/Black OP09-061 Monkey.D.Luffy as a DON!!-return deck: almost every Character returns DON!! for a payoff, and the Leader's once-per-turn refund puts two DON!! back each time, so the returns cost little and the DON!! count climbs to the 8 that ST18-001 Uso-Hachi and ST18-002 O-Nami ask for.",
  gamePlan: [
    "The Leader's [Your Turn] [Once Per Turn] clause adds 1 active and 1 rested DON!! from the DON!! deck when 2 or more DON!! on your field return to it. Make the first return of each turn one of 2 or more; the second return that turn gets no refund.",
    "ST26-003 Nico Robin pays DON!! -2 to add an active DON!!, and OP09-076 Roronoa Zoro returns 1 or more for the same: with the refund, a return of 2 ends with one more DON!! than it started with.",
    "OP09-065 Sanji and OP09-119 Monkey.D.Luffy return 1 or more DON!! for [Rush] -- Sanji rests a cost 6 or less, Luffy draws a card. Return 2 so the Leader refunds them.",
    "OP07-064 Sanji costs 3 less in hand while you have at least 2 fewer DON!! than the opponent. Returning DON!! is how you get there: a 3-cost 6000 [Blocker] with a 2000 Counter.",
    "ST18-001 Uso-Hachi rests a cost 5 or less, and ST18-002 O-Nami trashes 1 to draw 2, only with 8 or more DON!! on your field. Play them after the turn's returns and refund, not before.",
    "OP09-069 Trafalgar Law and OP05-076 find a {Straw Hat Crew} card; almost every card here is one.",
  ],
  mulligan: [
    "Keep a 1- or 3-cost opener -- OP09-069 Law, ST26-003 Robin, OP09-076 Zoro or ST18-001 Uso-Hachi -- so the first returns start on turn 2 or 3.",
    "A hand of 6- to 9-costs with no searcher and no 3-cost takes a new hand.",
  ],
  priorities: [
    "With a DON!! on the Leader, your Characters gain +1 cost. That puts a 5-cost out of reach of a cost 5 or less removal; it also does not change what you pay.",
    "EB02-061 Monkey.D.Luffy gains [Rush] once the opponent has 5 or more DON!! on their field (the Leader is two colours). Its [When Attacking] returns 2 active DON!! to set it active again and puts your top Life card in your hand -- a second attack that costs a Life, and on your turn the Leader refunds the 2 DON!!.",
    "ST26-005 Monkey.D.Luffy's DON!! -2 sets your Leader's base power to 7000 until the end of the opponent's next End Phase. It fires on play and when attacking: spend it the turn you need the Leader to survive their next attacks.",
    "OP09-078 Gum-Gum Giant (DON!! -2 and a card: +4000, draw 2) and OP09-072 Franky (DON!! -2 and a card: draw 2) are the deck's card flow. Gum-Gum Giant is a Counter, played on their turn, where the Leader's refund does not fire, so it costs the 2 DON!! outright.",
    "OP11-067 Charlotte Katakuri is an 8-cost [Blocker] whose [End of Your Turn] sets itself active and adds a rested DON!!: attack with it, then it blocks on their turn.",
    "OP03-072 Gum-Gum Jet Gatling is a +3000 Counter for a card from hand, and its [Trigger] adds an active DON!!.",
  ],
  commonVariants: [
    "The ST-26 product behind this Leader plays OP05-065 San-Gorou and ST26-001 Soba Mask, OP05-066 Jinbe, OP05-070 Fra-Nosuke, OP09-063 Usopp, OP09-070 Nami, OP09-077 Gum-Gum Lightning, ST14-010 Brook, ST26-002 Chopper and ST26-004 General Franky. This list cuts them for both Sanjis, Law, Franky, O-Nami, Uso-Hachi, OP09-119 and EB02-061 Luffy, Katakuri, OP05-076 and Gum-Gum Jet Gatling, and runs four Robin, ST26-005 Luffy and Gum-Gum Giant.",
  ],
  commonCombos: [
    "Robin pays DON!! -2, the Leader adds 2 back and Robin 1 more: the 3-cost ends the turn with one more DON!! on your field than before it.",
    "Return DON!! early in the turn to drop below the opponent's count, then play OP07-064 Sanji for 3.",
    "Reach 8 DON!! with the turn's refund, then play Uso-Hachi to rest their attacker or O-Nami to draw.",
  ],
  keyCardNumbers: [
    "OP09-061",
    "ST26-003",
    "OP09-076",
    "OP09-065",
    "OP09-119",
    "OP07-064",
    "OP09-078",
    "ST26-005",
  ],
  counterplay: [
    "The refund is once per their turn. A second DON!! return in the same turn costs them full price.",
    "Uso-Hachi and O-Nami do nothing below 8 DON!!; pressure that forces Gum-Gum Giant on your turn keeps them under it.",
    "An attack that wins by 2000 or less into their Leader may meet a 7000 base from ST26-005.",
  ],
  sources: [
    {
      url: "https://onepiecetopdecks.com/deck-list/english-eb-02-deck-list-anime-25th-collection/",
      retrievedAt: "2026-10-31",
      note: 'The deck\'s own 50: entry "Yonko Luffy", the list pilot "Ivan" took to 1st, 4-0, at a 2v2 event at GeeklogiaShop in Spain on 13 Jun 2025.',
    },
    {
      url: "https://en.onepiece-cardgame.com/feature/deck/deck_052.php",
      retrievedAt: "2026-09-07",
      note: "Bandai's feature-deck guide for OP09-061: return more than one DON!! at a time so the Leader refunds it.",
    },
  ],
};

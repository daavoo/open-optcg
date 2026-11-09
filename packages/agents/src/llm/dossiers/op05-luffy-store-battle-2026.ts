import type { DeckStrategyDossier } from "./types.js";

export const op05LuffyStoreBattle2026Dossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Purple) Monkey.D.Luffy - 1st Place Store Battle 2026-09-10",
  archetype:
    "Purple Luffy as a {Big Mom Pirates} ramp deck behind OP05-060: the Leader, Mr.2, Pudding and Yamato add DON!! from the DON!! deck, the 10-cost Kaido and Charlotte Linlin are the payoff, Linlin puts Life back, and Katakuri stands the Big Mom bodies up at the end of the turn so they attack and still block.",
  gamePlan: [
    "OP05-060's [Activate: Main], once a turn, moves the top card of your Life to your hand to add 1 active DON!! from your DON!! deck, while you have 0 or 3 or more DON!! on your field. The DON!! is usable the same turn.",
    "Ramp on every cheap play. EB01-061 Mr.2 adds an active DON!! on play; EB03-035 Charlotte Pudding adds a rested one while your field has no more DON!! than the opponent's; OP17-074 Yamato adds a rested one on play. Pudding and Yamato are both [Blocker]s, so the ramp also walls.",
    "The top end is two 10-costs at 12000. ST34-004 Charlotte Linlin returns 4 DON!! and trashes a card to add a Life card and set an opposing Character's base power to 0 for the turn. OP17-062 Kaido is a [Blocker] that, once on your turn, refunds a returned DON!!: it adds an active DON!! from the DON!! deck and sets another active.",
    "OP08-069 Charlotte Linlin at 9 returns 1 DON!! and trashes a card to add a Life card and put an opposing Character of cost 6 or less onto the top or bottom of the opponent's Life face-up. It is removal that hands them a Life card, so aim it at a body worth more than that card.",
    "OP11-067 Charlotte Katakuri, at the end of your turn, sets up to 2 of your {Big Mom Pirates} Characters of cost 3 or more active and adds a rested DON!!. Daifuku, both Linlins, EB03-035 Pudding and Katakuri itself qualify, so they attack and then stand as defence.",
    "The Leader spends Life for DON!!, and the two Linlins put it back. Count Life before each activation: the activation is a card now and a Life card the opponent no longer has to take.",
  ],
  mulligan: [
    "Keep OP11-070 Pudding or ST34-003 Brulee: each costs 1 and digs for a {Big Mom Pirates} card, and Pudding's look only offers cost 2 or more.",
    "Keep a 3- or 4-cost ramp body -- Yamato, Mr.2 or EB03-035 Pudding -- as the turn that gets the deck to its 8- and 10-costs early.",
    "Ship a hand of only 8-costs and up with nothing to cast before turn four.",
  ],
  priorities: [
    "Sequence the top end around Kaido. With Kaido on the field, the first DON!! returned on your turn comes back active with a second set active, so cast Linlin or a DON!!-return Event after Kaido lands.",
    "Use the Leader's activation on turns you will spend the extra DON!!, not by default. It needs 0 or 3 or more DON!! on your field; it does nothing at 1 or 2.",
    "ST34-004 Linlin's base-power-0 lands on the turn it is cast: aim it at the Blocker or the body your attacker cannot beat, then attack.",
    "Hold OP09-078 Gum-Gum Giant for the opponent's turn: it returns 2 DON!! and trashes a card for +4000 and 2 cards, under a Straw Hat Leader. Leave 2 DON!! on the field at the end of your turn when you hold it.",
    "OP07-076 returns 1 DON!! for +2000 and rests an opposing Character; OP15-078 Mamaragan is +1000 as a Counter and draws while you have 6 or fewer DON!! on the field. On your turn Mamaragan returns 2 DON!! to draw and rest a 5000-or-less body.",
    "OP13-076 Divine Departure's [Main] rests 5 DON!! for −8000 on an opposing Character, but only while you have DON!! given. Give DON!! first, then cast it. Its Counter half trashes a card for +3000.",
    "EB01-061 Mr.2's [When Attacking] sets its base power to an opposing Character's power for the turn. Attack with it after choosing the biggest Character on their board.",
    "Counter with the Events and the vanilla OP11-068 Daifuku before a [Blocker]: Pudding, Yamato, Katakuri and Kaido block every turn they stay on the field.",
  ],
  commonVariants: [
    '"(Purple) Monkey.D.Luffy - 1st Place Store Battle 2025-07-01" is the DON!!-return build: OP09-065 Sanji, OP09-119 Monkey.D.Luffy, OP06-076 Hitokiri Kamazo, OP09-069 Trafalgar Law and the ST18 Wano Straw Hats where this list plays the Big Mom bodies, Kaido and the Linlins. Expect [Rush] attackers and small K.O.s from it.',
    "The starter list for this Leader is the OP05/ST18 Wano Straw Hats, nearly all of it reading 8 or more DON!! on the field.",
  ],
  commonCombos: [
    "Kaido on the field, then ST34-004 Linlin: Kaido refunds one of the four DON!! active and sets another active, so the turn goes on.",
    "Katakuri at the end of the turn: Daifuku and a Linlin that attacked stand up again to defend.",
    "EB03-035 Pudding or Yamato on turn 3, then Mr.2: two DON!! ahead of the curve and two [Blocker]s down.",
    "Leader activation into a 10-cost a turn early, with Linlin adding the Life card back.",
  ],
  keyCardNumbers: [
    "OP05-060",
    "OP17-062",
    "ST34-004",
    "OP11-067",
    "OP08-069",
    "EB01-061",
    "EB03-035",
    "OP17-074",
    "OP11-070",
    "OP09-078",
  ],
  counterplay: [
    "The Leader spends Life for DON!!; pressure early, before the Linlins put Life back.",
    "Kaido turns every DON!! return on their turn into a refund. Remove it before the Linlin turn.",
    "Katakuri stands two Big Mom bodies up at the end of their turn. A board that attacked is still a board that blocks.",
    "Gum-Gum Giant is +4000 on their defence whenever they have 2 DON!! to return. An attack that wins by 4000 or less is not safe.",
    "OP08-069 Linlin puts your Character of cost 6 or less onto your Life face-up: you keep the card, but not the body.",
  ],
  sources: [
    {
      url: "https://onepiecetopdecks.com/deck-list/english-op17-deck-list-the-worlds-strongest-warriors/",
      retrievedAt: "2026-10-17",
      note: 'The deck\'s own 50: entry "Purple Luffy", the list pilot "Zach S" took to 1st, 4-0, at a Store Battle in Australia on 10 Sep 2026.',
    },
    {
      url: "https://onepiecetopdecks.com/deck-list/english-eb-02-deck-list-anime-25th-collection/",
      retrievedAt: "2026-10-17",
      note: 'The 1st-place Store Battle list for OP05-060 (entry "Purple Luffy", "Desaparecido", 1 Jul 2025), the source of the first variants line.',
    },
  ],
};

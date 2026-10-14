import type { DeckStrategyDossier } from "./types.js";

export const op12KoalaDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Black/Yellow) Koala - Official Feature Deck",
  archetype:
    "Black/Yellow {Revolutionary Army} midrange behind OP12-081: land two Characters that count as cost 8, draw a card on every Leader attack, and make the opponent's big plays cost them a Life card.",
  gamePlan: [
    "Your Leader draws 1 card when it attacks your opponent's Leader while you have 2 or more Characters with a cost of 8 or more. Getting two of them onto the field early is the whole opening.",
    "OP12-093 Morley, OP12-095 Lindbergh and OP12-089 Hack cost 4 to play and count as cost 8 on the field behind this Leader. OP12-085 Karasu (5 to play) also counts as 8. OP12-087 Nico Robin counts as 9 and is a [Blocker]. OP12-100 Sabo counts as 8 and is a [Blocker] once you are at 3 Life or fewer. OP12-094 Monkey.D.Dragon is printed at 8.",
    "OP12-086 Koala and OP12-097 Captains Assembled look at 3 cards and add a {Revolutionary Army} card (Koala also finds Nico Robin). Use them to find the 4-cost bodies on turns one and two.",
    "Hack and Robin are your [Blocker]s. Hack's [On K.O.] K.O.s an opposing Character with a base cost of 4 or less, so it is a fine body to block with.",
    "Your Leader's second effect, once per turn on your opponent's turn: when they play a Character with a base cost of 8 or more, or play a Character with a Character's effect, they add their top Life card to their hand. Late in the game this makes their big turns cost them Life.",
    "OP12-094 Monkey.D.Dragon puts 3 {Revolutionary Army} cards from your trash at the bottom of your deck to play a 6-cost-or-less Character from your trash. OP12-119 Bartholomew Kuma (banks a Life card) and Nico Robin are the targets worth playing.",
  ],
  mulligan: [
    "Keep a hand with Morley, Lindbergh, Hack, OP12-086 Koala or Captains Assembled: each one is a 4-cost body that counts as 8, or finds one.",
    "A hand with none of them gives the Leader nothing to count for several turns. Take a new hand.",
  ],
  priorities: [
    "Play two cost-8 bodies before anything else. Your Leader draws on every attack after that, so the earlier they land the more cards you draw.",
    "Attack your opponent's Leader with your Leader once two cost-8 Characters are down. Attacking a Character draws nothing.",
    "Morley has a 2000 Counter. Once you already have two cost-8 bodies down, a spare Morley in hand is a good Counter.",
    "Nico Robin's [On Play] trashes 1 card from your hand to make an opponent holding 5 or more trash 2. Play her when they hold 5; with fewer it costs you a card for nothing.",
    "Karasu's [When Attacking] makes an opponent holding 5 or more cards trash 1. Attack with it while their hand is full.",
    "Save Monkey.D.Dragon until your trash holds three {Revolutionary Army} cards and a Kuma or Robin to play back.",
  ],
  commonVariants: [
    "This is Bandai's own recommended list for the Leader, built entirely from OP-12: twelve 4-ofs and two Karasu.",
  ],
  commonCombos: [
    "Turn-four Morley or Lindbergh plus a second 4-cost body counting as 8: your Leader draws on every attack from then on.",
    "Monkey.D.Dragon plays Bartholomew Kuma back from the trash; Kuma's [On Play] trashes a card from hand to bank the top of your deck as a Life card.",
    "Nico Robin into an opponent holding 5: you trash 1, they trash 2, and your Leader's next attack draws back the card you spent.",
  ],
  keyCardNumbers: [
    "OP12-081",
    "OP12-093",
    "OP12-095",
    "OP12-089",
    "OP12-086",
    "OP12-097",
    "OP12-087",
    "OP12-094",
  ],
  counterplay: [
    "Their Characters count as cost 8 on the field, out of reach of most cost-based removal. Remove by power or in battle instead.",
    "Every Leader attack they make draws a card while they have two cost-8 bodies. Taking one of the two off the board switches the draw off.",
    "Their Leader taxes your Characters with a base cost of 8 or more, and any Character you play from a Character's effect, a Life card once a turn. Play those when the Life card does not matter.",
  ],
  sources: [
    {
      url: "https://en.onepiece-cardgame.com/feature/deck/deck_069.php",
      retrievedAt: "2026-10-04",
      note: "Bandai's feature deck for OP12-081: the fifty, opening on OP12-086 Koala and OP12-097 Captains Assembled to find bodies that count as 8, Morley's 2000 Counter, Hack and Sabo as [Blocker]s, Robin's [On Play] discard, the Leader's Life tax in the end game, and Monkey.D.Dragon playing Kuma or Robin back from the trash.",
    },
  ],
};

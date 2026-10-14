import type { DeckStrategyDossier } from "./types.js";

export const st33KuzanTournamentDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Blue) Kuzan - 1st Place Bandai Hiroshima",
  archetype:
    "Blue Navy control, the competitive build of the ST-33 starter: the same trash-from-hand draw engine, with Tashigi as a free opening search, Issho and Sakazuki in place of the vanilla bodies, and two 8-cost finishers on top.",
  gamePlan: [
    "The Leader draws one card for every card a {Navy} card's effect trashes from your hand. Koby, Smoker, Sengoku, Kuzan, Issho, Sakazuki, Hina, Garp, Aramaki, Ice Time and Ice Block all trash as part of their effect, so their hand cost comes straight back.",
    "Open with Tashigi and Sengoku. Tashigi looks at five for any {Navy} card at no hand cost; Sengoku looks at five for two. Between them they find the Blockers and the removal the rest of the game is built on.",
    "Take the opponent's attackers away rather than trading into them: Smoker bottoms two cost-2-or-less Characters, Kuzan, Ice Time and Mr.3 stop Characters attacking, and Gravity Blade bottoms two cost-6-or-less Characters.",
    "Wall up behind Koby, Borsalino and Aramaki, then turn the corner with Issho, Sakazuki and the 8-cost Garp once the opponent's board is spent.",
  ],
  mulligan: [
    "Keep Tashigi, Sengoku, Koby or Smoker: each is a cheap play that either finds the next card or starts the Leader drawing.",
    "Do not keep a hand of 5-cost-and-up cards with none of those; the engine, not the curve, is what makes this deck function.",
  ],
  priorities: [
    "Take every 'you may trash 1 card from your hand' a {Navy} card offers unless the hand itself is the resource you are protecting. The Leader replaces the card, so you are choosing which card to cycle, not whether to lose one.",
    "Issho trashes two: two draws back. Its hand disruption only fires against a hand of 6 or more, so play it when the opponent is holding cards, not after they have emptied their hand onto the board.",
    "Play Borsalino on a turn something has already been trashed from your hand; it costs 3 instead of 6 for the rest of that turn.",
    "Play the 8-cost Garp or ST33-005 Garp with a blue {Navy} Character of 8000 power or less still in hand, so the [On Play] brings a second body for free. Kuzan, Borsalino and Sakazuki are all in range.",
    "Sakazuki draws two on entry and, once a turn, trashes a card to give a rested DON!! to a Character or the Leader. Use it on the body that is about to attack, and remember the trash draws a card back.",
    "Mr.3 is the one card here that is not {Navy}: Tashigi and Sengoku cannot find it, and trashing it from the board does not trigger the Leader. It still draws two and stops an attacker of cost 9 or less.",
    "Hina rests and trashes a card to stop a cost-4-or-less Character using [Blocker] this turn: use it on the turn you are attacking into a Blocker that would otherwise stop lethal.",
    "Kuzan gains +1 cost with 5 or more cards in hand, so trash with something else first when the hand is large.",
    "Hold Ice Block for a battle its +4000 decides. Its trash is drawn back by the Leader, so it costs one card, not two.",
  ],
  commonVariants: [
    "The ST-33 precon under this Leader runs Bluegrass, ST33-002 Sakazuki, Zephyr and the vanilla Jango, Jaguar.D.Saul and Fullbody where this list runs Tashigi, Issho, OP12-044 Sakazuki, Mr.3 and Hina.",
    "Other 1st-place lists from the same weeks keep the same core and move a handful of slots between Bluegrass, Aramaki, the 8-cost Garp and a second Gravity Blade.",
  ],
  commonCombos: [
    "Tashigi into Sengoku: one free Navy card, then two more for a trash the Leader draws back.",
    "Koby trashes one to draw one, and the Leader draws one more: a 2-cost Blocker that replaces itself twice.",
    "Any trash this turn, then Borsalino for 3: a 6000 Blocker at the cost of a 2-drop.",
    "The 8-cost Garp trashes one to play Kuzan from hand: two 8000 bodies and an attack lock in one turn, and the trash is drawn back.",
  ],
  keyCardNumbers: [
    "OP06-050",
    "OP12-047",
    "ST33-001",
    "ST33-004",
    "EB04-022",
    "OP12-057",
  ],
  counterplay: [
    "Play above the gates. Smoker reaches cost 2 or less, Gravity Blade cost 6 or less, and Ice Time 10000 power or less; a bigger body ignores all three.",
    "Hold your hand at 5 or fewer cards when Issho comes down and its disruption does nothing.",
    "Pressure early. The Blockers arrive on the mid curve, and the removal is weakest before Tashigi and Sengoku have found it.",
  ],
  sources: [
    {
      url: "https://onepiecetopdecks.com/deck-list/japan-op16-deck-list-the-time-of-battle/",
      retrievedAt: "2026-10-08",
      note: "The deck's own 50 is the 1st-place 5-0 entry by 'Kuru' at a Bandai-hosted event in Hiroshima, 18 Jul 2026. The page's other Blue Kuzan 1st places from July and August 2026 are where the variants line comes from.",
    },
    {
      url: "https://onepiecetopdecks.com/deck-list/english-op16-deck-list-the-time-of-battle/",
      retrievedAt: "2026-10-08",
      note: "A further Blue Kuzan 1st place (Australia, 6 Aug 2026) on the same core.",
    },
  ],
};

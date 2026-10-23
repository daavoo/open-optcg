import type { DeckStrategyDossier } from "./types.js";

export const op11KobyDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Red/Black) Koby - 2nd Place Indonesia Regional Final",
  archetype:
    "Red/Black {Navy} {SWORD} tempo behind OP11-001: every body you play attacks an opposing Character the turn it lands, after a power cut shrinks the target, while the trash fuels both your recursion and your Leader's protection.",
  gamePlan: [
    "Your Leader lets your {SWORD} Characters attack Characters on the turn they are played. Treat every {SWORD} play as a removal attack: shrink a Character, then swing the new body into it.",
    "Only rested Characters can normally be attacked. EB03-008 Hibari (on play and when attacking) and OP11-082 Aramaki (trash it from the field) let one of your bodies attack an active Character as well, so play them before the attack that needs it.",
    "The power cuts set those attacks up: OP11-008 Doll gives −6000 for a card from hand, OP13-020 Meteor Fist −5000, OP13-007 Ace & Sabo & Luffy −3000 for a DON!! and itself, and Hibari's [Activate: Main] −1000 once a turn. PRB02-001 Koby K.O.s a 3000-base Character outright when it attacks.",
    "Your Leader also, once a turn, saves a {Navy} Character of 7000 base power or less from your opponent's removal by placing 3 cards from your trash at the bottom of your deck. Keep 3 cards in the trash on your opponent's turn so the save is there.",
    "The trash is fuel. EB04-047 Helmeppo trashes itself to play a 3-cost-or-less {SWORD} from hand or trash. OP11-092 Helmeppo draws 1 and plays an 8-cost-or-less {SWORD} back from the trash for the turn, so it can bring back EB04-044 Koby or a Hibari to attack a Character that turn; the body goes to the bottom of your deck at the end of it.",
    "OP11-004 Kujyaku and OP11-099 look for {Navy} cards; OP11-099 trashes what it does not take, which feeds the trash. EB03-041 Kujyaku draws 2 for a {Navy} card from hand and gives your 6-cost-or-less {SWORD} Characters +2000 on your opponent's turn.",
  ],
  mulligan: [
    "Keep a hand with EB03-008 Hibari, EB04-047 Helmeppo, EB03-041 Kujyaku or PRB02-001 Koby: each is an early {SWORD} body that attacks a Character the turn it lands.",
    "OP11-004 Kujyaku and OP11-099 also keep a hand, because they find one of those bodies.",
    "A hand of 1-cost support pieces and 6- or 8-cost bodies has nothing to send at a Character for several turns. Take a new hand.",
  ],
  priorities: [
    "Before you attack a Character, shrink it first: it is the cut that lets a 5000 body win the battle, not the attack itself.",
    "If the Character you want to hit is active, play Hibari or use Aramaki first; otherwise the new body can only reach rested targets.",
    "Play OP11-013 Prince Grus and attack with it before your other attacks: while it attacks, your opponent's 2000-power-or-less Characters cannot block.",
    "OP11-096 Ripper is a [Blocker] only while you have another black {Navy} Character, so play it beside Aramaki, a Helmeppo, EB03-041 Kujyaku or EB04-044 Koby, not alone.",
    "OP11-097 is a 1000 Counter for 1 DON!!; once your trash holds 10 cards it also returns a black 3-cost-or-less Character, such as EB04-047 Helmeppo, to your hand.",
    "EB04-003 Smoker & Tashigi has [Rush] and sets your Leader at 7000 on your opponent's turn. Land it when the Leader is being attacked every turn.",
    "EB04-044 Koby trashes a card from hand to survive any removal and draws when your opponent's Character is K.O.'d on your turn, so it is the 6-cost body to land before a turn of removal attacks.",
  ],
  commonVariants: [
    "This is a regional-final list that runs four of most cards, one Prince Grus, one PRB02-001 Koby and one Meteor Fist.",
  ],
  commonCombos: [
    "Doll's −6000 on a Character, then Hibari: Hibari's [On Play] lets her attack the active target the turn she lands, and her [Activate: Main] trims another 1000.",
    "OP11-092 Helmeppo pulls EB04-044 Koby back from the trash, it attacks a Character the same turn, and at the end of it goes under the deck unless you trash a card from hand to keep it.",
    "EB04-047 Helmeppo trashes itself to play a Hibari from the trash, so a Helmeppo on the field is a second Hibari attack for no DON!!.",
  ],
  keyCardNumbers: [
    "OP11-001",
    "EB03-008",
    "OP11-082",
    "OP11-008",
    "OP13-020",
    "EB04-047",
    "OP11-092",
    "EB03-041",
    "OP11-004",
    "OP11-099",
    "EB04-003",
    "EB04-044",
  ],
  counterplay: [
    "Every Character they play can attack one of yours the turn it lands, so a Character you leave rested is a Character they get to remove. Keep your key bodies active where you can.",
    "Their Leader saves a small {Navy} body from removal once a turn by moving 3 trash cards to the bottom of the deck. Spend your first removal on a body above 7000 base power, or remove two in a turn.",
    "EB04-044 Koby survives removal and a lost battle for a card from hand, once a turn: answer it twice in one turn, or when their hand is thin.",
  ],
  sources: [
    {
      url: "https://onepiecetopdecks.com/deck-list/japan-op17-deck-list-the-worlds-strongest-warriors/",
      retrievedAt: "2026-10-09",
      note: "The fifty from the Koby list that took 2nd at the Indonesia Regional Final (OP-16 format): four-ofs of Hibari, Doll, both Helmeppos, both Kujyakus, Aramaki and the two Navy Events, with one Prince Grus, one PRB02-001 Koby and one Meteor Fist.",
    },
  ],
};

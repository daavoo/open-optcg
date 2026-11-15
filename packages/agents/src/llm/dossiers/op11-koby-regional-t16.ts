import type { DeckStrategyDossier } from "./types.js";

export const op11KobyRegionalT16Dossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Red/Black) Koby - Top 16 Wolverhampton Regional 2026-07-19",
  archetype:
    "Red/Black {Navy} {SWORD} tempo behind OP11-001: every body you play attacks an opposing Character the turn it lands, after a power cut shrinks the target, and four PRB02-001 Koby K.O. a small Character every time they attack. The trash fuels both your recursion and your Leader's protection.",
  gamePlan: [
    "Your Leader lets your {SWORD} Characters attack Characters on the turn they are played. Treat every {SWORD} play as a removal attack: shrink a Character, then swing the new body into it.",
    "Only rested Characters can normally be attacked. EB03-008 Hibari (on play and when attacking), OP11-082 Aramaki (trash it from the field), EB04-050 I'll Whip You Into Shape. ♡ (its [Main]) and OP11-119 Koby (on play) let one of your bodies attack an active Character as well, so use them before the attack that needs it.",
    "The power cuts set those attacks up: OP11-008 Doll gives −6000 for a card from hand, OP13-007 Ace & Sabo & Luffy −3000 for a DON!! and itself, and Hibari's [Activate: Main] −1000 once a turn.",
    "PRB02-001 Koby is the 4-cost core of this list: when it attacks it K.O.s a Character of 3000 base power or less, then draws if you hold 6 or fewer cards. It is a {SWORD} body, so it attacks the turn it lands, and with four copies it is the play most turns from 4 DON!! on.",
    "Your Leader also, once a turn, saves a {Navy} Character of 7000 base power or less from your opponent's removal by placing 3 cards from your trash at the bottom of your deck. Keep 3 cards in the trash on your opponent's turn so the save is there.",
    "The trash is fuel. EB04-047 Helmeppo trashes itself to play a 3-cost-or-less {SWORD} from hand or trash. OP11-092 Helmeppo draws 1 and plays an 8-cost-or-less {SWORD} back from the trash for the turn -- EB04-044 Koby, OP11-119 Koby or PRB02-001 Koby -- and that body goes to the bottom of your deck at the end of it.",
    "OP11-004 Kujyaku and OP11-099 look for {Navy} cards; OP11-099 trashes what it does not take, which feeds the trash. EB03-041 Kujyaku draws 2 for a {Navy} card from hand and gives your 6-cost-or-less {SWORD} Characters +2000 on your opponent's turn.",
  ],
  mulligan: [
    "Keep a hand with EB03-008 Hibari, EB04-047 Helmeppo or PRB02-001 Koby: each is an early {SWORD} body that attacks a Character the turn it lands.",
    "OP11-004 Kujyaku and OP11-099 also keep a hand, because they find one of those bodies.",
    "A hand of 1-cost support pieces and 6- or 8-cost bodies has nothing to send at a Character for several turns. Take a new hand.",
  ],
  priorities: [
    "Before you attack a Character, shrink it first: it is the cut that lets a 5000 body win the battle, not the attack itself.",
    "If the Character you want to hit is active, play Hibari, use Aramaki or cast EB04-050 first; otherwise the new body can only reach rested targets.",
    "Attack with PRB02-001 Koby before your other attackers: its K.O. can clear a small [Blocker] out of the way of the attacks after it.",
    "EB04-050 is a 1-cost Event with two uses: on your turn it opens an active Character to attack, on theirs it is a +3000 Counter for your Leader. Spend it on the turn it gets the bigger result.",
    "OP11-096 Ripper is a [Blocker] only while you have another black {Navy} Character, so play it beside Aramaki, a Helmeppo, EB03-041 Kujyaku, EB04-044 Koby or EB04-046 Doll, not alone.",
    "EB04-046 Doll is a 2-cost [Blocker] that raises the cost of all your {Navy} Characters by 2 on your opponent's turn, which takes them out of reach of removal that names a maximum cost.",
    "OP11-119 Koby's [When Attacking] moves 2 trash cards to the bottom of the deck to give a card +1000 until the end of your opponent's next turn. It spends the same trash your Leader's save needs, so leave 3 behind before you pay it.",
    "OP11-097 is a 1000 Counter for 1 DON!!; once your trash holds 10 cards it also returns a black 3-cost-or-less Character, such as EB04-047 Helmeppo, to your hand.",
    "EB04-003 Smoker & Tashigi has [Rush] and sets your Leader at 7000 on your opponent's turn. Land it when the Leader is being attacked every turn.",
    "EB04-044 Koby trashes a card from hand to survive removal and draws when your opponent's Character is K.O.'d on your turn, so land it before a turn of removal attacks.",
  ],
  commonVariants: [
    "The Indonesia Regional Final list runs one PRB02-001 Koby, two Ace & Sabo & Luffy, four each of EB03-041 Kujyaku, Aramaki and OP11-097, one OP11-013 Prince Grus and one OP13-020 Meteor Fist. This list plays four PRB02-001 Koby and three Ace & Sabo & Luffy, cuts Prince Grus and Meteor Fist, trims Kujyaku, Aramaki and OP11-097, and adds one each of EB04-046 Doll, EB04-050 and OP11-119 Koby.",
  ],
  commonCombos: [
    "Doll's −6000 on a Character, then Hibari: Hibari's [On Play] lets her attack the active target the turn she lands, and her [Activate: Main] trims another 1000.",
    "OP11-092 Helmeppo pulls OP11-119 Koby back from the trash for 6 DON!!: Koby's [On Play] opens an active Character, and both bodies attack that turn.",
    "EB04-047 Helmeppo trashes itself to play a Hibari from the trash, so a Helmeppo on the field is a second Hibari attack for no DON!!.",
    "PRB02-001 Koby's K.O. reads base power, so a power cut does not widen it: aim the K.O. at a printed 3000 or less, and spend Doll or Ace & Sabo & Luffy on the bigger Character the next body attacks.",
  ],
  keyCardNumbers: [
    "OP11-001",
    "PRB02-001",
    "EB03-008",
    "OP11-008",
    "EB04-047",
    "OP11-092",
    "EB03-041",
    "OP11-004",
    "OP11-099",
    "EB04-044",
    "OP11-119",
    "EB04-050",
  ],
  counterplay: [
    "Every Character they play can attack one of yours the turn it lands, so a Character you leave rested is a Character they get to remove. Keep your key bodies active where you can.",
    "PRB02-001 Koby K.O.s a Character of 3000 base power or less whenever it attacks: commit bodies above that line, or remove Koby before it swings again.",
    "Their Leader saves a small {Navy} body from removal once a turn by moving 3 trash cards to the bottom of the deck. Spend your first removal on a body above 7000 base power, or remove two in a turn.",
    "EB04-044 Koby survives removal for a card from hand, once a turn: answer it twice in one turn, or when their hand is thin.",
  ],
  sources: [
    {
      url: "https://onepiecetopdecks.com/deck-list/english-op16-deck-list-the-time-of-battle/",
      retrievedAt: "2026-11-15",
      note: 'The deck\'s own 50: entry "Koby", the list pilot "Madlove" took to Top 16 at the Wolverhampton Regional (UK) on 19 Jul 2026, with four PRB02-001 Koby and one each of EB04-046 Doll, EB04-050 and OP11-119 Koby.',
    },
  ],
};

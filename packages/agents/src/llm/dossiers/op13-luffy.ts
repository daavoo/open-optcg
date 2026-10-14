import type { DeckStrategyDossier } from "./types.js";

export const op13LuffyDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Red/Green) Monkey.D.Luffy - Open OPTCG",
  archetype:
    "Red/Green Straw Hat midrange behind OP13-001: Characters that set spent DON!! active again, so the Leader can rest them on the opponent's turn for +2000 apiece; green rest effects and Electrical Luna to keep the opponent's board down, red [Double Attack] and [Rush] to close.",
  gamePlan: [
    "Turns 1-3: a 1-cost search every turn you can -- OP01-016 or EB02-017 Nami, EB04-002 Jewelry Bonney, ST31-005 Thousand Sunny. Each finds a {Straw Hat Crew} card, and every Character in the deck is one. Take the card your next turn's curve casts.",
    "Turns 4-5: OP14-031 Nami rests up to two opposing Characters of cost 8 or less and sets up to five DON!! active at the end of your turn; OP14-022 Usopp sets two active at the end of your turn; OP13-027 Sanji sets two active when played and one more at the end of your turn. These are how the deck ends its own turn with DON!! still active.",
    "The Leader is the defence. While it has a DON!! given to it, whenever the opponent attacks and you have 5 or fewer active DON!!, you may rest any number of them: the Leader or the {Straw Hat Crew} Character under attack gains +2000 for each one during that battle. DON!! left active at the end of your turn are that defence.",
    "OP13-118 Monkey.D.Luffy is the pressure turn: [Double Attack], and on play it sets four DON!! active -- but you cannot play a Character of base cost 5 or more for the rest of that turn, so play it after them or on a turn that plays nothing big.",
    "Keep their board down: OP14-031 Nami and OP15-032 Brook rest opposing Characters, and OP08-036 Electrical Luna then stops every rested Character of cost 7 or less from standing up in their next Refresh Phase. A Character rested on your turn and locked by Luna cannot attack or block on theirs.",
    "Close with EB04-007 Roronoa Zoro (+2000 on your Leader through the opponent's next turn, and [Rush: Character] against an 8000 body), ST31-004 Monkey.D.Luffy ([Rush] once three DON!! are given across your field), and ST21-003 Sanji, whose [On Play] stops the opponent from using [Blocker] against one of your 6000-power Straw Hats this turn.",
  ],
  mulligan: [
    "Keep a hand with a 1-cost search (OP01-016, EB02-017, EB04-002, ST31-005) or a 4-cost refresher (OP14-022 Usopp, OP14-031 Nami). A two-colour deck needs its curve found, and those are the cards that find it or start it.",
    "A hand whose cheap cards are only Events -- OP04-016, OP05-038 and OP13-040 are [Counter] cards, and OP08-036 Electrical Luna needs a rested board to lock -- has nothing to do on the first turns. Take a new hand.",
  ],
  priorities: [
    "Rest exactly the DON!! that win the battle and no more. The attacker wins ties, so against a Leader at 5000 a 7000 attacker needs two DON!!, not one. A DON!! rested into a battle that is lost anyway is gone for the rest of the opponent's turn, and the turn usually has another attack in it.",
    "Do not rest DON!! into an attack that already fails.",
    "Keep two DON!! for OP05-038 Charlestone when you hold it: +4000 from hand, and trashing a card sets three DON!! active again -- which then pays the Leader's clause on the next attack.",
    "The clause only opens with a DON!! given to the Leader. On your own turn, give the Leader one before the turn ends if nothing else needs it; a Leader with none cannot defend.",
    "Cast OP08-036 Electrical Luna after the rests, not before: it only holds down Characters that are already rested, so rest them with OP14-031 Nami, OP15-032 Brook or your attacks first.",
    "OP13-040 is two cards in one: in your Main Phase, rest two DON!! to keep up to two rested opposing Characters down through their next Refresh; on defence, +3000 on your Leader for the battle. Hold it as the Counter unless the lock wins the game.",
    "Play ST21-003 Sanji the turn a 6000-or-more Straw Hat attacks through a Blocker; on any other turn it is a 3000 body.",
  ],
  commonVariants: [
    "This is a Regional-winning build. Other tournament lists behind this Leader keep the same engine (OP14-031, OP14-022, OP13-027, OP13-118, EB04-007) and differ in the flex slots: some run OP13-040 or OP13-037 Zoro in place of Electrical Luna, OP13-016 Monkey.D.Garp as a further search, or OP15-035 Laboon against removal.",
  ],
  commonCombos: [
    "OP14-031 Nami at the end of your turn sets up to five DON!! active: exactly the ceiling the Leader's clause allows, so the opponent's whole turn is defended.",
    "OP13-118 Luffy's four refreshed DON!! pay for a cheap search or a pump the same turn, then its [Double Attack] swings.",
    "OP05-038 Charlestone on defence: +4000, then three DON!! active again for the Leader's clause on the next attack.",
  ],
  keyCardNumbers: [
    "OP13-001",
    "OP14-031",
    "OP13-027",
    "OP14-022",
    "OP13-118",
    "EB04-007",
    "OP08-036",
    "ST21-003",
  ],
  counterplay: [
    "Make it spend DON!! early in your turn: every DON!! it rests on your first attack is one it cannot rest on your last, and the clause stops at five.",
    "Keep your Characters active where you can: Electrical Luna only holds down Characters that are already rested, so a board you did not rest is a board it cannot lock.",
    "Remove the DON!! given to its Leader, or attack when it has more than five DON!! active: the clause does not open.",
  ],
  sources: [
    {
      url: "https://onepiecetopdecks.com/deck-list/english-op16-deck-list-the-time-of-battle/",
      retrievedAt: "2026-10-12",
      note: "The Malmo Regional winning list (1st, 13-1, 22 Aug 2026) this deck ships, and the other OP13-001 lists of the period the flex-slot note is read from.",
    },
    {
      url: "https://onepiece.cardsrealm.com/en-us/articles/one-piece-tcg-deck-tech-red-green-monkey-d-luffy-op15",
      retrievedAt: "2026-09-26",
      note: "OP-15 deck tech for the archetype: the searcher-first mulligan, the DON!!-refresh engine (OP14-031, OP13-027, OP14-022, OP13-118) and the Leader's defensive role.",
    },
    {
      url: "https://onepiece.limitlesstcg.com/decks/92",
      retrievedAt: "2026-09-26",
      note: "Limitless archetype page for OP13-001: the cards every recorded list runs four of, and the flex slots (OP13-016 Garp, OP06-118 Zoro).",
    },
  ],
};

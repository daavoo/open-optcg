import type { DeckStrategyDossier } from "./types.js";

export const op11JinbeDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Green) Jinbe - Official Feature Deck",
  archetype:
    "Green {Fish-Man} midrange behind OP11-021: a Leader whose [End of Your Turn] sets one of your {Fish-Man} or {Merfolk} Characters and one DON!! active while you hold 6 or fewer cards, so you block and pay on your opponent's turn, in a fifty that rests the opposing board and attacks rested Characters.",
  gamePlan: [
    "Early, use OP11-030 Shirahoshi to dig: its [Activate: Main] rests 1 DON!! and itself to look at 5 for a {Neptunian} or {Fish-Man Island} card. Shirahoshi is a {Merfolk}, so the Leader stands it up again at the end of your turn. OP06-025 Camie looks at 4 for a {Fish-Man} or {Merfolk}.",
    "End each turn with 6 or fewer cards in hand, or the Leader does nothing. The DON!! it sets active is what pays for a 1-cost Counter Event on your opponent's turn.",
    "Mid game, play the 6-cost {Fish-Man} bodies. OP11-031 Jinbe's [On Play] rests an opposing Character of cost 5 or less, and its [Activate: Main] lets a {Fish-Man} or {Merfolk} played this turn attack Characters. OP11-035 Fisher Tiger's [On Play] rests any one opposing Character.",
    "OP11-024 Aladine and OP11-035 Fisher Tiger replace themselves when your opponent's effect K.O.s them: rest 1 DON!! (Aladine also trashes a card from hand) to play a {Fish-Man} or {Merfolk} from hand, up to cost 6 for Aladine and cost 4 for Fisher Tiger. Keep a DON!! active on your opponent's turn for this, and keep a body in hand to play.",
    "OP10-032 Tashigi rests itself instead of another of your green Characters leaving the field to your opponent's effect. It cannot pay while rested, so do not attack with it when you expect removal.",
    "Late game, OP06-035 Hody Jones has [Rush] and rests up to 2 opposing Characters or DON!!, and OP11-038 Gum-Gum Elephant Gatling rests a Character of cost 5 or less: rest the opposing Blockers, then attack for the win. Hody also moves your top Life card to your hand.",
  ],
  mulligan: [
    "Keep a hand with OP11-030 Shirahoshi or OP06-025 Camie: a 1-cost that digs for the rest of the deck.",
    "Vagabond Drill and Gum-Gum Elephant Gatling are cheap but are Counter Events, not openers.",
  ],
  priorities: [
    "Resting an opposing Character makes it a legal attack target for your 7000 and 8000 bodies. Rest the Character you want to attack, then attack it.",
    "OP11-039 Vagabond Drill's [Counter] gives a {Fish-Man} or {Merfolk} Leader or Character +3000 and rests an opposing Character of cost 3 or less, so it can also stop a small attacker's next swing.",
    "OP11-038 Gum-Gum Elephant Gatling is +3000 for the Leader only in the Counter step, or a rest for 1 DON!! on top of its cost in your main phase. Hold it for defence unless a Blocker stands between you and lethal.",
    "OP10-030 Smoker's [Activate: Main] sets 1 DON!! active, then forbids Character effects from setting DON!! active for the rest of the turn. Use it after Shirahoshi has dug, not before. Its [Banish] trashes the Life card it hits without the [Trigger].",
    "OP11-032 Surume and OP11-033 Bird Neptunian have no text. Bird Neptunian is a 7000 with a 2000 Counter, so it can be a Counter card in hand. Neither is a {Fish-Man} or {Merfolk}, so the Leader cannot stand them up.",
    "Do not lose your attackers playing defence: a 6-cost body is worth more on the board than a Life card.",
  ],
  commonVariants: [
    "This is Bandai's own recommended list for the Leader, built around protecting {Fish-Man} and {Merfolk} Characters with the Leader and Counter Events before pushing for the win.",
  ],
  commonCombos: [
    "Shirahoshi digs, the Leader sets it active at the end of the turn, and it digs again next turn.",
    "Fisher Tiger's [On Play] rests an opposing Character, then OP11-031 Jinbe's [Activate: Main] lets Fisher Tiger attack it the turn it is played.",
    "Hody Jones rests two opposing Blockers and attacks with [Rush] the same turn.",
  ],
  keyCardNumbers: [
    "OP11-021",
    "OP11-030",
    "OP06-025",
    "OP11-031",
    "OP11-035",
    "OP11-024",
    "OP06-035",
    "OP11-039",
  ],
  counterplay: [
    "Aladine and Fisher Tiger replace themselves only when your effect K.O.s them, and only with an active DON!!. K.O. them in battle instead.",
    "Make it hold more than 6 cards at the end of its turn and the Leader does nothing.",
    "Its rests last only until its next turn's refresh. Keep a Blocker back rather than relying on one standing body.",
  ],
  sources: [
    {
      url: "https://en.onepiece-cardgame.com/feature/deck/deck_066.php",
      retrievedAt: "2026-10-12",
      note: "Bandai's feature deck for OP11-021: the fifty, Shirahoshi early with the Leader standing it up at 6 or fewer cards, the active DON!! paying for 1-cost Counter Events, OP11-031 Jinbe letting new Characters attack Characters, Aladine and Fisher Tiger replacing themselves for a rested DON!!, and Hody Jones and Gum-Gum Elephant Gatling resting Blockers to finish.",
    },
  ],
};

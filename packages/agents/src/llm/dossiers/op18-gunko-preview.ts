import type { DeckStrategyDossier } from "./types.js";

export const op18GunkoPreviewDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Purple/Black) Saint Gunko - heartpiratestcg OP-18 Pre-release",
  archetype:
    "Purple/Black OP18-060 Saint Gunko as a {Holy Knights of God} trash-recursion deck: fill the trash early, then play Characters back out of it with OP18-084 Gunko, I'll Make the Call, Saint Shamrock and the 10-cost Gunko, and replay the Knights that are K.O.'d. The Leader draws 2 and trashes 1 the first time each turn one of your Characters comes back from the trash, and once you have a big body on the board it turns a card from hand into an active DON!!.",
  gamePlan: [
    "The Leader's draw is not optional and not limited to your turn: the first time in a turn any of your Characters is played from your trash -- by your own effect, or by an [On K.O.] replay during their turn -- you draw 2 and trash 1. Plan one trash-play per turn as the engine of card flow, and use the trash 1 to put the next target there.",
    "The Leader's [Activate: Main] trashes a card from hand for one active DON!! from your DON!! deck, but only while you have a Character with 8000 power or more: OP18-119 Saint Shamrock (9000) or OP18-065 Gunko (11000). It is how you get back the DON!! the DON!! −1 costs of OP18-064 Killingham and OP18-065 Gunko return, and it puts one more card in the trash.",
    "Early turns build the trash. OP18-084 Gunko (1 cost) looks at 4, keeps a {Holy Knights of God} card and trashes the other three; Abyss Pentagram draws 1 and mills 2; I'm Late, I'm Very Late!! digs 5 for Sleeptids or a Knight. Sleeptids, Killingham, Saint Sommers and Shamrock in the trash are all things you want to play from there later.",
    "Sleeptids costs 9, so it is almost never cast from hand: it is a 2000 Counter in hand and a [Blocker] you play for free from the trash with OP18-083 Killingham's [Your Turn] [On Play]. Discard it to the Leader's draw-2 and to OP18-084's mill without regret.",
    "The ways to play from the trash: OP18-084 Gunko's [Activate: Main] rests 4 DON!! for a Knight costing 6 or less; I'll Make the Call's [Main] rests 3 DON!! for the same; OP18-119 Shamrock, on the turn it is played, takes one Knight costing 6 or less for free; OP18-065 Gunko's [On Play] pays DON!! −1 for a {Celestial Dragons} Character with 6000 power or less; OP18-083 Killingham brings back a Sleeptids. The usual target is Saint Sommers, whose [Your Turn] [On Play] K.O.s a base cost 4 or less if you have 6 or more DON!! on your field.",
    "Abyss Pentagram makes your {Holy Knights of God} Characters of cost 2 or more cost 1 less from hand: Killingham 4, Sommers 5, Shamrock 7, the big Gunko 9. Land it on turn 1 or 2.",
    "Your Knights come back when K.O.'d: Sommers and OP18-083 Killingham for 2 cards from hand, Shamrock for 1, OP18-064 Killingham for DON!! −1. Each of those replays also wakes the Leader's draw-2 if it has not fired that turn. Their [Your Turn] [On Play] clauses do not fire when they return during the opponent's turn.",
  ],
  mulligan: [
    "Keep OP18-084 Gunko, I'm Late, I'm Very Late!! or Abyss Pentagram: the 1-costs that fill the trash and find the Knights.",
    "Keep a 5-cost Killingham for the mid game: OP18-083 to start the trash-play chain with a Sleeptids, OP18-064 to stop two of their attackers.",
    "A hand of Sleeptids and 8- and 10-costs with no 1-cost takes a new hand.",
  ],
  priorities: [
    "Spend the Leader's draw-2 every turn: make the first trash-play of your turn early in your Main Phase so the 2 new cards can still be played.",
    "Fire the Leader's [Activate: Main] as soon as Shamrock or the big Gunko is on the board, before spending DON!!: the DON!! it adds is active.",
    "OP18-119 Shamrock's free play from the trash only works on the turn it arrived: play it, then take Sommers (for the K.O.) or a Killingham at once.",
    "OP18-085 Cerberus returns itself to hand to give a Saint Shamrock [Rush], [Banish] or [Unblockable] for the turn; it costs 1, so replay it afterwards. [Rush] lets the Shamrock you just played attack at once.",
    "OP18-064 Killingham's [Your Turn] [On Play] pays DON!! −1 to stop one Character of 7000 base power or less and one of 5000 or less from attacking through their next turn. Point it at their two best attackers when you need a quiet turn.",
    "OP18-065 Gunko is a 10-cost (9 with Pentagram) 11000 [Blocker] that also replays a Sommers or Killingham from the trash: it is the late-game wall and turns on the Leader's DON!! activation.",
    "OP17-095 Zoro is a 2-cost 2000 Counter body whose real job is protection: when an opponent's effect would remove one of your Characters, you may put 3 cards from your trash at the bottom of your deck instead. Each use costs trash, which your recursion and I'll Make the Call's Counter want, so spend it on a Shamrock or the big Gunko, not on a 1-cost.",
    "I'll Make the Call's [Counter] gives +4000 once you have 10 or more cards in your trash; count the trash before relying on it. Mamaragan's [Counter] is +1000 and draws when you have 6 or fewer DON!! on your field, and its [Main] pays DON!! −2 to draw and rest a 5000-power-or-less Character.",
  ],
  commonVariants: [
    "This build is almost all OP-18: it adds only Mamaragan and four OP17-095 Zoro to the {Holy Knights of God} core.",
    "SilverOPTCG's build drops Zoro and Mamaragan for six Sleeptids and older {Celestial Dragons} support: St. Topman Warcury, St. Marcus Mars, The Five Elders Are at Your Service!!! and Ground Death.",
    "Card Kaizoku's build keeps Zoro but drops Mamaragan and I'm Late, I'm Very Late!! for four The Five Elders Are at Your Service!!!, a fourth big Gunko, and one each of Warcury and Marcus Mars.",
    "A machine-built list takes the Leader in another direction entirely: an OP-17 {Elbaph} giant shell -- Jaguar.D.Saul, Loki, Monkey.D.Luffy, Nico Robin, Zoro -- with the [Blocker]s Sanji, Doflamingo and Sabo, St. Shepherd Ju Peter, and only Saint Sommers and I'm Late, I'm Very Late!! from OP-18.",
  ],
  commonCombos: [
    "OP18-083 Killingham plays a Sleeptids from the trash: a free [Blocker] and the Leader's draw 2, trash 1.",
    "Shamrock lands, takes Sommers out of the trash for free, Sommers K.O.s a cost 4 or less, and the Leader draws 2; with Shamrock on board the Leader's activation adds an active DON!!.",
    "Cerberus gives the Shamrock you just played [Rush] and goes back to hand to be replayed for 1.",
    "I'll Make the Call or OP18-084's activation plays Sommers from the trash at 6 DON!! or more for a second K.O. in the same turn.",
  ],
  keyCardNumbers: [
    "OP18-060",
    "OP18-119",
    "OP18-084",
    "OP18-083",
    "OP18-088",
    "OP18-096",
    "OP18-097",
    "OP18-065",
    "OP18-085",
  ],
  counterplay: [
    "Their Knights return when K.O.'d, mostly for cards from hand: K.O.ing them drains their hand, but it also feeds the Leader's draw-2 once per turn. Removal that sends a Character anywhere but the trash skips both.",
    "OP17-095 Zoro turns your removal into 3 cards off the bottom of their trash: make them pay it, it shrinks the trash their Counter Event and recursion need.",
    "Keep Characters out of Sommers' range (base cost 4 or less) once they reach 6 DON!!, and kill Shamrock before its next turn: without an 8000-power body the Leader does not ramp.",
  ],
  sources: [
    {
      url: "https://www.youtube.com/watch?v=5w_Q8Yixgdg",
      retrievedAt: "2026-11-15",
      note: "The deck's own 50, from the description of heartpiratestcg's pre-release video \"Is OP18 Gunko the best deck in the game?\" (2026-11-08). No event: OP-18 is not tournament legal until 2026-11-27.",
    },
    {
      url: "https://www.youtube.com/watch?v=mbWVux68Ykg",
      retrievedAt: "2026-11-15",
      note: "SilverOPTCG's pre-release Saint Gunko build (2026-11-13), the source of a variants line.",
    },
    {
      url: "https://www.cardkaizoku.com/deckbuilder?deck=1xOP18-060%7C1xOP13-089%7C1xOP13-091%7C4xOP13-096%7C4xOP17-095%7C4xOP18-064%7C4xOP18-065%7C4xOP18-083%7C4xOP18-084%7C4xOP18-085%7C4xOP18-088%7C4xOP18-093%7C4xOP18-096%7C4xOP18-097%7C4xOP18-119&rotation=1&game=onepiece",
      retrievedAt: "2026-11-15",
      note: "Card Kaizoku's pre-release Saint Gunko build (2026-11-11), the source of a variants line.",
    },
  ],
};

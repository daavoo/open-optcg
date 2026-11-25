import type { DeckStrategyDossier } from "./types.js";

export const op17LuffyOpenDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Black) Monkey.D.Luffy - Open OPTCG 2026-11-23",
  archetype:
    "OP-17 Black Elbaph giants midrange with EB-05's giant: the four-of core of cheap enablers and 2-drops, a Thousand Sunny package that turns Pirates Docking Six into one more giant, and four EB05-047 Ripley -- a 4-cost that is a giant with no condition and replays a 2-drop from the trash -- with EB05-046 Yamato and OP17-098 Gum-Gum Kong Gun in the flex slots.",
  gamePlan: [
    "Land any giant. OP17-094 Rodo (cost 1), OP17-081 Gerd (cost 2), OP17-089 Jaguar.D.Saul (cost 4), EB05-047 Ripley (cost 4) and OP17-119 Loki (cost 6) all sit at cost 12 or more on the board, which satisfies 'if there is a Character with a cost of 12 or more' for the whole team at once.",
    "That condition turns OP17-080 Usopp, OP17-082 Sanji, OP17-087 Nico Robin and OP17-095 Roronoa Zoro into 5000-power bodies, gives OP17-093 Monkey.D.Luffy [Rush], and switches on Robin's −3000, OP17-084 Chopper's [Unblockable] and OP17-098's K.O.s.",
    "The Leader grants [Blocker] to every Character at cost 12 or more, so the giants that switch the curve on are also the wall.",
    "EB05-047 Ripley's [On Play] trashes a card from hand to play a Character of cost 2 or less from your trash: a giant and a 2-drop for four DON!!. OP17-093 Luffy and OP15-088 Pirates Docking Six replay a 2-drop from the trash the same way.",
    "ST14-017 Thousand Sunny gives every black {Straw Hat Crew} Character +1 cost. OP15-088 Pirates Docking Six prints +6 and sits at 11; with the Stage out it is a 12, so it becomes a giant and a Blocker too. The Leader is {Straw Hat Crew}, so the Stage also draws a card when played.",
    "OP17-098 Gum-Gum Kong Gun rests 6 DON!! to K.O. up to two opposing Characters of cost 6 or less while a giant is out: the late-game board wipe. Early, it is a +3000 [Counter] for the Leader.",
  ],
  mulligan: [
    "Keep at least one cheap enabler -- Rodo, Gerd, Saul or Ripley -- because the 2-drops are 2000-power bodies until a giant arrives.",
    "Failing that, keep OP17-086 Nami or Usopp to find one; both only find {Elbaph} cards, which every giant is.",
    "Thousand Sunny and Docking Six are not a keep on their own: the Stage enables one card, and Docking Six is an 11 without it.",
  ],
  priorities: [
    "Play the giant before the 2-drops in a turn. The same Usopp or Sanji is 2000 or 5000 power depending only on whether a giant is already out.",
    "Ripley's replay needs a 2-drop already in the trash: play it after Sanji's discard, Usopp's or Saul's dig, or a Docking Six mill has put one there.",
    "Pay trash costs -- Sanji's, Nami's, Gerd's, Ripley's, Yamato's -- with a 1000-Counter Straw Hat the trash replays first, and keep the giants.",
    "Play Thousand Sunny before Docking Six when both are affordable, so Docking Six lands as a giant and a Blocker rather than an 11.",
    "The enabling clause reads 'there is', not 'you have' -- an opposing cost-12 Character switches your team on as well. Do not remove one without checking what it is enabling for you.",
    "Defend the giants before anything else on the board. Removing the only giant drops every 2-drop back to 2000 and leaves the Leader's [Blocker] aura reaching nothing. OP17-095 Zoro puts 3 cards from your trash on the bottom of your deck instead of losing a Character to the opponent's effect.",
    "EB05-046 Yamato is a [Blocker] at 8000 while the opponent has a Character of 8000 base power or more. On the opponent's attack it can trash a card from hand to make your Leader's base power 7000 for the turn once your trash holds 10 cards.",
    "Gerd's [On Play] returns a Character of cost 8 or less from the trash: prefer a giant, or OP17-093 Luffy.",
  ],
  commonVariants: [
    "The maintainer's earlier Open OPTCG build for this Leader (26 Sep 2026) runs four Docking Six, three Thousand Sunny, OP15-092 Monkey.D.Luffy and OP17-096 I'm Luffy!! where this list runs four Ripley, one Yamato and one Kong Gun.",
    "The feature deck under this Leader runs four OP17-085 Dorry and four OP17-092 Brogy instead of the Docking Six and Sunny package, two OP17-091 Brook and two OP17-096.",
  ],
  commonCombos: [
    "Thousand Sunny then Docking Six: a 12-cost Blocker for five DON!!, which also mills three and brings back a 2-drop.",
    "Ripley trashes a card and replays a Sanji from the trash: a giant and a 5000 Sanji that draws 2 and trashes 2, for four DON!!.",
    "OP17-119 Loki lands as a cost-18 Blocker that K.O.s the opponent's cheap board on the way in.",
    "OP17-093 Monkey.D.Luffy gains [Rush] while a giant is out and its [On Play] draws a card and plays a cost-2-or-less Character from the trash.",
  ],
  keyCardNumbers: [
    "OP17-079",
    "EB05-047",
    "OP17-089",
    "OP17-119",
    "OP15-088",
    "ST14-017",
    "OP17-093",
    "OP17-098",
  ],
  counterplay: [
    "Removal that reads a cost ceiling is close to dead here: the giants are cost 12 to 18 on the field. Answer them with power-based combat or with effects that ignore cost.",
    "Removing Thousand Sunny drops Docking Six back to 11, which takes its [Blocker] away and may take the team's enabling condition with it.",
    "Attack before a giant lands; the cheap enablers arrive from turn one or two, so the window is narrow.",
    "Late in the game Kong Gun K.O.s two Characters of cost 6 or less: do not commit a wide board of small bodies into six open DON!!.",
  ],
  sources: [
    {
      url: "https://onepiecetopdecks.com/deck-list/english-op17-deck-list-the-worlds-strongest-warriors/",
      retrievedAt: "2026-09-26",
      note: "Tournament Black Luffy lists for OP-17; the Thousand Sunny and Docking Six package comes from these placings. The deck's own 50 was supplied by the maintainer on 23 Nov 2026.",
    },
    {
      url: "https://en.onepiece-cardgame.com/feature/deck/deck_109.php",
      retrievedAt: "2026-09-16",
      note: "Bandai's featured list for the same Leader, which the variants line compares against.",
    },
  ],
};

import type { DeckStrategyDossier } from "./types.js";

export const op17LuffyTournamentDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Black) Monkey.D.Luffy - Open OPTCG",
  archetype:
    "OP-17 Black Elbaph giants midrange, the tournament build: the feature deck's giants-and-2-drops core with the Dorry/Brogy pair cut for a Thousand Sunny package that turns Pirates Docking Six into a fourth giant, and a self-milling trash that switches on OP15-092 Monkey.D.Luffy.",
  gamePlan: [
    "Land any giant. OP17-094 Rodo (cost 1), OP17-081 Gerd (cost 2), OP17-089 Jaguar.D.Saul (cost 4) and OP17-119 Loki (cost 6) all sit at cost 12 or more on the board, which satisfies 'if there is a Character with a cost of 12 or more' for the whole team at once.",
    "That condition turns OP17-080 Usopp and OP17-082 Sanji into 5000-power bodies, gives OP17-093 Monkey.D.Luffy [Rush], and switches on the conditional halves of OP17-084 Chopper and OP17-096.",
    "The Leader grants [Blocker] to every Character at cost 12 or more, so the giants that switch the curve on are also the wall.",
    "ST14-017 Thousand Sunny gives every black {Straw Hat Crew} Character +1 cost. OP15-088 Pirates Docking Six prints +6 and sits at 11; with the Stage out it is a 12, so it becomes a giant and a Blocker too. The Leader is {Straw Hat Crew}, so the Stage also draws a card when played.",
    "Fill the trash on purpose. Docking Six mills 3, Sanji discards 2, Usopp and Saul trash what they do not reveal. At 10 cards OP15-092 Monkey.D.Luffy becomes a 9000 at cost 17, at 20 your Leader defends at 7000 base power, and at 30 Luffy is a 10000.",
  ],
  mulligan: [
    "Keep at least one cheap enabler -- Rodo, Gerd or Saul -- because the 2-drops are 2000-power bodies until a giant arrives.",
    "Failing that, keep OP17-086 Nami or Usopp to find one; both only find {Elbaph} cards, which every giant is.",
    "Thousand Sunny and Docking Six are not a keep on their own: the Stage enables one card, and Docking Six is an 11 without it.",
  ],
  priorities: [
    "Play the giant before the 2-drops in a turn. The same Usopp or Sanji is 2000 or 5000 power depending only on whether a giant is already out.",
    "Play Thousand Sunny before Docking Six when both are affordable, so Docking Six lands as a giant and a Blocker rather than an 11.",
    "Pay Docking Six's mill. Three cards from the deck is progress towards OP15-092's thresholds, and its [On Play] then returns a cost-2-or-less {Straw Hat Crew} body from the trash.",
    "The enabling clause reads 'there is', not 'you have' -- an opposing cost-12 Character switches your team on as well. Do not remove one without checking what it is enabling for you.",
    "Defend the giants before anything else on the board. Removing the only giant drops every 2-drop back to 2000 and leaves the Leader's [Blocker] aura reaching nothing.",
    "OP17-096 is the one Event: a 4000 [Counter] while a giant is out. Hold it for the attack that would K.O. your last giant or take the last Life.",
    "Gerd's [On Play] returns a Character of cost 8 or less from the trash: prefer a giant, or OP15-092 once the trash is deep enough for it to be one.",
  ],
  commonVariants: [
    "The feature deck under this Leader runs four OP17-085 Dorry and four OP17-092 Brogy instead of the Docking Six and Sunny package, and two OP17-096.",
    "Other tournament builds under this Leader keep the same four-of core and vary the flex slots between OP17-091 Brook, OP17-098 Gum-Gum Kong Gun, OP17-096 and OP17-084.",
  ],
  commonCombos: [
    "Thousand Sunny then Docking Six: a 12-cost Blocker for five DON!!, which also mills three and brings back a 2-drop.",
    "One 4-cost Saul on an otherwise empty board makes every 2-drop a 5000-power body and makes Saul itself a Blocker through the Leader.",
    "OP17-119 Loki lands as a cost-18 Blocker that K.O.s the opponent's cheap board on the way in.",
    "OP17-093 Monkey.D.Luffy gains [Rush] while a giant is out and its [On Play] draws a card and plays a cost-2-or-less Character from the trash.",
  ],
  keyCardNumbers: [
    "OP17-079",
    "OP17-119",
    "OP17-089",
    "OP15-088",
    "ST14-017",
    "OP15-092",
  ],
  counterplay: [
    "Removal that reads a cost ceiling is close to dead here: the giants are cost 12 to 18 on the field. Answer them with power-based combat or with effects that ignore cost.",
    "Removing Thousand Sunny drops Docking Six back to 11, which takes its [Blocker] away and may take the team's enabling condition with it.",
    "Attack before a giant lands; the cheap enablers arrive from turn one or two, so the window is narrow.",
  ],
  sources: [
    {
      url: "https://onepiecetopdecks.com/deck-list/english-op17-deck-list-the-worlds-strongest-warriors/",
      retrievedAt: "2026-09-26",
      note: "Tournament Black Luffy lists for OP-17; the Thousand Sunny and Docking Six package and the flex-slot variants come from these placings. The deck's own 50 was supplied by the maintainer.",
    },
    {
      url: "https://en.onepiece-cardgame.com/feature/deck/deck_109.php",
      retrievedAt: "2026-09-16",
      note: "Bandai's featured list for the same Leader, which the variants line compares against.",
    },
  ],
};

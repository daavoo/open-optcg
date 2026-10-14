import type { DeckStrategyDossier } from "./types.js";

export const op17LuffyDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Black) Monkey.D.Luffy - Official Feature Deck",
  archetype: "OP-17 Black Elbaph giants midrange",
  gamePlan: [
    "Land any giant. Every one of them prints 'this Character gains +12 cost', so a printed 4-cost OP17-089 Jaguar.D.Saul sits on the board at 16 and satisfies 'if there is a Character with a cost of 12 or more' for the whole team at once.",
    "That single condition turns six different 2-drops from 2000 into 5000 power, gives OP17-093 Monkey.D.Luffy [Rush], and switches on the conditional halves of OP17-084, OP17-087 and OP17-091.",
    "The Leader grants [Blocker] to every Character at cost 12 or more, so the same giants that switch the curve on are also the wall. Develop giants early; they are cheap.",
    "OP17-119 Loki is the best of them: cost 6, +12 cost, +3000 power on the opponent's turn, and an [On Play] that K.O.s opposing Characters totalling 4 cost or less.",
  ],
  mulligan: [
    "Keep at least one cheap enabler -- OP17-094 Rodo at 1, OP17-081 Gerd at 2, OP17-089 Saul at 4 -- because nothing else in the hand works properly without one.",
    "Keep OP17-086 Nami or OP17-080 Usopp to find the missing half of the curve.",
  ],
  priorities: [
    "Check whether a giant is already on the field before playing a 2-drop: the same card is worth 2000 or 5000 depending only on that, so ordering within a turn matters more than usual.",
    "Note that the enabling clause reads 'there is', not 'you have' -- an *opposing* cost-12 Character switches your own team on as well. Do not remove one without checking what it is currently enabling for you.",
    "OP17-085 Dorry and OP17-092 Brogy fetch each other from hand or trash and then forbid further Character plays for the turn, so play them last in a turn, never first.",
    "OP17-094 Rodo and OP17-081 Gerd gate their +12 on an {Elbaph} Leader, which this deck has; they are unconditional enablers here but not in any other shell.",
    "The Leader's [Blocker] aura only reaches cost-12-or-more Characters, so the 2-drops are attackers and trade fodder, not defence. The only other defensive card in the list is the Event OP17-096, a [Counter] worth 4000.",
  ],
  commonVariants: [
    "The 2-drop mix is the flex band: Bandai's list runs OP17-087 Nico Robin and OP17-095 Roronoa Zoro at four and OP17-084 Tony Tony.Chopper, OP17-091 Brook and OP17-082 Sanji at two. The giants, OP17-119 Loki and OP17-093 Monkey.D.Luffy are the fixed core at four each.",
    "Lists built off the guides run OP17-083 Jinbe and the other Events in place of some of that band; Bandai's featured list runs neither.",
  ],
  commonCombos: [
    "One 4-cost Saul on an otherwise empty board immediately makes every 2-drop a 5000-power body and makes Saul itself a Blocker through the Leader.",
    "OP17-119 Loki lands as a cost-18 Blocker that also K.O.s the opponent's cheap board on the way in.",
    "OP17-093 Monkey.D.Luffy gains [Rush] while a giant is out and its [On Play] recurs a cost-2-or-less Character from the trash, replacing a body the deck already traded away.",
    "Dorry plays Brogy (or the reverse) for one card, putting two cost-17 Blockers down in a single turn.",
  ],
  keyCardNumbers: [
    "OP17-079",
    "OP17-119",
    "OP17-089",
    "OP17-093",
    "OP17-085",
    "OP17-092",
  ],
  counterplay: [
    "Removal that reads a cost ceiling is close to dead here: the giants are cost 12 to 18 on the field. Answer them with power-based combat or with effects that ignore cost.",
    "Removing the only giant collapses the whole board at once -- the 2-drops fall back to 2000 and the Leader's [Blocker] aura reaches nothing -- so target the enabler rather than the buffed bodies.",
    "Attack before a giant lands. The deck's cheap enablers arrive from turn one or two, so the window is narrow but it is the deck's only flat position.",
  ],
  sources: [
    {
      url: "https://en.onepiece-cardgame.com/feature/deck/deck_109.php",
      retrievedAt: "2026-09-16",
      note: "Bandai's featured deck list for OP17-079; the deck's 50 comes from this page.",
    },
    {
      url: "https://opdeckguide.com/deck-guides/monkey-d-luffy-op17/",
      retrievedAt: "2026-08-21",
      note: "Guide write-up for the same Leader; the game plan and the enabler ordering come from here, not the list.",
    },
    {
      url: "https://www.thornberrymedia.com/post/best-op-17-leaders",
      retrievedAt: "2026-08-21",
      note: "Independent pre-release ranking placing OP17-079 third of the six new Leaders and naming the Loki shell.",
    },
  ],
};

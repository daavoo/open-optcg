import type { DeckStrategyDossier } from "./types.js";

export const eb02LuffyTournamentDossier: DeckStrategyDossier = {
  version: 1,
  deckId:
    "(Green/Purple) Monkey.D.Luffy - 1st Place Store Championship 2026-04-25",
  archetype:
    "Green/Purple {Straw Hat Crew} rest-control behind EB02-010, as a Store Championship winner builds it: return DON!! through the Leader, Mamaragan and Gum-Gum Giant to stay under your opponent's DON!! count, rest and lock their board, and swing with a [Double Attack] OP13-118 Luffy.",
  gamePlan: [
    "Your Leader's [Activate: Main] returns 2 DON!! from your field to your DON!! deck, sets up to 2 of your DON!! active, and gives the Leader +1000 until the end of your opponent's next turn. Every Character in this list is {Straw Hat Crew}, so its condition always holds.",
    "EB02-035 Sanji & Pudding adds 1 active DON!! from your DON!! deck, once per your turn, when 2 or more of your DON!! are returned -- by the Leader, OP15-078 Mamaragan's [Main] or EB02-061 Luffy. Its [On Play] draws 1 while your DON!! count is at most your opponent's.",
    "Sitting 2 or more DON!! under your opponent makes OP07-064 Sanji a 3-cost 6000 [Blocker]. Returning DON!! is how you get there.",
    "Rest their board, then keep it rested: OP15-032 Brook rests a card, OP14-031 Nami rests two Characters costing 8 or less, ST18-001 Uso-Hachi rests a cost 5 or less at 8 DON!!, OP12-037 rests two Characters or DON!!. OP08-036 Electrical Luna and OP13-040 then stop rested Characters costing 7 or less from standing in their next Refresh Phase.",
    "OP13-118 Monkey.D.Luffy is the attacker: a 7000 [Double Attack] whose [On Play] sets up to 4 of your DON!! active under this multicolour Leader -- but you cannot play a Character with base cost 5 or more after it that turn.",
    "PRB02-005 Monkey.D.Luffy makes your opponent rest an active DON!! at the start of their next Main Phase while they have 7 or fewer. P-111 Nico Robin, once a turn, rests a DON!! instead of letting their effect remove one of your Straw Hats.",
  ],
  mulligan: [
    "Keep a hand with EB02-017 Nami, PRB02-012 Nami or ST18-004 Zoro-Juurou: each looks at 5 for a {Straw Hat Crew} card, and Zoro-Juurou for a purple one.",
    "Sanji & Pudding in the opening hand is the card to build around; keep it with any searcher.",
  ],
  priorities: [
    "Play Sanji & Pudding before activating the Leader in the same turn, so the refund applies.",
    "Spend DON!! on your plays before activating the Leader: it sets rested DON!! active, so it only adds DON!! after you have rested some.",
    "Rest their Characters first, then cast Electrical Luna or OP13-040's [Main]: they lock only Characters already rested.",
    "OP14-031 Nami sets up to 5 of your DON!! active at the end of your turn: you go into their turn with DON!! for OP09-078 Gum-Gum Giant (DON!! −2 and a card for +4000 and draw 2) and Mamaragan's [Counter].",
    "OP13-118 Luffy's restriction is on base cost 5 or more. Play Sanji & Pudding, Brook and the 6-costs before it, not after.",
    "OP12-037 and OP13-040 are also +3000 [Counter]s for your Leader; Mamaragan's is +1000 and draws a card at 6 DON!! or less.",
  ],
  commonVariants: [
    "Bandai's feature deck for this Leader is built on EB02-037 Franky, EB02-041 Merry Go, OP05-061 Uso-Hachi, OP05-070 Fra-Nosuke, ST18-005 Luffy-Tarou and four EB02-061 Luffy; this list cuts those for rest-lock Events, OP13-118 Luffy, Nami, Brook, Sanji and PRB02-012 Nami.",
  ],
  commonCombos: [
    "Brook or OP14-031 Nami rests their board, then Electrical Luna keeps it rested through their next turn.",
    "Sanji & Pudding, then the Leader's activation with two other DON!! rested: 2 come back active plus 1 more from the refund.",
    "The Leader's return drops you 2 DON!! under your opponent: OP07-064 Sanji lands for 3.",
  ],
  keyCardNumbers: [
    "EB02-010",
    "EB02-035",
    "OP13-118",
    "OP14-031",
    "OP08-036",
    "OP15-078",
    "OP07-064",
    "PRB02-012",
  ],
  counterplay: [
    "Sanji & Pudding is what makes their DON!! returns pay. K.O. it and every return costs them on the next turn.",
    "Their lock Events hold only rested Characters. Attack with what you can afford to leave rested, and keep a key Character active when you can.",
    "OP13-118 Luffy attacks twice. Keep a [Blocker] or Counter for its second hit.",
  ],
  sources: [
    {
      url: "https://onepiecetopdecks.com/deck-list/english-op15-eb04-deck-list-adventure-on-kamis-island/",
      retrievedAt: "2026-10-17",
      note: 'The deck\'s own 50: the list pilot "AndreDreReal" took to 1st, 5-0, at a Store Championship (USA) on 25 Apr 2026 (entry "GP Luffy").',
    },
    {
      url: "https://en.onepiece-cardgame.com/feature/deck/deck_062.php",
      retrievedAt: "2026-10-12",
      note: "Bandai's feature deck for EB02-010, the source of the variants line and of the Leader's DON!! return as this dossier describes it.",
    },
  ],
};

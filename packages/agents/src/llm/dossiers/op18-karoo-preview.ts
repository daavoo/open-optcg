import type { DeckStrategyDossier } from "./types.js";

export const op18KarooPreviewDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Red/Blue) Karoo - VersusTCG OP-18 Pre-release",
  archetype:
    "Red/Blue OP18-001 Karoo as a [Rush] aggro deck: the Leader gives every Character that is both {Animal} and {Alabasta} [Rush] and +1000 power, so most of the list attacks the turn it lands, and it draws a card the first time each turn one of your {Alabasta} Characters is K.O.'d. The Nefeltari Vivis find, cheat out and pump the bodies; Chaka and Pell turn spare cards into draws.",
  gamePlan: [
    "The Leader's aura reaches only Characters with BOTH types: EB02-001 Karoo, OP18-004 Karoo, OP18-003 Sea Cat, OP18-009 Super Spot-Billed Duck Troops, OP18-010 Tony Tony.Chopper, OP18-015 Eyelashes and OP18-043 Accelegator. Under it EB02-001 Karoo is an 8000 [Rush] for 5, Accelegator and Sea Cat are 7000 [Rush] for 4 and 5, and Chopper and the Duck Troops are 6000 [Rush] for 4. The Vivis, Chaka, Pell and Koby are not {Animal} and get nothing from it.",
    "OP18-008 Chaka and OP18-013 Pell have their own [Rush] behind an {Alabasta} Leader, which Karoo is. Each may trash a Character card with 5000 power or less from hand on play to draw 2; Chaka then gains [Banish] for the turn, and Pell trashes an opponent's Character with 3000 base power or less. Pell's removal is a trash, not a K.O., so their [On K.O.] does not answer it.",
    "OP18-011 Nefeltari Vivi gives every {Animal} {Alabasta} Character a further +1000 while she is on the board, and two of her stack. On the opponent's turn she is a 6000 [Blocker] herself, so she is the 2-cost that defends.",
    "OP18-004 Karoo grows with power: at 5000 it has [Rush], at 6000 [Banish], at 7000 [Unblockable]. The Leader alone takes it to 5000; one OP18-011 Vivi adds [Banish], two add [Unblockable].",
    "EB03-024 Nefeltari Vivi is a 5-cost [Blocker] whose [On Play] plays an {Alabasta} or {Straw Hat Crew} Character costing 5 or less from hand for free, and then no more Characters can be played that turn. Play the cheap bodies first and Vivi last; the free body still has [Rush] and attacks that turn, so EB02-001 Karoo, Sea Cat, Chaka or Pell off Vivi is ten cost of board for five DON!!.",
    "OP18-009 Super Spot-Billed Duck Troops attacks the turn it is played, then at 9 or more DON!! on the field trashes itself to play a [Karoo] from hand for free -- EB02-001 or OP18-004, which arrives with [Rush] and attacks again. The self-trash is paid even below 9 DON!!, when it plays nothing, so do not activate it early.",
    "The Leader's draw pays on either turn, once per turn, and only on a K.O. of your {Alabasta} Character. A trade in battle on either side draws, and so does a K.O. by the opponent's effect; a Duck Troops trashing itself or a card trashed for Chaka or Pell is not a K.O. and does not.",
  ],
  mulligan: [
    "Keep OP13-012 Nefeltari Vivi: it looks at 4 and takes any {Alabasta} card costing 2 or more, which is nearly every Character in the list.",
    "Keep a 2-to-4-cost [Rush] curve -- OP18-011 Vivi, OP18-004 Karoo, Chopper, Duck Troops, Accelegator -- so the attacks start on the first turns with 3 or 4 DON!!.",
    "A hand of only 5-costs with nothing under 4 takes a new hand; so does one with no Character to play before turn 3.",
  ],
  priorities: [
    "Put OP18-011 Vivi down before the attackers: her +1000 is live at once, and every {Animal} {Alabasta} body you play after her arrives with it and with [Rush].",
    "Feed Chaka and Pell the cheap Characters that have done their job in hand: a second OP13-012 Vivi, Koby when no removal threatens, Eyelashes, or a spare OP18-004 Karoo. Nothing printed above 5000 power -- EB02-001 Karoo, Sea Cat, Accelegator, Chaka, Pell -- can be trashed to them anyway.",
    "Pell is the only removal for their small Characters; save it for a 3000-base body that blocks, draws or protects.",
    "OP18-010 Chopper's [On K.O.] returns a Character with 4000 power or less from the trash -- OP18-011 Vivi, Eyelashes, Koby, OP13-012 Vivi, OP18-004 Karoo or EB03-024 Vivi. It is also {Alabasta}, so its K.O. draws off the Leader as well: attack with it into trades.",
    "OP18-015 Eyelashes trashes itself when the opponent attacks to give one of their Leader or Characters -3000 for the turn; use it on the attacker to blank a hit or a lethal swing. On your own turn it is a 1000 [Rush] body worth little more than its 2000 Counter.",
    "OP18-019 Quack!!!'s [Main] gives one of their Characters -3000 only while you have no Character with 7000 base power -- EB02-001 Karoo is printed 7000 and shuts it off, the Leader's +1000 does not. Its [Counter] gives the Leader +3000, and that half always works.",
    "OP15-009 Koby lets one of your Characters with 7000 base power or less stay when the opponent's effect would remove it, by giving your Leader -2000 for the turn instead. On their turn the lower Leader is easier to hit, so spend it on a body worth more than the Life it may cost.",
    "The Leader has no ability to activate. Its DON!! is best on the [Rush] bodies the turn they land; give the Leader DON!! only when the Characters are spent.",
  ],
  commonVariants: [
    "An automated builder's Karoo runs four Sea Cat and a Pincers pair (the 1-cost that pumps an {Animal} {Alabasta} attacker, and the 4-cost [Blocker]), Koza, Jewelry Bonney and Mr.7 & Miss.Father'sDay, with no Chaka, Pell, Koby, Quack!!! or OP13-012 Vivi. This list takes card draw and removal from Chaka and Pell instead.",
    "NightingaleTCG's build plays Igaram and Koza for the Vivi package, Leo in Koby's protection slot and Mr.4 & Miss.MerryChristmas for blue removal, without Sea Cat, Eyelashes or Accelegator.",
    "BerryTCG's build adds Roronoa Zoro (EB04-007) as a top end, Terracotta to make an {Alabasta} attacker [Unblockable], Igaram and four Pell, and cuts Koby, Eyelashes, Sea Cat and Quack!!!.",
  ],
  commonCombos: [
    "OP18-011 Vivi, then OP18-004 Karoo: a 3-cost 6000 with [Rush] and [Banish]; with a second OP18-011 Vivi it is 7000 and [Unblockable] as well.",
    "Two cheap bodies first, then EB03-024 Vivi playing EB02-001 Karoo from hand: three or four attackers on the same turn.",
    "At 9 DON!!: Duck Troops attacks, trashes itself and plays EB02-001 Karoo, which attacks again with [Rush].",
    "Chaka or Pell trashing a spare Character to draw 2, and Chopper later returning that card from the trash.",
  ],
  keyCardNumbers: [
    "OP18-001",
    "OP18-011",
    "OP18-004",
    "EB03-024",
    "EB02-001",
    "OP18-009",
    "OP18-013",
    "OP18-008",
    "OP13-012",
  ],
  counterplay: [
    "Every [Rush] body attacks the turn it lands, so count their next turn's attacks from their hand and DON!!, not from their board.",
    "Remove OP18-011 Vivi first: she is the +1000 on every {Animal} {Alabasta} Character and the step to OP18-004 Karoo's [Banish] and [Unblockable]. On your turn she has 0 power and no [Blocker].",
    "Watch for 9 DON!!: Duck Troops on the field then means a free Karoo from hand.",
    "Their Leader draws on the first K.O. of an {Alabasta} Character each turn; removal that trashes or returns to deck instead denies it.",
  ],
  sources: [
    {
      url: "https://www.youtube.com/watch?v=C_KqtnnvA98",
      retrievedAt: "2026-11-15",
      note: 'The deck\'s own 50: the "Lista:" block in the description of VersusTCG\'s Spanish-language deck profile "Karoo Op18: ¡Cuidado con el Pato!", uploaded 2 Nov 2026, a pre-release build with no event or placing.',
    },
    {
      url: "https://www.youtube.com/watch?v=PmI45up-HXY",
      retrievedAt: "2026-11-15",
      note: "NightingaleTCG's Karoo build, uploaded 8 Nov 2026, the source of a variants line.",
    },
    {
      url: "https://www.duelvoyager.com/deck/view/Y9M3VAYLvsDm",
      retrievedAt: "2026-11-15",
      note: "BerryTCG's Karoo deck share, 6 Nov 2026, the source of a variants line.",
    },
  ],
};

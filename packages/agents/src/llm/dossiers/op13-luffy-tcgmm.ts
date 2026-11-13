import type { DeckStrategyDossier } from "./types.js";

export const op13LuffyTcgmmDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Red/Green) Monkey.D.Luffy - TCG Match Making EB05 2026-11-12 #2",
  archetype:
    "Red/Green OP13-001 Monkey.D.Luffy as a Land of Wano chain: the Leader is {Supernovas}, so EB05-001 Jewelry Bonney draws 2 and plays two small Characters from hand, EB01-013 Kouzuki Hiyori turns herself into a 5-cost {Land of Wano} body and a card, and OP13-031 Trafalgar Law plays Bonney again. Three OP17-022 Shanks finish.",
  gamePlan: [
    "Turns 1-3: dig with the 1-costs. OP13-016 Monkey.D.Garp looks at 4 for a card of cost 3 or more (the Leader is [Monkey.D.Luffy], so it is live), OP07-022 Otama looks at 5 for a green {Land of Wano} card, and ST30-004 Emporio.Ivankov reveals two 6000-power Characters -- ST32-002 Oden, OP12-023 Kawamatsu, OP13-031 Law -- to draw 3 and trash 2. Find Bonney and Hiyori.",
    "At 5 DON!!, play EB05-001 Jewelry Bonney: her [On Play] draws 2 and plays up to two Characters with 2000 power or less from your hand. Take EB01-013 Kouzuki Hiyori first, and OP14-031 Nami or ST32-001 Kin'emon as the second; each played Character's own [On Play] then resolves.",
    "EB01-013 Hiyori's [Activate: Main] trashes her to play a {Land of Wano} Character of cost 5 or less other than Hiyori from hand, then draws 1. It works the turn she lands: ST32-002 Kouzuki Oden is the first choice, OP12-023 Kawamatsu the fallback.",
    "ST32-002 Oden's [On Play] draws 1, and one of their Characters with a base cost of 6 or less cannot be rested until the end of their next End Phase: it can neither attack nor block. Pick the Blocker in front of your attack, or the Character that would attack you.",
    "At 6 or more DON!!, OP13-031 Trafalgar Law returns one of your Characters to hand to play a Character of cost 5 or less from hand rested. Return a Bonney whose [On Play] is spent and play a Bonney: she draws 2 and plays two more small Characters.",
    "OP17-022 Shanks is the finisher, at 10 DON!!: [Rush], 12000 power, sets 2 of your DON!! active and rests all of their Characters, so nothing of theirs blocks that turn. Three copies make it a plan rather than a hope.",
  ],
  mulligan: [
    "Keep OP13-016 Garp with EB05-001 Bonney, always.",
    "Keep one of Garp or Bonney with the 1-costs -- Otama, Ivankov, Kin'emon -- that dig towards the other.",
    "Neither Garp nor Bonney: take a new hand.",
    "Prefer to go second: your third turn then has 6 DON!!, Bonney and a 1-cost, and the first turn's draw is one more card towards the pair.",
  ],
  priorities: [
    "Keep a Character of 2000 power or less in hand for Bonney: an [On Play] that draws 2 and plays nothing is half the card. Hiyori with Oden or Kawamatsu in hand is the best pair.",
    "ST32-001 Kin'emon's [On Play] rests a DON!! (or a <Slash> Leader) to draw 2 and trash 1. Off Bonney it costs nothing but that rest: trash a spare 1-cost whose [On Play] the turn no longer needs.",
    "OP06-033 Vander Decken IX trashes a {Fish-Man} card from hand to K.O. one of their rested Characters. Kawamatsu is the deck's {Fish-Man} card, and Vander Decken is one too.",
    "OP14-031 Nami rests up to two of their Characters of cost 8 or less, then sets up to 5 of your DON!! active at the end of the turn. Rest first, then K.O. with Vander Decken or with OP10-040, which K.O.s one of their rested Characters of cost 7 or less in the Main Phase or as a Counter.",
    "OP01-055 You Can Be My Samurai!! rests two of your Characters to draw 2. Cast it after the attacks, resting bodies whose [On Play] is done -- Otama, Garp, Ivankov.",
    "The Leader's [On Your Opponent's Attack] needs a DON!! given to it and 5 or fewer active DON!!: rest any number for +2000 apiece on the Leader or a {Straw Hat Crew} Character in that battle. OP14-031 Nami is the only {Straw Hat Crew} Character here, so it is almost always the Leader's defence.",
    "OP13-031 Law gains [Blocker] at 1 or fewer Life cards.",
  ],
  commonVariants: [
    "OPTCG Web Sim's Miracle Luffy EB05 guide plays the same chain with four PRB02-003 Lucky.Roux, two OP08-036 Electrical Luna and one Shanks where this list runs Kin'emon, OP10-040 and three Shanks.",
    "The other common build behind this Leader is the Straw Hat DON!!-refresh deck, as in the list that won the Malmo Regional in August 2026: OP13-027 Sanji, OP14-022 Usopp, OP13-118 Monkey.D.Luffy and EB04-007 Roronoa Zoro set DON!! active for the Leader's clause, with EB02-017, OP01-016 and ST31-005 searching.",
  ],
  commonCombos: [
    "Bonney plays Hiyori and a second small Character; Hiyori trashes herself to play Oden and draws; Oden draws and stops one of their Characters from resting: one 5-cost, three bodies and four cards drawn.",
    "Law returns a spent Bonney and plays a Bonney rested: draw 2 and two more small Characters.",
    "Nami rests two of theirs, then Vander Decken and OP10-040 K.O. them.",
  ],
  keyCardNumbers: [
    "OP13-001",
    "EB05-001",
    "EB01-013",
    "ST32-002",
    "OP13-031",
    "OP13-016",
    "OP14-031",
    "OP17-022",
  ],
  counterplay: [
    "Its big turns run through Bonney's [On Play], at 5 DON!! and again through Law at 6 or more. Most of what Bonney plays has 0 or 2000 power, so once rested those bodies are cheap to K.O.",
    "Oden can stop only one Character of base cost 6 or less from resting; a second Blocker or a bigger one still stands.",
    "A rested Character of cost 7 or less is a K.O. target on their turn and yours: OP10-040 is a Counter too.",
    "It runs three Shanks: count to their 10 DON!! and keep a Character active you can afford to have rested.",
  ],
  sources: [
    {
      url: "https://www.patreon.com/tcgmatchmaking",
      retrievedAt: "2026-11-12",
      note: "TCG Match Making's EB05 Weekly Power Rankings of 12 Nov 2026: this fifty is its #2 list, lifted there by EB05-001 Jewelry Bonney.",
    },
    {
      url: "https://optcgwebsim.com/learn/miracle-luffy-eb05-guide/",
      retrievedAt: "2026-11-07",
      note: "OPTCG Web Sim's Miracle Luffy EB05 Guide, updated 2026-11-05: the Bonney-Hiyori-Oden and Law-Bonney lines, Shanks as the finisher, the Garp-and-Bonney mulligan and the preference for going second; the first variants line.",
    },
    {
      url: "https://onepiecetopdecks.com/deck-list/english-op16-deck-list-the-time-of-battle/",
      retrievedAt: "2026-10-12",
      note: "The Malmo Regional winning list for OP13-001 (1st, 13-1, 22 Aug 2026), the source of the second variants line's Straw Hat DON!!-refresh build.",
    },
  ],
};

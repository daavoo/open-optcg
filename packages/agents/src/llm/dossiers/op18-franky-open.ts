import type { DeckStrategyDossier } from "./types.js";

export const op18FrankyOpenDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Green/Purple) Franky - Open OPTCG",
  archetype:
    "Green/Purple OP18-021 Franky as an OP-18 Stage engine: sixteen 5-cost {Straw Hat Crew} Stages that each draw a card and ramp a DON!! when played, put out by the Leader for one returned DON!! and refunded by OP08-067 Charlotte Pudding, recovered by OP18-070 Tom, and spent in hand as +3000 Counters; 6-cost Straw Hat Luffys and Brook that the Stages set active or give Rush, with OP17-022 Shanks and OP18-040 to clear the board late.",
  gamePlan: [
    "The Leader gives every Stage in your hand a +3000 Counter, and once per turn its [Activate: Main] returns 1 DON!! to the DON!! deck to play a Stage costing 5 or less from hand without paying its cost. All four Stages in this list cost 5, and each one's [On Play] draws 1 and adds a rested DON!! from the DON!! deck: the activation is a free card every turn and gives back the DON!! it took.",
    "Only one Stage stands at a time: playing the next one trashes the one in play. Choose which Stage to replace by the ability you want this turn, and treat the trashed ones as ammunition for Tom and OP18-074's [Trigger], which each return 2 Stages from your trash to your hand.",
    "OP08-067 Charlotte Pudding adds a rested DON!! the first time each of your turns that a DON!! of yours goes back to the DON!! deck. With her out, the Leader's activation, Tom's DON!! −1, Thousand Sunny's DON!! −2 or EB02-061 Luffy's return each refund one: play her early, before the turn's first return.",
    "OP18-078 Mini-Merry: rest it to give up to 4 of your Leader and Characters 1 rested DON!! each -- the DON!! you spent this turn come back as attack power. OP18-077 White Hobby Horse 1: rest it to give one {Straw Hat Crew} Character [Rush: Character] this turn, so a Luffy or Brook played this turn can attack a rested Character at once.",
    "OP18-075 Thousand Sunny: DON!! −2 and rest it to set active a rested {Straw Hat Crew} Character of 7000 power or less. It reads current power, so DON!! given to the Character push it out of reach: give DON!! to the Leader and keep the Luffy you mean to ready at its printed 7000. Readying OP13-118 Luffy, a [Double Attack], buys a second attack worth two Life.",
    "OP18-076 Shark Submerge 3 works on their turn: when they attack, rest it to give your Leader (only while it is at 5000 power or less) and up to 2 Characters +1000 this turn. It is the Stage to leave on the field when you pass with little in hand.",
    "OP13-118 Luffy sets up to 4 of your DON!! active on play, since the Leader is multicolored, but then you cannot play another Character with a base cost of 5 or more that turn. Play it first in the turn and spend the readied DON!! on Stages, Tom, Events or a 4-cost ST30-012 Luffy, not on a second 6-cost.",
    "EB02-061 Luffy has [Rush] once they have 5 or more DON!! on their field. When it attacks, once per turn, return 2 active DON!! to set it active again and take the top card of your Life into your hand: a second attack for a Life card, and Pudding refunds 1 of the 2 DON!!.",
  ],
  mulligan: [
    "Keep any of the four Stages: on your second turn the Leader plays it for a DON!! it gives back, and draws.",
    "Keep OP18-061 Iceburg: it looks at 5 for up to 2 Stages or {Water Seven} cards, and finds Stages, Tom and both Events.",
    "Pudding and Tom are fine early plays but not keeps on their own. A hand of only 6- and 10-costs with no Stage takes a new hand.",
  ],
  priorities: [
    "Use the Leader's activation every turn you have a Stage in hand, after Pudding is on the field when you can. Hold a second Stage back as a +3000 Counter rather than playing two in one turn: the second trashes the first.",
    "Keep a 5-cost Stage on the field on their turn: OP18-074 is a +4000 Counter only while one is out, and is worth nothing without it.",
    "Activate Mini-Merry after the turn's plays have been paid for; the rested DON!! it gives are the ones you just spent.",
    "Tom costs 1, DON!! −1 and a card from hand for 2 Stages from your trash: two cards that each become a free play, a draw and a DON!! or a +3000 Counter. Trash a Shanks you cannot cast yet or a duplicate body to it.",
    "OP15-032 Brook rests one of their cards on play, a Blocker before your attacks, or a Character for OP18-040 to K.O. Later, trash it to set active one of your Characters with a base cost of 8 or less -- another Double Attack from OP13-118 Luffy.",
    "ST30-012 Luffy rests 1 of your DON!! to gain [Rush], and when it attacks it rests one of their [Blocker]s: send it in before the attacks the Blocker would stop.",
    "OP17-022 Shanks has [Rush], sets 2 DON!! active and rests all of their Characters: nothing blocks that turn, and OP18-040 then K.O.s a rested Character costing 7 or less.",
  ],
  commonVariants: [
    "Sunny_OPTCG's Straw Hat build of 16 Sep 2026, made before most of OP-18 was revealed, plays the ST-18 purple Straw Hats, EB02-041 Merry Go, OP05-040 Birdcage, OP07-064 Sanji and OP09-078 Gum-Gum Giant with only four OP-18 Stages. Expect fewer Stages, Characters that wake at 8 DON!!, and a Birdcage board wipe at 10.",
    "Other fan builds lean on {Water Seven}: EB01-031 Kalifa, EB01-033 Blueno, EB02-037 Franky, OP06-041 The Ark Noah and OP18-031 Nico Robin around the same Stages.",
    "An automated deck builder's list plays DON!!-active Straw Hats (P-102 Nami, OP13-027 Sanji, OP13-037 Roronoa Zoro, OP14-022 Usopp) and OP18-034 Franky to play a Stage or {Straw Hat Crew} card from hand.",
  ],
  commonCombos: [
    "Pudding on the field, then the Leader's DON!! −1 into a Stage: draw 1, and two rested DON!! come back for the one returned.",
    "OP13-118 Luffy attacks with [Double Attack], then Thousand Sunny or Brook sets it active for a second one.",
    "Shanks rests their board, OP18-040 K.O.s the biggest rested Character it can reach, and the Luffys attack past no Blockers.",
    "Tom or OP18-074's [Trigger] returns 2 Stages from the trash: next turn's free play and a +3000 Counter.",
  ],
  keyCardNumbers: [
    "OP18-021",
    "OP18-078",
    "OP18-075",
    "OP08-067",
    "OP18-070",
    "OP13-118",
    "EB02-061",
    "OP18-074",
    "OP17-022",
  ],
  counterplay: [
    "Sixteen Stages are hidden +3000 Counters, and OP18-074 is +4000 while a Stage is out: count their hand as Counter-rich even when it holds few Characters.",
    "Removing Pudding early slows the whole engine: without her each return of DON!! is a real loss.",
    "Thousand Sunny readies only a Straw Hat of 7000 power or less, and only one Stage stands at a time: the one on their field tells you which trick is live.",
    "A Shanks turn rests your whole board: keep the Characters that matter at a cost above 7 or out of reach of OP18-040 on the turn they can reach 10 DON!!.",
  ],
  sources: [
    {
      url: "https://en.onepiece-cardgame.com/products/op18.html",
      retrievedAt: "2026-11-16",
      note: "Bandai's OP-18 product page, the set the deck's Stages, Iceburg, Tom and Events come from. The deck's own 50 was supplied by the maintainer on 16 Nov 2026.",
    },
    {
      url: "https://www.youtube.com/watch?v=VBPnhuFmRE8",
      retrievedAt: "2026-11-15",
      note: "Sunny_OPTCG's Straw Hat package list for this Leader, of 16 Sep 2026, the source of the first variants line.",
    },
  ],
};

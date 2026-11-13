import type { DeckStrategyDossier } from "./types.js";

export const eb05RobinTcgmmDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Green/Yellow) Nico Robin - TCG Match Making EB05 2026-11-12 #4",
  archetype:
    "Green/Yellow Nico Robin behind EB05-010: a <Wisdom> core the Leader stands back up for a second attack, cheap 1- and 2-costs that dig and power the Leader, and a smaller OP-17 Big Mom Pirates [Trigger] package -- Pudding, Sweet 3 Generals and two Charlotte Linlin -- that plays bodies off Life and puts cards back on it.",
  gamePlan: [
    "The Leader's [Activate: Main], once a turn, sets one of your <Wisdom> Characters with 6000 power or less active. The <Wisdom> bodies here are EB05-016 Nico Robin, EB05-055 Nami and EB05-052 Gloriosa at 6000, OP17-109 Charlotte Pudding and EB04-018 Megalo at 4000, and EB05-050 Atlas at 2000. Attack with one, stand it up, attack again.",
    "The Leader's other clause, once a turn: when one of your <Wisdom> Characters without [Blocker] is K.O.'d, the top card of your deck goes onto your Life. A traded <Wisdom> body is a Life card back.",
    "The early turns dig: EB05-050 Atlas and OP13-113 Lilith look for the next card -- Lilith for a [Trigger] card -- and OP09-106 Nico Olvia gives the Leader +3000 for the turn. EB05-057 Nojiko gives a rested DON!! to a <Wisdom> or <Special> card once a turn.",
    "Life is a resource here, not only a clock. EB05-055 Nami adds a Life card on your turn under this Leader, OP17-114 Sweet 3 Generals adds one for 2 rested DON!!, and OP17-112 Charlotte Linlin can add one on play. Most of the deck carries a [Trigger], so a Life card the opponent takes is often a card that does something: Olvia's draws 3, Lilith's digs, Sweet 3 Generals plays itself.",
    "EB05-016 Nico Robin's [On Play] on your turn plays a <Wisdom> Character of cost 5 or less from your hand: Nami, Gloriosa, Megalo, Pudding or Atlas. Robin into Nami is two 6000 bodies and a Life card for one card's DON!!.",
    "OP13-031 Trafalgar Law returns one of your Characters to hand to play a Character of cost 5 or less from hand rested: return a spent Robin or Nami to cast its [On Play] again. OP17-022 Shanks and OP17-112 Charlotte Linlin are the 10-costs.",
  ],
  mulligan: [
    "Keep a hand that develops by turn 3 or 4: EB05-050 Atlas or OP13-113 Lilith to dig, or OP17-109 Pudding, EB05-052 Gloriosa or EB04-018 Megalo.",
    "A hand whose only cheap cards are Nico Olvia and Nojiko develops nothing: Olvia is a turn's +3000 and Nojiko a DON!! gift. Take a new one, as with a hand of only 5-, 6- and 10-costs.",
  ],
  priorities: [
    "Stand up the <Wisdom> body whose second attack does the most. While Linlin is on the field Pudding and Sweet 3 Generals are 8000s, above the Leader's 6000 limit, so they cannot be stood up; Robin, Nami, Gloriosa, Megalo and Atlas still can.",
    "Give DON!! after the Leader's stand-up, not before: given DON!! counts toward the 6000 limit. Nojiko's gift follows the same rule.",
    "OP17-109 Pudding draws 3 for a [Trigger] card from hand. Nearly every card here carries one; pay with the copy you need least, and keep the Events, which Counter.",
    "Sweet 3 Generals' [On Play] rests 2 DON!! to draw, add a Life card and give two opposing Characters −3000 for the turn. Cast it before attacking, aimed at the Blockers or the bodies your attackers cannot beat.",
    "EB05-052 Gloriosa can be trashed instead of you taking damage. Take the damage unless the hit would end the game or leave your Life too low to survive the next turn: a Life card taken may be a [Trigger] that plays a body.",
    "EB04-018 Megalo rests itself to K.O. one of the opponent's rested Characters with 8000 power or less. Play it after the opponent has attacked with what you want gone, or after OP17-022 Shanks has rested their board.",
    "OP17-022 Shanks has [Rush], sets 2 DON!! active and rests the opponent's whole board: the turn to swing everything, and to follow with Megalo.",
    "OP14-118 stops one of the opponent's active Characters attacking for the turn once you are at 2 or fewer Life; its [Trigger] plays a [Trigger] Character of 6000 power or less from hand. OP06-115 is a +3000 Counter for a card from hand.",
    "Linlin's other mode takes the top card of the opponent's Life to their hand. Use it when that Life card is the last one between you and the game; otherwise add to your own Life.",
  ],
  commonVariants: [
    '"(Green/Yellow) Nico Robin - TCG Match Making EB05 #6", ranked 6th the week before, plays the full Big Mom [Trigger] package -- OP17-107 Charlotte Daifuku, OP17-102 Charlotte Oven, OP12-112 Baby 5 and four Linlin -- where this list plays Olvia, Nojiko, Lilith and Law.',
    '"(Green/Yellow) Nico Robin - EB05 Wisdom List" is the all-<Wisdom> build, with OP14-108 Silvers Rayleigh and no Big Mom cards. Expect more stand-up attacks and fewer bodies off Life from it.',
  ],
  commonCombos: [
    "EB05-016 Robin plays EB05-055 Nami from hand; Nami adds a Life card. Two 6000 bodies and a Life card for one 6-cost.",
    "OP13-031 Law returns a spent Robin and plays it again rested: another <Wisdom> body out of hand.",
    "A 6000 <Wisdom> body attacks, the Leader stands it up, and it attacks again; give it DON!! only after the stand-up.",
    "OP17-022 Shanks rests the opponent's board and attacks with [Rush]; Megalo then K.O.s one of the rested Characters.",
    "Sweet 3 Generals' −3000 on two bodies, then the attacks: the Blocker or the big body is out of the way for the turn.",
  ],
  keyCardNumbers: [
    "EB05-010",
    "EB05-016",
    "EB05-055",
    "EB05-052",
    "EB05-050",
    "OP17-109",
    "OP17-114",
    "OP17-022",
    "EB04-018",
  ],
  counterplay: [
    "The Leader's stand-up needs a <Wisdom> Character with 6000 power or less. Raise your Leader's power above 6000 and their double attacks stop connecting.",
    "Every Life card you take may be a [Trigger] that plays a body or draws cards. Take Life when the trigger costs you least, and finish the game in one turn rather than over several.",
    "K.O.ing a <Wisdom> body without [Blocker] gives them a Life card once a turn. Bounce, rest or bottom-deck it instead when you can.",
    "At 2 or fewer Life, one of your active attackers may be stopped by OP14-118: attack with the others first.",
  ],
  sources: [
    {
      url: "https://www.patreon.com/tcgmatchmaking",
      retrievedAt: "2026-11-12",
      note: "The deck's own 50: the Green/Yellow Robin list in TCG Match Making's \"EB05 Weekly Power Rankings - November 12th\" post (12 Nov 2026), ranked 4th, from high-rank online play, with Red/Green Luffy and Blue Xebec named as its hardest matchups. A Patreon post with no pilot or event; the 5 Nov post is the source of the first variants line.",
    },
    {
      url: "https://stats.tcgmatchmaking.com/",
      retrievedAt: "2026-11-12",
      note: "TCG Match Making's stats dashboard, the play data the power rankings are drawn from.",
    },
    {
      url: "https://www.youtube.com/watch?v=4L5S8I6hnrI",
      retrievedAt: "2026-10-23",
      note: "Car D. Kaizoku's \"EB05 Robin Swings A LOT\" (12 Oct 2026): the Leader's plan -- attack, stand up with the Leader, attack again; DON!! after the stand-up; Robin into Nami -- and the all-<Wisdom> build in the variants line.",
    },
  ],
};

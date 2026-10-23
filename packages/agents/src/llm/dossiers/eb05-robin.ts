import type { DeckStrategyDossier } from "./types.js";

export const eb05RobinDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Green/Yellow) Nico Robin - EB05 Wisdom List",
  archetype:
    "Green/Yellow <Wisdom> midrange behind EB05-010: a board of 6000-power <Wisdom> Characters that the Leader stands back up for a second attack once a turn, and that put a card back on your Life when one is K.O.'d.",
  gamePlan: [
    "The Leader's [Activate: Main], once a turn, sets one of your <Wisdom> Characters with 6000 power or less active. Attack with a 6000 body, stand it up with the Leader, and attack with it again.",
    "Given DON!! counts toward that 6000 limit, so give DON!! to the body after the Leader has stood it up, not before.",
    "The Leader's other clause, once a turn: when one of your <Wisdom> Characters without [Blocker] is K.O.'d, the top card of your deck goes onto your Life. Trading those bodies away refills your Life.",
    "EB05-016 Nico Robin's [On Play] on your turn plays a <Wisdom> Character of cost 5 or less from your hand -- EB05-055 Nami, EB05-052 Gloriosa or EB04-018 Megalo -- so a 6-cost turn puts two 6000 bodies down.",
    "EB05-055 Nami adds the top card of your deck to your Life on your turn under this Leader. EB05-052 Gloriosa can be trashed from the field instead of you taking damage.",
    "The early turns dig: EB05-050 Atlas finds a <Wisdom> card, OP13-113 Lilith a [Trigger] card, and OP17-109 Charlotte Pudding and EB05-056 Nico Olvia trade a [Trigger] card from hand for cards.",
    "OP14-108 Silvers Rayleigh K.O.s a Character with 7000 base power or less once your opponent is at 3 Life or fewer, and OP17-022 Shanks has [Rush], sets 2 DON!! active and rests your opponent's whole board -- the turn to swing everything.",
  ],
  mulligan: [
    "Keep a hand with EB05-050 Atlas or OP13-113 Lilith to dig, or with a 3- or 4-cost <Wisdom> body: OP17-109 Pudding, EB05-052 Gloriosa or EB04-018 Megalo.",
    "EB05-056 Nico Olvia and EB05-057 Nojiko are cheap but develop nothing on their own. A hand with only those and 5-costs or more does nothing until turn five; take a new one.",
  ],
  priorities: [
    "Stand up the <Wisdom> body whose second attack does the most: the one that can reach your opponent's Leader, or the one that removes a Character.",
    "OP17-109 Pudding draws 3 and EB05-056 Nico Olvia draws 2 for a [Trigger] card from hand. OP13-113 Lilith, EB05-050 Atlas, OP17-109 Pudding, EB05-016 Robin, EB05-052 Gloriosa, EB05-055 Nami, EB05-056 Olvia, EB05-057 Nojiko and OP14-108 Rayleigh all carry one, so pay with the copy you need least.",
    "EB05-052 Gloriosa trashed instead of damage saves a Life card but loses a body. Take the damage unless the hit would end the game or leave your Life too low to survive the next turn.",
    "EB04-018 Megalo rests itself to K.O. one of your opponent's rested Characters with 8000 power or less: play it after your opponent has attacked with what you want gone.",
    "OP13-031 Trafalgar Law returns one of your Characters to hand to play a cost 5 or less from hand rested. Return one whose [On Play] you want again, such as EB05-055 Nami.",
    "EB05-057 Nojiko gives a rested DON!! once a turn to a <Wisdom> card. Give it after the Leader's stand-up, for the reason the game plan gives.",
    "EB04-058 Borsalino is a [Blocker] that adds a Life card when you are at 2 or fewer.",
  ],
  commonVariants: [
    "The one EB05-010 list with a placing so far plays the OP-17 yellow Big Mom Pirates [Trigger] package -- Daifuku, Oven, Sweet 3 Generals, Charlotte Linlin -- with Baby 5 and Teach, in place of Olvia, Nojiko, Lilith, Law, Rayleigh and Shanks.",
    "Theorycraft builds add EB05-012 Camie, EB05-051 Ahiru and EB05-053 Charlotte Praline.",
  ],
  commonCombos: [
    "EB05-016 Robin plays EB05-055 Nami from hand; Nami adds a Life card. Two 6000 bodies and a Life card for one 6-cost.",
    "A 6000 <Wisdom> body attacks, the Leader stands it up, EB05-057 Nojiko gives it a rested DON!!, and it attacks again at 7000.",
    "OP17-022 Shanks rests your opponent's board and attacks with [Rush]; Megalo then K.O.s one of the rested Characters.",
  ],
  keyCardNumbers: [
    "EB05-010",
    "EB05-016",
    "EB05-055",
    "EB05-052",
    "EB05-050",
    "EB05-056",
    "OP17-022",
  ],
  counterplay: [
    "The Leader's stand-up needs a <Wisdom> Character with 6000 power or less. Raise your Leader's power above 6000 and their double attacks stop connecting.",
    "K.O.ing a <Wisdom> body without [Blocker] gives them a Life card once a turn. Bounce, rest or bottom-deck it instead when you can.",
    "Rayleigh's K.O. switches on only once you are at 3 Life or fewer: stay above it when the race allows.",
  ],
  sources: [
    {
      url: "https://www.youtube.com/watch?v=4L5S8I6hnrI",
      retrievedAt: "2026-10-23",
      note: "The deck's own 50, from Car D. Kaizoku's \"EB05 Robin Swings A LOT\" (12 Oct 2026), and its plan: attack, stand up with the Leader, attack again; DON!! after the stand-up; Robin into Nami.",
    },
    {
      url: "https://opdeckguide.com/deck-guides/nico-robin-eb05/",
      retrievedAt: "2026-10-23",
      note: "OPDeckGuide's Nico Robin EB05 guide, hosting the same 50: the curve from Atlas and Lilith into Pudding and Olvia, and the deck's weakness to Leaders that raise their own power.",
    },
    {
      url: "https://play.limitlesstcg.com/tournament/6ad1e9418a8383117e3ecdc7/standings",
      retrievedAt: "2026-10-23",
      note: "[EB05] Rumble league #14 (22 Oct 2026): the 2nd-place EB05-010 list, the Big Mom [Trigger] build in the variants line.",
    },
  ],
};

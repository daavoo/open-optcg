import type { DeckStrategyDossier } from "./types.js";

export const op11ShirahoshiTournamentDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Green/Yellow) Shirahoshi - 3rd Place ChinoizeCup #125",
  archetype:
    "Green/Yellow {Neptunian} midrange behind OP11-022, as the EB-05 field builds it: a Leader that cannot attack and plays a {Neptunian} or [Megalo] for one DON!! every turn, with Life-adding cards that put a fresh face-down card on top to pay for it again, and OP17-022 Shanks to rest the opposing board for the removal to finish.",
  gamePlan: [
    "Your Leader cannot attack. Its [Activate: Main], once per turn: rest 1 DON!! and turn your top Life card face-up to play a {Neptunian} Character or [Megalo] from hand with a cost up to the number of DON!! on your field. With 5 or more DON!! out, that is a 5-, 6- or 7-cost body for one DON!!, and the rest of your DON!! still pays for normal plays.",
    "The Leader's cost needs a face-down top Life card. OP11-107 Topknot Neptunian turns it back face-down off its own [Activate: Main] and sets itself active at the end of the turn. EB03-052 Shirahoshi (trash it from the field) and OP17-114 Sweet 3 Generals (rest 2 DON!! on play) each add a card from your deck to the top of your Life, which puts a face-down card on top. Use one of these every turn the Leader has turned a card up, or it cannot play next turn.",
    "EB05-014 Shirahoshi costs 1 and takes up to two [Megalo] or {Neptunian} cards from the top 5. OP11-036 Spotted Neptunian takes a {Neptunian} or [Shirahoshi] from the top 5 on play. EB05-020 My name is Shirahoshi!! rests your Leader to draw 2; your Leader cannot attack, so resting it costs you nothing. These keep the Leader's hand fed.",
    "The bodies the Leader plays: EB04-018 Megalo, OP11-036 Spotted Neptunian and OP11-028 Lord of the Coast at 4, OP11-107 Topknot Neptunian and EB04-016 Bird Neptunian at 5, OP11-033 Bird Neptunian at 6 with 7000 power, and EB04-011 Scaled Neptunian at 7, an 8000 that can attack Characters the turn it is played and draws a card for each of your {Neptunian}s, then trashes as many.",
    "EB04-016 Bird Neptunian's [Activate: Main] sets one of your DON!! active. Activate the Leader first, then Bird Neptunian: the DON!! the Leader rested comes back for another play. Its [When Attacking] rests an opposing Character of cost 8 or less once you have 3 or more {Neptunian}s.",
    "OP12-102 Shirahoshi gives all your {Neptunian}s +2000 on your opponent's turn, and when your opponent's effect would remove one of your Characters of base cost 6 or less, you may turn your top Life card face-up instead.",
    "The removal works on rested Characters. EB04-018 Megalo rests itself on play to K.O. a rested Character with 8000 power or less; OP11-028 Lord of the Coast keeps a rested Character rested through its owner's next Refresh Phase, and OP08-036 Electrical Luna does that to every rested opposing Character of cost 7 or less. OP17-022 Shanks is the top of the curve at 10: [Rush], two of your DON!! set active, and every opposing Character rested.",
  ],
  mulligan: [
    "Keep a hand with EB05-014 Shirahoshi or OP11-036 Spotted Neptunian: each finds the {Neptunian}s and [Megalo] the Leader plays, and EB05-014 is a 1-cost play.",
    "A hand with neither leaves the Leader nothing to dig for. Take a new hand.",
  ],
  priorities: [
    "Use the Leader's activation every turn you have a {Neptunian} or [Megalo] in hand that it can reach. It is the cheapest body you will get.",
    "Before ending a turn with a face-up top Life card, put a face-down card back on top: Topknot Neptunian's [Activate: Main], EB03-052 Shirahoshi's trash, or Sweet 3 Generals' rest 2 DON!!. OP12-102 Shirahoshi's protection also turns a card face-up, so check the top of your Life after your opponent's turn too.",
    "Play the biggest {Neptunian} the Leader can reach off the Leader, and pay full price for the cards it cannot play: Shanks, Sweet 3 Generals and the Shirahoshi Characters are not {Neptunian} or [Megalo].",
    "EB05-014 Shirahoshi rests itself to give [Rush] to a {Neptunian} with 6000 power or less: Topknot, Spotted Neptunian or Lord of the Coast. Play one off the Leader, then give it [Rush] so it attacks the turn it lands.",
    "Play OP17-022 Shanks before the Leader's activation: it sets 2 DON!! active and rests their whole board, and then the Leader can play EB04-018 Megalo for one DON!! to K.O. a rested 8000-or-less, or Electrical Luna keeps the board rested through their next turn.",
    "Hold OP11-115 You're Just Not My Type! for a Counter: +4000 behind Shirahoshi for one DON!!.",
    "Keep one OP12-102 Shirahoshi on the field, not two: its +2000 needs no other 2-cost [Shirahoshi] of yours on the field.",
    "EB03-052 Shirahoshi's trash also gives every {Neptunian} +1000 for the turn. Use it on the turn you attack, after the Leader has turned the top Life card face-up.",
  ],
  commonVariants: [
    "Bandai's feature deck for this Leader turns the top Life card face-down with OP11-100 Otohime, OP11-108 Neptune and OP11-103 Long-Jaw Neptunian, digs with OP11-030 Shirahoshi, and removes with OP11-031 Jinbe, OP11-106 Zeus and ST16-004 Shanks, with OP10-030 Smoker for the DON!! and OP11-026 Scaled Neptunian at the top. This list keeps Topknot, Spotted Neptunian and Lord of the Coast and replaces the rest with the EB-04 and EB-05 Neptunians, Life-adding cards, OP12-102 Shirahoshi, Electrical Luna and OP17-022 Shanks.",
  ],
  commonCombos: [
    "Leader plays a {Neptunian}, then EB04-016 Bird Neptunian sets the rested DON!! active again.",
    "Leader turns the top Life card face-up to play a body; EB03-052 Shirahoshi then adds a card from your deck on top, face-down, and the whole team gains +1000 for the attack.",
    "OP17-022 Shanks rests every opposing Character; the Leader plays EB04-018 Megalo to K.O. one, and OP08-036 Electrical Luna keeps the rest down through their next Refresh Phase.",
    "EB05-014 Shirahoshi gives [Rush] to the Topknot Neptunian the Leader just played; Topknot attacks, turns the top Life card face-down and is active again at the end of the turn.",
  ],
  keyCardNumbers: [
    "OP11-022",
    "EB05-014",
    "OP11-036",
    "OP11-107",
    "EB03-052",
    "EB04-016",
    "EB04-018",
    "OP12-102",
    "OP17-022",
  ],
  counterplay: [
    "Their Leader cannot attack, so all their pressure comes from Characters. Removing bodies slows them more than it does most decks.",
    "The Leader's play needs a face-down top Life card. A face-up top Life card left at the end of their turn means no free play next turn.",
    "OP12-102 Shirahoshi makes their {Neptunian}s 2000 bigger on your turn and lets them turn a Life card face-up instead of losing a Character to your effects. Remove it first, or attack into the bodies in battle.",
    "Most of their removal needs your Characters rested. Attack with the bodies you can afford to lose, and keep what you need active.",
  ],
  sources: [
    {
      url: "https://play.limitlesstcg.com/tournament/6ad092328a8383117e3ec30c/standings",
      retrievedAt: "2026-10-23",
      note: "The deck's own 50: the 3rd-place list of 120 (6-1) at [EB05] ChinoizeCup #125, an online event played on 20 Oct 2026 that allowed EB-05 cards ahead of their English release.",
    },
    {
      url: "https://en.onepiece-cardgame.com/feature/deck/deck_065.php",
      retrievedAt: "2026-10-12",
      note: "Bandai's feature deck for OP11-022, the source of the variants line and of the Leader's activation and its face-down Life cost as this dossier describes them.",
    },
  ],
};

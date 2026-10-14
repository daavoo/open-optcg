import type { DeckStrategyDossier } from "./types.js";

export const st31Dossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Red) Monkey.D.Luffy - Starter Deck 31",
  archetype: "Base ST31 Red Straw Hat chain and Rush deck",
  gamePlan: [
    "Use Thousand Sunny and the deck's searchers to assemble the base starter's Straw Hat play chains.",
    "Sanji draws and plays a cost-5-or-less Straw Hat from hand; Jinbe draws and can extend with a cost-1 Straw Hat card.",
    "On a 5-DON!! turn, Sanji can free-play Chopper; Chopper gives a rested DON!! to the Leader, enabling the Leader to give 2 rested DON!! to the newly played Sanji so it gains Rush immediately.",
    "Reach the second attack cycle with enough defense, then use immediate Rush pressure from OP14-015 Zoro and the ST31 finishers.",
  ],
  mulligan: [
    "Prefer Thousand Sunny or another early search line, a playable early curve, and pieces that connect into Sanji or Jinbe.",
    "Avoid an opening hand overloaded with 7-cost finishers without early development or search.",
  ],
  priorities: [
    "When Sanji is already available, prioritize Jinbe from searches unless the next Sanji play already has a compatible free-play target. If Sanji already has a worthwhile target in hand, prefer a missing Luffy or Zoro finisher over another redundant free-play target.",
    "Before attacking, check whether Sanji development can create a same-turn Rush attack through Chopper and the Leader ability.",
    "Activate an existing Thousand Sunny before replacing it. If Sanji or Jinbe offers a second Sunny for free while the existing Stage is still active and 1 active DON!! remains, decline that free play, activate the old Sunny, then hard-play the replacement for its search.",
    "ST31-004 Monkey.D.Luffy gains Rush when your whole field has a total of 3 given DON!! cards; none of those DON!! has to be attached to Luffy. Use Thousand Sunny and the Leader gift to put them on older Characters that can also attack, then let the field-wide total switch on the new Luffy as an additional 9000-power attacker. Attach DON!! to Luffy itself only when the extra power crosses a useful threshold. Its On Play reductions stack once per Straw Hat on your field, so concentrating them on a large Character can pull even a 10-cost 12000-power body into attack range or make a Blocker costly to use.",
    "Attack with a Character before an activation cost rests that same Character -- but never before the DON!! gifts, Leader ability, and Stage ability that would raise the attack, because attack power is fixed at declaration.",
    "Spend the turn's DON!! and rested-DON!! gifts first, then order the Character attacks that exceed effectiveTargetPower from smallest to largest. A defence that lasts for the whole turn cannot be baited away by a small Character; a Leader swing remains free because resting the Leader gives up no blocker or future target protection.",
    "Pressure Life unless an opposing engine, Blocker, or attacker is a higher-value target.",
    "Before manually attaching active DON!! to the Leader or declaring its attack, use an active Thousand Sunny to give the Leader rested DON!! when that raises a current-turn attack or enables the Leader ability or another current-turn condition. This preserves active DON!! for development and other attackers. Do not use Sunny on a Leader that already attacked or cannot attack merely to spend the activation; given DON!! returns at Refresh.",
  ],
  commonVariants: [
    "The sealed ST31 starter list centers on Straw Hat searchers and play chains; upgraded lists commonly increase the best Sanji, Jinbe, and immediate-Rush cards while trimming weaker starter cards.",
  ],
  commonCombos: [
    "Sanji can play Chopper from hand; Chopper gives rested DON!! to the Leader, and the Leader gives 2 rested DON!! to the new Sanji so it gains Rush that turn.",
    "Sanji can play Jinbe, whose draw and cost-1 extension create board width and replace cards before the attack sequence.",
    "Thousand Sunny gives rested DON!! to Luffy cards, enabling the Leader condition without consuming active DON!! needed for development.",
    "Activate Thousand Sunny, then play a second copy over the rested Stage for another top-five search; this converts a leftover 1 DON!! into a fresh card without losing the first activation.",
    "For ST31-004 Monkey.D.Luffy, Sunny plus the Leader ability can distribute 3 given DON!! across the Leader and older attackers; that field-wide total grants the new Luffy Rush without attaching any DON!! to it, creating several attacks instead of one oversized attack. Its stacked On Play reductions can turn a large opposing Character or Blocker into a profitable attack target.",
  ],
  keyCardNumbers: [
    "ST31-001",
    "ST31-002",
    "ST31-005",
    "P-101",
    "OP14-015",
    "OP01-016",
  ],
  counterplay: [
    "Remove or rest Sanji before it can survive into another attack cycle, and account for a newly played Sanji gaining Rush through Chopper and the Leader.",
    "Pressure the hand because several finishers and Events have no printed Counter; deny free-play chains when choosing which active engine to attack.",
    "Expect immediate Rush pressure once ST31 reaches 5 to 7 DON!!, and preserve enough Counter for multiple medium and large attacks rather than one attack in isolation.",
  ],
  sources: [
    {
      url: "https://en.onepiece-cardgame.com/products/st31.html",
      retrievedAt: "2026-08-09",
      note: "Official ST31 product and card-list source; card text establishes the starter's Straw Hat and rested-DON!! play chains.",
    },
    {
      url: "https://onepiece.gg/starter-deck-red-monkey-d-luffy-st-31/",
      retrievedAt: "2026-08-09",
      note: "Public ST31 product index linking the official product and card list.",
    },
  ],
};

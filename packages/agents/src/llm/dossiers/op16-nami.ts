import type { DeckStrategyDossier } from "./types.js";

export const op16NamiDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Blue/Yellow) Nami - Official Feature Deck",
  archetype:
    "Blue/Yellow Nami hand-and-Life control with Thriller Bark recursion and high-cost Life stabilization",
  gamePlan: [
    "Keep the hand at 7 or fewer before your first own-turn Life removal so Nami draws, and leave at least 1 DON!! given to the Leader before passing: the [DON!! x1] defense reads any given DON!!, whether it was attached manually from your active DON!! or handed over rested by an effect.",
    "Use Zeus for efficient early removal, then establish Perona and Dr. Hogback as sticky control bodies that punish K.O. and recur through the Thriller Bark package.",
    "Stabilize Life with Zoro, Kikunojo, Borsalino, Nico Robin, Gecko Moria, and Marshall.D.Teach while the Leader converts Life movement into hand advantage.",
    "Turn the accumulated hand, recursive board, Blockers, and 10000- to 12000-power finishers into inevitability after the opponent runs low on answers.",
  ],
  mulligan: [
    "Prefer an early hand-size or Life setup card, Zeus against a cost-5-or-less curve, and a playable 4-cost Character such as Perona or Dr. Hogback.",
    "Keep a coherent path into the 8- to 10-DON!! finishers; redraw hands clogged with counterless top end and no early defensive development.",
  ],
  priorities: [
    "Count the post-cost hand before Zeus, Hiyori, EB03-053 Nami, or Nico Robin removes Life; the Leader draw fails at 8 or more cards.",
    "Use the Leader discard only when +2000 changes the battle result, prevents lethal, or restores access to the 7-card draw gate.",
    "Seed Perona or Dr. Hogback in trash when a later Kumacy Trigger or Gecko Moria can recur it for immediate disruption or board value.",
    "Use Perona's On Play and On K.O. attack lock on the opposing Character whose next attack matters most, not merely the largest visible body.",
    "Choose between Gecko Moria playing a Thriller Bark Character and placing it face-up in Life according to immediate board survival, Trigger value, and Life total.",
    "Preserve Blockers and 2000-Counter cards against fast pressure; the long-game engine is irrelevant if the opponent can sequence lethal first.",
    "Treat OP14-102 Kumacy as a 2000 Counter and Thriller Bark setup card, not routine 1-cost development. Keep it in hand by default; once played it is only a 2000-power body and can no longer Counter. Trash it only for concrete value such as the Leader's +2000 defence or a required discard, then let Gecko Moria place it face-up in Life so its Trigger can play Perona or Dr. Hogback from trash. Hard-play Kumacy only when that body has an immediate attack, fixes the Leader's 7-card draw gate, or supplies board width needed this turn.",
    "Spend Mr.3(Galdino) as the flexible half of the deck: trashing it draws 2 and takes an attack off a Character for a turn, so it is either the answer to the attack that matters or a 1000 Counter, and rarely worth keeping on the board for its 5000 power.",
    "Kouzuki Hiyori's 2000 Counter is the deck's most frequent defensive card; count how many remain in hand before deciding a Life total is safe, and use its On Play swap to bank a card the Leader draw cannot replace.",
  ],
  commonVariants: [
    "OP16 Thriller Bark lists center on Kumacy, Dr. Hogback, Perona, and Gecko Moria, with Life stabilizers and large Blockers such as Borsalino and Edward.Newgate.",
    "OP15 tempo variants instead use Leo, Girl, Sanji, and a heavier Event package around the same Leader, Zeus, EB03-053 Nami, and Nico Robin core.",
  ],
  commonCombos: [
    "Kumacy's Trigger plays a cost-4-or-less Thriller Bark Character from trash rested; Perona immediately locks an opposing cost-6-or-less Character from attacking.",
    "A Kumacy seeded in trash is Gecko Moria's low-opportunity-cost face-up Life target: when that Life card is taken as damage, its Trigger converts the prepared Perona or Dr. Hogback in trash into a rested Character. Until that line is concrete, Kumacy's printed 2000 Counter is its primary value.",
    "Dr. Hogback's On K.O. plays a different cost-4-or-less Trigger Character from trash, commonly replacing itself with another control body.",
    "Gecko Moria plays a cost-4-or-less Thriller Bark Character from trash or places it face-up in Life, setting either immediate recursion or a known Trigger.",
    "Zeus removes one of your Life cards to hand, triggers Nami's draw at 7 or fewer cards, and K.O.s an opposing cost-5-or-less Character.",
    "Nico Robin pays 1 Life to trigger Nami and adds up to 2 Life; Borsalino and Marshall.D.Teach provide further Life stabilization behind large bodies.",
    "Edward.Newgate draws 2, trashes 1, and gives rested DON!! to Nami and a Character, enabling the Leader defense while powering the next attack cycle.",
  ],
  keyCardNumbers: [
    "OP11-041",
    "OP11-106",
    "OP06-106",
    "OP14-102",
    "OP14-110",
    "OP14-111",
    "OP16-056",
    "EB03-053",
    "EB04-058",
    "EB03-055",
    "OP14-104",
    "OP16-119",
    "OP13-042",
  ],
  counterplay: [
    "Pressure Nami before the 7- to 10-DON!! Life-recovery and Blocker turns, but avoid weak attacks that only feed cards without taxing the hand.",
    "Bottom-deck or bounce Thriller Bark bodies when possible to bypass Dr. Hogback and Perona On K.O. value and reduce Gecko Moria's trash targets.",
    "Track known face-up Life and Kumacy/Perona/Hogback Trigger lines before choosing when to attack Life.",
    "Keep multiple relevant attackers because Perona can blank one cost-6-or-less Character through the opponent's next End Phase.",
    "Expect a once-per-turn +2000 Leader defence, paid with a discard, whenever this Leader has DON!! given to it. It lasts for the whole turn, not for one battle, so it cannot be baited: once paid, the Leader defends at 7000 against every remaining attack that turn, and leading with a small attacker to draw it out only spends that attacker for nothing. Treat 7000 as the Leader's defence for the whole turn from the first attack onwards -- effectiveTargetPower on the attack action already includes it -- and declare only attacks that exceed it, pumping every attacker before declaring since attack power is fixed at declaration.",
    "Do not read the ability being spent as a window in which a 6000 attacker connects: it means only that no further discard can raise the Leader, not that the boost expired. When effectiveTargetPower and targetPower differ, plan against effectiveTargetPower; counterShortfall is computed from the Leader's current power and understates what an attack really has to beat.",
  ],
  sources: [
    {
      url: "https://en.onepiece-cardgame.com/feature/deck/deck_067.php",
      retrievedAt: "2026-08-09",
      note: "Official Bandai guide for the Leader's hand, Life, defense, and late-game control fundamentals.",
    },
    {
      url: "https://www.shonentcg.com/blog/one-piece-tcg-nami-deck-guide",
      retrievedAt: "2026-08-09",
      note: "Current OP16 guide, corrected July 2026: Leader timing, hand-size discipline, Zeus role, defensive restraint, and matchup weaknesses.",
    },
    {
      url: "https://opdeckguide.com/deck-guides/nami-op11/",
      retrievedAt: "2026-08-09",
      note: "Current OP16 list and curve guide: Thriller Bark package, first/second curves, Life stabilization, and late-game finishers.",
    },
  ],
};

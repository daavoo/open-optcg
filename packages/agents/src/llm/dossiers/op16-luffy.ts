import type { DeckStrategyDossier } from "./types.js";

export const op16LuffyDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Green/Blue) Monkey.D.Luffy - Official Feature Deck",
  archetype:
    "Green/Blue Monkey.D.Luffy mono-Impel Down DON!! engine: untap 2 DON!! per turn by keeping the board 100% {Impel Down} type, then out-develop the opponent",
  gamePlan: [
    "Turns 1-2, establish a low-cost {Impel Down} board with Mr.1, Mr.2, Jinbe, and OP16-034 Luffy so the Leader's [Activate: Main] is live from turn 3.",
    "From turn 3 onward, activate the Leader every Main Phase to set up to 2 DON!! active; those refunded DON!! go into extra Character plays or stronger attacks, letting the deck develop faster than the opponent's DON!! count should allow.",
    "Chain the extra DON!! through Ivankov's search-plus-free-play and Buggy's draw-plus-free-Prisoner to flood the board with more threats than the opponent can profitably answer.",
    "Curve to 4-5 cost threats by mid-game (Mr.3, Crocodile, Buggy), then close with 6-cost Prisoner of Impel Down bodies and Boa Hancock's Unblockable 9000 once the engine is generating surplus DON!!.",
  ],
  mulligan: [
    "Mulligan aggressively for at least one 1- or 2-cost {Impel Down} Character -- Mr.1, Mr.2, Jinbe, or OP16-034 Luffy -- because the Leader untap cannot fire before the trait-pure board exists.",
    "Avoid hands overloaded with 6-7 cost finishers (Prisoners, Boa Hancock) or the situational Events with no early Character to start the engine.",
  ],
  priorities: [
    "Keep every Character on the field {Impel Down} type: a single off-trait Character -- even a dual-typed card played for its other pool -- disables the Leader's DON!! untap for the whole turn, so never play one for a marginal stat or effect upgrade.",
    "The Leader's untap sets rested DON!! active, and DON!! only rests by paying a cost, so pay for a Character first and activate once two DON!! are rested; the two it returns pay for the next play the same turn, and a turn that gives its DON!! to Characters instead of paying costs has nothing to refund.",
    "Use OP16-034 Luffy as an early curve-filler and searcher, and diversify Character names on board because its +1000-per-different-name scaling rewards distinct names once it holds a DON!!.",
    "Mr.2's [When Attacking] with a DON!! copies the opposing Leader's current power, so it swings at whatever the Leader actually reads, including powered Leaders.",
    "Play Mr.3(Galdino) to attack first, then trash it in Main to draw 2 and lock a cost-9-or-less attacker through the opponent's next End Phase; it is a 5000 attacker and a defensive answer in one card.",
    "Let's Go!! To the Navy Headquarters!! is a +3000 Leader Counter first and a board reset second: only spend the Main effect -- rest 6 DON!! to set everything active -- when 5 differently named {Impel Down} Characters are on the board and the restand wins the game or a lethal turn.",
    "Preserve the 2000-Counter bodies (Jinbe, Prisoner) and hold counter coverage for key attack windows; 4 Life is on the low end, so prioritize board setup over Life protection in the early turns but defend the Life total once the engine is running.",
    "Against removal-heavy decks, deploy at a pace faster than removal can answer: keep early Mr.1/Mr.2 pressure constant so the opponent spends resources on removal instead of setting up their own engine.",
    "Do not overextend into wide-board clears: present individual high-power threats when the opponent can wipe the board, and lean on the DON!! refund to redeploy after a reset.",
  ],
  commonVariants: [
    "The official Bandai feature deck runs fourteen 2-cost Characters (Mr.1, Mr.2, and Jinbe at four copies each, Inazuma at two) to guarantee early board presence, 10 Prisoner of Impel Down, Boa Hancock, ST30-012 Luffy, and 2 Let's Go!!.",
    "EN tournament lists since launch keep the mono-Impel Down core but swap Jinbe, Boa Hancock, and Inazuma for Crocodile and Miss Olive, with 8-10 Prisoners; Buggy, both Mr.3 prints, and Prisoner are the fixed core.",
    "The local OP16-LUFFY-GREENBLUE list runs 8 Prisoners and a single Brook (OP15-032) plus Green/Blue Events; Brook is Straw Hat Crew-only, so pilot it knowing that playing it disables the Leader untap until it leaves the field.",
  ],
  commonCombos: [
    "OP16-034 Luffy's On Play digs 3 for an {Impel Down} card; with 1 DON!! it grows +1000 per differently named Character, reaching Leader-contending power as a 1-cost body.",
    "Ivankov's On Play looks 3 for an {Impel Down} card, then plays a cost-2-or-less Character from hand for free -- two Characters for one play, amplified by the Leader's refunded DON!!.",
    "Buggy's On Play draws 1 and plays a Prisoner of Impel Down from hand; its once-per-turn effect then hands a Prisoner [Blocker] on the opponent's attack.",
    "Crocodile bounces a cost-2+ Character of yours to play a cost-2-or-less {Impel Down} from hand, recycling played bodies into more Impel Down development while keeping the board trait-pure.",
    "Mr.2's base power copies the opposing Leader's power when attacking with a DON!!, so it swings at the Leader's actual current value rather than a fixed 1000.",
    "Mr.3(Galdino) attacks, then trashes itself to draw 2 and stop a cost-9-or-less attacker until the opponent's next End Phase, trading one board slot for card advantage and tempo.",
    "Let's Go!! To the Navy Headquarters!! rests 6 DON!! to set the Leader and all Characters active when 5 differently named {Impel Down} Characters are in play, converting a developed board into a second attack wave.",
    "Boa Hancock is Unblockable and stops a non-Luffy opposing Character from being rested until the opponent's next End Phase, clearing a Blocker's path on an 9000 swing.",
  ],
  keyCardNumbers: [
    "OP16-022",
    "OP16-034",
    "OP16-054",
    "OP16-055",
    "OP16-027",
    "OP16-026",
    "OP16-045",
    "OP16-056",
    "ST30-014",
    "OP16-048",
    "OP16-042",
    "OP16-032",
    "OP16-038",
  ],
  counterplay: [
    "Consistent removal is the direct answer: the Leader untap requires the board to stay {Impel Down}, so clearing Characters stalls the engine and removes the deck's entire advantage.",
    "Wide-board clears punish the go-wide plan hard -- Enel's clears and Sengoku's Sakazuki reset the trait-pure board and cut off the untap in one action.",
    "Rush aggro that threatens Life before turn 3 is dangerous: 4 Life is on the low end, and the deck prioritizes board setup over Life protection early.",
    "The deck is readable once the Leader is identified -- the entire Character pool is {Impel Down} by construction -- so deny its engine pieces rather than trying to out-value a hand it cannot diversify.",
    "Blockers and rested-DON!! denial matter: Mr.3's attack lock, Buggy's Prisoner Blocker, and Boa Hancock's Unblockable all route around defenses, so count active attack windows before committing Life.",
  ],
  sources: [
    {
      url: "https://en.onepiece-cardgame.com/feature/deck/deck_103.php",
      retrievedAt: "2026-08-12",
      note: "Official Bandai feature deck for (Green/Blue) Monkey.D.Luffy: the DON!! untap concept, the 50-card list, and the early/mid/end-game breakdown reproduced above.",
    },
    {
      url: "https://www.shonentcg.com/blog/op-16-luffy-deck-guide",
      retrievedAt: "2026-08-12",
      note: "Current tournament-refined guide: the mono-Impel Down engine, the hard trait restriction (a single off-trait Character disables the untap), turn-by-turn play, matchup direction, and the 72% Tier-1 tracked win rate.",
    },
    {
      url: "https://www.shonentcg.com/blog/op-16-impel-down-luffy-deck-guide",
      retrievedAt: "2026-08-12",
      note: "Card-by-card review of the official list: key card roles, the mulligan rule, matchup notes versus Sengoku, Blackbeard, Buggy, Ace, and Enel.",
    },
  ],
};

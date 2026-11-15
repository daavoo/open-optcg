import type { DeckStrategyDossier } from "./types.js";

export const op16LuffyTcgplayerDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Green/Blue) Monkey.D.Luffy - TCGplayer EB-05 Heroines Vol.2",
  archetype:
    "Green/Blue OP16-022 Monkey.D.Luffy as an {Impel Down} draw-and-develop deck: cheap Characters that draw or dig for another {Impel Down} card fill the board, the Leader's once-per-turn [Activate: Main] sets 2 rested DON!! active while every Character you control is {Impel Down}, and the refunded DON!! go into 6000-power Prisoners, Buggy and Crocodile, with OP16-032 Boa Hancock's Unblockable 9000 to close.",
  gamePlan: [
    "Turns 1-2: play the 1- and 2-cost diggers and drawers -- OP16-034 Luffy, EB05-025 Domino, OP16-054 Mr.1, OP16-055 Mr.2 and ST30-014 Mr.3. Each is {Impel Down}, so the board stays pure and the Leader is live as soon as a cost has rested DON!!.",
    "The Leader sets rested DON!! active, and DON!! only rests by paying a cost. Pay for a play first, then activate the Leader once two DON!! are rested; the two it returns pay for the next play the same turn. Event costs that rest DON!! -- Let's Go!! To the Navy Headquarters!! and OP12-037 Asura Blades Drawn -- are refunded the same way.",
    "Mid-game, convert the refund into bodies: OP16-048 Buggy draws and puts a Prisoner of Impel Down from hand into play, OP16-026 Emporio.Ivankov digs for an {Impel Down} card and then plays a 2-cost or less Character from hand, and OP16-045 Crocodile returns one of your 2-cost-or-more Characters to hand to play a 2-cost-or-less {Impel Down} from hand -- bounce Mr.1, Mr.2 or Domino and replay it for its draw or dig again.",
    "ST30-014 Mr.3 rests itself to hand up to 2 rested DON!! each to two Characters with 6000 base power -- Prisoner of Impel Down, Crocodile, Buggy and Brook all qualify -- so the 6000 bodies attack at 8000 without spending your active DON!!.",
    "Close with OP16-032 Boa Hancock: 9000 and Unblockable, and its [On Play] stops one opposing Character other than a [Monkey.D.Luffy] from being rested through their next End Phase, so it can neither attack nor block in that window.",
    "The deck draws a lot and so does the format. EB05-028 Boa Hancock makes an opponent holding 9 or more cards trash 4 of them: hold it for the turn their hand is that full, since below 9 it is a vanilla 4-cost 5000.",
  ],
  mulligan: [
    "Keep a hand with at least one 1- or 2-cost {Impel Down} Character -- OP16-034 Luffy, Domino, Mr.1, Mr.2 or ST30-014 Mr.3 -- because the Leader's refund needs an early pure board and those cards find the rest of the curve.",
    "Two drawers or diggers plus a 4- or 5-cost (Crocodile, Ivankov, Buggy, OP16-056 Mr.3) is an ideal keep.",
    "A hand of Prisoners and OP16-032 Boa Hancock with nothing under 4 cost takes a new hand.",
  ],
  priorities: [
    "Keep every Character on the field {Impel Down}: the Leader checks that the only Characters you have are {Impel Down} when it activates. OP15-032 Brook is the one off-type Character in the list.",
    "Brook is a 6-cost that rests one opposing card on play, then trashes itself to set one of your Characters with base cost 8 or less active (the Leader is {Straw Hat Crew}, so it is live). Play it, rest their card, trash it to stand an attacker or a Blocker, and only then activate the Leader -- Brook gone, the board is pure again.",
    "Diversify names. OP16-034 Luffy, with 1 DON!! on your turn, gains +1000 for each of your Characters with a different card name, and Let's Go!! asks for 5 {Impel Down} Characters with different names. The two Boa Hancocks share a name, and so do the two Mr.3(Galdino) prints; Domino, Mr.1, Mr.2, Ivankov, Crocodile, Buggy and the Prisoner are each a distinct name.",
    "Mr.1 with a DON!! gains +3000 on your turn while you hold 5 or more cards; the deck's draws keep it there. Mr.2 with a DON!! takes the opposing Leader's current power as its base power when it attacks.",
    "OP16-056 Mr.3 is a 5000 attacker that later trashes itself in your Main Phase to draw 2 and stop one opposing Character costing 9 or less from attacking through their next End Phase: attack first, then cash it in against their biggest attacker.",
    "Buggy's second ability, once per turn, gives one of your Prisoners [Blocker] when the opponent attacks; Crocodile is a [Blocker] itself. Keep a Prisoner on board with Buggy to have a block on their turn.",
    "Let's Go!! To the Navy Headquarters!! and OP12-037 Asura Blades Drawn are +3000 Leader Counters first. Spend Let's Go!!'s Main (rest 6 DON!!, set your Leader and all Characters active) only when 5 differently named {Impel Down} Characters are out and the second wave of attacks wins or sets up lethal; spend Asura Blades' Main (rest 3 DON!!, rest up to two of their Characters or DON!!) to clear Blockers before attacking.",
    "OP02-068 Gum-Gum Rain is a 0-cost Counter that trashes a card from hand for +3000 on your Leader or a Character; the deck draws enough to afford the discard. Prisoners and ST30-014 Mr.3 carry 2000 Counter values.",
  ],
  commonVariants: [
    "Bandai's feature deck for this Leader, the other shelf list, runs 1 OP16-027 Jinbe, 3 Ivankov, 3 OP16-032 Boa Hancock, 2 ST30-014 Mr.3 and a removal-and-Counter Event package: OP12-057 Ice Block Pheasant Peck, OP13-040 I Know You're Strong..., OP11-061 Gum-Gum Jet Culverin and 2 OP06-058 Gravity Blade Raging Tiger. This list cuts Jinbe and those Events for 4 EB05-025 Domino, 1 EB05-028 Boa Hancock and 1 OP02-068 Gum-Gum Rain, and moves one Ivankov and one OP16-032 Hancock into two more ST30-014 Mr.3.",
    "The trade is removal for consistency: this list has no Event that removes a Character, so its answers are OP16-032 Hancock's rest lock, OP16-056 Mr.3's attack lock and Brook and Asura Blades' rests, and it wins by drawing into a wider, stronger board instead.",
  ],
  commonCombos: [
    "Play a 2-cost drawer, activate the Leader for 2 DON!!, play another drawer: two bodies and two cards on a turn that should have paid for one.",
    "Crocodile returns Mr.1, Mr.2 or Domino to hand and replays it from hand: a 6000 Blocker plus a second draw or dig for one card.",
    "Buggy draws and puts a Prisoner from hand into play; next turn ST30-014 Mr.3 gives both 2 rested DON!! and they swing at 8000.",
    "Ivankov digs for an {Impel Down} card, then plays a 2-cost or less Character from hand -- often the Domino or Mr.1 it just found.",
    "Five differently named {Impel Down} Characters out: attack with everything, then Let's Go!! stands the Leader and the whole board for a second round.",
    "OP16-032 Boa Hancock locks their Blocker so it cannot rest, then the Unblockable 9000 and the rest of the board go at the Leader.",
  ],
  keyCardNumbers: [
    "OP16-022",
    "OP16-034",
    "EB05-025",
    "OP16-054",
    "OP16-055",
    "ST30-014",
    "OP16-045",
    "OP16-048",
    "OP16-026",
    "OP16-056",
    "OP16-042",
    "OP16-032",
    "OP16-038",
    "EB05-028",
  ],
  counterplay: [
    "Removal stalls the engine: the Leader refunds DON!! only on a turn it has rested ones to set active, and every K.O. of a drawer is a card it does not draw.",
    "Keep your hand below 9 cards when EB05-028 Boa Hancock is a live play, or it costs you 4 of them.",
    "This list has no Event removal, so a large single body holds well against it; the threats are OP16-056 Mr.3's attack lock and OP16-032 Boa Hancock's rest lock, which take your best Character out of their turn rather than off the board.",
    "Count Buggy's Prisoner [Blocker], Crocodile's [Blocker] and the 2000-Counter Prisoners before committing an attack; four Life is low, so pressure early before the refund turns start.",
  ],
  sources: [
    {
      url: "https://www.tcgplayer.com/content/article/6-One-Piece-Decks-that-Get-Way-Better-with-Heroines-Edition-Vol-2-EB-05/43bf2e6d-3dc8-4abd-8930-eb84f43e3c2f/",
      retrievedAt: "2026-11-15",
      note: "The deck's own 50: Gavin's Green/Blue Luffy list, embedded as \"#6 Blue/Green Luffy\" in Peter Day's TCGplayer article of 28 Oct 2026; an article list with no event placing. The article frames Domino as another drawing low-cost body and another unique name, and EB05-028 Boa Hancock as a hand-size punisher for a format that draws more after EB-05.",
    },
    {
      url: "https://en.onepiece-cardgame.com/feature/deck/deck_103.php",
      retrievedAt: "2026-08-12",
      note: "Bandai's feature deck for OP16-022, the source of the variants line.",
    },
  ],
};

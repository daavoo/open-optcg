import type { DeckStrategyDossier } from "./types.js";

export const op13SaboDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Red/Black) Sabo - OP17 Elbaph List",
  archetype: "Red/Black Sabo, OP-17 Elbaph giants midrange",
  gamePlan: [
    "This deck runs on two different cost thresholds that the same card answers. The Leader prints '[DON!! x1] If you have a Character with a cost of 8 or more, your Leader and all of your Characters gain +1000 power'; the OP17 Elbaph half prints 'if there is a Character with a cost of 12 or more' on six of its bodies. OP17-089 Jaguar.D.Saul costs 4 in hand and sits on the board at 16, so one 4-drop satisfies both at once.",
    "Land a giant, then spend the rest of the turn on the cheap bodies it just grew. OP17-080 Usopp, OP17-087 Nico Robin and OP17-095 Roronoa Zoro each go from 2000 to 5000, OP17-093 Monkey.D.Luffy gains [Rush], and the Leader's aura adds another +1000 to everything you control.",
    "The Leader's other half runs backwards: 'If you have 4 or more Life cards, give this Leader −1000 power.' You start at 5, so the Leader is a 4000 body early and a 5000 one -- 6000 with the aura, 7000 with a DON!! attached -- once Life is down to 3. Taking an early hit is a cost this deck is glad to pay; do not spend Counter cards defending Life at 5 or 4.",
    "One DON!! has to be attached to the Leader for the aura to exist at all, so a turn that spends every DON!! on a body leaves the aura off. Budget the attachment: a giant plus one attached DON!! is worth more than a giant plus a 2-drop.",
    "The finisher is OP17-098 Gum-Gum Kong Gun: rest 6 DON!! to K.O. up to 2 opposing Characters at cost 6 or less, gated on a cost-12 body being present. Its [Counter] half -- +3000 to the Leader for one battle -- is what the card is for when the [Main] half has no target.",
  ],
  mulligan: [
    "Keep a hand with a giant: OP17-089 Saul at 4 or OP17-119 Loki at 6. Nothing else in the deck reads its full printed power without one, and both thresholds are switched on by the same body.",
    "Failing a giant, keep a card that finds one: OP17-080 Usopp and OP17-089 Saul both look at 3 and reveal an {Elbaph} card, OP17-086 Nami trades an {Elbaph} card for two draws, and OP17-082 Sanji draws 2 and trashes 2 -- which also fills the trash that OP15-088 and OP17-093 recur from.",
    "A hand of only 2-drops is a mulligan. They are 2000-power bodies until a giant arrives, and this deck has no other way to make them bigger.",
  ],
  priorities: [
    "Order the turn giant-first. A 2-drop played before the giant and a 2-drop played after it are the same card at 2000 and at 6000 power, so within-turn sequencing decides more here than card choice does.",
    "The two clauses read different boards. 'There is a Character with a cost of 12 or more' scans both sides, so an opposing giant switches the Elbaph half on for free -- but the Leader's aura reads 'if you have', and only ever counts your own board. Removing their giant can therefore cost you your own buffs while leaving the aura untouched.",
    "Protect the giant with Counter cards ahead of anything else on the board, including the Leader at high Life. It is the one card whose removal takes the whole team's power down with it.",
    "OP15-094 Roronoa Zoro is a singleton [Blocker] that can trash itself instead of letting your opponent's effect remove another {Straw Hat Crew} Character -- but not itself, and not a giant (Saul and Loki carry no {Straw Hat Crew} type). OP17-095 Zoro's replacement is the one that covers any Character, paid by burying 3 cards from the trash.",
    "OP15-088 Pirates Docking Six is a 5-cost that sits at 11, one short of the threshold, and its [On Play] mills 3 to return a cost-2-or-less {Straw Hat Crew} body. Pay that cost freely: a deck this reliant on its trash for OP17-093 and OP17-095 wants cards there.",
    "Hold OP04-016 Bad Manners Kick Course for the opponent's turn. It is the deck's only red card and its only free [Counter] -- trash a card for +3000 during a battle -- and its [Trigger] gives an opposing card −3000 for the turn when it comes off Life instead.",
    "Not every OP17 giant is an enabler under this Leader. OP17-081 Gerd and OP17-094 Rodo gate their +12 cost on 'if your Leader has the {Elbaph} type', and Sabo is {Dressrosa} {Revolutionary Army} -- under him they are a vanilla 2-drop and a vanilla 1-drop. OP17-085 Dorry and OP17-092 Brogy do get their +12, but the [On Play] that fetches the other half is Elbaph-Leader-gated too. Only OP17-089 and OP17-119 do the job here.",
  ],
  commonVariants: [
    "The flex band is the 2-drop mix and the giant count. A widely-shared top-placing OP17 list keeps this deck's core (OP17-080/087/089/093/095/098/119 and OP04-016) and spends the remaining slots on OP17-081, OP17-083, OP17-096 and OP13-120 instead of going four-wide on the giants and OP15-088. That list also runs a red splash of OP01-016 Nami and ST01-011 Brook, which are Block 1 and therefore Extra-only since April 2026; this list plays OP17-082 Sanji and OP17-091 Brook in those slots instead.",
    "The other build of this Leader is the Revolutionary Army list it shipped with (ST-35 plus OP12/OP13 support), which reaches the cost-8 clause through {Revolutionary Army} cost-raising cards rather than through Elbaph giants. Expect either when the Leader is OP13-004.",
    "Pre-release for the OP-17 half, so counts should be expected to move once tournament data accumulates.",
  ],
  commonCombos: [
    "Saul (printed 4) alone on the board: every 2-drop becomes 5000, the Leader's aura turns on with one attached DON!!, and both of the deck's thresholds are met by one card.",
    "A giant plus OP17-091 Brook: the giant makes Brook a 6000 body and switches on its [On Play], which strips a card from the opponent's hand -- the same clause that is blank without a giant out.",
    "OP17-119 Loki lands at cost 18 with 8000 power, +3000 more on the opponent's turn, and an [On Play] that K.O.s opposing Characters totalling 4 cost or less.",
    "OP17-093 Monkey.D.Luffy with a giant out: an 8-cost 8000 [Rush] body that draws a card and replays a cost-2-or-less Character out of the trash as it arrives.",
    "OP17-098 with a giant out and 6 DON!! to rest: a two-for-one on the opponent's cheap board, which is where most decks' Blockers live.",
  ],
  keyCardNumbers: [
    "OP13-004",
    "OP17-089",
    "OP17-119",
    "OP17-093",
    "OP17-082",
    "OP17-098",
  ],
  counterplay: [
    "Cost-ceiling removal is close to dead against the giants -- they are at 16 and 18 on the field -- so answer them with power-based combat or with effects that read power rather than cost.",
    "Remove the giant, not the buffed bodies. One removal takes +3000 off three or four Characters, +1000 off the whole team, and [Rush] off the 8-drop. Note the two protections first: OP17-095 Zoro buries 3 from the trash to cancel one removal, and OP15-094 Zoro trashes itself to cancel one aimed at a {Straw Hat Crew} Character.",
    "Attack early and force Life down slowly rather than quickly. The Leader is only a 4000 body while it holds 4 or more Life, and every Life card it loses makes it bigger -- so a fast clock that stops short is worse than no clock at all.",
    "Deny the [DON!! x1] half where you can. With no DON!! attached to the Leader the aura does not exist, which is a full +1000 off every body on their side.",
  ],
  sources: [
    {
      url: "https://gumgum.gg/one-piece/decklists/deck/east/op17/1596817e-9bf6-4938-9bc1-c8947cd85d9f",
      retrievedAt: "2026-08-26",
      note: "Top-placing OP17 Red/Black Sabo list, corroborating this deck's Leader and OP17 core; source for the variant band above, including the red splash this list replaces on rotation grounds.",
    },
    {
      url: "https://onepiece.gg/red-black-sabo-guide/",
      retrievedAt: "2026-08-26",
      note: "Leader guide for OP13-004: the -1000-at-4-Life reading, spending Life for hand, and prioritising a cost-8 body before committing to attacks.",
    },
    {
      url: "https://www.youtube.com/watch?v=pW0WQAHiZyk",
      retrievedAt: "2026-08-26",
      note: "OP17 Elbaph Sabo deck guide and gameplay; the archetype's own account of why the Elbaph shell is preferred to the Revolutionary Army build.",
    },
  ],
};

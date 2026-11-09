import type { DeckStrategyDossier } from "./types.js";

/**
 * The CDMX Regional 2nd-place Luffy & Ace list, under the ST-30 starter's
 * Leader. The Leader lines are the same two clauses `st30.ts` reads, applied
 * to a {Straw Hat Crew} shell rather than the precon's 6000-power tribe.
 */
export const st30LuffyAceCdmxDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Red/Green) Luffy & Ace - 2nd Place CDMX Regional 2026-09-19",
  archetype:
    "Red/Green Luffy & Ace Straw Hat rush: [Monkey.D.Luffy] bodies that attack the turn they land and wall at 9000 on the opponent's turn, found by twenty 1-cost looks at the top of the deck, with a hand of Counter Events behind them.",
  gamePlan: [
    "The Leader has two clauses. It loses 2000 power while you control a Character with 7000 base power or more -- nothing in this list is one, so the Leader attacks at 6000 all game. And on your opponent's turn every [Portgas.D.Ace] and [Monkey.D.Luffy] card you have gains +3000.",
    "The second clause is the deck. Twelve of the fifty are [Monkey.D.Luffy] (four each of ST21-014, ST30-012 and OP12-015), so on the opponent's turn a 6000 body is a 9000 without a card spent on it. That is why this deck can attack with everything and still be hard to attack back into.",
    "The Leader is named Luffy & Ace, not [Monkey.D.Luffy], so it does not buff itself, and this list plays no [Portgas.D.Ace]. The Leader is the thing that attacks; the Luffy bodies are the thing that walls.",
    "On offence it is a rush deck. ST21-014 has [Rush] and gives a rested DON!! when it attacks; ST30-012 buys [Rush] for one rested DON!! and rests an opposing [Blocker] as it swings. ST31-001 Sanji draws and plays a second {Straw Hat Crew} body from hand.",
    "Eighteen of the fifty are Events. OP14-019 is a 1-cost [Main] look at four for a {Straw Hat Crew} or {Supernovas} Character; every other Event is a Counter. OP04-016, OP17-017, OP12-018 and OP06-017 defend a battle; OP13-040 and OP12-037 are Green rest-locks whose other half gives the Leader +3000 as a Counter. The list plays no removal: the board is answered by attacking it or by holding it rested.",
  ],
  mulligan: [
    "Keep any hand with a 1-cost searcher: OP01-016 Nami, EB02-017 Nami, EB04-002 Jewelry Bonney, ST31-005 Thousand Sunny or OP14-019. Each looks four or five deep, and they fit beside the turn's real play.",
    "Throw back a hand of only 4- and 5-cost bodies with no searcher and no Event. The deck has no ramp; a hand that does nothing before turn 4 loses the race it is built to win.",
  ],
  priorities: [
    "Never play a Character with 7000 or more base power. Nothing in this list is one, but the Leader drops to 4000 while such a body stands.",
    "Attacking with a Luffy trades a 9000 wall for one hit of pressure: a rested Character can be attacked and an active one cannot. Swing with them when the race says to, not by default.",
    "ST30-012's [On Play] rests one DON!! for [Rush]. Pay it when there is an attack worth making this turn; a 6000 body that waits is a 9000 wall on the opponent's turn either way.",
    "ST30-012's [When Attacking] rests one of the opponent's [Blocker] Characters for the whole turn, so when you plan to attack more than once, declare ST30-012 first.",
    "ST21-014's [When Attacking] gives a rested DON!! to a card: power for the rest of the turn, and DON!! banked for next turn. Point it at the attacker still to come.",
    "OP12-015's [On Play] reveals two Events from hand -- they stay in hand and still Counter -- to play a red Character with 3000 power or less and give a rested DON!!. The targets are OP01-016 Nami and EB04-002 Bonney, so read it as a dead searcher in hand turned into a body plus a DON!!. OP12-015 is 4000 printed and +2000 while you have two or more given DON!!, counted across your whole field.",
    "OP14-019 spends the turn's first DON!! on a card rather than a body. Cast it when the hand has no Character to play, or beside a 4-cost on a 5-DON!! turn.",
    "OP12-018 is +2000 to one of your Characters, then may rest a DON!! to give the opponent's Leader and all of their Characters −1000 for the turn. Cast it on their turn when the −1000 also blunts the attacks still to come.",
    "OP17-017 is +2000 to your Leader or a {Whitebeard Pirates} Character and −2000 to an opposing Leader or Character for the turn. Your Leader is {Whitebeard Pirates}, so it always has a target; put the −2000 on an attacker still to come.",
    "OP06-017 costs a Life card for +3000. Spend it when the Life card was going to be taken anyway, not while the race is even.",
    "OP13-040 and OP12-037 cost rested DON!! in the Main phase. OP13-040 keeps two rested opposing Characters rested through their next refresh; OP12-037 rests two of their Characters or DON!!. Cast them after your attacks have rested what you want held, and keep them in hand as Leader Counters otherwise.",
    "ST31-001 Sanji is a 3000 for 5, a bad rate read alone; you are buying the draw and the free {Straw Hat Crew} body of cost 5 or less out of hand. With two DON!! given it also has [Rush].",
    "ST31-005 Thousand Sunny's [Activate: Main] rests itself to give a rested DON!! to a [Monkey.D.Luffy] every turn. Use it after deciding the turn's attacks, on the Luffy that swings next.",
  ],
  commonVariants: [
    '"(Red/Green) Luffy & Ace - Open OPTCG" is the same shell with one ST21-003 Sanji and one ST21-017 Gum-Gum Mole Pistol where this list plays OP12-018, and only two OP14-019. Expect one removal and a Blocker-silencer from it.',
    "The ST-30 starter under the same Leader is a different deck: it plays [Portgas.D.Ace] Characters for the other half of the +3000 clause and searches 6000-power bodies. Against it expect Ace, Newgate's +1000 and Blockers that come back.",
    "Other OP-17 lists under this Leader run P-135 Monkey.D.Luffy as a [Blocker], OP06-018 or OP15-032 in the flex slots.",
  ],
  commonCombos: [
    "ST30-012 attacks first, resting their [Blocker], then everything else attacks into a board with nothing left to block.",
    "ST31-001 Sanji into a 5-cost {Straw Hat Crew} body from hand -- ST21-014 attacks the turn it lands -- so one card is two bodies, a draw and an attack.",
    "OP12-015 revealing two Counter Events to drop OP01-016 or EB04-002 from hand: a body, a search and a DON!!, with both Events still in hand.",
    "End the turn with active [Monkey.D.Luffy] bodies at 9000. Each costs the opponent two cards to remove, or is not attacked.",
    "OP12-018 on the first attack of their turn: −1000 on every attacker that follows.",
  ],
  keyCardNumbers: [
    "ST30-001",
    "ST21-014",
    "ST30-012",
    "OP12-015",
    "ST31-001",
    "ST31-005",
    "OP14-019",
    "OP17-017",
    "OP12-018",
  ],
  counterplay: [
    "The +3000 is name-gated. Removal aimed at the [Monkey.D.Luffy] bodies takes the wall away; the Namis, Bonney and Sanji are 2000s and 3000s the clause never touches.",
    "The Leader is 6000 with no defensive text of its own. Attacking the Leader is better than trading on the board, because the board is where the deck's power is.",
    "The list has no removal. A big body that survives their attacks stays; only the rest-locks hold it, and only for a turn.",
    "A [Blocker] is worth less here than usual: ST30-012 rests one each turn. Two Blockers, or a Blocker plus a way to punish the attack, is what holds a turn.",
    "Their Characters print little Counter, so their defence is the Events in hand. Attacks that force two Counter cards instead of one drain the deck fast.",
  ],
  sources: [
    {
      url: "https://onepiecetopdecks.com/deck-list/english-op17-deck-list-the-worlds-strongest-warriors/",
      retrievedAt: "2026-10-17",
      note: 'The deck\'s own 50: entry "Ace and Luffy", the list pilot "Eduardo De La O" took to 2nd at the CDMX Regional in Mexico on 19 Sep 2026; the same page lists the Top 16 build with OP15-032 and OP06-018 in the variants line.',
    },
    {
      url: "https://gumgum.gg/one-piece/decklists/deck/east/op17/31009b3e-872b-47e8-ae24-6e285d2b8f72",
      retrievedAt: "2026-09-26",
      note: "An OP-17 Standard Battle first place under ST30-001, the source for the P-135 variant above.",
    },
    {
      url: "https://en.onepiece-cardgame.com/cardlist/?series=569030",
      retrievedAt: "2026-08-26",
      note: "Bandai's English ST-30 cardlist: the primary source for ST30-001's and ST30-012's printed text.",
    },
  ],
};

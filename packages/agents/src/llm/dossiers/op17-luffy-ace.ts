import type { DeckStrategyDossier } from "./types.js";

/**
 * The OP-17 field's Luffy & Ace list, under the ST-30 starter's Leader. Every
 * line is read off the sixteen identities in the list; the Leader lines are
 * the same two clauses `st30.ts` reads, applied to a {Straw Hat Crew} shell
 * rather than the precon's 6000-power tribe.
 */
export const op17LuffyAceDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Red/Green) Luffy & Ace - Open OPTCG",
  archetype:
    "OP-17 Red/Green Luffy & Ace Straw Hat rush: [Monkey.D.Luffy] bodies that attack the turn they land and wall at 9000 on the opponent's turn, found by sixteen 1-cost searches",
  gamePlan: [
    "The Leader has two clauses. It gives itself -2000 power while you control a Character with 7000 base power or more -- nothing in this list is one, so the Leader attacks at 6000 all game. And on your opponent's turn every [Portgas.D.Ace] and [Monkey.D.Luffy] card you have gains +3000.",
    "The second clause is the deck. Twelve of the fifty are [Monkey.D.Luffy] (four each of ST21-014, ST30-012 and OP12-015), so on the opponent's turn a 6000 body is a 9000 without a card spent on it. That is why this deck can attack with everything and still be hard to attack back into.",
    "The Leader is named Luffy & Ace, not [Monkey.D.Luffy], so it does not buff itself, and this list plays no [Portgas.D.Ace]. The Leader is the thing that attacks; the Luffy bodies are the thing that walls.",
    "On offence it is a rush deck. ST21-014 has [Rush] and gives a rested DON!! when it attacks; ST30-012 buys [Rush] for one rested DON!! and rests an opposing [Blocker] as it swings. ST31-001 Sanji draws and plays a second {Straw Hat Crew} body from hand, and ST21-003 Sanji takes [Blocker] away from one of your 6000-or-more bodies' attacks for the turn.",
    "Seventeen of the fifty are Events and they are the defence: OP04-016, OP17-017 and OP06-017 are Counters, OP13-040 and OP12-037 are Green rest-locks whose other half gives the Leader +3000 as a Counter, and one ST21-017 is the removal. The Luffy bodies print no Counter, so the Events are what the hand defends with.",
  ],
  mulligan: [
    "Keep any hand with a 1-cost searcher: OP01-016 Nami, EB02-017 Nami, EB04-002 Jewelry Bonney or ST31-005 Thousand Sunny. There are sixteen, they fit beside the turn's real play, and each looks four or five deep for a {Straw Hat Crew} card.",
    "OP14-019 is a searcher too, for a {Supernovas} or {Straw Hat Crew} Character, but it is a [Main] Event that spends the turn's first DON!! on a card rather than a body.",
    "Throw back a hand of only 4- and 5-cost bodies with no searcher and no Event. The deck has no ramp; a hand that does nothing before turn 4 loses the race it is built to win.",
  ],
  priorities: [
    "Never play a Character with 7000 or more base power. Nothing in this list is one, but the Leader drops to 4000 while such a body stands, which is an attack's worth of Counter demand given up every turn.",
    "Attacking with a Luffy trades a 9000 wall for one hit of pressure: a rested Character can be attacked and an active one cannot. Swing with them when the race says to, not by default.",
    "ST30-012's [On Play] rests one DON!! for [Rush]. Pay it when there is an attack worth making this turn; a 6000 body that waits is a 9000 wall on the opponent's turn either way.",
    "ST30-012's [When Attacking] rests one of the opponent's [Blocker] Characters for the whole turn, so when you plan to attack more than once, declare ST30-012 first.",
    "ST21-003 Sanji's [On Play] picks one of your {Straw Hat Crew} Characters with 6000 power or more, and if it attacks this turn the opponent cannot use [Blocker]. Play it on a turn that body is going to swing, and point it at the attack the opponent most wants to block.",
    "ST21-014's [When Attacking] gives a rested DON!! to a card: power for the rest of the turn, and DON!! banked for next turn. Point it at the attacker still to come.",
    "OP12-015's [On Play] reveals two Events from hand -- they stay in hand and still Counter -- to play a red Character with 3000 power or less and give a rested DON!!. The targets are the 1-cost searchers and ST21-003, so read it as a dead searcher in hand turned into a body plus a DON!!. OP12-015 is 4000 printed and +2000 while you have two or more given DON!!, counted across your whole field.",
    "OP17-017 is +2000 to your Leader or a {Whitebeard Pirates} Character and -2000 to an opposing Leader or Character for the turn. Your Leader is {Whitebeard Pirates}, so it always has a target; put the -2000 on an attacker still to come.",
    "OP06-017 costs a Life card for +3000. Spend it when the Life card was going to be taken anyway, not while the race is even.",
    "OP13-040 and OP12-037 cost rested DON!! in the Main phase. OP13-040 keeps two rested opposing Characters rested through their next refresh; OP12-037 rests two of their Characters or DON!!. Cast them after your attacks have rested what you want held, and keep them in hand as Leader Counters otherwise.",
    "ST21-017 is -5000 to an opposing Character, then, if you have a 6000-power Character, a K.O. on one at 2000 power or less. Aim both halves at the same body and it K.O.s anything up to 7000.",
    "ST31-001 Sanji is a 3000 for 5, which is a bad rate read alone; you are buying the draw and the free {Straw Hat Crew} body of cost 5 or less out of hand. With two DON!! given it also has [Rush].",
    "ST31-005 Thousand Sunny's [Activate: Main] rests itself to give a rested DON!! to a [Monkey.D.Luffy] every turn. Use it after deciding the turn's attacks, on the Luffy that swings next.",
  ],
  commonVariants: [
    "The ST-30 starter under the same Leader is a different deck: it plays [Portgas.D.Ace] Characters for the other half of the +3000 clause and searches 6000-power bodies. This list drops that for {Straw Hat Crew}; against the starter expect Ace, Newgate's +1000 and Blockers that come back.",
    "Other OP-17 lists under this Leader run P-135 Monkey.D.Luffy as a [Blocker] and OP12-018 as a free Counter, and four ST21-017 where this runs one. Against them expect more removal and one more wall.",
  ],
  commonCombos: [
    "ST30-012 attacks first, resting their [Blocker], then everything else attacks into a board with nothing left to block.",
    "ST21-003 Sanji on the body that attacks after ST30-012: two Blockers taken out of the turn, one by each.",
    "ST21-017's two halves on the same target: -5000 puts a 7000 at 2000, and the second half K.O.s it.",
    "ST31-001 Sanji into a 5-cost {Straw Hat Crew} body from hand -- ST21-014 attacks the turn it lands -- so one card is two bodies, a draw and an attack.",
    "End the turn with active [Monkey.D.Luffy] bodies at 9000. Each costs the opponent two cards to remove, or is not attacked.",
  ],
  keyCardNumbers: [
    "ST30-001",
    "ST21-014",
    "ST30-012",
    "OP12-015",
    "ST31-001",
    "ST31-005",
    "ST21-003",
    "OP17-017",
    "ST21-017",
  ],
  counterplay: [
    "The +3000 is name-gated. Removal aimed at the [Monkey.D.Luffy] bodies takes the wall away; the Namis, Bonney and Sanjis are 2000s and 3000s the clause never touches.",
    "The Leader is 6000 with no defensive text of its own. Attacking the Leader is better than trading on the board, because the board is where the deck's power is.",
    "A [Blocker] is worth less here than usual: ST30-012 and ST21-003 each take one out of a turn. Two Blockers, or a Blocker plus a way to punish the attack, is what holds a turn.",
    "Their Characters print little Counter, so their defence is the Events in hand. Attacks that force two Counter cards instead of one drain the deck fast.",
  ],
  sources: [
    {
      url: "https://gumgum.gg/one-piece/decklists/deck/east/op17/31009b3e-872b-47e8-ae24-6e285d2b8f72",
      retrievedAt: "2026-09-26",
      note: "An OP-17 Standard Battle first place under ST30-001, sharing thirteen of this list's sixteen identities; the source for the P-135 and OP12-018 variant above.",
    },
    {
      url: "https://en.onepiece-cardgame.com/cardlist/?series=569030",
      retrievedAt: "2026-08-26",
      note: "Bandai's English ST-30 cardlist: the primary source for ST30-001's and ST30-012's printed text.",
    },
  ],
};

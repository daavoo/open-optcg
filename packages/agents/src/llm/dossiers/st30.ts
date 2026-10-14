import type { DeckStrategyDossier } from "./types.js";

/**
 * ST-30 is a precon, so both sources below are the product itself and every
 * line here is read off the seventeen cards. The instruction that matters most
 * -- that "Character with 6000 base power" is this deck's tribe, and that a
 * bigger body is a downgrade -- is a statement about this fifty rather than
 * about the Leader.
 */
export const st30Dossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Red/Green) Luffy & Ace - Starter Deck 30",
  archetype:
    "ST-30 Red/Green Impel Down: a deck whose tribe is a number -- nine of its identities read 'Character with 6000 base power', and its Leader punishes it for playing anything bigger",
  gamePlan: [
    "Treat 6000 base power as the deck's type line. ST30-003 buffs it, ST30-014 hands it DON!!, ST30-002 and ST30-017 search for it, ST30-006 and ST30-008 pay it as a cost, ST30-009 and ST30-011 protect it, and ST30-015 counts it. Almost every decision in the deck is 'does this keep a 6000-power body on the board'.",
    "Do not play a Character with 7000 base power or more. ST30-001 gives itself -2000 power while you control one, so a bigger body costs you 2000 on the Leader every turn it stands -- your curve is capped from above, which is the opposite of how most decks read power.",
    "Defend with the Leader clause rather than with your hand. On your opponent's turn all of your [Portgas.D.Ace] and [Monkey.D.Luffy] cards gain +3000, so ST30-007, ST30-012 and the Leader itself are much harder to attack into than their printed numbers suggest. Count that before spending a [Counter].",
    "Use the DON!! rest on ST30-007 and ST30-012 to attack the turn they land. Both buy [Rush] for one rested DON!!, and both have a [When Attacking] clause that only pays if they attack -- Ace shrinks a body by 1000, Luffy rests a [Blocker] -- so the DON!! buys two things at once.",
    "Close through ST30-003 Edward.Newgate. On your turn it makes every 6000-base body a 7000, which is what turns a board of identical Characters into attacks that beat the format's common defensive numbers. It does not raise *base* power, so it does not switch on your own Leader's -2000.",
  ],
  mulligan: [
    "Keep a hand with ST30-002 Inazuma or ST30-017: both look at five cards for a 6000-power Character, which is what makes the rest of the deck's costs payable.",
    "Keep two 6000-power Characters over one plus an Event. ST30-004, ST30-006 and ST30-008 all pay a 6000-power card out of hand, so a second copy in hand is a cost as well as a play.",
    "Ship a hand built around ST30-003 alone. It buffs a board you do not have yet, and at 8 cost it is the card you are least often able to cast.",
  ],
  priorities: [
    "ST30-014 Mr.3(Galdino) rests itself to give up to two 6000-base Characters two rested DON!! each. That is four DON!! of power spread across two attackers for one activation; use it after you have decided your attacks, not before, because the DON!! it gives is rested and cannot pay a cost.",
    "ST30-008 Marco replays itself out of the trash for a 6000-power card from hand, and it comes back rested. That makes trading it away cheap, so block with it earlier than its printed 6000 would suggest.",
    "ST30-009 LittleOars Jr. and ST30-011 Buggy answer the same thing -- your 6000-base body being removed by an effect -- and they answer it differently. LittleOars Jr. trades itself for a draw; Buggy rests instead of dying, keeping the body. Spend Buggy's replacement on the Character you still need, and LittleOars Jr.'s on one you do not.",
    "ST30-010 Crocodile keeps one of your opponent's rested Characters from becoming active. Point it at their best attacker on a turn they are tapped out, not at a [Blocker]: a [Blocker] they cannot untap is one they were not going to use on your turn anyway.",
    "ST30-015 needs two 6000-base Characters on your board before it gives +4000. Count the board before you plan a defence around it -- with one body it is a dead card, which is why the deck wants width rather than height.",
    "ST30-016 draws only if you control both a [Portgas.D.Ace] and a [Monkey.D.Luffy] Character with 6000 base power. Without both it is a plain +3000, which is still worth casting; the draw is a bonus to sequence toward, not a condition to wait for.",
  ],
  commonVariants: [
    "This is the sealed product, unchanged. Tournament lists on this Leader keep the 6000-power shell and cut the vanillas -- ST30-005 Jozu and ST30-013 Mr.2.Bon.Kurei -- for more [Rush] threats and more searching, but no build plays a 7000-base body, because the Leader's own -2000 is printed against it.",
  ],
  commonCombos: [
    "ST30-007 or ST30-012 rests a DON!! for [Rush]; ST30-014 then gives that same body two more rested DON!!, so it lands and attacks at 8000 or more on the turn it is played.",
    "ST30-003 and ST30-015 stack on the same board: every 6000-base body is a 7000 on your turn, and any of them can be a 10000 in a battle on your opponent's.",
    "ST30-006 Jinbe trashes a 6000-power card to draw two, and ST30-008 Marco spends a 6000-power card to return itself from the trash -- the same card type is the deck's currency at both ends.",
    "ST30-002 and ST30-017 are the same search at two speeds, and ST30-017's [Trigger] activates its own [Main] effect, so it is a card the deck is happy to lose off the top of its Life.",
  ],
  keyCardNumbers: [
    "ST30-001",
    "ST30-003",
    "ST30-007",
    "ST30-008",
    "ST30-012",
    "ST30-014",
  ],
  counterplay: [
    "Remove ST30-003 Edward.Newgate before trading with the board. Without it every one of their bodies is a 6000, and most formats' common attackers beat a 6000 cleanly.",
    "Attack their [Portgas.D.Ace] and [Monkey.D.Luffy] Characters on your own turn, never leave them to be attacked on theirs: the Leader's +3000 applies only during their opponent's turn, so those bodies defend at 9000 and attack at 6000.",
    "Make them play a big body, or play around the fact that they cannot. Nothing in their deck answers a 10000-power Character in a battle except a [Counter] Event, because their own Leader stops them from fielding one.",
    "Spend removal on the bodies their replacements cannot save. ST30-009 and ST30-011 both read 'Character with 6000 base power', so a 1-cost or 2-cost body of theirs -- Inazuma, Ivankov, Buggy itself -- dies to an effect with nothing to say about it.",
    "Count ST30-015 before attacking into two or more of their 6000-base Characters; with two on board any of their cards can gain +4000 in the battle.",
  ],
  sources: [
    {
      url: "https://en.onepiece-cardgame.com/cardlist/?series=569030",
      retrievedAt: "2026-09-19",
      note: "Bandai's own ST-30 card list: the seventeen identities the product contains, with the printed text every line above is read from.",
    },
    {
      url: "https://deckbuilder.egmanevents.com/api/gamedata/optcg",
      retrievedAt: "2026-09-19",
      note: "The ST30 entry in the structure-deck list, which is where the per-slot counts in the manifest come from -- 50 main-deck cards behind ST30-001.",
    },
  ],
};

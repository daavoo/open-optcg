import type { DeckStrategyDossier } from "./types.js";

/**
 * ST-23 is a precon, so there is no tournament write-up to cite: the sources
 * below are the product itself and the published list of its contents, and
 * every line here is read off the fifteen cards.
 *
 * The thing this dossier exists to say is that the deck's power cuts are its
 * attacks. Its bodies are 5000-to-7000 and the Leader it meets is 5000, so a
 * cut timed before the swing is what turns a traded battle into a hit.
 */
export const st23Dossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Red) Shanks - Starter Deck 23",
  archetype:
    "ST-23 Red Red-Haired Pirates: a curve of 3-to-5-cost bodies that wins its battles with power cuts, topped by a 10000 Shanks that buffs the Leader",
  gamePlan: [
    "Curve out with the 3-and-4-cost Red-Haired Pirates Characters -- OP09-011 Hongo, OP09-012 Monster, OP09-014 Limejuice, OP09-010 Bonk Punch, OP09-015 Lucky.Roux, OP09-016 Rockstar -- and attack every turn.",
    "Cut the defender before you swing: OP09-011 Hongo rests itself for −2000 on an opposing Character, ST23-004 Luffy rests a DON!! and itself for −1000, and OP09-013 Yasopp's [When Attacking] cuts −1000. A 5000 body attacking a 6000 Character after a −2000 wins the battle.",
    "On the opponent's turn the Leader cuts an attacker or their Leader by 1000 once, when they attack. Use it on the attack that would otherwise get through.",
    "OP09-020 looks five deep for a Red-Haired Pirates card. Cast it early for whatever the curve is missing.",
    "ST23-002 Shanks is the top end: a 10000 body whose [On Play] gives your Red-Haired Leader +2000 through the opponent's next turn. It costs 3 less while the opponent has an 8000 base-power Character, and once it is on the board ST23-001 Uta costs 4 less.",
  ],
  mulligan: [
    "Keep a hand with a 3-or-4-cost Character, or with OP09-020, which finds one. That slot carries the deck's attacks on turns three and four.",
    "Ship a hand whose only cheap cards are the 1-cost ST23-004 Luffy and ST23-005 Yasopp: their text helps a board, but neither is one.",
  ],
  priorities: [
    "Play OP09-010 Bonk Punch with OP09-012 Monster in hand: its [On Play] puts Monster onto the board for free, and Monster then protects Bonk Punch from effect K.O.s by trashing itself instead.",
    "OP09-014 Limejuice's [On Play] stops one 4000-or-less Blocker from blocking this turn. Play it on the turn you attack into a board that has one.",
    "OP09-015 Lucky.Roux is a Blocker whose [On K.O.] removes an opposing Character with 6000 base power or less. Block with it when it would be K.O.'d anyway; the trade is two-for-one.",
    "ST23-005 Yasopp hands out a rested DON!! once a turn. Give it to the attacker that needs +1000 to win its battle, or to OP09-010 Bonk Punch for its [DON!! x1] +2000.",
    "ST23-003 Benn.Beckman trades a card from hand for a K.O. on a 4000 base-power or smaller Character. Spend a card you cannot use this game.",
  ],
  commonVariants: [
    "This is the sealed product, unchanged. Red Shanks lists built from boosters keep the Red-Haired Pirates power-cut package and add OP-09's higher-rarity Red-Haired cards in place of the vanilla OP09-006 Howling Gab and OP09-016 Rockstar.",
  ],
  commonCombos: [
    "OP09-010 Bonk Punch with OP09-012 Monster in hand: two bodies for four DON!!.",
    "A power cut before the attack: Hongo or ST23-004 Luffy on the defender, then the swing.",
    "ST23-002 Shanks then ST23-001 Uta: Shanks is 10000, so Uta costs 4 less the same turn or the next.",
  ],
  keyCardNumbers: ["OP09-001", "OP09-011", "OP09-013", "OP09-015", "ST23-002"],
  counterplay: [
    "Their Leader cuts your attacker or Leader by 1000 once each of your turns, when you attack. Lead with the attack you can afford to lose.",
    "Count OP09-015 Lucky.Roux as a removal spell when you attack it: its [On K.O.] takes a 6000 base-power or smaller Character with it.",
    "OP09-012 Monster trashes itself to save OP09-010 Bonk Punch from an effect K.O.: remove Monster first, or attack Bonk Punch instead.",
  ],
  sources: [
    {
      url: "https://en.onepiece-cardgame.com/cardlist/?series=569023",
      retrievedAt: "2026-10-12",
      note: "Bandai's own ST-23 card list: the fifteen identities the product contains, with the printed text every line above is read from.",
    },
    {
      url: "https://deckbuilder.egmanevents.com/api/gamedata/optcg",
      retrievedAt: "2026-08-22",
      note: "The ST23 entry in the structure-deck list, which is where the per-slot counts in the manifest come from -- 50 main-deck cards behind OP09-001.",
    },
  ],
};

import type { DeckManifest } from "./index.js";

/**
 * ST-23 "Shanks", Bandai's Red Red-Haired Pirates starter deck, exactly as
 * sold.
 *
 * Source: Bandai's own card list for the product
 * (https://en.onepiece-cardgame.com/cardlist/?series=569023), which is the 15
 * identities below and nothing else, and the per-slot counts from the
 * structure-deck list in the egman secondary source the audit already reads
 * (the ST23 entry: 50 main-deck cards behind OP09-001). Both are in the
 * 2026-08-22 reference snapshot.
 *
 * Unlike ST31-36 this is not part of the format `generated.ts` is built from,
 * so it is a hand-authored manifest. The Leader and nine slots are OP-09
 * reprints the OP-09 set pass stamps, ST23-004 arrived with the ST-31 list,
 * and the four other ST23 cards come in through the audit's community pass.
 *
 * ## What the deck does
 *
 * A Red Red-Haired Pirates curve of 3-to-5-cost bodies that wins battles with
 * power cuts: the Leader cuts an opposing card once a turn when the opponent
 * attacks, and OP09-011 Hongo, OP09-013 Yasopp and ST23-004 Luffy cut on the
 * deck's own turn, so a 5000 or 6000 attacker reaches a Leader the turn it
 * swings. OP09-020 searches five deep for a Red-Haired card, ST23-005 Yasopp
 * hands out a rested DON!!, and the top end is ST23-002 Shanks (a 10000 that
 * also buffs the Leader) and ST23-001 Uta, cheap once a 10000 is out.
 */
export const st23ShanksManifest: DeckManifest = {
  id: "(Red) Shanks - Starter Deck 23",
  leader: "OP09-001",
  cards: {
    "OP09-006": 4,
    "OP09-010": 4,
    "OP09-011": 4,
    "OP09-012": 4,
    "OP09-013": 4,
    "OP09-014": 4,
    "OP09-015": 4,
    "OP09-016": 4,
    "OP09-020": 4,
    "ST23-001": 2,
    "ST23-002": 2,
    "ST23-003": 2,
    "ST23-004": 4,
    "ST23-005": 4,
  },
};

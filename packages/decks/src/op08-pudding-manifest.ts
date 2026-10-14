import type { DeckManifest } from "./index.js";

/**
 * OP-08 Purple/Yellow Charlotte Pudding, a {Big Mom Pirates} list built for
 * the OP-17 field.
 *
 * Source: supplied as a card list by the project maintainer on 28 Sep 2026,
 * without an event or pilot, which is why it ships as "- Open OPTCG" rather
 * than under a placing. Every identity is stamped from Bandai's cardlist pages
 * already, so the audit needs no entry for it.
 *
 * The Leader turns two Life cards face-up on each attack for a rested DON!!,
 * so the list is built to refill and reuse Life:
 *
 * - **The OP-17 yellow [Trigger] package** -- OP17-103 Katakuri, OP17-104 and
 *   OP17-114, each adding the top of the deck to Life on your turn, and each
 *   played for free when it is taken as damage.
 * - **Ramp on the purple side** -- ST34-002 Cracker, OP17-074 Yamato and
 *   OP11-067 Katakuri each add a rested DON!!, on top of the Leader's own.
 * - **OP17-112 Linlin**, which makes every 4000-base [Trigger] body an 8000 on
 *   your turn: OP17-107 Daifuku and the Sweet 3 Generals among them.
 * - **Diggers** -- ST34-003 Brulee, OP17-113 Streusen and OP07-077 all find a
 *   {Big Mom Pirates} card; OP17-109 Pudding draws three for a [Trigger] card.
 */
export const op08PuddingManifest: DeckManifest = {
  id: "(Purple/Yellow) Charlotte Pudding - Open OPTCG",
  format: "standard",
  leader: "OP08-058",
  cards: {
    "ST34-003": 1,
    "OP08-062": 4,
    "OP17-074": 3,
    "ST34-002": 3,
    "OP11-067": 2,
    "OP17-113": 4,
    "OP11-106": 4,
    "OP17-104": 3,
    "OP17-107": 3,
    "OP17-109": 4,
    "OP17-103": 4,
    "OP17-114": 4,
    "OP17-112": 4,
    "OP13-076": 1,
    "OP15-078": 4,
    "OP07-077": 2,
  },
};

import type { DeckManifest } from "./index.js";

/**
 * OP-17 Black Monkey.D.Luffy, a tournament build of the Elbaph giants deck.
 *
 * Source: supplied as a card list by the project maintainer on 26 Sep 2026,
 * without an event or pilot, which is why it ships as "- Open OPTCG" rather
 * than under a placing. It is not one of the Black Luffy placings on
 * onepiecetopdecks.com's OP-17 page or on opmetagame.com as of that date; the
 * nearest is Stefano Vinci's 1st place at the Bandai Regional in Utrecht
 * (7 Sep 2026), which shares the four-of core and the ST14-017 Stage and
 * differs in the flex slots -- no OP15-092, no OP17-096 or OP17-084, two
 * OP17-091 and two OP17-098. Every identity is stamped from Bandai's cardlist
 * pages already, so the audit needs no entry for it.
 *
 * Same Leader as `op17-luffy-manifest.ts`, so `op17-luffy-policy.ts` pilots it
 * unchanged. Where the two lists differ is what the tournament field moved the
 * deck toward:
 *
 * - **No Dorry or Brogy.** The feature deck's 5-cost pair fetch each other and
 *   then lock further Character plays for the turn; this list spends the eight
 *   slots on four-ofs of the cheap enablers (Rodo, Sanji) and on OP15-088.
 * - **4 OP15-088 Pirates Docking Six and 3 ST14-017 Thousand Sunny.** Docking
 *   Six prints "+6 cost" and sits at 11, one short of the threshold; the Stage
 *   gives every black {Straw Hat Crew} Character +1 cost, which makes it a
 *   12 -- a giant for every enabling clause and a [Blocker] under the Leader.
 *   The Leader carries {Straw Hat Crew}, so the Stage also draws a card.
 * - **1 OP15-092 Monkey.D.Luffy.** A 7-cost that becomes a 9000 at 17 cost
 *   once the trash holds 10 cards, which Docking Six's mill and Sanji's
 *   discard reach by the mid-game.
 * - **1 OP17-096**, down from 2, and **3 OP17-093**, down from 4.
 */
export const op17LuffyTournamentManifest: DeckManifest = {
  id: "(Black) Monkey.D.Luffy - Open OPTCG",
  format: "standard",
  leader: "OP17-079",
  cards: {
    "OP17-084": 2,
    "OP17-086": 4,
    "OP17-094": 4,
    "OP17-080": 4,
    "OP17-081": 4,
    "OP17-082": 4,
    "OP17-087": 4,
    "OP17-095": 4,
    "OP17-089": 4,
    "OP15-088": 4,
    "OP17-119": 4,
    "OP15-092": 1,
    "OP17-093": 3,
    "OP17-096": 1,
    "ST14-017": 3,
  },
};

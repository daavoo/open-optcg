import type { DeckManifest } from "./index.js";

/**
 * Blue Jinbe (OP14-040): the list pilot "dercan" took to 11th of 63 (4-2) at
 * [EGB] ChinoizeCup #120, an online event played on Wednesday 7 Oct 2026.
 *
 * Source: Limitless TCG's standings for that event,
 * https://play.limitlesstcg.com/tournament/6abcff56783097f8dcb74097/standings,
 * whose API carries the whole fifty as card counts, retrieved 2026-10-17. Every
 * identity is stamped from Bandai's cardlist pages already, so the audit needs
 * no entry for it.
 *
 * It is the Leader's `recommended` list: of the Jinbe builds in the learned
 * model's training pool it is the one that model wins most with against the
 * meta field. Same Leader as "(Blue) Jinbe - Official Feature Deck", so the
 * same rules policy pilots both.
 *
 * Against that list it adds 2 OP06-058 Gravity Blade Raging Tiger, 4 OP07-045
 * Jinbe, 2 OP07-057 Perfume Femur, 4 OP08-047 Jozu, 3 OP13-043 Otama, 2
 * OP17-046 Gloriosa, 3 OP17-049 Charlotte Linlin, 2 OP17-053 Barbell, 4
 * ST17-002 Trafalgar Law, 4 ST17-004 Boa Hancock. It drops 4 OP14-043 Aladine,
 * 4 OP14-045 Kuroobi, 4 OP14-047 Shirahoshi, 4 OP14-051 Hatchan, 4 OP14-054
 * Fisher Tiger, 4 OP14-055 The Macro Gang, 2 OP14-057 Don't Worry!! I'm Here!!,
 * 4 OP14-058 Ocean Current Shoulder Throw.
 *
 * Lives in its own module for the reason `op16-enel-manifest.ts` gives: so
 * `deck-provenance.ts` can read the list without importing `index.ts`.
 */
export const op14JinbeTournamentManifest: DeckManifest = {
  id: "(Blue) Jinbe - 11th Place ChinoizeCup #120",
  format: "standard",
  leader: "OP14-040",
  recommended: true,
  cards: {
    "OP06-058": 2,
    "OP07-045": 4,
    "OP07-057": 2,
    "OP08-047": 4,
    "OP13-043": 3,
    "OP14-042": 4,
    "OP14-046": 4,
    "OP14-049": 4,
    "OP14-050": 4,
    "OP14-056": 4,
    "OP17-046": 2,
    "OP17-049": 3,
    "OP17-053": 2,
    "ST17-002": 4,
    "ST17-004": 4,
  },
};

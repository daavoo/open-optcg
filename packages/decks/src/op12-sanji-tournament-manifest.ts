import type { DeckManifest } from "./index.js";

/**
 * Blue/Purple Sanji (OP12-041): the list pilot "Mister_Prince" registered for
 * [OP17] ChinoizeCup #116, an online event of 119 played on Tuesday 29 Sep
 * 2026; the pilot dropped at 0-2, so the list has no placing.
 *
 * Source: Limitless TCG's standings for that event,
 * https://play.limitlesstcg.com/tournament/6ab4e651e905c1db687493fe/standings,
 * whose API carries the whole fifty as card counts, retrieved 2026-10-17. Every
 * identity is stamped from Bandai's cardlist pages already, so the audit needs
 * no entry for it.
 *
 * It is the Leader's `recommended` list: of the Sanji builds in the learned
 * model's training pool it is the one that model wins most with against the
 * meta field. Same Leader as "(Blue/Purple) Sanji - Official Feature Deck", so
 * the same rules policy pilots both.
 *
 * Against that list it adds 1 EB01-039 Conquerer of Three Worlds Ragnaraku, 3
 * EB03-031 Vinsmoke Reiju, 4 EB04-029 I Heard the Sound...of a Lady's Teardrops
 * Falling, 4 EB04-041 Stealth Black, 2 OP06-058 Gravity Blade Raging Tiger, 4
 * OP07-064 Sanji, 2 OP11-061 Gum-Gum Jet Culverin, 3 OP13-043 Otama, 1 OP13-076
 * Divine Departure, 3 OP15-078 Mamaragan, 2 OP16-056 Mr.3(Galdino), 3 OP17-049
 * Charlotte Linlin. It drops 4 OP12-062 Vinsmoke Sora, 4 OP12-066 Carne, 4
 * OP12-071 Charlotte Pudding, 4 OP12-074 Patty, 4 OP12-063 Vinsmoke Reiju, 2
 * OP12-072 Zeff, 2 OP12-065 Emporio.Ivankov, 2 OP09-077 Gum-Gum Lightning, 4
 * OP12-078 Brochette Blow. It changes the count of OP12-059 Concasser 4 to 2.
 *
 * Lives in its own module for the reason `op16-enel-manifest.ts` gives: so
 * `deck-provenance.ts` can read the list without importing `index.ts`.
 */
export const op12SanjiTournamentManifest: DeckManifest = {
  id: "(Blue/Purple) Sanji - ChinoizeCup #116",
  format: "standard",
  leader: "OP12-041",
  recommended: true,
  cards: {
    "EB01-039": 1,
    "EB03-031": 3,
    "EB04-029": 4,
    "EB04-041": 4,
    "OP06-058": 2,
    "OP07-064": 4,
    "OP09-078": 4,
    "OP11-061": 2,
    "OP12-059": 2,
    "OP12-060": 4,
    "OP12-070": 4,
    "OP12-079": 4,
    "OP13-043": 3,
    "OP13-076": 1,
    "OP15-078": 3,
    "OP16-056": 2,
    "OP17-049": 3,
  },
};

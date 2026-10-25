import type { DeckManifest } from "./index.js";

/**
 * Black/Yellow Koala (OP12-081): the list pilot "Cudder04" took to 30th of 64
 * (2-4) at [OP17] ChinoizeCup #113, an online event played on Tuesday 22 Sep
 * 2026.
 *
 * Source: Limitless TCG's standings for that event,
 * https://play.limitlesstcg.com/tournament/6aab0e3ff1243e65f9802fec/standings,
 * whose API carries the whole fifty as card counts, retrieved 2026-10-17. Every
 * identity is stamped from Bandai's cardlist pages already, so the audit needs
 * no entry for it.
 *
 * It is the Leader's `recommended` list: of the Koala builds in the learned
 * model's training pool it is the one that model wins most with against the
 * meta field. Same Leader as "(Black/Yellow) Koala - Official Feature Deck", so
 * the same rules policy pilots both.
 *
 * Against that list it adds 4 EB03-042 Koala, 4 EB04-058 Borsalino, 2 OP06-115
 * You're the One Who Should Disappear., 4 OP09-108 Bartholomew Kuma, 4 OP12-112
 * Baby 5, 3 OP14-108 Silvers Rayleigh, 4 OP16-119 Marshall.D.Teach. It drops 4
 * OP12-090 Belo Betty, 4 OP12-095 Lindbergh, 4 OP12-083 Inazuma, 2 OP12-085
 * Karasu, 4 OP12-100 Sabo, 4 OP12-097 Captains Assembled. It changes the count
 * of OP12-087 Nico Robin 4 to 2, OP12-098 Hair Removal Fist 4 to 3.
 *
 * Lives in its own module for the reason `op16-enel-manifest.ts` gives: so
 * `deck-provenance.ts` can read the list without importing `index.ts`.
 */
export const op12KoalaTournamentManifest: DeckManifest = {
  id: "(Black/Yellow) Koala - 30th Place ChinoizeCup #113",
  format: "standard",
  leader: "OP12-081",
  recommended: true,
  cards: {
    "EB03-042": 4,
    "EB04-058": 4,
    "OP06-115": 2,
    "OP09-108": 4,
    "OP12-086": 4,
    "OP12-087": 2,
    "OP12-089": 4,
    "OP12-093": 4,
    "OP12-094": 4,
    "OP12-098": 3,
    "OP12-112": 4,
    "OP12-119": 4,
    "OP14-108": 3,
    "OP16-119": 4,
  },
};

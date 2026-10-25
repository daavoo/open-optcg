import type { DeckManifest } from "./index.js";

/**
 * Green Shanks (OP17-020): the list pilot "ShanksAlSole" took to 16th of 32
 * (2-3-1) at [OP17] Win a box | Rumble league #9, an online event played on 17
 * Sep 2026.
 *
 * Source: Limitless TCG's standings for that event,
 * https://play.limitlesstcg.com/tournament/6aa39894ab080c8c95800dcd/standings,
 * whose API carries the whole fifty as card counts, retrieved 2026-10-17. Every
 * identity is stamped from Bandai's cardlist pages already, so the audit needs
 * no entry for it.
 *
 * It is the Leader's `recommended` list: of the Shanks builds in the learned
 * model's training pool it is the one that model wins most with against the
 * meta field. Same Leader as "(Green) Shanks - Official Feature Deck", so the
 * same rules policy pilots both.
 *
 * Against that list it adds 2 OP08-036 Electrical Luna, 2 OP10-030 Smoker, 4
 * OP12-034 Perona, 4 OP15-035 Laboon. It drops 2 OP17-026 Fugar, 4 OP17-025
 * Building Snake, 2 OP17-024 Howling Gab, 2 ST16-004 Shanks, 2 ST24-004 Law &
 * Bepo, 4 OP17-037 Are You That Afraid of the New Era?!!. It changes the count
 * of OP17-021 Crone Oli 2 to 4, OP17-036 Withdraw Now and Allow Me to Save Face
 * 2 to 4.
 *
 * Lives in its own module for the reason `op16-enel-manifest.ts` gives: so
 * `deck-provenance.ts` can read the list without importing `index.ts`.
 */
export const op17ShanksTournamentManifest: DeckManifest = {
  id: "(Green) Shanks - 16th Place Rumble League #9",
  format: "standard",
  leader: "OP17-020",
  recommended: true,
  cards: {
    "OP08-036": 2,
    "OP10-030": 2,
    "OP12-034": 4,
    "OP15-035": 4,
    "OP17-021": 4,
    "OP17-022": 4,
    "OP17-027": 4,
    "OP17-029": 4,
    "OP17-031": 4,
    "OP17-032": 4,
    "OP17-033": 4,
    "OP17-036": 4,
    "OP17-038": 2,
    "ST32-002": 4,
  },
};

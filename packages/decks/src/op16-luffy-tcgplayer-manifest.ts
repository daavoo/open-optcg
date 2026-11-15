import type { DeckManifest } from "./index.js";

/**
 * Green/Blue Monkey.D.Luffy (OP16-022): the list a player named "Gavin" built
 * on TCGplayer's deck dashboard on 26 Oct 2026, which Peter Day embedded as #6
 * in "6 One Piece Decks that Get Way Better with Heroines Edition Vol.2
 * (EB-05)", published 28 Oct 2026. It is an article list, not an event
 * placing: the deck record carries no event, record or placing, and the
 * article credits the archetype's deck guide to iKailaKai.
 *
 * Source: TCGplayer,
 * https://www.tcgplayer.com/content/article/6-One-Piece-Decks-that-Get-Way-Better-with-Heroines-Edition-Vol-2-EB-05/43bf2e6d-3dc8-4abd-8930-eb84f43e3c2f/
 * (section "#6 Blue/Green Luffy", deck embed 552063, whose record carries the
 * whole fifty as card counts), retrieved 2026-11-15. Every identity is stamped
 * from Bandai's cardlist pages already, so the audit needs no entry for it.
 *
 * It is the Leader's `recommended` list: of the Monkey.D.Luffy builds in the
 * learned model's training pool it is the one that model wins most with
 * against the meta field. Same Leader as "(Green/Blue) Monkey.D.Luffy -
 * Official Feature Deck", so the same rules policy pilots both.
 *
 * Against that list it adds 4 EB05-025 Domino, 1 EB05-028 Boa Hancock, 1
 * OP02-068 Gum-Gum Rain. It drops 1 OP16-027 Jinbe, 1 OP12-057 Ice Block
 * Pheasant Peck, 1 OP13-040 I Know You're Strong... So I'll Go All Out from the
 * Very Start!!!, 1 OP11-061 Gum-Gum Jet Culverin, 2 OP06-058 Gravity Blade
 * Raging Tiger. It changes the count of ST30-014 Mr.3(Galdino) 2 to 4, OP16-026
 * Emporio.Ivankov 3 to 2, OP16-032 Boa Hancock 3 to 2.
 *
 * Lives in its own module for the reason `op16-enel-manifest.ts` gives: so
 * `deck-provenance.ts` can read the list without importing `index.ts`.
 */
export const op16LuffyTcgplayerManifest: DeckManifest = {
  id: "(Green/Blue) Monkey.D.Luffy - TCGplayer EB-05 Heroines Vol.2",
  format: "standard",
  leader: "OP16-022",
  recommended: true,
  cards: {
    "EB05-025": 4,
    "EB05-028": 1,
    "OP02-068": 1,
    "OP12-037": 1,
    "OP15-032": 1,
    "OP16-026": 2,
    "OP16-032": 2,
    "OP16-034": 4,
    "OP16-038": 2,
    "OP16-042": 8,
    "OP16-045": 4,
    "OP16-048": 4,
    "OP16-054": 4,
    "OP16-055": 4,
    "OP16-056": 4,
    "ST30-014": 4,
  },
};

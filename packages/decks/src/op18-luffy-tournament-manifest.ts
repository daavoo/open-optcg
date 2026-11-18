import type { DeckManifest } from "./index.js";

/**
 * Green Monkey.D.Luffy (OP18-022): the list BerryTCG shared on DuelVoyager and
 * showed on its YouTube channel as the 2nd-place list of a DuelVoyager online
 * weekly on 3 Nov 2026 -- a simulator event, played before OP-18's release.
 *
 * Source: BerryTCG's DuelVoyager deck share,
 * https://www.duelvoyager.com/deck/view/nw5aki09O9IE, retrieved 2026-11-15.
 * Every identity is stamped from Bandai's cardlist pages already, so the audit
 * needs no entry for it.
 *
 * It is a reset build around the Leader's own restand: OP18-031 Nico Robin,
 * OP18-036 Monkey.D.Luffy and OP18-118 Monkey.D.Luffy set the {Water Seven}
 * Leader active at the end of your turn, so it attacks twice and still stands
 * to defend, at 7000 behind OP18-027 Zoro & Sogeking. Around them, OP14-031
 * Nami, OP17-029 Hongo and OP12-037 rest the opponent's Characters, EB04-018
 * Megalo K.O.s rested ones, and Perona, Zoro & Sogeking and the 9-cost Luffy
 * keep theirs from being rested to attack or block.
 *
 * It is the Leader's `recommended` list: of the Monkey.D.Luffy (OP18-022)
 * builds the learned model was trained on, played into the meta field on the
 * same seeds, it is the one that model wins most with, clearly ahead of
 * "(Green) Monkey.D.Luffy - OPTCG Deck Explorer OP-18 Pre-release", which it
 * replaces on the shelf and which stays a training-only list in
 * `ml/bridge/decks.ts`.
 *
 * Lives in its own module for the reason `op16-enel-manifest.ts` gives: so
 * `deck-provenance.ts` can read the list without importing `index.ts`.
 */
export const op18LuffyTournamentManifest: DeckManifest = {
  id: "(Green) Monkey.D.Luffy - 2nd Place DuelVoyager Weekly 2026-11-03",
  format: "standard",
  leader: "OP18-022",
  recommended: true,
  cards: {
    "EB02-017": 4,
    "EB04-018": 4,
    "OP12-037": 2,
    "OP14-031": 4,
    "OP14-033": 4,
    "OP17-029": 4,
    "OP18-027": 4,
    "OP18-030": 4,
    "OP18-031": 4,
    "OP18-036": 4,
    "OP18-037": 4,
    "OP18-038": 4,
    "OP18-118": 4,
  },
};

import type { DeckManifest } from "./index.js";

/**
 * Green Monkey.D.Luffy (OP18-022): the list pilot "Cinnas" took to 31st of 121
 * (4-3) at [OP18] ChinoizeCup #136 MONDAY, an online OPTCGSim event played on
 * 16 Nov 2026 that allowed OP-18 cards ahead of their release.
 *
 * Source: Limitless TCG's standings for that event,
 * https://play.limitlesstcg.com/tournament/6af5879bdcbca32da6c4f034/standings,
 * whose API carried the whole fifty as card counts when it was retrieved on
 * 2026-11-18; the event's decklists have since been made private, and the
 * standings still show the pilot, the Leader and the placing. Every identity
 * is stamped from Bandai's cardlist pages already, so the audit needs no entry
 * for it.
 *
 * It is the same reset build as the DuelVoyager weekly list it replaces --
 * OP18-031 Nico Robin, OP18-036 and OP18-118 Monkey.D.Luffy set the {Water
 * Seven} Leader active at the end of the turn, behind OP18-027 Zoro & Sogeking
 * -- that trades the Blockers and rest-lock bodies for OP18-026 Sanji, two
 * pairs of Roronoa Zoro and a heavier Event suite.
 *
 * It is the Leader's `recommended` list: of the Monkey.D.Luffy (OP18-022)
 * builds the learned model was trained on, played into the meta field on the
 * same seeds, it is the one that model wins most with, ahead of "(Green)
 * Monkey.D.Luffy - 2nd Place DuelVoyager Weekly 2026-11-03", which it replaces
 * on the shelf and which stays a training-only list in `ml/bridge/decks.ts`.
 *
 * Against that list it adds 2 OP13-037 Roronoa Zoro, 2 OP13-040 I Know You're
 * Strong... So I'll Go All Out from the Very Start!!!, 2 OP16-035 Roronoa
 * Zoro, 3 OP16-039 Gum-Gum Twin Jet Pistol, 3 OP17-038 I Think He's Seen an
 * Ugly Future..., 4 OP18-026 Sanji and 4 OP18-039 Gum-Gum Giant Axe. It drops
 * 4 OP14-033 Perona, 4 OP17-029 Hongo, 4 OP18-030 Nami and 4 OP18-037
 * Yokozuna. It changes the count of EB04-018 Megalo 4 to 2 and OP14-031 Nami 4
 * to 2.
 *
 * Lives in its own module for the reason `op16-enel-manifest.ts` gives: so
 * `deck-provenance.ts` can read the list without importing `index.ts`.
 */
export const op18LuffyChinoizeManifest: DeckManifest = {
  id: "(Green) Monkey.D.Luffy - 31st Place ChinoizeCup #136",
  format: "standard",
  leader: "OP18-022",
  recommended: true,
  cards: {
    "EB02-017": 4,
    "EB04-018": 2,
    "OP12-037": 2,
    "OP13-037": 2,
    "OP13-040": 2,
    "OP14-031": 2,
    "OP16-035": 2,
    "OP16-039": 3,
    "OP17-038": 3,
    "OP18-026": 4,
    "OP18-027": 4,
    "OP18-031": 4,
    "OP18-036": 4,
    "OP18-038": 4,
    "OP18-039": 4,
    "OP18-118": 4,
  },
};

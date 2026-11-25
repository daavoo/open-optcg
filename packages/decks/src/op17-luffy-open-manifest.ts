import type { DeckManifest } from "./index.js";

/**
 * Black Monkey.D.Luffy (OP17-079): the maintainer's Elbaph giants build,
 * supplied to the project directly on 23 Nov 2026 with no event or placing
 * behind it. The project's own "- Open OPTCG" id already names the
 * maintainer's earlier build of 26 Sep 2026 for this Leader, which checkpoints
 * and the meta field still read, so this one carries the date it was supplied.
 *
 * It keeps that list's four-of core -- Usopp, Gerd, Sanji, Nico Robin, Jaguar.D.
 * Saul, Roronoa Zoro, Loki -- and adds EB-05's giant: 4 EB05-047 Ripley, a
 * 4-cost that is a 12 with no condition and replays a 2-cost from the trash,
 * with 1 EB05-046 Yamato and 1 OP17-098 Gum-Gum Kong Gun.
 *
 * It is the Leader's `recommended` list: of the Monkey.D.Luffy (OP17-079)
 * builds the learned model was trained on, played into the meta field on the
 * same seeds, it is the one that model wins most with, ahead of both "(Black)
 * Monkey.D.Luffy - Open OPTCG", which it replaces on the shelf and which stays
 * a training-only list in `ml/bridge/decks.ts`, and Bandai's feature deck,
 * which stays on its own shelf unmarked. `op17-luffy-policy.ts` pilots it.
 *
 * Against the Open OPTCG list it adds 1 EB05-046 Yamato, 4 EB05-047 Ripley and
 * 1 OP17-098 Gum-Gum Kong Gun. It drops 1 OP15-092 Monkey.D.Luffy and 1
 * OP17-096 I'm Luffy!! The Man Who Will Be King of the Pirates!!. It changes
 * the count of OP15-088 Pirates Docking Six 4 to 3, OP17-084 Tony
 * Tony.Chopper 2 to 1, OP17-086 Nami 4 to 3, OP17-093 Monkey.D.Luffy 3 to 4,
 * OP17-094 Rodo 4 to 3 and ST14-017 Thousand Sunny 3 to 2.
 *
 * Every identity is stamped from Bandai's cardlist pages already, so the
 * audit needs no entry for it.
 *
 * Lives in its own module for the reason `op16-enel-manifest.ts` gives: so
 * `deck-provenance.ts` can read the list without importing `index.ts`.
 */
export const op17LuffyOpenManifest: DeckManifest = {
  id: "(Black) Monkey.D.Luffy - Open OPTCG 2026-11-23",
  format: "standard",
  leader: "OP17-079",
  recommended: true,
  cards: {
    "EB05-046": 1,
    "EB05-047": 4,
    "OP15-088": 3,
    "OP17-080": 4,
    "OP17-081": 4,
    "OP17-082": 4,
    "OP17-084": 1,
    "OP17-086": 3,
    "OP17-087": 4,
    "OP17-089": 4,
    "OP17-093": 4,
    "OP17-094": 3,
    "OP17-095": 4,
    "OP17-098": 1,
    "OP17-119": 4,
    "ST14-017": 2,
  },
};

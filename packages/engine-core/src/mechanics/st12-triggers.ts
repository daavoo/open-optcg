/**
 * ST-12 `[Trigger]` programs.
 *
 * Split by timing window like every other whole-product import; see
 * `mechanics/README.md`. Comments paraphrase what each program has to do
 * rather than quoting the card -- printed text is a runtime asset, not repo
 * content (`pnpm card:text ST12-0xx` prints it from the local cache).
 */
import { SOURCE_BINDING } from "../mechanics.js";
import { restLeaderOrCharacterAtFour } from "./st12-main.js";
import { type SetMechanics } from "./registry.js";

export const st12TriggerMechanics: SetMechanics = {
  trigger: [
    [
      // ST12-002 Kuina: off the Life stack the body arrives for free, and with
      // it the rest its activation prints.
      //
      // It lands active, so the activation is available on the controller's
      // next turn rather than immediately -- the Trigger resolves on the
      // opponent's turn, where an [Activate: Main] cannot be used.
      "ST12-002",
      { effect: { kind: "play", binding: SOURCE_BINDING } },
    ],
    [
      // ST12-016 Lion Strike: the printed words are "activate this card's
      // [Main] effect", which is the same fragment registered again rather than
      // a node that reaches across registries. See `st12-main.ts`.
      "ST12-016",
      { effect: restLeaderOrCharacterAtFour("st12-lion-trigger") },
    ],
  ],
};

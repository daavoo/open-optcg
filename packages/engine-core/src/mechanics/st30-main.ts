/**
 * ST-30's one `[Main]` Event.
 *
 * Split by timing window like every other whole-product import; see
 * `mechanics/README.md`. The product's one `[Activate: Main]`, ST30-014
 * Mr.3(Galdino), was in the pool before the product was and stays in
 * `st-main.ts`.
 *
 * Comments paraphrase what the program has to do rather than quoting the card
 * -- printed text is a runtime asset, not repo content
 * (`pnpm card:text ST30-017` prints it from the local cache).
 */
import { type SetMechanics } from "./registry.js";
import { digForSixThousand } from "./st30-shared.js";

export const st30MainMechanics: SetMechanics = {
  eventMain: [
    [
      // ST30-017: five deep for one of the product's 6000s, for one DON!!.
      //
      // The same program ST30-002 Inazuma prints as an `[On Play]`, and the
      // same one this card's own `[Trigger]` re-runs -- see
      // `st30-triggers.ts`, where "activate this card's [Main] effect" is one
      // fragment registered twice rather than a node of its own.
      "ST30-017",
      { cost: 1, program: digForSixThousand("st30-trouble") },
    ],
  ],
};

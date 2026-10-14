/**
 * ST-29 program fragments more than one of its cards prints.
 *
 * Comments paraphrase what each fragment has to do rather than quoting the
 * card -- printed text is a runtime asset, not repo content
 * (`pnpm card:text ST29-0xx` prints it from the local cache).
 */
import { SOURCE_BINDING, type MechanicEffect } from "../mechanics.js";

/**
 * "If your Leader is [Monkey.D.Luffy], play this card." -- printed on three of
 * the product's Characters, and the whole reason its Life stack is a board
 * rather than a hand.
 *
 * The gate is on the Leader's *name*, so an {Egghead} Leader that is not this
 * one fires none of them. `play` on `SOURCE_BINDING` is the "play this card"
 * idiom: the Trigger's own card is in no zone while its Trigger resolves, and
 * the source binding is the only handle on it.
 */
export const playSelfBehindLuffy: MechanicEffect = {
  kind: "if",
  condition: {
    kind: "leader-has-name",
    player: "self",
    name: "Monkey.D.Luffy",
  },
  then: { kind: "play", binding: SOURCE_BINDING },
};

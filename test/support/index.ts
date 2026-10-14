/**
 * The test-support layer. Import scenario setup from here rather than
 * hand-rolling `submit` / `character` / `requireAction` per file, and read
 * `test/support/README.md` before adding a helper.
 */
export { character, copies, instance } from "./cards.js";
export { covers } from "./coverage.js";
export { hasPrintedText, itWithText } from "./printed-text.js";
export {
  Game,
  fabricatedAttack,
  requireAction,
  scenario,
  setTurnPlayer,
  submit,
  type ActionMatcher,
  type FabricatedAttack,
} from "./scenario.js";

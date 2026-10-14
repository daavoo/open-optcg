import type { LegalAction } from "@one-piece-sim/protocol";
import { type Heuristic, prefer } from "../heuristics.js";

/** Hand size at or below which OP11-041's draw still fires. */
const DRAW_GATE = 7;

/** Characters a Character area can hold. */
const BOARD_LIMIT = 5;

const GECKO_MORIA = "OP14-104";
const ZEUS = "OP11-106";

/** Gecko Moria's `[On Play]`, which asks for a branch before it asks for a card. */
function isMoriaMode(action: LegalAction, mode: string): boolean {
  return (
    action.type === "resolve-effect" &&
    action.sourceCardNumber === GECKO_MORIA &&
    action.option.kind === "mode" &&
    action.option.mode === mode
  );
}

/**
 * OP-16 Blue/Yellow Nami, the Thriller Bark recursion build.
 *
 * ## The engine, in one paragraph
 *
 * OP11-041 Nami draws a card when a card leaves *either* player's Life, and
 * `card-mechanics.ts` gates that reaction on `ownTurn`, `oncePerTurn` and a
 * hand of 7 or fewer: one card per own turn, taken at that turn's first Life
 * movement, and nothing at all for damage absorbed on the opponent's turn. Life
 * movement is therefore card advantage rather than a cost, a full hand is an
 * engine switched off, and a second Life-mover spent on the same turn draws
 * nothing extra. The Leader's other half is defensive and separately gated:
 * `[DON!! x1] [On Your Opponent's Attack] [Once Per Turn]` trashes a card from
 * hand for +2000 for the whole turn, and `namiLeaderDefenseAvailable` counts
 * DON!! *attached to the Leader*, so the ability exists only on turns that left
 * one there -- an attachment holds through the opponent's turn, and EB03-053
 * Nami and OP13-042 Edward.Newgate hand one over rested. The trash is not a
 * graveyard: Gecko Moria's `[On Play]`, Dr. Hogback's `[On K.O.]` and the
 * `[Trigger]` on Kumacy, Perona and Dr. Hogback all play a cost-4-or-less
 * {Thriller Bark Pirates} Character back out of it, so those three are
 * relocated rather than spent when they are discarded.
 *
 * ## The plan
 *
 * Control by aggravation with yellow resilience. It does not race. It keeps
 * Life high, keeps a Blocker up, removes what it must, and wins because the
 * opponent runs out of answers first -- so the Life it defends is what the
 * 8-to-10 DON!! finishers are bought with, and a card spent to save one point
 * of it is the end of the plan paying for the middle.
 *
 * Written as heuristics rather than as a whole-turn ladder: every rule below
 * narrows what `chooseGenericRules` chooses from; none of them take a decision
 * over. Registered through `registerDeckRules`, so each named rule compiles to
 * its own `op16-nami#<name>` module and can be priced on its own.
 */
export const OP16_NAMI_RULES: readonly Heuristic[] = [
  // Resilience first. The deck's whole claim against aggro is that it can hold
  // a body in the way while it out-values; a Blocker on an empty board is
  // worth more than a bigger vanilla one.
  prefer("Keep a Blocker in the way while Life is the binding constraint.")
    .as("blocker-first")
    .when((t) => t.selfLife <= 3 || t.opponentArchetype === "aggro")
    .by(30)
    .play((card) => card.facts.keywords.includes("Blocker")),

  // Zeus is removal attached to a body. Prefer it while the opponent actually
  // has something worth removing, so it is not spent as vanilla stats on an
  // empty board.
  prefer("Deploy removal while the opponent has a target for it.")
    .as("removal-on-target")
    .when((t) => t.observation.opponent.board.length > 0)
    .by(20)
    .play((card) => card.cardNumber === ZEUS),

  // Otherwise develop the biggest thing affordable. Expressed as a magnitude
  // rather than a card table, so it needs no maintenance as the list changes.
  prefer("Develop the largest body the DON!! can pay for.")
    .as("develop-largest")
    .play((card) => card.facts.power / 1000),

  // The Leader draws only while the hand is at 7 or fewer, so a full hand is
  // an engine that is switched off. Develop rather than hold.
  prefer("Spend down to the Leader's draw gate rather than hold a dead hand.")
    .as("spend-to-gate")
    .when((t) => t.hand.length > DRAW_GATE)
    .by(12)
    .play(() => true),

  // Gecko Moria asks for its branch before it asks for a card, so the branch
  // falls to whatever answers first. Playing into a full Character area
  // trashes one of this deck's own bodies to make room; the other branch adds
  // a Life card -- the currency the whole deck accumulates -- and leaves a
  // known [Trigger] on top of it.
  prefer("Bank Gecko Moria's target in Life when the board cannot hold it.")
    .as("moria-life-mode")
    .when((t) => t.observation.self.board.length >= BOARD_LIMIT)
    .by(30)
    .action((action) => isMoriaMode(action, "life")),
];

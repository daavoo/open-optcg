/**
 * (Green/Black) Brook's policy, behind the OP15-022 Leader.
 *
 * The Leader moves the deck-out loss to the end of the turn the deck empties,
 * and its [Activate: Main] [Once Per Turn] trashes the top 4 -- setting a
 * Character active on the turn that leaves the deck at 0. Five of the fifty's
 * cards trash off the top of the deck as well, and the trash is what OP15-092
 * Luffy, OP15-086 Nami and OP15-095 Gum-Gum Storm count. The deck therefore
 * spends its own deck as a resource, and the feature page's warning is the
 * whole of this policy: mill for the trash, but keep enough deck to reach the
 * turn that wins, and empty it only on that turn.
 */
import type { GameObservation } from "@one-piece-sim/protocol";
import {
  chooseGenericCounter,
  isOptionCardIn,
  optionCard,
  type PolicyDecision,
} from "../generic-policy.js";
import { heuristics, never, preferAmong, WEIGHT } from "../heuristics.js";
import type { RulesPolicy } from "../policy-chain.js";
import type { PolicyModule } from "../policy-module.js";
import type { Tactics } from "../tactics.js";

const BROOK_LEADER = "OP15-022";
const DOCKING_SIX = "OP15-088";

/**
 * How many cards each self-mill takes off the top of the deck. Sanji's is
 * conditional on a {Straw Hat Crew} Leader, which this deck always has, and
 * Chopper's and Lola's are not optional, so playing the body pays the mill.
 */
const PLAY_MILL: ReadonlyMap<string, number> = new Map([
  ["OP15-081", 5],
  ["OP15-085", 3],
  ["OP15-082", 3],
]);
const LEADER_MILL = 4;
const DOCKING_SIX_MILL = 3;

/**
 * The deck to leave behind after any mill that is not the finishing one: one
 * draw a turn for the turns a game still has left once the trash is built.
 */
export const BROOK_DECK_RESERVE = 10;

/** True when a mill of `count` would leave less than the reserve. */
function millOverdraws(t: Tactics, count: number): boolean {
  return t.observation.self.deckCount - count < BROOK_DECK_RESERVE;
}

/**
 * The finishing turn: the opponent has no Life left, so the next hit on their
 * Leader wins, and the Leader's set-active on an empty deck is one more hit.
 * The deck-out loss lands at the end of this turn, after that hit.
 */
function finishingTurn(t: Tactics): boolean {
  return t.observation.opponent.lifeCount === 0;
}

export function createOp15BrookDeckBudgetModule(): PolicyModule {
  return heuristics("op15-brook-deck-budget", [
    never(
      "Do not trash 4 with the Leader when it leaves the deck too thin to reach the winning turn.",
    )
      .by(WEIGHT.deck)
      .as("leader-overdraws")
      .when((t) => millOverdraws(t, LEADER_MILL) && !finishingTurn(t))
      .activate((action) => action.sourceCardNumber === BROOK_LEADER),
    never(
      "Do not play a Character whose own [On Play] trashes the deck below what the game still needs.",
    )
      .by(WEIGHT.deck)
      .as("body-overdraws")
      .play((card, t) => {
        const mill = PLAY_MILL.get(card.cardNumber);
        return mill !== undefined && millOverdraws(t, mill);
      }),
    never(
      "Do not pay Pirates Docking Six's 3-card trash when it leaves the deck too thin.",
    )
      .by(WEIGHT.deck)
      .as("docking-six-overdraws")
      .when((t) => millOverdraws(t, DOCKING_SIX_MILL))
      .effect(
        (action) =>
          action.sourceCardNumber === DOCKING_SIX &&
          action.option.kind === "confirm" &&
          action.option.choice === "apply",
      ),
  ]);
}

const LUFFY = "OP15-092";
const NAMI = "OP15-086";
const CHOPPER = "OP15-085";
const BROOK = "OP15-032";

/**
 * What each of the three trash-reaching clauses should take, higher first.
 *
 * - OP15-086 Nami plays a cost-7-or-less {Straw Hat Crew} Character from the
 *   trash with [Rush]: Luffy is the reason the card is in the deck -- 9000
 *   base once the trash holds 10 -- then the 7000 bodies, Pirates Docking Six
 *   first because its own [On Play] plays a Chopper back as well.
 * - OP15-085 Chopper adds a {Straw Hat Crew} Character other than itself from
 *   the trash to hand: the two cards that win, Luffy and the Nami that
 *   replays it, then the bodies in the order Nami would take them.
 * - OP15-088 Pirates Docking Six plays a cost-2-or-less {Straw Hat Crew}
 *   Character from the trash: Chopper, whose [On Play] trashes 3 more and whose
 *   [Activate: Main] fetches Luffy, then Zoro's protection and the Nami that
 *   digs. Sanji last: played from the trash it still trashes 5 off the deck.
 */
const TRASH_CHOICE: ReadonlyMap<string, ReadonlyMap<string, number>> = new Map([
  [
    NAMI,
    new Map([
      [LUFFY, 9],
      [DOCKING_SIX, 8],
      ["OP15-087", 7],
      [BROOK, 6],
      ["OP15-089", 5],
      ["OP15-024", 4],
      [CHOPPER, 3],
      ["OP15-094", 2],
      ["EB02-017", 1],
    ]),
  ],
  [
    CHOPPER,
    new Map([
      [LUFFY, 9],
      [NAMI, 8],
      [DOCKING_SIX, 7],
      [BROOK, 6],
      ["OP15-087", 5],
      ["OP15-024", 4],
      ["OP15-089", 3],
      ["OP15-094", 2],
      ["EB02-017", 1],
    ]),
  ],
  [
    DOCKING_SIX,
    new Map([
      [CHOPPER, 4],
      ["OP15-094", 3],
      ["EB02-017", 2],
      ["OP15-081", 1],
    ]),
  ],
]);

/**
 * Rank the card a trash-reaching clause takes. Every trash option of those
 * three sources is scored, one above an unlisted card, so the table decides
 * the whole choice rather than handing the unscored cards back to the ladder.
 */
export function createOp15BrookTrashChoiceModule(): PolicyModule {
  return heuristics("op15-brook-trash-choice", [
    preferAmong("Take the card from the trash this deck wants most.")
      .by(WEIGHT.deck)
      .effect((action) => {
        const table = TRASH_CHOICE.get(action.sourceCardNumber);
        if (!table || !isOptionCardIn(action, "self", "trash")) return false;
        const card = optionCard(action)!.card.cardNumber;
        return (table.get(card) ?? 0) + 1;
      }),
  ]);
}

/**
 * The power a set-active has to buy before it is worth a card. OP15-032
 * Brook's [Activate: Main] trashes a 6000 body to set one Character active;
 * that is a second attack only when the Character is one the opponent has to
 * answer, and 7000 is the smallest body in the fifty that is.
 */
const RESTAND_WORTH = 7000;

function restandTargets(t: Tactics): number {
  return t.observation.self.board.filter(
    (card) =>
      card.rested &&
      card.cardNumber !== BROOK &&
      card.currentPower >= RESTAND_WORTH,
  ).length;
}

/**
 * OP15-032 Brook's set-active, and the Leader's on an empty deck: spend it on
 * a rested attacker that is worth a second swing, and on the biggest one.
 */
export function createOp15BrookRestandModule(): PolicyModule {
  return heuristics("op15-brook-restand", [
    never(
      "Do not trash Brook to set a Character active unless one worth a second attack has already swung.",
    )
      .by(WEIGHT.deck)
      .as("no-restand-target")
      .when((t) => restandTargets(t) === 0)
      .activate((action) => action.sourceCardNumber === BROOK),
    preferAmong("Set the biggest rested attacker active.")
      .by(WEIGHT.deck)
      .as("restand-biggest")
      .effect((action) => {
        if (
          action.sourceCardNumber !== BROOK &&
          action.sourceCardNumber !== BROOK_LEADER
        )
          return false;
        if (!isOptionCardIn(action, "self", "board")) return false;
        const option = optionCard(action)!;
        return 1 + (option.currentPower ?? option.card.power ?? 0) / 1000;
      }),
  ]);
}

/**
 * The bodies worth a Counter card to keep, which the generic Counter step
 * never defends: with `protectedCards` empty it spends nothing on a Character.
 *
 * OP15-092 Luffy is the finisher every other card in the fifty feeds, and
 * OP15-086 Nami is the 8-cost that plays it back with [Rush]. OP15-088
 * Pirates Docking Six and OP15-087 Nico Robin are the other 7000 bodies, and
 * neither prints a Counter value, so each is a card the hand cannot turn back
 * into defence. A Counter card spent to save any of them goes to the trash,
 * which is where this deck wants its cards anyway.
 */
const BROOK_PROTECTED_FROM_COUNTER: ReadonlySet<string> = new Set([
  LUFFY,
  NAMI,
  DOCKING_SIX,
  "OP15-087",
]);

export function createOp15BrookCounterPolicy(): RulesPolicy {
  return (observation: GameObservation): PolicyDecision | undefined => {
    if (observation.self.leader.cardNumber !== BROOK_LEADER) return undefined;
    if (observation.phase !== "counter") return undefined;
    return chooseGenericCounter(observation, observation.legalActions, {
      protectedCards: BROOK_PROTECTED_FROM_COUNTER,
    });
  };
}

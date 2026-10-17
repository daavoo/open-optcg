/**
 * How a set module declares its programs, and how the ten registries are built
 * out of them.
 *
 * Card *data* is split per set under `packages/cards/src`; this is the same
 * split for card *behaviour*. Every set module exports one `SetMechanics`, and
 * `index.ts` merges them. Two properties the merge buys that one big file did
 * not have: adding a card touches only its own set's module, so two open
 * branches on different sets cannot conflict, and registering the same clause
 * for the same card twice is an error at import time rather than a silent
 * last-one-wins.
 */
import type { MechanicProgram } from "../mechanics.js";
import type {
  ActivateMainProgram,
  OnBlockProgram,
  OnKoEntry,
  CounterEventProgram,
  EventMainProgram,
  LeaderWatcherProgram,
  OnOpponentAttackProgram,
  ReplacementProgram,
  WhenAttackingEntry,
  WhenRestedProgram,
} from "./types.js";

/** `[card number, program]` pairs, as the registry Maps take them. */
type Entries<T> = readonly (readonly [string, T])[];

/**
 * One set's programs, keyed by the timing window each fires in.
 *
 * Every field is optional: a set that prints no `[Counter]` Events simply omits
 * `counterEvent`.
 */
export interface SetMechanics {
  eventMain?: Entries<EventMainProgram>;
  counterEvent?: Entries<CounterEventProgram>;
  onOpponentAttack?: Entries<OnOpponentAttackProgram>;
  leaderWatcher?: Entries<LeaderWatcherProgram>;
  whenAttacking?: Entries<WhenAttackingEntry>;
  whenRested?: Entries<WhenRestedProgram>;
  activateMain?: Entries<ActivateMainProgram>;
  onPlay?: Entries<MechanicProgram>;
  onBlock?: Entries<OnBlockProgram>;
  onKo?: Entries<OnKoEntry>;
  onEndOfYourTurn?: Entries<MechanicProgram>;
  /**
   * An effect activated at the start of its controller's turn -- OP11-040
   * Monkey.D.Luffy's Leader (`pnpm card:text OP11-040`). Asked before the
   * Refresh Phase, which is where the comprehensive rules put start-of-turn
   * effects; the card prints no bracketed marker for it.
   */
  onStartOfYourTurn?: Entries<MechanicProgram>;
  trigger?: Entries<MechanicProgram>;
  replacement?: Entries<ReplacementProgram>;
}

/** The clause keys, so the merge can iterate them exhaustively. */
const CLAUSES = [
  "eventMain",
  "counterEvent",
  "onOpponentAttack",
  "leaderWatcher",
  "whenAttacking",
  "whenRested",
  "activateMain",
  "onPlay",
  "onBlock",
  "onKo",
  "onEndOfYourTurn",
  "onStartOfYourTurn",
  "trigger",
  "replacement",
] as const satisfies readonly (keyof SetMechanics)[];

export type MergedMechanics = {
  readonly [K in keyof SetMechanics]-?: ReadonlyMap<
    string,
    NonNullable<SetMechanics[K]>[number][1]
  >;
};

/**
 * Merges the set modules into the twelve registries, refusing a duplicate
 * registration for the same (card, clause) pair.
 *
 * The duplicate check is the reason this is a function rather than ten spread
 * literals: with 165 cards across ten registries and one module per set, two
 * modules claiming the same card's `[On Play]` is an easy mistake to make in a
 * merge, and `new Map([...a, ...b])` would resolve it silently in favour of
 * whichever module happened to be listed last.
 */
export function mergeSetMechanics(
  modules: readonly {
    readonly name: string;
    readonly mechanics: SetMechanics;
  }[],
): MergedMechanics {
  const merged: Record<string, Map<string, unknown>> = {};
  const sources = new Map<string, string>();
  for (const clause of CLAUSES) merged[clause] = new Map();
  for (const { name, mechanics } of modules) {
    for (const clause of CLAUSES) {
      for (const [cardNumber, program] of mechanics[clause] ?? []) {
        const key = `${clause}:${cardNumber}`;
        const existing = sources.get(key);
        if (existing !== undefined) {
          throw new Error(
            `duplicate mechanic registration: ${cardNumber} ${clause} is registered in both ${existing} and ${name}`,
          );
        }
        sources.set(key, name);
        merged[clause]!.set(cardNumber, program);
      }
    }
  }
  return merged as unknown as MergedMechanics;
}

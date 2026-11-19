/**
 * The table as another client sees it: what the OPTCGSim plugin sends the
 * bridge at each decision it wants the model to take.
 *
 * Deliberately not OPTCGSim's own save-state format. The plugin reads the sim's
 * objects and fills this in, so the sim's internals stay on the C# side and
 * this file is the whole contract: a field here is a fact any table could
 * report. Every card the plugin may later be told to act on carries the sim's
 * own id, and a move names cards by that id alone.
 */
import type { PlayerId } from "@one-piece-sim/protocol";

export const SNAPSHOT_VERSION = 1;

/** A card the sim can point at: its own object id and the printed number. */
export interface SimCard {
  id: string;
  cardNumber: string;
}

export interface SimFieldCard extends SimCard {
  rested: boolean;
  /** DON!! given to it. */
  don: number;
  /**
   * Its power as the sim shows it, with the DON!! given to it counted on its
   * owner's turn and not on the other player's. The engine works power out
   * from the printed number, given DON!! and its own modifiers, so a buff the
   * sim applied and the imported position cannot see would otherwise vanish;
   * the difference is carried over as a modifier that lasts the turn.
   */
  power?: number;
  /** Played this turn, so it cannot attack without [Rush]. */
  playedThisTurn?: boolean;
}

export interface SimSide {
  /**
   * The 50 card numbers of the deck, Leader excluded. Required for the seat the
   * model plays (it reads the cards it has yet to draw from it). For the other
   * seat it fills the hidden zones, whose identities `observe()` withholds
   * anyway; without it the catalog's list for that Leader stands in.
   */
  deckList?: string[];
  leader: SimFieldCard;
  /** Cards for a hand the model may see, a count for one it may not. */
  hand: SimCard[] | number;
  characters: SimFieldCard[];
  stage: (SimCard & { rested: boolean }) | null;
  trash: SimCard[];
  /** How many Life cards. */
  life: number;
  deckCount: number;
  /**
   * The deck and the Life cards themselves, top first: what a recorded game
   * (`TableSnapshot.record`) adds, so the engine's copy of the game can be
   * dealt the cards the sim dealt. Nobody at the table may see them, and
   * nothing chooses a move from them.
   */
  deck?: SimCard[];
  lifeCards?: SimCard[];
  /** Active and rested DON!! in the cost area; given DON!! sits on the cards. */
  don: { active: number; rested: number };
}

export type SimStep =
  | { kind: "mulligan" }
  | { kind: "main" }
  | {
      kind: "block" | "counter";
      attacker: string;
      target: string;
      /** The attack's power as declared, battle bonuses included. */
      attackPower: number;
      /** Counter power already added to the target this battle. */
      counterPower?: number;
    }
  | {
      /**
       * A Life card with a [Trigger] has been hit: activate it, or add the
       * card to hand. Only a recorded game asks; elsewhere the plugin takes
       * every Trigger itself.
       */
      kind: "trigger";
      /** The Life card, when the sim says which it is. */
      card?: SimCard;
    }
  | {
      /**
       * A choice inside one of the model's own effects: the sim has an effect
       * of the model's seat in progress and is waiting for its targets.
       */
      kind: "effect";
      /** The card whose effect it is. */
      source: string;
      /** Every card the sim would accept as the next target. */
      candidates: string[];
      /**
       * Cards the effect has the model look at from its deck, top first.
       * They are hidden from the table, so the engine's deck is set to match.
       */
      revealed: SimCard[];
      /** Targets still to choose; fewer may be confirmed when the effect says "up to". */
      remaining: number;
    };

export interface TableSnapshot {
  version: typeof SNAPSHOT_VERSION;
  /** Turn number, counting both players' turns from 1. */
  turn: number;
  turnPlayer: PlayerId;
  /** The seat the model plays. */
  seat: PlayerId;
  step: SimStep;
  players: Record<PlayerId, SimSide>;
  /**
   * The table is as it was when the last move was sent: the sim did not take
   * it. The same decision is asked again, for a different answer.
   */
  refused?: boolean;
  /**
   * The choice buttons the sim is showing, by its own names for them
   * (`UseOnPlay`, `MoveToTop`, ...): how a prompt that takes no card is asked.
   */
  buttons?: string[];
  /**
   * The model plays both seats and the game is recorded (`shadow.ts`): every
   * snapshot of it carries both hands, both decks and both Life piles, and
   * `seat` is whichever seat this decision belongs to.
   */
  record?: boolean;
  /** Names one game of the sim, so its snapshots are told from the last game's. */
  game?: string;
  /** Who took the first turn. */
  first?: PlayerId;
}

/**
 * What the model chose, in the sim's terms. `choose` answers an `effect`
 * step: the cards to select, in order, then the sim's confirm or the button
 * named -- an empty list confirms choosing nothing, and `decline` passes on
 * an optional effect.
 * `defer` hands the decision back to the person at the table: the decision
 * the engine put to the model has no counterpart the plugin can perform.
 */
export type SimMove =
  | { kind: "keep" }
  | { kind: "mulligan" }
  | { kind: "play"; card: string }
  | { kind: "attach-don"; target: string }
  | { kind: "activate"; card: string; target?: string }
  | { kind: "attack"; attacker: string; target: string }
  | { kind: "block"; blocker: string }
  | { kind: "counter"; card: string; target?: string }
  | { kind: "end-turn" }
  | { kind: "no-block" }
  | { kind: "no-counter" }
  | {
      kind: "choose";
      cards: string[];
      decline?: boolean;
      /** The sim button that answers the prompt, when one of them does. */
      button?: string;
    }
  | { kind: "trigger"; activate: boolean }
  | { kind: "defer"; reason: string };

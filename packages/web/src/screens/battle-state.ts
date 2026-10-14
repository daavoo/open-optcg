/**
 * The battle view's state, separated from its implementation so main.ts can
 * build the store without importing the whole board.
 */
import type { PlayerId, PublicEvent } from "@one-piece-sim/protocol";
import type { LlmDebugRecord } from "../llm-settings.js";
import type { ReplayState } from "../replay.js";
import type { SimulationState } from "../simulate.js";

export type MainSelection =
  { kind: "card"; instanceId: string; cardNumber: string } | { kind: "don" };

export type BattleNoticeEvent = Extract<
  PublicEvent,
  { type: "attack-blocked" | "attack-redirected" | "battle-resolved" }
>;

/**
 * The faces a private look showed the viewer, held until they dismiss them or
 * take another action. Derived by {@link lookedAtCards} from the acting
 * action's events; see there for why a look needs a surface of its own.
 */
export interface LookNotice {
  sourceCardNumber: string;
  cardNumbers: readonly string[];
}

/** One answer from the AI worker, tagged with the request it belongs to. */
export interface AiResult {
  id: number;
  actionId?: string;
  error?: string;
  reasoning?: string;
  rawExchange?: LlmDebugRecord["rawExchange"];
}

/** The match/board view's state, reset whenever a match begins or ends. */
export interface BattleState {
  /**
   * The trace being played back, while the board is a spectator's rather than
   * a player's. See `replay.ts`. Null for a match that is being played.
   */
  replay: ReplayState | null;
  /**
   * The simulated match being watched, while neither seat is a person's. See
   * `simulate.ts`. Null whenever somebody at the table is playing.
   */
  simulation: SimulationState | null;
  aiPaused: boolean;
  aiPending: boolean;
  /**
   * An answer that arrived while the player still had an opponent-action modal
   * to acknowledge.
   *
   * The request goes out as soon as the opponent's action lands rather than
   * when the modal is dismissed, so an LLM's thinking time overlaps with the
   * reading time. The answer parks here until the modal is acknowledged, so
   * the board still never moves under a notice the player has not read.
   * Nothing else can act in that window -- the modal replaces the command
   * surface, and the viewer has no legal actions while the opponent is the
   * active player -- so the answer stays valid for exactly the state it was
   * asked about.
   */
  prefetchedAiResult: AiResult | null;
  workerSequence: number;
  agentSession: number;
  llmDebugRecords: LlmDebugRecord[];
  mainSelection: MainSelection | null;
  /**
   * The second step of a targeted action: which kind of offer the selected
   * card (or the DON!! area) is currently aiming.
   *
   * An attack and a DON!! attachment always name a card that is on the board,
   * so the board is where they are aimed: the panel drops to a corner bar, the
   * legal targets light up and the rest of the table dims. A Main activation
   * keeps a list of its own, because its options are not always board cards --
   * a card in hand, a card in Life, or no card at all -- and a board with
   * nothing lit would be a question with no visible answer.
   */
  targetMode: "attack" | "attach-don" | "activate-main" | null;
  donAttachCount: number;
  choiceModalHidden: boolean;
  trashInspector: "self" | "opponent" | null;
  /** Whether the match-history modal is open. One surface at every width:
   * the top-bar button opens it on a phone exactly as it does on a desktop. */
  historyOpen: boolean;
  /**
   * Whether the history is following the newest entry, which is the top of a
   * list that runs backwards. True until the reader scrolls down off it, and
   * true again as soon as they come back up.
   */
  historyPinnedToLatest: boolean;
  /** Where the history was scrolled to, for a render that is not pinned. */
  historyScroll: number;
  /**
   * Which hand sheet is open, and null for none.
   *
   * A phone has no room to keep a hand on the table: below 760px the mat takes
   * the whole half and a hand comes up as a sheet when asked for, the way a
   * player lifts their cards to read them. Picking a card closes it, because
   * the pick opens the card's own panel. Meaningless at desktop widths, where
   * the hands stand on the table and the sheets' buttons are not drawn.
   *
   * Two of them, because a watched game has two hands to read: `"opponent"` is
   * the far seat's, which is face up only while nobody at the table is playing
   * -- on a phone the fan of faces is not drawn at all, so without its own
   * sheet the far hand is on screen at every width except the one where it has
   * to be asked for.
   */
  handOpen: "self" | "opponent" | null;
  /**
   * The history entry whose Reset button is waiting on a confirmation.
   *
   * It carries the entry's own words and how many entries come after it, not
   * just the action count {@link Game.rewindTo} takes: a dialog that asks
   * "reset to this point?" without saying which point, over a modal it has
   * covered, is asking the reader to remember what they clicked. Cleared by
   * either button in the dialog.
   */
  pendingRewind: {
    actionCount: number;
    label: string;
    discards: number;
  } | null;
  battleNotice: BattleNoticeEvent | null;
  lookNotice: LookNotice | null;
  opponentNotice: readonly PublicEvent[] | null;
  /**
   * What a seat just did, for somebody who is only watching.
   *
   * The player's own report waits to be acknowledged and gathers a whole turn
   * while it waits, because the board must not move under a player reading it.
   * A watcher has neither problem and the opposite need: they want to know
   * what each seat did as it happens, and the board is what they are watching,
   * so this carries one action at a time -- replaced by the next, never
   * appended to -- and is drawn small, on the half of the table that acted,
   * with nothing to dismiss.
   */
  spectatorNotice: { actor: PlayerId; events: readonly PublicEvent[] } | null;
  /**
   * Steps of this player's own action that the board will not show for itself:
   * an automatic ability firing off what they just did, and an `[Activate:
   * Main]` they clicked whose consequence is not a card moving.
   *
   * Its own field rather than a flag on {@link opponentNotice} because the two
   * are answers to different questions -- "what did they do?" against "what
   * happened when I did that?" -- and only ever one is on screen at a time: an
   * action is either theirs or this player's.
   */
  automaticNotice: readonly PublicEvent[] | null;
  /**
   * The heading for {@link automaticNotice}, decided when the steps are, since
   * the marker row that says which kind of ability they came from is dropped
   * from the steps themselves.
   */
  automaticNoticeTitle: string | null;
  /**
   * The same steps, waiting for the decision they came before.
   *
   * A `DON!! −N` is paid before the player says which DON!! paid it, so a
   * Leader that answers returned DON!! has already fired by the time the pool
   * prompt is raised. Reporting it straight away puts the consequence on
   * screen over the top of the choice that led to it. These steps move to
   * {@link automaticNotice} once every returned DON!! has a home.
   */
  heldAutomaticNotice: readonly PublicEvent[] | null;
  /** The heading those held steps will come up under. */
  heldAutomaticNoticeTitle: string | null;
  /**
   * The order a "[printed text omitted -- pnpm card:text <card>]"
   * choice will be submitted in, as indices into the offer's own cards, and
   * the offered action it belongs to.
   *
   * The engine offers one action carrying the reveal order and accepts any
   * permutation of it, so the reordering happens here, on screen, and is
   * spent in one submission. `actionId` is the offer's own id: a different
   * decision is a different id, which is what discards a half-made order
   * rather than applying it to the next search.
   */
  bottomOrder: { actionId: string; order: number[] } | null;
  /**
   * A DON!! payment being composed, and then spent.
   *
   * The engine asks a "return 1 or more" as two decisions -- how many DON!! go
   * back, and then, one card at a time, which pool each came out of -- because
   * the second is only answerable once the first is. Asked that way on screen
   * it was two modals with no visible relationship, the second of them titled
   * after a cost the player had already paid to put the card on the board.
   *
   * So the modal composes the whole payment first. `manual` is the split the
   * player has built, per pool, which means nothing until confirmed -- and its
   * total is the size of the payment, there being no separate count to keep in
   * step with it. Confirming fills `plan` with one pool per DON!!, submits the
   * count the split adds up to, and the pool decisions that follow are
   * answered off the front of it without ever reaching the screen.
   *
   * A printed `DON!! −N` raises only that second decision -- there is no size
   * to choose -- and composes here too: the pool prompts are already on offer,
   * so confirming answers the first of them itself and the plan carries the
   * rest. Both shapes therefore leave the same state behind.
   *
   * `plan` is a queue rather than a fixed set of answers: the engine stops
   * asking as soon as only one pool could supply the rest, so what is left
   * over is simply dropped when the payment ends.
   */
  donReturn: {
    /** The card whose clause is being paid, which is what the modal is about. */
    sourceCardNumber: string;
    manual: Record<string, number>;
    plan: string[];
  } | null;
}

export function initialBattleState(): BattleState {
  return {
    replay: null,
    simulation: null,
    spectatorNotice: null,
    aiPaused: false,
    aiPending: false,
    prefetchedAiResult: null,
    workerSequence: 0,
    agentSession: 0,
    llmDebugRecords: [],
    mainSelection: null,
    targetMode: null,
    donAttachCount: 1,
    choiceModalHidden: false,
    trashInspector: null,
    historyOpen: false,
    historyPinnedToLatest: true,
    historyScroll: 0,
    handOpen: null,
    pendingRewind: null,
    battleNotice: null,
    lookNotice: null,
    opponentNotice: null,
    automaticNotice: null,
    automaticNoticeTitle: null,
    heldAutomaticNotice: null,
    heldAutomaticNoticeTitle: null,
    donReturn: null,
    bottomOrder: null,
  };
}

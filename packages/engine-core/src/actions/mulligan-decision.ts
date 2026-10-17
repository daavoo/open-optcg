/**
 * `mulligan-decision`: Keep or reshuffle the opening hand. Both seats decide before Life is dealt.
 *
 * One of the eleven handlers `applyAction` dispatches to; see
 * `actions/index.ts` for the table and the contract they share.
 */
import { opponentOf } from "../board.js";
import { shuffle } from "../rng.js";
import { type ActionContext } from "./context.js";

export function applyMulliganDecision({
  state,
  events,
  activePlayer,
  offered,
  db,
}: ActionContext<"mulligan-decision">): void {
  const player = state.players[activePlayer];
  player.mulliganDecision = offered.decision;
  if (offered.decision === "mulligan") {
    const reshuffled = shuffle(
      [...player.hand, ...player.deck],
      state.rngState,
    );
    player.hand = reshuffled.items.slice(0, 5);
    player.deck = reshuffled.items.slice(5);
    state.rngState = reshuffled.state;
  }
  events.push({
    type: "mulligan-decided",
    playerId: activePlayer,
    decision: offered.decision,
  });
  const nextPlayerId = opponentOf(activePlayer);
  if (state.players[nextPlayerId].mulliganDecision === "pending") {
    state.activePlayer = nextPlayerId;
  } else {
    for (const setupPlayer of Object.values(state.players)) {
      // Starting Life is normally five, but a Leader prints its own value --
      // OP11-041 Nami and OP16-022 Luffy both run four -- so it is read off
      // the Leader rather than hardcoded, the same as DON!! deck size above.
      const lifeCount = db.facts(setupPlayer.leaderCardNumber).cost;
      // Dealt one at a time off the top of the deck, each on top of the last,
      // so the deck's top card ends at the bottom of Life (Bandai's rules Q&A,
      // Basic Rules 2). `life[0]` is the top card.
      setupPlayer.life.push(...setupPlayer.deck.splice(0, lifeCount).reverse());
    }
    state.phase = "main";
    state.activePlayer = nextPlayerId;
    events.push({ type: "setup-complete", activePlayer: nextPlayerId });
  }
}

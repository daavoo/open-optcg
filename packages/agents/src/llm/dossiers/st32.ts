import type { DeckStrategyDossier } from "./types.js";

export const st32Dossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Green) Roronoa Zoro - Starter Deck 32",
  archetype:
    "Green Roronoa Zoro midrange: rested-DON!! engine, board control, and repeated Leader pressure",
  gamePlan: [
    "Use Hiyori, Kin'emon, and the early curve to find and preserve the pieces for a complete Zoro turn rather than judging cards only by printed cost or Counter.",
    "Develop first when spending DON!! enables Kuina or Tashigi to attach up to 3 rested DON!! to the Leader; then rest an opposing Character, attack it with Zoro, restand Zoro, and attack the opposing Leader.",
    "Control meaningful opposing Characters while building a board, then convert the Leader restand and OP12-039 into repeated late-game Leader attacks.",
  ],
  mulligan: [
    "Prefer a playable early curve with a search or filtering effect plus Kuina or Tashigi for the Leader's three-DON!! restand line.",
    "Keep enough Counter-bearing cards to defend efficiently; avoid hands overloaded with counterless finishers and no setup.",
  ],
  priorities: [
    "Do not manually attach one or two DON!! to Zoro when three are not reachable this turn; those attachments neither enable the restand nor necessarily cross a useful attack threshold.",
    "Spend DON!! on development before using effects that move rested DON!! to Zoro. After the engine resolves, attach only remaining DON!! that crosses a Counter threshold.",
    "A Zoro attack into a Character may be worthwhile even if it cannot win the battle when declaring it enables a valuable restand and follow-up Leader attack.",
    "Use Kuina, Tashigi, Rayleigh, and X.Drake to rest valuable attackers, engines, or Blockers; do not spend control effects on a low-impact body without a concrete attack or lethal payoff.",
    "Treat Life as a resource, not free damage: take expensive early hits when the card improves the hand, but use expendable +1000 Counters on efficient attacks to preserve a late-game Life buffer and save +2000 Counters for larger thresholds.",
    "Preserve repeatable engines and the next-turn curve when choosing Counter or Kin'emon's discard; prefer the lowest strategic-value card, not simply the cheapest or most expensive card.",
  ],
  commonVariants: [
    "The official OP12 shell uses Slash searchers, Kuina, Tashigi, Mihawk, and OP12-039; competitive variants commonly add Cavendish, extra 2000-Counter cards, defensive Events, Hody Jones, or a late-game Zoro finisher.",
  ],
  commonCombos: [
    "Tashigi or Kuina rests an opposing Character and gives 3 rested DON!! to the Leader; Zoro attacks that Character, restands through the Leader effect, then attacks the opposing Leader.",
    "Holding 3 active DON!! represents OP12-039, which restands Zoro for another high-power attack and can turn a two-attack Leader turn into a finishing barrage.",
    "Mihawk restores active DON!! after development, allowing another play or preserving the DON!! needed for Zoro's Leader and Event sequence.",
  ],
  keyCardNumbers: [
    "OP12-028",
    "OP12-031",
    "OP12-026",
    "OP12-039",
    "ST32-004",
    "OP15-036",
  ],
  counterplay: [
    "Treat Tashigi and Kuina as repeatable engines: removing them before the next turn denies both a rested target and the 3-DON!! Leader setup.",
    "Count a powered Zoro Leader as multiple attacks, especially whenever 3 active DON!! remains for OP12-039.",
    "Avoid leaving a low-value Character as an easy first attack target when it lets Zoro satisfy the restand condition and preserve the later attack for Life.",
  ],
  sources: [
    {
      url: "https://en.onepiece-cardgame.com/feature/deck/deck_074.php",
      retrievedAt: "2026-08-08",
      note: "Official OP12 Zoro concept: search early, use Tashigi/Kuina to rest Characters and give 3 DON!! to Zoro, then attack a Character and Leader in one turn.",
    },
    {
      url: "https://onepiece.gg/green-roronoa-zoro-guide/",
      retrievedAt: "2026-08-08",
      note: "Competitive guide: aggressive board control, Tashigi as the core enabler, Kuina for repeatable setup and blocker resting, and a substantial 2000-Counter package.",
    },
    {
      url: "https://onepiece.gg/7-beginner-tips-to-improve-at-one-piece-tcg-quickly/",
      retrievedAt: "2026-08-08",
      note: "General fundamentals: Life is a resource, take attacks that are inefficient to counter, counter efficient attacks, preserve a Life buffer, and value card roles when spending Counters.",
    },
  ],
};

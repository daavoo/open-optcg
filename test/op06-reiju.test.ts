import { describe, expect, it } from "vitest";
import { deckManifests, deckShelf, loadDeck } from "@one-piece-sim/decks";
import { character, covers, instance, scenario } from "./support/index.js";

/**
 * The 1st-place Store Battle Blue/Purple Vinsmoke Reiju list, played through
 * its own fifty.
 *
 * Most of the list's clauses are driven in `test/op06.test.ts` and
 * `test/op07.test.ts`. What this file adds is the two {GERMA} searchers that no
 * other test claims -- OP10-063 Sanji and OP11-047 Reiju, each behind this
 * Leader and behind one their gate refuses -- and the line the deck is built
 * on: a small sibling's DON!! −1 into its namesake, which the Leader turns into
 * a card.
 */
const LIST = "(Blue/Purple) Vinsmoke Reiju - 1st Place Store Battle";
const OPPONENT = "(Red) Monkey.D.Luffy - Starter Deck 31";
/** OP12-081 Koala: a {Revolutionary Army} Leader, neither GERMA nor Vinsmoke. */
const OTHER_LEADER = "OP12-081";

/**
 * Five cards to look at, two of them {GERMA} (OP06-064 Niji and the OP06-079
 * Stage), and a sixth below them that the look never reaches.
 */
const LOOK = [
  instance("look-1", "ST31-002"),
  instance("look-niji", "OP06-064"),
  instance("look-3", "ST31-002"),
  instance("look-maria", "OP08-074"),
  instance("look-stage", "OP06-079"),
  instance("below", "ST31-002"),
];

const table = (seed: string) =>
  scenario()
    .decks(LIST, OPPONENT)
    .seed(seed)
    .atTurn(11, { active: "p1" })
    .bareTable()
    .withLeader("p1", "OP06-042");

type Game = ReturnType<ReturnType<typeof table>["build"]>;

/** The `resolve-effect` option ids open right now. */
const offered = (game: Game) =>
  game
    .legalActions()
    .filter((action) => action.type === "resolve-effect")
    .map((action) => (action as { optionId?: string }).optionId);

/** Answer every open prompt with the first of `preferred` offered, else the first offer. */
function answer(game: Game, ...preferred: string[]): void {
  let guard = 0;
  while (game.state.pendingEffect) {
    if (guard++ > 60) throw new Error("pending effect never settled");
    const options = offered(game);
    const wanted = preferred.find((id) => options.includes(id)) ?? options[0]!;
    game.play({ type: "resolve-effect", optionId: wanted });
  }
}

const ids = (cards: readonly { instanceId: string }[]) =>
  cards.map((card) => card.instanceId);

describe("the Store Battle Reiju list", () => {
  it("is a legal 50 under the OP06-042 Leader, shelved under Tournaments", () => {
    expect(loadDeck(LIST)).toHaveLength(50);
    expect(deckManifests[LIST]?.leader).toBe("OP06-042");
    expect(deckShelf(LIST)).toBe("tournament");
  });
});

describe("OP06-042 Vinsmoke Reiju: a sibling's DON!! −1 is a card", () => {
  it("draws once off OP06-068 Reiju's DON!! −1, and OP06-069 Reiju draws two more", () => {
    const game = table("op06-reiju-line")
      .withBoard("p1", [character("small-reiju", "OP06-068")])
      .withHand("p1", [instance("big-reiju", "OP06-069")])
      .withDeckTop("p1", [
        instance("leader-draw", "ST31-002"),
        instance("reiju-draw-1", "ST31-002"),
        instance("reiju-draw-2", "ST31-002"),
      ])
      .build();
    const donBefore = game.state.players.p1.donDeck.length;

    game.play({ type: "activate-main", summary: "OP06-068" });
    answer(game, "apply", "big-reiju");

    const p1 = game.state.players.p1;
    expect(p1.donDeck).toHaveLength(donBefore + 1);
    expect(ids(p1.board)).toEqual(["big-reiju"]);
    expect(ids(p1.trash)).toContain("small-reiju");
    // 9 DON!! against the opponent's 10 meets the big Reiju's condition.
    expect(ids(p1.hand).sort()).toEqual(
      ["leader-draw", "reiju-draw-1", "reiju-draw-2"].sort(),
    );
  });
});

describe("OP10-063 Vinsmoke Sanji", () => {
  covers("OP10-063", "[On Play]");

  it("adds a {GERMA} card from the top 5 and buries the rest", () => {
    const game = table("op10-063-look")
      .withHand("p1", [instance("sanji", "OP10-063")])
      .withDeckTop("p1", LOOK)
      .build();

    game.play({ type: "play-card", cardNumber: "OP10-063" });
    // Black Maria is an {Animal Kingdom Pirates} body: not on offer.
    expect(offered(game)).toEqual(["look-niji", "look-stage", "done"]);
    game.play({ type: "resolve-effect", optionId: "look-niji" });
    answer(game);

    const p1 = game.state.players.p1;
    expect(ids(p1.hand)).toEqual(["look-niji"]);
    expect(p1.deck[0]!.instanceId).toBe("below");
    expect(ids(p1.deck.slice(-4)).sort()).toEqual(
      ["look-1", "look-3", "look-maria", "look-stage"].sort(),
    );
    expect(p1.trash).toHaveLength(0);
  });

  it("looks at nothing behind a Leader whose type has no GERMA", () => {
    const game = table("op10-063-other-leader")
      .withLeader("p1", OTHER_LEADER)
      .withHand("p1", [instance("sanji", "OP10-063")])
      .withDeckTop("p1", LOOK)
      .build();
    const deckBefore = ids(game.state.players.p1.deck);

    game.play({ type: "play-card", cardNumber: "OP10-063" });
    answer(game);

    expect(ids(game.state.players.p1.board)).toEqual(["sanji"]);
    expect(game.state.players.p1.hand).toHaveLength(0);
    expect(ids(game.state.players.p1.deck)).toEqual(deckBefore);
  });
});

describe("OP11-047 Vinsmoke Reiju", () => {
  covers("OP11-047", "[On Play]");

  it("adds a {GERMA} card from the top 5 and trashes the rest", () => {
    const game = table("op11-047-look")
      .withHand("p1", [instance("reiju", "OP11-047")])
      .withDeckTop("p1", LOOK)
      .build();

    game.play({ type: "play-card", cardNumber: "OP11-047" });
    expect(offered(game)).toEqual(["look-niji", "look-stage", "done"]);
    game.play({ type: "resolve-effect", optionId: "look-stage" });
    answer(game);

    const p1 = game.state.players.p1;
    expect(ids(p1.hand)).toEqual(["look-stage"]);
    expect(ids(p1.trash).sort()).toEqual(
      ["look-1", "look-3", "look-maria", "look-niji"].sort(),
    );
    expect(p1.deck[0]!.instanceId).toBe("below");
  });

  it("looks at nothing behind a Leader without {The Vinsmoke Family}", () => {
    const game = table("op11-047-other-leader")
      .withLeader("p1", OTHER_LEADER)
      .withHand("p1", [instance("reiju", "OP11-047")])
      .withDeckTop("p1", LOOK)
      .build();
    const deckBefore = ids(game.state.players.p1.deck);

    game.play({ type: "play-card", cardNumber: "OP11-047" });
    answer(game);

    expect(ids(game.state.players.p1.board)).toEqual(["reiju"]);
    expect(game.state.players.p1.hand).toHaveLength(0);
    expect(game.state.players.p1.trash).toHaveLength(0);
    expect(ids(game.state.players.p1.deck)).toEqual(deckBefore);
  });
});

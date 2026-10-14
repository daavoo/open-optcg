import { describe, expect, it } from "vitest";
import { observe } from "@one-piece-sim/engine-core";
import {
  DECKS_ON_THE_GENERIC_MULLIGAN,
  RegistryRulesAgent,
  policiesForDeck,
} from "@one-piece-sim/agents/local";
import { SELECTABLE_DECK_IDS, resolveDeck } from "@one-piece-sim/decks";

import { copies, instance, scenario } from "./support/index.js";

/**
 * The opening hand, as one shape rather than twelve copies.
 *
 * `mulligan.ts` explains what the twelve copies cost; the two things worth
 * pinning as behaviour are that the extraction changed no verdict, and that the
 * decks still on the generic keep are a list someone has to shorten rather than
 * a gap that quietly reopens.
 */

const OPPONENT = "(Green) Roronoa Zoro - Starter Deck 32";

/** Every deck's Leader, in the order the app offers them. */
const leaders = SELECTABLE_DECK_IDS.map((id) => ({
  id,
  leader: resolveDeck(id).leader,
}));

/** The verdict this deck's own agent reaches on the hand as built. */
const mulliganVerdict = async (
  deck: string,
  hand: ReturnType<typeof instance>[],
): Promise<string | undefined> => {
  const game = scenario()
    .decks(deck, OPPONENT)
    .seed(`mulligan-${deck}`)
    .withHand("p1", hand)
    .allowPartialState()
    .build();
  const agent = new RegistryRulesAgent(resolveDeck(deck).leader);
  const decided = await agent.chooseAction(observe(game.state, "p1"));
  const chosen = game
    .legalActions()
    .find((action) => action.actionId === decided.actionId);
  return chosen?.type === "mulligan-decision" ? chosen.decision : undefined;
};

describe("the mulligan is registered per deck", () => {
  it("gives every deck either its own rule or a place on the admitted list", () => {
    const missing = leaders.filter(
      ({ leader }) =>
        !policiesForDeck(leader).some((module) =>
          module.id.endsWith("-mulligan"),
        ) && !DECKS_ON_THE_GENERIC_MULLIGAN.includes(leader),
    );
    expect(missing.map((entry) => `${entry.leader} ${entry.id}`)).toEqual([]);
  });

  it("holds the admitted list to a ratchet", () => {
    // The list may shrink -- that is the point of it -- and grows only with
    // this number, which is the review. A new deck arriving without a keep
    // predicate is the case this catches: an admission has to be argued for
    // here rather than fall silently through to "any card costs 2 or less".
    //
    // Moved from 3 to 4 for OP16-060 Sengoku, whose entry is the first that
    // arrives with the decision *bracketed* rather than with one flat
    // predicate: both endpoints -- keep everything, ship everything -- sit
    // inside a point of the generic keep, so the whole decision holds under a
    // point for that deck and no predicate between them could find more.
    // Registering a predicate that decides nothing is what `mulligan.ts`'s
    // OP17-079 note calls the hiding this list exists to prevent.
    //
    // Moved from 4 to 5 for ST29-001, the second bracketed entry and the first
    // whose bracket runs the other way: its three measured predicates get
    // *better* as they loosen, ending at the arm nearest the generic bound, so
    // the reading is that the generic keep is already right for that deck
    // rather than that a predicate is waiting to be found.
    //
    // Moved from 5 to 6 for OP17-099, the third bracketed entry. Both
    // endpoints and the transcribable predicate between them sit within half a
    // point of the generic keep, and the deck's decisions are somewhere else
    // entirely: its Leader spends a card out of hand on every attack, which is
    // the surface `op17-linlin` answers.
    //
    // Moved from 6 to 7 for OP15-022 Brook, the fourth bracketed entry. Both
    // endpoints and the two predicates between them sit inside two points of
    // the generic keep; the deck's decision surface is how much of its own
    // deck it trashes, which `op15-brook-deck-budget` answers.
    //
    // Moved from 7 to 8 for OP11-021 Jinbe, the fifth bracketed entry. Keep
    // everything matches the generic keep exactly, ship everything and the
    // Bandai opener predicate (Shirahoshi or Camie) sit under a point below
    // it; the deck's decisions are in the Counter step, which
    // `op11-jinbe-counter` and `op11-jinbe-defend` answer.
    expect(DECKS_ON_THE_GENERIC_MULLIGAN.length).toBeLessThanOrEqual(8);
    // Every entry names a deck that exists, so the list cannot rot into an
    // admission for a Leader nothing plays.
    for (const leader of DECKS_ON_THE_GENERIC_MULLIGAN) {
      expect(leaders.map((entry) => entry.leader)).toContain(leader);
    }
  });

  it("keeps the admitted decks on the generic keep, not on no rule", () => {
    // The other half of the ratchet: an admitted deck must have *no*
    // deck-scoped mulligan module, so `pnpm census` keeps reporting the gap
    // instead of the list hiding it.
    for (const leader of DECKS_ON_THE_GENERIC_MULLIGAN) {
      expect(
        policiesForDeck(leader).filter((module) =>
          module.id.endsWith("-mulligan"),
        ),
      ).toEqual([]);
    }
  });
});

describe("the extracted rules reach the same verdicts", () => {
  it("keeps an ST31 hand with a searcher", async () => {
    await expect(
      mulliganVerdict("(Red) Monkey.D.Luffy - Starter Deck 31", [
        instance("sunny", "ST31-005"),
        ...copies(4, "OP04-016", "manners"),
      ]),
    ).resolves.toBe("keep");
  });

  it("mulligans an ST31 hand of nothing the curve can use", async () => {
    // ST31-001 with a cheap card is a keep, but the two Events the rule
    // excludes by name are not that cheap card -- the exclusion is the part of
    // this predicate most easily lost in a refactor.
    await expect(
      mulliganVerdict("(Red) Monkey.D.Luffy - Starter Deck 31", [
        instance("luffy", "ST31-001"),
        ...copies(4, "OP04-016", "manners"),
      ]),
    ).resolves.toBe("mulligan");
  });

  it("mulligans an Enel hand of Events", async () => {
    // The deck this rule was measured on: twenty 0-cost Events satisfy the
    // generic keep, and a hand of them cannot switch the Leader on at all.
    await expect(
      mulliganVerdict("(Purple) Enel - Official Feature Deck", [
        ...copies(5, "OP15-074", "varie"),
      ]),
    ).resolves.toBe("mulligan");
  });

  it("keeps an Enel hand with an early Character", async () => {
    await expect(
      mulliganVerdict("(Purple) Enel - Official Feature Deck", [
        instance("ohm", "OP15-061"),
        ...copies(4, "OP15-074", "varie"),
      ]),
    ).resolves.toBe("keep");
  });

  it("mulligans a Xebec hand of nothing but Events", async () => {
    // The generic keep this replaces takes this hand: five 0-cost cards all
    // pass "any card costs 2 or less", and none of them is a first turn.
    await expect(
      mulliganVerdict("(Blue) Rocks.D.Xebec - Official Feature Deck", [
        ...copies(5, "OP17-055", "authority"),
      ]),
    ).resolves.toBe("mulligan");
  });

  it("mulligans a Xebec hand with a body but nothing that can defend", async () => {
    // The second half of the conjunction, which the generic rule cannot
    // express: no Character in this list prints a Counter, so a hand of
    // Characters has no answer to an attack at all.
    await expect(
      mulliganVerdict("(Blue) Rocks.D.Xebec - Official Feature Deck", [
        instance("kyo", "OP17-045"),
        ...copies(4, "OP17-040", "newgate"),
      ]),
    ).resolves.toBe("mulligan");
  });

  it("keeps a Xebec hand with an early body and a card that can say no", async () => {
    await expect(
      mulliganVerdict("(Blue) Rocks.D.Xebec - Official Feature Deck", [
        instance("kyo", "OP17-045"),
        instance("fullalead", "OP17-057"),
        ...copies(3, "OP17-040", "newgate"),
      ]),
    ).resolves.toBe("keep");
  });

  it("mulligans an ST-30 hand with no searcher", async () => {
    // Four 6000-power bodies satisfy the generic keep, but nothing in the
    // hand finds the next 6000 the deck pays its costs with.
    await expect(
      mulliganVerdict("(Red/Green) Luffy & Ace - Starter Deck 30", [
        ...copies(2, "ST30-005", "jozu"),
        ...copies(2, "ST30-013", "bentham"),
        instance("newgate", "ST30-003"),
      ]),
    ).resolves.toBe("mulligan");
  });

  it("keeps an ST-30 hand with either searcher", async () => {
    // Both halves of the keep: the Character and the Event carry the same
    // look-at-five clause, and a Character-only reading would drop ST30-017.
    await expect(
      mulliganVerdict("(Red/Green) Luffy & Ace - Starter Deck 30", [
        instance("inazuma", "ST30-002"),
        ...copies(4, "ST30-005", "jozu"),
      ]),
    ).resolves.toBe("keep");
    await expect(
      mulliganVerdict("(Red/Green) Luffy & Ace - Starter Deck 30", [
        instance("trouble", "ST30-017"),
        ...copies(4, "ST30-005", "jozu"),
      ]),
    ).resolves.toBe("keep");
  });

  it("mulligans a Shanks hand of large bodies", async () => {
    // The generic keep takes this hand on the two 0-cost Events alone; nothing
    // in it finds the rest of a list whose next Character costs 4.
    await expect(
      mulliganVerdict("(Green) Shanks - Official Feature Deck", [
        ...copies(2, "OP17-038", "ugly"),
        ...copies(3, "OP17-022", "shanks"),
      ]),
    ).resolves.toBe("mulligan");
  });

  it("keeps a Shanks hand with either searcher", async () => {
    // Both halves of the keep, since the Event and the Character are one rule
    // and a Character-only reading would drop OP17-037.
    await expect(
      mulliganVerdict("(Green) Shanks - Official Feature Deck", [
        instance("limejuice", "OP17-032"),
        ...copies(4, "OP17-022", "shanks"),
      ]),
    ).resolves.toBe("keep");
    await expect(
      mulliganVerdict("(Green) Shanks - Official Feature Deck", [
        instance("new-era", "OP17-037"),
        ...copies(4, "OP17-022", "shanks"),
      ]),
    ).resolves.toBe("keep");
  });

  it("keeps an Ace hand holding OP16-015 and nothing cheap", async () => {
    // The one keep in this set that the generic rule would have *shipped*: no
    // card under 3 cost, and the deck's best card in hand. Half the rule's
    // measured margin is this direction.
    await expect(
      mulliganVerdict("(Red) Portgas.D.Ace - Official Feature Deck", [
        instance("luffy", "OP16-015"),
        ...copies(4, "OP17-005", "newgate"),
      ]),
    ).resolves.toBe("keep");
  });

  it("mulligans an Ace hand whose only cheap card finds nothing", async () => {
    // OP13-007 costs 1 and satisfies the generic keep, but it is a
    // self-trashing -3000 rather than a turn, and it searches for nothing.
    await expect(
      mulliganVerdict("(Red) Portgas.D.Ace - Official Feature Deck", [
        instance("asl", "OP13-007"),
        ...copies(4, "OP17-005", "newgate"),
      ]),
    ).resolves.toBe("mulligan");
  });

  it("keeps an Ace hand with a searcher and an 8000 body", async () => {
    await expect(
      mulliganVerdict("(Red) Portgas.D.Ace - Official Feature Deck", [
        instance("garp", "OP13-016"),
        instance("thatch", "OP16-005"),
        ...copies(3, "OP17-005", "newgate"),
      ]),
    ).resolves.toBe("keep");
  });

  it("still tells the two OP13-004 decks apart", async () => {
    // The bug the shared module exists to make unreachable: each Sabo list's
    // keep names cards the other does not contain, so an ungated rule discards
    // every opening hand of the deck it does not belong to. Both directions.
    await expect(
      mulliganVerdict("(Red/Black) Sabo - OP17 Elbaph List", [
        instance("saul", "OP17-089"),
        ...copies(4, "OP17-095", "zoro"),
      ]),
    ).resolves.toBe("keep");
    await expect(
      mulliganVerdict("(Red/Black) Sabo - Starter Deck 35", [
        instance("koala", "ST35-004"),
        ...copies(4, "OP13-005", "inazuma"),
      ]),
    ).resolves.toBe("keep");
  });
});

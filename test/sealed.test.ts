import { describe, expect, it } from "vitest";
import { cardRegistry, unimplementedClauses } from "@one-piece-sim/cards";
import {
  autoBuildSealedDeck,
  loadDeckManifest,
  openPacks,
  playablePoolCards,
  poolCounts,
  sealedDeckManifest,
  sealedPoolCoverage,
  sealedCardsByRarity,
  sealedPoolIsBuildable,
  sealedSideboard,
  validateSealedDeck,
  BOOSTER_PACK,
  DEFAULT_SEALED_EXPANSION,
  SEALED_DECK_SIZE,
  SEALED_EXPANSIONS,
  SEALED_LEADER,
  resolveDeck,
} from "@one-piece-sim/decks";
import { GameService } from "@one-piece-sim/engine-core";
import {
  RegistryRulesAgent,
  acceptsSimulator,
} from "@one-piece-sim/agents/local";
import type { PlayerId } from "@one-piece-sim/protocol";

const PACK_SIZE = BOOSTER_PACK.reduce((sum, slot) => sum + slot.count, 0);

describe("sealed booster packs", () => {
  it("opens a 12-card pack and a 72-card six-pack pool", () => {
    expect(PACK_SIZE).toBe(12);
    const pool = openPacks("seed-a", 6);
    expect(pool.packs).toHaveLength(6);
    for (const pack of pool.packs) expect(pack).toHaveLength(PACK_SIZE);
    expect(pool.cards).toHaveLength(72);
  });

  it("is reproducible from its seed and varies between seeds", () => {
    expect(openPacks("seed-a", 6).cards).toEqual(openPacks("seed-a", 6).cards);
    expect(openPacks("seed-b", 6).cards).not.toEqual(
      openPacks("seed-a", 6).cards,
    );
  });

  it("never repeats a card inside one pack", () => {
    // A real booster cannot contain the same card twice. Across packs it can,
    // and sealed explicitly allows 5+ copies of a card in a deck.
    for (const seed of ["s1", "s2", "s3", "s4", "s5"]) {
      for (const pack of openPacks(seed, 6).packs) {
        expect(new Set(pack).size).toBe(pack.length);
      }
    }
  });

  it("gives every pack exactly one Leader and at least one Rare or better", () => {
    for (const pack of openPacks("rarity-seed", 6).packs) {
      const rarities = pack.map((id) => cardRegistry.get(id)!.rarity);
      expect(rarities.filter((rarity) => rarity === "L")).toHaveLength(1);
      expect(
        rarities.filter((rarity) => ["R", "SR", "SEC"].includes(rarity!))
          .length,
      ).toBeGreaterThanOrEqual(1);
    }
  });

  it("draws only from the expansion it was asked for, and records which", () => {
    for (const { code } of SEALED_EXPANSIONS) {
      const pool = openPacks("set-seed", 6, code);
      expect(pool.expansion).toBe(code);
      for (const cardNumber of pool.cards) {
        expect(cardNumber.startsWith(`${code}-`)).toBe(true);
      }
    }
  });

  it("opens a different pool per expansion from the same seed", () => {
    const pools = SEALED_EXPANSIONS.map(({ code }) =>
      openPacks("shared-seed", 6, code).cards.join(","),
    );
    expect(new Set(pools).size).toBe(SEALED_EXPANSIONS.length);
  });

  it("refuses an expansion sealed does not support", () => {
    // OP09 is in the pool as the handful of identities some community decks
    // play, which is exactly what disqualifies it: no printed rarity for most of
    // the set, so no pack can be built from it. It was OP13 here until OP13 was
    // imported whole.
    expect(() => openPacks("nope", 6, "OP09")).toThrow(
      "UNKNOWN_SEALED_EXPANSION",
    );
  });

  it("produces duplicates across packs, which sealed permits", () => {
    const counts = poolCounts(openPacks("dupe-seed", 6));
    expect([...counts.values()].some((count) => count > 1)).toBe(true);
  });
});

/**
 * The two things {@link SEALED_EXPANSIONS} membership actually asserts, checked
 * rather than trusted -- adding a set to that list is what these guard.
 */
describe("every offered expansion is one sealed can be played with", () => {
  it("carries a printed rarity for every card, in every slot a pack needs", () => {
    const needed = new Set(
      BOOSTER_PACK.flatMap((slot) =>
        slot.options.map((option) => option.rarity),
      ),
    );
    for (const { code } of SEALED_EXPANSIONS) {
      const buckets = sealedCardsByRarity(code);
      for (const rarity of needed) {
        expect(
          buckets.get(rarity)?.length ?? 0,
          `${code} ${rarity}`,
        ).toBeGreaterThan(0);
      }
      // Every card of the set, not just the ones a slot happens to want: a
      // card with no rarity is a card no pack can ever contain.
      const withRarity = [...buckets.values()].flat().length;
      const inRegistry = [...cardRegistry.keys()].filter((cardNumber) =>
        cardNumber.startsWith(`${code}-`),
      ).length;
      expect(withRarity, code).toBe(inRegistry);
    }
  });

  it("shares the SR population BOOSTER_PACK's hit slot is priced for", () => {
    // Ten SR per set is what the hit slot's weights were measured against, and
    // every expansion offered shares it.
    //
    // The Secret count is deliberately *not* pinned to two. A slot resolves a
    // rarity first and only then draws a card from that bucket without
    // replacement -- see `openPacks` -- so how many SEC card numbers a set has
    // changes *which* Secret a lucky pack contains, not how often one appears.
    // OP13 carries three (it is 120 cards where the rest are 119, and the extra
    // one is a third Secret rather than a seventh Leader), and the published
    // rates the hit slot encodes still apply to it unchanged. What has to hold
    // is that the bucket is not empty, which the composition test above checks
    // for every rarity a slot can ask for.
    for (const { code } of SEALED_EXPANSIONS) {
      const buckets = sealedCardsByRarity(code);
      expect(buckets.get("SR")?.length, code).toBe(10);
      expect(buckets.get("SEC")?.length ?? 0, code).toBeGreaterThanOrEqual(2);
    }
  });

  it("reaches a legal 40-card deck from a genuine six-pack pool", () => {
    for (const { code } of SEALED_EXPANSIONS) {
      const pool = openPacks(`buildable:${code}`, 6, code);
      expect(sealedPoolIsBuildable(pool).buildable, code).toBe(true);
      const deck = autoBuildSealedDeck(pool);
      expect(validateSealedDeck(deck, pool).errors, code).toEqual([]);
    }
  });

  it("defaults to the newest expansion", () => {
    expect(DEFAULT_SEALED_EXPANSION).toBe(SEALED_EXPANSIONS.at(-1)!.code);
    expect(openPacks("default-seed", 6).expansion).toBe(
      DEFAULT_SEALED_EXPANSION,
    );
  });
});

describe("sealed pool coverage", () => {
  it("counts every opened main-deck card and names any partial one", () => {
    const pool = openPacks("coverage", 6);
    const coverage = sealedPoolCoverage(pool);
    // 72 opened minus the six Leaders, one per pack.
    expect(coverage.mainDeckCards).toBe(66);
    // A thin pool is bad luck, not missing card support: every opened card is
    // playable unless it names a clause in `UNIMPLEMENTED_CLAUSES`.
    expect(playablePoolCards(pool).size).toBeGreaterThan(0);
    for (const [cardNumber, clauses] of coverage.partialCards) {
      expect(unimplementedClauses(cardNumber), cardNumber).toEqual(clauses);
    }
  });

  it("excludes Leaders from the playable pool", () => {
    const playable = playablePoolCards(openPacks("no-leaders", 6));
    for (const cardNumber of playable.keys()) {
      expect(cardRegistry.get(cardNumber)!.category).not.toBe("leader");
    }
  });

  it("says plainly when no legal deck can be built from the pool yet", () => {
    const readiness = sealedPoolIsBuildable(openPacks("thin", 6));
    expect(readiness.playable + readiness.shortfall).toBeGreaterThanOrEqual(
      SEALED_DECK_SIZE,
    );
    if (!readiness.buildable) expect(readiness.shortfall).toBeGreaterThan(0);
  });
});

/**
 * A pool wide enough to build from.
 *
 * Six packs is the format's pool size, and every offered expansion now clears
 * 40 playable cards at six -- which the suite asserts directly above. The
 * escalation stays so these tests keep proving the *machinery* (40-card
 * legality, the wildcard Leader, a real game) independently of card coverage,
 * for the window in which a new expansion is being landed.
 */
function buildablePool(seed: string) {
  for (const packCount of [6, 10, 14, 20, 28, 40]) {
    const pool = openPacks(seed, packCount);
    if (sealedPoolIsBuildable(pool).buildable) return pool;
  }
  throw new Error("no buildable pool: too little of the set is implemented");
}

describe("sealed deck legality", () => {
  it("requires exactly 40 cards", () => {
    const pool = buildablePool("legal-1");
    const deck = autoBuildSealedDeck(pool);
    expect(validateSealedDeck(deck, pool).cardCount).toBe(SEALED_DECK_SIZE);
    expect(validateSealedDeck(deck, pool).errors).toEqual([]);

    const short = { cards: { ...deck.cards } };
    const first = Object.keys(short.cards)[0]!;
    short.cards[first] = short.cards[first]! - 1;
    expect(validateSealedDeck(short, pool).errors[0]).toContain("exactly 40");
  });

  it("allows more than 4 copies of a card, unlike constructed", () => {
    const pool = openPacks("copies", 40);
    const counts = playablePoolCards(pool);
    const many = [...counts].find(([, count]) => count >= 5);
    expect(many).toBeDefined();
    const [cardNumber] = many!;
    // 5 copies of one card plus filler to 40.
    const cards: Record<string, number> = { [cardNumber]: 5 };
    let total = 5;
    for (const [other, available] of counts) {
      if (other === cardNumber) continue;
      const take = Math.min(available, SEALED_DECK_SIZE - total);
      if (take <= 0) break;
      cards[other] = take;
      total += take;
    }
    expect(total).toBe(SEALED_DECK_SIZE);
    expect(validateSealedDeck({ cards }, pool).errors).toEqual([]);
  });

  it("rejects a card the pool never opened", () => {
    const pool = buildablePool("containment");
    const deck = autoBuildSealedDeck(pool);
    const cards = { ...deck.cards };
    const first = Object.keys(cards)[0]!;
    // Ask for one more copy than the pool holds.
    cards[first] = (poolCounts(pool).get(first) ?? 0) + 1;
    const errors = validateSealedDeck({ cards }, pool).errors;
    expect(errors.some((error) => error.includes("the pool opened"))).toBe(
      true,
    );
  });

  it("rejects a Leader in the main deck", () => {
    const pool = buildablePool("leader-in-deck");
    const leader = pool.cards.find(
      (id) => cardRegistry.get(id)!.category === "leader",
    )!;
    const errors = validateSealedDeck({ cards: { [leader]: 1 } }, pool).errors;
    expect(
      errors.some((error) => error.includes("cannot be in the main deck")),
    ).toBe(true);
  });

  it("imposes no colour restriction", () => {
    const pool = buildablePool("colours");
    const deck = autoBuildSealedDeck(pool);
    const colours = new Set(
      Object.keys(deck.cards).flatMap(
        (id) => cardRegistry.get(id)!.colors ?? [],
      ),
    );
    // The whole point of sealed: an off-colour card is still legal.
    expect(colours.size).toBeGreaterThan(1);
    expect(validateSealedDeck(deck, pool).errors).toEqual([]);
  });

  it("puts everything unused in the sideboard", () => {
    const pool = buildablePool("sideboard");
    const deck = autoBuildSealedDeck(pool);
    const sideboard = sealedSideboard(deck, pool);
    const deckTotal = Object.values(deck.cards).reduce((a, b) => a + b, 0);
    const sideTotal = [...sideboard.values()].reduce((a, b) => a + b, 0);
    expect(deckTotal + sideTotal).toBe(pool.cards.length);
  });
});

describe("a sealed deck in a real game", () => {
  it("loads as a 40-card manifest under the wildcard Leader", () => {
    const pool = buildablePool("manifest");
    const manifest = sealedDeckManifest(autoBuildSealedDeck(pool), pool);
    // The expansion is in the id, so two runs on one seed are two decks.
    expect(manifest.id).toBe(`SEALED-${pool.expansion}-${pool.seed}`);
    expect(manifest.leader).toBe(SEALED_LEADER);
    expect(manifest.deckSize).toBe(SEALED_DECK_SIZE);
    // The 50-card gate was the only thing blocking sealed; this is that fix.
    expect(loadDeckManifest(manifest)).toHaveLength(SEALED_DECK_SIZE);
  });

  it("plays a complete sealed mirror to a result", async () => {
    const pool = buildablePool("match-a");
    const other = buildablePool("match-b");
    const p1 = sealedDeckManifest(autoBuildSealedDeck(pool), pool);
    const p2 = sealedDeckManifest(autoBuildSealedDeck(other), other);

    const service = new GameService();
    let observation = service.create({
      p1: resolveDeck(p1.id, p1),
      p2: resolveDeck(p2.id, p2),
      seed: "sealed-match",
      startingPlayer: "p1",
    });
    const agents: Record<PlayerId, RegistryRulesAgent> = {
      p1: new RegistryRulesAgent(SEALED_LEADER),
      p2: new RegistryRulesAgent(SEALED_LEADER),
    };
    let actions = 0;
    while (observation.phase !== "finished" && actions < 2000) {
      const seat = observation.activePlayer;
      const agent = agents[seat];
      if (acceptsSimulator(agent)) {
        agent.useSimulator(service.simulatorFor(observation.gameId, seat));
      }
      const action = await agent.chooseAction(observation);
      observation = service.act(
        observation.gameId,
        observation.revision,
        action.actionId,
      );
      actions += 1;
    }
    expect(observation.phase).toBe("finished");
    expect(observation.winner).not.toBeNull();
  });
});

describe("the sealed Leader is not a constructed Leader", () => {
  it("is absent from the constructed editor's Leader list", async () => {
    const { supportedLeaders, validateDeck } =
      await import("../packages/web/src/deck-editor.js");
    expect(supportedLeaders.map((card) => card.cardNumber)).not.toContain(
      SEALED_LEADER,
    );

    // And cannot be smuggled in through a pasted deck list either.
    const errors = validateDeck({
      leader: SEALED_LEADER,
      cards: { "FIX-001": 50 },
    }).errors;
    expect(errors.some((error) => error.includes("designated events"))).toBe(
      true,
    );
  });
});

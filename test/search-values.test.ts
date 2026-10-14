import { describe, expect, it } from "vitest";
import {
  createSearchValueModule,
  isSearchResult,
  policiesForDeck,
  policyContext,
  REJECTED_SEARCH_TABLES,
  SEARCH_TABLES,
  tabledCards,
} from "@one-piece-sim/agents/local";
import { GameService, observe } from "@one-piece-sim/engine-core";
import { cards } from "@one-piece-sim/cards";
import {
  deckManifests,
  resolveDeck,
  SELECTABLE_DECK_IDS,
} from "@one-piece-sim/decks";
import { instance, scenario } from "./support/index.js";

/**
 * The per-deck search tables.
 *
 * The mechanism is one rule; what makes these worth having is the card knowledge
 * in them, and card knowledge rots. Two things are therefore checked against the
 * engine rather than reviewed by eye: that every card a table names is really in
 * that deck, and that every card the deck's searches really offer is named by the
 * table -- because an unnamed card ranks last whether or not that was intended,
 * which is a silent mistake rather than a loud one.
 */

/**
 * Every selectable deck on a Leader, not just the first.
 *
 * Two shipped lists share OP13-004 -- Starter Deck 35 and the OP17 Elbaph Sabo
 * list -- and `registerPolicy` keys on the Leader, so a table registered for it
 * is claimed over both. Checking against only one of them would have called the
 * Elbaph table's cards strangers.
 */
const decksFor = (leader: string): string[] =>
  SELECTABLE_DECK_IDS.filter((id) => deckManifests[id]?.leader === leader);

describe("search tables", () => {
  it("registers one module per table, addressable on its own", () => {
    for (const table of SEARCH_TABLES) {
      const ids = policiesForDeck(table.leader).map((module) => module.id);
      expect(ids).toContain(`search:${table.slug}`);
    }
  });

  it("leaves the measured-negative tables unregistered", () => {
    // Kept in the file for the next attempt, and kept *out* of the registry
    // because each one measured worse than the deck order it replaced. The
    // numbers are in `search-values.ts`.
    expect(REJECTED_SEARCH_TABLES.length).toBeGreaterThan(0);
    for (const table of REJECTED_SEARCH_TABLES) {
      const ids = policiesForDeck(table.leader).map((module) => module.id);
      expect(ids).not.toContain(`search:${table.slug}`);
    }
    const registered = new Set(SEARCH_TABLES.map((table) => table.slug));
    for (const table of REJECTED_SEARCH_TABLES) {
      expect(registered.has(table.slug)).toBe(false);
    }
  });

  it("names only cards its deck actually plays", () => {
    for (const table of [...SEARCH_TABLES, ...REJECTED_SEARCH_TABLES]) {
      const decks = decksFor(table.leader);
      expect(decks, `no deck for leader ${table.leader}`).not.toEqual([]);
      const list = new Set(decks.flatMap((id) => resolveDeck(id).cards));
      const strangers = tabledCards(table.order).filter(
        (number) => !list.has(number),
      );
      expect(strangers, `${table.slug} names cards outside its deck`).toEqual(
        [],
      );
    }
  });

  it("ranks every card in the order exactly once", () => {
    for (const table of [...SEARCH_TABLES, ...REJECTED_SEARCH_TABLES]) {
      const named = tabledCards(table.order);
      expect(new Set(named).size, `${table.slug} repeats a card`).toBe(
        named.length,
      );
      // A table with one tier has nothing to order, which would make it a no-op.
      expect(table.order.length).toBeGreaterThan(1);
    }
  });

  it("orders by position, best first", () => {
    // ST30-012 is first in the ST-30 table, ST30-008 second and ST30-013 in
    // the tied last tier, so the module must score them in that order. Written
    // against the shipped table rather than a fixture, so a reordering that
    // inverts the intent fails here.
    const game = scenario()
      .decks(
        "(Red/Green) Luffy & Ace - Starter Deck 30",
        "(Purple) Charlotte Katakuri - Starter Deck 34",
      )
      .seed("search-values")
      .atTurn(9, { active: "p1" })
      .bareTable()
      .withHand("p1", [instance("searcher", "ST30-002")])
      .withDeckTop("p1", [
        instance("sunny", "ST30-013"),
        instance("rush", "ST30-012"),
        instance("blocker", "ST30-008"),
      ])
      .build();
    game.play({ type: "play-card", cardInstanceId: "searcher" });
    const observation = observe(game.state, "p1");
    const table = SEARCH_TABLES.find(
      (candidate) => candidate.slug === "st30-luffy-ace",
    )!;
    const module = createSearchValueModule(
      table.slug,
      new Map(
        table.order.flatMap((tier, index) =>
          (typeof tier === "string" ? [tier] : tier).map(
            (number): [string, number] => [number, table.order.length - index],
          ),
        ),
      ),
    );
    const context = policyContext(observation);
    const score = new Map<string, number>();
    for (const action of observation.legalActions) {
      if (action.type !== "resolve-effect") continue;
      if (action.option.kind !== "card") continue;
      const contribution = module.rankAmong?.(context, action);
      score.set(
        action.option.card.instanceId,
        typeof contribution === "number"
          ? contribution
          : (contribution?.score ?? 0),
      );
    }

    expect(score.get("rush")!).toBeGreaterThan(score.get("blocker")!);
    expect(score.get("blocker")!).toBeGreaterThan(score.get("sunny")!);
  });

  /**
   * The coverage check, played rather than reasoned about.
   *
   * A searcher's pool is set by its printed filter, and reading those one card
   * at a time is how a table ends up missing a card that then silently ranks
   * last. Playing each deck against itself and collecting what the engine really
   * offered is the only reading that cannot drift from the cards.
   */
  it("names every card its searches actually offer", async () => {
    const missing: string[] = [];
    for (const table of SEARCH_TABLES) {
      const named = new Set(tabledCards(table.order));
      const offered = new Set<string>();
      for (const deckId of decksFor(table.leader))
        for (let index = 0; index < 6; index += 1) {
          const service = new GameService();
          let observation = service.create({
            p1: resolveDeck(deckId),
            p2: resolveDeck(deckId),
            seed: `search-values-${table.slug}-${index}`,
            startingPlayer: "random",
          });
          let steps = 0;
          while (observation.phase !== "finished" && steps < 400) {
            for (const action of observation.legalActions) {
              if (action.type !== "resolve-effect") continue;
              if (!isSearchResult(action)) continue;
              if (action.option.kind !== "card") continue;
              offered.add(action.option.card.cardNumber);
            }
            const next = observation.legalActions[0]!;
            observation = service.act(
              observation.gameId,
              observation.revision,
              next.actionId,
            );
            steps += 1;
          }
        }
      for (const number of offered) {
        if (!named.has(number)) {
          missing.push(
            `${table.slug} does not rank ${number} ${cards.require(number).name}`,
          );
        }
      }
    }

    expect(missing).toEqual([]);
  }, 120_000);
});

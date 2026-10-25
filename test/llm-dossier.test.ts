import { describe, expect, it } from "vitest";
import { hasPrintedText } from "./support/printed-text.js";
import {
  deckDossierPrompt,
  deckStrategyDossier,
  DOSSIER_DECK_IDS,
  dossierDeckIdsForLeader,
  llmMatchContext,
  opponentScoutingPrompt,
} from "@one-piece-sim/agents/llm-dossiers";
import { deckManifests, SELECTABLE_DECK_IDS } from "@one-piece-sim/decks";

describe("LLM deck dossiers", () => {
  it("lists exactly the decks the LLM seat may pilot", () => {
    // The LLM only pilots decks with a curated dossier, so the set has to
    // match the decks that actually carry one.
    expect(DOSSIER_DECK_IDS.has("(Red) Monkey.D.Luffy - Starter Deck 31")).toBe(
      true,
    );
    expect(DOSSIER_DECK_IDS.has("(Green) Roronoa Zoro - Starter Deck 32")).toBe(
      true,
    );
    expect(DOSSIER_DECK_IDS.has("(Yellow) Eustass Kid - Starter Deck 36")).toBe(
      true,
    );
    expect(
      DOSSIER_DECK_IDS.has("(Blue/Yellow) Nami - Official Feature Deck"),
    ).toBe(true);
    expect(DOSSIER_DECK_IDS.has("(Purple) Enel - Official Feature Deck")).toBe(
      true,
    );
    expect(DOSSIER_DECK_IDS.has("(Green) Shanks - Official Feature Deck")).toBe(
      true,
    );
    expect(
      DOSSIER_DECK_IDS.has(
        "(Green/Blue) Monkey.D.Luffy - Official Feature Deck",
      ),
    ).toBe(true);
    // Every dossier name corresponds to a manifest the deck select can offer.
    for (const deckId of DOSSIER_DECK_IDS) {
      expect(deckManifests[deckId]).toBeDefined();
    }
    // And every shipped deck carries one, so the opponent picker offers the
    // whole field rather than the subset that happened to be written up.
    for (const deckId of SELECTABLE_DECK_IDS) {
      expect(DOSSIER_DECK_IDS.has(deckId)).toBe(true);
    }
    // A deck the player builds still has none: nothing could have written a
    // dossier for a deck that did not exist when the app was built.
    expect(DOSSIER_DECK_IDS.has("CUSTOM-1")).toBe(false);
  });

  it("grounds every dossier in the deck it describes", () => {
    for (const deckId of DOSSIER_DECK_IDS) {
      const dossier = deckStrategyDossier(deckId);
      expect(dossier.deckId).toBe(deckId);
      expect(dossier.archetype.length).toBeGreaterThan(0);
      expect(dossier.gamePlan.length).toBeGreaterThan(0);
      expect(dossier.counterplay.length).toBeGreaterThan(0);
      // A named card has to be one the deck actually plays, or the seat is
      // being briefed on a card it will never draw.
      const manifest = deckManifests[deckId]!;
      for (const cardNumber of dossier.keyCardNumbers) {
        expect(
          manifest.cards[cardNumber] ??
            (manifest.leader === cardNumber ? 1 : 0),
        ).toBeGreaterThan(0);
      }
    }
  });

  it("describes the exact base ST31 manifest", () => {
    const manifest = deckManifests["(Red) Monkey.D.Luffy - Starter Deck 31"]!;
    const dossier = deckDossierPrompt(
      "(Red) Monkey.D.Luffy - Starter Deck 31",
      manifest,
    ) as {
      strategy: {
        deckId: string;
        archetype: string;
        gamePlan: string[];
        priorities: string[];
      };
      cards: Array<{ cardNumber: string; count: number; effect: string }>;
    };

    expect(dossier.strategy.deckId).toBe(
      "(Red) Monkey.D.Luffy - Starter Deck 31",
    );
    expect(dossier.strategy.archetype).toContain("Base ST31");
    expect(dossier.cards.reduce((total, card) => total + card.count, 0)).toBe(
      50,
    );
    const sanji = dossier.cards.find((card) => card.cardNumber === "ST31-001");
    expect(sanji?.count).toBe(2);
    if (hasPrintedText()) expect(sanji?.effect).toContain("[On Play]");
    else expect(sanji?.effect).toBeUndefined();
    expect(dossier.strategy.gamePlan.join(" ")).toContain(
      "Sanji can free-play Chopper",
    );
    expect(dossier.strategy.priorities.join(" ")).toContain(
      "prioritize Jinbe from searches",
    );
  });

  it("labels the seat's own weaknesses rather than nesting them in its plan", () => {
    // `counterplay` is "how to beat this deck". Left inside the seat's own
    // strategy it read as an instruction to remove its own Sanji.
    const dossier = deckDossierPrompt(
      "(Red) Monkey.D.Luffy - Starter Deck 31",
      deckManifests["(Red) Monkey.D.Luffy - Starter Deck 31"]!,
    ) as {
      strategy: { priorities: string[]; counterplay?: unknown };
      howOpponentsBeatThisDeck: string[];
    };

    expect(dossier.strategy.counterplay).toBeUndefined();
    expect(dossier.howOpponentsBeatThisDeck.join(" ")).toContain(
      "Remove or rest Sanji",
    );
    // Matchup guidance belongs to the opponent's dossier, not to a deck's own
    // priorities, which are served in every matchup.
    expect(dossier.strategy.priorities.join(" ")).not.toContain(
      "(Yellow) Eustass Kid - Starter Deck 36",
    );
  });

  it("carries ST36 matchup guidance on ST36's own counterplay", () => {
    const context = llmMatchContext(
      "(Red) Monkey.D.Luffy - Starter Deck 31",
      deckManifests["(Red) Monkey.D.Luffy - Starter Deck 31"]!,
      "(Yellow) Eustass Kid - Starter Deck 36",
      deckManifests["(Yellow) Eustass Kid - Starter Deck 36"]!,
    ) as { opponentScouting: { counterplay: string[] } };

    expect(context.opponentScouting.counterplay.join(" ")).toContain(
      "largest Rush attacker in searches",
    );
  });

  it("gives the LLM its exact deck but only public opponent scouting", () => {
    const context = llmMatchContext(
      "(Red) Monkey.D.Luffy - Starter Deck 31",
      deckManifests["(Red) Monkey.D.Luffy - Starter Deck 31"]!,
      "(Green) Roronoa Zoro - Starter Deck 32",
      deckManifests["(Green) Roronoa Zoro - Starter Deck 32"]!,
    ) as {
      selfDeck: { cards: Array<{ count: number }> };
      opponentScouting: {
        scope: string;
        leader: { cardNumber: string; effect: string };
        commonKeyCards: Array<{ cardNumber: string; effect: string }>;
        commonCombos: string[];
        cards?: unknown;
      };
    };

    expect(
      context.selfDeck.cards.reduce((total, card) => total + card.count, 0),
    ).toBe(50);
    expect(context.opponentScouting.leader.cardNumber).toBe("OP12-020");
    if (hasPrintedText()) {
      expect(context.opponentScouting.leader.effect).toContain(
        "set this Leader",
      );
    }
    expect(context.opponentScouting.commonCombos.join(" ")).toContain(
      "Tashigi or Kuina",
    );
    expect(
      context.opponentScouting.commonKeyCards.map((card) => card.cardNumber),
    ).toContain("OP12-039");
    expect(context.opponentScouting.scope).toContain("not the opponent's");
    expect(context.opponentScouting.cards).toBeUndefined();
  });

  it("tells both seats which constructed format a list is built for", () => {
    // Every shipped list is Standard, so the Extra half is exercised with a
    // deck built the way a player would build one -- which is the only way an
    // Extra list reaches a seat now.
    const standardDeckId = "(Red/Black) Sabo - OP17 Elbaph List";
    const standard = deckDossierPrompt(
      standardDeckId,
      deckManifests[standardDeckId]!,
    ) as { format: string };
    expect(standard.format).toContain("Standard");

    const extraManifest = {
      ...deckManifests["(Green) Roronoa Zoro - OP17 Post-Ban List"]!,
      format: "extra" as const,
    };
    const extra = deckDossierPrompt(extraManifest.id, extraManifest) as {
      format: string;
    };
    expect(extra.format).toContain("Extra Regulation");
    expect(extra.format).toContain("rotated out of Standard");

    // The scouting half says it too: the opponent's format is public.
    expect(
      (
        opponentScoutingPrompt(extraManifest.id, extraManifest) as {
          format: string;
        }
      ).format,
    ).toContain("Extra Regulation");
  });

  it("provides exact deck context and curated scouting for OP16 Nami", () => {
    const deckId = "(Blue/Yellow) Nami - Official Feature Deck";
    const manifest = deckManifests[deckId]!;
    const dossier = deckDossierPrompt(deckId, manifest) as {
      strategy: {
        archetype: string;
        gamePlan: string[];
        priorities: string[];
        commonCombos: string[];
        keyCardNumbers: string[];
        sources: Array<{ url: string }>;
      };
      cards: Array<{ cardNumber: string; count: number }>;
    };

    expect(dossier.strategy.archetype).toContain("Blue/Yellow Nami");
    expect(dossier.strategy.gamePlan.join(" ")).toContain("7 or fewer");
    expect(dossier.strategy.priorities.join(" ")).toContain(
      "Kumacy as a 2000 Counter",
    );
    expect(dossier.strategy.priorities.join(" ")).toContain(
      "not routine 1-cost development",
    );
    expect(dossier.strategy.commonCombos.join(" ")).toContain(
      "Gecko Moria's low-opportunity-cost face-up Life target",
    );
    expect(dossier.strategy.keyCardNumbers).toContain("OP11-106");
    expect(dossier.strategy.sources.map((source) => source.url)).toContain(
      "https://www.shonentcg.com/blog/one-piece-tcg-nami-deck-guide",
    );
    expect(dossier.cards.reduce((total, card) => total + card.count, 0)).toBe(
      50,
    );
    expect(
      dossier.cards.find((card) => card.cardNumber === "OP11-106")?.count,
    ).toBeGreaterThan(0);
  });

  it("describes Enel's playable gift and finisher sequence", () => {
    const deckId = "(Purple) Enel - Official Feature Deck";
    const dossier = deckDossierPrompt(deckId, deckManifests[deckId]!) as {
      strategy: {
        gamePlan: string[];
        mulligan: string[];
        priorities: string[];
      };
    };

    expect(dossier.strategy.gamePlan.join(" ")).toContain(
      "OP15-118 cannot be the gift target yet",
    );
    expect(dossier.strategy.gamePlan.join(" ")).toContain(
      "it has no Rush and cannot attack that turn",
    );
    expect(dossier.strategy.mulligan.join(" ")).toContain(
      "do not throw back a functional vassal opening solely because it is missing",
    );
    expect(dossier.strategy.priorities.join(" ")).toContain(
      "Character that can still attack this turn",
    );
  });
});

describe("the dossier a deck the player built borrows", () => {
  const ST31 = "(Red) Monkey.D.Luffy - Starter Deck 31";

  it("finds the shipped decks that play one Leader", () => {
    // A custom list has no dossier and never can, but it has a Leader, and
    // that is enough to say whose plan pilots it.
    const leader = deckManifests[ST31]!.leader;
    expect(dossierDeckIdsForLeader(leader)).toContain(ST31);
  });

  it("names only decks that carry a dossier", () => {
    for (const deckId of SELECTABLE_DECK_IDS) {
      const leader = deckManifests[deckId]!.leader;
      for (const borrowed of dossierDeckIdsForLeader(leader)) {
        expect(DOSSIER_DECK_IDS.has(borrowed)).toBe(true);
      }
    }
  });

  it("finds nothing for a Leader no shipped deck plays", () => {
    expect(dossierDeckIdsForLeader("OP99-999")).toEqual([]);
  });
});

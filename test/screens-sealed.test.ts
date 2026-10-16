import { describe, expect, it } from "vitest";
import {
  DEFAULT_SEALED_EXPANSION,
  SEALED_EXPANSIONS,
  requireSealedExpansion,
} from "@one-piece-sim/decks";
import { escapeHtml } from "../packages/web/src/card-text.js";
import { openSealedPool } from "../packages/web/src/sealed-mode.js";
import {
  beginRun,
  emptyState,
  normalizeOpponentController,
  renderBuilder,
  renderLobby,
  type SealedContext,
  type SealedState,
} from "../packages/web/src/screens/sealed.js";

function stubContext(overrides: Partial<SealedContext> = {}): SealedContext {
  return {
    renderCardDetailDialog: () => "",
    bindCardDetailDialog: () => {},
    renderImportDialog: () => "",
    bindImportDialog: () => {},
    openImportDialog: () => {},
    applyTheme: () => {},
    beginMatch: () => {},
    randomSeed: () => "match-test",
    scorerAvailable: () => false,
    rerender: () => {},
    goHome: () => {},
    ...overrides,
  };
}

function runningState(
  expansion: string = DEFAULT_SEALED_EXPANSION,
): SealedState {
  const state = emptyState();
  state.expansion = expansion;
  const { pool, packsOpened } = openSealedPool("sealed-test-seed", expansion);
  const { pool: opponentPool, packsOpened: opponentPacksOpened } =
    openSealedPool("sealed-test-opponent-seed", expansion);
  state.run = {
    seed: pool.seed,
    pool,
    packsOpened,
    opponentSeed: "sealed-test-opponent-seed",
    opponentPool,
    opponentPacksOpened,
    deck: {},
    opponentController: "rules",
  };
  return state;
}

describe("sealed screen render", () => {
  it("renders the pack-opening lobby on the newest expansion", () => {
    const state = emptyState();
    const html = renderLobby(state, stubContext());
    expect(html).toContain("sealed-shell");
    expect(html).toContain('id="sealed-form"');
    expect(html).toContain('id="sealed-import"');
    expect(state.expansion).toBe(DEFAULT_SEALED_EXPANSION);
    expect(html).toContain(
      escapeHtml(requireSealedExpansion(DEFAULT_SEALED_EXPANSION).title),
    );
  });

  it("offers every supported expansion in the picker, and marks the pick", () => {
    const state = emptyState();
    state.expansion = "OP15";
    const html = renderLobby(state, stubContext());
    for (const expansion of SEALED_EXPANSIONS) {
      expect(html).toContain(`data-pick-expansion="${expansion.code}"`);
    }
    expect(html).toContain(
      'data-pick-expansion="OP15"\n      aria-pressed="true"',
    );
    // The choice card shows the pick, not the default.
    expect(html).toContain(escapeHtml(requireSealedExpansion("OP15").title));
  });

  it("corrects a stored pick that names no expansion this build ships", () => {
    // OP09 rather than a set code that might later be imported whole: the
    // scenario is a stored pick from a build that offered something this one does
    // not, and OP09 is in the pool only as the identities a few community decks
    // play. It was OP13 here until OP13 became an expansion.
    const state = emptyState();
    state.expansion = "OP09";
    const html = renderLobby(state, stubContext());
    expect(state.expansion).toBe(DEFAULT_SEALED_EXPANSION);
    expect(html).not.toContain('data-pick-expansion="OP09"');
  });

  it("renders nothing for the builder when no run has started", () => {
    expect(renderBuilder(emptyState(), stubContext())).toBe("");
  });

  it("renders the builder with the opened pool once a run exists", () => {
    const html = renderBuilder(runningState(), stubContext());
    expect(html).toContain("deck-editor-shell");
    expect(html).toContain('id="sealed-start"');
    expect(html).toContain("Heuristics");
    expect(html).not.toContain("Rules AI");
  });

  it("names the run's own expansion in the builder, not the newest", () => {
    const state = runningState("OP14");
    const html = renderBuilder(state, stubContext());
    const expansion = requireSealedExpansion("OP14");
    expect(html).toContain(expansion.productCode);
    expect(html).toContain(escapeHtml(expansion.title));
    expect(html).not.toContain(
      escapeHtml(requireSealedExpansion(DEFAULT_SEALED_EXPANSION).title),
    );
  });

  /**
   * The strongest pilot the build can actually offer, which is the reasoning
   * the 1v1 lobby's default follows.
   */
  describe("the opponent a fresh run defaults to", () => {
    const opened = (ctx: Partial<SealedContext>) => {
      const state = emptyState();
      const { pool, packsOpened } = openSealedPool("default-pilot-seed");
      beginRun(state, stubContext(ctx), pool, packsOpened, {});
      return state.run!.opponentController;
    };

    it("is the learned model where the build carries one", () => {
      expect(opened({ scorerAvailable: () => true })).toBe("scorer");
    });

    it("falls to the rules agent where this build ships no model", () => {
      expect(opened({ scorerAvailable: () => false })).toBe("rules");
    });
  });

  it("falls back to the rules agent when the learned model never arrives", () => {
    // The hosted page fetches the model after it draws, so a run can begin on
    // the learned model and then lose it.
    const state = runningState();
    state.run!.opponentController = "scorer";
    normalizeOpponentController(
      state,
      stubContext({ scorerAvailable: () => false }),
    );
    expect(state.run!.opponentController).toBe("rules");
  });

  it("offers the learned model beside Heuristics, and no LLM", () => {
    const state = runningState();
    state.run!.opponentController = "scorer";
    const html = renderBuilder(
      state,
      stubContext({ scorerAvailable: () => true }),
    );
    expect(html).toContain(
      '<option value="scorer" selected>Learned model</option>',
    );
    expect(html).toContain('<option value="rules" ');
    expect(html).not.toContain('value="llm"');
  });

  it("shows an inline message when one is set", () => {
    const state = runningState();
    state.message = "Deck list imported.";
    const html = renderBuilder(state, stubContext());
    expect(html).toContain("Deck list imported.");
  });
});

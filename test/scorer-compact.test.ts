/**
 * The small scorer's in-app half: the compact encoding of a decision, the
 * CPU forward pass, and the seat that plays it.
 *
 * The trained weights are a personal-build asset and never in the repo, so
 * the model is checked on a tiny pack with deterministic weights: what must
 * hold for any weights -- probabilities over exactly the offered options,
 * unchanged by the order the options or cards arrive in -- and that the seat
 * finishes a real game choosing only legal actions. ml's
 * `bridge/parity-compact.ts` checks a trained pack against MLX.
 */
import { describe, expect, it } from "vitest";
import { createGame, observe } from "@one-piece-sim/engine-core";
import { cardRegistry } from "@one-piece-sim/cards";
import { resolveDeck } from "@one-piece-sim/decks";
import {
  CompactModel,
  CompactScorerAgent,
  adapterFor,
  compactDecision,
  loadCompact,
  prunedActions,
  type CompactAdapter,
  type CompactDecision,
  type CompactPack,
} from "@one-piece-sim/agents/scorer";
import {
  GLOBAL_NUMBERS,
  OPTION_COST_COLUMN,
  OPTION_NUMBERS,
  OPTION_PAYOFF_COLUMN,
  V1_ZONES,
  V2_GLOBAL_NUMBERS,
  V2_ZONES,
  V3_OPTION_NUMBERS,
  ZONES,
  leaderPrior,
} from "../packages/agents/src/scorer/compact.js";
import { PAYOFF_KINDS } from "@one-piece-sim/protocol";
import { roundHalf } from "../packages/agents/src/scorer/compact-model.js";
import type { Tensor } from "../packages/agents/src/scorer/model.js";
import { character, scenario, submit } from "./support/index.js";

const ROWS = new Map(
  [...cardRegistry.keys()].sort().map((number, row) => [number, row]),
);
const CARDS = [...ROWS.keys()];

/** A one-layer, width-8 model's tensors from a fixed sequence, each a
    multiple of 2^-10 so float16 holds it exactly; `zones` is its zone table,
    `globals` the global numbers it reads and `options` its option numbers. */
function tinyTensors(
  zones: number = ZONES.length,
  globals: number = GLOBAL_NUMBERS,
  options: number = OPTION_NUMBERS,
): Map<string, Tensor> {
  const d = 8;
  let seed = 7;
  const next = () => {
    seed = (seed * 1103515245 + 12345) >>> 0;
    return Math.round((seed / 2 ** 32 - 0.5) * 0.4 * 1024) / 1024;
  };
  const tensors = new Map<string, Tensor>();
  const add = (name: string, shape: number[]) => {
    const data = new Float32Array(shape.reduce((a, b) => a * b, 1));
    for (let i = 0; i < data.length; i += 1) data[i] = next();
    tensors.set(name, { data, shape });
  };
  const linear = (name: string, input: number, output: number) => {
    add(`${name}.w`, [input, output]);
    add(`${name}.b`, [output]);
  };
  const mlp = (name: string, input: number) => {
    linear(`${name}.layers.0`, input, d);
    linear(`${name}.layers.2`, d, d);
  };
  const norm = (name: string) => {
    tensors.set(`${name}.weight`, {
      data: new Float32Array(d).fill(1),
      shape: [d],
    });
    tensors.set(`${name}.bias`, { data: new Float32Array(d), shape: [d] });
  };
  add("card.weight", [CARDS.length + 1, d]);
  add("zone.weight", [zones, d]);
  add("type.weight", [11, d]);
  add("kind.weight", [12, d]);
  mlp("card_num", 20);
  mlp("glob", globals);
  mlp("option_num", options);
  for (const name of ["option_card", "searched_card", "ptr1", "ptr2"])
    linear(name, d, d);
  norm("blocks.0.norm1");
  linear("blocks.0.qkv", d, 3 * d);
  linear("blocks.0.out", d, d);
  norm("blocks.0.norm2");
  linear("blocks.0.ff.layers.0", d, 4 * d);
  linear("blocks.0.ff.layers.2", 4 * d, d);
  norm("norm");
  mlp("policy", d);
  linear("policy_out", d, 1);
  mlp("value", d);
  linear("value_out", d, 1);
  return tensors;
}

const TINY_CONFIG = { d: 8, layers: 1, heads: 2, cards: CARDS.length };

/** `tinyTensors` as a model; 16 zones is a model of the version-1 encoding,
    31 global numbers one of the version-2 encoding, 28 option numbers one of
    the version-3 encoding. */
function tinyModel(
  zones: number = ZONES.length,
  globals: number = GLOBAL_NUMBERS,
  options: number = OPTION_NUMBERS,
): CompactModel {
  return new CompactModel(
    TINY_CONFIG,
    tinyTensors(zones, globals, options),
    CARDS,
    zones === V1_ZONES ? zones : undefined,
  );
}

function battlePosition() {
  const game = scenario()
    .decks(
      "(Red) Monkey.D.Luffy - Starter Deck 31",
      "(Green) Roronoa Zoro - Starter Deck 32",
    )
    .seed("scorer-compact")
    .atTurn(5, { active: "p1" })
    .bareTable()
    .withBoard("p1", [
      character("brook", "ST31-003"),
      character("other", "ST31-002"),
    ])
    .withBoard("p2", [character("defender", "ST32-002")])
    .build();
  const observation = observe(game.state, "p1");
  const pruned = prunedActions(observation);
  return {
    observation,
    offered: observation.legalActions.filter((_, i) => !pruned.has(i)),
  };
}

describe("compact scorer encoding", () => {
  it("writes one option row per offered action, pointing at the cards it acts on", () => {
    const { observation, offered } = battlePosition();
    const decision = compactDecision(observation, offered, ROWS);
    expect(decision.options).toHaveLength(offered.length);
    expect(decision.global).toHaveLength(GLOBAL_NUMBERS);
    for (const row of decision.cards) expect(row).toHaveLength(22);
    for (const row of decision.options) {
      expect(row).toHaveLength(5 + OPTION_NUMBERS);
      for (const ptr of [row[2]!, row[3]!]) {
        expect(ptr).toBeGreaterThanOrEqual(-1);
        expect(ptr).toBeLessThan(decision.cards.length);
      }
    }
    // Every visible card resolves to a row of the card table.
    for (const row of decision.cards) expect(row[0]).toBeGreaterThanOrEqual(0);
    // The Leader's attack points at my Leader (zone 0) and theirs (zone 4).
    const attack = offered.findIndex(
      (action) =>
        action.type === "attack" &&
        action.attackerInstanceId === "p1-leader" &&
        action.targetInstanceId === "p2-leader",
    );
    expect(attack).toBeGreaterThanOrEqual(0);
    const [, , attacker, target] = decision.options[attack]!;
    expect(decision.cards[attacker!]![1]).toBe(0);
    expect(decision.cards[target!]![1]).toBe(4);
    // Giving Brook a DON!! points at Brook, a board card of mine (zone 2).
    const give = offered.findIndex(
      (action) =>
        action.type === "attach-don" && action.targetInstanceId === "brook",
    );
    expect(give).toBeGreaterThanOrEqual(0);
    const recipient = decision.options[give]![2]!;
    expect(decision.cards[recipient]![0]).toBe(ROWS.get("ST31-003"));
    expect(decision.cards[recipient]![1]).toBe(2);
  });
});

/** Copies per card number of a catalog deck: what its pilot knows of it. */
function listOf(deckId: string): Record<string, number> {
  const list: Record<string, number> = {};
  for (const number of resolveDeck(deckId).cards)
    list[number] = (list[number] ?? 0) + 1;
  return list;
}

const zoneOf = (name: (typeof ZONES)[number]) => ZONES.indexOf(name);

describe("compact scorer encoding, version 2", () => {
  const own = listOf("(Red) Monkey.D.Luffy - Starter Deck 31");

  it("appends its zones after every version-1 token, and no option points at them", () => {
    const { observation, offered } = battlePosition();
    const decision = compactDecision(observation, offered, ROWS, {
      ownDeck: own,
    });
    const zones = decision.cards.map((row) => row[1]!);
    const firstNew = zones.findIndex((zone) => zone >= V1_ZONES);
    expect(firstNew).toBeGreaterThan(0);
    expect(zones.slice(firstNew).every((zone) => zone >= V1_ZONES)).toBe(true);
    for (const row of decision.options)
      for (const ptr of [row[2]!, row[3]!]) expect(ptr).toBeLessThan(firstNew);
  });

  it("counts my own unseen copies: my list less every copy in view", () => {
    const { observation, offered } = battlePosition();
    const decision = compactDecision(observation, offered, ROWS, {
      ownDeck: own,
    });
    const inView = (number: string) =>
      [
        ...observation.self.hand,
        ...observation.self.board,
        ...observation.self.trash,
      ].filter((entry) => entry.cardNumber === number).length;
    const brook = decision.cards.find(
      (row) =>
        row[1] === zoneOf("my-unseen") && row[0] === ROWS.get("ST31-003"),
    );
    expect(inView("ST31-003")).toBeGreaterThan(0);
    // Column 8 of a plain row is its count.
    expect(brook?.[2 + 8]).toBe(own["ST31-003"]! - inView("ST31-003"));
    // A seat that is not told its list writes no unseen tokens of its own.
    const blind = compactDecision(observation, offered, ROWS);
    expect(blind.cards.some((row) => row[1] === zoneOf("my-unseen"))).toBe(
      false,
    );
  });

  it("estimates the opponent's unseen cards from the catalog by their Leader alone", () => {
    const { observation, offered } = battlePosition();
    const decision = compactDecision(observation, offered, ROWS);
    const prior = leaderPrior(observation.opponent.leader.cardNumber);
    expect(prior.size).toBeGreaterThan(0);
    const expected = (number: string) =>
      decision.cards.find(
        (row) => row[1] === zoneOf("op-unseen") && row[0] === ROWS.get(number),
      )?.[2 + 8];
    // The defender on their board is one copy fewer still unseen.
    expect(expected("ST32-002")).toBeCloseTo(prior.get("ST32-002")! - 1, 6);
    for (const row of decision.cards.filter(
      (r) => r[1] === zoneOf("op-unseen"),
    ))
      expect(row[2 + 8]).toBeGreaterThanOrEqual(0.25);
  });

  it("names the opponent's attackers since their turn began, and the hits on my Leader", async () => {
    let state = createGame({
      gameId: "scorer-compact-history",
      p1: resolveDeck("(Red) Monkey.D.Luffy - Starter Deck 31"),
      p2: resolveDeck("(Green) Roronoa Zoro - Starter Deck 32"),
      seed: "scorer-compact-history",
      startingPlayer: "p1",
    });
    // p2 attacks my Leader whenever it can; everything else takes the first offer.
    for (let step = 0; step < 2000 && state.phase !== "finished"; step += 1) {
      const view = observe(state, state.activePlayer);
      if (view.viewer === "p1") {
        const events = view.publicEvents;
        let start = 0;
        for (let i = events.length - 1; i >= 0; i -= 1) {
          const event = events[i]!;
          if (event.type === "turn-ended" && event.nextPlayerId === "p2") {
            start = i + 1;
            break;
          }
        }
        const hit = events
          .slice(start)
          .find(
            (event) =>
              event.type === "attack-declared" &&
              event.playerId === "p2" &&
              event.targetInstanceId === "p1-leader" &&
              event.attackerInstanceId === "p2-leader",
          );
        if (hit) {
          const decision = compactDecision(view, view.legalActions, ROWS);
          const attacker = decision.cards.find(
            (row) =>
              row[1] === zoneOf("op-attacker") &&
              row[0] === ROWS.get(view.opponent.leader.cardNumber),
          );
          expect(attacker).toBeDefined();
          // Column 11 counts the attacks that went at my Leader.
          expect(attacker![2 + 11]).toBeGreaterThanOrEqual(1);
          return;
        }
      }
      const attack = view.legalActions.find(
        (action) =>
          view.viewer === "p2" &&
          action.type === "attack" &&
          action.targetInstanceId === "p1-leader",
      );
      state = submit(state, attack ?? view.legalActions[0]!);
    }
    throw new Error("p2 never attacked p1's Leader");
  });

  it("is read by a version-1 model exactly as the version-1 decision", () => {
    const { observation, offered } = battlePosition();
    const decision = compactDecision(observation, offered, ROWS, {
      ownDeck: own,
    });
    const v1 = {
      ...decision,
      cards: decision.cards.filter((row) => row[1]! < V1_ZONES),
    };
    const model = tinyModel(V1_ZONES, V2_GLOBAL_NUMBERS, V3_OPTION_NUMBERS);
    const full = tinyModel(V1_ZONES, V2_GLOBAL_NUMBERS, V3_OPTION_NUMBERS);
    expect(model.score(decision).probs).toEqual(full.score(v1).probs);
  });
});

/**
 * p1 on the ST-26 list at its second ST26-005 `[When Attacking]` of the turn:
 * the first has set the Leader to 7000 and spent OP09-061's refund.
 */
function secondLuffyPayment() {
  const game = scenario()
    .decks(
      "(Purple/Black) Monkey.D.Luffy - Starter Deck 26",
      "(Green) Roronoa Zoro - Starter Deck 32",
    )
    .seed("scorer-compact-luffy")
    .atTurn(11, { active: "p1" })
    .bareTable()
    .withBoard("p1", [
      character("luffy-a", "ST26-005", { playedTurn: 1 }),
      character("luffy-b", "ST26-005", { playedTurn: 1 }),
    ])
    .withBoard("p2", [
      character("wall-a", "OP05-044", { rested: true }),
      character("wall-b", "OP05-044", { rested: true }),
    ])
    .withDonDeck("p1", 4)
    .build();
  const before = observe(game.state, "p1");
  for (const [attacker, target] of [
    ["luffy-a", "wall-a"],
    ["luffy-b", "wall-b"],
  ] as const) {
    if (attacker === "luffy-b") {
      while (game.state.pendingEffect) game.play({ type: "resolve-effect" });
      while (game.state.phase !== "main") game.play({ type: "pass" });
    }
    game.play({
      type: "attack",
      attackerInstanceId: attacker,
      targetInstanceId: target,
    });
    if (attacker === "luffy-a")
      game.play({ type: "resolve-effect", optionId: "apply" });
  }
  const observation = observe(game.state, "p1");
  return { before, observation, opponentView: observe(game.state, "p2") };
}

describe("compact scorer encoding, version 3", () => {
  it("closes the global row with each Leader's base power and spent reaction", () => {
    const { before, observation } = secondLuffyPayment();
    const tail = (o: typeof observation) =>
      compactDecision(o, o.legalActions, ROWS).global.slice(V2_GLOBAL_NUMBERS);
    // OP09-061 prints 5000; the opponent's ST32 Leader prints none of either.
    const theirs = observation.opponent.leader.power / 1000;
    expect(tail(before)).toEqual([5, 0, theirs, 0]);
    // After the first payment: 7000 in force, the refund spent -- the two
    // facts that make the second payment worth nothing.
    expect(tail(observation)).toEqual([7, 1, theirs, 0]);
  });

  it("appends its zones after every version-2 token, and no option points at them", () => {
    const { observation } = secondLuffyPayment();
    const decision = compactDecision(
      observation,
      observation.legalActions,
      ROWS,
    );
    const zones = decision.cards.map((row) => row[1]!);
    const firstNew = zones.findIndex((zone) => zone >= V2_ZONES);
    expect(firstNew).toBeGreaterThan(0);
    expect(zones.slice(firstNew).every((zone) => zone >= V2_ZONES)).toBe(true);
    for (const row of decision.options)
      for (const ptr of [row[2]!, row[3]!]) expect(ptr).toBeLessThan(firstNew);
  });

  it("records what I did this turn: attackers, DON!! returned, abilities fired", () => {
    const { observation } = secondLuffyPayment();
    const decision = compactDecision(
      observation,
      observation.legalActions,
      ROWS,
    );
    // Column 0 of a history row is the highest power, 8 the count.
    const token = (zone: (typeof ZONES)[number], number: string) =>
      decision.cards.find(
        (row) => row[1] === zoneOf(zone) && row[0] === ROWS.get(number),
      );
    // Both Luffys declared, at 7000.
    expect(token("my-attacker", "ST26-005")?.[2 + 8]).toBe(2);
    expect(token("my-attacker", "ST26-005")?.[2]).toBe(7);
    // The first payment's two DON!!, named by the card that returned them.
    expect(token("my-don-returned", "ST26-005")?.[2 + 8]).toBe(2);
    // OP09-061's refund answered it: the once-per-turn the second payment
    // would otherwise be hoping for.
    expect(token("my-activated", "OP09-061")?.[2 + 8]).toBe(1);
    expect(token("my-played", "ST26-005")).toBeUndefined();
  });

  it("writes none of them on the opponent's turn", () => {
    const { opponentView } = secondLuffyPayment();
    const decision = compactDecision(opponentView, [], ROWS);
    expect(decision.cards.some((row) => row[1]! >= V2_ZONES)).toBe(false);
  });

  it("is read by a version-2 model exactly as the version-2 decision", () => {
    const { observation } = secondLuffyPayment();
    const decision = compactDecision(
      observation,
      observation.legalActions,
      ROWS,
    );
    const v2 = {
      ...decision,
      global: decision.global.slice(0, V2_GLOBAL_NUMBERS),
      cards: decision.cards.filter((row) => row[1]! < V2_ZONES),
    };
    expect(v2.cards.length).toBeLessThan(decision.cards.length);
    const model = tinyModel(V2_ZONES, V2_GLOBAL_NUMBERS, V3_OPTION_NUMBERS);
    expect(model.score(decision).probs).toEqual(model.score(v2).probs);
  });

  it("loads a pack of every version up to its own, and none newer", () => {
    const pack = (
      compactVersion: number,
      globals: number,
      options: number = V3_OPTION_NUMBERS,
    ): CompactPack => ({
      kind: "compact",
      version: 1,
      compactVersion,
      source: "base",
      config: TINY_CONFIG,
      cards: CARDS,
      ...packed(
        tinyTensors(
          globals === GLOBAL_NUMBERS ? ZONES.length : V2_ZONES,
          globals,
          options,
        ),
      ),
    });
    const { observation } = secondLuffyPayment();
    const decision = compactDecision(
      observation,
      observation.legalActions,
      ROWS,
    );
    for (const model of [
      loadCompact(pack(2, V2_GLOBAL_NUMBERS)),
      loadCompact(pack(3, GLOBAL_NUMBERS)),
      loadCompact(pack(4, GLOBAL_NUMBERS, OPTION_NUMBERS)),
    ])
      expect(model.score(decision).probs).toHaveLength(decision.options.length);
    expect(() => loadCompact(pack(5, GLOBAL_NUMBERS, OPTION_NUMBERS))).toThrow(
      "COMPACT_ENCODING_MISMATCH",
    );
  });
});

/** EB02-061 Luffy's `[When Attacking]` prompt: return 2 active DON!! to set
    it active and add the top Life card to hand. */
function luffyRestand() {
  const game = scenario()
    .decks(
      "(Red) Monkey.D.Luffy - Starter Deck 31",
      "(Green) Roronoa Zoro - Starter Deck 32",
    )
    .seed("scorer-compact-restand")
    .atTurn(11, { active: "p1" })
    .withLeader("p1", "ST30-001")
    .withBoard("p1", [character("luffy", "EB02-061", { playedTurn: 1 })])
    .build();
  game.play({
    type: "attack",
    attackerInstanceId: "luffy",
    targetInstanceId: "p2-leader",
  });
  return observe(game.state, "p1");
}

/** [type, kind, ptr1, ptr2, row] come before an option's numbers. */
const OPTION_INDEX = 5;

describe("compact scorer encoding, version 4", () => {
  it("prices an optional by amount and names what accepting it buys", () => {
    const observation = luffyRestand();
    const decision = compactDecision(
      observation,
      observation.legalActions,
      ROWS,
    );
    const rowOf = (kind: string) =>
      decision.options[
        observation.legalActions.findIndex(
          (action) =>
            action.type === "resolve-effect" && action.option.kind === kind,
        )
      ]!.slice(OPTION_INDEX);
    const apply = rowOf("confirm");
    expect(apply.slice(OPTION_COST_COLUMN, OPTION_PAYOFF_COLUMN)).toEqual([
      2, 0, 0,
    ]);
    const bought = PAYOFF_KINDS.filter(
      (_, i) => apply[OPTION_PAYOFF_COLUMN + i] === 1,
    );
    expect(bought).toEqual(["set-active", "to-hand"]);
    expect(
      rowOf("skip")
        .slice(OPTION_COST_COLUMN)
        .every((value) => value === 0),
    ).toBe(true);
  });

  it("is read by a version-3 model exactly as the version-3 decision", () => {
    const observation = luffyRestand();
    const decision = compactDecision(
      observation,
      observation.legalActions,
      ROWS,
    );
    const v3 = {
      ...decision,
      options: decision.options.map((row) =>
        row.slice(0, OPTION_INDEX + V3_OPTION_NUMBERS),
      ),
    };
    const model = tinyModel(ZONES.length, GLOBAL_NUMBERS, V3_OPTION_NUMBERS);
    expect(model.score(decision).probs).toEqual(model.score(v3).probs);
  });
});

describe("compact scorer model", () => {
  const model = tinyModel();
  const { observation, offered } = battlePosition();
  const decision = compactDecision(observation, offered, ROWS);

  it("gives a probability to each offered option, summing to one", () => {
    const { probs, value } = model.score(decision);
    expect(probs).toHaveLength(offered.length);
    expect(probs.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
    expect(Math.abs(value)).toBeLessThanOrEqual(1);
  });

  it("scores a batch as it scores each decision alone", async () => {
    const other = compactDecision(observation, offered.slice(0, 2), ROWS);
    // Every stage's work stacked over the three, as a GPU pass runs it.
    const batch = await model.scoreMany([decision, other, decision], (stage) =>
      model.runOnCpu(stage),
    );
    for (const [k, one] of [decision, other, decision].entries()) {
      const alone = model.score(one);
      expect(batch[k]!.value).toBeCloseTo(alone.value, 6);
      batch[k]!.probs.forEach((p, i) => {
        expect(p).toBeCloseTo(alone.probs[i]!, 6);
      });
    }
  });

  it("is unchanged by the order of the options and of the cards", () => {
    const { probs } = model.score(decision);
    const reversed: CompactDecision = {
      ...decision,
      options: [...decision.options].reverse(),
    };
    const back = [...probs].reverse();
    model.score(reversed).probs.forEach((p, k) => {
      expect(p).toBeCloseTo(back[k]!, 6);
    });
    // Reverse the cards too, re-pointing every option at its card's new index.
    const C = decision.cards.length;
    const moved = (ptr: number) => (ptr < 0 ? ptr : C - 1 - ptr);
    const shuffled: CompactDecision = {
      ...decision,
      cards: [...decision.cards].reverse(),
      options: decision.options.map((row) => [
        row[0]!,
        row[1]!,
        moved(row[2]!),
        moved(row[3]!),
        ...row.slice(4),
      ]),
    };
    model.score(shuffled).probs.forEach((p, k) => {
      expect(p).toBeCloseTo(probs[k]!, 6);
    });
  });

  it("rounds its inputs to float16, as the training corpus stored them", () => {
    expect(roundHalf(0.1)).toBe(0.0999755859375);
    expect(roundHalf(3.8)).toBe(3.80078125);
    expect(roundHalf(2139)).toBe(2140);
    expect(roundHalf(-0.5)).toBe(-0.5);
    expect(roundHalf(0)).toBe(0);
  });
});

describe("compact scorer seat", () => {
  it("finishes a real game on both seats with only legal actions", async () => {
    const agent = new CompactScorerAgent(tinyModel());
    let state = createGame({
      gameId: "scorer-compact-seat",
      p1: resolveDeck("(Red) Monkey.D.Luffy - Starter Deck 31"),
      p2: resolveDeck("(Green) Roronoa Zoro - Starter Deck 32"),
      seed: "scorer-compact-seat",
      startingPlayer: "p1",
    });
    let actions = 0;
    while (state.phase !== "finished" && actions < 1500) {
      const view = observe(state, state.activePlayer);
      const chosen = await agent.chooseAction(view);
      expect(view.legalActions).toContain(chosen);
      state = submit(state, chosen);
      actions += 1;
    }
    expect(state.phase).toBe("finished");
  });
});

/** Float16 bits of a value float16 holds exactly (see `tinyTensors`). */
function halfBits(x: number): number {
  if (x === 0) return 0;
  const sign = x < 0 ? 0x8000 : 0;
  const v = Math.abs(x);
  const exponent = Math.floor(Math.log2(v));
  if (exponent < -14) return sign | Math.round(v / 2 ** -24);
  return (
    sign | ((exponent + 15) << 10) | Math.round((v / 2 ** exponent - 1) * 1024)
  );
}

/** Tensors as a pack's float16 blob and its entries. */
function packed(tensors: Map<string, Tensor>) {
  const entries: Record<string, { offset: number; shape: number[] }> = {};
  let offset = 0;
  for (const [name, { data, shape }] of tensors) {
    entries[name] = { offset, shape };
    offset += data.length;
  }
  const halves = new Uint16Array(offset);
  for (const [name, { data }] of tensors)
    data.forEach((x, i) => {
      halves[entries[name]!.offset + i] = halfBits(x);
    });
  const bytes = new Uint8Array(halves.buffer);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return { tensors: entries, data: btoa(binary) };
}

const MON = { leader: "OP09-061", cards: { "OP09-069": 4, "OP09-072": 4 } };

describe("compact scorer deck adapter", () => {
  const pack: CompactPack = {
    kind: "compact",
    version: 1,
    compactVersion: 2,
    source: "base",
    config: TINY_CONFIG,
    cards: CARDS,
    ...packed(tinyTensors()),
  };
  // A rank-1 update of one block layer: a (in 8, rank 1), b (rank 1, out 24).
  const a = new Float32Array(8).map((_, i) => (i - 3) / 8);
  const b = new Float32Array(24).map((_, j) => ((j % 5) - 2) / 4);
  const adapter = (over: Partial<CompactAdapter> = {}): CompactAdapter => ({
    kind: "compact-adapter",
    version: 1,
    deck: { id: "mon", ...MON },
    base: "base",
    source: "lora-mon",
    rank: 1,
    ...packed(
      new Map([
        ["blocks.0.qkv.a", { data: a, shape: [8, 1] }],
        ["blocks.0.qkv.b", { data: b, shape: [1, 24] }],
      ]),
    ),
    ...over,
  });
  const { observation, offered } = battlePosition();
  const decision = compactDecision(observation, offered, ROWS);

  it("plays as the base with its layer's weight plus a @ b", () => {
    const merged = tinyTensors();
    const w = merged.get("blocks.0.qkv.w")!;
    const data = new Float32Array(w.data);
    for (let i = 0; i < 8; i += 1)
      for (let j = 0; j < 24; j += 1) data[i * 24 + j]! += a[i]! * b[j]!;
    merged.set("blocks.0.qkv.w", { data, shape: w.shape });
    const expected = new CompactModel(TINY_CONFIG, merged, CARDS).score(
      decision,
    );
    const adapted = loadCompact(pack, adapter()).score(decision);
    const base = loadCompact(pack).score(decision);
    adapted.probs.forEach((p, k) => {
      expect(p).toBeCloseTo(expected.probs[k]!, 6);
    });
    expect(adapted.value).toBeCloseTo(expected.value, 6);
    expect(adapted.probs).not.toEqual(base.probs);
  });

  it("plays its own card rows in place of the base's, only where it is applied", () => {
    const row = new Float32Array(8).map((_, j) => (j - 4) / 16);
    const at = CARDS.indexOf("ST31-003");
    const merged = tinyTensors();
    const w = merged.get("blocks.0.qkv.w")!;
    const data = new Float32Array(w.data);
    for (let i = 0; i < 8; i += 1)
      for (let j = 0; j < 24; j += 1) data[i * 24 + j]! += a[i]! * b[j]!;
    merged.set("blocks.0.qkv.w", { data, shape: w.shape });
    const table = merged.get("card.weight")!;
    const rows = new Float32Array(table.data);
    rows.set(row, at * 8);
    merged.set("card.weight", { data: rows, shape: table.shape });
    const expected = new CompactModel(TINY_CONFIG, merged, CARDS).score(
      decision,
    );
    const withRows: CompactAdapter = adapter({
      cardRows: ["ST31-003"],
      ...packed(
        new Map([
          ["blocks.0.qkv.a", { data: a, shape: [8, 1] }],
          ["blocks.0.qkv.b", { data: b, shape: [1, 24] }],
          ["card.rows", { data: row, shape: [1, 8] }],
        ]),
      ),
    });
    const adapted = loadCompact(pack, withRows).score(decision);
    adapted.probs.forEach((p, k) => {
      expect(p).toBeCloseTo(expected.probs[k]!, 6);
    });
    expect(adapted.value).toBeCloseTo(expected.value, 6);
    expect(adapted.probs).not.toEqual(
      loadCompact(pack, adapter()).score(decision).probs,
    );
    // The base pack is untouched for the next seat.
    expect(loadCompact(pack).score(decision)).toEqual(
      new CompactModel(TINY_CONFIG, tinyTensors(), CARDS).score(decision),
    );
  });

  it("refuses a base pack it was not trained over", () => {
    expect(() => loadCompact(pack, adapter({ base: "other" }))).toThrow(
      "ADAPTER_BASE_MISMATCH",
    );
  });

  it("is chosen for any seat with its Leader, the closest list first", () => {
    const mon = adapter().deck;
    const list = (shared: number) => ({
      leader: mon.leader,
      cards: {
        "OP09-069": Math.min(4, shared),
        "OP09-072": Math.max(0, shared - 4),
        "ST26-003": 50 - shared,
      },
    });
    const wide: CompactAdapter = adapter({
      deck: {
        id: "mon",
        leader: mon.leader,
        cards: { "OP09-069": 4, "OP09-072": 46 },
      },
    });
    expect(adapterFor([wide], list(50))).toBe(wide);
    // A different build of the same Leader still gets it.
    expect(adapterFor([wide], list(0))).toBe(wide);
    expect(
      adapterFor([wide], { ...list(50), leader: "ST21-001" }),
    ).toBeUndefined();
    const narrower = adapter({
      deck: {
        id: "mon-old",
        leader: mon.leader,
        cards: { "OP09-069": 4, "OP09-072": 40, "OP09-076": 6 },
      },
    });
    expect(adapterFor([narrower, wide], list(50))).toBe(wide);
  });
});

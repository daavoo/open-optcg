import { describe, expect, it } from "vitest";
import {
  currentPower,
  effectiveCost,
  hasKeyword,
} from "@one-piece-sim/engine-core";

import {
  character,
  copies,
  instance,
  scenario,
  type Game,
} from "./support/index.js";

/**
 * Bandai's official Q&A for the two premium boosters and the promotion cards,
 * one case per ruling, named by the Q&A id (`<card>#<n>`, in the order each PDF
 * prints them for that card).
 *
 * Each case drives the engine to the decision the question asks about and
 * asserts Bandai's answer, so this file is the index of which rulings the
 * engine has been held to.
 *
 * Source PDFs:
 * - https://en.onepiece-cardgame.com/pdf/qa_prb01.pdf
 * - https://en.onepiece-cardgame.com/pdf/qa_prb02.pdf
 * - https://en.onepiece-cardgame.com/pdf/qa_promotion-cards.pdf
 */

/**
 * Rulings with no engine decision and no observable consequence to assert.
 */
export const NOT_ENGINE_QUESTIONS: Readonly<Record<string, string>> = {
  "P-001#1":
    "Needs a given DON!! taken off the attacker between the attack declaration and the end of its battle. Nothing in the card pool can do that: the attacker's controller has no window inside its own battle, and no opposing [Counter], [On Block] or [On Your Opponent's Attack] returns an opponent's given DON!!, so the position cannot be reached.",
};

/**
 * Cards these PDFs rule on that are not in the engine's card pool at all.
 */
export const NOT_IN_POOL: Readonly<Record<string, string>> = {
  "PRB01-001#1":
    "PRB01-001 Sanji (Leader) is not in packages/cards: PRB-01 was never imported.",
  "PRB01-001#2":
    "PRB01-001 Sanji (Leader) is not in packages/cards: PRB-01 was never imported.",
  "PRB01-001#3":
    "PRB01-001 Sanji (Leader) is not in packages/cards: PRB-01 was never imported.",
  "PRB01-001#4":
    "PRB01-001 Sanji (Leader) is not in packages/cards: PRB-01 was never imported.",
  "P-040#1":
    "P-040 Kaido is not in packages/cards: the promo import skips it (P-039 and P-041 are there, P-040 is not).",
  "P-040#2":
    "P-040 Kaido is not in packages/cards: the promo import skips it (P-039 and P-041 are there, P-040 is not).",
};

const ST31 = "(Red) Monkey.D.Luffy - Starter Deck 31";
const ST32 = "(Green) Roronoa Zoro - Starter Deck 32";

/** An empty table on one player's turn, late enough for every DON!! to be out. */
const table = (seed: string, active: "p1" | "p2" = "p1") =>
  scenario()
    .decks(ST31, ST32)
    .seed(seed)
    .atTurn(active === "p1" ? 11 : 12, { active })
    .bareTable();

function effectOptions(game: Game, player = game.player): string[] {
  return game
    .legalActions(player)
    .filter((action) => action.type === "resolve-effect")
    .map((action) => action.optionId);
}

/** Answers each prompt with the first of `preferred` on offer, else the first option. */
function settle(game: Game, ...preferred: string[]): void {
  let guard = 0;
  while (game.state.pendingEffect) {
    if (guard++ > 40) throw new Error("pending effect never settled");
    const options = effectOptions(game);
    const pick = preferred.find((id) => options.includes(id));
    game.play(
      pick
        ? { type: "resolve-effect", optionId: pick }
        : { type: "resolve-effect" },
    );
  }
}

/** Answers "apply" until a prompt offers something other than apply/skip/done. */
function untilChoice(game: Game): void {
  let guard = 0;
  while (
    game.state.pendingEffect &&
    effectOptions(game).every((option) =>
      ["apply", "skip", "done"].includes(option),
    )
  ) {
    if (guard++ > 20) throw new Error("no card choice was offered");
    const options = effectOptions(game);
    game.play({
      type: "resolve-effect",
      optionId: options.includes("apply") ? "apply" : options[0]!,
    });
  }
}

/** Takes the "choose nothing" answer of an up-to choice. */
function chooseNothing(game: Game): void {
  const options = effectOptions(game);
  const none = ["done", "skip"].find((id) => options.includes(id));
  if (!none)
    throw new Error(`no way to choose nothing in ${options.join(", ")}`);
  game.play({ type: "resolve-effect", optionId: none });
}

const ids = (cards: readonly { instanceId: string }[]): string[] =>
  cards.map((card) => card.instanceId);

const boardCard = (game: Game, player: "p1" | "p2", id: string) =>
  game.state.players[player].board.find((card) => card.instanceId === id);

const attack = (game: Game, attacker: string, target: string) =>
  game.play({
    type: "attack",
    attackerInstanceId: attacker,
    targetInstanceId: target,
  });

/** Declines the Block and Counter steps until the battle resolves. */
function declineDefence(game: Game): void {
  let guard = 0;
  while (
    (game.state.phase === "block" || game.state.phase === "counter") &&
    game.state.pendingEffect === null
  ) {
    if (guard++ > 10) throw new Error("the defence never ended");
    game.pass();
  }
}

/** Declines the Block step so the defender holds the Counter step. */
function toCounterStep(game: Game): void {
  let guard = 0;
  while (game.state.phase === "block" && game.state.pendingEffect === null) {
    if (guard++ > 10) throw new Error("the Counter step never came");
    game.pass();
  }
  expect(game.state.phase).toBe("counter");
}

const activations = (game: Game, instanceId: string) =>
  game
    .legalActions()
    .filter(
      (action) =>
        action.type === "activate-main" &&
        action.sourceInstanceId === instanceId,
    );

const replacements = (game: Game) =>
  effectOptions(game).filter((option) => option.startsWith("replace:"));

const costOnBoard = (game: Game, player: "p1" | "p2", id: string) =>
  effectiveCost(game.state, player, boardCard(game, player, id)!);

const fieldDon = (game: Game, player: "p1" | "p2") => {
  const seat = game.state.players[player];
  return (
    seat.activeDon.length +
    seat.restedDon.length +
    seat.leaderAttachedDon.length +
    seat.board.reduce(
      (total, card) => total + (card.attachedDon?.length ?? 0),
      0,
    )
  );
};

// --- PRB-01 ------------------------------------------------------------------
// Every ruling in the PRB-01 Q&A is on PRB01-001 Sanji, which is not in the
// card pool: see NOT_IN_POOL.

// --- PRB-02 ------------------------------------------------------------------

describe("FAQ PRB02-001 Koby", () => {
  it("PRB02-001#1: declining the K.O. still draws on a hand of 6 or less", () => {
    const game = table("faq-prb02-001-1")
      .withBoard("p1", [character("koby", "PRB02-001")])
      .withHand("p1", [instance("spare", "FIX-001")])
      .withDeckTop("p1", copies(2, "FIX-002", "p1-deck"))
      .withBoard("p2", [character("small", "FIX-001")])
      .withLife("p2", copies(2, "FIX-001", "p2-life"))
      .build();
    attack(game, "koby", "p2-leader");
    untilChoice(game);
    expect(effectOptions(game)).toContain("small");
    chooseNothing(game);
    settle(game);

    expect(boardCard(game, "p2", "small")).toBeDefined();
    expect(game.state.players.p1.hand).toHaveLength(2);
  });
});

describe("FAQ PRB02-002 Trafalgar Law", () => {
  it("PRB02-002#1: at 0 power or less the −2000 replacement is still offered and saves it", () => {
    // p2 takes 7000 off Law -- two P-013 Gordons (−3000 each) and a P-017
    // Trafalgar Law (−2000) -- then removes it with P-055 Monkey.D.Luffy,
    // whose bury p1 answers with its only Character.
    const game = table("faq-prb02-002-1", "p2")
      .withBoard("p1", [character("law", "PRB02-002")])
      .withBoard("p2", [
        character("gordon-1", "P-013"),
        character("gordon-2", "P-013"),
      ])
      .withHand("p2", [
        instance("debuff", "P-017"),
        instance("bury", "P-055"),
        ...copies(2, "FIX-001", "fodder"),
      ])
      .build();
    for (const gordon of ["gordon-1", "gordon-2"]) {
      game.play({ type: "activate-main", sourceInstanceId: gordon });
      untilChoice(game);
      game.play({ type: "resolve-effect", optionId: "law" });
      settle(game);
    }
    game.play({ type: "play-card", cardNumber: "P-017" });
    untilChoice(game);
    game.play({ type: "resolve-effect", optionId: "law" });
    settle(game);
    expect(currentPower(game.state, "p1", "law")).toBeLessThanOrEqual(0);

    game.play({ type: "play-card", cardNumber: "P-055" });
    untilChoice(game);
    game.play({ type: "resolve-effect", optionId: "fodder-1" });
    game.play({ type: "resolve-effect", optionId: "fodder-2" });
    if (effectOptions(game).includes("law")) {
      game.play({ type: "resolve-effect", optionId: "law" });
    }

    expect(game.player).toBe("p1");
    const offered = replacements(game);
    expect(offered).toHaveLength(1);
    game.play({ type: "resolve-effect", optionId: offered[0]! });
    settle(game);

    expect(boardCard(game, "p1", "law")).toBeDefined();
  });
});

describe("FAQ PRB02-004 Jewelry Bonney", () => {
  it("PRB02-004#1: the OP07-019 Leader can rest the DON!! Bonney just set active, in the same attack", () => {
    const game = table("faq-prb02-004-1", "p2")
      .withLeader("p1", "OP07-019")
      .withBoard("p1", [character("bonney", "PRB02-004")])
      .withDon("p1", { rested: 10 })
      .withLife("p1", copies(2, "FIX-001", "p1-life"))
      .withBoard("p2", [
        character("attacker", "FIX-002"),
        character("bystander", "FIX-001"),
      ])
      .build();
    expect(game.state.players.p1.activeDon).toHaveLength(0);
    attack(game, "attacker", "p1-leader");
    settle(game, "apply", "bystander");

    expect(boardCard(game, "p2", "bystander")?.rested).toBe(true);
    expect(game.state.players.p1.activeDon).toHaveLength(0);
  });

  it("PRB02-004#2: with nothing to set active it is spent anyway, and a later attack gets nothing", () => {
    // OP09-116 is a 1-cost [Counter] Event: paying for it rests a DON!!
    // between the two attacks. The attackers are OP16-032 Boa Hancock (9000),
    // so the Counter is worth playing at all.
    const game = table("faq-prb02-004-2", "p2")
      .withBoard("p1", [character("bonney", "PRB02-004")])
      .withHand("p1", [instance("counter", "OP09-116")])
      .withLife("p1", copies(3, "FIX-001", "p1-life"))
      .withBoard("p2", [
        character("first", "OP16-032"),
        character("second", "OP16-032"),
      ])
      .build();
    expect(game.state.players.p1.restedDon).toHaveLength(0);

    attack(game, "first", "p1-leader");
    // Declining is the question asked: take the skip if one is offered.
    settle(game, "skip");
    toCounterStep(game);
    game.play({ type: "activate-counter-event", cardNumber: "OP09-116" });
    settle(game, "p1-leader");
    declineDefence(game);
    settle(game);
    expect(game.state.players.p1.restedDon).toHaveLength(1);

    attack(game, "second", "p1-leader");
    settle(game, "apply");
    expect(game.state.players.p1.restedDon).toHaveLength(1);
  });

  it("PRB02-004#3: removed by the attacker's [When Attacking], Bonney sets nothing active", () => {
    // PRB02-001 Koby's [When Attacking] K.O.s a 3000-base-power Character,
    // which Bonney is.
    const game = table("faq-prb02-004-3", "p2")
      .withBoard("p1", [character("bonney", "PRB02-004")])
      .withDon("p1", { rested: 3 })
      .withLife("p1", copies(2, "FIX-001", "p1-life"))
      .withBoard("p2", [character("koby", "PRB02-001")])
      .withDeckTop("p2", copies(2, "FIX-001", "p2-deck"))
      .build();
    attack(game, "koby", "p1-leader");
    settle(game, "bonney", "apply");

    expect(ids(game.state.players.p1.trash)).toContain("bonney");
    expect(game.state.players.p1.restedDon).toHaveLength(3);
  });
});

describe("FAQ PRB02-005 Monkey.D.Luffy", () => {
  it("PRB02-005#1: an opponent past 7 DON!! by their Main Phase still rests one", () => {
    // EB04-001 is a multicolored Leader. p2 sits on 7 DON!! when Luffy lands
    // and reaches 9 in its DON!! Phase.
    const game = table("faq-prb02-005-1")
      .withLeader("p1", "EB04-001")
      .withHand("p1", [instance("luffy", "PRB02-005")])
      .withDonDeck("p2", 3)
      .withDeckTop("p2", copies(2, "FIX-001", "p2-deck"))
      .build();
    expect(fieldDon(game, "p2")).toBe(7);
    game.play({ type: "play-card", cardNumber: "PRB02-005" });
    settle(game);
    game.pass();

    expect(game.player).toBe("p2");
    expect(fieldDon(game, "p2")).toBe(9);
    expect(game.state.players.p2.restedDon).toHaveLength(1);
  });
});

describe("FAQ PRB02-006 Roronoa Zoro", () => {
  // OP15-029 Bartholomew Kuma makes p1's other Character impossible to rest;
  // OP16-036 Mr.2.Bon.Kurei then rests Zoro with a Character's [On Play].
  const restZoro = (seed: string, lockFirst: boolean) => {
    const game = table(seed, "p2")
      .withBoard("p1", [
        character("zoro", "PRB02-006"),
        character("ally", "FIX-001"),
      ])
      .withHand("p2", [
        instance("kuma", "OP15-029"),
        instance("bonkurei", "OP16-036"),
      ])
      .build();
    if (lockFirst) {
      game.play({ type: "play-card", cardNumber: "OP15-029" });
      untilChoice(game);
      game.play({ type: "resolve-effect", optionId: "ally" });
      settle(game);
    }
    game.play({ type: "play-card", cardNumber: "OP16-036" });
    untilChoice(game);
    game.play({ type: "resolve-effect", optionId: "zoro" });
    return game;
  };

  it("PRB02-006#1: a rest-locked Character cannot pay, so Zoro stays rested", () => {
    const game = restZoro("faq-prb02-006-1", true);
    // Not offering the swap at all is the answer; offering it, the locked
    // Character must not be a way out.
    if (game.player === "p1") untilChoice(game);
    if (game.state.pendingEffect && game.player === "p1") {
      expect(effectOptions(game, "p1")).not.toContain("ally");
    }
    settle(game);

    expect(boardCard(game, "p1", "zoro")?.rested).toBe(true);
    expect(boardCard(game, "p1", "ally")?.rested).toBe(false);
  });

  it("PRB02-006#1 (control): with the other Character free to rest, the swap is offered", () => {
    const game = restZoro("faq-prb02-006-1-control", false);
    expect(game.player).toBe("p1");
    untilChoice(game);
    expect(effectOptions(game, "p1")).toContain("ally");
    game.play({ type: "resolve-effect", optionId: "ally" });
    settle(game);

    expect(boardCard(game, "p1", "zoro")?.rested).toBe(false);
    expect(boardCard(game, "p1", "ally")?.rested).toBe(true);
  });
});

describe("FAQ PRB02-010 Charlotte Pudding", () => {
  // OP08-058 is a {Big Mom Pirates} Leader; OP08-029 Pekoms is a 6000-power
  // {Big Mom Pirates} Character.
  const playPudding = (seed: string, opponentDon: number) => {
    const game = table(seed)
      .withLeader("p1", "OP08-058")
      .withHand("p1", [
        instance("pudding", "PRB02-010"),
        instance("pekoms", "OP08-029"),
      ])
      .withDeckTop("p1", copies(3, "FIX-001", "p1-deck"))
      .withDonDeck("p2", 10 - opponentDon)
      .build();
    game.play({ type: "play-card", cardNumber: "PRB02-010" });
    let guard = 0;
    while (
      game.state.pendingEffect &&
      !effectOptions(game).includes("pekoms")
    ) {
      if (guard++ > 20) break;
      const options = effectOptions(game);
      const pick =
        ["apply", "return-don:active"].find((id) => options.includes(id)) ??
        options[0]!;
      game.play({ type: "resolve-effect", optionId: pick });
    }
    return game;
  };

  it("PRB02-010#1: against 5 DON!! there is neither the draw nor the play", () => {
    const game = playPudding("faq-prb02-010-1", 5);
    expect(effectOptions(game)).not.toContain("pekoms");
    settle(game);

    expect(ids(game.state.players.p1.hand)).toEqual(["pekoms"]);
  });

  it("PRB02-010#1 (control): against 6 DON!! it draws 2 and offers the play", () => {
    const game = playPudding("faq-prb02-010-1-control", 6);
    expect(effectOptions(game)).toContain("pekoms");
    expect(game.state.players.p1.hand).toHaveLength(3);
  });
});

describe("FAQ PRB02-014 Sabo", () => {
  it("PRB02-014#1: Scarlet trashing itself makes 15, so Sabo is a 3-cost it may play", () => {
    const game = table("faq-prb02-014-1")
      .withBoard("p1", [character("scarlet", "EB01-042")])
      .withHand("p1", [instance("sabo", "PRB02-014")])
      .withTrash("p1", copies(14, "FIX-001", "trash"))
      .build();
    game.play({ type: "activate-main", sourceInstanceId: "scarlet" });
    untilChoice(game);
    expect(game.state.players.p1.trash).toHaveLength(15);
    expect(effectOptions(game)).toContain("sabo");
    game.play({ type: "resolve-effect", optionId: "sabo" });
    settle(game);

    expect(boardCard(game, "p1", "sabo")?.rested).toBe(true);
  });
});

describe("FAQ PRB02-017 Boa Hancock", () => {
  it("PRB02-017#1: an active opposing Character may be the one that cannot attack", () => {
    // OP14-102 Kumacy is the [Trigger] card paid from hand.
    const game = table("faq-prb02-017-1")
      .withHand("p1", [
        instance("hancock", "PRB02-017"),
        instance("kumacy", "OP14-102"),
      ])
      .withBoard("p2", [character("target", "FIX-001")])
      .withDeckTop("p2", copies(2, "FIX-001", "p2-deck"))
      .build();
    game.play({ type: "play-card", cardNumber: "PRB02-017" });
    untilChoice(game);
    game.play({ type: "resolve-effect", optionId: "kumacy" });
    if (effectOptions(game).includes("character")) {
      game.play({ type: "resolve-effect", optionId: "character" });
    }
    expect(boardCard(game, "p2", "target")?.rested).toBe(false);
    expect(effectOptions(game)).toContain("target");
    game.play({ type: "resolve-effect", optionId: "target" });
    settle(game);
    game.pass();

    expect(game.player).toBe("p2");
    expect(
      game
        .legalActions("p2")
        .some(
          (action) =>
            action.type === "attack" && action.attackerInstanceId === "target",
        ),
    ).toBe(false);
  });
});

// --- Promotion cards ----------------------------------------------------------

describe("FAQ P-002 I Smell Adventure!!!", () => {
  it("P-002#1: with no other card in hand, nothing is returned and nothing drawn", () => {
    const game = table("faq-p002-1")
      .withHand("p1", [instance("event", "P-002")])
      .withDeckTop("p1", copies(3, "FIX-001", "p1-deck"))
      .build();
    game.play({ type: "activate-main", sourceCardNumber: "P-002" });
    settle(game);

    expect(game.state.players.p1.hand).toHaveLength(0);
    expect(game.state.players.p1.deck).toHaveLength(3);
  });
});

describe("FAQ P-004 Crocodile", () => {
  it("P-004#1: losing its DON!! after blocking does not send the attack back", () => {
    // EB01-038 Oh Come My Way is a [Counter] whose DON!! −1 p1 pays with the
    // DON!! given to Crocodile, which takes its [Blocker] away mid-battle.
    const game = table("faq-p004-1", "p2")
      .withBoard("p1", [character("croc", "P-004")])
      .withGivenDon("p1", "croc", 1)
      .withHand("p1", [instance("counter", "EB01-038")])
      .withLife("p1", copies(2, "FIX-001", "p1-life"))
      .withBoard("p2", [character("attacker", "FIX-002")])
      .build();
    attack(game, "attacker", "p1-leader");
    game.play({ type: "block", blockerInstanceId: "croc" });
    expect(game.state.activeAttack?.targetInstanceId).toBe("croc");
    toCounterStep(game);
    game.play({ type: "activate-counter-event", cardNumber: "EB01-038" });
    settle(game, "return-don:croc", "skip");
    expect(boardCard(game, "p1", "croc")?.attachedDon ?? []).toHaveLength(0);
    expect(hasKeyword(game.state, "p1", "croc", "Blocker")).toBe(false);

    expect(game.state.activeAttack?.targetInstanceId).toBe("croc");
    declineDefence(game);
    expect(game.state.players.p1.life).toHaveLength(2);
  });
});

describe("FAQ P-005 Kaido", () => {
  it("P-005#1: it may be activated a second time in the same turn", () => {
    const game = table("faq-p005-1")
      .withBoard("p1", [character("kaido", "P-005")])
      .build();
    const activate = () => {
      game.play({ type: "activate-main", sourceInstanceId: "kaido" });
      settle(game, "apply", "return-don:active");
    };
    activate();
    expect(hasKeyword(game.state, "p1", "kaido", "Banish")).toBe(true);
    expect(activations(game, "kaido")).not.toHaveLength(0);
    activate();

    expect(fieldDon(game, "p1")).toBe(6);
    expect(hasKeyword(game.state, "p1", "kaido", "Banish")).toBe(true);
  });
});

describe("FAQ P-007 Monkey.D.Luffy", () => {
  const strike = (seed: string, attacker: string) => {
    const game = table(seed, "p2")
      .withBoard("p1", [character("luffy", "P-007", { rested: true })])
      .withGivenDon("p1", "luffy", 1)
      .withBoard("p2", [character("attacker", attacker)])
      .build();
    attack(game, "attacker", "luffy");
    declineDefence(game);
    settle(game);
    return game;
  };

  it("P-007#1: a 9000 <Special> Character beats it in battle", () => {
    // OP16-032 Boa Hancock: <Special>, 9000.
    const game = strike("faq-p007-1", "OP16-032");
    expect(ids(game.state.players.p1.trash)).toContain("luffy");
  });

  it("P-007#1 (control): a 7000 <Strike> Character does not", () => {
    // OP13-032 Nico Robin: <Strike>, 7000.
    const game = strike("faq-p007-1-control", "OP13-032");
    expect(boardCard(game, "p1", "luffy")).toBeDefined();
  });
});

describe("FAQ P-008 Yamato", () => {
  it("P-008#1: with no 2-cost-or-less target it can still be activated and rests itself", () => {
    const game = table("faq-p008-1")
      .withBoard("p1", [character("yamato", "P-008")])
      .withBoard("p2", [character("big", "OP05-012")])
      .build();
    expect(activations(game, "yamato")).not.toHaveLength(0);
    game.play({ type: "activate-main", sourceInstanceId: "yamato" });
    settle(game, "apply");

    expect(boardCard(game, "p1", "yamato")?.rested).toBe(true);
    expect(boardCard(game, "p2", "big")?.rested).toBe(false);
  });
});

describe("FAQ P-009 Trafalgar Law", () => {
  it("P-009#1: against an opponent with no Life it does not win the game", () => {
    const game = table("faq-p009-1")
      .withHand("p1", [instance("law", "P-009")])
      .withHand("p2", copies(6, "FIX-001", "p2-hand"))
      .build();
    expect(game.state.players.p2.life).toHaveLength(0);
    game.play({ type: "play-card", cardNumber: "P-009" });
    settle(game);

    expect(game.state.phase).not.toBe("finished");
    expect(game.state.winner).toBeNull();
    expect(game.state.players.p2.hand).toHaveLength(6);
  });

  it("P-009#2: against a hand of 6 it cannot be declined", () => {
    const game = table("faq-p009-2")
      .withHand("p1", [instance("law", "P-009")])
      .withHand("p2", copies(6, "FIX-001", "p2-hand"))
      .withLife("p2", copies(2, "FIX-002", "p2-life"))
      .build();
    game.play({ type: "play-card", cardNumber: "P-009" });
    let guard = 0;
    while (game.state.pendingEffect) {
      if (guard++ > 10) throw new Error("pending effect never settled");
      expect(effectOptions(game)).not.toContain("skip");
      game.play({ type: "resolve-effect" });
    }

    expect(game.state.players.p2.life).toHaveLength(1);
    expect(game.state.players.p2.hand).toHaveLength(7);
  });
});

describe("FAQ P-011 Uta", () => {
  const utaTargets = (seed: string, board: ReturnType<typeof character>[]) => {
    const game = table(seed)
      .withLeader("p1", "P-011")
      .withBoard("p1", board)
      .build();
    game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });
    untilChoice(game);
    return game;
  };

  it("P-011#1: a Character printing only a [Trigger] is not an effectless target", () => {
    // OP14-102 Kumacy prints a [Trigger] and nothing else; ST21-005 Jinbe
    // prints nothing at all, so the choice is open.
    const game = utaTargets("faq-p011-1", [
      character("kumacy", "OP14-102"),
      character("vanilla", "ST21-005"),
    ]);
    expect(effectOptions(game)).toContain("vanilla");
    expect(effectOptions(game)).not.toContain("kumacy");
  });

  it("P-011#2: a Character printing only a Counter value is an effectless target", () => {
    // ST21-005 Jinbe: no text, a +1000 Counter.
    const game = utaTargets("faq-p011-2", [character("vanilla", "ST21-005")]);
    expect(effectOptions(game)).toContain("vanilla");
    game.play({ type: "resolve-effect", optionId: "vanilla" });
    settle(game);

    expect(currentPower(game.state, "p1", "vanilla")).toBe(6_000);
  });

  it("P-011#3: a textless Character buffed by another card is still an effectless target", () => {
    // P-020 Helmeppo's [On Play] gives ST21-005 Jinbe +1000 first.
    const game = table("faq-p011-3")
      .withLeader("p1", "P-011")
      .withBoard("p1", [character("vanilla", "ST21-005")])
      .withHand("p1", [instance("helmeppo", "P-020")])
      .build();
    game.play({ type: "play-card", cardNumber: "P-020" });
    untilChoice(game);
    game.play({ type: "resolve-effect", optionId: "vanilla" });
    settle(game);
    expect(currentPower(game.state, "p1", "vanilla")).toBe(5_000);

    game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });
    untilChoice(game);
    expect(effectOptions(game)).toContain("vanilla");
    game.play({ type: "resolve-effect", optionId: "vanilla" });
    settle(game);

    expect(currentPower(game.state, "p1", "vanilla")).toBe(7_000);
  });

  it("P-011#4: a Character with its effect negated for the turn is not an effectless target", () => {
    // p2 answers ST21-009 Nami's attack with OP09-097 Black Vortex, which
    // negates her effect for the turn; ST21-005 Jinbe keeps the choice open.
    const game = table("faq-p011-4")
      .withLeader("p1", "P-011")
      .withBoard("p1", [
        character("nami", "ST21-009"),
        character("vanilla", "ST21-005"),
      ])
      .withHand("p2", [instance("vortex", "OP09-097")])
      .withLife("p2", copies(2, "FIX-001", "p2-life"))
      .build();
    attack(game, "nami", "p2-leader");
    settle(game);
    toCounterStep(game);
    game.play({ type: "activate-counter-event", cardNumber: "OP09-097" });
    settle(game, "nami");
    expect(
      (game.state.negatedEffects ?? []).some(
        (entry) => entry.instanceId === "nami",
      ),
    ).toBe(true);
    declineDefence(game);
    settle(game);
    expect(game.player).toBe("p1");

    game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });
    untilChoice(game);
    expect(effectOptions(game)).toContain("vanilla");
    expect(effectOptions(game)).not.toContain("nami");
  });
});

describe("FAQ P-013 Gordon", () => {
  it("P-013#1: it may go to the bottom of the deck without giving anything −3000", () => {
    const game = table("faq-p013-1")
      .withBoard("p1", [character("gordon", "P-013")])
      .withBoard("p2", [character("victim", "FIX-002")])
      .build();
    game.play({ type: "activate-main", sourceInstanceId: "gordon" });
    untilChoice(game);
    expect(effectOptions(game)).toContain("victim");
    chooseNothing(game);
    settle(game);

    expect(boardCard(game, "p1", "gordon")).toBeUndefined();
    expect(game.state.players.p1.deck.at(-1)?.instanceId).toBe("gordon");
    expect(currentPower(game.state, "p2", "victim")).toBe(4_000);
  });
});

describe("FAQ P-027 General Franky", () => {
  it("P-027#1: base power is the printed number, so a 4000 shrunk to 2000 gains nothing", () => {
    // On p2's turn P-017 Trafalgar Law takes 2000 off FIX-002 (printed 4000);
    // FIX-001 is printed at 2000.
    const game = table("faq-p027-1", "p2")
      .withBoard("p1", [
        character("franky", "P-027"),
        character("small", "FIX-001"),
        character("shrunk", "FIX-002"),
      ])
      .withHand("p2", [instance("law", "P-017")])
      .build();
    game.play({ type: "play-card", cardNumber: "P-017" });
    untilChoice(game);
    game.play({ type: "resolve-effect", optionId: "shrunk" });
    settle(game);

    expect(currentPower(game.state, "p1", "shrunk")).toBe(2_000);
    expect(currentPower(game.state, "p1", "small")).toBe(3_000);
  });

  it("P-027#2: two copies give +2000", () => {
    const game = table("faq-p027-2", "p2")
      .withBoard("p1", [
        character("franky-1", "P-027"),
        character("franky-2", "P-027"),
        character("small", "FIX-001"),
      ])
      .build();

    expect(currentPower(game.state, "p1", "small")).toBe(4_000);
  });
});

describe("FAQ P-030 Jinbe", () => {
  it("P-030#1: its [On K.O.] may put its controller's own Character on the bottom", () => {
    const game = table("faq-p030-1", "p2")
      .withBoard("p1", [
        character("jinbe", "P-030", { rested: true }),
        character("mine", "FIX-001"),
      ])
      .withBoard("p2", [character("attacker", "OP16-032")])
      .build();
    attack(game, "attacker", "jinbe");
    declineDefence(game);
    expect(ids(game.state.players.p1.trash)).toContain("jinbe");
    untilChoice(game);
    expect(effectOptions(game, "p1")).toContain("mine");
    game.play({ type: "resolve-effect", optionId: "mine" });
    settle(game);

    expect(boardCard(game, "p1", "mine")).toBeUndefined();
    expect(game.state.players.p1.deck.at(-1)?.instanceId).toBe("mine");
  });
});

describe("FAQ P-032 Sengoku", () => {
  it("P-032#1: the −2 does not reach Character cards in the opponent's hand or trash", () => {
    // Sengoku attacks with its DON!!. p2 answers with OP14-116 Salamander,
    // which plays a 4-cost-or-less {Kuja Pirates} Character from hand: OP16-111
    // Boa Sandersonia is a 4, OP13-052 Boa Marigold a 5 that the −2 would
    // bring in. The Life card is OP08-096, whose [Trigger] plays a black
    // 3-cost-or-less Character from the trash: OP09-094 is a 3, ST14-010 a 5.
    const game = table("faq-p032-1")
      .withBoard("p1", [character("sengoku", "P-032")])
      .withGivenDon("p1", "sengoku", 1)
      .withHand("p2", [
        instance("salamander", "OP14-116"),
        instance("four", "OP16-111"),
        instance("five", "OP13-052"),
      ])
      .withTrash("p2", [
        instance("trash-three", "OP09-094"),
        instance("trash-five", "ST14-010"),
      ])
      .withLife("p2", [instance("dreams", "OP08-096")])
      .build();
    attack(game, "sengoku", "p2-leader");
    settle(game);
    toCounterStep(game);
    game.play({ type: "activate-counter-event", cardNumber: "OP14-116" });
    untilChoice(game);
    if (effectOptions(game).includes("p2-leader")) {
      game.play({ type: "resolve-effect", optionId: "p2-leader" });
      untilChoice(game);
    }
    const fromHand = effectOptions(game);
    chooseNothing(game);
    settle(game);

    declineDefence(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    untilChoice(game);
    const fromTrash = effectOptions(game);

    expect(fromHand).toContain("four");
    expect(fromTrash).toContain("trash-three");
    expect({
      handFiveOffered: fromHand.includes("five"),
      trashFiveOffered: fromTrash.includes("trash-five"),
    }).toEqual({ handFiveOffered: false, trashFiveOffered: false });
  });

  it("P-032#2: a 3-cost at 0 under Sengoku and another −2 goes back to 1 when Sengoku's DON!! leaves", () => {
    // OP02-106 Tsuru is not in the pool; EB01-042 Scarlet's −2 cost for the
    // turn is the other reduction. EB01-039 Ragnaraku's DON!! −1 is paid with
    // the DON!! given to Sengoku, and its K.O. is declined.
    const game = table("faq-p032-2")
      .withBoard("p1", [
        character("sengoku", "P-032"),
        character("scarlet", "EB01-042"),
      ])
      .withGivenDon("p1", "sengoku", 1)
      .withHand("p1", [instance("ragnaraku", "EB01-039")])
      .withBoard("p2", [character("victim", "OP05-012")])
      .build();
    expect(costOnBoard(game, "p2", "victim")).toBe(1);

    game.play({ type: "activate-main", sourceInstanceId: "scarlet" });
    untilChoice(game);
    if (!effectOptions(game).includes("victim")) chooseNothing(game);
    untilChoice(game);
    game.play({ type: "resolve-effect", optionId: "victim" });
    settle(game);
    expect(costOnBoard(game, "p2", "victim")).toBe(0);

    game.play({ type: "activate-main", sourceCardNumber: "EB01-039" });
    settle(game, "apply", "return-don:sengoku", "skip", "done");
    expect(boardCard(game, "p1", "sengoku")?.attachedDon ?? []).toHaveLength(0);
    expect(boardCard(game, "p2", "victim")).toBeDefined();

    expect(costOnBoard(game, "p2", "victim")).toBe(1);
  });
});

describe("FAQ P-033 Monkey.D.Luffy", () => {
  it("P-033#1: with 1 card in the deck it goes under and is drawn past, and the game goes on", () => {
    const game = table("faq-p033-1")
      .withBoard("p1", [character("luffy", "P-033")])
      .withDeckTop("p1", [instance("last", "FIX-001")])
      .build();
    game.play({ type: "activate-main", sourceInstanceId: "luffy" });
    settle(game, "apply");

    expect(game.state.phase).not.toBe("finished");
    expect(game.state.winner).toBeNull();
    expect(ids(game.state.players.p1.deck)).toEqual(["luffy"]);
    expect(ids(game.state.players.p1.hand)).toEqual(["last"]);
  });
});

describe("FAQ P-036 Monkey.D.Luffy", () => {
  const swing = (seed: string) => {
    const game = table(seed)
      .withBoard("p1", [character("luffy", "P-036")])
      .withLife("p1", copies(2, "FIX-001", "p1-life"))
      .withLife("p2", copies(2, "FIX-001", "p2-life"))
      .build();
    attack(game, "luffy", "p2-leader");
    untilChoice(game);
    game.play({ type: "resolve-effect", summary: "top Life card" });
    return game;
  };

  it("P-036#1: both this Character and the Leader gain +1000", () => {
    const game = swing("faq-p036-1");
    const leaderBefore = currentPower(game.state, "p1", "p1-leader");
    expect(effectOptions(game)).toContain("p1-leader");
    game.play({ type: "resolve-effect", optionId: "p1-leader" });
    settle(game);

    expect(currentPower(game.state, "p1", "luffy")).toBe(5_000);
    expect(currentPower(game.state, "p1", "p1-leader")).toBe(
      leaderBefore + 1_000,
    );
  });

  it("P-036#2: once the Life card is paid, its own +1000 cannot be turned down", () => {
    const game = swing("faq-p036-2");
    const leaderBefore = currentPower(game.state, "p1", "p1-leader");
    settle(game, "skip", "done");

    expect(game.state.players.p1.life).toHaveLength(1);
    expect(currentPower(game.state, "p1", "luffy")).toBe(5_000);
    expect(currentPower(game.state, "p1", "p1-leader")).toBe(leaderBefore);
  });
});

describe("FAQ P-048 Arlong", () => {
  it("P-048#1: the opponent picks which card of their hand goes", () => {
    const game = table("faq-p048-1")
      .withBoard("p1", [character("arlong", "P-048")])
      .withGivenDon("p1", "arlong", 1)
      .withLife("p1", copies(4, "FIX-001", "p1-life"))
      .withHand("p2", copies(2, "FIX-001", "p2-hand"))
      .withLife("p2", copies(2, "FIX-001", "p2-life"))
      .build();
    attack(game, "arlong", "p2-leader");
    untilChoice(game);

    expect(game.player).toBe("p2");
    expect(effectOptions(game, "p2")).toEqual(
      expect.arrayContaining(["p2-hand-1", "p2-hand-2"]),
    );
    game.play({ type: "resolve-effect", optionId: "p2-hand-2" });
    settle(game);
    expect(ids(game.state.players.p2.hand)).toEqual(["p2-hand-1"]);
  });
});

describe("FAQ P-055 Monkey.D.Luffy", () => {
  it("P-055#1: the opponent picks which of their Characters goes to the bottom", () => {
    const game = table("faq-p055-1")
      .withHand("p1", [
        instance("luffy", "P-055"),
        ...copies(2, "FIX-001", "fodder"),
      ])
      .withBoard("p2", [character("a", "FIX-001"), character("b", "FIX-002")])
      .build();
    game.play({ type: "play-card", cardNumber: "P-055" });
    untilChoice(game);
    game.play({ type: "resolve-effect", optionId: "fodder-1" });
    game.play({ type: "resolve-effect", optionId: "fodder-2" });

    expect(game.player).toBe("p2");
    expect(effectOptions(game, "p2")).toEqual(
      expect.arrayContaining(["a", "b"]),
    );
    game.play({ type: "resolve-effect", optionId: "a" });
    settle(game);
    expect(ids(game.state.players.p2.board)).toEqual(["b"]);
  });

  it("P-055#2: with no opposing Character it can still trash 2, and nothing else happens", () => {
    const game = table("faq-p055-2")
      .withHand("p1", [
        instance("luffy", "P-055"),
        ...copies(2, "FIX-001", "fodder"),
      ])
      .build();
    game.play({ type: "play-card", cardNumber: "P-055" });
    untilChoice(game);
    expect(effectOptions(game)).toEqual(
      expect.arrayContaining(["fodder-1", "fodder-2"]),
    );
    game.play({ type: "resolve-effect", optionId: "fodder-1" });
    game.play({ type: "resolve-effect", optionId: "fodder-2" });
    settle(game);

    expect(ids(game.state.players.p1.trash)).toEqual(["fodder-1", "fodder-2"]);
    expect(game.state.players.p2.board).toHaveLength(0);
  });
});

describe("FAQ P-057 Fleeting Lullaby", () => {
  it("P-057#1: a held Character that stood back up that turn is not rested by the Refresh Phase", () => {
    // OP09-032 Donquixote Rosinante sets itself active when p1 attacks.
    const game = table("faq-p057-1")
      .withLeader("p1", "P-011")
      .withHand("p1", [instance("lullaby", "P-057")])
      .withBoard("p2", [character("rosinante", "OP09-032", { rested: true })])
      .withLife("p2", copies(2, "FIX-001", "p2-life"))
      .withDeckTop("p2", copies(2, "FIX-001", "p2-deck"))
      .build();
    game.play({ type: "activate-main", sourceCardNumber: "P-057" });
    untilChoice(game);
    game.play({ type: "resolve-effect", optionId: "rosinante" });
    settle(game, "done");

    attack(game, "p1-leader", "p2-leader");
    settle(game, "apply");
    expect(boardCard(game, "p2", "rosinante")?.rested).toBe(false);
    declineDefence(game);
    settle(game);
    game.pass();

    expect(game.player).toBe("p2");
    expect(boardCard(game, "p2", "rosinante")?.rested).toBe(false);
  });
});

describe("FAQ P-058 Where the Wind Blows", () => {
  it("P-058#1: a {FILM} Character played after it and rested that turn is set active at the end", () => {
    // P-031 Uta is the {FILM} Character played after the Event; P-060 Tot
    // Musica rests her as its cost.
    const game = table("faq-p058-1")
      .withLeader("p1", "P-011")
      .withHand("p1", [
        instance("wind", "P-058"),
        instance("uta", "P-031"),
        instance("musica", "P-060"),
      ])
      .build();
    game.play({ type: "activate-main", sourceCardNumber: "P-058" });
    settle(game);
    game.play({ type: "play-card", cardNumber: "P-031" });
    settle(game);
    game.play({ type: "activate-main", sourceCardNumber: "P-060" });
    untilChoice(game);
    game.play({ type: "resolve-effect", optionId: "uta" });
    settle(game);
    expect(boardCard(game, "p1", "uta")?.rested).toBe(true);
    game.pass();
    settle(game);

    expect(boardCard(game, "p1", "uta")?.rested).toBe(false);
  });
});

describe("FAQ P-060 Tot Musica", () => {
  it("P-060#1: the cost may be paid with the [Uta] Leader or an [Uta] Character", () => {
    const game = table("faq-p060-1")
      .withLeader("p1", "P-011")
      .withBoard("p1", [character("uta", "P-031")])
      .withHand("p1", [instance("musica", "P-060")])
      .build();
    game.play({ type: "activate-main", sourceCardNumber: "P-060" });
    untilChoice(game);

    expect(effectOptions(game)).toEqual(
      expect.arrayContaining(["p1-leader", "uta"]),
    );
  });
});

describe("FAQ P-104 Shanks", () => {
  it("P-104#1: Ragnaraku's DON!! −1 takes the field from 10 to 9 before its K.O. looks", () => {
    const game = table("faq-p104-1")
      .withHand("p1", [instance("ragnaraku", "EB01-039")])
      .withBoard("p2", [character("shanks", "P-104")])
      .withDonDeck("p2", 1)
      .build();
    expect(fieldDon(game, "p1")).toBe(10);
    expect(fieldDon(game, "p2")).toBe(9);
    game.play({ type: "activate-main", sourceCardNumber: "EB01-039" });
    let guard = 0;
    while (
      game.state.pendingEffect &&
      !effectOptions(game).includes("shanks")
    ) {
      if (guard++ > 10) break;
      const options = effectOptions(game);
      const pick =
        ["apply", "return-don:active"].find((id) => options.includes(id)) ??
        options[0]!;
      game.play({ type: "resolve-effect", optionId: pick });
    }
    expect(fieldDon(game, "p1")).toBe(9);
    expect(effectOptions(game)).toContain("shanks");
    game.play({ type: "resolve-effect", optionId: "shanks" });
    settle(game);

    expect(ids(game.state.players.p2.trash)).toContain("shanks");
  });
});

describe("FAQ P-106 Monkey.D.Luffy", () => {
  // ST29-013 Rob Lucci is the rested {Egghead} Character to wake.
  const endTurn = (seed: string, topFaceUp: boolean) => {
    const game = table(seed)
      .withBoard("p1", [
        character("luffy", "P-106"),
        character("lucci", "ST29-013", { rested: true }),
      ])
      .withLife("p1", [
        instance("top", "FIX-001", topFaceUp ? { faceUp: true } : {}),
        instance("under", "FIX-001"),
      ])
      .withDeckTop("p2", copies(2, "FIX-001", "p2-deck"))
      .build();
    game.pass();
    settle(game, "apply", "top", "lucci");
    return game;
  };

  it("P-106#1: with the top Life card already face-up, nothing is turned and nothing wakes", () => {
    const game = endTurn("faq-p106-1", true);

    expect(
      game.state.players.p1.life.map((card) => Boolean(card.faceUp)),
    ).toEqual([true, false]);
    expect(boardCard(game, "p1", "lucci")?.rested).toBe(true);
  });

  it("P-106#1 (control): with the top Life card face-down, it turns and wakes", () => {
    const game = endTurn("faq-p106-1-control", false);

    expect(
      game.state.players.p1.life.map((card) => Boolean(card.faceUp)),
    ).toEqual([true, false]);
    expect(boardCard(game, "p1", "lucci")?.rested).toBe(false);
  });
});

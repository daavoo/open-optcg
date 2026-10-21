/**
 * Which registered replacement program could answer a removal, and the cost
 * one charges: the registry walk `mechanics-replacements.ts` offers from, and
 * the effect a replacement's printed cost resolves to.
 */
import {
  type CardDatabase,
  cards as defaultCardDatabase,
} from "@one-piece-sim/cards";
import type { PlayerId } from "@one-piece-sim/protocol";
import type { BoardCard, GameState } from "./model.js";
import type { ReplacementProgram } from "./mechanics/types.js";
import { fieldDonCount } from "./don.js";
import {
  type CardSelector,
  type CardZone,
  type MechanicEffect,
  OWN_CARDS_ZONES,
  type PlayerRef,
} from "./mechanic-dsl.js";
import { conditionMatches, selectCards } from "./mechanic-conditions.js";

/**
 * The declarative replacement registry, injected at startup.
 *
 * `mechanics/index.ts` builds it out of the set modules, and those modules
 * import this file -- so importing it back here would close a cycle through
 * every set. `registerReplacementPrograms` is the seam instead: one call at
 * module-init time, from the module that already owns the merge.
 */
export let replacementRegistry: ReadonlyMap<string, ReplacementProgram> =
  new Map();

export function registerReplacementPrograms(
  registry: ReadonlyMap<string, ReplacementProgram>,
): void {
  replacementRegistry = registry;
}

/** A registered replacement that could answer this K.O., with its protector. */
export interface EligibleReplacement {
  protector: BoardCard;
  entry: ReplacementProgram;
}

/**
 * What is removing the Character, which decides whether a replacement scoped to
 * "by your opponent's effect" may answer it at all.
 *
 * `"battle"` is losing a battle: the result of the battle itself, not an
 * effect, and so outside every clause that names one however well the rest of
 * the clause fits.
 */
export type RemovalCause = "effect" | "battle";

/**
 * Which registered replacements may answer a K.O. of `target`.
 *
 * Shared by the three paths that offer one: the mechanic interpreter's own
 * `knock-out` node, `mechanics-replacements.ts` for the engine's older
 * `ko-character` pending effect, and `resolveBattle`.
 */
export function eligibleReplacements(
  state: GameState,
  sourcePlayerId: PlayerId,
  targetPlayerId: PlayerId,
  target: BoardCard,
  db: CardDatabase = defaultCardDatabase,
  cause: RemovalCause = "effect",
  /**
   * What is about to happen to the Character. `"ko"` is the default and admits
   * every entry; `"off-field"` -- a bounce, a bury, a move into Life -- admits
   * only the entries whose printed text says "removed from the field", which is
   * the wider reading. See `ReplacementProgram.removal`.
   */
  removalKind: "ko" | "off-field" = "ko",
): EligibleReplacement[] {
  const byOpponent = sourcePlayerId !== targetPlayerId;
  const eligible: EligibleReplacement[] = [];
  // The Leader is a candidate protector, not only the board. EB03-001
  // Nefeltari Vivi is the first registered replacement printed on one -- "if
  // your Character with a base cost of 4 or more would be K.O.'d, you may
  // trash 1 card from your hand instead" -- and a walk over `board` alone
  // cannot see it, because a Leader sits in no zone. The pseudo-card is the
  // same shape every other Leader-reading node builds: the id is what the
  // once-per-turn key and the option id are made of, and both work with it.
  const protectors: readonly BoardCard[] = [
    {
      instanceId: `${targetPlayerId}-leader`,
      cardNumber: state.players[targetPlayerId].leaderCardNumber,
    } as BoardCard,
    ...state.players[targetPlayerId].board,
    // A replacement an Event installed on the *player* for a window --
    // EB02-030, whose `[Counter]` buys the turn's protection and is in the
    // trash before the first Character is threatened. There is no card on the
    // field to find it by, so the booking stands in as its own protector; the
    // pseudo-card is the same shape the Leader's is, and the id is what the
    // once-per-turn key and the option id are made of.
    ...(state.players[targetPlayerId].installedReplacements ?? [])
      .filter(
        (entry) =>
          entry.expiresAtTurn >= state.turn &&
          (entry.protects?.includes(target.instanceId) ?? true),
      )
      .map(
        (entry) =>
          ({
            instanceId: `${targetPlayerId}-installed-${entry.cardNumber}`,
            cardNumber: entry.cardNumber,
          }) as BoardCard,
      ),
  ];
  for (const protector of protectors) {
    const entry = replacementRegistry.get(protector.cardNumber);
    if (!entry) continue;
    // Two different questions, and reading the first as the second is what this
    // guard exists to stop. `byOpponent` asks *whose* effect it was;
    // `cause === "battle"` says there was no effect. `resolveBattle` names the
    // attacker as the source, so without the second test every
    // `opponentEffectOnly` entry answered battle destruction -- OP14-016
    // X.Drake saved a Supernova that simply lost a fight.
    // OP08-045 Thatch's "…by your opponent's effect **or K.O.'d**" is the one
    // printed clause that joins the narrow reading to the wide one: an
    // opponent's effect moving it off the field, or a K.O. by anything at all
    // including a lost fight. `alsoAnyKo` is what lets the two live in one
    // entry, and it only ever widens -- a K.O. is admitted whoever caused it,
    // and everything else still answers to `opponentEffectOnly`.
    const anyKo = entry.alsoAnyKo === true && removalKind === "ko";
    if (
      !anyKo &&
      entry.opponentEffectOnly &&
      (!byOpponent || cause === "battle")
    ) {
      continue;
    }
    // "…removed from the field by your opponent" with no "effect" (OP15-098
    // Monkey.D.Luffy): the opponent's effects and a fight lost to their
    // attacker, and never its controller's own removal.
    if (entry.opponentOnly && !byOpponent) continue;
    // A K.O.-only clause says nothing about a bounce or a bury.
    if (removalKind === "off-field" && entry.removal !== "off-field") continue;
    // "…would be K.O.'d in battle" (OP10-034 Franky): the exact complement, and
    // the only reading that admits battle destruction and nothing else.
    if (entry.battleOnly && cause !== "battle") continue;
    // "…by an effect", with no side named: losing a fight is not one.
    if (entry.effectOnly && cause === "battle") continue;
    if (
      entry.oncePerTurn &&
      state.oncePerTurn.includes(
        `${state.turn}:${targetPlayerId}:${protector.instanceId}:replacement`,
      )
    ) {
      continue;
    }
    // Absent `protects`, the clause reads "if *this* Character would be
    // K.O.'d" and guards only its own printing.
    if (entry.protects === undefined) {
      if (protector.instanceId !== target.instanceId) continue;
    } else if (
      !selectCards(
        state,
        { sourcePlayerId: targetPlayerId, source: target },
        { ...entry.protects, player: "self", zone: "board" },
        {},
        db,
      ).some((card) => card.instanceId === target.instanceId)
    ) {
      continue;
    } else if (
      entry.excludesSelf &&
      protector.instanceId === target.instanceId
    ) {
      // "…other than this Character" (OP15-094 Roronoa Zoro). An instance
      // question, so it cannot live inside `protects`, which filters the
      // threatened card on printed facts.
      continue;
    }
    // "[Opponent's Turn]" on a replacement, read the way every other reaction
    // reads the turn player.
    if (entry.opponentTurnOnly && state.turnPlayerId === targetPlayerId) {
      continue;
    }
    // An "If ..." that is about the board rather than about the threatened
    // card -- EB04-044's Navy Leader. Read in the defender's context, so
    // `"self"` in the condition is the side losing the Character.
    if (
      entry.requires !== undefined &&
      !conditionMatches(
        state,
        { sourcePlayerId: targetPlayerId, source: target },
        entry.requires,
        {},
        db,
      )
    ) {
      continue;
    }
    // An offer whose cost cannot be paid is worse than no offer: taking it
    // would cancel the removal for free.
    if (entry.cost.kind === "trash-from-hand") {
      const payable = selectCards(
        state,
        { sourcePlayerId: targetPlayerId, source: protector },
        { ...(entry.cost.match ?? {}), player: "self", zone: "hand" },
        {},
        db,
      ).length;
      if (payable < entry.cost.count) continue;
    }
    if (entry.cost.kind === "rest-own-cards") {
      const payable = selectCards(
        state,
        { sourcePlayerId: targetPlayerId, source: protector },
        restOwnCardsSelector(entry.cost),
        {},
        db,
      ).length;
      if (payable < entry.cost.count) continue;
    }
    if (
      entry.cost.kind === "bury-from-trash" &&
      state.players[targetPlayerId].trash.length < entry.cost.count
    ) {
      continue;
    }
    // The price is the *removing* player's board, so it is counted on their
    // side and only the Characters that can actually be rested count: resting
    // a rested Character pays nothing, an effect can bar the rest outright
    // (OP07-029#2), and an offer that pays nothing cancels a removal for
    // free. The selector is the one the payment step chooses from, so the
    // offer and the payment cannot disagree.
    if (entry.cost.kind === "rest-opponent-characters") {
      const payable = selectCards(
        state,
        { sourcePlayerId: targetPlayerId, source: protector },
        {
          player: "opponent",
          zone: "board",
          category: "character",
          rested: false,
          canRest: true,
        },
        {},
        db,
      ).length;
      if (payable < entry.cost.count) continue;
    }
    if (entry.cost.kind === "bottom-deck-own-character") {
      const payable = selectCards(
        state,
        { sourcePlayerId: targetPlayerId, source: protector },
        {
          ...(entry.cost.match ?? {}),
          player: "self",
          zone: "board",
          category: "character",
        },
        {},
        db,
      ).length;
      if (payable < entry.cost.count) continue;
    }
    if (
      (entry.cost.kind === "life-to-hand" ||
        entry.cost.kind === "trash-life") &&
      state.players[targetPlayerId].life.length < entry.cost.count
    ) {
      continue;
    }
    // "[DON!! x1]" on a replacement -- OP05-001 Sabo's Leader. The DON!! has
    // to be given to the *protector's controller's Leader*, which for the one
    // card that prints it is the protector itself.
    if (
      entry.leaderAttachedDon !== undefined &&
      state.players[targetPlayerId].leaderAttachedDon.length <
        entry.leaderAttachedDon
    ) {
      continue;
    }
    // The card turned is the top one, so the top must be face-down: a face-up
    // top card cannot pay even with face-down cards under it (ST29-008#1). The
    // payment's own selector reads only the top card, so an offer made on any
    // face-down card lower down would be a replacement nothing pays for.
    const topLife = state.players[targetPlayerId].life[0];
    if (
      entry.cost.kind === "turn-life-face-up" &&
      (topLife === undefined || topLife.faceUp === true)
    ) {
      continue;
    }
    // "Rest this Character and trash 1 card": an already-rested protector cannot
    // pay the first half.
    if (entry.cost.kind === "trash-from-hand" && entry.cost.restsSelf) {
      if (protector.rested) continue;
    }
    // Nor can it pay a cost that is nothing but the rest.
    if (entry.cost.kind === "rest-self" && protector.rested) continue;
    // Active DON!! only: resting a rested DON!! is not a payment.
    if (
      entry.cost.kind === "rest-don" &&
      state.players[targetPlayerId].activeDon.length < entry.cost.count
    ) {
      continue;
    }
    // A DON!! returned to the DON!! deck can come from anywhere on the field --
    // rested, active or given to a card -- so this counts the field rather than
    // the active pool the way `rest-don` above has to.
    if (
      entry.cost.kind === "return-don" &&
      fieldDonCount(state, targetPlayerId) < entry.cost.count
    ) {
      continue;
    }
    eligible.push({ protector, entry });
  }
  return eligible;
}

/**
 * The other cards one removal is taking alongside the threatened one that the
 * same accepted replacement also saves.
 *
 * One effect removing several Characters at once is one event, and Bandai's
 * OP-17 Q&A (OP17-015 Q1, OP17-021 Q3, OP17-023 Q2, OP17-095 Q2) rules that one
 * payment protects every Character it could have protected. A card is covered
 * when the same protector would have been offered for it too -- read before the
 * cost is paid, since paying can itself leave the offer unaffordable.
 *
 * OP11-101's redirect acts on the threatened card rather than paying for it,
 * and moves one attack onto one card, so it covers only that one. OP05-001's
 * power penalty is also paid on the threatened card, but Bandai rules that one
 * use spares every Character the K.O. takes at once, each taking the −1000
 * (OP05-001#3): the offer paths bind the covered cards beside the threatened
 * one, and the penalty lands on all of them.
 */
export function replacementCoveredTargets(
  state: GameState,
  sourcePlayerId: PlayerId,
  protectedPlayerId: PlayerId,
  { protector, entry }: EligibleReplacement,
  candidates: readonly string[],
  db: CardDatabase,
  removalKind: "ko" | "off-field",
): string[] {
  if (entry.redirect !== undefined) return [];
  return candidates.filter((instanceId) => {
    const card = state.players[protectedPlayerId].board.find(
      (candidate) => candidate.instanceId === instanceId,
    );
    return (
      card !== undefined &&
      eligibleReplacements(
        state,
        sourcePlayerId,
        protectedPlayerId,
        card,
        db,
        "effect",
        removalKind,
      ).some((other) => other.protector.instanceId === protector.instanceId)
    );
  });
}

/** The names of `playerId`'s board cards, for a replacement offer's label. */
export function boardCardNames(
  state: GameState,
  playerId: PlayerId,
  instanceIds: readonly string[],
  db: CardDatabase,
): string {
  return instanceIds
    .flatMap((instanceId) => {
      const card = state.players[playerId].board.find(
        (candidate) => candidate.instanceId === instanceId,
      );
      return card ? [db.require(card.cardNumber).name] : [];
    })
    .join(", ");
}

/**
 * The effect a chosen replacement runs instead of the K.O.
 *
 * Exported because both offer paths have to run the same cost: the `knock-out`
 * node below, and the older `ko-character` pending effect in
 * `resolve-effect/removal.ts`, which reaches it for the cost shapes that need a
 * choice it has no bespoke pending effect for.
 */
/**
 * The cards a `rest-own-cards` replacement may be paid with.
 *
 * Written once because the affordability check and the cost itself must agree:
 * an offer made against one reading and paid against another is exactly the
 * drift the replacement registry was introduced to stop. "Your cards" reaches
 * the Stage as well as the board; "your Characters" (a `match` naming the
 * category) does not; and an explicit `zones`/`includeLeader` overrides both,
 * for text that names a Stage or the Leader by name (OP11-110 Fukaboshi).
 */
function restOwnCardsSelector(cost: {
  kind: "rest-own-cards";
  count: number;
  match?: Omit<CardSelector, "player" | "zone">;
  zones?: readonly CardZone[];
  includeLeader?: boolean;
}): CardSelector {
  // "Your cards" with nothing narrowing it reaches the active DON!! as well
  // (OP14-029#1); text naming a category, a zone or the Leader does not.
  const anyCard =
    cost.match === undefined &&
    cost.zones === undefined &&
    cost.includeLeader === undefined;
  return {
    ...(cost.match ?? {}),
    player: "self",
    zone: cost.zones ?? (cost.match === undefined ? OWN_CARDS_ZONES : "board"),
    includeLeader: cost.includeLeader ?? cost.match === undefined,
    rested: false,
    ...(anyCard ? { includeActiveDon: true as const } : {}),
  };
}

export function replacementCostEffect(
  eligible: EligibleReplacement,
  protectedPlayerIsSource: boolean,
  bind: string,
): MechanicEffect {
  if (eligible.entry.cost.kind === "ko-self") {
    return { kind: "knock-out", binding: bind, skipReplacements: true };
  }
  if (eligible.entry.cost.kind === "trash-self-and-draw") {
    // The same self-trash as `trash-self`, plus the draw the printed clause
    // pays out with -- OP08-045 Thatch is the only card in the pool that turns
    // its own removal into a card. Written as one cost rather than as a
    // `trash-self` with a program behind it because a replacement's payment is
    // the whole of what it does: there is no "then" step to hang the draw on.
    const drawCount = eligible.entry.cost.draw;
    return {
      kind: "sequence",
      effects: [
        {
          kind: "move",
          binding: bind,
          to: {
            player: protectedPlayerIsSource ? "self" : "opponent",
            zone: "trash",
          },
          skipReplacements: true,
        },
        {
          kind: "draw",
          player: protectedPlayerIsSource ? "self" : "opponent",
          count: drawCount,
        },
      ],
    };
  }
  if (eligible.entry.cost.kind === "rest-self") {
    // The protector stays on the field; what it loses is the rest of its turn.
    // `rest` rather than `update: { rested: true }`, because resting is a
    // visible board event other clauses watch -- and this one is paid on the
    // opponent's turn, where a `whenRested` program gated on `[Your Turn]`
    // correctly ignores it.
    return { kind: "rest", binding: bind };
  }
  if (eligible.entry.cost.kind === "return-self-to-hand") {
    // `trash-self` below with the hand as the destination. "The owner's hand"
    // is the protected player's, which `owner` names from either side of the
    // table without the `protectedPlayerIsSource` flip the trash needs.
    return {
      kind: "move",
      binding: bind,
      to: { player: "owner", zone: "hand" },
      skipReplacements: true,
    };
  }
  if (eligible.entry.cost.kind === "trash-self") {
    // `bind` is already bound to the protector by the caller, so this is a
    // plain `move` rather than a `knock-out`: the card leaves the field without
    // being K.O.'d, and `removeCard` hands its attached DON!! back.
    //
    // The two older offer paths reach this function without that binding, which
    // is why `resolve-effect/removal.ts` pays this shape itself rather than
    // dispatching it. Nothing routes a `trash-self` through the
    // battle-destruction path in `resolve-effect/replacements.ts`: every
    // printing of it so far reads "by your opponent's effect".
    return {
      kind: "move",
      binding: bind,
      to: {
        player: protectedPlayerIsSource ? "self" : "opponent",
        zone: "trash",
      },
      skipReplacements: true,
    };
  }
  // The cards leave the *protected* player's hand, which is the opponent of the
  // effect's source in every case but a player removing their own Character.
  const player: PlayerRef = protectedPlayerIsSource ? "self" : "opponent";
  const cost = eligible.entry.cost;
  if (cost.kind === "power-penalty") {
    // The *threatened* card takes the penalty, not the protector: OP05-001
    // Sabo's Leader keeps a 5000+ body alive by shrinking it. Every offer path
    // binds the threatened card under `${bind}-threatened`, the same seam
    // OP11-101's redirect reads.
    return {
      kind: "modify-power",
      binding: `${bind}-threatened`,
      amount: cost.amount,
      expiresAfterTurns: 0,
    };
  }
  if (cost.kind === "trash-life") {
    // The top of the protected player's Life goes to the trash, not to the
    // hand: OP05-100 Enel pays with the card itself, and the Trigger it might
    // have carried never opens. Payable only while there is Life to spend --
    // `eligibleReplacements` withholds the offer at zero.
    return {
      kind: "select",
      selector: { player, zone: "life", position: "top" },
      bind: `${bind}-cost`,
      count: cost.count,
      effect: {
        kind: "move",
        binding: `${bind}-cost`,
        to: { player, zone: "trash" },
      },
    };
  }
  if (cost.kind === "self-power-penalty") {
    return {
      kind: "modify-power",
      binding: bind,
      amount: cost.amount,
      expiresAfterTurns: 0,
    };
  }
  if (cost.kind === "leader-power-penalty") {
    return {
      kind: "select",
      selector: { player, zone: [], includeLeader: true },
      bind: `${bind}-cost`,
      count: "all",
      effect: {
        kind: "modify-power",
        binding: `${bind}-cost`,
        amount: cost.amount,
        expiresAfterTurns: 0,
      },
    };
  }
  if (cost.kind === "rest-own-cards") {
    return {
      kind: "choose",
      selector: { ...restOwnCardsSelector(cost), player },
      bind: `${bind}-cost`,
      min: cost.count,
      max: cost.count,
      ...(player === "opponent" ? { chooser: "opponent" as const } : {}),
      effect: { kind: "rest", binding: `${bind}-cost` },
    };
  }
  if (cost.kind === "life-to-hand") {
    // The top of the *protected* player's Life, taken without a choice: the
    // printed clause names the top card, and a face-down Life card is not
    // something its owner can pick between anyway.
    return {
      kind: "select",
      selector: { player, zone: "life", position: "top" },
      bind: `${bind}-cost`,
      count: cost.count,
      effect: {
        kind: "move",
        binding: `${bind}-cost`,
        to: { player, zone: "hand" },
      },
    };
  }
  if (cost.kind === "rest-don") {
    return { kind: "rest-don", player, count: cost.count };
  }
  if (cost.kind === "rest-opponent-characters") {
    // The other side of the table from `player`, which is the protected
    // player's ref: the cards rested belong to whoever is doing the removing,
    // and the choice of which ones is the protected player's -- it is their
    // clause. `canRest` keeps a Character somebody has already protected from
    // being offered as payment.
    const remover: PlayerRef = player === "self" ? "opponent" : "self";
    return {
      kind: "choose",
      selector: {
        player: remover,
        zone: "board",
        category: "character",
        rested: false,
        canRest: true,
      },
      bind: `${bind}-cost`,
      min: cost.count,
      max: cost.count,
      ...(player === "opponent" ? { chooser: "opponent" as const } : {}),
      effect: { kind: "rest", binding: `${bind}-cost` },
    };
  }
  if (cost.kind === "bottom-deck-own-character") {
    return {
      kind: "choose",
      selector: {
        ...(cost.match ?? {}),
        player,
        zone: "board",
        category: "character",
      },
      bind: `${bind}-cost`,
      min: cost.count,
      max: cost.count,
      ...(player === "opponent" ? { chooser: "opponent" as const } : {}),
      // The protected player moving their own Character to pay their own
      // clause: not a removal by the opponent's effect, so it raises no
      // replacement of its own. Without this, OP15-052 Leo bottoming another
      // Character offered Leo again for that Character, and again, forever.
      effect: {
        kind: "move",
        binding: `${bind}-cost`,
        to: { player: "owner", zone: "deck", position: "bottom" },
        skipReplacements: true,
      },
    };
  }
  if (eligible.entry.redirect === "own-life-face-down") {
    // OP11-101 Capone"Gang"Bege: "[printed text omitted -- pnpm card:text OP11-101]" The *threatened* card moves, and `bind` holds the
    // protector -- so the caller binds the threatened card under
    // `${bind}-threatened`, which is the one shape in this function that reads a
    // second binding.
    return {
      kind: "move",
      binding: `${bind}-threatened`,
      to: { player: "owner", zone: "life", position: "top" },
      skipReplacements: true,
    };
  }
  if (cost.kind === "none") {
    // Nothing is paid: the `[Once Per Turn]` key the offer books is the price.
    // An empty `sequence` is the DSL's no-op and keeps the caller's "run the
    // cost, then skip the K.O." shape intact.
    return { kind: "sequence", effects: [] };
  }
  if (cost.kind === "return-don") {
    // No `choose`: `returnDonToDeck` takes the cheapest DON!! immediately and
    // `offerDonReturnChoice` lets the controller re-home it once the action has
    // finished resolving, which is how every other `DON!! −N` in the pool is
    // paid. A choice here would suspend on a `mechanic-choice` inside a
    // suspended battle, which is the thing this cost set exists to avoid.
    return { kind: "return-don", player, count: cost.count };
  }
  if (cost.kind === "bury-from-trash") {
    return {
      kind: "choose",
      selector: { player, zone: "trash" },
      bind: `${bind}-cost`,
      min: cost.count,
      max: cost.count,
      ...(player === "opponent" ? { chooser: "opponent" as const } : {}),
      effect: {
        kind: "move",
        binding: `${bind}-cost`,
        to: { player, zone: "deck", position: "bottom" },
      },
    };
  }
  if (cost.kind === "turn-life-face-up") {
    // Information, not a card: the Life total does not move. `faceUp: false` on
    // the selector is what makes it a payment -- a pile with nothing face-down
    // left cannot pay again, which is what keeps a repeatable protection finite.
    return {
      kind: "choose",
      selector: { player, zone: "life", position: "top", faceUp: false },
      bind: `${bind}-cost`,
      min: 1,
      max: 1,
      ...(player === "opponent" ? { chooser: "opponent" as const } : {}),
      effect: { kind: "update", binding: `${bind}-cost`, faceUp: true },
    };
  }
  const trashFromHand: MechanicEffect = {
    kind: "choose",
    selector: { ...(cost.match ?? {}), player, zone: "hand" },
    bind: `${bind}-cost`,
    min: cost.count,
    max: cost.count,
    ...(player === "opponent" ? { chooser: "opponent" as const } : {}),
    effect: {
      kind: "move",
      binding: `${bind}-cost`,
      to: { player, zone: "trash" },
      // The protector's effect trashes the card, not the remover's -- which is
      // what OP12-040 Kuzan's Leader asks of a {Navy} protector.
      sourceBinding: bind,
    },
  };
  // "…you may rest this Character *and* trash 1 card from your hand instead"
  // (OP12-048 Donquixote Rosinante): two payments for one protection, and the
  // rest is the protector's own -- `bind` is already bound to it by the caller.
  return cost.restsSelf
    ? {
        kind: "sequence",
        effects: [{ kind: "rest", binding: bind }, trashFromHand],
      }
    : trashFromHand;
}

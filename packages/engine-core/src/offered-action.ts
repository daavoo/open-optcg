/**
 * Matching a caller's `actionId` to the offer the engine made, and composing
 * the one action whose payload the caller writes.
 *
 * Every seat still picks one opaque `actionId` out of `legalActions`, with one
 * exception this module owns. An `order-to-bottom` choice -- "[printed text omitted -- pnpm card:text <card>]" -- is a single action whose content is
 * the order, so the engine offers the order the cards were looked at in and
 * accepts any permutation of it, rather than listing every permutation: five
 * leftover cards are 120 orders, and enumerating them puts 120 lines in front
 * of every policy and every LLM seat to settle a question that only a human
 * with a plan for the bottom of their deck will answer differently.
 *
 * The relaxation is exactly that -- the same offer with its index list
 * rewritten. Anything that is not a permutation of the offered indices matches
 * no offer and is illegal, so a composed action can only reach a position the
 * engine would have allowed anyway; and because the chosen order is in the
 * `actionId`, a recorded trace still replays to the same deck.
 */
import type { KnownCardRef, LegalAction } from "@one-piece-sim/protocol";

/**
 * Where an ordering choice puts the cards, as words.
 *
 * Carried as already-worded phrases rather than as `MoveDestination`s so this
 * module stays free of the mechanics DSL: the caller that knows the node also
 * knows how to say it. `atPrimary` is how many of `names` go to `primary`:
 * all of them, or none and they all go to `alternate`.
 */
export interface OrderDestinations {
  primary: string;
  alternate?: string;
  atPrimary?: number;
}

/**
 * How an ordering choice reads, given the cards in the order it would place
 * them. Shared with the option list so the offer and a caller's reordering of
 * it are described by the same sentence.
 *
 * With no `destinations` the sentence is the bottom-of-deck one, which is what
 * most single-destination callers print. A caller that places cards anywhere
 * else passes its own `primary`, and the offer carries the phrase as
 * `option.destination` so `restamp` below can re-word a reordered offer with
 * the same ending -- ST-13's Life-reordering clauses are why that stopped being
 * an assumption.
 *
 * With two destinations the end each card goes to is *the* thing being
 * decided, so it has to be in the sentence. Without it the two options a split
 * offers read identically, which is an offer a player cannot answer and a
 * policy cannot rank -- EB03-023 Kaya's "top or bottom of the deck" was two
 * lines of the same words.
 */
export function orderSummary(
  names: readonly string[],
  destinations?: OrderDestinations,
): string {
  const listed = names.join(", ");
  // One card has no order, so the clause that names one would be noise. It
  // still has an end, which is why a single-card offer exists at all.
  const inOrder = names.length > 1 ? ", in that order" : "";
  if (!destinations) {
    return `Place ${listed} at the bottom of your deck${inOrder}`;
  }
  const { primary, alternate } = destinations;
  const atPrimary = destinations.atPrimary ?? names.length;
  if (alternate === undefined || atPrimary >= names.length) {
    return `Place ${listed} at ${primary}${inOrder}`;
  }
  return `Place ${listed} at ${alternate}${inOrder}`;
}

/**
 * An ordering action's trailing index list, the offer it belongs to, and --
 * on a split placement -- the `|N` split point after the list.
 */
function splitOrderId(
  actionId: string,
): { head: string; indices: string[]; split?: string } | undefined {
  const cut = actionId.lastIndexOf(":");
  if (cut < 0) return undefined;
  const tail = actionId.slice(cut + 1);
  const bar = tail.indexOf("|");
  return {
    head: actionId.slice(0, cut),
    indices: (bar < 0 ? tail : tail.slice(0, bar)).split(","),
    ...(bar < 0 ? {} : { split: tail.slice(bar + 1) }),
  };
}

/**
 * The split point a caller asked for, when it is one the offer allows: a
 * split offer takes "all to the alternate" (0) or "all to the primary
 * destination" (every card) and nothing in between, because a "top or bottom"
 * placement never divides its cards (Bandai's OP15-066#1); an unsplit offer
 * takes none.
 */
function acceptedSplit(
  offered: string | undefined,
  requested: string | undefined,
  count: number,
): { ok: boolean; atPrimary?: number } {
  if (offered === undefined) return { ok: requested === undefined };
  if (requested === undefined || !/^\d+$/.test(requested)) return { ok: false };
  const atPrimary = Number(requested);
  return atPrimary === 0 || atPrimary === count
    ? { ok: true, atPrimary }
    : { ok: false };
}

/** Whether two index lists name the same positions, in whatever order. */
function samePermutation(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((index, position) => index === sortedB[position]);
}

/** The offer, restamped with a caller's order over the cards it named. */
function restamp(
  offer: LegalAction & { type: "resolve-effect" },
  cards: readonly KnownCardRef[],
  indices: readonly string[],
  destination: string | undefined,
  /** A split offer's two ends and where the caller divided the order. */
  split?: { alternate: string; atPrimary: number },
): LegalAction {
  const payload = `${indices.join(",")}${split ? `|${split.atPrimary}` : ""}`;
  const idHead = (id: string) => id.slice(0, id.lastIndexOf(":") + 1);
  return {
    ...offer,
    actionId: `${idHead(offer.actionId)}${payload}`,
    optionId: `${idHead(offer.optionId)}${payload}`,
    option: {
      kind: "order",
      cards: [...cards],
      ...(destination === undefined ? {} : { destination }),
      ...(split ? { alternate: split.alternate } : {}),
    },
    summary: orderSummary(
      cards.map((card) => card.name),
      split && destination !== undefined
        ? { primary: destination, ...split }
        : destination === undefined
          ? undefined
          : { primary: destination },
    ),
  };
}

/** Where an ordering offer puts its cards, when it is not the deck's bottom. */
function orderDestination(action: LegalAction): string | undefined {
  if (action.type !== "resolve-effect") return undefined;
  return action.option.kind === "order" ? action.option.destination : undefined;
}

/** A split ordering offer's second end, or `undefined` for any other action. */
function orderAlternate(action: LegalAction): string | undefined {
  if (action.type !== "resolve-effect") return undefined;
  return action.option.kind === "order" ? action.option.alternate : undefined;
}

/** The cards an ordering offer would place, or `undefined` for any other action. */
function orderedCards(
  action: LegalAction,
): readonly KnownCardRef[] | undefined {
  if (action.type !== "resolve-effect") return undefined;
  return action.option.kind === "order" ? action.option.cards : undefined;
}

/**
 * The same ordering offer, placing its cards in `order` instead.
 *
 * `order` indexes the offer's own `option.cards`, so `[2, 0, 1]` places the
 * third card first. This is how a caller with a preference expresses it: the
 * result is a `LegalAction` like any other, and submitting it goes back through
 * {@link findOfferedAction}, which re-checks it against what was actually
 * offered.
 */
export function reorderAction(
  action: LegalAction,
  order: readonly number[],
  /**
   * On a split offer, how many cards from the front of `order` go to the
   * offer's own destination; the rest go to its alternate. Only 0 and every
   * card are legal -- the cards all go to one end. Defaults to the split the
   * offer was made with.
   */
  atPrimary?: number,
): LegalAction {
  const cards = orderedCards(action);
  if (!cards) throw new Error(`NOT_AN_ORDERING_ACTION: ${action.actionId}`);
  const indices = order.map((index) => String(index));
  const offered = cards.map((_, index) => String(index));
  if (!samePermutation(offered, indices)) {
    throw new Error(`INVALID_ORDER: ${indices.join(",")}`);
  }
  const alternate = orderAlternate(action);
  const offeredSplit = splitOrderId(action.actionId)?.split;
  if (alternate === undefined || offeredSplit === undefined) {
    if (atPrimary !== undefined) {
      throw new Error(`NOT_A_SPLIT_ORDER: ${action.actionId}`);
    }
    return restamp(
      action as LegalAction & { type: "resolve-effect" },
      order.map((index) => cards[index]!),
      indices,
      orderDestination(action),
    );
  }
  const split = atPrimary ?? Number(offeredSplit);
  if (split !== 0 && split !== cards.length) {
    throw new Error(`INVALID_SPLIT: ${split}`);
  }
  return restamp(
    action as LegalAction & { type: "resolve-effect" },
    order.map((index) => cards[index]!),
    indices,
    orderDestination(action),
    { alternate, atPrimary: split },
  );
}

/**
 * The legal action `actionId` names, or `undefined` when it names none.
 *
 * A reordered `order-to-bottom` comes back as the offer it reorders, restamped
 * with the caller's id, option id, card order and summary, so everything
 * downstream -- the transition, the notification callbacks, the trace -- reads
 * the order that was chosen rather than the one that was offered.
 */
export function findOfferedAction(
  legalActions: readonly LegalAction[],
  actionId: string,
): LegalAction | undefined {
  const exact = legalActions.find((action) => action.actionId === actionId);
  if (exact) return exact;
  const requested = splitOrderId(actionId);
  if (!requested) return undefined;
  for (const candidate of legalActions) {
    const cards = orderedCards(candidate);
    if (!cards) continue;
    const offered = splitOrderId(candidate.actionId);
    if (!offered || offered.head !== requested.head) continue;
    if (!samePermutation(offered.indices, requested.indices)) continue;
    // A split offer accepts any split point, the way it accepts any order:
    // the engine lists only the two all-to-one-end splits.
    const split = acceptedSplit(offered.split, requested.split, cards.length);
    if (!split.ok) continue;
    const alternate = orderAlternate(candidate);
    return restamp(
      candidate as LegalAction & { type: "resolve-effect" },
      requested.indices.map((index) => cards[Number(index)]!),
      requested.indices,
      orderDestination(candidate),
      split.atPrimary !== undefined && alternate !== undefined
        ? { alternate, atPrimary: split.atPrimary }
        : undefined,
    );
  }
  return undefined;
}

/**
 * EB-05 fragments more than one of its cards, or more than one clause of one
 * card, prints.
 *
 * Printed text for any card here is `pnpm card:text <CARD>`; the repo carries
 * the derived rules and not the words.
 */
import {
  type BattleTargetFilter,
  type CardSelector,
  type MechanicEffect,
} from "../mechanics.js";

/**
 * "You may reveal N <cards> from your hand: <effect>" -- EB05-004 Baby 5 (two
 * Events), EB05-007 Monet (three Event or {Punk Hazard} cards) and the cost
 * half of EB05-008's `[Main]`.
 *
 * The reveal spends nothing -- the cards stay in hand -- so the price is
 * information, and the same cards can pay it again next turn. The payoff is
 * nested inside the `choose` rather than sequenced after it: a `choose` with
 * fewer candidates than its `min` is skipped, so a sequence would hand the
 * payoff to a hand that cannot show the cards.
 */
export const revealFromHand = (
  match: Omit<CardSelector, "player" | "zone">,
  count: number,
  bind: string,
  effect: MechanicEffect,
): MechanicEffect => ({
  kind: "choose",
  selector: { ...match, player: "self", zone: "hand" },
  bind,
  min: count,
  max: count,
  effect: {
    kind: "sequence",
    effects: [{ kind: "reveal", binding: bind }, effect],
  },
});

/**
 * "Play up to 1 Character card <match> from your hand" -- EB05-004's `[On K.O.]`
 * (rested), EB05-016's `[On Play]`, EB05-019's `[Trigger]` and EB05-061's
 * `[On Play]`.
 */
export const playCharacterFromHand = (
  match: Omit<CardSelector, "player" | "zone" | "category">,
  bind: string,
  rested = false,
): MechanicEffect => ({
  kind: "choose",
  selector: { ...match, player: "self", zone: "hand", category: "character" },
  bind,
  min: 0,
  max: 1,
  effect: { kind: "play", binding: bind, ...(rested ? { rested } : {}) },
});

/**
 * "Your {Fish-Man} or {Merfolk} type Leader gains +N power during this battle"
 * -- EB05-013 Shirley and EB05-017 Mermaid Cafe Dancers.
 *
 * A battle filter rather than a Leader-type condition: the buff only does
 * anything while that Leader is the card being attacked, and the
 * `[On Your Opponent's Attack]` ladder withholds an offer whose battle power
 * cannot land -- so a Character being attacked, or a Leader of another type,
 * is never asked to pay the DON!! for nothing.
 */
export const fishManOrMerfolkLeader: BattleTargetFilter = {
  isLeader: true,
  anyOfTypes: ["Fish-Man", "Merfolk"],
};

/**
 * "Give up to 1 Character +/-N power during this turn", naming no side --
 * both modes of EB05-006 Miss Buckingham Stussy's `[Activate: Main]`.
 */
export const anyCharacterPower = (
  bind: string,
  amount: number,
): MechanicEffect => ({
  kind: "choose",
  selector: { player: "either", zone: "board", category: "character" },
  bind,
  min: 0,
  max: 1,
  effect: {
    kind: "modify-power",
    binding: bind,
    amount,
    expiresAfterTurns: 0,
  },
});

/**
 * "Your Leader [Shirahoshi]", still active -- what EB05-020's cost rests. A
 * Leader is in no zone, so it is reached through `includeLeader` over an
 * empty zone list; `rested: false` because resting a rested Leader pays
 * nothing.
 */
export const shirahoshiLeaderActive = {
  zone: [],
  includeLeader: true,
  name: "Shirahoshi",
  rested: false,
} as const satisfies Omit<CardSelector, "player">;

/**
 * "Add up to 1 card from the top of your deck to the top of your Life cards."
 *
 * EB05-055 Nami's `[On Play]` and EB05-060 Take Care of Lilith!!!'s `[Main]`.
 * A `choose` over the single top card rather than a bare move: the printed "up
 * to" lets the player keep the Life total where it is, and an empty deck
 * resolves to nothing.
 */
export const deckTopToLife = (bind: string): MechanicEffect => ({
  kind: "choose",
  selector: { player: "self", zone: "deck", position: "top" },
  bind,
  min: 0,
  max: 1,
  effect: {
    kind: "move",
    binding: bind,
    to: { player: "self", zone: "life", position: "top" },
  },
});

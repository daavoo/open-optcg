import type { CardRecord } from "./index.js";

/**
 * The Sealed Battle promo Leader -- "Rainbow Luffy".
 *
 * Sealed events are played with a Leader you bring rather than one you open, and
 * this is the Leader the format is built around: six colours, so no card in a
 * pool is ever off-colour, and a printed clause that makes it answer to every
 * card name, type and attribute in the game. That second half is why the OP17
 * pool plays at all in sealed -- most OP17 cards gate on "[printed text omitted -- pnpm card:text <card>]" or "has the {Elbaph} type", and under any single real Leader
 * the majority of a random pool would be inert text.
 *
 * ## Provenance
 *
 * Weaker than the rest of the registry, and it cannot be improved right now.
 * The card is a Japanese Sealed Battle 2023 Vol. 1 leader-pack promo that Bandai
 * publishes on neither its English nor its Asia-English cardlist, and it is
 * absent from the egman secondary dump the OP17 identities came from. The stats
 * below come from two independent retailer listings that agree on all of them
 * (Life 4, 5000 power, all six colours, <Strike>, {Straw Hat Crew}) plus the
 * effect text quoted identically by both:
 *
 *   https://www.gamenerdz.com/monkey-d-luffy-leader-pack-sealed-battle-2023-vol-1-one-piece-promotion-cards
 *   https://www.tcgplayer.com/product/518691/one-piece-card-game-one-piece-promotion-cards-monkeydluffy-leader-pack-sealed-battle-2023-vol-1
 *
 * `SEALED-LUFFY` is a synthetic card number. The promo's real number is not
 * published anywhere reachable, and P-001 -- the one number a search suggested --
 * is already a different card in Bandai's promo list. A made-up id that is
 * obviously made up beats a plausible-looking wrong one.
 *
 * There is no primary source for it, so it carries no provenance stamp and no
 * shipped deck may name it -- sealed builds its own pool instead.
 *
 * ## The "only in designated events" clause
 *
 * The first sentence is a deck-construction restriction, not a game rule, so
 * nothing in the engine dispatches it. It is enforced where decks are built:
 * sealed offers this Leader, and the constructed deck editor must not.
 */
export const sealedPromoCards = [
  {
    cardNumber: "SEALED-LUFFY",
    name: "Monkey.D.Luffy",
    category: "leader",
    // A Leader's `cost` field carries its Life; see the setup step in engine.ts.
    cost: 4,
    power: 5000,
    counter: null,
    colors: ["Red", "Green", "Blue", "Purple", "Black", "Yellow"],
    types: ["Straw Hat Crew"],
    attribute: "Strike",
    rules: {
      keywords: [],
      donRequirement: 0,
      donDeckSize: 10,
      hasTrigger: false,
      hasCounterEvent: false,
      // The wildcard sentence is deck construction, not an effect box the
      // engine reads -- but it is printed there, so a "no base effect" search
      // must not find this Leader.
      hasPrintedEffect: true,
      clauses: ["static"],
      tokens: [],
      nameAliases: [],
      identityWildcard: true,
      cannotAttack: false,
      mentionsCannotAttack: false,
      survivesEmptyDeck: false,
      winsOnEmptyDeck: false,
      deckTypeRestriction: "",
      deckEventCostLimit: null,
      deckCostLimit: null,
      openingStageType: "",
      searchRevealPublic: false,
      clauseSummaries: {},
      copyLimit: 4,
      eventRestricted: true,
      triggerIsDeadWeightDebuff: false,
      buffsAllCharacters: false,
      koClauseMentionsLife: false,
      costBoosts: [],
      addsDonFromDonDeck: false,
      eventConditionDependsOnPool: false,
      removalText: false,
      advantageText: false,
    },
  },
] as const satisfies readonly CardRecord[];

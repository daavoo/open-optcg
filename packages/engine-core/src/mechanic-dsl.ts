/**
 * The mechanic DSL: the selectors, conditions, effects and program shapes the
 * set modules under `mechanics/` are written in, and the signals and pending
 * choices the interpreter in `mechanics.ts` raises while running them.
 *
 * `mechanics.ts` re-exports all of it, so a set module's
 * `import ... from "../mechanics.js"` keeps working.
 */
import { hasCardName, hasCardType } from "@one-piece-sim/cards";
import type {
  GrantableKeyword,
  PlayerId,
  PlayerRestriction,
  PublicEvent,
} from "@one-piece-sim/protocol";
import type { CardInstance, GameState } from "./model.js";
import type { Keyword } from "./static-abilities.js";

export type PlayerRef = "self" | "opponent";

/**
 * The `oncePerTurn` entry recording that a player's Leader has battled one of
 * the opponent's Characters this turn.
 *
 * Written by `resolveBattle` and read by the `leader-battled-character`
 * condition, so the two cannot disagree about the same sentence. It is a note,
 * not a budget: nothing consumes it, and it is cleared with the rest of the
 * turn's keys.
 */
export const leaderBattledCharacterKey = (
  turn: number,
  playerId: PlayerId,
): string => `${turn}:${playerId}:leader-battled-character`;
/**
 * Where a `move` sends a card, and where an `order-to-bottom` places one.
 *
 * `player: "owner"` sends it to whoever controls it rather than to a fixed
 * side of the table -- "return ... to the owner's hand", "place ... at the
 * bottom of the owner's deck" -- which is the only reading that works for a
 * binding filled by an `"either"` selector, where the two halves have
 * different owners.
 *
 * Text that names one side keeps naming it: "add it to *your* hand" is
 * `"self"` even when the card came off the opponent's Life, because "owner"
 * would send it back where it came from.
 */
export interface MoveDestination {
  player: PlayerRef | "owner";
  zone: CardZone;
  position?: ZonePosition;
}

/**
 * Where a `move`-shaped node puts its cards, as a summary says it -- "the
 * bottom of your deck", "your Life cards".
 *
 * Beside the type rather than beside its callers because two of them need the
 * same sentence: the offer's summary in `effects.ts`, and the
 * `option.destination` in `effect-options.ts` that a caller reads to re-word a
 * reordering of that offer.
 */
export function describeMoveDestination(to: MoveDestination): string {
  const pile =
    to.zone === "life" ? "Life cards" : to.zone === "deck" ? "deck" : to.zone;
  const owned =
    to.player === "self"
      ? `your ${pile}`
      : to.player === "opponent"
        ? `their ${pile}`
        : `the ${pile}`;
  const end =
    to.position === "top"
      ? "the top of "
      : to.position === "bottom"
        ? "the bottom of "
        : "";
  return `${end}${owned}`;
}

export type CardZone =
  | "deck"
  | "hand"
  | "life"
  | "board"
  | "trash"
  /**
   * A player's Stage, read as a zone of at most one card. Selection-only:
   * nothing in the format moves a card *to* a Stage through this DSL (a
   * Stage is played through its own action), and `zoneCards` is what turns
   * the single optional field into an array of 0 or 1.
   */
  | "stage";
export type ZonePosition = "top" | "bottom" | "edge";

/**
 * The zones "your cards" reaches, for a cost or target that names no category.
 *
 * "You may rest 1 of your cards" (OP14-020's Leader, OP14-029, OP14-033,
 * OP14-037, OP17-037) names every card you control on the field: the Leader,
 * your Characters *and* your Stage. Pair it with `includeLeader: true` -- a
 * Leader sits in no zone and so cannot be named by a zone list.
 *
 * Text that says "Characters" keeps `zone: "board"` on its own. The two are a
 * real distinction the pool draws: OP01-055 prints "Characters", OP14-037
 * prints "cards".
 */
export const OWN_CARDS_ZONES = [
  "board",
  "stage",
] as const satisfies readonly CardZone[];

export interface MechanicContext {
  sourcePlayerId: PlayerId;
  source: CardInstance;
}

export interface CardSelector {
  /**
   * Whose cards are eligible. `"either"` is for text that names a card without
   * naming a side: "[printed text omitted -- pnpm card:text <card>]" (OP10-046 Kyros), "[printed text omitted -- pnpm card:text OP10-046]" (OP10-052 Bartolomeo).
   *
   * Every other selector in the pool says "your" or "your opponent's", which is
   * why this is not the default: a clause that does name a side must not reach
   * across the table, and an `"either"` written where the text says "your" would
   * offer the opponent's board as a target for the controller's own buff. The
   * companion is `to.player: "owner"` on `move` -- a card returned from either
   * side goes to *its* owner's hand, not to the source player's.
   */
  player: PlayerRef | "either";
  zone: CardZone | readonly CardZone[];
  /**
   * Include the selected player's Leader alongside cards from the chosen zone.
   *
   * `{ zone: [], includeLeader: true }` is therefore "your Leader, and nothing
   * else" -- the idiom for text that names only the Leader ("your Leader gains
   * +1000 power", "set your {Fish-Man} type Leader as active"), which otherwise
   * has no handle: a Leader sits in no zone, so every other selector reaches it
   * only as a companion to one.
   */
  includeLeader?: boolean;
  position?: ZonePosition;
  category?: string;
  type?: string;
  /**
   * Card name, for text that targets "your [Nami] cards".
   *
   * Matches any name the card answers to, so EB04-038 Rosinante & Law is found
   * by a search for a "[Trafalgar Law]". See `cardNames` in
   * `@one-piece-sim/cards`.
   */
  name?: string;
  /**
   * "…with a type including \"Baroque Works\"" -- a substring of a type name
   * rather than the whole of one, which also reaches {Former Baroque Works}.
   *
   * Separate from `type`, which is exact: OP14's Black package prints both
   * readings, sometimes on the same card, and collapsing them would either
   * exclude the six Former Baroque Works bodies in the pool or include them
   * where the text names {Baroque Works} exactly.
   */
  typeIncluding?: string;
  /**
   * A disjunction of identity filters, for text that offers a choice between
   * them: "[printed text omitted -- pnpm card:text <card>]" (OP09-069), "[printed text omitted -- pnpm card:text OP09-069]"
   * (OP12-073), and "[printed text omitted -- pnpm card:text OP12-073]" (OP15-106), where the
   * two halves differ only in card category and `category` alone would exclude
   * one of them.
   *
   * Separate from `name`/`type`, which stay conjunctive with everything else in
   * the selector: the two OP12-073 clauses overlap on a card that is both, and
   * running the selector twice would buff it twice.
   *
   * Each clause is itself a conjunction of whichever fields it sets, so the
   * disjunction can hold a branch that needs two facts at once: OP12-034 Perona
   * reveals "up to 1 <Slash> attribute card **or** green Event", and the second
   * branch is a colour *and* a category. Every field mirrors its top-level
   * namesake, `attribute` included -- it reads granted attributes as well as
   * printed ones, so a Character handed <Slash> for the turn answers a
   * `{ attribute: "Slash" }` branch exactly as a printed one does. A clause that
   * sets no field matches everything, which is a selector that should have
   * omitted `anyOf`.
   */
  anyOf?: readonly {
    /**
     * The zone this branch reads, for a selector over several zones whose
     * alternatives differ by where the card is: OP13-079 Imu trashes "1 of
     * your {Celestial Dragons} type Characters or 1 card from your hand", so
     * the type belongs to the board half alone and the hand half takes
     * anything. A branch that sets no other field matches every card, so the
     * hand half needs this to stay out of the board.
     */
    zone?: CardZone;
    name?: string;
    type?: string;
    /**
     * The substring form, for a clause whose disjunction reaches a compound
     * type -- OP16-118's "[printed text omitted -- pnpm card:text OP16-118]"Whitebeard Pirates"", where the second half also has to catch
     * {Whitebeard Pirates Allies}.
     *
     * Without it such a clause had to be written as a bare `{ typeIncluding }`
     * that this predicate did not read, and a clause with every field
     * undefined matches *everything*: OP16-118 offered its controller's whole
     * top five rather than the Whitebeard Pirates in it.
     */
    typeIncluding?: string;
    category?: string;
    color?: string;
    attribute?: string;
    /**
     * "…or Characters with a [Trigger]" -- the OP05-002 Belo Betty Leader
     * buffs "your {Revolutionary Army} type Characters or Characters with a
     * [Trigger]", and the second half is a fact about the card's Trigger box
     * rather than its identity. The top-level `hasTrigger` cannot say it: it
     * is conjunctive with everything else, and here it belongs to one branch.
     */
    hasTrigger?: boolean;
    /**
     * A base-power ceiling inside one branch -- EB03-010 Monet reveals
     * "up to 1 Character card with 1000 power or less **or** up to 1 Event
     * card", where the ceiling belongs to the Character half alone.
     *
     * The top-level `maxPower` cannot express it: applied to the whole
     * selector it would also demand a printed power of an Event, which prints
     * none, so the Event half of the disjunction could never match.
     */
    maxPower?: number;
    /**
     * A cost floor inside one branch -- OP12-017 Color of Observation Haki
     * reveals "up to 1 red Event **or** up to 1 Character card with a cost of 3
     * or more", where the floor belongs to the Character half alone.
     *
     * The top-level `minCost` is conjunctive, and the Events this card is
     * printed beside all cost 0, so applied to the whole selector it would shut
     * the Event half of the disjunction out entirely.
     */
    minCost?: number;
  }[];
  /**
   * "…your opponent's [Blocker] Characters" -- ST30-012 Monkey.D.Luffy.
   *
   * A filter on a keyword the card *has*, which no other field could ask:
   * `name`/`type`/`category` read printed identity, and a keyword can be
   * printed, granted by an aura, or handed over for a turn. All three count
   * here, because the printed text names what the Character can do rather than
   * what it says.
   *
   * Deliberately not a call to `hasKeyword`: that lives in `engine.ts`, which
   * imports this module. The static half is `hasStaticKeyword` (printed text
   * and auras, already imported here) and the turn-scoped half is a flag on the
   * `BoardCard`, so the two are read side by side below. [Blocker] additionally
   * honours `blockerDisabledUntilTurn` -- OP16-063 Kuzan switches the ability
   * off without removing the keyword, and a Character that cannot block is not
   * one this clause is written to answer.
   *
   * Only a card on a field can carry a keyword; one in hand, deck or trash
   * matches nothing, which is what the printed text means.
   */
  keyword?: Keyword;
  /**
   * Exclude Characters that an effect has made unrestable this turn.
   *
   * "[printed text omitted -- pnpm card:text <card>]" has to skip a Character under
   * OP16-032 Boa Hancock's `cannot-rest`, which `canBeTargeted` does not know
   * about -- it reads the printed card, not the turn-scoped restrictions. The
   * imperative `rest-character` effect has always filtered on it; this is the
   * declarative half.
   */
  canRest?: boolean;
  /**
   * Drop the card the active attack is already aimed at.
   *
   * For redirect text (OP16-080, OP14-060): naming the current target is legal
   * but buys nothing, and offering it lets a policy pay the cost for a no-op.
   * Outside a battle there is no target and the filter is inert.
   */
  excludeAttackTarget?: boolean;
  /** Printed colour, for text that targets "a purple Event". */
  color?: string;
  /**
   * Attribute, for text that targets "a <Slash> Character".
   *
   * Reads granted attributes as well as printed ones -- OP15-093 The Risky
   * Brothers hands a Character the <Slash> attribute for the turn, and a
   * selector that only compared the printed field would not see it.
   */
  attribute?: string;
  /**
   * "…with a DON!! card given", and "…that has 2 or more DON!! cards given".
   *
   * A floor on the DON!! *given to the card itself*, which is a different
   * question from every other filter here: it is board state on the instance,
   * not a printed fact, so `canBeTargeted` cannot ask it. OP15's Green/East
   * Blue package is built on the pair -- one half pushes the opponent's own
   * DON!! onto their Characters, the other half only removes what carries it --
   * so the filter and the `attach-don` that feeds it have to agree on the same
   * count. A card in a zone with no such concept (hand, deck, trash) carries
   * zero and is filtered out, which is what the printed text means: only a card
   * on the field can have DON!! given to it.
   */
  minGivenDon?: number;
  /**
   * "[printed text omitted -- pnpm card:text <card>]" -- OP15-102 Gan.Fall.
   *
   * A cost ceiling that is a live count rather than a printed constant, which
   * `maxCost` cannot be. Yellow prints several clauses that scale with Life
   * because Life is the resource it spends, so the ceiling moves as the game
   * does. Combines with `maxCost`: both must hold.
   */
  maxCostFromZoneCount?: {
    /**
     * `"either"` sums both sides' zones -- "[printed text omitted -- pnpm card:text <card>]" (OP10-100 Inazuma).
     * `combined-life` answers the same question as a *condition* and cannot be a
     * target filter, which is what this is.
     */
    player: PlayerRef | "either";
    zone: CardZone;
  };
  /**
   * "[printed text omitted -- pnpm card:text OP10-100]" -- OP15-031 Purinpurin.
   *
   * Printed as a check *after* the selection rather than a restriction on it,
   * but nothing else reads the selection, so filtering the candidates instead
   * reaches the same board -- and it stops the engine offering a choice that
   * provably does nothing, which a rules agent would otherwise take.
   */
  /**
   * "[printed text omitted -- pnpm card:text OP15-031]" -- the OP11-022 Shirahoshi Leader's ramp target.
   *
   * `maxCostFromZoneCount` cannot say this: DON!! sits in the cost area, which
   * is not a `CardZone` at all. Counts every DON!! the player controls, the way
   * `fieldDonCount` does -- active, rested, and given to a card -- because that
   * is what "on your field" means everywhere else in the pool.
   */
  maxCostFromFieldDon?: PlayerRef;
  costEqualsGivenDon?: boolean;
  /**
   * Restrict candidates to the Character this program's source remembered
   * earlier in the turn -- "that Character" on OP15-008 Krieg.
   *
   * The only back-reference in the pool between two clauses of one card. Reads
   * `rememberedTarget` off the source's board entry, which `remember-target`
   * writes; a source that is not on a board, or whose note is from an earlier
   * turn, matches nothing.
   */
  remembered?: boolean;
  /** A cost floor, evaluated against effective cost. See `TargetCriteria`. */
  minCost?: number;
  maxCost?: number;
  /**
   * "…with a base cost of 4 or more" (OP14-034), "…with a base cost of 1"
   * (OP14-081).
   *
   * Printed cost, where `minCost`/`maxCost` read the *effective* one. OP14's
   * Black package raises its own Characters' costs by +2, +3 and +4 to climb
   * out of "cost N or less" removal, and OP14-034's own aura pays out on the
   * printed number regardless -- so a set that prints both readings needs both
   * filters, and reading one as the other would let Baroque Works pump itself
   * into or out of its own buff.
   */
  minBaseCost?: number;
  maxBaseCost?: number;
  /**
   * A base-power ceiling: printed power, unless a "base power becomes N"
   * effect or static layer has rewritten it (`cardBasePower`).
   */
  maxPower?: number;
  /**
   * A base-power floor, for OP16's Whitebeard shell: nine cards there gate
   * on "[printed text omitted -- pnpm card:text <card>]", which is exact rather than a
   * ceiling, so it is written as `minPower` and `maxPower` together.
   */
  minPower?: number;
  maxCurrentPower?: number;
  /**
   * A power floor, for "[printed text omitted -- pnpm card:text <card>]" (ST21-003). Mirrors `maxCurrentPower`: evaluated against current
   * power, so a Character's own stat layers, modifiers and attached DON!!
   * count toward the threshold.
   */
  minCurrentPower?: number;
  limit?: number;
  hasTrigger?: boolean;
  /**
   * "…a Character card with 6000 power or less and no base effect" -- EB03-003
   * Uta, EB03-007 Baccarat and EB03-039 Ulti all reach for a vanilla body.
   *
   * Reads `rules.hasPrintedEffect`, so the question is about the card's effect
   * box: a Character whose only printed clause is a `[Trigger]`, which sits in
   * its own field, is a legal target. `hasTrigger` is the nearest existing
   * field and asks the opposite half of the card.
   */
  noBaseEffect?: boolean;
  /**
   * "…up to 1 of your Characters without a [When Attacking] effect" -- the
   * EB03-001 Leader's activation, which hands out [Rush].
   *
   * A filter on a *clause* the card does not print, which `noBaseEffect`
   * cannot express: that asks whether the effect box is empty at all, and this
   * one lets through a Character with any amount of text as long as none of it
   * fires on its own attack. Reads the derived clause list, so the question is
   * asked of the same reading the coverage gate uses.
   */
  lacksClause?: string;
  excludeName?: string;
  /**
   * "…with the same card name as the trashed card" -- EB02-039 GERMA 66, the
   * only clause in the pool whose target is named by another card the same
   * program chose a moment earlier.
   *
   * `name` cannot say it: that field is a printed constant, and the name here is
   * whatever the player picked to pay the cost. `binding` and `excludeBinding`
   * are the other two fields that read a binding, and both ask about card
   * *instances* -- this one asks about identity, so the trashed 4000 body and
   * the 5000-7000 body it fetches are two different cards answering to one name.
   *
   * Matches on any name either card answers to, the same `hasCardName` reading
   * every other name filter uses -- so an alias printed by "also treat this
   * card's name as" counts on both sides.
   */
  sameNameAsBinding?: string;
  /**
   * "…that is a different color than the returned Character" -- EB01-020
   * Chambres, whose two halves are one sentence: the Character it just bounced
   * names the colours the Character it plays may not be.
   *
   * The counterpart of `sameNameAsBinding` above, and inverted for the same
   * reason that one exists: `color` is a printed constant and the colour here
   * is whatever the player chose a moment earlier. A multicolour card is
   * excluded when it shares *any* colour with the bound card, which is what
   * "a different color" means of a card that has two.
   */
  differentColorFromBinding?: string;
  rested?: boolean;
  faceUp?: boolean;
  excludeSource?: boolean;
  /**
   * Restrict candidates to the cards already bound to this name.
   *
   * "[printed text omitted -- pnpm card:text <card>]" --
   * OP16-119 Marshall.D.Teach -- cannot be written without it: after the card
   * that goes to Life is chosen, "the rest" is neither a zone nor a fixed count.
   * A `look-at` binds the cards that were looked at and this selects among them,
   * so a card drawn into the top of the deck in between is never mistaken for
   * one of them.
   */
  binding?: string;
  /**
   * The complement of {@link binding}: a card an *earlier* step of the same
   * program already chose is not eligible for this one.
   *
   * OP08-118 Silvers Rayleigh is the first clause in the pool that hands two
   * different numbers to two different Characters in one sentence -- one takes
   * -3000 and "the other" -2000 -- so the two are written as two `choose`
   * steps, and without this the same body could take both and the clause would
   * read -5000 on one card. `excludeSource` asks the same question about the
   * card running the program, which cannot stand in for it: what is excluded
   * here is a card the *player* picked a moment ago.
   */
  excludeBinding?: string;
  /**
   * How many cards from the named end `position` reaches. Defaults to 1, the
   * single card every earlier clause names.
   *
   * OP08-058 Charlotte Pudding's Leader turns "2 cards from the top of your
   * Life cards" face-up, and which two is not a decision: they are the next two
   * the opponent's attacks turn over. Without this the clause would have to
   * offer the whole Life stack, which is a different and much better card.
   */
  positionCount?: number;
}

/**
 * Which card in a battle a battle-scoped buff is allowed to land on.
 *
 * The same three questions `CounterTarget` answers, asked declaratively so a
 * mechanic program can carry the restriction its printed text prints.
 */
export interface BattleTargetFilter {
  isLeader?: boolean;
  type?: string;
  /**
   * A disjunction of types, for "[printed text omitted -- pnpm card:text <card>]" -- OP11-039 Vagabond Drill. `type` names one and
   * cannot say this, and running the buff twice is not an option: the engine
   * holds a battle's power as one scalar.
   */
  anyOfTypes?: readonly string[];
  name?: string;
  /**
   * A disjunction of whole filters, for a target that is two different cards --
   * "[printed text omitted -- pnpm card:text OP11-039]" (OP12-016, OP12-018,
   * OP12-019), where one branch is "any Character" and the other is one named
   * Leader.
   *
   * The fields above stay conjunctive with each other, so they cannot say this:
   * `isLeader: false` with a `name` would demand a Character *called* Silvers
   * Rayleigh.
   */
  anyOf?: readonly BattleTargetFilter[];
}

/** The card on one side of a battle that carries that side's power. */
export interface BattleParticipant {
  instanceId: string;
  cardNumber: string;
  isLeader: boolean;
}

/**
 * The card whose power `playerId` contributes to the open battle.
 *
 * The attacker for the attacking player, the card being attacked for the
 * defending one. `null` when there is no battle, or when the card has left the
 * field -- a replacement effect during the block step can remove the very
 * Character an attack points at.
 */
export function battleParticipant(
  state: GameState,
  playerId: PlayerId,
): BattleParticipant | null {
  const attack = state.activeAttack;
  if (!attack) return null;
  const instanceId =
    playerId === attack.attackerPlayerId
      ? attack.attackerInstanceId
      : playerId === attack.defenderPlayerId
        ? attack.targetInstanceId
        : null;
  if (instanceId === null) return null;
  if (instanceId === `${playerId}-leader`) {
    return {
      instanceId,
      cardNumber: state.players[playerId].leaderCardNumber,
      isLeader: true,
    };
  }
  const card = state.players[playerId].board.find(
    (candidate) => candidate.instanceId === instanceId,
  );
  if (!card) return null;
  return { instanceId, cardNumber: card.cardNumber, isLeader: false };
}

/** Whether a battle-scoped buff restricted by `filter` reaches `participant`. */
export function battleTargetMatches(
  filter: BattleTargetFilter | undefined,
  participant: BattleParticipant,
): boolean {
  if (!filter) return true;
  if (
    filter.isLeader !== undefined &&
    filter.isLeader !== participant.isLeader
  ) {
    return false;
  }
  if (
    filter.type !== undefined &&
    !hasCardType(participant.cardNumber, filter.type)
  ) {
    return false;
  }
  if (
    filter.anyOfTypes !== undefined &&
    !filter.anyOfTypes.some((type) => hasCardType(participant.cardNumber, type))
  ) {
    return false;
  }
  if (
    filter.name !== undefined &&
    !hasCardName(participant.cardNumber, filter.name)
  ) {
    return false;
  }
  if (
    filter.anyOf !== undefined &&
    !filter.anyOf.some((branch) => battleTargetMatches(branch, participant))
  ) {
    return false;
  }
  return true;
}

export type MechanicCondition =
  /**
   * "If there is a Character with a cost of 0 **or** with a cost of 8 or more"
   * -- OP14's Black package prints this disjunction on four cards.
   *
   * Every other condition is a single question, and the DSL's only combinator
   * is `if`/`else`, which cannot express a disjunction without writing the
   * consequent twice. `selector.anyOf` is the nearest thing and answers a
   * different question: it is a disjunction *within* one selector's identity
   * filters, not between two independent conditions.
   */
  | { kind: "any-of"; conditions: readonly MechanicCondition[] }
  /**
   * The conjunction, for text that gates on two independent facts at once:
   * OP09-093 Marshall.D.Teach needs both a {Blackbeard Pirates} Leader *and* to
   * have been played this turn.
   *
   * Nesting two `if`s says the same thing to the interpreter but not to
   * `bareGateCondition`, which reads only the program's outermost condition to
   * decide whether an `[Activate: Main]` is worth offering. Written as one
   * condition, a `[Once Per Turn]` activation is not offered -- and so cannot be
   * spent -- on a turn where half the gate is false.
   */
  | { kind: "all-of"; conditions: readonly MechanicCondition[] }
  | {
      kind: "zone-count";
      player: PlayerRef;
      zone: CardZone;
      operator: "eq" | "lte" | "gte";
      value: number;
    }
  | { kind: "leader-has-type"; player: PlayerRef; type: string }
  /**
   * "If your Leader's type includes \"Baroque Works\"" -- the substring form
   * of `leader-has-type`, and the Leader-side counterpart of
   * `CardSelector.typeIncluding`. OP14-084, OP14-087 and OP14-088 gate on it.
   */
  | { kind: "leader-type-including"; player: PlayerRef; text: string }
  /**
   * "[printed text omitted -- pnpm card:text OP14-088]" -- the gate the whole OP14 Red
   * package hangs its `[When Attacking]` clauses on.
   *
   * Current power, including DON!! given to the source, which is the point:
   * the clause is what a 2000-power body gets for carrying three DON!!.
   * `selector-count` cannot ask it -- it filters a zone and cannot be pinned to
   * one instance -- and `source-attached-don` asks the narrower question, so a
   * source pumped by an Event or by its own Leader would answer no.
   */
  | { kind: "source-current-power"; operator: "lte" | "gte"; value: number }
  /** "If your Leader is [Nami]" -- matches on printed name, not card number. */
  | { kind: "leader-has-name"; player: PlayerRef; name: string }
  /**
   * "[printed text omitted -- pnpm card:text <card>]" -- OP12-034 Perona.
   *
   * `selector-count` cannot ask it: a Leader is in no zone, which is the same
   * reason `leader-power` exists. Read through `cardAttributes` rather than off
   * the printed field, because a Leader can print two attribute icons in one
   * slash-joined string ("Slash/Strike") and a comparison against the whole
   * field would answer no for both halves.
   */
  | { kind: "leader-has-attribute"; player: PlayerRef; attribute: string }
  /**
   * "[printed text omitted -- pnpm card:text <card>]" -- OP11-080 Gear Two.
   *
   * `leader-multicolored` asks whether there is more than one colour, which is a
   * different question: a mono-blue Leader satisfies this and fails that. Read
   * off `colors`, so a two-colour Leader satisfies it for either of its halves.
   */
  | { kind: "leader-has-color"; player: PlayerRef; color: string }
  /**
   * "[printed text omitted -- pnpm card:text OP11-080]" -- OP06-038 The Billion-fold World
   * Trichiliocosm.
   *
   * Counts every rested card the player has on the field, which is the four
   * areas Bandai's own Refresh Phase rule enumerates: "Set all rested cards
   * placed in your Leader area, Character area, Stage area, and cost area as
   * active" (comprehensive rules 6-2-4). So a rested DON!! in the cost area is a
   * rested card, and this is the only condition here that counts one --
   * `CardZone` has no DON!! zone, so `selector-count` can reach the first three
   * areas and never the fourth.
   *
   * That matters for the card that prints it: OP06-038 is a Counter in a deck
   * whose Leader rests its own field to refund DON!!, and eight rested cards is
   * a threshold only a deck doing that reaches.
   */
  | {
      kind: "rested-cards";
      player: PlayerRef;
      operator: "lte" | "gte";
      value: number;
    }
  /**
   * "[printed text omitted -- pnpm card:text <card>]"
   *
   * Three cards in this deck gate on it, and it is a printed fact about the
   * Leader rather than anything about the board, so it reads straight off
   * `colors`.
   */
  | { kind: "leader-multicolored"; player: PlayerRef }
  /** "You and your opponent have a total of N or less Life cards." */
  | { kind: "combined-life"; operator: "lte" | "gte"; value: number }
  /**
   * "[printed text omitted -- pnpm card:text <card>]" -- OP15-104 Conis.
   *
   * `combined-life` sums the two and `zone-count` reads one against a constant;
   * neither can compare the two sides, which is what Yellow's behind-only
   * payoffs are gated on. The mirror of `field-don-versus`, for Life.
   */
  | {
      kind: "life-versus";
      player: PlayerRef;
      /**
       * `"lte"`/`"gte"` are the "equal to or less than" readings OP10's Yellow
       * package prints -- "[printed text omitted -- pnpm card:text <card>]" (OP10-114 X.Drake).
       * Strict `lt` refuses the tie, which is the most common board state the
       * clause is played on and half of what it is written for.
       */
      operator: "lt" | "gt" | "lte" | "gte";
    }
  /**
   * "[printed text omitted -- pnpm card:text OP10-114]" -- EB04-059 Black Rope
   * Dragon Twister.
   *
   * The board counterpart of `life-versus`, and needed for the same reason:
   * `selector-count` reads one side against a constant and cannot compare the
   * two. Counts Characters only, which is what the text says -- a Stage is not
   * a Character -- and counts them as bodies rather than by cost, so a board of
   * three 1-drops is behind a board of four.
   */
  /**
   * "If the number of cards in your hand is at least N less than the number in
   * your opponent's hand" -- OP09-092 Marshall.D.Teach.
   *
   * The hand counterpart of `character-count-versus`, and needed for the same
   * reason: `zone-count` reads one hand against a constant and cannot compare
   * the two, and the margin is the whole clause -- a Black deck that has
   * emptied its hand on purpose is exactly the board this pays out on.
   */
  | {
      kind: "hand-count-versus";
      player: PlayerRef;
      operator: "lt" | "gt";
      /** How far behind (or ahead) the count has to be. Defaults to 1. */
      by?: number;
    }
  | {
      kind: "character-count-versus";
      player: PlayerRef;
      operator: "lt" | "gt";
      /**
       * How far behind (or ahead) the count has to be -- "[printed text omitted -- pnpm card:text <card>]" (OP10-098 Liberation).
       *
       * Defaults to 1, which is the bare "[printed text omitted -- pnpm card:text OP10-098]"
       * every earlier caller prints. A margin cannot be written as a second
       * condition: nothing else can read one side's count against the other's
       * at all, which is why this condition exists.
       */
      by?: number;
    }
  /** "If you have any DON!! cards given" -- DON!! attached to a Leader or Character. */
  | {
      kind: "given-don";
      player: PlayerRef;
      operator: "lte" | "gte";
      value: number;
    }
  /**
   * "If you have N or less DON!! cards on your field."
   *
   * Counts every DON!! the player controls -- active, rested, and given to the
   * Leader or a Character -- which is what `fieldDonCount` already means. Five
   * cards in the Enel deck gate on being *under* a ceiling, because that Leader
   * runs a six-card DON!! deck and spends it down further.
   */
  | {
      kind: "field-don";
      player: PlayerRef;
      operator: "lte" | "gte";
      value: number;
    }
  /**
   * "[printed text omitted -- pnpm card:text <card>]"
   *
   * The catch-up clause the whole Rosinante ramp package is gated on --
   * OP12-073 and EB04-038 both print it -- and `field-don` cannot express it,
   * because the threshold is the other player's count rather than a constant.
   */
  | {
      kind: "field-don-versus";
      player: PlayerRef;
      /**
       * `"lte"`/`"gte"` are the "equal to or fewer" readings OP12's Purple
       * package prints. `"lt"`/`"gt"` are the strict ones: OP09-066 Jean Bart
       * pays out only while the opponent has *more* DON!! than its controller,
       * and the tie is the board state a Purple deck sits on for most of the
       * game -- reading it as `"lte"` would fire the clause on every even turn
       * the card was printed to sit out.
       */
      operator: "lte" | "gte" | "lt" | "gt";
    }
  /**
   * "[Opponent's Turn]" and "[Your Turn]" as a gate on a clause.
   *
   * EB03-055 Nico Robin's `[On K.O.]` only exists on the opponent's turn, and an
   * `[On K.O.]` has no other way to ask: unlike the reaction rules, it is
   * dispatched from wherever the Character died. Reads the turn player the same
   * way those rules do -- an open battle means the attacker's turn, because
   * `activePlayer` is handed to the defender for the Block and Counter steps.
   */
  | { kind: "turn-player"; player: PlayerRef }
  /**
   * "[printed text omitted -- pnpm card:text EB03-055]" -- a condition on what
   * is on the field, rather than on how much of a zone there is.
   *
   * `zone-count` counts a whole zone and cannot filter it, so every clause that
   * asks whether a *particular kind* of card is present had no way to be
   * written. OP17's Elbaph package is built entirely on this question -- seven
   * Characters and two Events gate on a cost-12-or-more body being out, which is
   * what the set's `+12 cost` giants exist to provide -- and the Kurozumi pair
   * asks the same thing at cost 10.
   *
   * `player: "either"` is the default reading of Bandai's "if there is a
   * Character": the text does not say "you have", and an opposing giant switches
   * these clauses on exactly as your own does. The narrower `self`/`opponent`
   * forms are there for text that does name a side.
   */
  | {
      kind: "selector-count";
      player: PlayerRef | "either";
      selector: Omit<CardSelector, "player">;
      operator: "eq" | "lte" | "gte";
      value: number;
      /**
       * Count card *names* rather than bodies -- "5 or more {Impel Down} type
       * Characters with different card names" (OP16-038).
       *
       * The selector filters cards and has no way to say this: four copies of
       * one Character answer a plain count of five and not this one. The same
       * identity `choose`'s own `distinctNames` reads, so a card answering to
       * two names still counts once.
       */
      distinctNames?: boolean;
    }
  /**
   * "You may rest N of your DON!! cards" -- the gate on a cost that needs
   * *active* DON!!.
   *
   * `field-don` counts rested and given DON!! as well, so it says yes to a
   * player whose DON!! are all spent; `rest-don` would then rest nothing and the
   * effect it is paying for would resolve for free.
   */
  | {
      kind: "active-don";
      player: PlayerRef;
      operator: "lte" | "gte";
      value: number;
    }
  /**
   * The mirror: DON!! sitting *rested* in the cost area.
   *
   * OP07-023 Caribou pays out at "6 or more rested DON!! cards", and OP07-026
   * Jewelry Bonney's clause can only hold one back from a Refresh Phase if
   * there is a rested one to hold. Neither `active-don` nor `field-don` can
   * ask it -- the first counts the opposite pile and the second counts every
   * DON!! the player controls, given ones included -- so a branch gated on
   * either of those would offer a payout that resolves to nothing.
   */
  | {
      kind: "rested-don";
      player: PlayerRef;
      operator: "lte" | "gte";
      value: number;
    }
  /**
   * "[printed text omitted -- pnpm card:text <card>]" -- OP17-034 Rockstar.
   *
   * A Leader is in no zone, so `selector-count` cannot ask this: its
   * `minCurrentPower` runs through `canBeTargeted`, which reads printed power for
   * the Leader pseudo-card and would miss both the DON!! given to it and any
   * modifier on it. This reads {@link currentPower}, counting attached DON!! only
   * while it is granting power.
   */
  | {
      kind: "leader-power";
      player: PlayerRef;
      operator: "lte" | "gte";
      value: number;
    }
  /**
   * "[printed text omitted -- pnpm card:text <card>]" -- OP17-063 Kaido's
   * `[Activate: Main]` gate.
   *
   * A source-scoped question no existing condition can ask: `selector-count`
   * filters a zone by printed facts, never by which turn a specific instance
   * landed on the board, and every `[DON!! xN]` gate in `static-abilities.ts`
   * is on a keyword or power layer, never on whether an arbitrary program
   * fires at all. Reads `playedTurn` off the program's own source instance,
   * which is meaningless for anything not currently on a board -- an Event or
   * a card still in hand never carries it -- so this is `false` there rather
   * than an error.
   */
  | { kind: "source-played-this-turn" }
  /**
   * "If this Leader battles your opponent's Character during this turn" --
   * OP12-020 Roronoa Zoro's `[Activate: Main]` gate.
   *
   * Not a question the board can answer after the fact: the battle is over by
   * the time the Main phase comes back round, and both cards may still be
   * standing. `resolveBattle` records the fact instead, once per turn per
   * player, and this reads it back.
   */
  | { kind: "leader-battled-character"; player: PlayerRef }
  /**
   * "[DON!! xN]" as a gate on whether an arbitrary program fires at all --
   * OP17-011 Blamenco's `[When Attacking]`.
   *
   * Every existing `[DON!! xN]` gate in `static-abilities.ts` is on a
   * keyword or power layer read for the card itself; nothing before this
   * asked whether a program's own source carries N attached DON!! before
   * running it. `given-don` is the nearest existing condition and does not
   * fit: it sums DON!! given anywhere on the player's board, not on this
   * one instance.
   */
  | { kind: "source-attached-don"; operator: "lte" | "gte"; value: number }
  /**
   * "[printed text omitted -- pnpm card:text <card>]" -- OP16-084
   * Kouzuki Momonosuke, whose cost only reaches 20 because OP16-087 Shinobu
   * hands it +20 for the turn.
   *
   * A question about the source's *effective* cost, which no selector can ask:
   * `selector-count` filters a zone and cannot be pinned to one instance.
   */
  | { kind: "source-cost"; operator: "lte" | "gte"; value: number }
  /**
   * "[printed text omitted -- pnpm card:text OP16-087]" -- OP16-100
   * Hallowed Glacier Slash.
   *
   * A fact about what has already happened this turn, which no zone count can
   * reconstruct: the Character is in the trash, and so is everything trashed
   * for any other reason. `knockOut` and battle destruction both stamp it.
   */
  | { kind: "character-koed-this-turn"; player: PlayerRef }
  /**
   * "[printed text omitted -- pnpm card:text <card>]" -- the second half of the Big Mom
   * guess, asked once per candidate cost.
   *
   * Printed cost of the card on top of `player`'s deck. Written as a condition
   * rather than as a node of its own so the whole clause stays a `choice` of
   * eleven branches, one per cost, which is exactly what the printed "choose a
   * cost" is -- see `guessDeckTopCost` in `mechanics/shared.ts`. An empty deck
   * matches nothing.
   */
  | {
      kind: "deck-top-cost";
      player: PlayerRef;
      value: number;
      /**
       * How `value` is compared, for text that names a band rather than a
       * number -- EB01-029's "if the revealed card has a cost of 4 or more".
       *
       * Defaults to `"eq"`, which is the guessing package's reading and what
       * every earlier entry means: that clause asks whether the top card is
       * *exactly* the cost the player named, and a band would make the guess
       * unlosable.
       */
      operator?: "eq" | "lte" | "gte";
    }
  /**
   * "[printed text omitted -- pnpm card:text <card>]"GERMA"" -- OP11-043
   * Vinsmoke Ichiji.
   *
   * A universal rather than an existential, which `selector-count` cannot
   * express at any threshold: it counts the cards that *do* match and cannot ask
   * whether any card does not. Vacuously true on an empty board, the way "only"
   * reads in the rules text -- the clause's payoff is a buff on a card in a
   * battle, so an empty board cannot benefit from it anyway.
   */
  | {
      kind: "every-character-matches";
      player: PlayerRef;
      selector: Omit<CardSelector, "player">;
    }
  /**
   * A question about the card attacking in the open battle -- "[printed text omitted -- pnpm card:text <card>]"
   * (OP11-088 Shu).
   *
   * The same three questions `BattleTargetFilter` asks, aimed at the *attacker*
   * rather than at the card a buff would land on: nothing else in the DSL can
   * reach it, because the attacker is not in any zone a selector names -- it is
   * a field on the battle. False when there is no battle.
   */
  | { kind: "battle-attacker"; filter: BattleTargetFilter; attribute?: string }
  /**
   * The mirror, about the card being attacked -- "[printed text omitted -- pnpm card:text <card>]" (OP12-081 Koala's Leader).
   *
   * A `[When Attacking]` program already knows *it* is the attacker; what it
   * cannot otherwise ask is what the attack is pointed at, which is a field on
   * the battle rather than a card in any zone. False when there is no battle.
   */
  | { kind: "battle-target"; filter: BattleTargetFilter }
  /**
   * "[printed text omitted -- pnpm card:text OP12-081]" -- the OP10-022
   * Trafalgar Law Leader's gate.
   *
   * A sum rather than a count, which `selector-count` cannot express: a board of
   * one 5-drop clears this and a board of four 1-drops does not, and the clause
   * is written to ask whether there is something worth bouncing. Effective cost,
   * so a cost buff or debuff moves the total the way it moves every other "cost"
   * reading in the format.
   */
  | {
      kind: "selector-cost-total";
      player: PlayerRef | "either";
      selector: Omit<CardSelector, "player">;
      operator: "lte" | "gte";
      value: number;
    }
  /**
   * "If you have activated an Event with a base cost of N or more during this
   * turn" -- OP15-002 Lucy's Leader.
   *
   * Printed cost, not effective: the clause says "base cost", so a discount
   * does not lower it and OP15-021's own −3 does not disqualify it.
   */
  | {
      kind: "event-activated-this-turn";
      player: PlayerRef;
      minBaseCost: number;
    };

export type MechanicEffect =
  | { kind: "sequence"; effects: MechanicEffect[] }
  | {
      kind: "if";
      condition: MechanicCondition;
      then: MechanicEffect;
      else?: MechanicEffect;
    }
  | {
      kind: "optional";
      effect: MechanicEffect;
      /**
       * Who decides, when it is not the program's source player -- "[printed text omitted -- pnpm card:text <card>]" (OP12-075 Ms. All Sunday), where the *opponent* is offered
       * something and may decline it.
       *
       * `choose` and `choice` have carried this since ST10-010 and OP17-049;
       * this is the third node that can hand a decision across the table, and
       * the first where what is handed over is a plain yes/no.
       */
      chooser?: PlayerRef;
    }
  /**
   * "… and play it **or** add it to the top of your Life cards face-up."
   *
   * `optional` covers "you may X"; this covers text that offers two or more
   * different things to do, which `optional` cannot express -- chaining two
   * `optional`s would let a player take both branches. OP14-104 Gecko Moria went
   * unimplemented for want of it.
   *
   * Every branch is offered whenever the node is reached, so a branch whose
   * inner selection turns out to be empty resolves to nothing rather than
   * leaving a choice with no options.
   */
  | {
      kind: "choice";
      /**
       * Who picks the branch, when it is not the program's source player.
       *
       * "Your opponent chooses one: …" (OP17-049 Charlotte Linlin, OP17-099
       * Charlotte Linlin) is `choice`'s counterpart to `choose`'s `chooser`:
       * the branches are fixed effects rather than cards, but the printed text
       * still hands the decision to the other player. Defaults to `"self"`,
       * the shape every earlier `choice` node printed.
       */
      chooser?: PlayerRef;
      branches: readonly {
        id: string;
        label: string;
        effect?: MechanicEffect;
      }[];
    }
  | {
      kind: "select";
      /** `"all"` for "all of your X", which has no fixed count. */
      selector: CardSelector;
      bind: string;
      count: number | "all";
      effect: MechanicEffect;
    }
  /**
   * "Look at N cards from the top of your deck."
   *
   * Binds those cards, in deck order, and leaves them where they are: a look is
   * not a move, and lifting them out of the deck the way the imperative
   * `search-top-five` pending effect does is what forces that effect to carry a
   * `revealed` list and an invariant exemption. Later steps reach them through
   * `selector.binding`.
   *
   * Each looked-at card gets a `card-revealed` step marked private to the player
   * doing the looking, so the log records that the deck was seen without telling
   * the opponent what is in it.
   */
  | {
      kind: "look-at";
      player: PlayerRef;
      /**
       * How deep to look. `"all"` is for "look at all your Life cards" --
       * ST13-004, ST13-012, ST13-016 and ST13-017 -- where the pile is 0 to 5
       * cards and no printed number can stand in for it.
       */
      count: number | "all";
      bind: string;
      /**
       * Which pile is looked at. Defaults to `"deck"`, the top-of-deck look
       * every search in the pool prints.
       *
       * `"life"` is OP10-116 Damned Punk's "[printed text omitted -- pnpm card:text OP10-116]": a Life card is face-down to both
       * players, so looking at one is the same private reveal a deck look is,
       * and the card stays where it is until a later step moves it.
       */
      zone?: CardZone;
    }
  | {
      kind: "choose";
      selector: CardSelector;
      bind: string;
      min: number;
      max: number;
      /**
       * Who answers, when it is not the program's source player.
       *
       * "Trash 2 cards from your opponent's hand" (ST10-010) is the first clause
       * in the pool where the cards leave one player's zone and the *other*
       * player picks them, which is the rule for anything trashed out of a hand.
       * Every other `choose` is answered by whoever played the card, which is
       * why this defaults to `"self"`.
       */
      chooser?: PlayerRef;
      /**
       * A running cost cap across every card picked, for "[printed text omitted -- pnpm card:text ST10-010]"
       * (OP17-118) and "[printed text omitted -- pnpm card:text OP17-118]" (OP17-119). Each candidate is offered only while adding it
       * would keep the sum at or under this ceiling, so a player can never
       * paint themselves into an illegal combination -- the same guarantee
       * `min`/`max` give the count.
       */
      maxTotalCost?: number;
      /**
       * The same running cap over *power* rather than cost -- OP09-018 K.O.s
       * "up to 2" Characters with a total power at or under a ceiling.
       *
       * A second field rather than a mode on `maxTotalCost`, because a clause
       * can print both readings and the two numbers are not interchangeable:
       * cost decides what removal reaches, power is what the removal is priced
       * against. Read as current power, so a debuff this turn brings a body
       * inside the budget exactly as it brings it inside `maxCurrentPower`.
       */
      maxTotalPower?: number;
      /**
       * "…with different card names" (OP17-118): once a name has been picked,
       * every other card answering to it is excluded from the rest of this
       * choice, the same identity `hasCardName` already reads for every other
       * name-matching clause.
       */
      distinctNames?: boolean;
      /**
       * A clause with a printed count and no "up to": "[printed text omitted -- pnpm card:text OP12-046]" (OP12-046). Rule
       * 8-4-4-1 makes the player choose as many as they can, up to the
       * number, so they may not stop while another candidate still fits --
       * "choose no more cards" is never offered, and a pick with only one
       * candidate left is taken for them rather than asked. `min`/`max`
       * cannot say this: `min: 2` against a hand of one would skip the clause
       * whole instead of trashing the one.
       *
       * Not for a budget with no printed count (OP17-119 Loki's "total cost
       * of 4 or less"): Bandai's Q&A reads that as "any number", which
       * includes 0, so stopping stays on offer.
       */
      exhaustive?: boolean;
      effect: MechanicEffect;
    }
  | {
      kind: "move";
      binding: string;
      /**
       * Where the card lands. `player: "owner"` sends it to whoever controls
       * it rather than to a fixed side of the table -- "return ... to the
       * owner's hand", "place ... at the bottom of the owner's deck" -- which
       * is the only reading that works for a binding filled by an
       * `"either"` selector, where the two halves have different owners.
       *
       * Text that names one side keeps naming it: "add it to *your* hand" is
       * `"self"` even when the card came off the opponent's Life, because
       * "owner" would send it back where it came from.
       */
      to: MoveDestination;
      faceUp?: boolean;
      rested?: boolean;
      /**
       * Internal: skip the "removed from the field" replacement offer.
       *
       * Set only on the node the replacement prompt itself queues for the
       * "remove it anyway" branch, so answering the prompt does not raise the
       * same prompt again. The `knock-out` node carries the same flag for the
       * same reason.
       */
      skipReplacements?: true;
    }
  | {
      kind: "play";
      binding: string;
      rested?: boolean;
      /**
       * Whose board the card lands on, when it is not the source player's --
       * "[printed text omitted -- pnpm card:text <card>]" (OP13-119 Portgas.D.Ace, the compensation for its own
       * bounce).
       *
       * Defaults to `"self"`, which every earlier `play` node means. The choice
       * of *which* card is theirs too, so pair it with `choose`'s `chooser`.
       */
      player?: PlayerRef;
    }
  | {
      kind: "draw";
      player: PlayerRef;
      count: number;
      /**
       * "Draw cards equal to the number you returned to your deck" -- P-002
       * and P-046, the two promos that turn a whole hand over.
       *
       * The count is the size of a binding an earlier step filled, which
       * `count` alone cannot say: a hand of three and a hand of seven have to
       * draw three and seven. `each` is how many cards per bound card, which
       * for both printings is one; `count` stays as the flat part, which is
       * zero for both.
       */
      perCards?: { binding: string; each: number };
    }
  /**
   * "Trash N cards from the top of your deck" -- Black's self-mill.
   *
   * Not a `select` over the deck: `position` names one card, and the printed
   * clause takes a fixed count off the top with nobody choosing which. Nine
   * cards across OP15 and OP16 print it, and the archetype's payoffs read the
   * trash count back (OP15-083 at 15, OP15-087 at 10), so the cards have to
   * land in the trash in deck order rather than as a set.
   *
   * A deck with fewer than N cards trashes what it has. That is not a loss:
   * decking out is checked when a draw fails, and OP15-022 Brook's Leader
   * rewrites even that rule.
   */
  | { kind: "trash-top"; player: PlayerRef; count: number }
  /**
   * "Trash cards from your hand until you have N cards in your hand" --
   * OP14-054 Fisher Tiger, the price of its own "[On Play] draw 3".
   *
   * A `choose` cannot say this: its `min`/`max` are written into the program
   * and the count here is whatever the hand happens to hold over the ceiling
   * when the clause resolves. So the node reads the hand and synthesizes the
   * mandatory `choose` for exactly the excess -- the player still picks which
   * cards go, which is what "trash cards from your hand" means.
   */
  | { kind: "trash-hand-down-to"; player: PlayerRef; size: number }
  /**
   * "Trash cards from the top of your Life cards until you have N Life cards"
   * -- the price EB01-059 Kingdom Come and EB01-060 Did Someone Say...Kami?
   * both pay for their half of the card.
   *
   * The Life counterpart of `trash-hand-down-to` above, and simpler in the one
   * way that matters: *which* cards go is not a decision. The text says "from
   * the top", so the node takes them in order and the player chooses nothing --
   * where the hand version has to synthesize a `choose` because a hand has no
   * order a rule could name.
   *
   * Trashed, not taken into hand: a Life card lost this way never pays the
   * [Trigger] it is printed with, which is the whole reason these two cards can
   * afford what they do.
   */
  | { kind: "trash-life-down-to"; player: PlayerRef; size: number }
  /**
   * Bind the card that carries `player`'s side of the open battle, so an
   * effect that is not itself battle-scoped can name it -- "[printed text omitted -- pnpm card:text <card>]" (OP14-078 Bullet String), where
   * "that card" is the one the Counter just buffed.
   *
   * `battle-power` is the only other node that reaches into a battle, and it
   * writes a scalar rather than naming a card, so nothing before this could
   * hand the battle's participant to `modify-power`. Outside a battle, or when
   * the participant has left the field, the binding is empty and the inner
   * effect resolves to nothing.
   */
  | {
      kind: "bind-battle-target";
      player: PlayerRef;
      bind: string;
      effect: MechanicEffect;
    }
  /**
   * "[printed text omitted -- pnpm card:text <card>]" -- OP16's
   * Whitebeard shell pays for nine of its clauses this way.
   *
   * A cost that spends nothing: the card stays in hand and only its identity
   * becomes public. That is why it is not a `move` -- showing a card and
   * discarding it are different prices, and the whole archetype is built on
   * being able to show the same 8000-power Character every turn. What it does
   * emit is a *public* `card-revealed`, unlike `look-at`, whose steps are
   * private to the player looking.
   */
  | { kind: "reveal"; binding: string }
  /**
   * "[printed text omitted -- pnpm card:text <card>]" -- the first half of
   * OP11's Big Mom guessing package (OP11-073 Charlotte Linlin, OP11-074
   * Streusen).
   *
   * A genuine public reveal of a card in a place nobody can select from: the top
   * of a deck is not a `CardSelector` target, so this is its own node rather
   * than a `reveal` over a binding. Both players learn the card, which is what
   * makes the guess a fair bet.
   *
   * Pair it with the `deck-top-cost` condition, which reads the result.
   */
  | { kind: "reveal-deck-top"; player: PlayerRef }
  /**
   * "Then, shuffle your deck." -- OP08-071 Count Niwatori and OP08-073 Viscount
   * Hiyoko, the first clauses in the pool that search a whole deck rather than
   * a fixed number of cards off the top.
   *
   * Not cosmetic: a search shows its owner every card left, and without the
   * shuffle it would also leave them knowing the order. The randomness comes
   * from the serialized engine RNG, so a shuffled deck still replays from the
   * seed, and any recorded deck-top knowledge is dropped with it -- what was on
   * top is no longer on top.
   */
  | { kind: "shuffle-deck"; player: PlayerRef }
  /**
   * One card taken out of a hand its taker cannot see: "choose 1 card from your
   * opponent's hand" read face-down (OP17-075 X.Drake), or "at random"
   * (OP17-099 Charlotte Linlin).
   *
   * `choose` cannot say this. Its options name the cards, so a `choose` over
   * the opponent's hand answered by the source player would show that player
   * the whole hand -- which is why every earlier hand discard hands the pick to
   * the hand's owner through `chooser`. Here the source player keeps the
   * decision and learns nothing from it:
   *
   * - `"blind"` offers one option per card by *position* only, over an order
   *   drawn from the engine RNG. The draw is what keeps a position meaningless:
   *   a hand grows in the order cards reach it, so a raw hand index would let a
   *   player who watched a revealed card join it pick that card out again,
   *   which a face-down pick from a held hand does not allow.
   * - `"random"` asks nothing and takes one card off the same RNG.
   *
   * Either way the RNG is the serialized one, so the pick replays from the
   * seed. A hand of one card is taken without asking: every position names it.
   */
  | {
      kind: "pick-from-hand";
      player: PlayerRef;
      pick: "blind" | "random";
      bind: string;
      effect: MechanicEffect;
    }
  | {
      kind: "modify-power";
      binding: string;
      amount: number;
      expiresAfterTurns: number;
      /**
       * A binding whose card's *given DON!!* multiplies `amount`, for "−1000
       * power ... for every DON!! card given to that Character" (OP15-008).
       *
       * The multiplier is another card's board state rather than the size of a
       * binding, which is what separates this from `battle-power`'s `perCard`.
       */
      perGivenDonOf?: string;
      /**
       * "…gains +1000 power during this turn for every 3 cards placed at the
       * bottom of your deck" -- OP07-091 Monkey.D.Luffy.
       *
       * `battle-power`'s `perCard` is the same idea one card at a time, and
       * cannot say this twice over: the buff here lasts the turn rather than
       * the battle, and the printed rate is per *three* cards, so a binding of
       * eight pays four thousand and not eight. Whole steps only -- the printed
       * clause counts completed threes.
       */
      perCards?: { binding: string; each: number };
      /**
       * A binding whose card's *printed cost* multiplies `amount` -- OP15-119
       * Monkey.D.Luffy gains +1000 "per 1 cost on the revealed card", a Life
       * card it reveals.
       *
       * Read wherever the card sits, since a reveal moves nothing. An empty
       * binding, or a card with no printed cost, multiplies by zero.
       */
      perCostOf?: string;
    }
  /**
   * "Up to 1 of your Leader or Characters gains +N power **during this
   * battle**."
   *
   * Not `modify-power`, whose shortest life is the rest of the turn. A battle is
   * shorter than a turn, and writing a battle-scoped buff as a turn-scoped
   * modifier leaves the card defending every *later* attack that turn at the
   * raised number -- the bug OP11-062 Katakuri's imperative path documents.
   *
   * The engine holds a battle's power as two scalars on `activeAttack`, each
   * added to its side's live board power, so this lands on whichever of them
   * belongs to `player`: the attacker's battle bonus, or the defender's counter
   * power. That is also why the buff is not
   * given a target to choose. Both ends of a battle have exactly one card that
   * carries power -- the attacker, and the card being attacked -- so for the
   * printed "[printed text omitted -- pnpm card:text OP11-062]" the only choice that is worth
   * anything is the one the engine makes here. `target` is the filter for text
   * that names a narrower card than the battle may have put there ("up to 1 of
   * your Leaders", "…with a type including Rocks Pirates"); when it does not
   * match, the "up to" resolves to nothing, which is the same reading
   * `CounterEventProgram.appliesWhen` gives the Counter Events.
   */
  | {
      kind: "battle-power";
      player: PlayerRef;
      amount: number;
      target?: BattleTargetFilter;
      /**
       * A binding whose size multiplies `amount`, for "[printed text omitted -- pnpm card:text <card>]" (OP15-002 Lucy).
       *
       * The printed clause pays per card, and a `choose` binds every card
       * picked at once -- so the multiplier has to be read off the binding
       * rather than the effect running once per card.
       */
      perCard?: string;
    }
  /**
   * A temporary cost change, as OP15-074 Varie gives a Character +2 cost.
   *
   * Separate from `modify-power` because cost and power are different
   * questions: cost decides what "cost N or less" removal can reach, so
   * raising it is protection rather than a stat buff.
   */
  | {
      kind: "modify-cost";
      binding: string;
      amount: number;
      expiresAfterTurns: number;
    }
  | {
      kind: "attach-don";
      player: PlayerRef;
      /**
       * Which pile the DON!! comes out of.
       *
       * `"given"` is DON!! already given to one of the player's own cards, moved
       * onto another of them -- "give up to N total of your currently given
       * DON!! cards to 1 of your Characters" (the OP07-001 Monkey.D.Dragon
       * Leader). Nothing before it moved DON!! between two piles that are both
       * on the field: `return-given-don` takes given DON!! back to the cost area
       * rested, which spends the power for the turn, and this one keeps it.
       *
       * The target's own pile is never a source -- taking two DON!! off a
       * Character to hand them straight back is a no-op, and offering it as one
       * is a decision with nothing behind it. Characters are drained before the
       * Leader, the same order `return-given-don` takes for the same reason.
       *
       * `"cost-area"` is the printed "give up to N DON!! cards **from your
       * opponent's cost area**" -- OP15-025, OP15-028 and OP15-023. The cost
       * area holds both piles, and OP-15 makes the distinction itself: five
       * cards in the same set say "rested DON!! cards" and these three do not,
       * so reading the wider wording as `"active"` drops the rested half of the
       * area. It matters on the turn it is played: the opponent's DON!! is
       * rested precisely because they spent it, so an active-only source found
       * nothing and gave 0. Active is drained first, because a DON!! taken out
       * of the active pile is also a DON!! that cannot pay for a [Counter]
       * Event this turn, where a rested one was already spent.
       */
      from: "active" | "rested" | "given" | "cost-area";
      count: number;
      /**
       * `each: true` gives `count` DON!! to *every* card the binding holds
       * rather than to the first of them -- "[printed text omitted -- pnpm card:text <card>]" (OP14-105 Gorgon Sisters).
       * Without it a multi-card binding silently paid only its first member.
       *
       * The DON!! runs out in board order when there is not enough for
       * everyone, which is what "up to 1 each" means once the pile is empty.
       */
      target: "leader" | { binding: string; each?: true };
    }
  /**
   * "[printed text omitted -- pnpm card:text <card>]"
   * -- ST21-014 Monkey.D.Luffy's `[When Attacking]`.
   *
   * `attach-don` already covers the two halves separately -- a binding or the
   * Leader -- but no card before this printed a *choice* between them with
   * both halves reachable, so the DSL had no way to express it. This node
   * suspends on a target choice offering the Leader and every eligible
   * Character the player controls; declining ("up to") resolves to nothing,
   * and a player with no rested DON!! gets no choice at all.
   *
   * The optional `type` filter restricts both halves, for text like OP15-114
   * Wyper's "[printed text omitted -- pnpm card:text OP15-114]": the
   * Leader is only offered when it has the type, and board Characters are
   * filtered by it. (ST21-014's text has no type, so it offers every
   * Character and the Leader unconditionally.)
   */
  /**
   * "[printed text omitted -- pnpm card:text ST21-014]" -- the tail
   * every `lookAndAdd` search prints.
   *
   * The order is the player's, and it was not being asked for: a `select` with
   * `count: "all"` feeding one `move` placed the leftovers in whatever order
   * the look happened to reveal them. This node asks instead, one card at a
   * time, and delegates each placement to the `move` node it re-queues -- so
   * replacements, events and ownership stay in the one place that implements
   * them.
   *
   * The choice is skipped while the unplaced cards share a single card number,
   * because the deck that results is then identical whichever order they go in
   * and a prompt with no observable consequence is noise in a trace and a
   * decision an agent has to spend a turn on. Two cards of different identities
   * is the smallest position where the order is real.
   */
  | {
      kind: "order-to-bottom";
      binding: string;
      to: MoveDestination;
      /**
       * A second destination the same placement may split across -- EB03-023
       * Kaya looks at five cards and "place[s] them at the top or bottom of the
       * deck in any order", the first clause in the pool that does not send
       * every looked-at card to one end.
       *
       * Without it the clause has to pick an end for all five, which is a
       * narrower card than the one printed: keeping a hit on top and burying
       * the rest is the whole point of the look. The split is carried in the
       * option's payload rather than as a per-card prompt, the same way the
       * order itself is.
       */
      alternate?: MoveDestination;
    }
  /**
   * "Rest up to a total of N of your opponent's Characters or DON!! cards" --
   * OP12-037 Asura's paid clause and OP06-035 Hody Jones's `[On Play]`.
   *
   * A single node rather than a `choice` per rest because the printed total is
   * shared across two pools that no `CardSelector` can span: `CardZone` has no
   * DON!! zone, and an `anyOf` clause filters cards rather than naming a
   * resource. Writing it as nested `choice` branches would also offer a
   * "rest a DON!!" branch to a player whose opponent has none.
   *
   * DON!! are interchangeable, so which one rests is not a decision and the
   * option is a single "don" rather than one per card -- the same shape the
   * imperative `rest-opponent-card` pending effect has offered since OP12-037.
   * This node is what puts it in the DSL, so a program can carry a printed
   * "Then, ..." clause after it: OP12-037's text ends at the rest, and
   * OP06-035's does not.
   */
  | {
      kind: "rest-opponent-cards";
      player: PlayerRef;
      count: number;
      /**
       * A cost ceiling on the Character half -- OP09-036 Monkey.D.Luffy rests
       * "1 of your opponent's DON!! cards or Characters with a cost of 6 or
       * less", where OP12-037 and OP06-035 name no ceiling at all.
       *
       * Only the Characters are filtered: a DON!! card has no cost, and the
       * printed clause reads the ceiling onto the half that does.
       */
      maxCost?: number;
      /**
       * The DON!! half alone -- "rest up to 2 of your opponent's DON!! cards"
       * (P-060 Tot Musica), which names no Characters at all.
       *
       * This node exists because the *pair* cannot be spanned by a selector;
       * a clause that reaches only the DON!! still belongs here, because
       * nothing else can rest one. Without the flag the Character half would
       * be offered as well, and the printed text does not.
       */
      donOnly?: true;
      /**
       * Which Characters the clause may rest, where the text narrows them --
       * EB03-012 Otama rests "{Animal} or {SMILE} type Characters with a cost
       * of 3 or less", EB03-061 Uta any "Characters with a cost of 4 or less".
       *
       * The DON!! half of the choice is never filtered: a DON!! card has no
       * cost or type to filter on, and both printings offer it unconditionally.
       * Without this the node offered every opposing Character, so a clause
       * with a narrow reach read as the format's widest rest.
       */
      match?: Omit<CardSelector, "player" | "zone">;
    }
  | {
      kind: "give-rested-don";
      player: PlayerRef;
      count: number;
      type?: string;
      /**
       * A card name the recipient must answer to -- "1 of your
       * [Monkey.D.Luffy] cards" (OP13-021 Gum-Gum Gatling Gun, ST31-005
       * Thousand Sunny).
       *
       * `type` and `anyOfTypes` ask about types, which cannot say this, and
       * `attach-don` -- the other node that hands DON!! to a named card -- only
       * reaches a board Character: its binding lookup searches `board`, so a
       * Leader chosen for it is silently paid nothing. Both cards above name
       * the Leader as a legal recipient, so the choice belongs here, where the
       * Leader is one of the offered targets. Matches every name the card
       * answers to, the same `hasCardName` reading every other name filter uses.
       */
      name?: string;
      /**
       * A disjunction of types, for "1 of your {Fish-Man} **or** {Merfolk} type
       * Leader or Character cards" -- the OP14-040 Jinbe Leader. `type` names
       * one and cannot say this; a card matching either qualifies, and a card
       * matching both is still one card.
       */
      anyOfTypes?: readonly string[];
      /**
       * Which DON!! moves. Defaults to `"rested"`, the printed "give up to N
       * rested DON!! cards" every earlier card carries.
       *
       * `"active"` is the same choice over the same two halves, differing only
       * in which pile the DON!! comes out of. `"cost-area"` is the printed
       * "from ... cost area" (OP15-023 Arlong), which is both piles -- see the
       * `attach-don` note above for why the two readings are not the same.
       */
      from?: "active" | "rested" | "cost-area";
      /**
       * A gift of DON!! to the Leader or a Character of the DON!!'s owner
       * (OP15-003 Alvida, OP15-010 Nezumi, OP15-012 Buggy, OP15-017 Morgan,
       * OP15-023 Arlong): the DON!! may be either player's, and goes to a card
       * of whoever owns it. Bandai's OP-15 Q&A rules both directions legal and
       * crossing over illegal (OP15-010 Q1 and Q3), so the recipient choice
       * spans both boards and the recipient's owner decides whose pile pays.
       * `player` then names only the side whose cards are listed first; the
       * activating player makes the choice either way.
       */
      eitherOwner?: true;
    }
  | {
      kind: "restrict";
      binding: string;
      restriction:
        | "cannot-attack"
        | "cannot-rest"
        | "cannot-refresh"
        /** "…cannot activate [Blocker] during this turn" -- OP16-063 Kuzan. */
        | "cannot-block"
        /**
         * "[printed text omitted -- pnpm card:text OP16-063]" -- OP10-070 Trebol.
         *
         * A turn-scoped immunity written onto the cards the clause reached, as
         * opposed to the continuous ones `isRemovalImmune` reads off printed
         * text. Battle destruction and the controller's own removal are
         * untouched, which is what "by your opponent's effects" says.
         */
        | "ko-immune"
        /**
         * "…cannot be K.O.'d by effects", naming no player -- OP04-083 Sabo.
         *
         * `ko-immune` with the controller's own effects stopped too, which is
         * what a clause that names no player covers. Battle destruction is
         * still untouched: losing a fight is not an effect.
         */
        | "effect-ko-immune"
        /**
         * "…cannot be K.O.'d in battle", granted for a window rather than
         * printed -- OP06-030 Dosun and the OP06-096 Event.
         *
         * The other half of the question `ko-immune` above asks: that one stops
         * an effect's K.O. and leaves a lost battle lethal, and a clause that
         * prints one of them does not print the other.
         */
        | "battle-ko-immune"
        /**
         * "…cannot attack unless your opponent trashes N cards from their hand
         * whenever they attack" -- OP08-043 Edward.Newgate, the only printed
         * clause in the pool that prices an attack rather than banning it.
         *
         * `handTrashCost` carries the N. A per-card restriction rather than a
         * `restrict-player` because the clause names the Characters that were
         * on the field when it resolved: one played afterwards attacks for
         * free, which a player-wide rule could not say.
         */
        | "attack-taxed";
      expiresAfterTurns: number;
      /** Cards a taxed attack costs, for `attack-taxed`. */
      handTrashCost?: number;
    }
  /**
   * "[printed text omitted -- pnpm card:text <card>]" (OP17-085/092) -- a
   * restriction on the *player*, not on any one card instance. Every other
   * `restrict` kind is a `binding`, which cannot say this: the effect applies
   * to every Character the player might play for the rest of the turn, not
   * to a card already on the field.
   */
  | {
      kind: "restrict-player";
      player: PlayerRef;
      /**
       * A printed-cost floor for `cannot-play-characters`, so the ban reaches
       * only the expensive plays -- "[printed text omitted -- pnpm card:text <card>]" (OP12-030 Dracule Mihawk). Absent, the ban is total.
       */
      minBaseCost?: number;
      /**
       * A printed-cost ceiling, for `leader-cannot-attack-characters` --
       * "[Activate: Main] ... Then, this Leader cannot attack your opponent's
       * Characters with a base cost of 7 or less during this turn" (OP12-020
       * Roronoa Zoro). The mirror of `minBaseCost`, which narrows the play ban
       * from the other end.
       */
      maxBaseCost?: number;
      /** The union, and what each member means, is in `@one-piece-sim/protocol`. */
      restriction: PlayerRestriction;
      expiresAfterTurns: number;
    }
  | {
      kind: "update";
      binding: string;
      faceUp?: boolean;
      rested?: boolean;
    }
  | {
      kind: "knock-out";
      binding: string;
      /**
       * Internal: skip the replacement offer.
       *
       * Set only on the node the replacement prompt itself queues for the
       * "K.O. it anyway" branch, so answering the prompt does not raise the
       * same prompt again.
       */
      skipReplacements?: true;
      /**
       * Internal: this node holds the targets left over after a replacement
       * prompt, so a target that is no longer on the field is skipped rather
       * than refused. The replacement paid for an earlier target can move a
       * later one: OP15-052 bottoming a Character OP15-114 was about to K.O.
       */
      remainder?: true;
    }
  /**
   * "[printed text omitted -- pnpm card:text <card>]"
   *
   * Distinct from `update: { rested: true }`, which sets the flag and says
   * nothing: resting is a visible board event, and OP10-036 Perona's DON!!
   * refund watches for it. Pair it with `canRest` on the selector so a
   * Character the opponent has protected is never offered.
   */
  | { kind: "rest"; binding: string }
  /**
   * "The next time you play [X] with a cost of N or more from your hand during
   * this turn, the cost will be reduced by M" -- the OP12-061 Leader's
   * `[Activate: Main]`.
   *
   * Not `modify-cost`, which edits a Character already on the field so that
   * "cost N or less" removal reads it differently. This one is a discount on a
   * card still in hand, is scoped by name and by a cost floor, and is consumed
   * by the first play that qualifies. See `takePlayDiscount` in `don.ts`.
   */
  | {
      kind: "discount-next-play";
      player: PlayerRef;
      name: string;
      minCost: number;
      amount: number;
    }
  /**
   * "[printed text omitted -- pnpm card:text <card>]" -- OP16-119 Marshall.D.Teach's Trigger.
   *
   * Switches off the target's own printed text: its static power and cost
   * layers, its printed keywords, and the timed clauses it has not run yet. See
   * `effectsNegated` in `static-abilities.ts` for what consults it.
   */
  | { kind: "negate"; binding: string; expiresAfterTurns: number }
  /**
   * "Deal 1 damage to your opponent", outside the battle steps.
   *
   * Takes the top Life card. A player dealt damage at zero Life loses, and a
   * damaged card with a `[Trigger]` opens its owner's Trigger window on the way
   * out of the action -- see `dealDamage` in `life.ts`.
   *
   * One point of damage, not N: the damaged card waits for the engine to settle
   * its Trigger window, so a second point cannot be dealt in the same
   * resolution. Nothing in the format prints one.
   */
  | { kind: "deal-damage"; player: PlayerRef }
  /**
   * Pay `DON!! −N`: return that many DON!! from the field to the DON!! deck.
   *
   * Purple's recurring cost. Written as an effect rather than a dedicated cost
   * node so it composes with `optional` the way the printed template does:
   * "You may DON!! −1: <effect>" is `optional(sequence[return-don, effect])`.
   */
  | {
      kind: "return-don";
      player: PlayerRef;
      count: number;
      /**
       * Which pile pays -- EB02-061 Monkey.D.Luffy's "return 2 of your
       * **active** DON!! cards to your DON!! deck", the only printed return in
       * the pool that names one.
       *
       * Absent, `returnDonToDeck` takes the cheapest DON!! on the field, rested
       * first. That reading is what every `DON!! −N` prints and it is wrong
       * here: this clause is paid on the card's own attack, when the rested
       * pile is exactly the DON!! already spent, so the default would buy the
       * restand for nothing. Pair it with an `active-don` gate, because a
       * pile that cannot pay must not reach the payoff.
       */
      from?: "active";
    }
  /**
   * "You may return **1 or more** DON!! cards from your field to your DON!!
   * deck: <effect>" -- the shape six OP-09 Characters print, where `return-don`
   * expresses only the fixed "DON!! −N".
   *
   * How many go back is a real decision, and until this existed it was not
   * offered: all six were written as `donMinus(1, ...)`, which returns exactly
   * one. That is legal and it is also the one count that cannot pay the deck
   * these cards are printed for. OP09-061 Monkey.D.Luffy's Leader refunds two
   * DON!! -- one active, one rested -- but only "when **2 or more** DON!! cards
   * on your field are returned", so a hard-coded 1 makes its own package unable
   * to switch it on. Bandai's deck guide for that Leader opens by telling the
   * player to use OP09-076 Roronoa Zoro to "deliberately return more than two
   * DON!! cards" for exactly this reason.
   *
   * `min` is the printed floor, always 1 in the current pool. The ceiling is
   * whatever is on the field when this resolves, so every legal count is
   * offered rather than the two either side of a threshold: the thresholds are
   * a property of the cards a player happens to control, not of this node.
   *
   * The "you may" half stays in an `optional` above -- see `donMinusOrMore` in
   * `mechanics/shared.ts`, which is the template all six are written with. Two
   * prompts rather than one is the correct reading and not an accident: whether
   * to pay and how much to pay are different questions, and folding the second
   * into the first is what left the deck unable to state its plan.
   */
  | {
      kind: "return-don-choice";
      player: PlayerRef;
      min: number;
      effect: MechanicEffect;
    }
  /**
   * "[printed text omitted -- pnpm card:text <card>]" -- ST28-004 Kouzuki Momonosuke's `[Activate: Main]` cost.
   *
   * Not `return-don`, which sends DON!! back to the *DON!! deck* and takes it
   * off the field for good: this takes DON!! that has already been given to a
   * card and puts it back in the cost area, rested. The DON!! stays on the
   * field and stays counted by `fieldDonCount`, so what the cost actually
   * spends is the power those DON!! were adding -- and it spends it for the
   * rest of the turn, because a rested DON!! cannot be given again until the
   * next Refresh Phase.
   *
   * "Currently given" is the whole board: the Leader's pile and every
   * Character's, taken Characters-first so the Leader's own attack power is
   * the last thing the cost eats into. DON!! cards are interchangeable, so
   * which ones move is not a decision and the node takes a count rather than a
   * binding -- the same reading `rest-don` and `return-don` have.
   */
  | { kind: "return-given-don"; player: PlayerRef; count: number }
  /** Rest N of the player's active DON!! as a cost. */
  | { kind: "rest-don"; player: PlayerRef; count: number }
  /**
   * "Set up to N of your DON!! cards as active" -- un-rest rested DON!!.
   *
   * The inverse of `rest-don`, and the only way to get DON!! back mid-turn
   * without adding it from the DON!! deck. `count` is a maximum: a player with
   * one rested DON!! sets one, not an error, because the printed text is always
   * "up to".
   */
  | { kind: "activate-don"; player: PlayerRef; count: number }
  /**
   * "[printed text omitted -- pnpm card:text <card>]" -- OP10-033 Nami.
   *
   * The inverse of `rest-don` on the other side of the table: it does not spend
   * DON!! now, it takes it out of the next turn. Nothing else in the DSL can say
   * this -- every other DON!! node moves cards between piles that exist, and
   * this one writes a rule the next Refresh Phase reads (`donHeldFromRefresh`).
   *
   * A count, not a set of ids: DON!! cards are interchangeable and the printed
   * clause is about how many come back.
   */
  | { kind: "hold-don-from-refresh"; player: PlayerRef; count: number }
  /**
   * "Your opponent rests N of their active DON!! cards at the start of their
   * next Main Phase" -- PRB02-005 Monkey.D.Luffy.
   *
   * The neighbour above holds back DON!! that is already rested, and cannot say
   * this: it is capped by the target's rested pile at the moment the clause
   * resolves, which is the opponent's *previous* turn, so a seat that ended
   * with everything active would pay nothing. This books the rest against the
   * pool the target will actually have, after their refresh and their two new
   * DON!!, and `turn.ts` spends it there.
   */
  | { kind: "rest-don-at-next-main"; player: PlayerRef; count: number }
  /**
   * "[printed text omitted -- pnpm card:text <card>]" --
   * OP14-031 Nami.
   *
   * `activate-don` pays out now; this books the same payout for the end of the
   * turn the clause resolved on, which is the whole point of the card: the
   * DON!! comes back *after* it has been spent, not before. See
   * `endOfTurnDonActivation` on the state for why it is not an
   * `[End of Your Turn]` program.
   */
  | {
      kind: "activate-don-at-end-of-turn";
      player: PlayerRef;
      count: number;
    }
  /**
   * "Add up to N DON!! cards from your DON!! deck and set them as active at the
   * end of this turn" -- OP13-066 Silvers Rayleigh.
   *
   * `add-don` pays out now; this books the same payout for the end of the turn,
   * which is the whole point of an 8-cost body that wants the DON!! for *next*
   * turn rather than for the one it was played on. The sibling of
   * `activate-don-at-end-of-turn`, which un-rests DON!! already on the field.
   */
  | { kind: "add-don-at-end-of-turn"; player: PlayerRef; count: number }
  /**
   * "…at the end of this turn, return DON!! cards from your field to your DON!!
   * deck until you have the same number of DON!! cards on your field as your
   * opponent" -- OP08-074 Black Maria, which buys five DON!! now and gives back
   * whatever it is ahead by when the turn ends.
   *
   * A booking rather than a `return-don` with a count, because the number is
   * not knowable when the clause resolves: everything the player spends the
   * borrowed DON!! on in between -- and everything the opponent's own turn does
   * not change -- moves it. `return-don`'s count is fixed at write time, which
   * is the one thing this clause cannot be.
   */
  | { kind: "equalize-don-at-end-of-turn"; player: PlayerRef }
  /**
   * "…add 1 card from the top of your deck to the top of your Life cards at the
   * end of this turn" -- OP08-101 Charlotte Angel, the Yellow package's way of
   * paying its Life back after spending it.
   *
   * Booked for the same reason: the card is the one on top of the deck when the
   * turn ends, not the one there now, so nothing can be bound at resolution
   * time.
   */
  | {
      kind: "deck-top-to-life-at-end-of-turn";
      player: PlayerRef;
      count: number;
    }
  /** Add DON!! from the DON!! deck to the field, active or rested. */
  | {
      kind: "add-don";
      player: PlayerRef;
      count: number;
      rested: boolean;
    }
  /**
   * Grant a turn-scoped keyword, as OP15-047 Sanji grants [Unblockable].
   *
   * Only keywords the engine models as turn-scoped board state belong here;
   * printed keywords come off card text through `hasStaticKeyword`.
   */
  | {
      kind: "grant-keyword";
      binding: string;
      keyword: GrantableKeyword;
      expiresAfterTurns: number;
    }
  /**
   * "Your Leader's base power becomes N until the end of your opponent's next
   * End Phase" -- OP17-034 Rockstar, and four more cards in that set.
   *
   * Base power rather than a modifier, because these cards meet: Rockstar sets
   * 6000 and OP17-005 Edward.Newgate sets 8000, and two deltas over printed
   * power would add to 9000 where the printed text says the Leader simply
   * takes a number. So each is held as a setter on the player, and rule
   * 4-9-2-1 applies the highest live one whatever order they resolved in --
   * Bandai's OP17 Q&A: OP17-008 Jozu's 8000 lifts a Leader already set to
   * 7000, and OP17-043 Ganzui's 6000 leaves it there.
   *
   * (ST36-003 predates this and approximates the same clause as a
   * `7000 - printed` power modifier. It is left alone deliberately: it is in a
   * shipped deck, and rewriting it would move that deck's replay hashes.)
   */
  | {
      kind: "set-leader-base-power";
      player: PlayerRef;
      value: number;
      expiresAfterTurns: number;
    }
  /**
   * "…base power becomes N during this turn", for a Character rather than the
   * Leader -- OP16-058 across a whole named group, OP16-106 for one card.
   *
   * The Character-side counterpart of `set-leader-base-power`, and for the same
   * reason: two such clauses in one turn do not stack, which a delta modifier
   * could not express -- the highest live one applies (rule 4-9-2-1).
   */
  | {
      kind: "set-base-power";
      binding: string;
      value: number;
      expiresAfterTurns: number;
    }
  /**
   * "[printed text omitted -- pnpm card:text <card>]" -- OP16-104 Catarina Devon.
   *
   * `set-base-power` with a number read off another card rather than a printed
   * constant. The value is taken once, when this resolves: the printed clause
   * says "becomes", not "is always equal to", so a target that later grows or
   * is K.O.'d does not move the copy. Current power, including DON!! given to
   * the target -- which is what makes pointing this at a pumped attacker the
   * whole point of the card.
   *
   * `from` may bind a Leader as well as a board Character: EB04-052 Sanji's
   * "[printed text omitted -- pnpm card:text EB04-052]" is the only clause in the pool that
   * copies off one, and a Leader is reached through
   * `{ zone: [], includeLeader: true }` rather than from any zone. `to` stays
   * Characters-only, because nothing prints the reverse.
   */
  | {
      kind: "copy-power";
      from: string;
      to: string;
      expiresAfterTurns: number;
      /**
       * Copy the source's *base* power rather than its current power --
       * OP06-009 Shuraiya's "this Character's base power becomes the same as
       * your opponent's Leader".
       *
       * The printed sentence names base power, so the DON!! given to that
       * Leader and the modifiers on it do not travel: a Leader pumped to 12000
       * for the turn still lends a 5000. Reading the pumped figure instead
       * would turn a 4000 Blocker into whatever the attacker had just spent.
       */
      base?: true;
    }
  /**
   * "[printed text omitted -- pnpm card:text <card>]" -- the clause
   * the whole OP14 Red/Law package is built on: the Leader's
   * `[Activate: Main]`, OP14-009's defensive reaction and OP14-017's Event all
   * print it, over two Characters or over a Leader and a Character.
   *
   * Not two `copy-power` nodes: the second would read a base power the first
   * had already replaced, and both cards would end up at the same number. Both
   * values are read before either is written, which is what "with each other"
   * means.
   *
   * Base power, so a swap moves the printed body and leaves DON!! given, power
   * modifiers and static layers where they are -- a 1000-power Character
   * carrying four DON!! that swaps with a 9000 body ends the turn at 9000+4000,
   * not at 5000.
   *
   * `scope: "battle"` is OP14-009's "during this battle"; `"turn"` is the other
   * two clauses' "during this turn".
   */
  | {
      kind: "swap-base-power";
      /**
       * The binding holding the cards to swap. With no `second`, this must hold
       * two -- "Select 2 of your … Characters" is one `choose` of two -- and
       * anything else resolves to nothing, which is the reading a "select 2"
       * with only one eligible card gets.
       */
      first: string;
      /** The other side, when the two cards are chosen separately: OP14-009
       * Trafalgar Law's "[printed text omitted -- pnpm card:text OP14-009]". */
      second?: string;
      scope: "turn" | "battle";
    }
  /**
   * "[printed text omitted -- pnpm card:text OP14-009]" --
   * OP15-093 The Risky Brothers, the only clause in the pool that hands a
   * Character an attribute it does not print.
   *
   * Attribute is otherwise a printed fact, so this is turn-scoped board state
   * beside the keyword grants rather than anything the card database knows.
   * It *adds* to the printed attributes; a card that already has the attribute
   * is unaffected.
   */
  | {
      kind: "grant-attribute";
      binding: string;
      attribute: string;
      expiresAfterTurns: number;
    }
  /**
   * "[printed text omitted -- pnpm card:text <card>]" -- OP16-080 Marshall.D.Teach.
   *
   * The defender choosing what the attack hits, which is what a [Blocker] does
   * by resting -- but this pays with a card from hand instead and may name the
   * Leader, which no Blocker can. The engine models an attack's target as one
   * field on `activeAttack`, so redirecting is writing it.
   */
  | { kind: "redirect-attack"; binding: string }
  /**
   * Book something for the end of this turn against the cards a binding holds.
   *
   * "[printed text omitted -- pnpm card:text <card>]" (OP11-092 Helmeppo) and "[printed text omitted -- pnpm card:text OP11-092]" (OP11-107 Topknot Neptunian).
   * The card that owes it is not the card the clause is printed on, so nothing
   * in the `[End of Your Turn]` registry can express it: that table is keyed by
   * the card whose text runs. See `PlayerState.endOfTurnCardActions`, which
   * `completeEndTurn` pays.
   */
  | {
      kind: "at-end-of-turn";
      binding: string;
      /**
       * `"trash"` is OP06-006 Saga's price: the power it takes on its own
       * attack costs its controller one {FILM} body when the turn ends.
       *
       * The card is chosen when the clause resolves rather than when the debt
       * is paid, which is the approximation the two `"bury"` cards already
       * take -- and a wider one here, because their text names "that Character"
       * and this one names any of a group. A booking that deferred a whole
       * program to the end of the turn, rather than a card and an action, is
       * what would let it be exact.
       */
      action: "bury" | "set-active" | "trash";
    }
  /**
   * "[printed text omitted -- pnpm card:text <card>]" -- OP11-010, OP11-014, OP11-082,
   * OP11-084 and OP11-119.
   *
   * Not a keyword grant: it widens the *target list* of one attacker rather
   * than changing what it may do on the turn it lands, which is what
   * [Rush: Character] does. `legal-actions/main.ts` reads the flag when it
   * builds the targets for each attacker.
   */
  | {
      kind: "grant-attack-active";
      binding: string;
      expiresAfterTurns: number;
    }
  /**
   * Note which Character this program just named, so a later clause of the same
   * card can refer back to it -- OP15-008 Krieg's "that Character".
   */
  | { kind: "remember-target"; binding: string }
  /**
   * "Activate up to 1 {Dressrosa} type Event ... from your hand" -- OP15-014
   * Bartolomeo and OP15-046 Sabo.
   *
   * Runs the Event's own `[Main]` program without paying its printed DON!! cost,
   * and trashes it as playing it normally would. The Event's *other* printed
   * costs are still paid: a `DON!! −N` or a rested DON!! is part of its text
   * rather than of its cost line.
   *
   * Must be the last effect in its program. The Event's program runs as its own
   * execution with the Event as the source -- which is what makes `SOURCE_BINDING`
   * and the event's own reporting correct -- and if it suspends on a choice,
   * that choice is what the player answers next; there is no way to resume the
   * outer program behind it. Every card that prints this prints it last.
   *
   * The Event may be in the hand or in the trash: EB03-031 Vinsmoke Reiju
   * reaches for one already spent, which is what makes the clause a second use
   * of an Event rather than a discount on a first. The zone is read off the
   * binding rather than declared, because the selector that filled it already
   * named the zone the printed text does.
   */
  /**
   * "…your opponent cannot activate [Blocker] during this battle" -- OP06-055
   * Monkey.D.Garp.
   *
   * Battle-scoped, so it lives on `activeAttack` rather than on the cards: the
   * nearest card-scoped alternative is `restrict`'s `cannot-block`, whose
   * shortest life is the rest of the turn, and that would switch off blocks
   * against every *later* attack that turn -- the mistake writing a
   * battle-scoped buff as a turn-scoped modifier makes. Granting the attacker
   * [Unblockable] would answer a different question: this clause bars an
   * ability rather than changing what the attack may be pointed at.
   */
  | { kind: "disable-blockers" }
  /**
   * "Then, take an extra turn after this one" -- OP05-119 Monkey.D.Luffy, the
   * only card in the pool that prints one.
   *
   * Booked on the player rather than done here: a turn is not something an
   * effect can take mid-resolution, so `completeEndTurn` reads the booking
   * when the current turn ends and hands the next one back to the same seat.
   * See `PlayerState.extraTurns`.
   */
  /**
   * Install a K.O. replacement on the *player* for a window -- EB02-030's
   * `[Counter]`, which buys "if any of your Characters would be K.O.'d in
   * battle during this turn, you may trash 1 card from your hand instead".
   *
   * Every other replacement in the registry is found by walking the board and
   * the Leader, and this one has no card there to find: the Event is in the
   * trash before the first Character is threatened. So the booking goes on the
   * player and `eligibleReplacements` reads it as a protector of its own. What
   * the protection costs and what it answers stay in the replacement registry
   * under `cardNumber`, beside every other entry.
   */
  | {
      kind: "install-replacement";
      player: PlayerRef;
      cardNumber: string;
      expiresAfterTurns: number;
    }
  | { kind: "extra-turn"; player: PlayerRef }
  | { kind: "activate-event"; binding: string };

export interface MechanicProgram {
  effect: MechanicEffect;
  /**
   * A `[Trigger]` that runs its card's own `[On Play]` -- seven cards print
   * that, from OP06-013 to OP14-108. Bandai's OP-09 Q&A (OP09-081#1) rules it
   * is still an [On Play] effect: while the owner's [On Play] effects are
   * negated, the Trigger can be activated and does nothing. Set through
   * `asOnPlayTrigger`, read by `createTriggerResult`.
   */
  runsOnPlay?: true;
}

export interface MechanicProgramInvocation {
  context: MechanicContext;
  program: MechanicProgram;
  /**
   * Bindings the program starts with, beside `SOURCE_BINDING`.
   *
   * For a program built outside the interpreter that has to name a card the
   * interpreter never chose: the two older replacement paths
   * (`resolve-effect/removal.ts`, `resolve-effect/replacements.ts`) dispatch a
   * cost as a bare program, and a cost that acts on the *threatened* card
   * (OP05-001 Sabo's −1000) has no other way to be told which card that is.
   */
  bindings?: Record<string, string[]>;
  /**
   * The clause fired on its own -- a watcher answering a signal, an
   * `[On K.O.]`, a "when this is rested" -- rather than because the player
   * played or activated the card it is printed on.
   *
   * Set at the point the invocation is built, because that is the only place
   * that still knows which of the two it was, and read only by
   * `dispatchMechanicInvocations`, which turns it into the
   * `ability-triggered` event that tells a player their Leader just acted.
   */
  automatic?: true;
  /**
   * The clause is `[Once Per Turn]` and firing it spent that use, whether or
   * not it goes on to do anything.
   *
   * Read by `dispatchMechanicInvocations` for the one case its
   * `ability-triggered` marker would otherwise stay silent on: a clause that
   * fired to no effect -- OP08-067 Charlotte Pudding answering a returned DON!!
   * with an empty DON!! deck -- and so will not answer the next one this turn.
   */
  spendsOncePerTurn?: true;
  /**
   * Shared by the automatic clauses one player has answering the same signal,
   * when more than one card is answering it.
   *
   * Read by `dispatchMechanicInvocations`, which stops at a run of these and
   * asks the controller which resolves first (`order-reactions`). Only the
   * equality of adjacent entries matters, so the value just has to differ
   * from the next group's.
   */
  orderGroup?: string;
}

/**
 * A played card whose `[On Play]` is an imperative handler, not a program.
 *
 * Carries no body because there is nothing to carry: the handler is looked up
 * by card number in `ON_PLAY_HANDLERS`. It exists so that a `card-played`
 * signal can name *any* card's own clause, however that clause is written --
 * before this, the queue could only express the DSL half, and the other half
 * was dropped wherever a card reached the field through the DSL's `play` node.
 */
export interface OnPlayHandlerInvocation {
  context: MechanicContext;
  onPlayHandler: true;
}

export type MechanicInvocation =
  MechanicProgramInvocation | OnPlayHandlerInvocation;

export interface MechanicExecution {
  context: MechanicContext;
  bindings: Record<string, string[]>;
  queue: MechanicEffect[];
}

export type MechanicPendingChoice =
  | {
      kind: "optional";
      execution: MechanicExecution;
      effect: MechanicEffect;
      /** Set only when the node named someone other than the source player. */
      chooserPlayerId?: PlayerId;
    }
  | {
      kind: "choice";
      execution: MechanicExecution;
      branches: readonly {
        id: string;
        label: string;
        effect?: MechanicEffect;
      }[];
      /** Set only when the node named someone other than the source player. */
      chooserPlayerId?: PlayerId;
    }
  /**
   * How many DON!! a "return 1 or more" clause sends back -- the pending half
   * of the `return-don-choice` node above.
   *
   * `player` stays the unresolved ref the node carried, so the `return-don`
   * this flattens into resolves it against the same execution context the
   * clause was written in rather than against a snapshot taken a step earlier.
   */
  | {
      kind: "return-don-choice";
      execution: MechanicExecution;
      player: PlayerRef;
      min: number;
      effect: MechanicEffect;
    }
  /**
   * A `play` that would put a sixth Character on the field.
   *
   * The imperative `placeCharacter` path has always raised the five-Character
   * replacement choice; the interpreter used to `break` instead, so a Character
   * recurred out of trash at a full field was consumed for nothing. The card
   * being played stays in its own zone until the replacement resolves, which is
   * what keeps the zone invariants satisfied while this is pending.
   */
  | {
      kind: "area-replacement";
      execution: MechanicExecution;
      playerId: PlayerId;
      card: CardInstance;
      rested: boolean;
    }
  | {
      kind: "cards";
      execution: MechanicExecution;
      selector: CardSelector;
      bind: string;
      min: number;
      max: number;
      selected: string[];
      /** Set only when someone other than the source player answers. */
      chooserPlayerId?: PlayerId;
      /** Carried over from `choose`. See its doc comment. */
      maxTotalCost?: number;
      maxTotalPower?: number;
      distinctNames?: boolean;
      exhaustive?: boolean;
      effect: MechanicEffect;
    }
  /**
   * The `order-to-bottom` node's single choice: the whole placement order, as
   * a permutation of `instanceIds`' positions.
   *
   * One decision, not one per card. The cards are going to the bottom either
   * way -- only their order is the player's -- and asking a card at a time
   * spent an action on each of up to five of them, which a watching opponent
   * saw as five separate "opponent action" panels reporting a hidden card
   * moving from the deck to the deck.
   *
   * The engine offers exactly one option, the order the look revealed them in
   * (see {@link formatOrderOption}); a caller that wants another submits the
   * same action with its own index list, which `applyAction` accepts only as a
   * permutation of the offered one. So a policy that does not care about the
   * order plays the offer as it stands, and nothing else in the engine has to
   * enumerate the orders it does not care about.
   */
  | {
      kind: "order-to-bottom";
      execution: MechanicExecution;
      binding: string;
      to: MoveDestination;
      /** The node's second destination, where it has one. */
      alternate?: MoveDestination;
      instanceIds: string[];
    }
  /**
   * The `pick-from-hand` node's `"blind"` choice: one option per position in
   * `instanceIds`, which holds the hand in an RNG-drawn order. The ids never
   * reach an option, a summary or an observation -- only a position does.
   */
  | {
      kind: "blind-hand-pick";
      execution: MechanicExecution;
      targetPlayerId: PlayerId;
      bind: string;
      instanceIds: string[];
      effect: MechanicEffect;
    }
  /**
   * Which of several automatic clauses answering the same event resolves next.
   *
   * The comprehensive rules let the player whose effects trigger together
   * resolve them in the order they choose: a returned DON!! that wakes both
   * OP09-074 Bepo and OP08-067 Charlotte Pudding is one event and two clauses,
   * and which lands first is the controller's call, not the registry's. Asked
   * one pick at a time, because a clause that resolves can change what the next
   * one is worth, and the last one left needs no question.
   *
   * `execution` is the first reaction's context with an empty queue, so the
   * readers of `execution.context` that every other variant feeds still work;
   * nothing is ever run off it.
   */
  | {
      kind: "order-reactions";
      execution: MechanicExecution;
      reactions: MechanicProgramInvocation[];
    }
  /**
   * The `rest-opponent-cards` node's repeated choice: one opposing Character
   * per option, plus `"don"` while the opponent has an active DON!! to rest,
   * plus `"skip"` for the printed "up to". Re-raised with `remaining - 1`
   * until the total is spent or nothing is left to rest.
   */
  | {
      kind: "rest-opponent-cards";
      execution: MechanicExecution;
      targetPlayerId: PlayerId;
      eligibleInstanceIds: string[];
      remaining: number;
    }
  /**
   * The `give-rested-don` node's target choice: the Leader and every Character
   * the player controls, plus "skip" for the printed "up to".
   */
  | {
      kind: "give-rested-don";
      execution: MechanicExecution;
      playerId: PlayerId;
      eligibleInstanceIds: string[];
      count: number;
      /** Set only when the node was created with a `type` filter. */
      type?: string;
      /**
       * Set only when the DON!! comes from somewhere other than the rested
       * pile: the active one, or the whole cost area.
       */
      from?: "active" | "cost-area";
      /**
       * Set only for an "its owner's" gift: `eligibleInstanceIds` then spans
       * both players' cards, and each DON!! comes out of the recipient's
       * owner's pile rather than `playerId`'s.
       */
      eitherOwner?: true;
    };

export interface MechanicResult {
  pending: MechanicPendingChoice | null;
  events: PublicEvent[];
  signals: MechanicSignal[];
}

export type MechanicSignal =
  | {
      kind: "card-moved";
      card: CardInstance;
      ownerId: PlayerId;
      from: CardZone;
      to: CardZone;
      /**
       * The card whose effect moved it, for a clause that asks *what* did the
       * moving -- "when a card is trashed from your hand by your {Navy} type
       * card's effect" (OP12-040 Kuzan's Leader).
       *
       * Every other reader of this signal asks only about the card that moved,
       * which is why it is optional: a K.O. watcher does not care what killed
       * the Character.
       */
      sourceCardNumber?: string;
      /**
       * Which player's effect did the moving, for a clause that says "by *your*
       * effect" -- OP08-046 Shakuyaku.
       *
       * `sourceCardNumber` beside it names the card and cannot answer this: a
       * card number says nothing about who controls the copy that ran, and both
       * players can be running the same identity.
       */
      sourcePlayerId?: PlayerId;
      /**
       * Whether the card left Life because the *Leader* attacked and connected
       * -- P-117 Nami, whose self-mill is the engine of its own alternate win
       * condition.
       *
       * `sourceCardNumber` cannot say it: battle damage has no source card at
       * all, and a Character's attack moves a Life card in exactly the same
       * shape. The distinction is only knowable where the battle resolves, so
       * it rides on the signal.
       */
      byLeaderAttack?: true;
      /**
       * The card left the board because it was K.O.'d -- by battle or by a
       * `knock-out` -- rather than moved by an effect that trashes it.
       *
       * Both land in the trash, and by the time a watcher sees the signal the
       * board entry is gone, so this is the only place the two can still be
       * told apart. Bandai's rules Q&A (Keywords 7) and OP-09 Q&A (OP09-009#1)
       * rule that a trashed Character was not K.O.'d: its own `[On K.O.]` and
       * every "when a Character is K.O.'d" watcher stay silent.
       */
      ko?: true;
    }
  | {
      kind: "card-played";
      card: CardInstance;
      playerId: PlayerId;
      /**
       * The category of the card whose effect played it, for a clause that asks
       * *how* the play happened -- "[printed text omitted -- pnpm card:text <card>]" (OP12-081 Koala's Leader).
       *
       * Absent for a play out of hand, which is the ordinary case and the one
       * that clause deliberately excludes.
       */
      bySourceCategory?: string;
    }
  /**
   * A Character became rested through the `rest` node -- what OP14's Green
   * package is built to answer ("[printed text omitted -- pnpm card:text OP12-081]", printed on six cards).
   *
   * Carries who caused it, because OP14-070 Buffalo answers only a rest that
   * came from "[printed text omitted -- pnpm card:text OP14-070]" and every other clause
   * answers any rest at all. A Stage never raises this: it is not a Character,
   * the same line `character-rested` already draws.
   */
  | {
      kind: "card-rested";
      card: CardInstance;
      ownerId: PlayerId;
      /** Controller of the card whose effect did the resting. */
      sourcePlayerId: PlayerId;
      /** Whether that source was a Character rather than a Leader or Event. */
      sourceIsCharacter: boolean;
    }
  /**
   * A DON!! card went from a player's field back to their DON!! deck -- what
   * "[printed text omitted -- pnpm card:text <card>]" answers
   * (OP11-077 Randolph).
   *
   * Raised by the `return-don` node, which is how `DON!! −N` is paid on the
   * declarative path. The two reactions that predate this read the same event
   * from inside `returnDonToDeck` itself (see `ON_DON_RETURNED_REACTIONS` in
   * `don.ts`); they stay there because both are unconditional DON!! takes with
   * nothing to choose, and this signal exists for the one clause that has a
   * target to pick.
   */
  | {
      kind: "don-returned";
      playerId: PlayerId;
      /**
       * How many DON!! the payment sent back, for a clause that asks -- the
       * OP09-061 Leader pays out only on "2 or more DON!! cards ... returned",
       * where OP09-074 Bepo answers a single one.
       */
      count: number;
    }
  /**
   * A `[Trigger]` resolved -- what "when a [Trigger] activates" answers
   * (OP13-106 Conney).
   *
   * The only signal in the stream that is not about a card changing zones: it
   * reports that a clause *ran*. Raised where the Trigger is resolved, so it
   * covers a Trigger off battle damage and one off an effect alike, and it names
   * the player whose Trigger it was.
   */
  | { kind: "trigger-activated"; playerId: PlayerId }
  /**
   * An Event was activated -- what "when you activate an Event" (OP10-003
   * Sugar's Leader) and "[printed text omitted -- pnpm card:text OP10-003]"
   * (OP11-102 Camie) answer.
   *
   * Like `trigger-activated`, this reports that a clause ran rather than that a
   * card moved. It is raised once per `event-activated` public event, in
   * `applyAction` -- the one place all ten activation sites converge.
   */
  | { kind: "event-activated"; playerId: PlayerId }
  /**
   * A [Blocker] was activated by resting the card, and by whom.
   *
   * OP06-048 Zeff watches "your opponent activates [Blocker] or an Event" and
   * needs both halves; only the Event half had a signal. Raised from the block
   * action alone: ST36-005's redirect moves an attack without activating
   * anything, which is the same line OP09-118's win condition draws.
   */
  | { kind: "blocker-activated"; playerId: PlayerId }
  /**
   * A player drew by an *effect* -- what "when you draw a card outside of your
   * Draw Phase" (OP05-053 Mozambia) answers.
   *
   * Raised by the `draw` node alone. The turn's own draw is a rule rather than
   * an effect and never raises it, which is exactly the distinction the
   * printed clause makes; the handful of imperative draws left in `effects.ts`
   * predate the signal and do not raise it either, so a card that watches this
   * sees every declarative draw and none of the legacy ones.
   */
  | { kind: "card-drawn"; playerId: PlayerId; count: number };

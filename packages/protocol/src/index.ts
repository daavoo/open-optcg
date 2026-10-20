export { nextInt, seedRng, shuffle, type RngState } from "./rng.js";
export { sha256Bytes, sha256Hex, sha256HexPortable } from "./sha256.js";

import { z } from "zod";

export { PROTOCOL_VERSION } from "./version.js";
import { PROTOCOL_VERSION } from "./version.js";
export type PlayerId = "p1" | "p2";
export type Phase =
  "mulligan" | "main" | "block" | "counter" | "trigger" | "finished";

/**
 * A deck the rules engine can deal: the Leader and the deck list, in the order
 * the cards sit before the shuffle.
 *
 * This is deliberately the minimum the engine needs. It does *not* carry the
 * deck manifest: printed DON!! deck size and starting Life are read off the
 * Leader's card text through `cardFacts`, so the engine owns them, and any
 * further manifest field the engine accepted here is a field it could grow to
 * depend on. Turning a deck *id* into one of these is the deck catalog's job
 * (`resolveDeck` in `@one-piece-sim/decks`), which is what keeps the catalog
 * above the rules rather than under them.
 */
export interface ResolvedDeck {
  leader: string;
  /** The card numbers, in deck order before the shuffle. */
  cards: readonly string[];
  /**
   * Stable identity for this deck, used *only* to order the two seats under
   * `seedMode: "matchup"` so a matchup shuffles the same way whichever seat
   * each deck sits in. Callers that resolve from the catalog pass the deck id;
   * without one the engine falls back to the deck's own contents.
   */
  seedKey?: string;
}

/**
 * A tournament time limit, counted in turns.
 *
 * Bandai's "Sanctioned Tournaments Floor Rules" (Ver. 1.6.0, §8.2): when a
 * match's time runs out, the turn in progress becomes turn 0, three more turns
 * are played, and a game still going after them is decided by the procedures
 * in {@link TimeLimitProcedure}. The engine has no clock -- a game must replay
 * from its seed and its actions -- so time is called when a given turn begins
 * rather than when minutes have passed.
 */
export interface TimeLimit {
  /**
   * The turn on whose start time is called, on the engine's own counter: every
   * player's turn is one turn, so turn 1 is the first player's first turn and
   * turn 2 the second player's. An extra turn (OP05-119) is a turn too.
   */
  turns: number;
}

/**
 * The time limit the learned model is trained and evaluated under, and the
 * one every local match in the app is played under, so the model never meets
 * a game whose time-limit inputs it was not trained on. Time is called when
 * turn 20 begins: past where natural games end, so it decides a stalled game
 * rather than changing how most games finish.
 */
export const STANDARD_TIME_LIMIT: Readonly<TimeLimit> = Object.freeze({
  turns: 20,
});

/** How many turns follow the one on which time is called (§8.2). */
export const TIME_LIMIT_ADDITIONAL_TURNS = 3;

export const timeLimitSchema = z.object({
  turns: z.number().int().min(1),
});

/**
 * Which of §8.2's procedures decided a game on time, in the order they are
 * tried: more Life cards, then more cards left in the deck, then more
 * Characters, then whoever last drew a card from their Life area.
 *
 * `"final-turn"` is not Bandai's: it is what decides a game in which all four
 * tie, which needs both players on equal Life with neither ever having taken a
 * Life card into hand. The floor rules stop at procedure 4 and the protocol has
 * no draw, so the player whose turn ended the game loses -- the same tiebreak
 * the engine already uses for a simultaneous deck-out (OP15-022).
 */
export type TimeLimitProcedure =
  "life" | "deck" | "characters" | "life-drawn" | "final-turn";

/** Why a game finished, as the engine reports it. */
export type GameResultReason = "deck-exhaustion" | "life" | "time";

/** What every seat may see of a game's time limit. */
export interface TimeLimitObservation {
  /** The turn on whose start time is called: turn 0 of the extra turns. */
  calledOnTurn: number;
  /** The last turn; the game is decided when it ends. */
  finalTurn: number;
  called: boolean;
  /**
   * Turns still to begin after the current one before the game is decided:
   * 3 on the turn time is called, 0 on the final turn. `null` until then.
   */
  turnsLeft: number | null;
  /** The procedure that decided the game, once time has decided it. */
  decidedBy: TimeLimitProcedure | null;
}

export const requestSchema = z.discriminatedUnion("method", [
  z.object({
    v: z.literal(PROTOCOL_VERSION),
    id: z.string().min(1),
    method: z.literal("game.create"),
    params: z.object({
      p1Deck: z.string(),
      p2Deck: z.string(),
      seed: z.string(),
      timeLimit: timeLimitSchema.optional(),
    }),
  }),
  z.object({
    v: z.literal(PROTOCOL_VERSION),
    id: z.string().min(1),
    method: z.literal("game.observe"),
    params: z.object({ gameId: z.string(), playerId: z.enum(["p1", "p2"]) }),
  }),
  z.object({
    v: z.literal(PROTOCOL_VERSION),
    id: z.string().min(1),
    method: z.literal("game.act"),
    params: z.object({
      gameId: z.string(),
      revision: z.number().int(),
      actionId: z.string(),
    }),
  }),
]);

export type ProtocolRequest = z.infer<typeof requestSchema>;

export type CardZoneName =
  | "hand"
  | "board"
  | "trash"
  | "deck"
  | "life"
  | "stage"
  | "leader"
  | "revealed";

/**
 * What taking an offered action costs, beyond the DON!! it is priced at.
 *
 * A `DON!! −N` returns DON!! from the field to the DON!! deck for the rest of
 * the game; a "trash N cards from your hand" spends cards; "rest N DON!!" spends
 * this turn's cost pool. The engine has always known these -- it checks them
 * before offering the action -- but the action itself did not say so, so a
 * policy could recognise a cost only by card number. Purple made the gap
 * load-bearing: its optional clauses pay out of the deck's own plan, and five
 * deck rules each named one card whose `apply` they refuse. A rule about the
 * *cost* can read this instead, whoever printed it.
 *
 * Only fields the action actually pays are present; an absent field is a cost
 * of zero. Present only where the whole of what the option pays is known -- an
 * `optional` whose effect opens with a `return-don`, an Event's printed
 * `DON!! −N` -- so a policy reading it is never told half the price.
 */
export interface ActionCost {
  /** DON!! returned from the field to the DON!! deck, off the field for good. */
  returnsDon?: number;
  /** Cards trashed from the payer's own hand. */
  trashesFromHand?: number;
  /** DON!! rested from the active pool, spent for this turn only. */
  restsDon?: number;
}

/**
 * The kinds of thing an accepted optional prompt does, past its cost.
 *
 * The counterpart to {@link ActionCost}: that field says what "you may pay X"
 * charges, this one what X buys. A policy -- and the compact scorer above all,
 * which reads a card as one learned vector -- otherwise sees an `apply` that
 * costs something and buys nothing it can name: EB02-061 Monkey.D.Luffy's
 * "return 2 active DON!!: set this Character as active" reached the scorer as
 * a paid confirm and was declined behind a Leader that refunds the DON!!.
 *
 * Coarse on purpose. Each kind is a step the program can run, read off the
 * pending node; how much of it, and on whose cards, stays with the card. A
 * conditional branch counts as if it ran, as `donAddedByProgram` reads one.
 */
export type PayoffKind =
  | "draw"
  | "play"
  | "knock-out"
  | "set-active"
  | "rest"
  | "to-hand"
  | "to-life"
  | "to-deck"
  | "trash"
  | "search"
  | "power"
  | "cost"
  | "keyword"
  | "don"
  | "restrict"
  | "other";

/** Every {@link PayoffKind}, in the order an encoding numbers them. */
export const PAYOFF_KINDS: readonly PayoffKind[] = [
  "draw",
  "play",
  "knock-out",
  "set-active",
  "rest",
  "to-hand",
  "to-life",
  "to-deck",
  "trash",
  "search",
  "power",
  "cost",
  "keyword",
  "don",
  "restrict",
  "other",
];

/**
 * Structured description of one `resolve-effect` option.
 *
 * Effect options are addressed by an opaque `optionId` so that the engine can
 * keep its internal encoding free. This descriptor is the stable, typed view of
 * the same option, so a policy never has to parse `optionId` strings or match
 * on human-readable summary text to work out what it is choosing.
 */
export type EffectOption =
  | { kind: "skip" }
  | { kind: "confirm"; choice: "apply" | "done" | "activate" }
  /** Naming a cost, as Oven, Perospero, Cognac and OP11-079 require. */
  | { kind: "cost"; cost: number }
  /** Choosing a position for a card, e.g. top or bottom of Life or deck. */
  | { kind: "position"; position: "top" | "bottom" }
  /** Paying an optional cost with a named resource rather than a card. */
  | { kind: "resource"; resource: "leader" | "don" }
  /**
   * How many DON!! a "return 1 or more DON!! cards" clause will send back.
   *
   * Distinct from `don-return`, which names *which pool* a fixed `DON!! −N`
   * comes out of: that is a bookkeeping choice between interchangeable cards,
   * and this is the size of the payment. The six OP-09 Characters printing "1
   * or more" offer one of these per affordable count, and the count is the
   * whole decision -- OP09-061's Leader refunds two DON!! for "2 or more
   * returned", so 1 and 2 are different plays with the same card.
   */
  | { kind: "don-return-count"; count: number }
  /**
   * A card picked face-down out of a hand the deciding player cannot see --
   * OP17-075 X.Drake's "choose 1 card from your opponent's hand".
   *
   * Carries a position and nothing else, on purpose: which card sits there is
   * the hand owner's secret until the pick moves it, and the positions are in
   * an order the engine drew at random, so `position` says nothing about the
   * card either. `of` is how many cards the hand holds.
   */
  | {
      kind: "face-down";
      owner: "self" | "opponent";
      zone: "hand";
      position: number;
      of: number;
    }
  /**
   * Choosing between the alternatives a card's text offers before naming a
   * card, as OP14-104 Gecko Moria's "play it **or** add it to the top of your
   * Life cards face-up". `mode` is the branch id; the action's `summary` carries
   * the printed wording.
   */
  | { kind: "mode"; mode: string }
  /** Choosing a specific card. `owner` is relative to the deciding player. */
  | {
      kind: "card";
      owner: "self" | "opponent";
      zone: CardZoneName;
      card: KnownCardRef;
      rested?: boolean;
      currentPower?: number;
      /**
       * Present when the option also names a secondary card, e.g. the
       * Koushirou/Ivankov/Dragon replacements name both the saved Character and
       * the card paying for it.
       */
      via?: KnownCardRef;
      /** Amount encoded in the option, e.g. the DON!! count for a Leader gift. */
      amount?: number;
    }
  /**
   * Which DON!! a `DON!! −N` cost takes off the field.
   *
   * The printed cost lets the controller pick, so the engine offers one option
   * per pool that could supply a card. `card` is set only for `"attached"`, and
   * names the Leader or Character the DON!! was given to -- returning one of
   * those costs that card 1000 power, which is what separates this from the
   * active and rested pools a policy can spend freely.
   */
  | {
      kind: "don-return";
      pool: "active" | "rested" | "attached";
      card?: KnownCardRef;
      /** DON!! this pool held before the cost was paid. */
      available: number;
      /** DON!! still awaiting a pool, this one included. */
      remaining: number;
    }
  /**
   * Placing several cards in an order the deciding player picks -- "[printed text omitted -- pnpm card:text <card>]".
   *
   * `cards` is the order this action would place them in, which is the order
   * they were looked at. To place them in another, submit the same action with
   * its trailing index list rewritten: `...:effect:order:2,0,1,3` places
   * `cards[2]` first. Any permutation of the offered indices is legal and
   * nothing else is; the engine offers this one option rather than one per
   * order, so a caller with no preference plays it as it stands.
   */
  | {
      kind: "order";
      cards: KnownCardRef[];
      /**
       * Where the cards land, as the summary names it -- "the bottom of your
       * deck", "your Life cards".
       *
       * Present whenever the destination is not the deck's bottom. Every
       * ordering clause in the pool placed cards there until ST-13, whose
       * Life-reordering clauses put them back in the Life area, so the
       * sentence could no longer be assumed. A caller reordering the offer
       * needs it to re-word its own summary; see `reorderAction`.
       */
      destination?: string;
      /**
       * The second end a split placement may send cards to, as the summary
       * names it: EB03-023 Kaya and OP11-049 Carrot place each card at the
       * top *or* the bottom of the deck.
       *
       * Present only on a split offer, whose id ends `|N`: the first N cards
       * of the order go to `destination` and the rest here. A caller moving
       * that split point rewrites `N` the way it rewrites the order.
       */
      alternate?: string;
    }
  /** Anything the resolver could not classify; the raw id is still available. */
  | { kind: "other" };

export type LegalAction =
  | {
      actionId: string;
      type: "mulligan-decision";
      decision: "keep" | "mulligan";
      summary: string;
    }
  | {
      actionId: string;
      type: "play-card";
      cardInstanceId: string;
      summary: string;
    }
  | {
      actionId: string;
      type: "resolve-effect";
      optionId: string;
      optionCardNumber?: string;
      effectKind: string;
      sourceCardNumber: string;
      /** Typed view of `optionId`. Prefer this over parsing the id or summary. */
      option: EffectOption;
      /**
       * The keyword this choice is about to hand the card it names, when that is
       * the whole of what the choice does.
       *
       * `option` says what is being chosen; this says what choosing it *buys*,
       * which for a keyword grant is the entire decision and was nowhere in the
       * action list. A policy offered "Choose Rodo" and "Choose Sanji" for
       * OP17-084 Chopper's `[Unblockable]` took the first one, and Rodo was
       * rested: the keyword expired on a card that could not attack, in a
       * position where granting it to Sanji wins the game that turn.
       *
       * `expiresThisTurn` is what makes the mistake unrecoverable rather than
       * merely inefficient, so it is stated rather than left to be inferred from
       * the printed text. Present only for a choice whose only effect is the
       * grant -- a grant buried inside a longer sequence is not summarised here,
       * because then the choice is about the rest of it too.
       */
      grants?: { keyword: string; expiresThisTurn: boolean };
      /**
       * DON!! this choice gives the card it names, when handing over DON!! is
       * the whole of what the choice does.
       *
       * The same gap `grants` closes, for the other turn-scoped resource. A
       * DON!! given to a Leader or Character is +1000 power only while its
       * controller is the active player, and it returns to the cost area at
       * that controller's next Refresh -- so giving it to a card that has
       * already attacked buys nothing, and the choice cannot be taken back.
       *
       * `effectKind` cannot say this: a `give-rested-don` node raised by the
       * mechanic DSL reports `"mechanic-choice"`, so the only thing separating
       * this choice from a search or a K.O. was its summary text. A pilot that
       * gave the DON!! to a spent Leader was found in an ST31 trace.
       *
       * `count` is the printed "up to N", so a rule can price the gift instead
       * of assuming one DON!!.
       */
      donGift?: { count: number; from: "active" | "rested" | "cost-area" };
      /**
       * The power change this choice is about to apply to the card it names,
       * when that is the whole of what the choice does.
       *
       * The same gap `grants` and `donGift` close, for the commonest battle
       * clause in the format: "give up to 1 of your opponent's Characters
       * -2000 power during this battle". A `mechanic-choice` over the
       * opponent's board says nothing about what choosing does, so the
       * generic fallback named the *strongest* opposing Character -- which is
       * the right target for a K.O. and the wrong one for a debuff paid to
       * decide the battle in front of the chooser. OP17-058 Kaido's seat put
       * its DON!! -1 on a card outside the battle in 232 of 340 offers.
       *
       * Present only for a choice whose effect is the power change itself.
       */
      modifiesPower?: { amount: number; expiresThisTurn: boolean };
      /**
       * Where the card this option names is about to go, when moving it there
       * is the whole of what choosing the option does.
       *
       * The same gap `grants` and `donGift` close, for the commonest choice in
       * the format: a search. "[printed text omitted -- pnpm card:text <card>]" and "trash 1 card from your deck" are both a
       * `mechanic-choice` naming a card in `zone: "deck"`, and nothing else on
       * the action told them apart -- so a policy could not order the first
       * without also reordering the second, where the ranking is inverted.
       *
       * `player` is relative to the deciding player, like `option.owner`.
       * `"owner"` is the DSL's "return it to whoever controls it", which is not
       * resolved to a side until the move runs.
       *
       * Set only for a choice whose effect is that one move. A move buried in a
       * longer sequence is not summarised here, because then the choice is about
       * the rest of it too -- the same containment `grants` documents.
       *
       * Read by `isSearchResult` in `agents/rules/generic-policy.ts`, which is
       * the test the five deck policies that answer a search now share.
       */
      destination?: {
        zone: CardZoneName;
        player: "self" | "opponent" | "owner";
      };
      /**
       * What accepting this option pays, when the option is the acceptance of
       * an optional cost -- "you may DON!! −1: …", "you may trash 1 card from
       * your hand: …". Set on the `apply` option only; declining costs nothing.
       * See {@link ActionCost}.
       */
      cost?: ActionCost;
      /**
       * What accepting this option does past its cost, when the option is the
       * acceptance of an optional prompt. Set on the `apply` option only, and
       * only where the prompt does something: sorted and without repeats. See
       * {@link PayoffKind}.
       */
      payoff?: readonly PayoffKind[];
      /**
       * DON!! accepting this option would add from the DON!! deck, when adding
       * it is the *whole* of what accepting buys.
       *
       * The payoff to {@link cost}'s price, and set on the `apply` option only,
       * for the same reason. Stricter than `activate-main.ramps`, which counts a
       * DON!! add anywhere inside a program: this is set only when nothing else
       * happens, so a caller may decline on it alone without discarding a draw
       * or a K.O. sitting in the same sequence.
       *
       * The DON!! deck holds ten cards and no more can be on the field, so a
       * long game reaches a point where these DON!! provably cannot arrive and
       * the prompt is a cost with nothing behind it. `self.donDeckCount` is the
       * other half of that reading.
       */
      ramps?: { active: number; rested: number };
      summary: string;
    }
  | {
      actionId: string;
      type: "attach-don";
      targetInstanceId: string;
      summary: string;
    }
  | {
      actionId: string;
      type: "activate-main";
      optionId: string;
      /**
       * The card whose ability this activates.
       *
       * `optionId` is opaque by contract, so without this a policy could only
       * tell one Main activation from another by parsing the id or matching on
       * summary text -- which is exactly what `EffectOption` was added to stop
       * for `resolve-effect`. Purple Enel made the gap load-bearing: it runs
       * twenty-one Events, all offered as `activate-main`, and a pilot that
       * cannot identify them burns its whole hand every turn for nothing.
       *
       * Required: every activation the engine offers names its source, so a
       * policy never has to fall back to parsing `optionId`. Leader abilities
       * name the Leader, Stage abilities the Stage.
       */
      sourceCardNumber: string;
      sourceInstanceId: string;
      /**
       * The card the ability is aimed at, when the activation names one.
       *
       * Several Main abilities encode a target in the `optionId` -- ST33's
       * Zephyr, ST36's Drake, ST31's Leader gift. Without this a policy has to
       * split the id apart to rank those targets, which is the parsing the
       * opaque-id contract exists to prevent.
       */
      targetInstanceId?: string;
      /** Numeric choice carried by the activation, such as DON!! granted. */
      amount?: number;
      /**
       * Which end of a zone the ability acts on, when it offers the choice.
       *
       * ST36-005's Main ability is offered once for the top Life card and once
       * for the bottom; they are different decisions, and telling them apart
       * otherwise means reading the summary text.
       */
      position?: "top" | "bottom";
      /**
       * Set when every card selection this activation makes would find nothing,
       * so resolving it pays the cost and changes nothing else.
       *
       * An "up to N" clause is legal to activate whatever the board looks like
       * -- 8-4-4-1 lets a player choose 0 -- so the engine offers a `[Main]`
       * program whose only effect is a selection even with no candidate for it.
       * Nothing else on this action says so: `sourceCardNumber` identifies the
       * card, and reading whether its clause can land means re-implementing the
       * selector per card. Five decks each grew a rule doing exactly that
       * before this existed.
       *
       * Reported rather than acted on, unlike the bare-gate condition that
       * keeps an activation off this list entirely. A failed gate means the
       * program does nothing either way; an empty selection still pays the
       * cost and still moves an Event out of the hand, which a player may
       * legally want. This says what the activation is, and leaves the choice
       * with the caller.
       *
       * Absent means "not known to be inert", not "does something": it is only
       * ever set for programs built entirely out of selections, which is 104 of
       * the pool's 231 `[Main]` programs.
       */
      selectsNothing?: true;
      /**
       * Rested DON!! this activation gives one of the controller's own cards,
       * when the ability hands DON!! over rather than adding it to the cost
       * area.
       *
       * The same field `resolve-effect` carries, one decision earlier, and it
       * covers two shapes that {@link targetInstanceId} tells apart.
       *
       * **With a target.** OP15-058's `[Activate: Main]` is hard-coded in
       * legal-action generation and names its recipient itself. A rule keyed to
       * `donGift` -- `rested-don-gift`, which scores the gift that turns a body
       * too small to threaten the opposing Leader into one that can -- could
       * not see this ability at all before, and the census reported the module
       * silent for the only deck whose Leader prints the clause. The gift is
       * not the whole of what that action does: it adds DON!! from the DON!!
       * deck as well (see {@link ramps}), which is worth taking even when the
       * gift lands nowhere useful.
       *
       * **Without one.** An ability written as "<price>: give 1 rested DON!! to
       * 1 of your Characters" compiles to a `give-rested-don` node that picks
       * its recipient when it resolves, so the recipient is genuinely not
       * decided yet and no target is reported. Here the gift *is* the whole
       * payoff -- `programRestedDonGift` reports nothing otherwise -- and the
       * price has already been paid by the time the recipient choice is
       * offered. OP16-021 Moby Dick trashes itself for its gift, so the
       * activation is the only point at which declining still saves the Stage.
       *
       * A rule that declines on `donGift` alone must therefore check both:
       * {@link ramps} for what else the action buys, and
       * {@link targetInstanceId} for whether the recipient is already settled.
       *
       * `priced` says the program charges for the gift -- it rests the source,
       * or takes it off the field. It is the difference between a decision and
       * a formality: an unpriced gift that lands nowhere useful has cost
       * nothing, so taking it and leaving it are worth the same, while
       * OP16-021 Moby Dick's costs the Stage and is worth refusing. Absent for
       * the gift that is free, and for OP15-058, whose costs are the
       * conditions on the ability rather than steps of the program.
       */
      donGift?: {
        count: number;
        from: "active" | "rested" | "cost-area";
        priced?: true;
      };
      /**
       * The keyword this activation exists to hand out, when that is the whole
       * of what it does.
       *
       * The same summary `resolve-effect` carries, one step earlier. There it
       * answers "which card should take this grant"; the activation is where
       * the prior question lives -- whether to pay for the grant at all -- and
       * by the time the `resolve-effect` version is offered the Event is cast
       * and its cost is spent. A keyword read only by an attack is worth
       * nothing on a turn with no attack to read it, and `expiresThisTurn` is
       * what makes that unrecoverable rather than early.
       *
       * Present only for an activation whose entire effect is the grant. Five
       * of the pool's seven keyword-granting `[Main]` programs also draw, pump
       * or ramp, and those are worth casting for the rest of the card.
       */
      grants?: { keyword: string; expiresThisTurn: boolean };
      /**
       * What the activation pays beyond its printed DON!! cost: an Event's
       * `DON!! −N`, its "rest N DON!!", its "trash N cards from your hand".
       * Absent when the activation pays nothing but DON!! from the active
       * pool. See {@link ActionCost}.
       */
      cost?: ActionCost;
      /**
       * DON!! this activation adds from the DON!! deck, by posture, when the
       * program says so.
       *
       * The other half of the price: an activation that adds *active* DON!!
       * and costs nothing funds the plays that come after it, so it belongs
       * before them -- which is the one ordering `chooseGenericRules` gets
       * backwards for a ramp deck, and the reason Kaido's policy vetoed every
       * play while King's activation was on offer. Read together with
       * {@link cost}, a rule can say "take the free ramp first" about any card
       * rather than about King.
       *
       * Rested DON!! is reported too, because it is on the field for the
       * clauses that count the field, but it cannot pay for anything this turn.
       * Absent when the program adds no DON!!, or when it cannot be read off
       * the program.
       */
      ramps?: { active: number; rested: number };
      summary: string;
    }
  | {
      actionId: string;
      type: "attack";
      attackerInstanceId: string;
      targetInstanceId: string;
      /**
       * The declaration arithmetic for this attack, as the engine would freeze
       * it if the attack were declared now.
       *
       * `attackPower` is the attacker's current power including given DON!!;
       * `targetPower` is the target's defence before Blockers and Counters;
       * `counterShortfall` is the Counter power the defender must still add to
       * survive, 0 when the attack already fails. `unspentActiveDon` is the
       * active DON!! the attacker would leave behind: attack power is captured
       * at declaration, so DON!! given afterwards cannot raise a live attack,
       * and a Leader that has attacked is rested for the rest of the turn.
       *
       * `attackerIsBlocker` is the other half of that cost: declaring rests the
       * attacker, and a rested card cannot block, so attacking with a Blocker
       * sells the defence for the opponent's next turn. An LLM run swung a 6000
       * Blocker into a 7000 Leader at 1 Life on the theory that a failed attack
       * still taxes the defender's hand -- it does not, and the only thing that
       * decision changed was that the Blocker was rested when the turn passed.
       *
       * `attackerIsLeader` is the case where that cost does not exist at all: a
       * Leader can never block and remains a legal attack target whether rested
       * or active, so resting it by declaring gives up nothing. A run held a
       * Leader back from a sure-fail swing at an OP11-041 Leader's 7000
       * effective defense as if the same cost applied -- it does not, and
       * passing only threw away the free chance the defender lacked the card
       * to pay for the ability, or misplayed and let the attack through.
       *
       * `effectiveTargetPower` is `targetPower` plus any defensive ability the
       * defender still holds and has not paid for -- an OP11-041 Leader that
       * can still discard for +2000 defends at 7000, not 5000. `targetPower`
       * and `counterShortfall` describe the board as it stands right now, so
       * against such a Leader they call an attack a hit that the ability alone
       * turns away. `effectiveTargetPower` is the number to plan *this* attack
       * against; it equals `targetPower` whenever nothing is pending.
       *
       * How long the boost lasts is a separate question the summary answers,
       * because it decides what the *next* attack this turn meets: OP11-041's
       * +2000 is printed "during this turn" and every later attack meets it too,
       * while OP11-062 Katakuri's +1000 is printed "during this battle" and the
       * attack after it faces the unraised number again.
       *
       * `donToReach` closes the loop on an attack that currently fails: it is
       * how many active DON!! this attacker must be given for its power to
       * reach `effectiveTargetPower` -- the attacker wins ties, so reaching is
       * hitting -- and it is present only while the attack does fail. `counterShortfall === 0` tells a policy an attack is worth
       * nothing; it does not tell it the attack is one DON!! away from being
       * worth something, and an LLM run repeatedly spent its whole DON!! pool
       * on bodies that could not attack yet while a 4000 Character sat idle in
       * front of a 5000 Leader -- one DON!! short, every turn, for four turns.
       * Read together with `unspentActiveDon`: the attack is reachable this
       * turn only when `donToReach <= unspentActiveDon`.
       *
       * A policy that had to derive these from the two power fields of the
       * observation kept declaring attacks before the pumps that would have
       * won them. Optional only because test fixtures build attack actions by
       * hand; every attack action the engine offers reports all of them.
       */
      attackPower?: number;
      targetPower?: number;
      effectiveTargetPower?: number;
      counterShortfall?: number;
      donToReach?: number;
      /**
       * `donToReach` measured against `targetPower` instead: what it takes to
       * win this battle as the board stands, before any unpaid defensive
       * ability is priced in.
       *
       * Both exist because they answer different questions, and which one a
       * caller wants was measured rather than argued. `donToReach` is the
       * number for "can I beat everything they still hold"; this is the number
       * for "is this lift worth buying at all", and a policy that spent DON!!
       * only on lifts clearing the *effective* number -- declining to buy one
       * the defender could turn away -- lost 9.5pt against ST34 Katakuri, whose
       * Leader raises its own defence for a card, and gained nothing overall.
       * Making the defender spend that card is worth more than holding the
       * swing back; it is the same lesson `legal-actions/main.ts` records for a
       * Leader declining a sure-fail swing.
       *
       * Present under the same condition as `donToReach`: only while the attack
       * falls short of the number it is measured against.
       */
      donToWinBattle?: number;
      unspentActiveDon?: number;
      attackerIsBlocker?: boolean;
      attackerIsLeader?: boolean;
      summary: string;
    }
  | {
      actionId: string;
      type: "block";
      blockerInstanceId: string;
      summary: string;
    }
  | {
      actionId: string;
      type: "counter";
      cardInstanceId: string;
      /**
       * The power this card adds to the defense if played -- its printed
       * Counter stat plus any static layer granting a card in hand more, which
       * is what `handCounterPower` prices and what the observation reports as
       * `currentCounter`.
       *
       * `summary` states the same number in prose alongside the running
       * total and shortfall, but only as a sentence -- a plan that commits
       * several of these in one response had to add them up itself, and a
       * 2000 Usopp plus a 1000 Jinbe was accepted one short of the 3001 a
       * 3000-power Zoro needed against a 6000 attack. The Character died with
       * both cards spent for nothing; either had been free to keep instead.
       * This field is the exact number a caller sums to check a plan before
       * it is spent, without re-deriving it from the sentence. Optional only
       * because test fixtures build counter actions by hand; every counter
       * action the engine offers reports it.
       */
      counterPower?: number;
      /**
       * The Leader or Character the Counter power goes to, when it is not the
       * card being attacked. Absent means the defender, which is every offer
       * the Counter step made before this field existed and still the first
       * offer for each card.
       *
       * A Character card's Counter may raise any of the defending player's
       * Leader or Character cards for the rest of the battle (Bandai rules
       * Q&A, Keywords #4). Those offers come after every other Counter-step
       * offer, so the defender's list reads as it did with them left out; the
       * shipped agents leave them out (`withoutAsideCounters`).
       */
      targetInstanceId?: string;
      summary: string;
    }
  | {
      actionId: string;
      type: "activate-counter-event";
      eventInstanceId: string;
      /**
       * Which Event this is.
       *
       * The same field, for the same reason, that `activate-main` carries: a
       * policy choosing between two [Counter] Events is choosing between two
       * printed clauses, and without this the only ways to tell them apart were
       * to parse the summary text or to look `eventInstanceId` up in the hand.
       * `chooseGenericCounter` did the latter and `op16-enel-policy.ts` records
       * the same gap on the `[Main]` half, where the fix was this field.
       *
       * It matters wherever two Events cost the same and are not worth the same.
       * Purple Enel holds four such: Varie, El Thor and Lightning Beast Kiten
       * spend a card for +2000, while Mamaragan reads "[printed text omitted -- pnpm card:text <card>]" -- which under this Leader's six-card DON!!
       * deck always draws, making it the one Counter in the deck that replaces
       * itself. `counterPower` alone ranks it *last* of the four.
       */
      sourceCardNumber: string;
      /**
       * The power this Event adds to the defense if played, or omitted when
       * the Event's Counter power is decided as it resolves rather than
       * fixed up front (see `counter.counterPower` for why this is exposed).
       */
      counterPower?: number;
      summary: string;
    }
  | {
      actionId: string;
      type: "resolve-trigger";
      optionId: string;
      /**
       * The Life card whose [Trigger] is being decided.
       *
       * Without this the decision is blind. A Trigger offers "activate" against
       * "add this card to hand", and which is better depends entirely on what
       * the card does -- but `optionId` is an opaque target id and `summary` is
       * display text, so a policy had no way to tell one Trigger from another.
       * `chooseGenericTrigger` consequently activated whatever came first, which
       * threw away a [Counter] Event to apply a "during this turn" debuff on a
       * turn where the opponent had no attacks left.
       *
       * The card number is already in `cardFacts` -- `visibleCardNumbers`
       * includes the pending Trigger -- so this is the missing join key, not new
       * information. Same reasoning as `activate-main.sourceCardNumber`.
       */
      sourceCardNumber: string;
      /**
       * The unit this offer aims the [Trigger] at, when the offer names one.
       *
       * A [Trigger] that targets raises one offer per candidate, and which
       * candidate is chosen is a separate question from whether to activate at
       * all. `optionId` carries the instance id today, but it is opaque by
       * contract -- it is `"skip"` and `"activate"` on the other offers -- so a
       * policy comparing targets had nothing typed to read and took the first
       * one the board happened to produce. Same missing join key, and the same
       * reasoning, as `sourceCardNumber` above.
       *
       * Absent on `skip` and on the untargeted `activate` offer.
       */
      targetInstanceId?: string;
      /**
       * Every selection this [Trigger] would make finds nothing, so activating
       * it resolves no effect at all.
       *
       * The same fact `activate-main.selectsNothing` reports, asked of the
       * Trigger program instead. An "up to 1" clause is legal whatever the
       * board holds, so `triggerProgramCanAct` offers a `min: 0` selection
       * without asking whether it has a candidate -- and a Trigger that
       * resolves nothing costs strictly more than declining it, because
       * activating sends the card to the trash where declining puts it in hand.
       *
       * Reported rather than used to withhold the offer, for the reason
       * `activate-main` gives and one more: "when a [Trigger] activates"
       * clauses (OP13-106 Conney) read the activation itself, so an empty
       * selection can still be the right line and the choice stays with the
       * caller.
       *
       * Absent means "not known to be inert". Only ever set on the `activate`
       * option of a Trigger with a mechanic program, never on `skip`, so a
       * caller vetoing every action carrying it always has an option left.
       */
      selectsNothing?: true;
      /**
       * Activating resolves to nothing but a power boost on one of the
       * resolving player's own cards, expiring at the end of this turn.
       *
       * The defender-side companion of the fact the `summary` already states
       * for an attacker-side debuff ("it cannot attack this turn"). Such a
       * boost is defence, and defence is worth nothing once the attacker has
       * no attack left to make -- at which point activating trashes a card
       * that declining would put in hand.
       *
       * A fact, not a verdict: whether an attack is left is a board reading
       * and stays with the caller. Absent means "not known to be only a
       * self-buff", and it is never set on `skip`.
       */
      selfPowerForTheTurn?: true;
      /**
       * DON!! activating this [Trigger] would add from the DON!! deck, when
       * adding it is the *whole* of what activating buys.
       *
       * The same fact `resolve-effect.ramps` reports, one zone earlier, and
       * the earlier one is the one that is worth anything: the optional inside
       * the Trigger is only offered after the card has left the Life area for
       * the trash, so declining *there* saves nothing. Here declining puts the
       * card in hand instead, which is why an add that provably cannot happen
       * -- `self.donDeckCount` is the other half of the reading -- makes
       * activating strictly worse than skipping.
       *
       * A fact, not a verdict, and never set on `skip`, so a caller vetoing
       * every action that carries it always has an option left.
       */
      ramps?: { active: number; rested: number };
      summary: string;
    }
  | {
      actionId: string;
      type: "pass";
      /**
       * A compact audit of actions and active DON!! that disappear when the
       * turn ends. These counts do not claim every listed action is good; they
       * make a decision to pass acknowledge what it is declining.
       */
      unspentActiveDon?: number;
      availablePlayCount?: number;
      availableActivationCount?: number;
      eligibleAttackCount?: number;
      summary: string;
    };

/**
 * A restriction an effect writes onto a *player* rather than onto one card --
 * "your opponent cannot play Characters during this turn" and its siblings.
 *
 * It lives here rather than in the engine because {@link PublicEvent}'s
 * `player-restricted` reports it, and the engine's own `restrict-player` node
 * reads this same union, so the announcement and the rule cannot drift apart.
 */
export type PlayerRestriction =
  | "cannot-play-characters"
  /**
   * "[printed text omitted -- pnpm card:text OP12-030]" --
   * OP12-099 Kalgara, which pays for its own draw with it.
   */
  | "cannot-draw-by-effect"
  /**
   * "[printed text omitted -- pnpm card:text OP12-099]" -- OP13-028
   * Shanks. Wider than `cannot-play-characters`: an Event or a Stage is
   * barred too, which is what makes a ten-DON!! refund survivable.
   */
  | "cannot-play-from-hand"
  /**
   * "[printed text omitted -- pnpm card:text OP13-028]" -- OP10-030 Smoker's own price for the DON!! it just set
   * active. Read by the `activate-don` node, which is the only way a
   * Character effect sets DON!! active in the declarative path.
   */
  | "cannot-activate-don-by-character"
  /**
   * "Your opponent's [On Play] effects are negated until the end of your
   * opponent's next turn" -- OP09-081 Marshall.D.Teach's Leader.
   *
   * A player-scoped negation, which `negate` cannot express: that node
   * switches off one card already on the field, and this one has to reach
   * every Character its target has not played yet.
   */
  | "on-play-negated"
  /**
   * "…this Leader cannot attack your opponent's Characters with a base
   * cost of N or less during this turn" -- OP12-020 Roronoa Zoro, the
   * price of setting itself active again.
   *
   * Written as a player restriction rather than as a `restrict` on a binding
   * because `restrict` needs a `BoardCard` to write the flag onto and a Leader
   * has none. It is also not a ban: the Leader may still attack the
   * opposing Leader, and a Character above the ceiling, so `maxBaseCost`
   * is what the restriction is *about* rather than a refinement of it.
   */
  | "leader-cannot-attack-characters"
  /**
   * "…you cannot attack a Leader during this turn" -- OP06-026
   * Koushirou's price for setting one of its own Characters active.
   *
   * The mirror of `leader-cannot-attack-characters` above: that one
   * restricts one attacker and leaves every target but Characters open,
   * and this one restricts every attacker and closes one target.
   */
  | "cannot-attack-leaders"
  /**
   * "…you cannot add Life cards to your hand using your own effects
   * during this turn" -- the OP06-020 Hody Jones Leader's own price.
   *
   * Enforced in the node that would do the moving, which is where
   * `cannot-draw-by-effect` is enforced too: every declarative clause
   * that adds a Life card to a hand is a `move` out of the Life area, so
   * one gate catches all of them.
   */
  | "cannot-life-to-hand";

export type PublicEvent =
  | { type: "game-created"; activePlayer: PlayerId }
  | {
      type: "mulligan-decided";
      playerId: PlayerId;
      decision: "keep" | "mulligan";
    }
  | { type: "setup-complete"; activePlayer: PlayerId }
  | {
      type: "card-played";
      playerId: PlayerId;
      cardInstanceId: string;
      cardNumber: string;
    }
  | {
      /**
       * A card changing zones. Life is the reason this event is generic rather
       * than a `life-added`/`life-taken` pair: the same effect text moves a card
       * from a deck, a hand, or the board into Life and back out again, and a
       * log that only named one direction left the other half of the step
       * invisible.
       */
      type: "card-moved";
      /** Owner of the card, which is not always the player who moved it. */
      playerId: PlayerId;
      /**
       * Both `null` when this viewer is not entitled to the card's identity. A
       * face-down Life card moving into its owner's hand is a private gain, so
       * `observe` redacts rather than dropping the event: both players still see
       * that a card moved, only which card is held back.
       *
       * The instance id is redacted alongside the number because it is a deck
       * position, and leaving it in would let a viewer follow one hidden card
       * from zone to zone -- the same leak the Life stack itself avoids by
       * publishing face-down slots as bare placeholders.
       */
      cardInstanceId: string | null;
      cardNumber: string | null;
      from: CardZoneName;
      to: CardZoneName;
      /** Which end of an ordered zone (`deck`, `life`) the card entered. */
      position?: "top" | "bottom";
      /** Orientation the card comes to rest in, for Life placed face-up. */
      faceUp?: boolean;
      /** Card whose effect moved it; absent when the rules did (damage, setup). */
      sourceCardNumber?: string;
      /** Set when only this player may read `cardNumber`. */
      identityVisibleTo?: PlayerId;
    }
  | {
      /**
       * A Life card turned over in place -- Kid's Leader and Wyper pay costs by
       * flipping one face-up, and Kid's redirect turns one back face-down. The
       * card does not move, but its identity becomes public or stops being
       * public, so it is a step both players need to see.
       */
      type: "life-flipped";
      playerId: PlayerId;
      cardInstanceId: string;
      /** Null when turning face-down: the card stops being public knowledge. */
      cardNumber: string | null;
      faceUp: boolean;
      position: "top" | "bottom";
      sourceCardNumber?: string;
    }
  | {
      type: "character-ko";
      playerId: PlayerId;
      cardInstanceId: string;
      cardNumber: string;
      sourceCardNumber: string;
    }
  | {
      type: "character-trashed";
      playerId: PlayerId;
      cardInstanceId: string;
      cardNumber: string;
      reason: "character-area-limit";
    }
  | {
      type: "character-rested";
      playerId: PlayerId;
      cardInstanceId: string;
      cardNumber: string;
      sourceCardNumber: string;
    }
  | {
      type: "don-attached";
      playerId: PlayerId;
      targetInstanceId: string;
      count: number;
      /**
       * The card whose effect gave the DON!!, when one did. Absent for the
       * player attaching their own DON!! in the Main phase, which no card
       * caused.
       *
       * Carried because the readers that group an ability's steps under the
       * card that caused them treat a step naming no source as the end of the
       * group -- attribution they cannot check is attribution they will not
       * claim. Without it OP15-058 Enel's gift of four DON!! fell off the end
       * of its own Leader's report.
       */
      sourceCardNumber?: string;
    }
  | {
      type: "don-activated";
      playerId: PlayerId;
      count: number;
      sourceCardNumber: string;
    }
  /**
   * DON!! moved onto the field out of the DON!! deck by a card effect, as
   * distinct from `don-activated`'s "set DON!! you already have as active".
   *
   * Emitted so ramp is visible at all. Without it a DON!!-ramp deck's whole
   * plan happened between events -- and, worse, `triggerProgramCanAct`
   * dry-runs a Trigger and offers it only if it produced an event or a signal,
   * so a `[Trigger]` whose only clause is "add 1 DON!! card" was judged inert
   * and never offered. OP10-079 God Thread and OP10-080 Little Black Bears
   * both print exactly that and had never once fired.
   */
  | {
      type: "don-added";
      playerId: PlayerId;
      count: number;
      rested: boolean;
      sourceCardNumber: string;
    }
  /**
   * DON!! sent from a player's own field back to their DON!! deck: the `DON!!
   * −N` half of a cost, and the whole plan of a Purple deck.
   *
   * Emitted so the payment is visible at all. `returnDonToDeck` moved the
   * cards and told no one -- not the history drawer, not
   * an exported trace, which recorded the decision that paid the cost with an
   * empty event list. A player who returned two DON!! to OP09-070 Nami and got
   * two back from OP09-061's Leader refund could see the second half happen
   * and never the first, which is the half that bought it.
   *
   * No pools are named. The cheapest DON!! are taken the moment the cost is
   * paid and `offerDonReturnChoice` re-homes them afterwards from the
   * controller's answer, so where each one came from is not settled yet when
   * this is emitted -- and a count that later moved between pools would be a
   * record of the engine's guess rather than of the player's choice.
   */
  | {
      type: "don-returned";
      playerId: PlayerId;
      count: number;
      sourceCardNumber: string;
    }
  | {
      type: "stage-played";
      playerId: PlayerId;
      cardInstanceId: string;
      cardNumber: string;
    }
  /**
   * A restriction written onto a *player*: "your opponent cannot play
   * Characters during this turn", or "your opponent's [On Play] effects are
   * negated until the end of their next turn" -- OP09-081 Marshall.D.Teach's
   * Leader.
   *
   * Emitted so the clause is visible at all. `restrict-player` set its flag on
   * the player and told no one, so the whole of Marshall.D.Teach's
   * `[Activate: Main]` reached the other seat as the discard that paid for it:
   * a card going to the trash for no stated reason, followed for two turns by
   * `[On Play]` effects that quietly did nothing. Every one of the eight
   * restrictions is a rule the restricted player has to play around, and not
   * one of them was announced.
   *
   * `playerId` is who is restricted, not who did it -- the two are the same
   * only for the clauses a card charges itself.
   *
   * Public in both directions, exactly as the observation's own
   * `onPlayNegated` is: these clauses are announced when they are paid.
   */
  | {
      type: "player-restricted";
      playerId: PlayerId;
      restriction: PlayerRestriction;
      /** The last turn number the restriction is still in force on. */
      untilTurn: number;
      /** The printed-cost floor the restriction carries, where it has one. */
      minBaseCost?: number;
      /** The printed-cost ceiling the restriction carries, where it has one. */
      maxBaseCost?: number;
      sourceCardNumber: string;
    }
  | {
      type: "attack-declared";
      playerId: PlayerId;
      attackerInstanceId: string;
      targetInstanceId: string;
      power: number;
    }
  | {
      type: "attack-blocked";
      playerId: PlayerId;
      blockerInstanceId: string;
    }
  /**
   * An attack whose target was changed by an effect rather than by a [Blocker]
   * -- OP16-080 Marshall.D.Teach and OP14-060 Donquixote Doflamingo.
   *
   * Separate from `attack-blocked` because nothing rests, the new target may be
   * a Leader, and a log that called it a block reported a blocker the defender
   * never had.
   */
  | {
      type: "attack-redirected";
      playerId: PlayerId;
      targetInstanceId: string;
      sourceCardNumber: string;
    }
  | {
      type: "battle-resolved";
      attackerPlayerId: PlayerId;
      defenderPlayerId: PlayerId;
      targetInstanceId: string;
      attackPower: number;
      defensePower: number;
      outcome: "defended" | "character-ko" | "damage" | "game-win";
    }
  | {
      type: "counter-used";
      playerId: PlayerId;
      cardNumber: string;
      power: number;
      /**
       * Set only when the Counter went to a card other than the one being
       * attacked; see the `counter` action's field of the same name.
       */
      targetInstanceId?: string;
    }
  | {
      type: "event-activated";
      playerId: PlayerId;
      cardNumber: string;
      /**
       * Another card's effect used this Event's `[Main]` (EB03-031 Reiju): the
       * effect resolved, but the Event was not activated, so no "when you
       * activate an Event" clause answers it.
       */
      mainOnly?: true;
    }
  /**
   * An ability that fired on its own: a Leader's or a Character's automatic
   * clause answering something that happened, rather than a card the player
   * chose to play or activate.
   *
   * Emitted so the *cause* is visible. The clause's own steps are already
   * reported and carry this card as their `sourceCardNumber`, but nothing said
   * that they happened without anyone asking for them -- and a player who paid
   * a `DON!! −N` and then found two DON!! back on the field had no step
   * anywhere saying their Leader had done it (OP09-061 Monkey.D.Luffy, whose
   * refund is the whole plan of the ST-26 deck).
   *
   * Raised for a clause that went on to do something, and never for a clause
   * the player reached by playing or activating the card itself. The one
   * clause announced without steps behind it is flagged `noEffect`.
   */
  | {
      type: "ability-triggered";
      /** Controller of the ability, which is not always whose turn it is. */
      playerId: PlayerId;
      sourceCardNumber: string;
      /** `${playerId}-leader` for a Leader, the board instance otherwise. */
      sourceInstanceId: string;
      /**
       * A `[Once Per Turn]` clause fired and had nothing to do -- OP08-067
       * Charlotte Pudding with no DON!! left in the DON!! deck to add. Said
       * because its use for the turn is spent regardless: without this line a
       * player sees nothing and expects it to answer the next trigger.
       */
      noEffect?: true;
    }
  /**
   * An ability the player reached by activating the card: an `[Activate:
   * Main]`, which on a Leader is the only ability it has.
   *
   * The clicked twin of `ability-triggered`, and emitted for the same reason.
   * A played Character announces itself with `card-played` and is then visibly
   * on the board, but a Leader never moves, so an activation that set DON!!
   * active or took a turn's plays away changed the board with nothing at all
   * saying which card had done it. OP14-020 Dracule Mihawk and OP15-058 Enel
   * are the shipped Leaders this covers.
   *
   * Raised on the action the clause's steps land on, not on the click: an
   * ability that stops to ask which card pays its cost resolves on the answer,
   * and a marker left behind at the click would name a cause whose effects had
   * not happened yet. Like `ability-triggered` it is only raised for a clause
   * that went on to do something -- here that also keeps the panel off a click
   * the player made and can already see the result of.
   */
  | {
      type: "ability-activated";
      /** Controller of the ability, which is not always whose turn it is. */
      playerId: PlayerId;
      sourceCardNumber: string;
      /** `${playerId}-leader` for a Leader, the board instance otherwise. */
      sourceInstanceId: string;
    }
  | {
      type: "power-changed";
      playerId: PlayerId;
      targetInstanceId: string;
      amount: number;
      expiresAtTurn: number;
      sourceCardNumber?: string;
      sourceInstanceId?: string;
    }
  /**
   * A Leader or Character whose *base* power was replaced for a while.
   *
   * Separate from `power-changed` because the printed figure is what moved,
   * not a modifier stacked on top of it: OP16-015 Monkey.D.Luffy's Leader
   * "becomes 7000" whether the Leader was printed at 5000 or has since been
   * debuffed, and a reader told "+2000 power" would be told the wrong thing.
   * The two arrive together when a card sets one side and lifts the other.
   */
  | {
      type: "base-power-set";
      playerId: PlayerId;
      /** `${playerId}-leader` for a Leader, the board instance otherwise. */
      targetInstanceId: string;
      /** The base power this effect set, through `expiresAtTurn`. */
      basePower: number;
      /**
       * The base the target is at instead, when a higher "becomes" effect
       * already in force outranks this one (Comprehensive Rules 4-9-2-1: the
       * highest value applies). Absent when `basePower` is what the target now
       * uses. The outranked setter is still held, and applies if the higher
       * one lapses first.
       */
      outrankedBy?: number;
      expiresAtTurn: number;
      sourceCardNumber?: string;
      sourceInstanceId?: string;
    }
  | {
      type: "attack-prevented";
      playerId: PlayerId;
      targetInstanceId: string;
      targetCardNumber: string;
      expiresAtTurn: number;
      sourceCardNumber: string;
    }
  | {
      /**
       * A rested Character kept from standing up through `expiresAtTurn`.
       *
       * Its own step for the same reason as `attack-prevented`: nothing else in
       * the log says why a Character that should have stood up in the Refresh
       * Phase is still rested a turn later. `playerId` is the owner of the
       * Character, not the player whose card did it.
       */
      type: "refresh-prevented";
      playerId: PlayerId;
      targetInstanceId: string;
      targetCardNumber: string;
      expiresAtTurn: number;
      sourceCardNumber: string;
    }
  | {
      /**
       * An active Character barred from being rested through `expiresAtTurn`.
       *
       * Its own step for the same reason as `attack-prevented`: a Character
       * that cannot be rested cannot attack and cannot use its [Blocker], so
       * it sits on the board with no legal action and nothing in the log to
       * say why. `playerId` is the owner of the Character, not the player
       * whose card did it.
       */
      type: "rest-prevented";
      playerId: PlayerId;
      targetInstanceId: string;
      targetCardNumber: string;
      expiresAtTurn: number;
      sourceCardNumber: string;
    }
  | {
      /**
       * A keyword an effect handed a card, in force through `expiresAtTurn`.
       *
       * Its own step because a grant leaves no other trace: the card's printed
       * text is unchanged, no power moved, and nothing rested. The step this
       * was added for is OP16-001 Ace giving a Character [Rush] -- from the
       * other seat, a Character simply attacked on the turn it was played and
       * the log had not one line to say why.
       *
       * `playerId` owns the card that gained the keyword, the same convention
       * `attack-prevented` and `effect-negated` follow.
       */
      type: "keyword-granted";
      playerId: PlayerId;
      targetInstanceId: string;
      targetCardNumber: string;
      keyword: GrantableKeyword;
      expiresAtTurn: number;
      sourceCardNumber: string;
    }
  | {
      /**
       * A Leader or Character was let attack the opponent's active Characters,
       * not only rested ones, through `expiresAtTurn`.
       *
       * The twin of `keyword-granted` for a permission that is not a keyword:
       * without it the clause writes a turn flag and nothing else, so the
       * other seat saw an attack on an active Character with no line to say
       * why. `playerId` owns the card that gained it.
       */
      type: "attack-active-granted";
      playerId: PlayerId;
      targetInstanceId: string;
      targetCardNumber: string;
      expiresAtTurn: number;
      sourceCardNumber: string;
    }
  | {
      type: "damage-taken";
      playerId: PlayerId;
      lifeRemaining: number;
    }
  | {
      /**
       * A Character's own printed effects switched off through `expiresAtTurn`.
       *
       * Its own step because negation is invisible in every other one: the
       * Character keeps its printed power and text on the board, and only the
       * absence of an ability the opponent was counting on shows it.
       */
      type: "effect-negated";
      playerId: PlayerId;
      targetInstanceId: string;
      targetCardNumber: string;
      expiresAtTurn: number;
      sourceCardNumber: string;
    }
  | {
      type: "cards-drawn";
      playerId: PlayerId;
      count: number;
      /**
       * Card whose effect drew. Absent for the draw phase. Without it a Leader's
       * passive draw is indistinguishable from an ordinary turn draw in the log,
       * which is exactly how OP11-041 Nami's trigger went unnoticed.
       */
      sourceCardNumber?: string;
    }
  | {
      type: "card-revealed";
      playerId: PlayerId;
      cardNumber: string;
      sourceCardNumber: string;
      /**
       * Set when the reveal is a private look rather than a public reveal.
       * Only this player sees the event in their observation. Omitted means
       * the reveal is public and both players see it.
       */
      visibleTo?: PlayerId;
    }
  | {
      type: "characters-refreshed";
      playerId: PlayerId;
      cardInstanceIds: string[];
    }
  | { type: "turn-ended"; playerId: PlayerId; nextPlayerId: PlayerId }
  /**
   * Time was called (see `TimeLimit`): this turn is turn 0, and the game is
   * decided when `finalTurn` ends unless something ends it sooner.
   */
  | {
      type: "time-called";
      turn: number;
      turnPlayerId: PlayerId;
      finalTurn: number;
    }
  /**
   * A player was granted an extra turn after the current one -- OP05-119
   * Monkey.D.Luffy. The turn itself arrives as an ordinary `turn-ended` whose
   * `nextPlayerId` is the same seat; this is the moment it was booked.
   */
  | {
      type: "extra-turn-granted";
      playerId: PlayerId;
      sourceCardNumber: string;
    }
  | {
      type: "game-ended";
      winner: PlayerId;
      /**
       * `"card-effect"` is an alternate win condition printed on a card --
       * OP09-118 Gol.D.Roger, which wins outright when the opponent activates
       * a [Blocker] with either player at 0 Life. Neither of the other two
       * describes it: no Life was taken and no deck ran out.
       *
       * `"time"` is a game decided on its time limit (`TimeLimit`).
       */
      reason: "deck-exhaustion" | "life" | "card-effect" | "time";
      /** With `reason: "time"`, the §8.2 procedure that decided it. */
      procedure?: TimeLimitProcedure;
    };

/**
 * Printed keywords, read off card text rather than off board state.
 *
 * `board[].blocker` remains the authority for whether a Character *can block
 * right now*, because that also covers granted Blocker (Kid's Leader, Buggy)
 * and resting. These are the static facts a policy needs *before* the card is
 * on the field: "is the card in my hand a Blocker", "does this attacker have
 * Rush".
 */
export type CardKeyword =
  | "Blocker"
  | "Rush"
  | "Rush: Character"
  | "Banish"
  | "Unblockable"
  /** "[Double Attack] (This card deals 2 damage.)" */
  | "Double Attack";

export type CardCategory = "leader" | "character" | "event" | "stage";

/**
 * The public, printed identity of a card number.
 *
 * Card text is public knowledge in this game: both players may read every card
 * in the format. Exposing it on the observation rather than making policies
 * carry their own tables is what lets a heuristic say "play the highest-power
 * Blocker" instead of naming four card numbers that happen to be Blockers.
 *
 * Only card numbers the viewer can currently see are included, so this adds no
 * hidden information: it answers "what is this card", never "which cards
 * exist".
 */
/**
 * The cost and payout of one printed clause, without quoting it.
 *
 * A label needs three things from a `[Counter]` or an `[On Your Opponent's
 * Attack]` clause: what it costs, how much power it adds this battle, and
 * whether it does anything besides. All three are derived from the text at
 * audit time so no client needs the text to build the label.
 */
export interface ClauseSummary {
  /** The printed cost before the colon, compacted: "Trash 1", "DON!! -1". */
  cost?: string;
  /** The battle power the clause grants for this battle, when it prints one. */
  power?: number;
  /** Whether the clause does anything beyond granting power this battle. */
  hasOtherEffect: boolean;
}

/**
 * What a card's printed text means to the rules, as facts derived once from
 * that text by `pnpm reference:audit` and committed in its place.
 *
 * The printed text is Bandai's copyright and is neither committed nor shipped:
 * the engine, the agents and the deck builders read these fields, and the text
 * itself is an asset a player loads for display. Every field is a fact about
 * the game -- which clauses the card has, what they cost, what they forbid --
 * derived by one function (`deriveRules` in `@one-piece-sim/cards`) so that a
 * card entering the format through the audit needs no second edit.
 */
export interface CardRules {
  /** Printed keywords: `[Blocker]` printed, not "gains [Blocker]". */
  keywords: readonly CardKeyword[];
  /** The largest `[DON!! xN]` the card prints; 0 without one. */
  donRequirement: number;
  /** DON!! deck size a Leader prints; 10 otherwise. */
  donDeckSize: number;
  hasTrigger: boolean;
  /** Prints a `[Counter]` clause. */
  hasCounterEvent: boolean;
  /**
   * Whether the card prints anything in its effect box at all.
   *
   * "A Character card with 6000 power or less and no base effect" is a target
   * filter three EB-03 cards print (EB03-003 Uta, EB03-007 Baccarat, EB03-039
   * Ulti), and "base effect" is the effect box: a card with only a `[Trigger]`,
   * printed in its own field, still has none. Derived rather than asked of the
   * text at runtime, because nothing above the engine holds the words -- the
   * whole reason `CardRules` exists.
   */
  hasPrintedEffect: boolean;
  /**
   * Every printed clause as the coverage gate's unit: timing markers in
   * printed order, then printed keywords as `[Keyword]`, then `static` for
   * untimed text. What `covers()` in `test/support` accepts.
   */
  clauses: readonly string[];
  /**
   * Every distinct bracketed token the effect prints -- markers, keywords,
   * qualifiers such as `[Once Per Turn]`, and referenced card names -- for
   * questions of the form "does this card mention [X] anywhere".
   */
  tokens: readonly string[];
  /** Names the card also answers to: "also treat this card's name as [X]". */
  nameAliases: readonly string[];
  /** "treated as a card with all card names, types, and attributes". */
  identityWildcard: boolean;
  /** "This Leader cannot attack." / "This Character cannot attack." -- the unconditional sentence, full stop included. */
  cannotAttack: boolean;
  /** Mentions "cannot attack" anywhere, conditional restrictions included. */
  mentionsCannotAttack: boolean;
  /** "you do not lose when your deck has 0 cards". */
  survivesEmptyDeck: boolean;
  /** "when your deck is reduced to 0, you win the game instead of losing". */
  winsOnEmptyDeck: boolean;
  /**
   * A type the Leader's own text restricts the whole deck to -- "you can only
   * include {East Blue} type cards in your deck". Empty for every other card.
   */
  deckTypeRestriction: string;
  /**
   * The Event cost a Leader's own text bars from the deck, "Events with a cost
   * of N or more" -- OP13-079 Imu prints 2. Null for every other card.
   */
  deckEventCostLimit: number | null;
  /**
   * The cost a Leader's own text bars every card from the deck at, "cards
   * with a cost of N or more" -- OP12-001 Silvers Rayleigh prints 5. Null for
   * every other card.
   */
  deckCostLimit: number | null;
  /**
   * The type of Stage a Leader plays from its deck at the start of the game --
   * OP13-079 Imu's {Mary Geoise}. Empty for every other card.
   */
  openingStageType: string;
  /** A search this card performs is announced ("reveal"), so its `card-revealed` event is public. */
  searchRevealPublic: boolean;
  /** Per clause marker present, the parts a label needs without the text. */
  clauseSummaries: Readonly<Record<string, ClauseSummary>>;
  /** Copies a deck may hold; 4 unless the card prints otherwise. */
  copyLimit: number;
  /** "can only be used in designated events" -- excluded from constructed play. */
  eventRestricted: boolean;
  /** A [Trigger] that only debuffs an opponent's card for the turn and does nothing durable. */
  triggerIsDeadWeightDebuff: boolean;
  /** A Leader whose DON!!-gated text buys power for "all of your Characters". */
  buffsAllCharacters: boolean;
  /** The `[On K.O.]` clause mentions Life, so K.O.ing it refunds the defender. */
  koClauseMentionsLife: boolean;
  /** Every "+N cost" the card prints, in printed order. */
  costBoosts: readonly number[];
  /** Adds a "DON!! card from your DON!! deck". */
  addsDonFromDonDeck: boolean;
  /** Sealed: an Event whose "if" condition is not about the Leader's identity. */
  eventConditionDependsOnPool: boolean;
  /** Sealed: removes, rests, bounces or bottom-decks something of the opponent's. */
  removalText: boolean;
  /** Sealed: draws, searches or makes the opponent discard. */
  advantageText: boolean;
}

export interface CardFacts {
  cardNumber: string;
  name: string;
  category: CardCategory;
  /** Printed cost. Leaders carry their Life value in this field, as printed. */
  cost: number;
  /** Printed power; 0 for Events. */
  power: number;
  /** Printed Counter value; 0 when the card has none. */
  counter: number;
  colors: readonly string[];
  types: readonly string[];
  attribute: string | null;
  keywords: readonly CardKeyword[];
  /**
   * DON!! that must be attached before the card's own text switches on, from its
   * `[DON!! xN]` condition. Zero when it has none.
   *
   * This is load-bearing for DON!! allocation and cannot be inferred from power.
   * Three of the six Leaders in the format gate an ability this way -- ST31's
   * Luffy at x1, ST35's Sabo at x1, ST32's Zoro at x3 -- and until that DON!! is
   * on the card it is buying an ability, not 1000 power. A heuristic that prices
   * attachments purely by the power they add will happily starve a `[DON!! x3]`
   * Leader forever; `analysis/rules-api-2026-08-07.md` change 4 measures what
   * that costs.
   */
  donRequirement: number;
  /**
   * Size of the controller's DON!! deck, from a Leader that overrides it.
   *
   * Ten unless the card says otherwise. OP15-058 Enel reads "[printed text omitted -- pnpm card:text OP15-058]", and its entire archetype is
   * built on being under that ceiling -- five other cards in its deck check "[printed text omitted -- pnpm card:text OP15-058]". A Leader that rewrites a
   * setup rule has to be readable before setup runs, which is why this is a
   * printed fact rather than engine state.
   */
  donDeckSize: number;
  /** Whether the card has any [Trigger] text, i.e. is live in the Life deck. */
  hasTrigger: boolean;
  /** Whether the card can be played from hand during a Counter step. */
  hasCounterEvent: boolean;
  /** Everything the rules read off the printed text; see {@link CardRules}. */
  rules: CardRules;
  /**
   * The printed text, only when the process has it: a hand-authored record
   * that still carries it, or a text pack the player loaded. Display only --
   * nothing that decides legality may read these.
   */
  effect?: string;
  trigger?: string;
}

/**
 * A card the viewer is entitled to identify, described richly enough that a
 * policy never has to re-encode card text it could have read from here.
 */
export interface KnownCardRef {
  instanceId: string;
  cardNumber: string;
  name: string;
  category: string;
  cost: number | null;
  power: number | null;
  counter: number | null;
}

/**
 * Private information this player has legitimately acquired through an effect.
 *
 * Entries are validated against live state every time an observation is built,
 * so a card that has since been drawn, searched away or buried simply stops
 * being reported rather than going stale.
 */
export interface PlayerKnowledge {
  /** Top of the viewer's own deck, if an effect has shown it to them. */
  ownDeckTop: KnownCardRef | null;
  /** Top of the opponent's deck, if an effect has shown it to the viewer. */
  opponentDeckTop: KnownCardRef | null;
}

export interface PowerModifierObservation {
  amount: number;
  expiresAtTurn: number;
  sourceCardNumber?: string;
  sourceInstanceId?: string;
  /** Lasts until the current battle ends, not to the end of the turn. */
  battleScoped?: true;
}

/**
 * A keyword the engine hands out for a while, as opposed to one a card prints.
 *
 * Printed keywords are read off card text; these are the ones that exist only
 * as turn-scoped board state, which is why nothing on the card says a Character
 * has one.
 */
export type GrantableKeyword =
  | "Unblockable"
  | "Blocker"
  | "Rush"
  | "Double Attack"
  | "Rush: Character"
  /**
   * "…gains [Banish] during this turn" -- OP10-043 Moocy, OP10-097 Gum-Gum Rhino
   * Schneider, OP13-053 Marshall.D.Teach.
   *
   * The only one of these that changes what a *successful* attack does rather
   * than whether it can be declared or blocked: the Life card the damage takes
   * is trashed instead of joining the hand, and its `[Trigger]` never opens.
   */
  | "Banish";

/**
 * A granted keyword still in force, and the turn it lapses after.
 *
 * Its own entry in the observation because a granted keyword is invisible
 * everywhere else: the card keeps its printed text, and the only clue that
 * OP16-001's Leader ability handed a Character [Rush] is that the Character
 * attacks on the turn it landed.
 */
export interface GrantedKeywordObservation {
  keyword: GrantableKeyword;
  expiresAtTurn: number;
}

/**
 * One continuous ("static") ability's net effect on a card's power -- e.g. the
 * board-condition bonus a card grants itself, as opposed to a `PowerModifierObservation`
 * applied by a triggered effect. Unlike power modifiers, this has no
 * expiration: it is re-evaluated fresh from live board state every observation.
 */
export interface StaticPowerContributionObservation {
  amount: number;
  sourceCardNumber: string;
}

/**
 * One card in a Life stack, ordered top-first.
 *
 * Life is a stack of real cards rather than a counter, and enough of the format
 * places Life face-up -- Gecko Moria, Kid's Leader, Wyper, Bege -- that "how
 * many are left" is not a sufficient view of the zone. Effects also add to and
 * take from *both* ends, so the order has to survive into the observation.
 *
 * Face-down entries carry no identity for anyone: a player does not know their
 * own face-down Life cards either.
 */
export interface LifeCardObservation {
  faceUp: boolean;
  /**
   * Present only when `faceUp`, identity included.
   *
   * A face-down entry carries nothing at all -- not even its instance id, which
   * is a deck position and would let a viewer correlate the same card across
   * zones. It is a placeholder that says "there is a card here", which is all
   * anyone is entitled to know about it.
   */
  instanceId?: string;
  cardNumber?: string;
  name?: string;
}

/**
 * An ability a card in play prints and cannot use right now, with what it is
 * waiting for.
 *
 * The engine withholds an `[Activate: Main]` whose gate fails, on the sound
 * grounds that taking it would resolve nothing -- but a withheld offer reads
 * exactly like a card with no such ability, and 64 of the pool's 245
 * `[Activate: Main]` programs sit behind such a gate. A caller planning a turn
 * needs the difference: a gate on the DON!! already in front of it is a lever,
 * not a limit.
 *
 * Own side only. The reason can name a card in hand -- OP14-105 Gorgon Sisters
 * pays with particular cards -- so reporting it for the opponent would answer a
 * question about their hand.
 */
export interface DormantAbilityObservation {
  /** The clause, as the card prints it, e.g. `[Activate: Main]`. */
  clause: string;
  /**
   * What it needs, in the engine's words ("needs 1 or more DON!! attached to
   * this card"), or that its once-per-turn use is spent. A gate that can never
   * change for the rest of the game -- a Leader type this deck does not have --
   * produces no observation at all rather than a reason.
   */
  reason: string;
}

export interface GameObservation {
  gameId: string;
  revision: number;
  viewer: PlayerId;
  turn: number;
  /**
   * Whose decision this observation is asking for -- not whose turn it is.
   *
   * A Block or Counter step, and any pending effect the non-turn player must
   * resolve, put the other player here without the turn changing hands.
   */
  activePlayer: PlayerId;
  /**
   * Whose turn it is, which is what every turn-scoped reading depends on:
   * whether given DON!! is adding power, whether a `[Your Turn]` layer is on,
   * and whether a Character can still attack before the turn ends.
   */
  turnPlayer: PlayerId;
  phase: Phase;
  winner: PlayerId | null;
  resultReason: GameResultReason | null;
  /**
   * The game's time limit, public to both seats. Absent from a game created
   * without one.
   */
  timeLimit?: TimeLimitObservation;
  self: {
    hand: Array<{
      instanceId: string;
      cardNumber: string;
      name: string;
      cost: number;
      /**
       * What the engine will actually charge to play this card right now --
       * `playCostFromHand`, the one figure `play-card` legality and payment
       * both read.
       *
       * `cost` above stays the printed number, the same split `power` and
       * `currentPower` already have on the board. A hand price is not the
       * board's `currentCost`: it is a *different* number computed a
       * different way, because a discount on a card in hand deliberately does
       * not follow the body onto the field -- ST33-004 Borsalino costs 3 from
       * a hand an effect trashed from and is still a 6-cost Character once it
       * lands. Without this a seat, and the app, price a hand off a number the
       * engine disagrees with, and a card playable on three DON!! reads as
       * unaffordable.
       */
      currentCost: number;
      /** The printed Counter value, or 0 for a card that prints none. */
      counter: number;
      /**
       * Counter power this card would actually add to a battle right now --
       * the printed value plus every static layer granting it more, which is
       * the figure `counterActions` already puts on the offered
       * `CounterAction`.
       *
       * The same split as `cost`/`currentCost` above, and it exists for the
       * same reason. Three cards in the pool grant Counter to cards still in
       * hand -- OP16-118 Portgas.D.Ace gives every 8000-power Character +2000,
       * OP17-063 and OP17-118 their own variants -- so a policy summing the
       * printed values to ask "can this hand save this battle" reads 0 off a
       * hand holding four answers. Read this, not `counter`, whenever the
       * question is about defending.
       *
       * Only the decks running one of the three granting cards can see this
       * at all, so read it across the whole field: a single-deck arm on a
       * marginal holder shows almost nothing.
       */
      currentCounter: number;
    }>;
    /**
     * Whether this side's `[On Play]` effects resolve at all right now.
     *
     * Two sources, and a reader wants them merged: a Leader's own static text
     * (OP09-081 Marshall.D.Teach never gets an `[On Play]`) and the
     * turn-scoped negation that the same Leader's `[Activate: Main]` writes
     * onto the *other* player until the end of that player's next turn.
     *
     * Public in both directions -- the clause is announced when it is paid --
     * and reported because a seat that cannot see it cannot tell a first
     * payment from a second one in the same turn, which buys nothing.
     */
    onPlayNegated: boolean;
    deckCount: number;
    /** Convenience for `life.length`; the stack itself is in `life`. */
    lifeCount: number;
    /** The Life stack, ordered top-first. */
    life: LifeCardObservation[];
    activeDon: number;
    restedDon: number;
    donDeckCount: number;
    /**
     * Rested DON!! an effect holds down through this player's next Refresh --
     * OP10-033 Nami. Present only while such a hold stands, so an observation
     * of a game where none was written is unchanged.
     *
     * Public, and observable because a consumer projecting the DON!! a seat
     * will have to spend has to subtract it: the hold is the one thing that
     * makes "everything in the cost area plus everything given" the wrong
     * answer. Without it that projection silently overstates by the held count.
     */
    donHeldFromRefresh?: number;
    /**
     * Extra turns this player will take once the current turn ends -- OP05-119
     * Monkey.D.Luffy. Present only while one is owed, so an observation of a
     * game that never books one is unchanged.
     */
    extraTurns?: number;
    /**
     * K.O. replacements this player bought for a window rather than printed on
     * a card -- EB02-030's `[Counter]`, the only one in the pool.
     *
     * Card numbers of the bookings still in force, and present only while one
     * is. Public on both sides: the Event was played face-up, and what it buys
     * is a save the opponent has to price their attacks against. Without it the
     * protection is invisible until it answers a K.O., which is exactly the
     * offer-shaped blind spot `dormantAbility` exists to close.
     */
    installedReplacements?: readonly string[];
    trash: Array<{ cardNumber: string; name: string }>;
    leader: {
      cardNumber: string;
      name: string;
      power: number;
      rested: boolean;
      /**
       * Whether this Leader still has an attack left in it this turn -- the
       * engine's own `couldAttackThisTurn`, the twin of the board field of the
       * same name.
       *
       * `!rested` is the reading every pilot wrote instead, and it is wrong on
       * the game's first two turns, when neither player may battle at all (CR
       * 6-5-6-1), and wrong under the three Leader-specific bars: a printed
       * "This Leader cannot attack.", an opponent's attack lock, and a
       * conditional restriction the Leader's own text carries.
       */
      couldAttack: boolean;
      /**
       * The turn through which this Leader stays rested past its own Refresh
       * Phase, present only while such a hold is in force.
       *
       * The Leader-side twin of the board field of the same name. The hold is
       * public -- the clause that wrote it announced itself -- and without it
       * a rested Leader in the observation looks like one that will simply
       * stand up next turn.
       */
      cannotRefreshUntilTurn?: number;
      attachedDon: number;
      currentPower: number;
      /**
       * The base power a live "becomes N" clause has put in place of this
       * Leader's printed power, present only while such an override is in
       * force and differs from the printed figure.
       *
       * Everything else here is a delta off a base, so a consumer that starts
       * from printed power and adds the modifier rows lands short by the whole
       * replacement -- OP17-005 Edward.Newgate makes a 5000 Leader an 8000 one
       * and the card popup showed "printed 5k, +2k" beside a Leader the engine
       * was swinging at 10000. This is the base those rows are deltas off.
       */
      basePower?: number;
      /**
       * True once this Leader's `[Once Per Turn]` reaction has paid out this
       * turn, and `false` when it prints none -- so "the clause is still
       * available" reads the same either way.
       *
       * Unlike an `[Activate: Main]`, a reaction is dispatched off the signal
       * stream rather than offered as an action, so nothing leaves
       * `legalActions` once it has fired and a policy had no way to ask. For
       * OP09-061 Monkey.D.Luffy that is the deck's central decision: the refund
       * answers "2 or more DON!! returned" once a turn, which makes the turn's
       * first such return cheap and every later one full price.
       *
       * Public on both sides. The refund adds DON!! through ordinary public
       * events, so this states something both players have already watched
       * happen rather than opening a new window into a hand.
       */
      leaderReactionSpent: boolean;
      powerModifiers: PowerModifierObservation[];
      staticPowerModifiers: StaticPowerContributionObservation[];
      /** Keywords an effect handed this Leader for the turn, still in force. */
      grantedKeywords?: GrantedKeywordObservation[];
      /**
       * The turn through which an effect lets this card attack the opponent's
       * active Characters as well as rested ones, present only while in force.
       *
       * Not a keyword, so `grantedKeywords` cannot carry it, and the printed
       * text of the card it lands on never mentions it: EB03-008 Hibari hands
       * it to a Leader, which then attacks an active Character with nothing on
       * the board to say it could.
       */
      attacksActiveUntilTurn?: number;
      /**
       * Every keyword in force on this Leader right now, from any source.
       *
       * See the board field of the same name: a Leader is the card most often
       * handed a keyword by something other than its own text, because two
       * cards in the format give it [Double Attack] and one gives it
       * [Unblockable].
       */
      effectiveKeywords: readonly CardKeyword[];
      /**
       * Keywords this Leader prints conditionally -- see the board field of the
       * same name.
       */
      conditionalKeywords?: readonly CardKeyword[];
      /**
       * An `[Activate: Main]` this Leader prints and cannot use now. Own side
       * only.
       *
       * The Leader is where this matters most: its activation is the one a deck
       * builds around, and the gate is often something the player can satisfy
       * in the same Main Phase -- ST21-001 Monkey.D.Luffy's gift wants 1 DON!!
       * on the Leader itself before it hands 2 rested DON!! to a Character.
       */
      dormantAbility?: DormantAbilityObservation;
    };
    board: Array<{
      instanceId: string;
      cardNumber: string;
      name: string;
      cost: number;
      /**
       * Cost on the field, printed cost plus every static `+N cost` layer --
       * what `effectiveCost` returns, and what a clause reading "a Character
       * with a cost of N or more" is actually measured against.
       *
       * `cost` above stays the printed number, the same split `power` and
       * `currentPower` already have. Without this the two are the same document
       * for most cards and wildly different for some: OP17-089 Jaguar.D.Saul is
       * printed at 4 and sits on the board at 16, and six OP17 Characters plus
       * OP13-004 Sabo's aura read that 16. A seat with only the printed cost
       * cannot tell whether its own board has switched its own deck on.
       *
       * Public either way -- both players can compute it from the board -- so
       * it is on the opponent's Characters too.
       */
      currentCost: number;
      power: number;
      rested: boolean;
      blocker: boolean;
      /**
       * Whether this Character still has an attack left in it this turn --
       * the engine's own `couldAttackThisTurn`, not a re-derivation of it.
       *
       * Eight separate bars stop a body declaring: the two first turns of the
       * game (CR 6-5-6-1), rested, summoning sickness, a printed "cannot
       * attack", a conditional one its own text switches on, an effect's
       * attack lock, a rest lock (resting is how a declaration is paid for,
       * CR 7-1-1-1), and an unpayable attack tax. A policy asked "is this
       * body's swing still to come" cannot read `legalActions` for it inside a
       * pending effect, and every stand-in written from the fields above has
       * reached for `rested` and stopped one or two bars short.
       *
       * Public on both sides: every input is on the board or is a hand *count*,
       * and the defender's copy answers "has this attacker already swung".
       */
      couldAttack: boolean;
      playedTurn: number;
      /**
       * True while this Character is barred from attacking only because it
       * was played this turn and has neither Rush nor Rush: Character --
       * the ordinary "summoning sickness" case, not an effect-driven lock.
       *
       * Without this, a policy had to notice `playedTurn === turn` and
       * separately recall from cardFacts that the card lacks Rush, instead
       * of reading one field. Kept separate from `cannotAttackUntilTurn`,
       * which is reserved for an effect actively holding the Character down.
       */
      summoningSick?: boolean;
      cannotAttackUntilTurn?: number;
      /** The card whose effect set `cannotAttackUntilTurn`, for surfacing "why" in the UI. */
      cannotAttackSourceCardNumber?: string;
      /**
       * Set while this Character is barred from being rested, through and
       * including this turn number.
       *
       * An active Character that cannot be rested cannot attack and cannot use
       * its [Blocker] -- resting is the cost of both -- so it reads as a fully
       * available body while having no legal action at all. Nothing else in the
       * observation distinguishes it from one that is simply out of reach.
       */
      cannotRestUntilTurn?: number;
      /** The card whose effect set `cannotRestUntilTurn`, for surfacing "why" in the UI. */
      cannotRestSourceCardNumber?: string;
      /**
       * Set while this Character is barred from standing up in the Refresh
       * Phase, through and including this turn number.
       *
       * A Character held down this way looks exactly like one that was simply
       * rested this turn, so the board cannot say why it is unavailable and a
       * policy counting on it standing up has to be told.
       */
      cannotRefreshUntilTurn?: number;
      /**
       * Set while this Character's own printed effects are negated.
       *
       * A negated Character reads as an ordinary body: `blocker` already goes
       * false for a printed Blocker, but nothing else in the observation says
       * why, and a policy planning around its [On K.O.] needs to be told.
       */
      negated?: boolean;
      /**
       * Keywords an effect handed this Character for the turn, still in force.
       *
       * Printed keywords are on the card and are not repeated here; these are
       * the ones no amount of reading the card can reveal.
       */
      grantedKeywords?: GrantedKeywordObservation[];
      /**
       * The turn through which an effect lets this card attack the opponent's
       * active Characters as well as rested ones, present only while in force.
       *
       * Not a keyword, so `grantedKeywords` cannot carry it, and the printed
       * text of the card it lands on never mentions it: EB03-008 Hibari hands
       * it to a Leader, which then attacks an active Character with nothing on
       * the board to say it could.
       */
      attacksActiveUntilTurn?: number;
      /**
       * Every keyword in force on this card right now, from any source:
       * printed, conditional, granted for the turn, or handed over by another
       * card's continuous ability.
       *
       * Distinct from `CardFacts.keywords`, which is the printed identity of a
       * card *number*. This is the state of one card *instance* on the field,
       * and the two disagree exactly where it matters -- a Character with
       * granted [Rush], a printed Blocker whose text is negated, an [Ohm] card
       * under OP15-071 Holly. `grantedKeywords` above covers only the
       * turn-scoped grants and so misses every aura, which is what left a
       * Leader swinging for 2 Life with nothing in the observation saying so.
       */
      effectiveKeywords: readonly CardKeyword[];
      attachedDon: number;
      /**
       * Keywords this card prints conditionally, whether or not the condition
       * holds right now.
       *
       * `effectiveKeywords` says what is in force; this says what the card's
       * own text can switch on. The two together are the difference between a
       * body that will never have [Rush] and one whose [Rush] is a DON!!
       * placement away -- ST31-004 Monkey.D.Luffy wants 3 given DON!! anywhere
       * on the field -- which `keywords: none` alone cannot express.
       */
      conditionalKeywords?: readonly CardKeyword[];
      /** An `[Activate: Main]` this Character prints and cannot use now. Own side only. */
      dormantAbility?: DormantAbilityObservation;

      currentPower: number;
      /**
       * The base power a live "becomes N" clause has put in place of this
       * Character's printed power, present only while such an override is in
       * force and differs from the printed figure.
       *
       * Everything else here is a delta off a base, so a consumer that starts
       * from printed power and adds the modifier rows lands short by the whole
       * replacement -- OP16-058 sets every [Prisoner of Impel Down] to 7000 and
       * OP16-106 Sanjuan.Wolf sets one card to 7000, and the card popup showed
       * only the printed figure with the modifier rows summing past it. This is
       * the base those rows are deltas off.
       */
      basePower?: number;
      powerModifiers: PowerModifierObservation[];
      staticPowerModifiers: StaticPowerContributionObservation[];
    }>;
    stage: null | {
      instanceId: string;
      cardNumber: string;
      name: string;
      cost: number;
      rested: boolean;
      /**
       * An `[Activate: Main]` this Stage prints and cannot use now. Own side
       * only.
       *
       * A Stage's whole contribution is usually one activation, so a Stage
       * whose gate is unmet is a card doing nothing with no other field saying
       * why.
       */
      dormantAbility?: DormantAbilityObservation;
    };
    knowledge: PlayerKnowledge;
  };
  opponent: {
    handCount: number;
    /**
     * Whether this side's `[On Play]` effects resolve at all right now.
     *
     * Two sources, and a reader wants them merged: a Leader's own static text
     * (OP09-081 Marshall.D.Teach never gets an `[On Play]`) and the
     * turn-scoped negation that the same Leader's `[Activate: Main]` writes
     * onto the *other* player until the end of that player's next turn.
     *
     * Public in both directions -- the clause is announced when it is paid --
     * and reported because a seat that cannot see it cannot tell a first
     * payment from a second one in the same turn, which buys nothing.
     */
    onPlayNegated: boolean;
    deckCount: number;
    /** Convenience for `life.length`; the stack itself is in `life`. */
    lifeCount: number;
    /** The Life stack, ordered top-first. */
    life: LifeCardObservation[];
    activeDon: number;
    restedDon: number;
    donDeckCount: number;
    /**
     * Rested DON!! an effect holds down through this player's next Refresh --
     * OP10-033 Nami. Present only while such a hold stands, so an observation
     * of a game where none was written is unchanged.
     *
     * Public, and observable because a consumer projecting the DON!! a seat
     * will have to spend has to subtract it: the hold is the one thing that
     * makes "everything in the cost area plus everything given" the wrong
     * answer. Without it that projection silently overstates by the held count.
     */
    donHeldFromRefresh?: number;
    /**
     * Extra turns this player will take once the current turn ends -- OP05-119
     * Monkey.D.Luffy. Present only while one is owed, so an observation of a
     * game that never books one is unchanged.
     */
    extraTurns?: number;
    /**
     * K.O. replacements this player bought for a window rather than printed on
     * a card -- EB02-030's `[Counter]`, the only one in the pool.
     *
     * Card numbers of the bookings still in force, and present only while one
     * is. Public on both sides: the Event was played face-up, and what it buys
     * is a save the opponent has to price their attacks against. Without it the
     * protection is invisible until it answers a K.O., which is exactly the
     * offer-shaped blind spot `dormantAbility` exists to close.
     */
    installedReplacements?: readonly string[];
    trash: Array<{ cardNumber: string; name: string }>;
    leader: {
      cardNumber: string;
      name: string;
      power: number;
      rested: boolean;
      /**
       * Whether this Leader still has an attack left in it this turn -- the
       * engine's own `couldAttackThisTurn`, the twin of the board field of the
       * same name.
       *
       * `!rested` is the reading every pilot wrote instead, and it is wrong on
       * the game's first two turns, when neither player may battle at all (CR
       * 6-5-6-1), and wrong under the three Leader-specific bars: a printed
       * "This Leader cannot attack.", an opponent's attack lock, and a
       * conditional restriction the Leader's own text carries.
       */
      couldAttack: boolean;
      attachedDon: number;
      currentPower: number;
      /**
       * The base power a live "becomes N" clause has put in place of this
       * Leader's printed power, present only while such an override is in
       * force and differs from the printed figure.
       *
       * Everything else here is a delta off a base, so a consumer that starts
       * from printed power and adds the modifier rows lands short by the whole
       * replacement -- OP17-005 Edward.Newgate makes a 5000 Leader an 8000 one
       * and the card popup showed "printed 5k, +2k" beside a Leader the engine
       * was swinging at 10000. This is the base those rows are deltas off.
       */
      basePower?: number;
      /**
       * True once this Leader's `[Once Per Turn]` reaction has paid out this
       * turn, and `false` when it prints none -- so "the clause is still
       * available" reads the same either way.
       *
       * Unlike an `[Activate: Main]`, a reaction is dispatched off the signal
       * stream rather than offered as an action, so nothing leaves
       * `legalActions` once it has fired and a policy had no way to ask. For
       * OP09-061 Monkey.D.Luffy that is the deck's central decision: the refund
       * answers "2 or more DON!! returned" once a turn, which makes the turn's
       * first such return cheap and every later one full price.
       *
       * Public on both sides. The refund adds DON!! through ordinary public
       * events, so this states something both players have already watched
       * happen rather than opening a new window into a hand.
       */
      leaderReactionSpent: boolean;
      powerModifiers: PowerModifierObservation[];
      staticPowerModifiers: StaticPowerContributionObservation[];
      /** Keywords an effect handed this Leader for the turn, still in force. */
      grantedKeywords?: GrantedKeywordObservation[];
      /**
       * The turn through which an effect lets this card attack the opponent's
       * active Characters as well as rested ones, present only while in force.
       *
       * Not a keyword, so `grantedKeywords` cannot carry it, and the printed
       * text of the card it lands on never mentions it: EB03-008 Hibari hands
       * it to a Leader, which then attacks an active Character with nothing on
       * the board to say it could.
       */
      attacksActiveUntilTurn?: number;
      /**
       * Every keyword in force on this Leader right now, from any source.
       *
       * See the board field of the same name: a Leader is the card most often
       * handed a keyword by something other than its own text, because two
       * cards in the format give it [Double Attack] and one gives it
       * [Unblockable].
       */
      effectiveKeywords: readonly CardKeyword[];
      /**
       * Keywords this Leader prints conditionally. Public: it is the card's
       * printed text, not the state of the seat holding it.
       */
      conditionalKeywords?: readonly CardKeyword[];
    };
    board: Array<{
      instanceId: string;
      cardNumber: string;
      name: string;
      cost: number;
      /**
       * Cost on the field, printed cost plus every static `+N cost` layer --
       * what `effectiveCost` returns, and what a clause reading "a Character
       * with a cost of N or more" is actually measured against.
       *
       * `cost` above stays the printed number, the same split `power` and
       * `currentPower` already have. Without this the two are the same document
       * for most cards and wildly different for some: OP17-089 Jaguar.D.Saul is
       * printed at 4 and sits on the board at 16, and six OP17 Characters plus
       * OP13-004 Sabo's aura read that 16. A seat with only the printed cost
       * cannot tell whether its own board has switched its own deck on.
       *
       * Public either way -- both players can compute it from the board -- so
       * it is on the opponent's Characters too.
       */
      currentCost: number;
      power: number;
      rested: boolean;
      blocker: boolean;
      /**
       * Whether this Character still has an attack left in it this turn --
       * the engine's own `couldAttackThisTurn`, not a re-derivation of it.
       *
       * Eight separate bars stop a body declaring: the two first turns of the
       * game (CR 6-5-6-1), rested, summoning sickness, a printed "cannot
       * attack", a conditional one its own text switches on, an effect's
       * attack lock, a rest lock (resting is how a declaration is paid for,
       * CR 7-1-1-1), and an unpayable attack tax. A policy asked "is this
       * body's swing still to come" cannot read `legalActions` for it inside a
       * pending effect, and every stand-in written from the fields above has
       * reached for `rested` and stopped one or two bars short.
       *
       * Public on both sides: every input is on the board or is a hand *count*,
       * and the defender's copy answers "has this attacker already swung".
       */
      couldAttack: boolean;
      playedTurn: number;
      /**
       * True while this Character is barred from attacking only because it
       * was played this turn and has neither Rush nor Rush: Character --
       * the ordinary "summoning sickness" case, not an effect-driven lock.
       *
       * Without this, a policy had to notice `playedTurn === turn` and
       * separately recall from cardFacts that the card lacks Rush, instead
       * of reading one field. Kept separate from `cannotAttackUntilTurn`,
       * which is reserved for an effect actively holding the Character down.
       */
      summoningSick?: boolean;
      cannotAttackUntilTurn?: number;
      /** The card whose effect set `cannotAttackUntilTurn`, for surfacing "why" in the UI. */
      cannotAttackSourceCardNumber?: string;
      /**
       * Set while this Character is barred from being rested, through and
       * including this turn number.
       *
       * An active Character that cannot be rested cannot attack and cannot use
       * its [Blocker] -- resting is the cost of both -- so it reads as a fully
       * available body while having no legal action at all. Nothing else in the
       * observation distinguishes it from one that is simply out of reach.
       */
      cannotRestUntilTurn?: number;
      /** The card whose effect set `cannotRestUntilTurn`, for surfacing "why" in the UI. */
      cannotRestSourceCardNumber?: string;
      /**
       * Set while this Character is barred from standing up in the Refresh
       * Phase, through and including this turn number.
       *
       * A Character held down this way looks exactly like one that was simply
       * rested this turn, so the board cannot say why it is unavailable and a
       * policy counting on it standing up has to be told.
       */
      cannotRefreshUntilTurn?: number;
      /**
       * Set while this Character's own printed effects are negated.
       *
       * A negated Character reads as an ordinary body: `blocker` already goes
       * false for a printed Blocker, but nothing else in the observation says
       * why, and a policy planning around its [On K.O.] needs to be told.
       */
      negated?: boolean;
      /**
       * Keywords an effect handed this Character for the turn, still in force.
       *
       * Printed keywords are on the card and are not repeated here; these are
       * the ones no amount of reading the card can reveal.
       */
      grantedKeywords?: GrantedKeywordObservation[];
      /**
       * The turn through which an effect lets this card attack the opponent's
       * active Characters as well as rested ones, present only while in force.
       *
       * Not a keyword, so `grantedKeywords` cannot carry it, and the printed
       * text of the card it lands on never mentions it: EB03-008 Hibari hands
       * it to a Leader, which then attacks an active Character with nothing on
       * the board to say it could.
       */
      attacksActiveUntilTurn?: number;
      /**
       * Every keyword in force on this card right now, from any source:
       * printed, conditional, granted for the turn, or handed over by another
       * card's continuous ability.
       *
       * Distinct from `CardFacts.keywords`, which is the printed identity of a
       * card *number*. This is the state of one card *instance* on the field,
       * and the two disagree exactly where it matters -- a Character with
       * granted [Rush], a printed Blocker whose text is negated, an [Ohm] card
       * under OP15-071 Holly. `grantedKeywords` above covers only the
       * turn-scoped grants and so misses every aura, which is what left a
       * Leader swinging for 2 Life with nothing in the observation saying so.
       */
      effectiveKeywords: readonly CardKeyword[];
      /**
       * Keywords this Character prints conditionally, whether or not the
       * condition holds -- see the field of the same name on your own board.
       * Public, and worth as much across the table: a body whose [Blocker] its
       * own text can switch on is an answer their DON!! may still buy.
       */
      conditionalKeywords?: readonly CardKeyword[];
      attachedDon: number;
      currentPower: number;
      /**
       * The base power a live "becomes N" clause has put in place of this
       * Character's printed power, present only while such an override is in
       * force and differs from the printed figure.
       *
       * Everything else here is a delta off a base, so a consumer that starts
       * from printed power and adds the modifier rows lands short by the whole
       * replacement -- OP16-058 sets every [Prisoner of Impel Down] to 7000 and
       * OP16-106 Sanjuan.Wolf sets one card to 7000, and the card popup showed
       * only the printed figure with the modifier rows summing past it. This is
       * the base those rows are deltas off.
       */
      basePower?: number;
      powerModifiers: PowerModifierObservation[];
      staticPowerModifiers: StaticPowerContributionObservation[];
    }>;
    stage: null | {
      instanceId: string;
      cardNumber: string;
      name: string;
      cost: number;
      rested: boolean;
    };
  };
  activeBattle: null | {
    attackerInstanceId: string;
    targetInstanceId: string;
    attackPower: number;
    targetPower: number;
    counterPower: number;
    /**
     * Counter power the defender must still add to survive, or 0 when the
     * target already survives.
     *
     * The attacker wins ties, so this is `attack - (target + counter) + 1`.
     * It is stated here because every consumer otherwise re-derives it, and a
     * consumer that compares its hand against `attackPower` instead of against
     * this shortfall concludes a survivable attack is lethal.
     */
    counterShortfall: number;
    /**
     * Life cards a successful hit takes: 1 normally, 2 from an attacker with
     * [Double Attack], and 0 when the target is a Character.
     *
     * The defender's arithmetic needs this and cannot derive it: "one Life per
     * hit" is wrong for eight cards in the format, and being at 1 Life against
     * a [Double Attack] attacker is lose-or-win rather than chip damage.
     */
    lifeCost: number;
  };
  pendingTriggerCardNumber: string | null;
  /**
   * Printed facts for every card number the viewer can currently identify --
   * both Leaders, both boards and Stages, both trashes, the viewer's own hand,
   * face-up Life, remembered deck tops, and anything named by a legal action.
   *
   * Keyed by card number rather than repeated per instance: a hand with four
   * copies of one card carries its text once.
   */
  cardFacts: Record<string, CardFacts>;
  legalActions: LegalAction[];
  publicEvents: PublicEvent[];
  stateHash: string;
}

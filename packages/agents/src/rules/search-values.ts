import { isSearchResult, optionCard } from "./generic-policy.js";
import { heuristics, preferAmong, WEIGHT } from "./heuristics.js";
import type { PolicyModule } from "./policy-module.js";

/**
 * What one deck wants out of its own searches.
 *
 * The expensive thing on this surface is not the ranking mechanism, it is the
 * card knowledge: which card *this* deck most wants to draw, which no rule
 * about costs or keywords can supply. A per-deck table is worth roughly twice
 * what the best format-scope rule on the same surface is
 * (`createSearchBlockerModule`), so a deck with no table here is leaving that
 * on the table.
 *
 * Each table is authored from that deck's dossier in
 * `packages/agents/src/llm/dossiers/`, which carries a sourced game plan and
 * priority list per deck, cross-checked against the deck's own list and printed
 * text. The dossier is cited in each table's comment so a disagreement can be
 * taken up with the source rather than with whoever typed the numbers.
 *
 * ## The shape of a table
 *
 * A `cardNumber -> integer` map, higher meaning "take this one". Only relative
 * order matters. A card the table does not name scores below every card it does,
 * so a table need not list a whole deck -- but it does need to list everything
 * the deck's searchers can actually find, because an unlisted card ranks last
 * whether or not that was intended.
 *
 * Deliberately flat rather than positional. That is not necessarily the
 * strongest shape -- `createSearchBlockerModule` is positional -- but it is
 * the shape these tables are built and validated as, and a baseline a
 * positional refinement can be measured against later.
 *
 * ## What a table must not be
 *
 * **Not a ranking of how much the deck needs the card to win.** A dossier's
 * priority list read straight off the page produces exactly that, and it is
 * worse than no table: it answers a turn-3 search with an 8-cost Event and a
 * 10-cost body, while the same dossier says turns 1-3 belong to the 1-cost
 * engine pieces. A dossier's priorities are a *turn order*, and flattening one
 * into a static ranking inverts it.
 *
 * A search hands over a card **now**, so the question a table answers is "which
 * of these do I most want to be holding", not "which of these does the deck
 * eventually win with". A finisher is drawn into on its own; an engine piece
 * found three turns early compounds. The tables that work are the ones whose
 * top tiers are mid-cost and immediately castable.
 */
export type SearchValues = ReadonlyMap<string, number>;

/**
 * Rank a deck's search results by its own table.
 *
 * Registered per deck as `search:<slug>`, so `pnpm deck:ab --disable
 * search:<slug>` measures exactly one deck's table and nothing else. That is
 * the reason these are their own modules rather than rules inside each deck's
 * existing policy: `heuristics()` sums every rank-among rule in a module into
 * one contribution, so a table added to `op16-teach` would only be measurable by
 * switching off the whole Teach policy with it.
 *
 * `WEIGHT.deck` rather than `WEIGHT.format`, so where a deck's own knowledge and
 * a format rule disagree the deck wins. It is a separate module from
 * `search-blocker`, and `applyRanking` protects each ranker's own top choice
 * from being hidden by another module, so the two narrow independently and a
 * disagreement leaves both candidates standing rather than neither.
 *
 * `preferAmong` rather than `prefer`: the rule says nothing about "add no card",
 * which leaves declining a search available to any policy that wants it.
 */
export function createSearchValueModule(
  slug: string,
  values: SearchValues,
): PolicyModule {
  return heuristics(`search:${slug}`, [
    preferAmong(`Take the search result this deck wants most.`)
      .by(WEIGHT.deck)
      .effect((action) => {
        if (!isSearchResult(action)) return false;
        const card = optionCard(action)?.card;
        if (!card) return false;
        // A card the table does not name ranks below every card it does, and is
        // still *scored* -- silence would read as "no opinion" and let an
        // unlisted card survive beside the one the deck asked for.
        return values.get(card.cardNumber) ?? -1;
      }),
  ]);
}

/**
 * One rung of a table: a card, or several the deck has no preference between.
 *
 * A tier is not a convenience. Forcing a false order between near-equivalent
 * cards is worse than leaving them tied, because a strict ranking
 * *concentrates* the hand: a deck running four copies each of three
 * interchangeable 1-drops gets four of whichever ranks first, and loses the
 * spread that made them worth playing. `op16-teach` is that deck -- see its
 * comment.
 *
 * Cards inside a tier score alike, so nothing hides them from each other and the
 * choice between them falls back to the order the engine offered, which is
 * unbiased.
 */
export type SearchTier = string | readonly string[];

/**
 * A ranking, written as an order rather than as numbers.
 *
 * Only relative position matters to {@link createSearchValueModule}, and a list
 * says that where a column of integers invites the reader to wonder what the gap
 * between 85 and 80 means. It also makes a table diff legibly: moving a card is
 * a moved line, not a renumbering.
 */
function ranked(tiers: readonly SearchTier[]): SearchValues {
  const values = new Map<string, number>();
  tiers.forEach((tier, index) => {
    const score = tiers.length - index;
    for (const cardNumber of typeof tier === "string" ? [tier] : tier) {
      values.set(cardNumber, score);
    }
  });
  return values;
}

/** Every card a table names, tiers flattened. */
export function tabledCards(tiers: readonly SearchTier[]): string[] {
  return tiers.flatMap((tier) =>
    typeof tier === "string" ? [tier] : [...tier],
  );
}

/**
 * One deck's search ranking, and the Leader it is registered for.
 *
 * Each table covers the cards that deck's searchers actually offer, taken from
 * an instrumented run rather than from reading each searcher's printed filter --
 * a card the table omits ranks last whether or not that was intended, so the
 * pool has to be observed rather than guessed.
 */
export interface SearchTable {
  /** Module id suffix: `search:<slug>`. */
  slug: string;
  /** Leader card number, as `registerPolicy`'s `deck`. */
  leader: string;
  /** Best first. A nested entry is a tier of cards ranked alike. */
  order: readonly SearchTier[];
}

/**
 * The baseline tables, one per deck whose searches had no ranking at all.
 *
 * Authored from each deck's dossier in `packages/agents/src/llm/dossiers/`,
 * which carries a sourced game plan and priority list, cross-checked against the
 * observed search pool and the printed text. Each comment names the dossier line
 * the order rests on, so a disagreement is a disagreement with a cited source
 * rather than with whoever typed the list.
 *
 * The five decks already holding a table (`st31`, `st32`, `st33`, `st34`,
 * `st36-policy.ts`) are deliberately absent: those rankings pay as they stand,
 * and rewriting them here would be an unmeasured change dressed as a refactor.
 */
/**
 * The registered tables. Every one is priced on its own with
 * `pnpm deck:ab --deck "<deck>" --disable search:<slug>`, and a table that
 * loses points is worse than the deck order it replaces --
 * {@link REJECTED_SEARCH_TABLES} holds the decks where that is what happened.
 *
 * ## Two ways to author one, and they are not equally good
 *
 * Most of these are written from the deck's dossier in
 * `packages/agents/src/llm/dossiers/`, which carries a sourced game plan and
 * priority list, cross-checked against the observed search pool and the printed
 * text. Each comment names the dossier line its order rests on, so a
 * disagreement is a disagreement with a cited source rather than with whoever
 * typed the list.
 *
 * `op16-teach` is the exception and the more reliable method: the ordering is
 * taken from **played-out counterfactuals** -- at every contested search in a
 * lost game, each other option finishes the game, and the cards whose
 * alternatives convert the loss are the cards the table ranks first.
 * `tools/decision-regret.ts` is the instrument; the deck's comment has the
 * rollout table. It is a better method, not a guarantee, which is why each
 * table is still priced against the deck order it replaces.
 */
export const SEARCH_TABLES: readonly SearchTable[] = [
  {
    // Both lists under the ST-30 Leader. Neither plays the other's search
    // targets but ST30-012, so the precon's order and the Open OPTCG list's
    // interleave without either changing the other's.
    //
    // The ST-30 precon. Its searches (ST30-002 and ST30-017) both ask for a
    // Character with 6000 power, which in this fifty is eight of its
    // identities, so this is the whole pool they can return.
    //
    // Ordered by what the deck most wants to be holding now, not what it wins
    // with: "ST30-012's [When Attacking] rests one of the opponent's [Blocker]
    // Characters" and buys its own [Rush], so it is the one 6000 that attacks
    // the turn it lands, and the two Blockers follow because a body that
    // stands on the opponent's turn is what the precon's Life is spent on.
    slug: "st30-luffy-ace",
    leader: "ST30-001",
    order: [
      "ST30-012", // Monkey.D.Luffy -- buys Rush and rests an opposing Blocker
      "ST30-008", // Marco -- Blocker that replays itself out of the trash
      "ST30-010", // Crocodile -- Blocker; holds a rested body down a turn
      "ST30-007", // Portgas.D.Ace -- buys Rush, and -1000 on the way in
      "ST30-006", // Jinbe -- turns a spare 6000-power card into two cards
      // ST30-003 is the deck's anthem and still ranks below four bodies: at 8
      // cost it is the card a turn-3 search can least often cast, and it buffs
      // a board the cards above it are what build.
      "ST30-003", // Edward.Newgate -- +1000 to every 6000-base body, on 8 cost
      // Tied: both are vanilla 6000s whose only job is to be a 6000, and
      // forcing an order between them would concentrate the hand on one.
      ["ST30-005", "ST30-013"], // Jozu, Mr.2.Bon.Kurei(Bentham)
      // The Open OPTCG list, whose searches look for a {Straw Hat Crew} card.
      // ST30-012 heads it too. Then the bodies in the order a search on turns
      // 2-5 can cast them into an attack: ST21-014 has [Rush] printed, OP12-015
      // turns a searcher in hand into a second body, and ST31-001 is two bodies
      // for 5. The Events follow -- the removal, then the Counters -- and the
      // searchers themselves sit last: a search that finds another search has
      // spent its look on a card that only looks again.
      "ST21-014", // Monkey.D.Luffy -- [Rush], and a rested DON!! on attack
      "OP12-015", // Monkey.D.Luffy -- plays a searcher out of hand for free
      "ST31-001", // Sanji -- draws and plays a second Straw Hat body
      "ST21-003", // Sanji -- takes [Blocker] out of a 6000's attack
      "ST21-017", // Gum-Gum Mole Pistol -- the one removal
      "OP17-017", // Ga Ha Ha Ha!! -- +2000 and -2000 for 1
      "OP04-016", // Bad Manners Kick Course -- +3000 for a card from hand
      "OP13-040", // rest-lock, or +3000 on the Leader
      "OP12-037", // rest two, or +3000 on the Leader
      "OP06-017", // Meteor-Strike of Love -- +3000 for a Life card
      "ST31-005", // Thousand Sunny -- a DON!! to a Luffy every turn
      ["OP01-016", "EB02-017"], // Nami, Nami -- the same five-deep look
    ],
  },
  {
    // "Every meaningful play in the list rests something on the way in: OP17-029
    // Hongo ... OP17-031 Yasopp ... OP17-027 Benn.Beckman", and ST16-004 "is the
    // payoff for the rest effects rather than an independent answer". The rest
    // effects are what a search should find; the 9- and 10-cost payoffs are
    // what it should not.
    slug: "op17-shanks",
    leader: "OP17-020",
    order: [
      "OP17-029", // Hongo -- Blocker; rests two 2-drops and refunds a DON!!
      "OP17-033", // Lucky.Roux
      "OP17-031", // Yasopp -- draws and rests a cost-8-or-less body
      "OP17-025", // Building Snake -- 4 cost; feeds the Leader a rested DON!! a turn
      "OP17-032", // Limejuice -- 2000 Counter at 1 cost
      "OP17-021", // Crone Oli -- 2000 Counter at 1 cost; shields the crew from removal
      "OP17-026", // Fugar -- 2000 Counter at 1 cost; rests a 2-cost when attacking
      "OP17-037", // Are You That Afraid of the New Era?!!
      "OP17-038", // I Think He's Seen an Ugly Future...
      "OP17-036", // Withdraw Now... -- six DON!! for two K.O.s, or a +4000 Counter
      "OP17-027", // Benn.Beckman -- draws and rests two, at 7 cost
      "OP17-024", // Howling Gab -- 8 cost for one rest; Banish needs a hit first
      "ST16-004", // Shanks -- 9 cost, and needs something rested already
      "OP17-022", // Shanks -- the 10-DON!! finisher
      // The Community list's own cards, last: none is a {Red-Haired Pirates}
      // card the crew's searches look for first, so they only fill a look
      // that offers nothing above.
      "OP08-036", // Electrical Luna -- keeps the rested board rested
      "OP10-030", // Smoker
      "ST32-002", // Kouzuki Oden
    ],
  },
  {
    // "Only OP17-089 and OP17-119 do the job here" -- under Sabo the other OP17
    // giants gate their +12 cost on an {Elbaph} Leader, and Sabo is not one. Saul
    // stays first because it *is* the cheap enabler: 4 in hand, 16 on the board.
    // OP17-093 drops to last -- an 8-drop that only gains [Rush] once a giant is
    // already down is the one card here a search should not find.
    // Registered for OP13-004, which ST35 shares; ST35 resolves no searches at
    // all and none of its cards are named here, so it is a no-op there.
    slug: "op13-sabo",
    leader: "OP13-004",
    order: [
      "OP17-089", // Jaguar.D.Saul -- costs 4, sits at 16, satisfies both clauses
      "OP17-119", // Loki -- the other real giant under this Leader
      "OP17-098", // Gum-Gum Kong Gun -- a Counter now, the finisher later
      "OP17-095", // Roronoa Zoro -- replacement covering any Character
      "OP17-082", // Sanji -- draws 2
      "OP17-087", // Nico Robin
      "OP17-091", // Brook
      "OP17-080", // Usopp
      "OP17-084", // Tony Tony.Chopper
      "OP17-086", // Nami
      "OP17-093", // Monkey.D.Luffy -- 8 cost, and only Rush once a giant is down
    ],
  },
  {
    // "Land any giant" -- and under this {Elbaph} Leader the cheap ones are real
    // giants: "OP17-094 Rodo and OP17-081 Gerd ... are unconditional enablers
    // here". A 1-cost that satisfies "[printed text omitted -- pnpm card:text OP17-081]" for the whole team is the best card a turn-2 search can find, which
    // is why they outrank Loki despite Loki being the better body.
    slug: "op17-luffy",
    leader: "OP17-079",
    order: [
      "OP17-094", // Rodo -- a cost-1 giant under an Elbaph Leader
      "OP17-081", // Gerd -- a cost-2 giant under an Elbaph Leader
      "OP17-089", // Jaguar.D.Saul -- a cost-4 giant
      "OP17-119", // Loki -- the best giant, at 6 cost: On Play K.O.s, +3000
      // The tournament list's two {Straw Hat Crew} bodies. No Elbaph reveal
      // can find them; Gerd's trash return can. Docking Six sits at 11, a
      // giant once the Stage lifts it to 12, and OP15-092 is one at 17 once
      // the trash holds 10 -- so both rank under the unconditional giants.
      "OP15-088", // Pirates Docking Six -- mills 3, returns a cost-2 body
      "OP15-092", // Monkey.D.Luffy -- a 9000 at 17 cost from 10 trash
      "OP17-095", // Roronoa Zoro
      "OP17-082", // Sanji
      "OP17-087", // Nico Robin
      "OP17-091", // Brook
      "OP17-080", // Usopp
      "OP17-084", // Tony Tony.Chopper
      "OP17-086", // Nami
      "OP17-085", // Dorry -- 5 cost, and ends Character plays for the turn
      "OP17-092", // Brogy -- the same
      "OP17-093", // Monkey.D.Luffy -- 8 cost
      // Last because a search is looking for a body. The deck's plan is "land
      // any giant", and the only card here that lands nothing is the Event --
      // whatever it is worth in the Counter step, it is worth nothing to the
      // turn that went looking.
      "OP17-096", // I'm Luffy!! -- a 4000 [Counter], the largest in the format
    ],
  },
  {
    // "Turn 1, play a 1-cost body -- a vassal ... or Charlotte Pudding, whose
    // [On Play] digs 4 for an Event and costs no DON!! at all"; "Attack every
    // turn". Pudding's own search offers *only* Events, so their order among
    // themselves is load-bearing and is taken from what each one does: a draw
    // plus a Counter half beats a draw alone, and Mamaragan's Counter replaces
    // itself under 6 DON!! -- the condition this deck lives under.
    slug: "op16-enel",
    leader: "OP15-058",
    order: [
      "OP12-071", // Charlotte Pudding -- 1 cost, digs 4, needs no DON!!
      "OP15-061", // Ohm -- vassal, draws on its DON!! -1
      "OP15-066", // Satori
      "OP15-067", // Shura
      "OP05-077", // Gamma Knife -- the only removal
      "OP09-072", // Franky -- Blocker
      "OP12-063", // Vinsmoke Reiju -- Blocker
      "OP15-078", // Mamaragan -- draw, rest, and a Counter that redraws itself
      "OP15-076", // Lightning Beast Kiten -- draw, -1000, +2000 Counter
      "OP15-074", // Varie -- draw, +2 cost out of removal range, +2000 Counter
      "OP15-075", // El Thor -- K.O.s a 3000, +2000 Counter
      "OP15-077", // Lightning Dragon -- draw and rest-lock, but no Counter half
      "OP15-118", // Enel -- the finisher, and uncastable before six DON!!
      "OP10-067", // Senor Pink -- late recovery only, never a plan
      // The Community list under the same Leader, whose searchers find the
      // same Events plus the bodies below. Holly sits with the vassals: 3
      // cost, and the [Double Attack] it grants every Ohm is what the
      // Leader's gift is for in that list. Sanji and OP15-060 Enel are its
      // Blockers, after Franky and Reiju; Divine Departure is the removal
      // after Gamma Knife, with no Counter half.
      "OP15-071", // Holly -- 3 cost, [Double Attack] for every Ohm and itself
      "OP07-064", // Sanji -- Blocker, 3 cost once two DON!! behind
      "OP15-060", // Enel -- Blocker, re-armed for DON!! −1 and a card
      "OP13-076", // Divine Departure -- −8000 off five rested DON!!
    ],
  },
  {
    // OP-17 Purple Kaido. Bandai's list runs no searcher; the tournament list's
    // is four OP07-077, which looks at five for an {Animal Kingdom Pirates} or
    // {Big Mom Pirates} card -- every body in the 50 but OP17-074 Yamato, plus
    // two of its Events.
    //
    // The archetype's weakness is "highly dependent on playing 6c King exactly
    // on curve", and King is in the pool, so King heads it. Then what a search
    // on turns 2-5 can cast or ramp with: Basil Hawkins and Queen, then the
    // 7-cost EB04-030, which buys its own [Rush]. The cost-10 bodies follow in
    // the order the deck casts them -- OP17-062, whose refund pays for every
    // `DON!! −N` after it, first -- and the cards the deck holds rather than
    // plays sit last.
    slug: "op17-kaido",
    leader: "OP17-058",
    order: [
      "EB04-031", // King -- the ramp the whole curve is built on
      "OP17-073", // Basil Hawkins -- 3 cost, a DON!! on the way in
      "EB04-032", // Queen -- 1 cost; converts spare DON!! into next turn's
      "EB04-030", // Kaido -- 7 cost, [Rush] and a rest for DON!! −2
      "OP17-062", // Kaido -- the finisher, and refunds every DON!! −N
      "ST34-004", // Charlotte Linlin -- cost 10, a Life card and a zeroed body
      "OP17-063", // Kaido -- cost 10, K.O.s a cost-6-or-less on the way in
      "OP17-061", // Lead Performers -- cost 9, a Life card
      "OP08-077", // Conquest of the Sea -- DON!! −2, K.O. two cost-6-or-less
      "OP08-074", // Black Maria -- lends DON!! for one turn's DON!! −N costs
      "OP17-065", // Queen -- cost 9, draws and holds two attackers
      "OP17-075", // X.Drake -- a 2000 Counter body
      "OP17-076", // Wo Ro Ro Ro Ro... -- a +3000 Counter
    ],
  },
  {
    // Authored from **counterfactuals rather than from the dossier**, and the
    // only table here that is: every dossier-shaped ordering of this deck is
    // worse than the deck order it replaces. `tools/decision-regret.ts` plays
    // out each alternative at a contested search in a lost game, and the cards
    // whose alternatives convert the loss are the ones ranked first -- an order
    // that runs opposite to every reading of the game plan.
    //   OP16-108           6/33  18%
    //   OP09-096           3/17  18%
    //
    // The three cards at the top are the expensive ones -- the 10-cost Teach,
    // the 8-cost Event and the 8-cost Teach -- while OP09-099 Fullalead, which
    // the dossier calls "the only repeatable card selection in the deck",
    // converted no loss at all in fifteen tries. Catarina Devon likewise, in
    // seventeen.
    //
    // Why that is not as strange as it reads: this deck's Events and Characters
    // are almost all `[Trigger]`, so a card held in hand and a card sitting in
    // Life are both live, and its two closing cards are the pair the Leader's
    // ten-DON!! turn is built around. A search is one of the few ways to have
    // them *when* that turn arrives. Fullalead selects cards, but selection is
    // what the deck already has most of.
    //
    // Read as a hypothesis, not as a result -- an alternative can win by walking
    // into a line one fixed opponent misplays, which is why the ordering was
    // then measured with `deck:ab` like every other table here.
    slug: "op16-teach",
    leader: "OP16-080",
    order: [
      // The closing package, and the three best cards to be holding when the
      // Leader's last turn arrives.
      ["OP09-093", "OP16-116", "OP16-119"],
      // No measured preference between these, and deliberately none imposed:
      // four copies each of complementary 1-drops are worth their spread, and a
      // strict order hands the deck four of whichever sorts first.
      [
        "OP16-109",
        "OP09-086",
        "OP16-108",
        "OP09-096",
        "OP16-110",
        "OP16-103",
        "OP16-106",
      ],
      // Converted nothing in 32 rollouts between them.
      ["OP16-104", "OP09-099"],
    ],
  },
  {
    // "Cast the Event off a body before you cast it off your DON!!": the body
    // that casts a base-cost-3-or-less Event for nothing is the card a turn-two
    // search most wants to be holding, because it is castable on turn four and
    // pays for the Event beside it. The 7-cost body that casts anything is the
    // turn the deck builds toward, "not a curve play", so it sits with the
    // other mid-game pieces rather than at the top. Both searchers see every
    // card in the fifty -- "add a {Dressrosa} card, which in this fifty is
    // every card" -- so the whole list is ordered.
    slug: "op15-lucy",
    leader: "OP15-002",
    order: [
      "OP15-014", // Bartolomeo -- 6000 at 4, and a free base-cost-3 Event
      // The Stage is the defence engine and replaces itself; Sabo is the free
      // 7-cost cast; Chinjao trades an Event the hand cannot cast for two cards.
      ["OP15-057", "OP15-046", "OP15-048"],
      // The Events the free casts reach, and the 4-cost that grows off the trash.
      ["OP15-055", "OP15-020", "OP15-006", "OP15-021"],
      // The searchers chain, but a searcher found is a card that finds a card.
      ["OP15-040", "OP15-053", "OP10-060"],
      // The 2-ofs the manifest calls the flex slots, and the 1-cost body.
      ["OP15-054", "OP15-019", "OP10-059", "OP15-052"],
    ],
  },
  {
    // "Kyros is the priority target": the Leader's swap plays a cost-3, and the
    // one that returns to play turn after turn with a fresh [Rush] is the card
    // a search most wants. Then the fuel -- "your priority is often Viola,
    // Rebecca, and some follow-up card" -- the 1-costs the swap returns and
    // replays to dig again. Then the pieces that make a small board connect:
    // Sanji's [Unblockable], Luffy's 7000 wall, Sabo's free Event and the
    // Event it casts. Blue Gilly and Orlumbus are the cost-3s with nothing
    // printed that the deck uses, and OP10-059 is a search that finds a search.
    slug: "op15-rebecca",
    leader: "OP15-039",
    order: [
      "OP15-042",
      ["OP15-053", "OP15-040"],
      ["OP15-047", "OP15-051", "OP15-046", "OP10-060"],
      ["OP10-045", "OP10-046"],
      ["OP10-054", "OP15-041", "OP15-052"],
      "OP10-059",
    ],
  },
  {
    // "The [On Play] effect of OP14-074 Monet adds DON!! cards, and its
    // [On K.O.] effect gives you an additional 2 DON!! cards": the body that
    // pays the Leader's redirect back twice. Then OP10-071 Doflamingo, which
    // plays Monet or Pica from hand, and the other bodies that add DON!! on the
    // way in. Dellinger is the early redirect target. The 10-cost finisher is
    // drawn into on its own; the vanilla and non-refunding bodies follow, and
    // the searchers and Ever White last.
    slug: "op14-doflamingo",
    leader: "OP14-060",
    order: [
      "OP14-074",
      "OP10-071",
      ["OP14-071", "OP14-072", "OP14-063"],
      "OP14-067",
      "OP14-069",
      ["OP14-061", "OP14-068", "OP14-073"],
      ["OP10-065", "OP10-078", "OP14-076"],
      // The Community list's own cards, after the feature deck's, which the
      // order above was written for.
      ["OP10-072", "EB04-038", "OP14-078"],
    ],
  },
  {
    // "Use Nami or OP05-076 to secure Sanji & Pudding" is the first line of
    // Bandai's own write-up: it is what refunds the Leader's DON!! −2, so it
    // ranks first. Franky ramps once the Leader's return has put the field at
    // or under the opponent's, then the bodies that answer the board, and the
    // finisher under them because it is drawn into on its own. EB02-017 Nami
    // and OP05-076 find every card here; ST18-004 the purple ones.
    slug: "eb02-luffy",
    leader: "EB02-010",
    order: [
      "EB02-035", // Sanji & Pudding -- the refund the Leader's return needs
      "EB02-037", // Franky -- ramps from at-or-under the opponent's DON!!
      "EB02-019", // Roronoa Zoro -- rests a cost-4, attacks Characters at once
      "EB02-061", // Monkey.D.Luffy -- the finisher
      "ST18-005", // Luffy-Tarou -- plays Sanji & Pudding out of hand
      ["OP05-061", "ST18-001"], // Uso-Hachi -- 2000 Counters, rest at 8 DON!!
      "OP05-070", // Fra-Nosuke -- 2000 Counter, Rush at 8 DON!!
      "ST18-004", // Zoro-Juurou -- a second search
      "EB02-041", // Merry Go -- draws a card on play
      "OP03-072", // Gum-Gum Jet Gatling
      "EB02-017", // Nami
    ],
  },
  {
    // OP11-030 Shirahoshi and OP06-025 Camie dig for the bodies that rest the
    // opposing board and then attack it. The 6- and 7-cost {Fish-Man} are the
    // plan, Aladine replaces itself, and Vagabond Drill is the Counter the
    // Leader's active DON!! pays for. Surume and Bird Neptunian are vanilla.
    slug: "op11-jinbe",
    leader: "OP11-021",
    order: [
      ["OP11-031", "OP11-035"], // Jinbe, Fisher Tiger -- rest, then attack
      "OP06-035", // Hody Jones -- [Rush], rests two
      "OP11-024", // Aladine -- replaces itself off the opponent's removal
      "OP11-039", // Vagabond Drill -- 1-cost Counter, +3000 and a rest
      "OP11-029", // Charlotte Praline -- the list's only [Blocker]
      "OP11-033", // Bird Neptunian -- 7000 with a 2000 Counter
      "OP11-038", // Gum-Gum Elephant Gatling
      "OP11-030", // Shirahoshi
      "OP11-032", // Surume
    ],
  },
];

/**
 * Decks whose searches are **not** worth ranking by a table, with the ordering
 * a table would use kept so a later attempt starts from something rather than
 * from nothing. `search-values.test.ts` asserts none of these is registered,
 * and `pnpm deck:ab --disable search:<slug>` is what would re-open one.
 *
 * They are here because a table on each of them is worse than the deck order
 * it replaces, and the three failures say different things:
 *
 * - **op14-mihawk** has the strongest regret signal of any deck in the format
 *   and ranking on it still buys nothing. Regret existing at a decision does
 *   not mean which card answers it can be predicted from card identity.
 * - **op16-ace** wins most of the field either way, which leaves a search
 *   decision little to decide -- and against a fixed opponent an alternative
 *   can win by walking into a line that one opponent misplays, so a clean
 *   rollout pattern here is not evidence.
 * - **op16-luffy** has no pattern to author from at all: every card sits in a
 *   flat band on thin samples. Its table is the dossier reading.
 */
export const REJECTED_SEARCH_TABLES: readonly SearchTable[] = [
  {
    // The sharpest case in this file for what a table can and cannot do. This
    // deck has the format's highest share of contested searches where *some*
    // alternative would have won the game, and ranking on that still buys
    // nothing: a winning alternative existing does not mean which card it is
    // can be predicted from card identity.
    //   OP06-038           2/20  10%     OP12-023  0/6    0%
    //                                    OP17-022  0/3    0%
    //
    // Not the "expensive card converts" shape Teach's rollouts show, which is
    // why each deck is priced rather than assumed: here a 1-cost and
    // a 10-cost share the top, and the deck's *other* 10-cost is the one card a
    // search should not fetch. OP17-022 Shanks was what the deck took at 18 of
    // these 57 decisions, more than any other card.
    //
    // Kin'emon is the cost-5-or-more enabler this Leader's DON!! engine waits
    // on, at 1 cost -- so it is both the cheapest card here and the one that
    // switches the deck on. Shanks rests the opponent's board for a turn, which
    // this deck can already do; what it cannot otherwise arrange is the engine
    // running early.
    //
    // OP17-022's 0/3 is a thin sample on its own -- it is thin *because* it
    // was usually the card taken rather than the alternative -- so it is not
    // demoted on that evidence. It is demoted by the card above it, which has
    // 43 rollouts behind it.
    //
    // The rollouts were run against the deck's previous list; the table names
    // the cards the current list's searchers can find.
    slug: "op14-mihawk",
    leader: "OP14-020",
    order: [
      // The engine enabler.
      ["ST32-001"],
      // No measured preference between these, and none imposed.
      [
        "OP01-055",
        "OP06-038",
        "OP08-036",
        "OP13-031",
        "ST32-002",
        "OP12-023",
        "OP14-023",
        "OP17-031",
        "OP17-022",
      ],
    ],
  },
  {
    // The one deck where the counterfactual method that works for Teach does
    // not transfer, and the reason matters for the next attempt. The rollouts
    // are as clean as Teach's and name the expensive Edward.Newgate as the
    // card to be holding. It does not hold up as a ranking of the rest: this
    // deck wins most of the field either way, so a search decision has little
    // left to decide -- and against a fixed opponent an alternative can win by
    // walking into a line that one opponent misplays. OP16-017, the 4-cost
    // 8000 [Blocker] a dossier reading puts *first* on the grounds that "the
    // cheapest 8000 is the best find", converted nothing.
    //
    // Why the cheap 8000 is not the find: this deck already draws into its
    // 8000s, because most of the list is one. What it cannot arrange on its own
    // is having the 9-cost body at the moment the DON!! arrives to cast it, and
    // a search is the only card selection the deck has.
    //
    // Below the top tier nothing is ordered: no card there separates from the
    // rest by enough to impose a preference on a pool of interchangeable bodies
    // -- see {@link SearchTier}.
    slug: "op16-ace",
    leader: "OP16-001",
    order: [
      // The closer, and the card the deck is least likely to be holding.
      "OP16-003",
      // No measured preference.
      [
        "OP16-011",
        "OP16-014",
        "OP16-005",
        "OP16-017",
        "OP16-118",
        "OP16-021",
        "OP13-007",
        "OP13-016",
        "OP16-015",
        "OP16-010",
        "OP16-004",
        "OP16-016",
        // The Open OPTCG list's OP-17 bodies, in the same unordered pool.
        "OP17-005",
        "OP17-006",
        "OP17-016",
        "EB01-002",
        "OP10-005",
        "OP17-017",
      ],
    ],
  },
  {
    // "Turns 1-2 establish a low-cost {Impel Down} board ... so the Leader's
    // [Activate: Main] is live from turn 3", and Ivankov's search-plus-free-play
    // is the engine that board pays for. The 6- and 7-cost closers rank under
    // the 2-drops that get there.
    slug: "op16-luffy",
    leader: "OP16-022",
    order: [
      "OP16-026", // Emporio.Ivankov -- search plus free play, the engine
      "OP16-045", // Crocodile -- 6000 Blocker at 4
      "OP16-056", // Mr.3(Galdino) -- attacker, then trash to draw 2 and lock
      "OP16-027", // Jinbe -- 2000 Counter, and a turn-1 {Impel Down} body
      "ST30-014", // Mr.3(Galdino) -- 3000 at 2 cost with a 2000 Counter
      "OP16-054", // Mr.1(Daz.Bonez)
      "OP16-055", // Mr.2.Bon.Kurei -- copies the Leader's power when attacking
      "OP16-048", // Buggy -- draw plus a free Prisoner, once there is DON!! for it
      "OP16-042", // Prisoner of Impel Down -- closer, and a 2000 Counter
      "OP16-032", // Boa Hancock -- Unblockable 9000, the last turn's card
      "OP16-034", // Monkey.D.Luffy -- 0 power; the deck is holding one already
      "OP16-038", // Let's Go!! To the Navy Headquarters!!
    ],
  },
];

/** Every baseline table, compiled into its own addressable module. */
export function searchValueModules(): readonly {
  leader: string;
  create: () => PolicyModule;
}[] {
  return SEARCH_TABLES.map((table) => ({
    leader: table.leader,
    create: () => createSearchValueModule(table.slug, ranked(table.order)),
  }));
}

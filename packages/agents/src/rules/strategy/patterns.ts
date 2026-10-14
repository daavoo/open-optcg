import type { Archetype } from "../policy-module.js";

/**
 * How each Leader in the format plays, as a broad pattern.
 *
 * The strategy profiles in this directory say the same thing again in their
 * `pattern` field, so the two have to be tied together or they are two disjoint
 * sources of truth about a deck's identity.
 *
 * The table is the authority and the profiles are checked against it, rather
 * than the other way round, for a boring reason: deriving the table from the
 * profiles would make `policy-module.ts` -> `patterns.ts` -> `archetypes.ts` ->
 * `tactics.ts` -> `policy-module.ts` a real import cycle, and `archetypeOf` is
 * called from inside `tactics()`. `test/strategy-profiles.test.ts` asserts that
 * every Leader a profile claims has the matching entry here, so the link is
 * enforced rather than merely intended. A leaf module with a type-only back-edge
 * is the cheap half of that trade.
 *
 * `Archetype` is imported as a type only, so this file has no runtime imports at
 * all and can be depended on from anywhere.
 */
const ARCHETYPE_BY_LEADER: ReadonlyMap<string, Archetype> = new Map([
  ["ST21-001", "aggro"], // ST31 Monkey.D.Luffy
  ["OP12-020", "aggro"], // ST32 Roronoa Zoro
  ["OP12-040", "control"], // ST33 Kuzan
  ["OP11-062", "control"], // ST34 Charlotte Katakuri
  ["OP13-004", "midrange"], // ST35 Sabo
  ["OP10-099", "midrange"], // ST36 Eustass"Captain"Kid
  ["OP16-022", "midrange"], // OP16 Green/Blue Luffy
  // OP15 Blue/Yellow Nami. Turns Life movement into draws and buys Leader power
  // with discards on defence, so it wins on cards rather than on tempo.
  // See `analysis/nami-policy-2026-08-09.md`.
  ["OP11-041", "control"],
  // OP16 Black/Yellow Marshall.D.Teach. Control in the most literal sense the
  // format has: the Leader raises its own Characters out of removal range on the
  // opponent's turn and then spends a [Trigger] card from hand to choose which
  // of them the attack hits, so the opponent's swings are answered by
  // redirection rather than by blockers or by racing. Every redirect target is a
  // body whose [On K.O.] draws and rests something, which is what makes
  // absorbing attacks a resource engine instead of a cost. See
  // `op16-teach-policy.ts`.
  ["OP16-080", "control"],
  // OP15 Purple Enel. A six-card DON!! deck whose Leader hands four rested
  // DON!! to a 1-cost body on turn two so it swings for 6000 into a 5000
  // Leader: the deck's own dossier calls it "one of the format's fastest, most
  // aggressive decks", racing Life on a 5-to-7-turn clock, and the OP-16
  // guides it cites say the same. The grindy reading belongs to a different
  // list, built on Holly (OP15-071) and eight 6-cost Enel, which this manifest
  // does not run.
  //
  // The label alone changes nothing in play -- only the *opponent's* rules
  // read this table -- and the `aggro` root's rules add nothing to this deck,
  // so it is listed in `aggroUnenrolled` in `archetypes.ts`: the label is
  // correct, the root's rules are not inherited.
  ["OP15-058", "aggro"],
  // "SEALED-LUFFY" is not a real card number -- it is `SEALED_LEADER` from
  // `packages/decks/src/sealed.ts`, the synthetic wildcard Leader every OP17
  // sealed pool is built and piloted under. It has no identity of its own to
  // read a play pattern from (no colour, no curve, no synergy package), so
  // "midrange" is a neutral default rather than a claim about the Leader --
  // a matchup rule that says "against aggro" should not treat a random
  // sealed opponent as either extreme.
  ["SEALED-LUFFY", "midrange"],
  // OP17 Green Shanks. A prison deck: every body rests something on the way in
  // and the Leader spends a card or a DON!! to keep it rested through the
  // opponent's Refresh Phase, so the deck wins by denying attackers rather than
  // by racing. Its only hard removal (ST16-004) can shoot nothing *but* rested
  // Characters, which is the clearest statement of the plan in the list.
  ["OP17-020", "control"],
  // OP17 Blue Rocks D. Xebec. Trades cards in hand for cards off the top every
  // attack, stalls with "cannot attack" effects and Blockers, and closes with
  // OP17-118 rebuilding a board out of the hand it has been filling. It out-draws
  // rather than out-tempos.
  ["OP17-039", "control"],
  // OP10 (Blue/Black) Usopp, Bandai's own feature deck. Control: the Leader
  // makes its {Dressrosa} board cost more to remove and draws when it is
  // removed, and the deck spends its Leader's attack as a cost to dig and K.O.
  // rather than racing, closing late with OP10-058 Rebecca into Kyros.
  ["OP10-042", "control"],
  // OP14 Green Dracule Mihawk. A rest-lock deck that pays for itself: the Leader
  // rests one of its own cards to refund three DON!!, and OP01-055 turns two
  // more rested cards into two cards drawn. What it does with the tempo is deny
  // rather than race: OP17-022 rests the opponent's whole board, OP08-036 and
  // OP07-026 hold what is rested down through their Refresh Phase, ST32-002
  // locks a body active, and OP06-033 shoots what is rested. Control, and for
  // the same reason OP17-020 is.
  ["OP14-020", "control"],
  // OP17 Black Monkey.D.Luffy. The Elbaph shell: cheap giants that reach 12 cost
  // through a static layer and, in doing so, switch a board of 2-drops from 2000
  // to 5000. It commits bodies early and contests the board, which is midrange
  // rather than either extreme -- the Leader's [Blocker] aura is defensive, but
  // the curve it is defending is built to attack.
  ["OP17-079", "midrange"],
  // OP16 Red Portgas.D.Ace. The Leader grants [Rush] to an 8000-power
  // Whitebeard Pirate every turn, so a body played this turn attacks this turn
  // and the opponent never gets a window in which the new threat is only a
  // blocker. Nothing in the list stalls: the two Blockers are 8000-power bodies
  // that would rather be attacking, and the defence is Counter power out of hand
  // rather than a wall. Aggro, and the only red aggro deck in the field with a
  // top end.
  ["OP16-001", "aggro"],
  // OP17 Purple Kaido. Spends its first five turns buying DON!! rather than
  // board -- EB04-032 Queen, EB04-031 King, OP17-073/074 -- and then answers
  // whatever the opponent built with 12000-power bodies it reached several
  // turns early. Nothing in the list is a clock before that turn: the two
  // cost-10 Kaidos are a [Blocker] and a removal spell on a body, and the
  // Leader's own ability is a debuff rather than a buff. Control, and for the
  // same reason OP17-020 is.
  ["OP17-058", "control"],
  // OP17 Red/Green Luffy & Ace. The Leader penalises itself for holding a
  // 7000-base-power Character, so the whole list is 6000s and under, and the
  // second clause pays those 6000s +3000 on the opponent's turn. Read together
  // that is a deck which attacks with cheap [Rush] bodies and then defends by
  // being too big to profitably attack into -- it races, and its wall is a
  // *consequence* of the curve rather than a plan of its own. Aggro, next to
  // OP16-001 rather than next to the Green control decks its second colour
  // might suggest.
  ["ST30-001", "aggro"],
  // (Green/Yellow) Yamato. Nine of its printed clauses read "if your opponent
  // has 3 or less Life cards", four of them `[Trigger]`s that put their own
  // Character on the board for free -- so the damage that gets the opponent
  // low is also what refills the board that keeps them there. The Leader has
  // [Double Attack] and 4 Life, and the deck spends its *own* Life on purpose
  // (PRB02-016 Otama pays a Life card for a card in hand; ST28-004 is paid for
  // being at 2 or less).
  //
  // Aggro rather than midrange, despite the two 9-cost finishers: it is a
  // clock that gets faster the more damage it has already dealt, and both
  // halves of the table's Life total are resources rather than totals to
  // protect.
  ["OP06-022", "aggro"],
  // OP14 (Blue) Jinbe, Bandai's own feature deck.
  //
  // Aggro. Bandai's page calls it "an aggressive [Jinbe] deck", and the list
  // agrees: thirty-two of the fifty are Characters of cost 3 or less, and the
  // Leader turns each card in hand into two rested DON!! on one of them, so a
  // board of 3000s swings as 5000s and 7000s from the turn it lands. Two of
  // its bodies gain [Rush] off that same discard. The hand is the resource it
  // spends, and its draw -- Arlong, Chew, Fisher Tiger, the [On K.O.] draws --
  // is there to keep paying the Leader, not to out-card the opponent.
  ["OP14-040", "aggro"],
  // EB04 Red/Yellow Jewelry Bonney. The one deck in the field whose own Life
  // total is a resource it spends rather than a total it protects: the Leader
  // trades a Life card for a card in hand every turn until it is down to one,
  // and at one it gains +2000 on the opponent's turn. Everything that pays out
  // -- OP07-107 playing itself off a Life flip, EB04-061 at nine instead of
  // ten, EB04-056's [Blocker] at zero -- is gated on being *behind* on Life.
  //
  // That reads as aggro's "Life as a resource" clause and is not: the list
  // curves into two 7-drops, a 9 and a 10, and the four [Blocker]s and the
  // Life-refill package are there to survive the position the Leader's own
  // activation creates. It commits bodies, shapes the board and converts late
  // -- midrange, with the low-Life clauses making that curve affordable rather
  // than being a clock of their own.
  ["EB04-001", "midrange"],
  // OP17 (Red) Edward.Newgate. The only Leader in the field whose defensive
  // ability has no board requirement at all: once per turn, on the opponent's
  // attack, one card off the hand buys +4000 on the Leader or any Character.
  // Twenty-six of its fifty cards cannot be spent in a battle any other way,
  // so the hand is the Counter pile and every search in the deck is also a
  // Counter.
  //
  // Control rather than midrange, which is the close call here: it does commit
  // bodies and it does convert with them, which is the midrange shape. What
  // decides it is that the deck's own clock is not what it is protecting. Two
  // of its cards set the *Leader's base power* to 8000 through the opponent's
  // next end phase -- a defensive layer paid for on its own turn -- and its
  // removal is four -6000 debuffs and eight K.O.s capped at printed 2000,
  // which answers a board rather than racing one. Its Life is the one
  // resource it never spends.
  ["OP17-001", "control"],
  // OP09 (Purple/Yellow) Nico Robin. Midrange, and the call is closer than the
  // Leader's [Banish] makes it look: that keyword denies the *opponent* their
  // Triggers, which is a race clause, but everything behind it is a board.
  //
  // The deck plays four cards that put the top of its deck onto its own Life
  // and five Characters that play themselves out of Life when it is damaged,
  // so taking a hit deploys a body -- and OP17-112 Charlotte Linlin then makes
  // every one of those 4000-power bodies an 8000 on its controller's turn.
  // That is a board built out of the resource an aggro deck spends and a
  // control deck hoards, which is the midrange shape: commit, convert, and let
  // the opponent's clock pay for the next body.
  ["OP09-062", "midrange"],
  // OP16 (Purple) Sengoku. Bandai's own feature deck, and the format's only
  // ramp list: twelve of its fifty slots add DON!! cards from the DON!! deck,
  // and the Leader spends eight *active* DON!! at once to put three
  // differently-named {Admiral} Characters onto the board out of hand.
  //
  // Control rather than midrange, though the ramp reads midrange at a glance.
  // Nothing in the fifty spends a Life card, and the two Admirals that are not
  // the payoff are answers: Sakazuki gives -6000 through the opponent's next
  // End Phase and Kuzan switches a [Blocker] off for a turn. So the turns
  // before the Leader activation are spent denying the opponent's board and
  // keeping the Life total intact, which is this table's own definition of
  // control. See `op16-sengoku-policy.ts`.
  ["OP16-060", "control"],
  // OP15 (Red/Green) Krieg, Bandai's own feature deck.
  //
  // Control, and the colours are the reason it needs saying: Red/Green with a
  // curve of twenty-four 1-cost cards reads aggro at a glance. It is not a
  // clock. Every cheap body exists to hand the opponent a DON!! card, which
  // takes that DON!! out of their cost area and marks the Character the
  // Leader's once-per-turn rest may reach; three more cards then hold the
  // rested body down through the opponent's next Refresh Phase. Nothing in the
  // fifty spends a Life card, its own defensive clause is an [Opponent's Turn]
  // -2000 across their whole board, and its removal is a lost fight against a
  // body that was rested rather than an effect. It denies resources and
  // answers the board, which is this table's control shape.
  ["OP15-001", "control"],
  // OP17 (Yellow) Charlotte Linlin, Bandai's own feature deck.
  //
  // Control, and like Krieg it needs saying because the board does not look
  // like it: nine of the thirteen slots are 4000-power Characters and the deck
  // casts one nearly every turn. They are not a clock. A 4000 body is under
  // every Leader in the format, and what the deck is doing with them is
  // absorbing -- its Leader banks a card from the top of its deck onto its own
  // Life every time it attacks, six clauses in the fifty do the same, and nine
  // of the thirteen print "[Trigger] Play this card", so a Life card taken is
  // a body back. Its only removal reaches cost 1. It answers nothing and
  // outlasts everything until the 10-cost re-prices the board, which is this
  // table's control shape.
  ["OP17-099", "control"],
  // OP08 (Purple/Yellow) Charlotte Pudding, on the same OP-17 yellow [Trigger]
  // package. Its Leader ramps by turning Life face-up, and the list refills
  // that Life from the top of its deck and wins late with the 10-cost aura:
  // the same control shape.
  ["OP08-058", "control"],
  // OP05 (Yellow) Enel, an Open OPTCG list.
  //
  // Control, for the reason OP17-099 above is: the deck plays the same OP-17
  // Big Mom Pirates, 4000 bodies with "[Trigger] Play this card", and banks
  // cards from its deck onto its Life. It spends Life as freely as it banks
  // it -- Flampe and Zeus take one to hand, Kingdom Come trashes to 1 -- because
  // the Leader puts one back the first time it reaches 0 on the opponent's
  // turn.
  ["OP05-098", "control"],
  // OP15 (Red/Blue) Lucy, Bandai's own feature deck.
  //
  // Control, and like OP15-001 above the colours argue the other way: Red/Blue
  // with a 5000 Leader that grows while it attacks reads as a deck with a
  // clock. It has none. Sixteen of the fifty are Events and four more are a
  // Stage; the Characters are there to activate those Events for free, and
  // almost every Event answers a Character -- a −8000 with a K.O. rider, a
  // −3000, a bounce to the bottom of the deck. The Leader's other half trashes
  // Events out of hand to survive an attack, and its [Activate: Main] turns a
  // cast Event into a card. It answers the board and refills, which is this
  // table's control shape.
  ["OP15-002", "control"],
  // OP15 (Blue) Rebecca, Bandai's own feature deck.
  //
  // Aggro, and the Leader is why that needs saying: OP15-039 cannot attack, so
  // the deck has no Leader swing at all. It makes up for it in bodies. Twenty
  // of the fifty are 3-cost {Dressrosa} attackers the Leader plays for nothing
  // once a turn, in exchange for bouncing a 1-cost that replays for one DON!!
  // and digs on the way back in; two of them buy themselves [Rush], one makes
  // an attacker [Unblockable], and a Kyros that has already swung is bounced
  // and replayed to swing again. Its removal is tempo -- a bounce to hand and a
  // bounce to the bottom of the deck -- not a lock. It presses with a wide,
  // cheap board, which is this table's aggro shape.
  ["OP15-039", "aggro"],
  // OP13 (Black) Imu, Bandai's own feature deck.
  //
  // Midrange. The early turns dig and fill the trash with 1- and 3-cost
  // {Celestial Dragons} bodies, the middle develops 5000-power Elders through
  // the Stage the Leader starts with and answers the board with K.O. effects
  // (OP13-091, OP13-097, OP13-095), and the late game rebuilds the whole board
  // at once with OP13-082. It neither races with cheap attackers nor sits
  // behind answers; the board it develops is the win condition.
  ["OP13-079", "midrange"],
  // OP15 (Green/Black) Brook, Bandai's own feature deck.
  //
  // Midrange: it does not race. Its early turns are spent trashing its own
  // deck, which buys nothing on the board, and its threats are bodies the
  // trash makes large -- OP15-092 Luffy at 9000 base, OP15-086 Nami playing it
  // back with [Rush] -- plus removal protection in OP15-035 Laboon and OP15-094
  // Zoro. It wins on one turn it builds towards, not on early pressure.
  ["OP15-022", "midrange"],
  // OP15 (Yellow) Monkey.D.Luffy, Bandai's own feature deck.
  //
  // Midrange: the Leader has no attack text and no removal, it keeps bodies on
  // the field. Its replacement spends the top Life card to save a {Sky Island}
  // Character of 6000 base power or more, and the deck banks cards back onto
  // Life to pay for it -- so it trades Life for board, and wins with the board
  // it kept and an OP15-119 Luffy that gains [Rush] at six DON!!. One sweep
  // (OP15-114 Wyper) and one rest (OP15-102 Gan.Fall) are its interaction.
  ["OP15-098", "midrange"],
  // EB03 (Red/Blue) Nefeltari Vivi, Bandai's own feature deck.
  //
  // Midrange. The Leader hands out [Rush], which reads as a race, but what it
  // rushes is removal: thirty-four of the forty-nine are Characters of cost 5
  // or more, and most of them K.O., trash, bounce or bury an opposing body on
  // the way in before swinging the same turn. The Leader's other half spends
  // a card from hand to keep a base-cost-4-or-more body on the board. It
  // trades a card for a card every turn and keeps the board it wins, which is
  // this table's midrange shape.
  ["EB03-001", "midrange"],
  // OP14 (Red) Trafalgar Law, Bandai's own feature deck.
  //
  // Midrange. It has [Rush] at the top end, but the Leader's swap only pays
  // with two {Supernovas} bodies already on the board, so the deck spends its
  // early turns building a board of 1- and 2-cost swap partners (OP14-010
  // Hawkins replaces itself on a K.O., OP14-014 Kid plays one from hand) and
  // wins by keeping it: a small body lent a big one's base attacks, and the
  // big one's own attack is already spent or not yet open.
  ["OP14-001", "midrange"],
  // OP14 (Blue/Yellow) Boa Hancock, Bandai's own feature deck.
  //
  // Midrange. Forty-one of the forty-nine carry a [Trigger], and most of them
  // put a Character on the board when a Life card is taken, which the Leader
  // turns into a card as well -- so the deck is content to be hit, the
  // opposite of control's Life-refusing shape. It wins by holding a board it
  // rebuilt for free on the opponent's turn and answering with OP14-108
  // Rayleigh's K.O. and the OP07-051 and PRB02-017 attack locks, not by racing.
  ["OP14-041", "midrange"],
  // OP14 (Purple) Donquixote Doflamingo, Bandai's own feature deck.
  //
  // Control. The Leader spends a DON!! on the opponent's turn to move an
  // attack onto the Leader or a {Donquixote Pirates} body, and the bodies it
  // moves them onto pay back on the way out -- Dellinger and Monet return
  // DON!!, Baby 5 adds a Life card, Sugar plays another body. The deck answers
  // attacks rather than racing them, and closes with OP14-069's K.O. or its
  // three-Character rest lock.
  ["OP14-060", "control"],
  // OP13 (Red/Purple) Gol.D.Roger, Bandai's own feature deck.
  //
  // Midrange. The Leader is a 5000 until ten DON!!, so the early turns are
  // spent adding DON!! from the DON!! deck with 2- and 3-cost bodies rather
  // than racing, and the deck wins from the board it builds at ten: OP13-064's
  // 13000 body shrinks the opponent's whole board by 2000, and OP13-066
  // Rayleigh attacks the turn it lands.
  ["OP13-003", "midrange"],
  // OP16 (Black) Yamato, Bandai's own feature deck.
  //
  // Midrange. The Leader hands out [Rush], but only to a {Land of Wano} body
  // played from the trash, so the opening turns are spent filling it with
  // 1-cost diggers rather than attacking; the deck wins in the middle turns by
  // playing 8-cost Yamatos back out of it, each attacking the turn it lands.
  ["OP16-079", "midrange"],
  // OP14 (Black) Crocodile, Bandai's own feature deck.
  //
  // Midrange. The Leader cannot remove an opposing Character with its own
  // effects, so the deck does not win by clearing the board; it drains one
  // Character a turn to 0 cost, rests it with OP14-090 Mr.1 and attacks it, and
  // locks or negates the bigger ones with OP14-120 Crocodile and OP14-096
  // Ground Death. Every K.O. the Leader spends on its own side comes back as a
  // card or a body, so it grinds rather than races.
  ["OP14-079", "midrange"],
  // OP14 (Black/Yellow) Gecko Moria, Bandai's own feature deck.
  //
  // Midrange. Ten of its slots print a [Trigger] that plays a 4-or-less
  // {Thriller Bark Pirates} Character back from the trash, so every Life card
  // the opponent takes returns a body, and the Leader's own K.O. is paid for by
  // the [On K.O.]s. It grinds the board back rather than racing, and closes
  // with the 7000 and 10000 Gecko Morias it plays from hand.
  ["OP14-080", "midrange"],
  // OP12 (Black/Yellow) Koala, Bandai's own feature deck.
  //
  // Midrange. Its bodies are 5000-6000 [Blocker]s and card draw rather than
  // Rush or power, the Leader draws a card on each Leader attack once two
  // 8-cost bodies are down, and its late game is taxing the opponent's big
  // plays a Life card -- an advantage engine, not a race.
  ["OP12-081", "midrange"],
  // EB-02 (Green/Purple) Monkey.D.Luffy, Bandai's own feature deck.
  //
  // Midrange. The Leader and Sanji & Pudding turn returned DON!! into active
  // DON!!, and what that buys is ST-18's eight-DON!! board -- rest a 4- or
  // 5-cost, play a 5-cost out of hand -- before EB02-061 Luffy closes by
  // attacking twice. It develops and answers first, and races only at the end.
  ["EB02-010", "midrange"],
  // OP11 (Green/Yellow) Shirahoshi, Bandai's own feature deck.
  //
  // Midrange. The Leader cannot attack; it plays a 5- or 6-cost {Neptunian}
  // for one DON!! each turn, and the list's removal (Jinbe, Shanks, Zeus,
  // Long-Jaw) clears the way for a board of 7000-8000 bodies -- it wins by
  // outbuilding the opponent, not by racing their Life.
  ["OP11-022", "midrange"],
  // OP06 (Blue/Purple) Vinsmoke Reiju, a Store Battle 1st-place list.
  //
  // Midrange. Its bodies trade themselves for bigger copies of the same
  // {GERMA 66} names, and its removal ([On Play] −2000, K.O. a 2, bounce a 4)
  // works only while it holds no more DON!! than the opponent -- a deck that
  // trades on the board and draws off the DON!! it hands back, not a race.
  ["OP06-042", "midrange"],
  // OP11 (Red/Black) Koby, a Regional Final 2nd-place list.
  //
  // Midrange. Its {SWORD} bodies attack Characters the turn they land, after
  // a −1000 to −6000 debuff, so its turns clear the board rather than hit the
  // Leader; the Leader shields its {Navy} bodies from removal with the trash.
  ["OP11-001", "midrange"],
  // OP07 (Yellow) Vegapunk, a Store Battle 1st-place list.
  //
  // Control. The Leader cannot attack; it puts {Egghead} bodies onto the
  // field or face-up into Life, and nearly every body plays itself off a
  // [Trigger]. It wins by surviving to the low-Life turns its cards reward.
  ["OP07-097", "control"],
  // OP13 (Red/Blue) Portgas.D.Ace, Bandai's own feature deck.
  //
  // Midrange. Three Life is an aggro Leader's number, but what this one does
  // with it is draw: every hit it takes with a DON!! given to it is a card, and
  // so is every 6000 it loses, and PRB02-008 Marco and OP13-042 Newgate are
  // [Blocker]s built to be lost. It trades the board and its Life for cards,
  // and closes with OP13-057 stopping [Blocker]s once both sides are low.
  ["OP13-002", "midrange"],
  // OP12 (Blue/Purple) Sanji, Bandai's own feature deck.
  //
  // Midrange. Half the fifty are Events that draw, dig, bounce and shrink, and
  // the Characters they feed grow with the trash: OP12-063 Vinsmoke Reiju is a
  // 7000 [Blocker] at four Events and OP12-070 Sanji an 8000 at fifteen, which
  // is what turns the late game into attacks rather than defence.
  ["OP12-041", "midrange"],
  // OP11 (Green) Jinbe, Bandai's own feature deck.
  //
  // Midrange. The Leader stands a body and a DON!! up at the end of each turn
  // so the deck defends on the opponent's turn, and the 7000 and 8000 bodies
  // that rest the opposing board are what close: Bandai's write-up calls it
  // defensive-leaning, but it wins by attacking rested Characters, not by
  // outlasting.
  ["OP11-021", "midrange"],
  // OP09 (Blue) Buggy, Bandai's own feature deck, built on the ST-25 starter.
  //
  // Midrange. The Leader plays any {Cross Guild} Character from hand for five
  // rested DON!! and a card, so the deck's turns are spent putting big bodies
  // down, and its removal comes attached to them: OP09-051 Buggy and P-082
  // Crocodile each put an opposing Character on the bottom of its deck as they
  // land. It wins by out-sizing the board, not by racing Life.
  ["OP09-042", "midrange"],
  // OP12 (Red) Silvers Rayleigh, Bandai's own feature deck.
  //
  // Aggro. The Leader forbids cards of cost 5 or more, so the fifty is
  // 4-or-less Characters and Events, and Bandai's own plan is to win on the
  // number of attacks rather than their size: the Leader's +2000 turns a
  // 3000 body into a 5000 attacker without a DON!!.
  ["OP12-001", "aggro"],
  // ST-18 (Purple) Monkey.D.Luffy, Bandai's own starter deck, on the OP05-060
  // reprint Leader.
  //
  // Midrange, and the deck's Life spending is the call worth writing down.
  // The Leader buys an active DON!! for a Life card every turn, which looks
  // like the aggro trade -- Life for tempo -- but what the tempo buys is the
  // eight-DON!! field nine of the fifteen identities gate on, and every one of
  // those payoffs contests the board: rest a 5-cost, K.O. a 3-cost, -2000 to
  // two bodies, set a 6000 active. Nothing in the list is a clock; the biggest
  // body is a vanilla 12000 at 10 cost. It develops, answers, and converts
  // late, which is this table's midrange shape.
  ["OP05-060", "midrange"],
  // ST-26 (Purple/Black) Monkey.D.Luffy, Bandai's own starter deck.
  //
  // Midrange, and the DON!! returns are why rather than why not. Ten of the
  // fifty slots pay a `DON!! −2` or a "return 1 or more DON!!" cost, which
  // reads like a ramp list until you count what the returns buy: bodies on the
  // board, one per turn, not a saved-up payoff. Nothing in the deck spends a
  // Life card and nothing sits behind a wall of answers -- its only removal is
  // one 2-cost Event and a −2000 debuff -- so it neither races nor stalls. It
  // commits a Character every turn and lets the Leader's refund pay for the
  // next one, which is this table's midrange shape.
  ["OP09-061", "midrange"],
  // ST-27 (Black) Marshall.D.Teach, Bandai's own recommended list for the
  // starter deck.
  //
  // Control, and the Leader alone would nearly settle it: OP09-081 sells a
  // negation of the opponent's [On Play] effects for a card from hand, which is
  // interaction bought with resources and nothing else. The fifty agrees --
  // twelve slots are removal (OP09-090, ST27-005, PRB02-015) or the cost
  // debuffs that make the removal reach (EB01-048, OP09-083, OP09-089), eight
  // more are the two searchers, and the only thing resembling a clock is
  // OP09-086 Jesus Burgess, whose power grows out of the trash the deck fills
  // while answering. Nothing here spends a Life card and nothing races.
  ["OP09-081", "control"],
  // ST-29 (Yellow) Monkey.D.Luffy, Bandai's own starter deck.
  //
  // Midrange, and the closing package is why that needs saying: the list runs a
  // [Rush: Character] 8000 and an Event that makes the Leader [Unblockable],
  // which is an aggro ending, and the Leader's own [When Attacking] draw reads
  // as a reason to attack. It is not a clock. Every one of those payoffs is
  // gated on the deck being *behind* on Life -- the Leader draws at 2 or less
  // Life, ST29-003 Kaku grows only while its Life is at or below the
  // opponent's, ST29-015 adds its debuff at 1 or less and ST29-017 its K.O. at
  // 2 or less -- so the deck spends the early turns developing vanilla bodies
  // (ST29-006, ST29-010) and taking damage, and cashes in late. Nothing in it
  // denies the opponent a turn either: its removal is almost all on [Trigger],
  // which it cannot choose to cast. It contests the board and converts once the
  // Life counter has fallen, which is this table's midrange shape.
  ["ST29-001", "midrange"],
  // ST-22 (Blue) Ace & Newgate, Bandai's own starter deck.
  //
  // Midrange. The Leader and five Characters are card flow -- reveals off the
  // top of the deck that draw, hand out DON!! or buff a body -- and the curve
  // is a run of 4000-to-7000 vanillas, which is board contest rather than a
  // clock. The top end is two 7-cost 8000s and a 9-cost 10000 [Double Attack],
  // so it closes late; and nothing in it denies a turn beyond Fire Fist's one
  // bury, so it is not control either.
  ["ST22-001", "midrange"],
  // ST-23 (Red) Shanks, Bandai's own starter deck.
  //
  // Aggro. Twenty-six of its fifty are 3-and-4-cost Characters of 3000 to
  // 6000, and its text is power cuts that win the battles those bodies start
  // -- pressure on curve, not card flow or a late finisher. The top end is two
  // 9-cost Shanks, which mostly arrive discounted.
  ["OP09-001", "aggro"],
  // OP13 (Red/Green) Monkey.D.Luffy, the list the project ships behind
  // OP13-001.
  //
  // Midrange, although the red half reads as aggro: OP13-118 prints [Double
  // Attack] and ST31-004 a conditional [Rush]. What the fifty is built around
  // is the Leader, and the Leader is a defensive clause -- it rests the DON!!
  // left active on the opponent's turn for +2000 apiece on whatever they
  // attack -- so four of its Characters (OP13-027, OP13-118, OP14-022,
  // OP14-031) exist to set DON!! active again after they have been spent.
  // The green half rests the opponent's attackers rather than removing them,
  // and OP15-035 answers removal with a rest of its own. It develops, denies a
  // turn's attacks and absorbs the rest, which is this table's midrange shape.
  ["OP13-001", "midrange"],
]);

export function patternOf(leaderCardNumber: string): Archetype {
  return ARCHETYPE_BY_LEADER.get(leaderCardNumber) ?? "unknown";
}

/** Every Leader with a declared pattern. For consistency checks in tests. */
export function leadersWithPattern(): readonly string[] {
  return [...ARCHETYPE_BY_LEADER.keys()];
}

import type { DeckStrategyDossier } from "./types.js";

/**
 * ST-29 is a precon, so there is no tournament write-up to cite and no
 * competitive build to compare it against: both sources below are the product
 * itself, and every line here is read off the seventeen cards.
 *
 * The one thing this dossier exists to say, and the reason a generic seat
 * pilots the deck backwards, is that the Life counter runs the other way.
 * Almost every payoff in the fifty switches on when the deck is *behind*, so
 * the instruction that matters is to stop treating a Life card as something to
 * protect.
 */
export const st29Dossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Yellow) Monkey.D.Luffy - Starter Deck 29",
  archetype:
    "ST-29 Yellow Egghead Straw Hat Crew: a low-Life deck whose Leader and best cards only switch on once it is behind on Life, and which deploys off its own [Trigger]s while getting there",
  gamePlan: [
    "Read your own Life total as a resource you are meant to spend. ST29-001 draws and discards on an attack only while you have 2 or less Life; ST29-003 Kaku gains +1000 only while your Life is at or below your opponent's; ST29-015 adds its -2000 only at 1 or less Life; ST29-017 adds its K.O. only at 2 or less. A game where you are ahead on Life is a game where most of your deck is doing half of what it prints.",
    "Because of that, do not block or Counter a Leader hit early just because you can. Taking the card puts it in your hand, and four of your identities -- ST29-005 Jinbe, ST29-008 Nami, ST29-009 Nico Robin and ST29-012 Monkey.D.Luffy -- play themselves for free off a [Trigger] instead, so a Life card lost is often a body gained and a payoff switched on.",
    "Spend the early turns putting bodies down rather than holding answers. ST29-006 Stussy and ST29-010 Franky do nothing but stand there, and standing there is the plan: they contest the board while the Life total falls to where the rest of the deck wants it.",
    "Use ST29-002 Usopp on the way in and on the way out. Its rest clause fires on [On Play] and again on [When Attacking], and its ceiling is the number of your opponent's Life cards -- so it reaches its biggest targets early, while they still have Life, and shrinks as the game goes on. Cast it before their Life comes down, not after.",
    "Close with ST29-014 Roronoa Zoro and ST29-016. Zoro can attack a Character the turn it lands and turns a spare [Trigger] card into a draw plus a rested DON!! on any body; ST29-016 makes the Leader unblockable for the turn. That is the finish, and it is available only once the low-Life half of the deck has bought the turns to reach it.",
  ],
  mulligan: [
    "Keep almost everything. This deck has no searcher, so a mulligan is five fresh cards rather than a dig, and its cheap [Counter] Events -- ST29-015, ST29-016, ST29-017 -- are not dead cards, just cards for later turns: the deck expects to be defending at low Life, which is when they are at their biggest.",
    "Keep a hand with ST29-002 Usopp, ST29-011 Brook or ST29-012 Monkey.D.Luffy over one without: those are the bodies you can cast by turn three, and the deck wants a board while its Life comes down.",
    "Ship only a hand with no Character at all. Five Events is the one opener this deck cannot play out of; anything with a body in it is keepable.",
  ],
  priorities: [
    "ST29-012 Monkey.D.Luffy gives a rested DON!! to a [Monkey.D.Luffy] card once a turn, and your Leader is a [Monkey.D.Luffy] card. On a turn with a spare rested DON!! and nothing better, that is +1000 on the attacker for a 1-cost body you already played.",
    "ST29-007's [On K.O.] is a trade, not a saving throw: you pay a Life card off the top or bottom to put a card from your hand back on top of your Life. Take it when the card you are putting back is one of the four that plays itself off a [Trigger], and when the Life card you spend takes you closer to 2 rather than to 0.",
    "ST29-014's activation asks for a card with a [Trigger] from your hand. Twelve of your identities print one, so the cost is usually payable -- but a [Trigger] card is worth more on top of your Life than in your hand, so pay it with a card you have no other use for.",
    "ST29-017 Iai Death Lion Song is +4000 and, at 2 or less Life, also a K.O. on a 3-cost or smaller Character. Holding it one turn longer than comfortable is often right: the same card is worth roughly two cards once you are low.",
    "ST29-008 Nami's protection turns a Life card face-up instead of letting an {Egghead} Character be K.O.'d by an effect. A face-up Life card is still a Life card, so this saves a body without moving you off the plan.",
    "ST29-016 has two halves and they compete: [Main] makes your Leader unblockable this turn, [Counter] gives it +3000 this battle. Use the [Main] half only on a turn the unblocked attack actually ends the game, because the [Counter] half is otherwise the deck's cheapest large defensive swing.",
  ],
  commonVariants: [
    "This is the sealed product, unchanged. Competitive Yellow lists on this Leader cut the vanillas -- ST29-006 Stussy and ST29-010 Franky -- for more cheap interaction and more cards that play themselves off a [Trigger], but the low-Life gating is the same in every build.",
  ],
  commonCombos: [
    "ST29-007 Tony Tony.Chopper puts a chosen card on top of your Life; taking that Life card later plays it off its own [Trigger]. Jinbe, Nami and Nico Robin all read 'if your Leader is [Monkey.D.Luffy], play this card', and this Leader is.",
    "ST29-012 and ST29-014 are the same DON!!-gift twice at two prices: the 1-cost body repeats it every turn for free, and Zoro's version also draws, but costs a [Trigger] card out of hand.",
    "ST29-003 Kaku and ST29-013 Rob Lucci are both 5000-plus bodies whose [Trigger] is removal scaled to Life totals -- Lucci's reads the sum of both players' Life, so it is at its biggest early and hits hardest off the top of your Life rather than out of your hand.",
    "ST29-015 and ST29-017 both add a second effect at low Life on top of a power boost, so at 2 or less Life a single Counter card can win the battle and remove a body.",
  ],
  keyCardNumbers: [
    "ST29-001",
    "ST29-002",
    "ST29-007",
    "ST29-012",
    "ST29-014",
    "ST29-017",
  ],
  counterplay: [
    "Do not race this deck on Life. Every Life card you take off them switches on another half of their cards, and four of their Characters play themselves for free off the [Trigger] you hand them. Win on the board instead, and take the last Life cards only when they end the game.",
    "Kill ST29-002 Usopp on sight, and kill it early: its rest ceiling is your own Life count, so while you are at 4 or 5 Life it reaches nearly anything you have played.",
    "Play around ST29-017 once they are at 2 or less Life: a Character of cost 3 or less attacking into them is not just losing the battle, it is dying to a [Counter].",
    "ST29-008 Nami means an effect K.O. on an {Egghead} Character can simply be declined for a face-up Life card. Attack it down or remove it first if your plan depends on effect removal sticking.",
    "Their Leader only draws while they are at 2 or less Life. Ending a turn with them on 3 Life rather than 2 costs them a card a turn, which is often worth more than the extra damage.",
  ],
  sources: [
    {
      url: "https://en.onepiece-cardgame.com/cardlist/?series=569029",
      retrievedAt: "2026-09-19",
      note: "Bandai's own ST-29 card list: the seventeen identities the product contains, with the printed text every line above is read from.",
    },
    {
      url: "https://deckbuilder.egmanevents.com/api/gamedata/optcg",
      retrievedAt: "2026-09-19",
      note: "The ST29 entry in the structure-deck list, which is where the per-slot counts in the manifest come from -- 50 main-deck cards behind ST29-001.",
    },
  ],
};

import type { DeckStrategyDossier } from "./types.js";

export const op12KoalaTournamentDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Black/Yellow) Koala - 30th Place ChinoizeCup #113",
  archetype:
    "Black/Yellow {Revolutionary Army} midrange behind OP12-081, as the OP-17 field builds it: the 4-cost bodies that count as cost 8, a Yellow package that refills your own Life and plays bodies off [Trigger]s, and two 8-cost Characters that only a multicolored Leader gets the most from.",
  gamePlan: [
    "Your Leader draws 1 card when it attacks your opponent's Leader while you have 2 or more Characters with a cost of 8 or more. Getting two of them onto the field early is the whole opening.",
    "OP12-093 Morley, OP12-089 Hack and EB03-042 Koala cost 4 to play and count as cost 8 on the field behind this Leader. OP12-087 Nico Robin counts as 9 and is a [Blocker]. OP12-094 Monkey.D.Dragon and OP16-119 Marshall.D.Teach are printed at 8, and OP12-119 Bartholomew Kuma counts as 8 until the end of your opponent's next End Phase once its [On Play] has added a Life card.",
    "OP12-086 Koala looks at 3 cards and adds a {Revolutionary Army} card other than [Koala], or a Nico Robin. Morley, Hack, Dragon and both Kumas are what it finds; it does not find EB03-042 Koala.",
    "Hack is a [Blocker] whose [On K.O.] K.O.s an opposing Character with a base cost of 4 or less, so it is a fine body to block with. EB03-042 Koala's [On K.O.] on your opponent's turn plays a {Revolutionary Army} Character of cost 6 or less other than [Koala], or a Nico Robin, from your hand or trash: it replaces itself with Hack, Morley, Kuma or Robin.",
    "Your Leader's second clause, once per turn on your opponent's turn: when they play a Character with a base cost of 8 or more, or play a Character with a Character's effect, they add their top Life card to their hand. Late in the game this makes their big turns cost them Life.",
    "The Yellow half refills your Life and turns it into cards. EB04-058 Borsalino adds a Life card at 2 Life or fewer, OP12-119 Kuma trashes a card from hand to add one, and OP16-119 Teach picks the best of three. OP12-112 Baby 5's [Trigger] draws 2 because your Leader is multicolored, OP09-108 Kuma's [Trigger] plays itself once you and your opponent have 5 or fewer Life cards between you, and Teach's [Trigger] negates a Character and K.O.s one of cost 5 or less.",
    "OP14-108 Silvers Rayleigh K.O.s a Character with 7000 base power or less once your opponent is at 3 Life or fewer, from your hand or off its own [Trigger]. Hold it until the opponent is there.",
  ],
  mulligan: [
    "Keep a hand with Morley, Hack, EB03-042 Koala or OP12-086 Koala: each one is a 4-cost body that counts as 8, or finds one.",
    "A hand with none of them gives the Leader nothing to count for several turns. Take a new hand.",
  ],
  priorities: [
    "Play two cost-8 bodies before anything else. Your Leader draws on every attack after that, so the earlier they land the more cards you draw.",
    "Attack your opponent's Leader with your Leader once two cost-8 Characters are down. Attacking a Character draws nothing.",
    "Morley, OP09-108 Kuma and Baby 5 each have a 2000 Counter. Once you already have two cost-8 bodies down, a spare one in hand is a good Counter.",
    "OP12-098 Hair Removal Fist gives +2000, and another +2000 while you have a {Revolutionary Army} Character with a cost of 8 or more. Morley, Hack, EB03-042 Koala and Dragon count; Nico Robin and Teach are not {Revolutionary Army}. OP06-115 is +3000 for a card from hand.",
    "Do not spend Counters to keep your Life high while Baby 5, OP09-108 Kuma and Teach are in the deck: a hit on the Leader can be a [Trigger], and Borsalino, Kuma and Teach put Life back.",
    "Play Borsalino only at 2 Life or fewer if you want its Life card; above that it is a 6000 [Blocker] and nothing more.",
    "Nico Robin's [On Play] trashes 1 card from your hand to make an opponent holding 5 or more trash 2. Play her when they hold 5; with fewer it costs you a card for nothing.",
    "Monkey.D.Dragon puts 3 {Revolutionary Army} cards from your trash at the bottom of your deck to play a Character of cost 6 or less from your trash. Save it until the trash holds three and a target worth playing: OP12-119 Kuma for a Life card, Rayleigh for its K.O. once your opponent is at 3 Life or fewer, or Robin into a full hand.",
  ],
  commonVariants: [
    "Bandai's feature deck for this Leader is built entirely from OP-12: it runs OP12-095 Lindbergh, OP12-085 Karasu, OP12-100 Sabo, OP12-090 Belo Betty, OP12-083 Inazuma and OP12-097 Captains Assembled where this list runs EB03-042 Koala, Borsalino, OP09-108 Kuma, Baby 5, Rayleigh, Teach and OP06-115, and it plays four Nico Robin to this list's two.",
  ],
  commonCombos: [
    "Turn-four Morley, Hack or EB03-042 Koala plus a second of them: two bodies counting as 8, and your Leader draws on every attack from then on.",
    "EB03-042 Koala K.O.'d on your opponent's turn plays Hack, Morley or a Kuma back from your hand or trash, so the cost-8 count does not drop.",
    "Monkey.D.Dragon plays OP12-119 Kuma back from the trash; Kuma's [On Play] trashes a card from hand to bank the top of your deck as a Life card, and Kuma then counts as cost 8 too.",
    "Nico Robin into an opponent holding 5: you trash 1, they trash 2, and your Leader's next attack draws back the card you spent.",
  ],
  keyCardNumbers: [
    "OP12-081",
    "OP12-093",
    "OP12-089",
    "EB03-042",
    "OP12-086",
    "OP12-094",
    "OP12-119",
    "OP16-119",
    "OP14-108",
  ],
  counterplay: [
    "Their 4-cost Characters count as cost 8 on the field, out of reach of most cost-based removal. Remove by power or in battle instead.",
    "Every Leader attack they make draws a card while they have two cost-8 bodies. Taking one of the two off the board switches the draw off, but K.O.ing EB03-042 Koala on your turn is the way to do it; on their turn it plays a replacement.",
    "Their Leader taxes your Characters with a base cost of 8 or more, and any Character you play from a Character's effect, a Life card once a turn. Play those when the Life card does not matter.",
    "Their Life is a source of cards and bodies: Baby 5 draws 2, OP09-108 Kuma plays itself late, and Teach K.O.s a cost-5-or-less Character. Rayleigh's K.O. needs you at 3 Life or fewer.",
  ],
  sources: [
    {
      url: "https://play.limitlesstcg.com/tournament/6aab0e3ff1243e65f9802fec/standings",
      retrievedAt: "2026-10-17",
      note: 'The deck\'s own 50: the list pilot "Cudder04" took to 30th of 64 at [OP17] ChinoizeCup #113, an online event played on 22 Sep 2026.',
    },
    {
      url: "https://en.onepiece-cardgame.com/feature/deck/deck_069.php",
      retrievedAt: "2026-10-04",
      note: "Bandai's feature deck for OP12-081, the source of the variants line and of the Leader's two clauses as this dossier describes them.",
    },
  ],
};

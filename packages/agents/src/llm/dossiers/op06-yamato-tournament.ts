import type { DeckStrategyDossier } from "./types.js";

export const op06YamatoTournamentDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Green/Yellow) Yamato - 1st Place Pirates Party 2026-09-20",
  archetype:
    "Green/Yellow Life-stacking [Trigger] midrange behind OP06-022, as the OP-17 field builds it: a [Double Attack] Leader in front of the OP-17 {Big Mom Pirates} [Trigger] Characters, cards that add to your own Life so there are more of them to flip, and OP17-112 Charlotte Linlin to turn the 4000 bodies into 8000s on your turn.",
  gamePlan: [
    "The Leader has [Double Attack], so a Leader swing that connects takes two Life cards. Its [Activate: Main], once per turn and only while your opponent has 3 or fewer Life cards, gives up to 2 rested DON!! to one of your Characters: DON!! you already spent this turn, used a second time.",
    "EB03-057 Yamato gives up to 3 rested DON!! to your {Land of Wano} Leader on play, which puts a 5000 [Double Attack] Leader at 8000 for the attack. When it is K.O.'d, it trashes the top card of your opponent's Life.",
    "Your Life is a resource. OP17-102 Charlotte Oven, OP17-106 Charlotte Smoothie, OP17-107 Charlotte Daifuku and OP17-114 Sweet 3 Generals each have a [Trigger] that plays the card, so a hit on your Leader that turns one over puts a body on your field. OP16-119 Marshall.D.Teach's [Trigger] negates an opposing Character's effect and K.O.s a cost-5-or-less.",
    "Refill your Life with the cards you want flipped. OP15-113 Roronoa Zoro trashes a card from hand to add the top of your deck to your Life, EB04-058 Borsalino adds one at 2 Life or fewer, OP16-119 Teach picks the best of three, and Smoothie and Sweet 3 Generals add one each when you rest 2 DON!! on your turn. OP06-106 Kouzuki Hiyori takes a card from the top or bottom of your Life into your hand and puts a card of your choice from hand on top: choose a [Trigger] that plays itself.",
    "OP17-112 Charlotte Linlin is the top of the curve at 10: on your turn the base power of every Character of yours with a [Trigger] and 4000 base power becomes 8000, which is Oven, Smoothie, Daifuku, OP17-109 Charlotte Pudding and Sweet 3 Generals. On play it draws a card and either adds to your Life or puts the top of your opponent's Life into their hand.",
    "OP17-022 Shanks, also at 10, has [Rush], sets 2 of your DON!! active and rests every opposing Character, so the Leader's [Double Attack] and your bodies attack into no [Blocker]s.",
    "Early turns: OP17-113 Streusen costs 1 and takes a {Big Mom Pirates} card from the top 3, OP17-109 Charlotte Pudding trashes a [Trigger] card from hand to draw 3, and OP06-106 Hiyori sets up the top of your Life.",
  ],
  mulligan: [
    "Keep a hand with OP17-113 Streusen, OP17-109 Charlotte Pudding or OP06-106 Kouzuki Hiyori: a cheap play that finds cards or sets up your Life before the 5-costs.",
    "A hand of 5-costs and 10-costs with none of those does nothing until turn four. Take a new hand.",
  ],
  priorities: [
    "Attack with the Leader every turn it can connect. Two Life cards a hit is the fastest way to put your opponent at 3, where the Leader's DON!! gift switches on.",
    "Play EB03-057 Yamato before the Leader's attack, once you have rested DON!! to give it, so the [Double Attack] swing is at 8000.",
    "Once your opponent is at 3 Life or fewer, check the Leader's [Activate: Main] every turn: two rested DON!! on the Character they lift past the opposing Leader's power is an attack you did not have.",
    "Do not spend Counters to protect Life while you are at 3 or more and your top Life card is a [Trigger] that plays itself. The hit is a free body.",
    "Smoothie and Sweet 3 Generals' Life-adding [On Play] only works on your turn. Played by their own [Trigger] on your opponent's turn they are bodies only; hard-cast them when you want the Life card, the discard or the −3000.",
    "Pay OP17-109 Pudding's cost with a [Trigger] card you can spare. A trashed Daifuku or Smoothie is one OP17-102 Charlotte Oven can bring back: when Oven is K.O.'d it plays a Character with 4000 power or less, other than Oven, from your trash.",
    "OP13-031 Trafalgar Law returns one of your Characters to hand and plays a cost-5-or-less from hand rested. Return EB03-057 Yamato or Smoothie and play it again for a second [On Play]. Law gains [Blocker] at 1 Life or fewer.",
    "OP13-117 Gum-Gum Dawn Stamp turns your top Life card face-up to K.O. a Character of base cost 6 or less. Your opponent then sees what their next hit turns over.",
    "Hold OP05-037 for a Counter: +3000 for a card from hand.",
  ],
  commonVariants: [
    "Bandai's feature deck for this Leader is the {Land of Wano} threshold build: ST28-005 Yamato to search, ST28-002 Izo for [Banish], ST28-001 Ashura Doji, PRB02-016 Otama, and OP06-104 Kikunojo, OP06-109 Denjiro, OP06-110 Nekomamushi and ST28-003 Kin'emon as [Trigger]s that play themselves at 3 or fewer opposing Life, with OP08-023 Carrot, ST28-004 and OP06-107 Kouzuki Momonosuke and OP06-118 Roronoa Zoro. This list keeps only the Leader from that build and plays the OP-17 {Big Mom Pirates} [Trigger] package, the Life-adding Characters, EB03-057 Yamato and the two 10-costs instead.",
  ],
  commonCombos: [
    "EB03-057 Yamato gives the Leader 3 rested DON!!, and the 8000 [Double Attack] Leader takes two Life cards.",
    "OP06-106 Hiyori puts a Daifuku or Sweet 3 Generals on top of your Life; your opponent's next hit plays it for free.",
    "OP17-112 Charlotte Linlin on the field: every 4000 [Trigger] body attacks at 8000 on your turn.",
    "OP17-022 Shanks rests their whole board, and the Leader and your Characters attack with no [Blocker] in the way.",
    "OP13-031 Law returns EB03-057 Yamato and plays it again: 3 more rested DON!! on the Leader.",
  ],
  keyCardNumbers: [
    "OP06-022",
    "EB03-057",
    "OP06-106",
    "OP17-109",
    "OP17-113",
    "OP17-107",
    "OP17-112",
    "OP16-119",
    "OP17-022",
  ],
  counterplay: [
    "The Leader has [Double Attack]; Counter power spent on its attacks saves two Life cards, not one.",
    "Attacking this Leader feeds it: many of its Life cards are [Trigger]s that become a Character, and it keeps adding Life back. Take Life when it ends the game, or when you can deal with what it brings.",
    "Its 4000 bodies are 8000 on its turn while OP17-112 Charlotte Linlin is on the field, but still 4000 on yours. Attack them on your turn, and remove Linlin first.",
    "The Leader's DON!! gift needs you at 3 Life or fewer. Staying at 4 or more turns it off.",
  ],
  sources: [
    {
      url: "https://onepiecetopdecks.com/deck-list/english-op17-deck-list-the-worlds-strongest-warriors/",
      retrievedAt: "2026-10-17",
      note: 'The deck\'s own 50: entry "YG Yamato", the list "New_Genisis_Cam" took to 1st at a Pirates Party in the USA on 20 Sep 2026.',
    },
    {
      url: "https://en.onepiece-cardgame.com/feature/deck/deck_075.php",
      retrievedAt: "2026-09-04",
      note: "Bandai's feature deck for OP06-022, the source of the variants line and of the Leader's [Double Attack] and rested-DON!! gift as this dossier describes them.",
    },
  ],
};

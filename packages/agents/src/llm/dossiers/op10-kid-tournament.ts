import type { DeckStrategyDossier } from "./types.js";

export const op10KidTournamentDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Yellow) Eustass Kid - ChinoizeCup #104",
  archetype:
    "Yellow {Supernovas} [Trigger] midrange behind OP10-099, as an OP-17 online list builds it: the Leader stands a {Supernovas} Character back up as a [Blocker] each turn, Thriller Bark Characters replay each other from the trash off their [Trigger]s, and Life-adding Characters keep the [Trigger]s coming.",
  gamePlan: [
    'At the end of each of your turns the Leader may turn your top Life card face-up to set one of your {Supernovas} Characters of cost 3 to 8 active and give it [Blocker] until the end of your opponent\'s next turn. Attack with that Character first, then stand it up to defend. The {Supernovas} here are ST36-002 Killer, ST36-003 Scratchmen Apoo, P-088 Trafalgar Law, ST36-005 and OP10-112 Eustass"Captain"Kid.',
    'OP10-112 Eustass"Captain"Kid rests itself on play to trash the top card of your opponent\'s Life, which takes Life without giving them the card or a [Trigger]. The Leader then sets it active as a [Blocker] at the end of the same turn.',
    'ST36-005 Eustass"Captain"Kid, on your opponent\'s attack, turns a Life card face-down to move the attack onto one of your Eustass"Captain"Kid Characters with 5000 base power or more: itself or OP10-112. Its [Activate: Main] turns a Life card face-up to give the Leader a rested DON!!.',
    "Most hits on your Leader give you something. OP14-102 Kumacy, OP14-110 Dr. Hogback and OP14-111 Perona play a {Thriller Bark Pirates} Character of cost 4 or less from your trash rested off their [Trigger]; OP17-114 Sweet 3 Generals plays itself; ST36-003 Apoo draws and makes the Leader's base power 7000; OP16-119 Teach negates and K.O.s a cost 5 or less.",
    "Put Life back. ST36-002 Killer adds a card on your turn, OP16-119 Marshall.D.Teach chooses the best of three for the top, OP17-114 Sweet 3 Generals adds one and gives two opposing Characters -3000, and EB04-058 Borsalino adds one at 2 Life or fewer.",
  ],
  mulligan: [
    "Keep OP17-109 Charlotte Pudding with a [Trigger] card to trash: it draws 3.",
    "Keep a 4-cost Character -- Killer, Perona, Dr. Hogback or Law -- for the early board.",
    "Ship a hand of only 6-cost and higher; the list has no searcher outside Pudding's [Trigger].",
  ],
  priorities: [
    "Use the Leader's end-of-turn clause every turn you have a {Supernovas} Character of cost 3 to 8 that attacked: it is a free extra [Blocker] for your opponent's turn.",
    "OP14-111 Perona's [On Play] and [On K.O.] each stop an opposing Character of cost 6 or less from attacking until the end of their next turn. Aim it at their biggest attacker.",
    "OP14-110 Dr. Hogback's [On K.O.] plays a Character of cost 4 or less with a [Trigger] from your trash -- Perona, Killer, Law, Apoo, Kumacy or Pudding. Let it trade.",
    "OP17-109 Pudding's draw costs a [Trigger] card from hand. Trash a Thriller Bark Character, since the [Trigger]s of Kumacy, Hogback and Perona can play it back from the trash.",
    "OP17-114 Sweet 3 Generals' [On Play] works only on your turn and costs resting 2 DON!!: leave 2 DON!! when you play it.",
    "OP10-112 Kid draws and trashes at the end of your turn while your opponent is at 2 Life or fewer. Trash their Life with it on the way there.",
    "OP15-119 Monkey.D.Luffy reveals your top Life card when your opponent uses an Event or [Blocker] and gains +1000 per cost on it. Use Teach to put an 8-cost on top first. It has [Rush] with 6 or more DON!! on your field.",
    "P-088 Law plays itself off a [Trigger] only while the two Life totals add up to 5 or less, and ST36-002 Killer only while your opponent is at 3 or fewer: both are late-game [Trigger]s.",
  ],
  commonVariants: [
    'The starter list for this Leader runs ST36-001 Cavendish, ST36-004 Bartolomeo, OP10-101 Urouge, OP10-103 Capone"Gang"Bege, OP10-109 Basil Hawkins, OP10-111 Monkey.D.Luffy, OP10-114 X.Drake, OP12-113 Roronoa Zoro, P-085 Jewelry Bonney and OP13-116. This list cuts them for the Thriller Bark recursion package, the {Big Mom Pirates} draw and Life cards, OP10-112 Kid, Teach, Borsalino and OP15-119 Luffy.',
  ],
  commonCombos: [
    "OP10-112 Kid rests to trash a Life card, and the Leader sets it active as a [Blocker] at the end of the turn.",
    "Dr. Hogback is K.O.'d and replays Perona from the trash, and Perona's [On Play] stops another attacker.",
    "A Kumacy, Hogback or Perona [Trigger] replays a Thriller Bark body that OP17-109 Pudding trashed for its draw.",
    "ST36-005 Kid redirects an attack to OP10-112 Kid, a 9000 body, with the Leader's face-up Life card turned face-down as the cost.",
  ],
  keyCardNumbers: [
    "OP10-099",
    "OP10-112",
    "ST36-005",
    "OP14-110",
    "OP14-111",
    "OP17-109",
    "OP16-119",
  ],
  counterplay: [
    "The Leader turns one attacker into a [Blocker] each turn. Count one more Blocker than you see when you plan an attack.",
    "ST36-005 Kid moves an attack onto a Kid with 5000 base power or more. Make it spend that on a small attack before the one that matters.",
    "The Thriller Bark Characters come back from the trash off [Trigger]s and Hogback's [On K.O.]. Rest or bounce them rather than K.O.ing them when you can.",
    "Perona stops one of your Characters of cost 6 or less from attacking. Keep a bigger attacker in reserve.",
  ],
  sources: [
    {
      url: "https://play.limitlesstcg.com/tournament/6a8f03677a62de813013f933/standings",
      retrievedAt: "2026-10-17",
      note: 'The deck\'s own 50: the list pilot "Ssjrose" registered for [OP17] ChinoizeCup #104, an online event of 64 played on 1 Sep 2026; the pilot dropped at 0-2, so the list has no placing.',
    },
  ],
};

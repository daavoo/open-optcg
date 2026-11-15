import type { DeckStrategyDossier } from "./types.js";

export const op18LuffyPreviewDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Green) Monkey.D.Luffy - OPTCG Deck Explorer OP-18 Pre-release",
  archetype:
    "Green OP18-022 Monkey.D.Luffy as a DON!!-ramp midrange deck: a curve of {Straw Hat Crew} Characters whose [On Play]s set spent DON!! active again, rest-and-K.O. pieces (Shimotsuki Kouzaburou, Megalo, Carrot) to clear and lock the opponent's board, and OP18-029 Tony Tony.Chopper to load the Leader with DON!! for a turn of extra attacks. The Leader, with 3 DON!! given, may stand itself up once per turn as it attacks, at the price of not refreshing in your next Refresh Phase.",
  gamePlan: [
    "The Leader's [DON!! x3] [When Attacking] is optional and once per turn: set the Leader active, and it then skips your next Refresh Phase. Attack again with it and it stays rested through the opponent's turn and your whole next turn -- two Leader attacks now for none next turn. Stand it up and do not attack again, and it simply ends the turn active; the skipped Refresh does nothing to a Leader that is already active.",
    "This list plays nothing else that sets the Leader active, so the second Leader attack is a real trade. Spend it when the extra hit takes a Life that matters -- the opponent at 2 or fewer, or a turn you can close -- and otherwise use the restand only to keep the Leader standing.",
    "The DON!! engine: P-102 Nami and OP13-037 Roronoa Zoro set 2 DON!! active on play, OP13-027 Sanji sets 2, OP18-027 Zoro & Sogeking sets 2, OP13-034 Brook sets 1. Each is a cheaper play than its printed cost, and the DON!! it gives back can be played again or given to the Leader to reach 3.",
    "OP18-029 Tony Tony.Chopper is the top end: a 9-cost [Rush] whose once-per-turn [When Attacking] gives up to 3 of your rested DON!! to the Leader and stands Chopper up, then Chopper skips your next Refresh Phase. The DON!! you spent to play it become the Leader's 3, so the same turn the Leader attacks with its ability live: Chopper, the Leader, the Leader again and Chopper again.",
    "OP18-027 Zoro & Sogeking keeps the Leader alive: on the opponent's turn an active [Monkey.D.Luffy] Leader holding 3 or more given DON!! has 7000 base power. Given DON!! stay on the Leader until your Refresh Phase, so attack once with 3 given, stand the Leader up with its own ability, and stop -- it defends at 7000 with Zoro & Sogeking on the field.",
    "Control the board with rests and K.O.s: OP12-029 Shimotsuki Kouzaburou rests a cost 2 or less and then K.O.s a rested base cost 1 or less; EB04-018 Megalo rests itself to K.O. a rested Character with 8000 power or less; OP08-023 Carrot keeps a rested cost 7 or less from refreshing, on play and again each time it attacks; Zoro & Sogeking stops a cost 6 or less from being rested, so it can neither attack nor block, through the opponent's next turn.",
    "ST30-012 Monkey.D.Luffy rests a DON!! to gain [Rush] and rests an opposing [Blocker] when it attacks: play it on the turn you want the Leader's or Chopper's attacks to land without a block.",
  ],
  mulligan: [
    "Keep early Characters: EB02-017 Nami (finds a {Straw Hat Crew} card), Brook, Shimotsuki Kouzaburou and the 4-costs -- P-102 Nami, Megalo, PRB02-006 Roronoa Zoro, OP18-030 Nami, ST30-012 Luffy.",
    "A hand of Sanji, Carrot, Law, Zoro & Sogeking and Chopper with nothing at 4 or less takes a new hand: the ramp only pays once the curve is on the board.",
  ],
  priorities: [
    "Play the DON!!-setting Characters before anything else in the turn, and spend the DON!! they give back on a second play or on the Leader.",
    "The end-of-turn halves of Sanji and OP14-022 Usopp set DON!! active after your turn is over; this list plays no Event and no cost it pays on the opponent's turn, so those DON!! do nothing. Value Usopp as a 4-cost 5000 body and Sanji for its [On Play].",
    "OP13-037 Roronoa Zoro stands itself up at the end of your turn: attack with it every turn, it is still there to defend.",
    "Rest before you K.O.: Megalo and the second half of Shimotsuki Kouzaburou only reach a rested Character, and Carrot only locks a rested one. Their Characters are rested after they attack, or Shimotsuki's first half rests a small one for you.",
    "OP13-031 Trafalgar Law returns one of your Characters to hand to play a cost 5 or less from hand rested. Return a spent [On Play] -- P-102 Nami, Sanji, Megalo, Carrot -- to cast it again, and bring Sanji, Carrot or Zoro & Sogeking down rested. Law gains [Blocker] at 1 or fewer Life.",
    "OP18-030 Nami is a 4-cost 6000 that loses 2000 while rested on the opponent's turn: attack with it when the swing matters, keep it back when you need the body to hold up.",
    "PRB02-006 Roronoa Zoro is the only full-time [Blocker]; on the opponent's turn it can rest another of your Characters in its place when their Character's effect would rest it.",
    "Counters are on bodies only: Megalo, Shimotsuki Kouzaburou, P-102 Nami, OP18-030 Nami and PRB02-006 Zoro give +2000; Sanji, Law, ST30-012 Luffy and Zoro & Sogeking give nothing.",
  ],
  commonVariants: [
    "This is an automated builder's list, and it skips the Leader's dedicated OP-18 package. The fan builds behind the same Leader play OP18-024 Kokoro, OP18-025 Gonbe, OP18-028 Chimney, OP18-031 Nico Robin or OP18-036 Monkey.D.Luffy, each of which sets the Leader active at the end of your turn, so the Leader can attack twice every turn and still stand to defend. Without them this list spends the restand sparingly.",
    "Those builds also run OP18-037 Yokozuna, OP18-118 Monkey.D.Luffy, OP18-038 Shoot Down That Flag., OP14-031 Nami, OP14-033 Perona, OP17-029 Hongo and rest Events such as OP12-037; this list instead fills the curve with the FILM and Egghead DON!!-ramp Straw Hats, the Shimotsuki/Megalo/Carrot rest-and-K.O. suite, Law and Chopper.",
  ],
  commonCombos: [
    "Play Chopper, attack with it and give 3 rested DON!! to the Leader; attack with the Leader, stand it up, attack again, then swing Chopper a second time.",
    "Attack once with the Leader holding 3 given DON!!, stand it up and pass with Zoro & Sogeking on the field: the Leader defends at 7000.",
    "Shimotsuki Kouzaburou rests a small Character and Megalo K.O.s it; Carrot keeps a bigger rested one from refreshing.",
    "Law returns a spent P-102 Nami or Sanji to hand and plays Carrot rested; replay the returned card next turn for its DON!! again.",
  ],
  keyCardNumbers: [
    "OP18-022",
    "OP18-029",
    "OP18-027",
    "OP13-027",
    "P-102",
    "EB04-018",
    "OP08-023",
    "OP12-029",
    "ST30-012",
  ],
  counterplay: [
    "A Leader that attacked twice is rested until the turn after next: that is the turn to press, it neither attacks nor defends at 7000.",
    "Zoro & Sogeking's 7000 needs the Leader active with 3 given DON!! -- remove Zoro & Sogeking and the Leader defends at 5000.",
    "Their removal reaches only rested Characters or very small ones; attack with what you can leave rested and keep larger bodies back.",
    "They play no Counter Event and only one full-time [Blocker]: attacks into a hand without 2000 counters land.",
  ],
  sources: [
    {
      url: "https://optcgdeckexplorer.com/",
      retrievedAt: "2026-11-15",
      note: "The deck's own 50: the homepage's NEWLISTS entry \"OP18-022\", style \"control\", dated 2026-11-14 -- an automated deck builder's list, not a person's.",
    },
    {
      url: "https://optcgdeckexplorer.com/guides/OP18-022/",
      retrievedAt: "2026-11-15",
      note: "The Leader's guide page for the same builder list, describing the Leader as a repeated-attack deck; on that read it showed one fewer Shimotsuki Kouzaburou.",
    },
  ],
};

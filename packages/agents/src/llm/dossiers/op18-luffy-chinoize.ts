import type { DeckStrategyDossier } from "./types.js";

export const op18LuffyChinoizeDossier: DeckStrategyDossier = {
  version: 1,
  deckId: "(Green) Monkey.D.Luffy - 31st Place ChinoizeCup #136",
  archetype:
    "Green OP18-022 Monkey.D.Luffy as a reset deck: the Leader stands itself up to attack twice a turn, and {Water Seven} Straw Hats -- OP18-031 Nico Robin, OP18-036 Monkey.D.Luffy and OP18-118 Monkey.D.Luffy -- set it active again at the end of your turn, so it still stands to defend, at 7000 behind OP18-027 Zoro & Sogeking. This build leans on Events: OP16-039 gives the Leader [Double Attack] for the turn, OP18-039 and the [Counter] halves of OP12-037, OP13-040 and OP17-038 defend it, and rest effects open the board for EB04-018 Megalo's K.O.",
  gamePlan: [
    "The Leader's [DON!! x3] [When Attacking] is optional and once per turn: set the Leader active, and it then skips your next Refresh Phase. Attack with the Leader holding 3 given DON!!, stand it up, and attack with it again.",
    "The skipped Refresh only costs something if the Leader ends your turn rested. OP18-031 Nico Robin sets up to 1 {Water Seven} card and 1 DON!! active at the end of your turn, OP18-118 Luffy sets up to 1 Water Seven card active, and OP18-036 Luffy can trash itself to draw 1 and set the Leader active. The Leader is a Water Seven card, so with one of them on the field the second Leader attack is free -- take it every turn.",
    "OP16-039 Gum-Gum Twin Jet Pistol gives one of your [Monkey.D.Luffy] cards [Double Attack] for the turn, and the Leader is one: each of its two attacks then takes 2 Life. Play it on the turn the Leader attacks twice and the opponent's Life is low enough for it to matter.",
    "Load the Leader: OP16-035 Roronoa Zoro rests an opposing card and can trash a card from hand to give up to 3 rested DON!! to your Leader -- exactly what its [DON!! x3] asks for. OP18-027 Zoro & Sogeking sets 2 DON!! active on play, OP13-037 Zoro sets 2 active and stands itself up at the end of your turn, and OP18-118 Luffy sets 3 (a 9-cost that costs 6).",
    "OP18-027 Zoro & Sogeking keeps the reset Leader safe: on the opponent's turn an active [Monkey.D.Luffy] Leader holding 3 or more given DON!! has 7000 base power. Given DON!! stay on the Leader until your Refresh Phase, so the Leader that attacked twice with 3 given and was set active at your end of turn defends at 7000.",
    "Rest, then K.O.: OP14-031 Nami ([Blocker]) rests up to 2 of the opponent's Characters with cost 8 or less, OP12-037's [Main] rests 3 of your DON!! to rest up to 2 of their Characters or DON!!, and OP17-038's [Main] rests 4 of your cards to rest one Character. EB04-018 Megalo rests itself to K.O. a rested Character with 8000 power or less, and OP13-040's [Main] keeps up to 2 rested Characters of cost 7 or less from standing in their next Refresh Phase.",
  ],
  mulligan: [
    "Keep a hand with a Character at 4 or less -- EB02-017 Nami, OP18-026 Sanji, OP18-036 Luffy, Robin, OP13-037 Zoro, Megalo or OP14-031 Nami -- and prefer one with a reset piece or a way to find one: Robin and OP18-036 Luffy, or EB02-017 Nami and OP18-038 Shoot Down That Flag., which look 5 deep for a {Straw Hat Crew} card.",
    "A hand of Zoro & Sogeking, OP16-035 Zoro and the 9-cost Luffy with nothing at 4 or less takes a new hand.",
  ],
  priorities: [
    "Get a reset piece on the field before the turn the Leader attacks twice: Robin is the one that stays, OP18-036 Luffy is spent when it resets the Leader, and OP18-118 Luffy is the late one.",
    "OP18-036 Luffy's reset trashes it, so use it on a turn the Leader attacked twice and no Robin or 9-cost Luffy is on the field; with one of those already out, keep the 2-cost as a +2000 Counter body.",
    "OP18-039 Gum-Gum Giant Axe gives a [Monkey.D.Luffy] +2000 and draws a card if your Leader is active: the reset Leader is active on the opponent's turn, so it is a Counter that replaces itself.",
    "OP18-026 Sanji trashes itself instead of another {Straw Hat Crew} Character leaving the field to the opponent's effect, and Robin can rest itself instead on the opponent's turn: keep both in front of Zoro & Sogeking and the 9-cost Luffy.",
    "Rest before you K.O.: play OP14-031 Nami or an Event's [Main] to rest their Characters, then Megalo K.O.s one of 8000 power or less. Their Characters are also rested after they attack.",
    "Zoro & Sogeking and the 9-cost Luffy keep one opposing Character from being rested until the end of the opponent's next turn, so it can neither attack nor block -- but your own rest effects and Megalo cannot reach it either. Lock the ones you will not K.O.",
    "OP12-037, OP13-040 and OP17-038 are Counters first: +3000 on the Leader, and OP17-038 trashes a card for +3000 on the Leader or a Character. Spend their [Main]s only when the rest or the lock opens lethal or saves the board.",
    "Counters: Megalo, OP18-026 Sanji and OP18-036 Luffy give +2000; EB02-017 Nami, OP14-031 Nami, Robin and OP13-037 Zoro give +1000; Zoro & Sogeking, OP16-035 Zoro and the 9-cost Luffy give nothing.",
  ],
  commonVariants: [
    "The DuelVoyager weekly's 2nd-place list (3 Nov 2026) plays the same reset core with four each of OP14-033 Perona, OP17-029 Hongo, OP18-030 Nami and OP18-037 Yokozuna, four Megalo and four OP14-031 Nami, and only OP12-037 as an Event besides the search: more Blockers and rest-locks, fewer Counters.",
    "Other OP-18 builds of this Leader add OP18-024 Kokoro, OP18-025 Gonbe and OP18-028 Chimney, which also set the Leader active at the end of your turn, and OP18-029 Tony Tony.Chopper.",
  ],
  commonCombos: [
    "OP16-035 Zoro gives the Leader 3 rested DON!!; the Leader attacks, stands up and attacks again; at the end of your turn Robin or the 9-cost Luffy sets it active, and with Zoro & Sogeking out it defends at 7000.",
    "OP16-039 on the Leader before its two attacks: four Life at risk from one card.",
    "OP14-031 Nami rests two of their Characters and Megalo K.O.s one; OP13-040 keeps the other rested through their next turn.",
  ],
  keyCardNumbers: [
    "OP18-022",
    "OP18-031",
    "OP18-036",
    "OP18-118",
    "OP18-027",
    "OP16-039",
    "OP16-035",
    "EB04-018",
    "OP18-039",
  ],
  counterplay: [
    "The reset pieces are what make the Leader's second attack free: remove Robin and the 9-cost Luffy, and a Leader that attacks twice stays rested through your turn and theirs.",
    "OP16-039 makes each of the Leader's two attacks a Double Attack: keep Counters and Blockers for the Leader's attacks rather than the Characters'.",
    "Zoro & Sogeking's 7000 needs the Leader active with 3 given DON!! -- remove Zoro & Sogeking and the Leader defends at 5000.",
    "Their K.O. reaches only rested Characters of 8000 power or less; keep larger bodies back. OP18-026 Sanji and Robin absorb your removal, so remove them first.",
  ],
  sources: [
    {
      url: "https://play.limitlesstcg.com/tournament/6af5879bdcbca32da6c4f034/standings",
      retrievedAt: "2026-11-18",
      note: "The deck's own 50: the list Cinnas took to 31st of 121 (4-3) at [OP18] ChinoizeCup #136 MONDAY on 16 Nov 2026, read off the standings API's decklist; the event's decklists were later made private, and the standings still show the placing.",
    },
    {
      url: "https://www.duelvoyager.com/deck/view/nw5aki09O9IE",
      retrievedAt: "2026-11-15",
      note: "BerryTCG's DuelVoyager share, the 2nd-place list of a DuelVoyager online weekly on 3 Nov 2026: the first variants line.",
    },
  ],
};

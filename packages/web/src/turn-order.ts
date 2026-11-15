/**
 * Who goes first, settled the way a table settles it: a roll decides which
 * player chooses, and that player picks first or second before either hand is
 * looked at.
 *
 * The engine only takes a starting seat, so the roll and the choice happen
 * here, before the game is created, and the match config records the seat they
 * produced. A save or a trace therefore replays without the roll and without
 * asking again; only a new match whose config still says `random` is rolled.
 */
import { nextInt, seedRng } from "@one-piece-sim/engine-core";
import type { PlayerId } from "@one-piece-sim/protocol";
import type { MatchConfig } from "./controller.js";
import { escapeHtml } from "./card-text.js";
import { hydrateIcons, icon } from "./icons.js";

export type TurnOrderChoice = "first" | "second";

/** The seat that won the roll and so chooses. Drawn from the match seed. */
export function turnOrderChooser(seed: string): PlayerId {
  return nextInt(seedRng(`${seed}:turn-order-roll`), 2).value === 0
    ? "p1"
    : "p2";
}

export function startingPlayerFor(
  chooser: PlayerId,
  choice: TurnOrderChoice,
): PlayerId {
  if (choice === "first") return chooser;
  return chooser === "p1" ? "p2" : "p1";
}

/**
 * An agent that wins the roll goes first. No agent models the choice, and
 * first is what a deck takes unless it is built to want the extra card: the
 * first player's turn 1 is a full turn of development the second player has to
 * answer, which is worth more to every deck in the pool than the opening draw.
 */
const AGENT_CHOICE: TurnOrderChoice = "first";

/**
 * Resolves `random` to a seat, asking whoever won the roll when that seat is a
 * person's. Any other `startingPlayer` is returned as it is: a seat pinned in
 * the matchup settings is not rolled for.
 */
export async function settleTurnOrder(
  config: MatchConfig,
): Promise<MatchConfig> {
  if (config.startingPlayer !== "random") return config;
  const chooser = turnOrderChooser(config.seed);
  const humans = (["p1", "p2"] as const).filter(
    (seat) => config[`${seat}Controller`] === "human",
  );
  let choice = AGENT_CHOICE;
  if (humans.includes(chooser)) {
    choice = await askTurnOrder(seatName(chooser, humans.length));
  } else if (humans.length > 0) {
    await announceTurnOrder(choice);
  }
  return { ...config, startingPlayer: startingPlayerFor(chooser, choice) };
}

/** "You" at a table with one person; the seat's side when both are people. */
function seatName(seat: PlayerId, people: number): string {
  if (people < 2) return "You";
  return seat === "p1" ? "The left player" : "The right player";
}

function askTurnOrder(chooser: string): Promise<TurnOrderChoice> {
  const verb = chooser === "You" ? "choose" : "chooses";
  return showDialog(
    `${chooser} won the roll`,
    `${chooser} ${verb} whether to go first or second, before the opening hands are seen.`,
    `<button class="primary" type="button" data-turn-order="first">${icon("play", "Go first")}Go first</button>
     <button class="secondary" type="button" data-turn-order="second">${icon("hourglass", "Go second")}Go second</button>`,
  );
}

async function announceTurnOrder(choice: TurnOrderChoice): Promise<void> {
  await showDialog(
    "Your opponent won the roll",
    `They chose to go ${choice}.`,
    `<button class="primary" type="button" data-turn-order="${choice}">${icon("check", "Continue")}Continue</button>`,
  );
}

/**
 * A modal of its own rather than one of a screen's: it is raised from the
 * lobby and from sealed mode alike, and is gone before either screen repaints
 * into the board. There is no close button -- the match does not start until
 * the order is settled.
 */
function showDialog(
  title: string,
  message: string,
  actions: string,
): Promise<TurnOrderChoice> {
  const backdrop = document.createElement("div");
  backdrop.className = "app-dialog-backdrop";
  backdrop.id = "turn-order";
  backdrop.innerHTML = `<div class="app-dialog" role="dialog" aria-modal="true" aria-labelledby="turn-order-title">
    <h2 id="turn-order-title">${escapeHtml(title)}</h2>
    <p class="app-dialog-note">${escapeHtml(message)}</p>
    <div class="app-dialog-actions">${actions}</div>
  </div>`;
  document.body.append(backdrop);
  hydrateIcons();
  backdrop
    .querySelector<HTMLElement>("[data-turn-order]")
    ?.focus({ preventScroll: true });
  return new Promise((resolve) => {
    backdrop
      .querySelectorAll<HTMLElement>("[data-turn-order]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          backdrop.remove();
          resolve(button.dataset.turnOrder as TurnOrderChoice);
        });
      });
  });
}

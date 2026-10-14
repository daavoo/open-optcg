import { createInterface } from "node:readline";
import { requestSchema, type ProtocolRequest } from "@one-piece-sim/protocol";
import { EngineError, GameService } from "@one-piece-sim/engine-core";
import { resolveMatchDecks } from "@one-piece-sim/decks";

const service = new GameService();

function dispatch(request: ProtocolRequest): unknown {
  switch (request.method) {
    // The protocol names decks by id, and this is where an id becomes a deck:
    // a bot on the other end of the pipe cannot resolve a decklist it does not
    // have, so the id stays the public handle and the server owns the catalog.
    case "game.create":
      return service.create({
        ...resolveMatchDecks(request.params),
        seed: request.params.seed,
      });
    case "game.observe":
      return service.observe(request.params.gameId, request.params.playerId);
    case "game.act":
      return service.act(
        request.params.gameId,
        request.params.revision,
        request.params.actionId,
      );
  }
}

const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
lines.on("line", (line) => {
  let id: string | null = null;
  try {
    const parsed: unknown = JSON.parse(line);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "id" in parsed &&
      typeof parsed.id === "string"
    )
      id = parsed.id;
    const request = requestSchema.parse(parsed);
    process.stdout.write(
      `${JSON.stringify({ v: "1", id: request.id, result: dispatch(request) })}\n`,
    );
  } catch (error) {
    const code = error instanceof EngineError ? error.code : "INVALID_REQUEST";
    const message = error instanceof Error ? error.message : "Unknown error";
    process.stdout.write(
      `${JSON.stringify({ v: "1", id, error: { code, message } })}\n`,
    );
  }
});

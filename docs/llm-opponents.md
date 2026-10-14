# LLM opponents

The built-in Heuristics opponent needs no setup and plays every deck reasonably
well. An LLM opponent plays better and is the closest thing here to a human
across the table, but it needs an API key and costs money per game.

It only works when the app is served by a local process, because an API key
cannot be kept secret in a web page. On the hosted page and in the standalone
HTML file the option is listed but inert, and picking it sends you here.

## From a checkout

```sh
OPENAI_API_KEY=sk-... LLM_MODEL=gpt-5-mini pnpm web:serve
```

Open <http://127.0.0.1:4173>, choose **LLM** as the opponent controller, start
the match. `--port=` changes the port, `--model=` overrides `LLM_MODEL`. Copy
`.env.example` to `.env` to stop passing variables on every run. Settings saved
in the app's dialog override these: **Configure matchup** in the 1v1 lobby, or
the sealed builder's tool rail, takes a provider, key and model. The key is
stored by the local server in `~/.open-optcg/llm.json` and never reaches the
page.

| Provider                                                     | Variables                                       |
| ------------------------------------------------------------ | ----------------------------------------------- |
| OpenAI (default)                                             | `OPENAI_API_KEY`, `LLM_MODEL`                   |
| Any OpenAI-compatible endpoint using the Responses API       | plus `LLM_BASE_URL`                             |
| Any OpenAI-compatible endpoint using `/chat/completions`     | plus `LLM_BASE_URL`, `LLM_API=chat`             |
| Google Gemini                                                | `GEMINI_API_KEY`, `LLM_MODEL`, `LLM_API=gemini` |
| A local [otari](https://github.com/mozilla-ai/otari) gateway | see below                                       |

`LLM_MODEL` is the model id as the provider spells it. Some endpoints reject
strict JSON schemas; `LLM_STRUCTURED_OUTPUTS=off` falls back for those.

## What it costs

One request per real decision, a few hundred per game. The conversation is
reused for the whole game and the stable part of the prompt (rules, card text,
deck lists) is sent with a cache key, so most tokens are cache reads. It is
still the expensive way to play. Check your provider's dashboard after a game
or two before running a batch.

## When it plays badly

**Match history** in the game toolbar shows, under each step, the action the
model chose and the provider's reasoning summary under an **LLM reasoning**
fold. **Export trace** saves those calls with the exact request and response
bodies alongside the replayable game, and that file is what to attach to an
issue about a bad play. `LLM_LOG_PATH=calls.jsonl` before `pnpm web:serve`
keeps a server-side copy. All of these contain the model's hidden hand.

## In a terminal

`pnpm play` offers **LLM** as a controller for either seat, and
`pnpm play:sealed` gives the sealed opponent seat to a model. Both read the same
variables. `--trace <path.json>` records the match plus `<path>.llm.jsonl` with
one line per provider call.

For a batch:

```sh
pnpm matchup:llm --left ST31 --right ST32 --games 10 --out traces/st31-st32
```

`--p1-pilot` and `--p2-pilot` take `llm`, `rules`, `random` or `first`. Seats
alternate between games so a deck's record is not a first-player record in
disguise. Each game writes one diagnostics JSONL in the same format the browser
exports.

## Routing through a local gateway

[otari](https://github.com/mozilla-ai/otari) is an OpenAI-compatible gateway you
run yourself. Provider keys live in the gateway, model ids become
provider-prefixed, and each request carries a label so spend can be sliced per
matchup and seat.

```sh
export OPENAI_API_KEY=...          # handed to the gateway, not to this project
pnpm otari:up                      # starts it on :8000, prints its gw- key
eval "$(pnpm --silent otari:env)"  # sets GATEWAY_API_*, unsets OPENAI_API_KEY
LLM_MODEL=openai:gpt-5-mini pnpm web:serve
pnpm otari:down
```

Requires Docker. `pnpm otari:status` and `pnpm otari:key` report the container
state and its bootstrap key. Set `OTARI_PROVIDER_API_BASE` before `otari:up` to
point the gateway at your own endpoint; from inside the container the host is
`host.docker.internal`.

Known limit: the gateway strips prompt-cache and context-management options
before forwarding, so caching and history compaction do not reach the provider
through it. That matters for cost in long games.

## How it decides

Each seat runs one conversation for the whole game. Every request carries the
hidden-safe observation (the model never sees your hand), the legal action ids
and the recent public events, and the reply must name one of those ids. Forced
one-action decisions are resolved locally without a request. In a Counter
window the model commits to its whole hand-counter sequence in one reply, which
the engine applies card by card.

The agent is a single file, `packages/agents/src/llm.ts`.

# LLM evaluation tools

An LLM agent (`packages/agents/src/llm/`) is kept for evaluation: piloting a
deck from its strategy dossier, and asking a model what it would have played
in a recorded game. Nothing a player reaches starts one. The app, the CLI play
commands and the hosted page offer only the learned model and the rules
agents.

Every tool here reads the same variables; copy `.env.example` to `.env` to
stop passing them on every run.

| Provider                                                     | Variables                                       |
| ------------------------------------------------------------ | ----------------------------------------------- |
| OpenAI (default)                                             | `OPENAI_API_KEY`, `LLM_MODEL`                   |
| Any OpenAI-compatible endpoint using the Responses API       | plus `LLM_BASE_URL`                             |
| Any OpenAI-compatible endpoint using `/chat/completions`     | plus `LLM_BASE_URL`, `LLM_API=chat`             |
| Google Gemini                                                | `GEMINI_API_KEY`, `LLM_MODEL`, `LLM_API=gemini` |
| A local [otari](https://github.com/mozilla-ai/otari) gateway | see below                                       |

`LLM_MODEL` is the model id as the provider spells it. Some endpoints reject
strict JSON schemas; `LLM_STRUCTURED_OUTPUTS=off` falls back for those.

## Batches

```sh
pnpm matchup:llm --left ST31 --right ST32 --games 10 --out traces/st31-st32
```

`--p1-pilot` and `--p2-pilot` take `llm`, `rules`, `random` or `first`. Seats
alternate between games so a deck's record is not a first-player record in
disguise. Each game writes one diagnostics JSONL in the format the browser
exports, so **Load match from trace** in the app replays it, with each step's
model call and reasoning in **Match history**. These traces contain the
model's hidden hand.

One request per real decision, a few hundred per game. The conversation is
reused for the whole game and the stable part of the prompt is sent with a
cache key, so most tokens are cache reads. Check the provider's dashboard
after a game or two before running a batch.

## Asking a model about a recorded game

```sh
pnpm trace:shadow --file=exported-match.jsonl --seat=p2
pnpm trace:shadow --file=exported.jsonl --revisions=196 --repeat=20
pnpm trace:shadow --file=exported.jsonl --revisions=196 --recorded-context=true
```

Replays a trace, asking the model what it would have played at one seat's
decisions, with its reasoning. Every recorded action is still applied, so the
model answers the positions that actually arose. Each answer is reported whole
(a DON!! allocation is "attach N times, then attack", and N is usually the
question).

The model is not deterministic, so one answer on one position is not a
measurement; `--repeat` asks many times. `--recorded-context=true` re-sends the
exact request the trace recorded instead of asking afresh, which separates "the
prompt never says this" from "the conversation had already decided it".
`--model=` and `--effort=` change one arm without touching `.env`.

`pnpm llm:fixture` captures the requests the seat would send at a recorded
game's decisions without calling a model, and `pnpm llm:bench` times the
transports against each other on them.

## Routing through a local gateway

[otari](https://github.com/mozilla-ai/otari) is an OpenAI-compatible gateway you
run yourself. Provider keys live in the gateway, model ids become
provider-prefixed, and each request carries a label so spend can be sliced per
matchup and seat.

```sh
export OPENAI_API_KEY=...          # handed to the gateway, not to this project
pnpm otari:up                      # starts it on :8000, prints its gw- key
eval "$(pnpm --silent otari:env)"  # sets GATEWAY_API_*, unsets OPENAI_API_KEY
LLM_MODEL=openai:gpt-5-mini pnpm matchup:llm --left ST31 --right ST32
pnpm otari:down
```

Requires Docker. `pnpm otari:status` and `pnpm otari:key` report the container
state and its bootstrap key. Set `OTARI_PROVIDER_API_BASE` before `otari:up` to
point the gateway at your own endpoint; from inside the container the host is
`host.docker.internal`.

The gateway strips prompt-cache and context-management options before
forwarding, so caching and history compaction do not reach the provider
through it. That matters for cost in long games.

## How it decides

Each seat runs one conversation for the whole game. Every request carries the
hidden-safe observation, the legal action ids and the recent public events,
and the reply must name one of those ids. Forced one-action decisions are
resolved locally without a request. In a Counter window the model commits to
its whole hand-counter sequence in one reply, which the engine applies card by
card. The strategy dossiers it reads are in
`packages/agents/src/llm/dossiers/`.

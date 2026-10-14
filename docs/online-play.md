# Online play

The design is [issue #135](https://github.com/daavoo/open-optcg/issues/135):
1v1 over the network with a server-authoritative referee, because the engine
needs full `GameState` to compute a legal move and a symmetric peer-to-peer
match would therefore put both hands on both clients.

This page records what has been built and the decisions the design left open.
The reasoning behind each module is in its own header comment; this is the map.

## What exists (build order steps 1-3)

```
packages/referee/src/referee.ts        one match, as a plain class
packages/referee/src/clock.ts          the match clock
packages/referee/src/session.ts        two connections, and who may say what
packages/referee/src/transport.ts      the transport seam, and an in-memory one
packages/referee/src/durable-object.ts the Durable Object adapter
packages/referee/src/worker.ts         the routes: build a match, sit down
packages/referee/src/telemetry.ts      what the match objects say about themselves
packages/referee/src/cloudflare.ts     the five platform methods the adapter uses
packages/referee/wrangler.toml         the deploy config, deployed by no script here
packages/protocol/src/session.ts       the wire messages
test/session-referee.test.ts           the deterministic two-client harness
test/session-clock.test.ts             the clock's own arithmetic
test/session-durable-object.test.ts    hibernation, against a fake of the platform
test/session-miniflare.test.ts         the same class in the real Workers runtime
test/session-local-play.test.ts        whole matches over two sockets, agent- and human-piloted
test/online-client.test.ts             the browser's side, driven by messages rather than a server
tools/referee-local.ts                 the local server, and its agent and human clients
packages/cli/src/human-seat.ts         what a person is shown, and how they pick a move
packages/web/src/online.ts             the browser's side: the socket, and a held seat
test/e2e/online-seat-links.e2e.ts      two browser windows, two seat links, one match
```

`pnpm test:session` runs every one of those test files. Nothing in the referee waits on a
real clock: `Referee.apply` and `Referee.tick` take the current time as an
argument, so a test advances an hour by passing a bigger number, and the host —
a Durable Object alarm, a `setTimeout`, a test — is the only thing that reads
one.

There is no matchmaking, no accounts and no rating: a match is two seat links
handed to whoever should sit at them. Not built yet: the R2 trace archive.

## Where it is in the app

Only through a seat link. The lobby offers no online opponent: a match is built
with `POST /match` (or `pnpm referee:local`), and each seat's link --
`/play#m=<match>&s=<seat>&t=<token>` -- opens the app straight onto that board.
The token is read from the fragment and wiped from the address bar. The seed and
the starting player are the server's: a seat that picked either could pick its
own opening hand.

The lobby's one online duty is the way back. A seat is remembered in the
browser, so a refresh or a dropped connection lands in the lobby with **Rejoin
your match** under the start button for as long as the seat is held.

## Two browser windows

```sh
pnpm web:build:server                 # build the app, pointed at its server
pnpm referee:local --app              # serve the app and the server on one origin
```

It prints a link per seat. Open one in each window and both boards come up, each
seeing its own hand and only the backs of the other. `test/e2e/online-seat-links.e2e.ts`
does exactly this.

## Running it

```sh
pnpm test:session          # the whole session layer, including workerd
pnpm referee:build         # bundle the Worker and print what it weighs
pnpm referee:local         # serve the real Worker locally, print a link per seat
pnpm referee:local --play  # …and play a whole match over it, printing every move
```

`pnpm referee:local` runs the real Worker bundle in the real Workers runtime
(Miniflare, which is already the test dependency) on `127.0.0.1:8787` — no
account, no login, no network. Flags: `--p1`/`--p2` to pick decks, `--seed` to
reproduce a match, `--port`, and `--open p1` to pilot only the other seat so a
seat's link is left free for a person or a `websocat`.

`--me p1` puts **you** at that seat, in the terminal, against the rules agent —
both seats going over real WebSockets through the Worker. It is the same human
seat the offline client uses (`packages/cli/src/human-seat.ts`), handed the frame
the server sent instead of a local call's return value, which is the point: a
person online sees `observe()`'s output and its legal actions, exactly what an
agent sees. Ctrl-D resigns; there is an opponent and a running clock, so leaving
has to become a decision rather than a stack trace.

`--play` sits a rules agent behind each seat, one WebSocket each, and prints the
match as it happens:

```
t 3 p1  Attach 1 DON!! to Monkey.D.Luffy [ST21-001] (Leader, 5000 power) (+1000 …)
t 3 p1  Attack Roronoa Zoro [OP12-020] (Leader, 5000 power) with Monkey.D.Luffy …
t 3 p2  Do not block
…
141 actions. p1 wins (life).
```

The agents run in this process, never in the Worker: the bundle must not grow an
LLM client, and a server-side bot belongs behind a queue-triggered Worker of its
own.

## Deploying it

```sh
pnpm web:build:server
npx wrangler deploy -c packages/referee/wrangler.toml
```

One deploy: `wrangler.toml` serves `dist/pages` in front of the Worker, so the
app and the server it talks to are the same origin and there is no second host
to keep in step.

**The build has to be told it has a server.** `pnpm web:build:server` is
`pnpm web:build --match-server`: a page served over https from its own origin
cannot tell at runtime whether a Worker stands behind it, so the build says.
Without the flag the bundle has no server, and a seat link is left in the
address bar rather than opened. With it, the server is the
origin serving the page; `--match-server=https://…` names a different one, for
an app hosted apart from its server.

The deploy holds nothing of Bandai's. `dist/pages` is the same art-free bundle
as the standalone file, the Worker carries the engine and the card registry --
stats and derived rules, no printed text -- and every message on the wire is a
seed, a deck id, a card number or an action id. Card art and printed text are an
asset pack a player loads into their own browser, exactly as offline.

Getting it backwards is safe in one direction only, which is why it is a flag on
the deploy rather than a flag on Pages: forget it and online play is missing,
which is visible and harmless. The opposite -- following seat links on a host
with nothing behind it -- is a socket that 404s. `wrangler` is not a dependency of this repo -- `npx` fetches it
-- and no script here deploys anything, so a deploy is always something a person
chose to do with their own account.

The API answers cross-origin for two origins and no others: its own, and a
loopback address. That covers the case the override exists for -- an app served
from somewhere else, pointed at a server with `?server=http://localhost:8787`,
which is remembered. Any other origin gets no CORS headers, and the client
refuses to _use_ any other override, because both are the same hazard from
different ends: the override is where the seat token is sent, so a link
carrying `?server=https://not-us.example` would hand a match to whoever wrote
the link.

`pnpm referee:build` reports **1.4 MiB minified, 258 KiB gzipped**, against the
free plan's 3 MiB compressed limit — the design's claim that the kernel fits
inside a Worker, as a number that can be re-checked rather than asserted.

### Before the first public link

Two things this repo cannot do for you, both about the fact that everything here
is unauthenticated on purpose.

**Set an account spend cap.** `POST /match` is public, and a match is a
billable object. The per-IP limiter is the only brake, and it is
per IP: a shared address routes around it in one direction and CGNAT punishes
honest players in the other. Cloudflare's notifications and budget settings are
where that decision belongs, and it is worth making before the link is
shareable rather than after.

### Draining before a deploy

A match is pinned to the rules build it was dealt under, so a deploy that moves
the card data or the mechanics leaves the matches in progress unplayable and
they end as `superseded`. The mitigation is to deploy when there are none, and
the counters say when that is: every match emits `match.dealt` once and
`match.finished` once, so **dealt minus finished is the number in flight**.

```sh
npx wrangler secret put MAINTENANCE       # a sentence; new matches refuse
npx wrangler tail --format json \
  | jq -r 'select(.logs[0].message[0] | fromjson | .event | startswith("match."))'
```

With the switch on, nothing new is dealt, so that number only falls. When it
reaches zero, deploy and `wrangler secret delete MAINTENANCE`. A match cannot
outlast `matchMs` (90 minutes) plus the ten it stays readable for, so the wait
has a ceiling even if somebody walks away mid-game.

Where a deploy binds the Analytics Engine dataset the same question is one
query rather than a tail — `WHERE index1 = 'match.dealt'` against
`'match.finished'` over the window. The columns are positional; `telemetry.ts`
is the map of which field is which, and the rule that keeps it a map: add
fields at the end, never in the middle.

### Building a match

```sh
curl -X POST localhost:8787/match -H 'content-type: application/json' \
  -d '{"p1Deck":"(Red) Monkey.D.Luffy - Starter Deck 31","p2Deck":"(Green) Roronoa Zoro - Starter Deck 32"}'
```

comes back with a `matchId` and a link per seat, the seat's token in the
fragment so it stays out of request logs. A seat then opens
`GET /match/:id/ws`, sends `join`, and receives a `welcome` and a frame.
Cloudflare addresses the object by `idFromName(matchId)`, so both links reach
the same match with no routing table to keep.

## Hibernation, and what it costs

The adapter uses the WebSocket Hibernation API, so the object is evicted between
moves with its sockets intact — the reason this is nearly free to host is that
the engine advances only on input, so a match pays for the millisecond
`applyAction` takes rather than the forty seconds a player spends thinking.

The price is that memory is not state. Every handler rebuilds the session from
one stored record and writes it back, which is what `Referee.snapshot()` and
`Referee.restore()` were for. Two consequences worth knowing:

- **The snapshot is the server's, not a seat's.** It is the match record — seed,
  decks, stamp, action list — and it replays the same however long anyone
  thought. A seat is given the decks and the stamp while the match is live, and
  the seed only with the result. That split is not tidiness: the deal is a pure
  function of the seed, the two decks and the starting player, so a seat holding
  all four reproduces the opponent's opening hand and both deck orders — every
  card either player will draw. `observe()` withholding a hand means nothing if
  the wire hands over the recipe for it.
- **The clock is stored separately from the snapshot.** The clock is host bookkeeping, stored as absolute timestamps so
  it comes back exactly rather than restarting.
- **A socket carries its seat.** A revived object gets its live sockets back with
  no idea who is on them, so the seat is written to the socket attachment when
  the server accepts a `join` — a fact about what was accepted, not about what a
  client claimed.

The clock does not start until both seats are connected: a friend match is a link
someone sends, and the time it takes them to open it is nobody's to lose. A
disconnect after that does burn your clock.

**What a rebuild costs, and why there is no checkpoint.** Replaying an action
list runs at about 0.5 ms an action — 39 ms for a 78-action match, and around
150 ms by action 300. The object caches its session while it is alive, so that
is a cost per eviction rather than per message; but eviction between moves is
the whole point of the design, so in a slow game it is close to per move. The
fix would be a periodic full-state checkpoint beside the action list, which is
more state to keep correct across every future rules change in exchange for
milliseconds nobody has complained about. So: not yet, and the thing that would
change the answer is a distribution with a tail rather than an argument.
`match.finished` carries `lastHydrateMs` beside the action count precisely so
that decision can be made against real matches.

### When replay stops being free

Hibernation costs a rebuild per wake, and a rebuild replays the action list, so
a match that hibernates between every decision does work that grows with the
square of its own length. `match.finished` carries `lastHydrateMs` beside the
action count for exactly this: the question is whether the design ever needs a
state checkpoint beside its action list, and it should be answered against real
matches rather than one benchmark. **Decide the threshold before it is urgent**
-- a rebuild that has reached a few hundred milliseconds is one worth
checkpointing, and it is a much easier change to make on a Tuesday than during
an incident.

Two paths deliberately do _not_ rebuild: accepting a socket, and closing one
that never sat down. Closing is the only handler a client reaches without ever
sending a message, so it is the one that could otherwise be looped.

## What the browser does not do

`OnlineMatch` stands in for `BrowserGameController`, and the board reads both
through `MatchGame`. Three things had to become explicit rather than assumed:

- **A move is a request.** Offline `act` returns the new position; online the
  board moves when the server's frame arrives. Nothing is applied
  optimistically, because the client holds no game state to apply it to -- it
  could not, since the engine needs the opponent's hand to compute a legal move.
  The board reads `capabilities.appliesImmediately` for this: code that took a
  forced action in a loop, re-reading the position each time, would never
  terminate against a server.
- **Undo and rewind are hidden, not disabled.** They cannot exist against an
  opponent. Trace export is hidden only while the match is on, for a different
  reason: a trace is the whole action list, and a seat knows only the ids it
  clicked itself until the server sends the list with the result. From that
  moment `capabilities.trace` is true and the result modal offers the download.
- **No agent runs for the other seat.** It is a person somewhere else;
  `capabilities.ai` is false, so nothing in the page plays their turn for them.

One rule any client needs: **do not answer the same position twice**. The server
re-sends a frame when the second seat sits down, so the player who arrived first
learns the match is live -- and a client that answers every frame addressed to it
sends its action twice, the second arriving after the decision has moved on. A
person gets this for free, because their board just redraws.

## Decisions

**Timeout (§6.1) — auto-pass, then concede.** An expired decision plays the
`pass` action if one is legal, and the seat loses only once
`expiredDecisionLimit` decisions in a row have expired. The engine stops at
every decision, including ones nobody has to think about, so conceding the
first expiry would let a ten-second network hiccup decide a match. A seat that
never returns still loses; it takes about a turn's worth of silence.

**Clock (§6.1) — a bank per seat, plus a per-decision delay.** 15 minutes a
seat, mirroring paper OPTCG's ~30-minute round, and 20 free seconds at the start
of every decision that are not charged to the bank. The two pure models both
fail here for reasons other games have already demonstrated: a per-turn timer
alone ([Hearthstone's 90
seconds](https://www.quietspeculation.com/2014/09/three-dtcgs-approaches-to-the-in-game-clock/))
cannot see the whole-game budget and would hand a stalling player a fresh timer
per prompt, while a bank alone (MTGO's 25 minutes, SolForge's 20) charges those
trivial prompts to the bank and rewards sitting idle to run an opponent out. A
delay rather than a Fischer increment, because an increment would let a seat
farm time by playing cards with many clauses.

A disconnect on your own decision burns your clock. The alternative is that
pulling the plug pauses a losing position indefinitely.

**Version policy (§6.4) — the match pins its stamp.** `Referee.start` records
`rulesStamp()`, and a client that joins on a different stamp is refused and
closed. New matches get whatever the deploy stamps. Refusing against the
_deploy's_ current stamp instead would silently change the legal lines of a game
already in progress the moment a card fix landed.

The same pin is what a deploy runs into: the stamp includes `programHash`, so
_any_ deploy leaves the matches in progress unplayable by the build that
inherits them. They end rather than hang -- `MatchObject` catches the refusal,
voids the match and sends both seats a `finished` with reason `superseded`, and
no winner is invented for a game the server stopped. The mitigation for the cost
is operational: deploy when no match is in flight (see "Draining before a
deploy").

**Assist tooling (§6.2) — none.** No suggest-a-move surface exists online, and
the point that matters is structural rather than a rule anyone has to trust: the
engine needs the whole state to evaluate a line, and a client is only ever sent
`observe()`'s output. `GameService.simulate()` cannot run on a frame. What a
determined player can still do is run a bot over their own view, which is true
of every online card game and is not something a server can detect; the honest
claim is that the client ships no help, not that help is impossible.
`MatchGame.capabilities.ai` is false for an online match, so nothing in the page
pilots either seat.

**Still open:** chat (§6.5).

## What is still missing

- **The trace archive** (step 4). A finished match is a few KB; R2 has no egress
  fee. The record is still dropped ten minutes after the match ends and the
  server keeps nothing -- what exists is the client half: the action list goes
  out with the result, so a player can save the trace even though the server
  will not.
- **Spectators, and rejoining from another device.** A seat is held by a token in
  one browser's storage, so the browser that was seated can always come back to
  it -- the lobby offers **Rejoin your match** for as long as the token is held,
  and a dropped socket keeps it rather than throwing it away -- but nothing
  shares that token with a second device.

### Closed

- **Something to look at.** `telemetry.ts`: the match objects and the Worker
  say what they did -- refused for _reason_, dealt, finished by _reason_ after
  _n_ actions, rebuilt from storage in _n_ ms. A structured `console.log` line
  always, so `wrangler tail` is enough, and a Workers Analytics Engine data
  point when a deploy binds the dataset. No per-player analytics: nothing
  records an IP or a seat token.
- **An off switch.** Set `MAINTENANCE` to a sentence and `POST /match` refuses
  with it, while matches under way play to their end. A variable rather than a
  stored flag, so it needs no endpoint -- and so there is no endpoint to abuse.
  This is also the mitigation for a deploy voiding live matches: turn it on,
  let the matches in flight finish, deploy.
- **Sockets opened by a page from somewhere else.** A WebSocket handshake is not
  subject to CORS -- the browser sends it and hands the socket over -- so the
  origin check every other route gets does not happen on the upgrade route. It
  checks it itself. A request with no `Origin` at all is allowed,
  because the clients that send none are the ones that are not browsers: an
  agent piloting a seat, `pnpm referee:local --play`, the terminal.

- **Sockets that never sit down.** A match object counts seated sockets and
  unseated ones apart, and keeps only the newest two of the latter. An upgrade
  proves nothing -- the seat token is in the first message, not in the URL -- so
  at that moment a seat coming back and somebody holding the door open are
  indistinguishable, and one pool of four let the second push out the first. The
  person who reliably knows a match id is the opponent playing in it: fill the
  sockets, wait for the other tab to reload, and their reconnect is refused
  while a clock they can no longer see runs down to three auto-passes and a
  loss. Newest-wins is the direction that cannot be gamed by getting there
  first, and an unseated socket past fifteen seconds is dropped when the next
  upgrade wants the slot.

- **Abuse limits.** `POST /match` creates something -- a match is a Durable
  Object -- so it goes through Cloudflare's rate limiter, keyed by IP, declared
  in `wrangler.toml`. It also refuses a body too large to be what it takes,
  before it is parsed. The bindings are optional in code: locally and
  under Miniflare there is nothing to abuse, and refusing every request because
  a deploy did not configure a limiter would protect nobody.

  Optional in code is also how a broken deploy hides, so `wrangler.toml` sets
  `REQUIRE_RATE_LIMIT`: a route that cannot find the limiter it asks for
  answers 503 and records `NO_RATE_LIMITER` rather than serving unlimited
  object creation to whoever finds it first. It is a `[vars]` entry a few lines
  under the `[[ratelimits]]` blocks it is about, because deploying that file is
  what ships both -- there is no version of this where the limiters are gone
  and the promise is still there.

  A seat's socket upgrade gets a second, looser limiter instead of that one: a
  phone walking between cells reconnects several times a minute by itself, and
  an allowance meant for creating things would lock a seat out of its own
  match. It still needs _a_ limit, because an upgrade wakes a Durable Object and
  may replay a whole match. A caller also cannot pick a match's seed
  (`ALLOW_FIXED_DEAL` is a local-run affordance a deploy leaves unset --
  choosing the seed is choosing both opening hands).

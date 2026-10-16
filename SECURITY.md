# Security

## What this project is, in security terms

Open OPTCG is a rules engine and a static browser app. The hosted page and the
standalone build are one HTML file with no backend. There are no accounts, and
user data never leaves the page. The Get cards bookmark runs on Bandai's card list page:
it only reads that site's public card list and saves a zip to the player's
downloads.
That shapes what counts as a vulnerability here.

**In scope:**

- Anything that lets an imported trace, deck, diagnostics file or asset pack
  zip run code in the page. All of them are attacker-supplied input as soon as
  one person sends another a file.
- Anything that lets a card's printed text, a model response in an imported
  trace, or a deck name reach the DOM unescaped (see `escapeHtml` in `packages/web/src/card-text.ts`).
- Hidden-information leaks in `observe()`: an agent or a UI seeing a zone the
  rules say it cannot. A fairness bug rather than a classic security one, and
  treated as seriously.
- Anything in the build or dependency chain that would ship code the repository
  does not contain.

**Not in scope:** a card that resolves incorrectly, a deck that fails to load,
or an agent that plays badly. Those are ordinary bugs; please
[open an issue](https://github.com/daavoo/open-optcg/issues/new/choose) with a
trace.

## Reporting

Use GitHub's private vulnerability reporting on this repository
(**Security → Report a vulnerability**). Include what you did, what happened,
and, since everything here is deterministic, the seed, deck ids and action list
or trace file that reproduces it.

Expect an acknowledgement within a week. This is a spare-time project: no
bounty, and a fix lands as an ordinary commit with credit in the message unless
you would rather not be named.

## Supported versions

The `main` branch, which is what the hosted page and its Get cards script run.

# Open OPTCG

Practice the One Piece Card Game against an AI opponent, in your browser.

Free, open source, nothing to install.

## How to Play

**<https://daavoo.github.io/open-optcg/>**

1. Open the link.
2. Load the card text and art.
   The app ships without them, because they belong to Bandai, and is not played until they are in.
   Download the asset downloader for your computer from the [latest release](https://github.com/daavoo/open-optcg/releases/latest), double-click it and pick a folder: it fills the folder from Bandai's public card list.
   Then choose **Load asset folder** on the page and pick that folder. The browser keeps it for your next visit.
   See [Card text and art](docs/asset-packs.md).
3. Pick a deck and an opponent.
4. Have fun.

> [!TIP]
> The engine and AI run completely in your browser. You can download the HTML (i.e. `Save page as` in your browser) and play without internet connection.

## Found a bug?

1. Click **Export trace** inside the game's buttons bar. It captures the exact game.
2. [Open an issue](https://github.com/daavoo/open-optcg/issues/new/choose) and
   attach it, explaining what went wrong.
3. If you know how to code and/or how to use a coding an agent, go for the fix and send a Pull Request.

## Why this exists

> TLDR: Because I can build it and it's fun to build.

I love the in-person experience of playing the One Piece Card Game.
I do not want to replace it with an online alternative (there a lot of other games that are designed and distributed for online audiences).

However, sometimes it's hard to find a local tournament that matches your schedule and/or displacement options.
As someone who likes the game, there is an obvious need for having a way to test new decks and/or cards, practice your deck, and overall enjoy the game beyond the local tournaments.

_Any_ (happy to be proved wrong and be pointend to a project that I've missed) existing option I could find either:

- is _closed_ source.
- requires every new version to be downloaded and installed.
- is oriented towards human-vs-human online and/or doesn't support playing against AI.

> I totally understand why someone (actually lots of people) could be completely fine with the 3 items above and those are just issues for me.

So I build this open source alternative that:

- Focuses on practicing against AI.
  The intention is NOT to replace the human-vs-human experience of the original game
  with an online replica.
- Can be collectively improved and expanded.

## License and trademarks

The code here is MIT licensed. See [LICENSE](LICENSE).

Open OPTCG is an unofficial, non-commercial fan project, not affiliated with or
endorsed by Bandai Namco Entertainment or any rights holder.

One Piece Card Game trademarks, card text and artwork belong to their owners and are not covered by that license.

This repository, the hosted app and the releases contain no card
art and no printed card text.

# Card text and art

The app ships with everything needed to play a rules-accurate game: card
numbers, stats, colours, types, and the rules the engine derived from each
card's printed text. It ships without the two things that belong to Bandai:
card images and the printed text itself, and it is not played without them:
until both are loaded, the only screen is the one that asks for them.

An **asset pack** fills that gap. It is a folder of card images plus one
`printed-text.json`, built by you, on your own computer, from Bandai's public
card list. The project never hosts one.

## Fetch it with the Get cards bookmark

A web page cannot read Bandai's site from its own, but a script running on
Bandai's card list page can. The **Get cards** link on the app's first screen
is a bookmarklet: a bookmark that runs a script on the page you click it on.
Nothing is installed.

1. Drag **Get cards** to your browser's bookmarks bar.
2. Open [Bandai's card list](https://en.onepiece-cardgame.com/cardlist/) and
   click the bookmark. A panel opens in the corner of Bandai's page.
3. Choose **Save into a folder** (Chrome and Edge) or **Download as a zip**
   (any browser). Keep the tab open while it fetches the printed text and
   about 2,000 images (roughly 430 MB); the panel counts them and estimates
   the time left.
4. Back in the app, choose **Load asset folder** or **Load asset pack (.zip)**
   and pick what it saved. The browser keeps it for the next visit. Nothing is
   uploaded anywhere. A newer pack loads from **Configure matchup**, under
   _Card text and art_.

The bookmark only fetches the downloader script from the hosted site and runs
it, so it stays current without being re-added. After a new set comes out,
saving into the same folder again fetches only what is missing; a zip is
fetched whole each time.

It runs several downloads at once, more while Bandai's site keeps up and
fewer, after a pause, the moment it pushes back. Each failed request is
retried with a growing delay before that card is given up on, and the panel
names any card it could not get.

If the bookmark ever stops working on Bandai's page (a site can forbid
loading outside scripts), the same script still runs from the browser's
developer console: open the console on the card list page and paste the
contents of <https://daavoo.github.io/open-optcg/get-cards.js>.

### Phone or tablet: load a zip

Bookmarklets are awkward to set up on a phone, and a phone's file picker
cannot select a folder, so there the page asks for a zip. Run the bookmark on
a computer with **Download as a zip**, get the zip onto the device (AirDrop, a
cable, a cloud drive), then tap **Load asset pack (.zip)** and pick it.

On iPhone and iPad, add the page to your home screen. Safari clears the storage
of a site you have not opened for a week otherwise, and you would have to load
the zip again.

### From a checkout

`pnpm assets:download` writes the same pack into `open-optcg-assets/`
(`--output=<dir>` for another folder), and a rerun fetches only what is
missing. The local builds, the tests that quote printed text and the System-1
research read that folder.

## Making your own pack

Anything laid out like this loads, as a folder or zipped:

```
open-optcg-assets/
  printed-text.json
  art/
    OP17-042.webp
    ST31-001.png
    card-back.png       # optional: replaces a surface, see art-anchors.md
    ...
```

Folder nesting does not matter; files are matched by name. Card
images are named by card number. Images named after a surface in
[art anchors](art-anchors.md), such as `mat-self.jpg` or `card-back.png`,
replace that surface. Anything else is ignored. Recognised image formats:
AVIF, GIF, JPEG, PNG, SVG, WebP.

`printed-text.json`:

```json
{
  "version": 1,
  "source": "where the text was read from, for the reader",
  "cards": {
    "OP17-042": {
      "name": "...",
      "effect": "[On Play] ...",
      "trigger": "[Trigger] ..."
    }
  }
}
```

`effect` and `trigger` are the two printed fields as Bandai's list prints them,
with `"-"` or `""` where a card prints nothing. `name` is informational. Cards
the engine does not know are ignored.

## For contributors

The same file is the repository's printed-text cache,
`packages/cards/printed-text.json`, which is gitignored. `pnpm reference:fetch`
then `pnpm reference:audit` write it from the fetched card list pages, in the
same pass that derives each card's committed `rules` block and stamps its text
hash. Tests that quote printed text load the cache and skip when a checkout has
none. The weekly `Reference text check` workflow fetches the pages, re-runs the
audit, fails if the committed rules no longer match, and runs the suite with the
text on disk.

What may and may not be committed or published:

- **Fine:** card numbers, stats, colours, types, attributes, names, the derived
  `rules` block, the text hash, the mechanics code, the tests, and a short
  quotation of a clause in a code comment explaining an implementation.
- **Never:** printed text as data, any card image, or any artefact that
  contains either. The hosted page, its `get-cards.js` and
  `dist/open-optcg.html` all ship without them. `pnpm web:build --with-art`
  bakes your own downloaded art into a personal copy and is for that only.

`--with-text` does the same for a text pack, and the two together make one
file that needs no pack at the other end:

```sh
pnpm web:build --with-art --with-text
pnpm web:build --with-text=../somewhere/printed-text.json
pnpm web:build --with-art=../somewhere/art
```

Both flags search the same two places, because the two download commands write
to two different ones and either is a reasonable thing to have on hand.

Bare, `--with-text` reads whichever pack it finds first:
`packages/cards/printed-text.json`, the gitignored cache the audit writes, or
`open-optcg-assets/printed-text.json`, what `pnpm assets:download` writes by
default. With a path it reads any pack file, or a folder holding one.

Bare, `--with-art` takes the **union** of `local-art/`, what
`pnpm art:download` fills, and `open-optcg-assets/art/`, what
`pnpm assets:download` fills -- `local-art/` winning where both hold a card.
The union rather than the first hit, because the two folders age separately: a
deck imported since your last `art:download --all` has its faces in the newer
one only, and taking just one folder silently draws that deck's Leader as a
blank. With a path it reads one folder, its images and per-set subfolders, and nothing else.

Either flag failing to find anything fails the build and names the commands
that write one, rather than quietly producing an artefact with the thing you
asked for missing.

The build still fetches nothing. What it writes is a file to carry to your own
devices: it contains Bandai's text as well as their art, which is exactly what
must never be published.

Every card record is generated. A card a community deck plays outside the
imported sets is read from Bandai's page in the audit's community pass. The one
exception is the sealed promo Leader, which Bandai lists nowhere and which keeps
a hand-written record.

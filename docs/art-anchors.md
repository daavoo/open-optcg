# Image asset anchors

Every painted surface in the web client, the card back included, is drawn in
CSS unless an **anchor** points it at an image. An anchor is a CSS custom
property that defaults to `none`; set it to an image and that surface becomes
the image, nothing else changes.

## The anchors

| Anchor                 | Surface                                    | Import name      |
| ---------------------- | ------------------------------------------ | ---------------- |
| `--art-mat-self`       | Your half of the sea                       | `mat-self`       |
| `--art-mat-opponent`   | Their half of the sea                      | `mat-opponent`   |
| `--art-table`          | Surround behind both halves                | `table`          |
| `--art-chart`          | One chart drawn across both halves         | `chart`          |
| `--art-card-back`      | Deck, Life, opponent hand                  | `card-back`      |
| `--art-don-back`       | The DON!! deck's own back                  | `don-back`       |
| `--art-card-frame`     | Trim ring around a drawn card face         | `card-frame`     |
| `--art-card-slot`      | Empty character / stage slot               | `card-slot`      |
| `--art-character-area` | The two character-area panels              | `character-area` |
| `--art-hand-tray`      | Shelf under your hand                      | `hand-tray`      |
| `--art-don`            | Resource (DON!!) card face                 | `don`            |
| `--art-life`           | Life dial face                             | `life`           |
| `--art-brand`          | Brand mark, top bar and lobby              | `brand`          |
| `--art-lobby`          | Lobby backdrop                             | `lobby`          |
| `--art-home`           | Backdrop behind every menu page            | `home`           |
| `--art-menu-card`      | Paper the puzzle and sealed forms print on | `menu-card`      |
| `--art-mode-<id>`      | One landing-page mode card                 | `mode-1v1`, …    |
| `--art-end-turn`       | Turn-end dial face                         | `end-turn`       |
| `--art-vs`             | The mark between the lobby's two Leaders   | `vs`             |
| `--card-art`           | One card's art, keyed by card number       | `ST31-001`, …    |

`--card-art` is set per element by the client; the rest are document-level.

A mode anchor holds a whole painted card, frame and name band included. The
mode page (behind `#modes`; the 1v1 lobby is the landing page while only 1v1
ships) shows the image alone in a white trim sized by the file's own ratio. A mode without one (`art` unset in `packages/web/src/main.ts`) falls back
to a card composed from its icon, blurb and title.

## Three ways to fill one

**At runtime.** An [asset pack](asset-packs.md) loaded from the home screen. A
file named after an import name above replaces that surface (`mat-self.jpg`,
`card-back.png`); `playmat` is an alias for `mat-self`. Card-number filenames
fill that card's face. Unrelated images are ignored. Runtime imports are cached
in the browser and never uploaded.

**At build time.** Drop a file named after an import name into
`packages/web/src/assets/` and `pnpm web:build` inlines it as a data URI.
Recognised: `.avif`, `.gif`, `.jpg`/`.jpeg`, `.png`, `.svg`, `.webp`. The build
prints each one it inlines. Only the project's own artwork goes here.

**By hand.** Replace the `none` in the anchor block at the top of
`packages/web/src/styles/art-anchors.css` with `url("…")`.

## The chart

`--art-chart` is one image spanning the whole table, over both mats and under
every piece, centred so the middle of the image lands on the seam. The one that
ships, `chart.webp`, is a black line drawing on transparency shown at a fifth of
full strength: ink as alpha, no ground of its own. A painting with its own
background belongs in `--art-mat-self` and `--art-mat-opponent` instead.

A replacement wants the same treatment. The shipped file was made by reading a
line drawing's greys back out as alpha, resizing to 1600px wide, padding with
transparency until the point that should sit at screen centre was the image's
centre, and encoding lossless (151 KB for a mostly empty drawing). Pad after
resizing in a separate pass: sharp applies a resize before an extend whichever
order they are called in.

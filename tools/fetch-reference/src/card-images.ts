/**
 * Card art URLs in Bandai's card list HTML. Pure string work, so the Node
 * downloaders and the in-browser one (`tools/get-cards.ts`) read a page the
 * same way.
 */

export interface ArtUrl {
  url: string;
  /** The base printing rather than a parallel or reprint (`_p1`, `_r1`). */
  base: boolean;
}

/**
 * Card art URLs on one list page, by card number. A page lists a card's
 * parallel and reprint art (`OP12-090_r1.png`) beside or instead of the base
 * printing; the base wins where both are there, else the first variant.
 */
export function pageImageUrls(
  html: string,
  pageUrl: string,
  into = new Map<string, ArtUrl>(),
): Map<string, ArtUrl> {
  const pattern =
    /data-src=["']([^"']*\/card\/((?:[A-Z]{1,5}\d{0,2}|P)-\d{3})(_[A-Za-z0-9-]+)?\.png(?:\?[^"']*)?)["']/g;
  for (const [, path, cardNumber, variant] of html.matchAll(pattern)) {
    const known = into.get(cardNumber!);
    if (known && (known.base || variant)) continue;
    into.set(cardNumber!, {
      url: new URL(path!, pageUrl).href,
      base: !variant,
    });
  }
  return into;
}

/** Every art path for one card on a page, base and variants, in page order. */
export function officialImageUrls(html: string, cardNumber: string): string[] {
  const escaped = cardNumber.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `data-src=["']([^"']*\\/${escaped}(?:_[A-Za-z0-9-]+)?\\.png(?:\\?[^"']*)?)["']`,
    "gi",
  );
  return [...new Set([...html.matchAll(pattern)].map((match) => match[1]!))];
}

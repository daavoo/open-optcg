/**
 * The bookmarklet: a `javascript:` bookmark that loads the in-browser asset
 * downloader (`tools/get-cards.ts`) into the page it is clicked on, Bandai's
 * card list. It stays a loader so the script behind it can change without
 * players re-adding it; the timestamp keeps a cached copy from being served
 * after a fix.
 *
 * Fetched and inserted as an inline script, not loaded by `src`: the card
 * list's Content-Security-Policy allows `'unsafe-inline'` scripts but no
 * script host of ours, and it sets no `connect-src`, so a fetch may reach the
 * hosted site (which answers with `Access-Control-Allow-Origin: *`). If Bandai
 * ever restricts `connect-src` or drops `'unsafe-inline'`, this stops working;
 * pasting `get-cards.js` into the browser console on that page still runs it,
 * since the console is not bound by the page's policy.
 */
export const GET_CARDS_SCRIPT_URL =
  "https://daavoo.github.io/open-optcg/get-cards.js";

export function bookmarklet(scriptUrl = GET_CARDS_SCRIPT_URL): string {
  return (
    "javascript:(()=>{" +
    `fetch(${JSON.stringify(scriptUrl)}+'?'+Date.now())` +
    ".then(r=>{if(!r.ok)throw r.status;return r.text()})" +
    ".then(t=>{const s=document.createElement('script');s.textContent=t;document.body.append(s)})" +
    ".catch(e=>alert('Open OPTCG could not load its card downloader ('+e+').'))" +
    "})()"
  );
}

/**
 * How the app tells the downloader which cards it has no art for: their
 * numbers in the fragment of the card list link it opens, e.g.
 * `…/cardlist/#open-optcg-missing=EB05-001,EB05-002`. A fragment never reaches
 * Bandai's server, and the page ignores it, so it stays on the URL until the
 * player clicks the bookmark there. With it, the zip carries the printed text
 * and those cards' images alone -- the app adds images to what it already has
 * rather than replacing them, so a pack plus that zip is the whole set.
 */
const MISSING_KEY = "open-optcg-missing";
const CARD_NUMBER = /^(?:[A-Z]{1,5}\d{0,2}|P)-\d{3}$/;

export function missingCardsUrl(
  cardlistUrl: string,
  cards: readonly string[],
): string {
  return `${cardlistUrl}#${MISSING_KEY}=${cards.join(",")}`;
}

/**
 * The card numbers a fragment asks for, or null for one that asks for none.
 * Anything not shaped like a card number is dropped: the fragment is the one
 * input to the downloader that a link, rather than the build, supplies.
 */
export function parseMissingCards(hash: string): string[] | null {
  const prefix = `#${MISSING_KEY}=`;
  if (!hash.startsWith(prefix)) return null;
  const cards = [
    ...new Set(
      decodeURIComponent(hash.slice(prefix.length))
        .split(",")
        .map((card) => card.trim().toUpperCase())
        .filter((card) => CARD_NUMBER.test(card)),
    ),
  ];
  return cards.length > 0 ? cards : null;
}

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
 * ever restricts `connect-src` or drops `'unsafe-inline'`, this stops working
 * and the downloader on the releases page is the way left.
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

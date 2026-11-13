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
/** A card number, a sealed set's pack photo (`OP18-PACK`), or the sealed
    Leader's art (`SEALED-LUFFY`, spelled out rather than imported so the
    downloader's bundle stays free of the deck data). */
const CARD_NUMBER =
  /^(?:(?:[A-Z]{1,5}\d{0,2}|P)-\d{3}|[A-Z]{2}\d{1,2}-PACK|SEALED-LUFFY)$/;

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
  return cardList(decodeURIComponent(hash.slice(prefix.length)).split(","));
}

/**
 * The card numbers in a list from outside the downloader -- a link's fragment,
 * or the app tab's answer to its hello -- or null for one that names none.
 */
export function cardList(list: unknown): string[] | null {
  if (!Array.isArray(list)) return null;
  const cards = [
    ...new Set(
      list
        .filter((card): card is string => typeof card === "string")
        .map((card) => card.trim().toUpperCase())
        .filter((card) => CARD_NUMBER.test(card)),
    ),
  ];
  return cards.length > 0 ? cards : null;
}

/**
 * The handoff between the downloader on Bandai's page and the Open OPTCG tab
 * that opened it, so the cards go straight into the app instead of through a
 * zip the player then loads by hand.
 *
 * The app opens the card list with `window.open` and no `noopener`, which
 * leaves the card list a handle on it (`window.opener`). The downloader says
 * hello to that handle; an Open OPTCG page answers, and the downloader then
 * sends the finished pack -- the same zip it would have saved, as a Blob -- to
 * the origin that answered. The app takes a pack only from Bandai's origin
 * and loads it as if the player had picked the zip. Without an answer (the
 * card list opened some other way, or the app tab closed) the downloader
 * saves the zip as before.
 */
export const BANDAI_ORIGIN = "https://en.onepiece-cardgame.com";
export const GET_CARDS_HELLO = "open-optcg:get-cards-hello";
export const GET_CARDS_APP_HERE = "open-optcg:app-here";
export const GET_CARDS_PACK = "open-optcg:asset-pack";
export const GET_CARDS_RECEIVED = "open-optcg:asset-pack-received";

/** A pack the downloader sent: the zip, and the name it would have saved. */
export interface SentAssetPack {
  type: typeof GET_CARDS_PACK;
  name: string;
  zip: Blob;
}

/**
 * Answers the downloader's hello and hands every pack it sends to `receive`,
 * which resolves whether the pack loaded. Only messages from Bandai's origin
 * are read; the reply goes back to that origin alone.
 *
 * The answer carries `missing()`: the cards a pack loaded before a new set
 * lacks, so a run the player starts from the plain card list -- not only from
 * the app's "Get only those" link -- offers just those, rather than every
 * card again. Null when the app wants the whole pack.
 */
export function listenForGetCards(
  receive: (file: File) => Promise<boolean>,
  target: Window = window,
  missing: () => readonly string[] | null = () => null,
): void {
  target.addEventListener("message", (event: MessageEvent) => {
    if (event.origin !== BANDAI_ORIGIN) return;
    const source = event.source as Window | null;
    const data = event.data as { type?: unknown } | null;
    if (!source || typeof data !== "object" || data === null) return;
    if (data.type === GET_CARDS_HELLO) {
      source.postMessage(
        { type: GET_CARDS_APP_HERE, missing: missing() },
        BANDAI_ORIGIN,
      );
      return;
    }
    const pack = data as Partial<SentAssetPack>;
    if (pack.type !== GET_CARDS_PACK || !(pack.zip instanceof Blob)) return;
    const name =
      typeof pack.name === "string" && pack.name.endsWith(".zip")
        ? pack.name
        : "open-optcg-assets.zip";
    const file = new File([pack.zip], name, { type: "application/zip" });
    void receive(file).then(
      (ok) => {
        source.postMessage({ type: GET_CARDS_RECEIVED, ok }, BANDAI_ORIGIN);
      },
      () => {
        source.postMessage(
          { type: GET_CARDS_RECEIVED, ok: false },
          BANDAI_ORIGIN,
        );
      },
    );
  });
}

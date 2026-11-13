import { describe, expect, it, vi } from "vitest";
import {
  BANDAI_ORIGIN,
  cardList,
  GET_CARDS_APP_HERE,
  GET_CARDS_HELLO,
  GET_CARDS_PACK,
  GET_CARDS_RECEIVED,
  listenForGetCards,
} from "../packages/web/src/get-cards-bookmarklet.js";

/** A stand-in for the app's window: collects the message listener so a test
    can deliver messages as if the card list tab had posted them. */
function appWindow() {
  let listener: ((event: MessageEvent) => void) | null = null;
  const target = {
    addEventListener: (
      type: string,
      handler: (event: MessageEvent) => void,
    ) => {
      if (type === "message") listener = handler;
    },
  } as unknown as Window;
  const deliver = (origin: string, data: unknown) => {
    const source = { postMessage: vi.fn() };
    listener!({ origin, data, source } as unknown as MessageEvent);
    return source.postMessage;
  };
  return { target, deliver };
}

describe("the Get cards handoff", () => {
  it("answers the downloader's hello, to Bandai's origin only", () => {
    const { target, deliver } = appWindow();
    listenForGetCards(() => Promise.resolve(true), target);
    const reply = deliver(BANDAI_ORIGIN, { type: GET_CARDS_HELLO });
    expect(reply).toHaveBeenCalledWith(
      { type: GET_CARDS_APP_HERE, missing: null },
      BANDAI_ORIGIN,
    );
  });

  it("tells the downloader which cards its pack lacks", () => {
    const { target, deliver } = appWindow();
    listenForGetCards(
      () => Promise.resolve(true),
      target,
      () => ["OP18-001", "OP18-002"],
    );
    const reply = deliver(BANDAI_ORIGIN, { type: GET_CARDS_HELLO });
    expect(reply).toHaveBeenCalledWith(
      { type: GET_CARDS_APP_HERE, missing: ["OP18-001", "OP18-002"] },
      BANDAI_ORIGIN,
    );
    // The downloader reads that list as it reads a link's: card numbers only.
    expect(cardList(["op18-001", "OP18-001", "not a card", 7])).toEqual([
      "OP18-001",
    ]);
    expect(cardList(null)).toBeNull();
  });

  it("ignores a hello or a pack from any other origin", async () => {
    const { target, deliver } = appWindow();
    const receive = vi.fn(() => Promise.resolve(true));
    listenForGetCards(receive, target);
    const hello = deliver("https://example.com", { type: GET_CARDS_HELLO });
    deliver("https://example.com", {
      type: GET_CARDS_PACK,
      name: "open-optcg-assets.zip",
      zip: new Blob(["x"]),
    });
    await Promise.resolve();
    expect(hello).not.toHaveBeenCalled();
    expect(receive).not.toHaveBeenCalled();
  });

  it("loads a sent pack as the zip it is, and says whether it loaded", async () => {
    const { target, deliver } = appWindow();
    const files: File[] = [];
    listenForGetCards((file) => {
      files.push(file);
      return Promise.resolve(true);
    }, target);
    const reply = deliver(BANDAI_ORIGIN, {
      type: GET_CARDS_PACK,
      name: "open-optcg-assets-update.zip",
      zip: new Blob(["zip bytes"], { type: "application/zip" }),
    });
    await vi.waitFor(() => {
      expect(reply).toHaveBeenCalled();
    });
    expect(files).toHaveLength(1);
    expect(files[0]!.name).toBe("open-optcg-assets-update.zip");
    expect(await files[0]!.text()).toBe("zip bytes");
    expect(reply).toHaveBeenCalledWith(
      { type: GET_CARDS_RECEIVED, ok: true },
      BANDAI_ORIGIN,
    );
  });

  it("names a pack that sent no zip name as the whole pack", async () => {
    const { target, deliver } = appWindow();
    const files: File[] = [];
    listenForGetCards((file) => {
      files.push(file);
      return Promise.resolve(false);
    }, target);
    const reply = deliver(BANDAI_ORIGIN, {
      type: GET_CARDS_PACK,
      name: "../not-a-zip",
      zip: new Blob(["x"]),
    });
    await vi.waitFor(() => {
      expect(reply).toHaveBeenCalledWith(
        { type: GET_CARDS_RECEIVED, ok: false },
        BANDAI_ORIGIN,
      );
    });
    expect(files[0]!.name).toBe("open-optcg-assets.zip");
  });
});

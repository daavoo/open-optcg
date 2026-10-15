import { describe, expect, it } from "vitest";
import {
  render,
  renderLanding,
  type HomeContext,
} from "../packages/web/src/screens/home.js";

function ctx(overrides: Partial<HomeContext> = {}): HomeContext {
  return {
    assetGate: {
      assets: () => ({ images: 12, textCards: 40 }),
      loadAssets: async () => {},
      assetNotice: () => null,
    },
    resumable: () => null,
    resume: () => {},
    resumeNotice: () => null,
    modes: [
      {
        id: "1v1",
        icon: "swords",
        title: "1v1 match",
        blurb: "Pick two decks.",
        open: () => {},
      },
    ],
    ...overrides,
  };
}

describe("home screen render", () => {
  it("renders the landing shell with the repository link", () => {
    const html = render(ctx());
    expect(html).toContain("home-shell");
    expect(html).toContain("data-github");
  });

  it("renders one button per mode, keyed by its id", () => {
    const html = render(
      ctx({
        modes: [
          {
            id: "1v1",
            icon: "swords",
            title: "1v1 match",
            blurb: "Two decks.",
            open: () => {},
          },
          {
            id: "op18-sealed",
            icon: "sparkles",
            title: "OP18 sealed",
            blurb: "Open OP18 boosters.",
            open: () => {},
          },
        ],
      }),
    );
    expect(html).toContain('data-home-mode="1v1"');
    expect(html).toContain('data-home-mode="op18-sealed"');
    expect(html).toContain("OP18 sealed");
    expect(html).toContain("Open OP18 boosters.");
  });

  it("prints an art-less mode as a card composed here", () => {
    const html = render(
      ctx({
        modes: [
          {
            id: "1v1",
            icon: "swords",
            title: "1v1 match",
            blurb: "Two decks.",
            open: () => {},
          },
        ],
      }),
    );
    expect(html).toContain("data-composed");
    expect(html).toContain("home-mode-art");
    expect(html).toContain("home-mode-text");
    expect(html).toContain("home-mode-name");
    expect(html).toContain("1v1 match");
    // Nothing to paint, so no image element and no anchor to fill.
    expect(html).not.toContain("data-mode-art");
    expect(html).not.toContain("<img");
  });

  it("shows a painted mode as its image alone, its title the alt text", () => {
    const html = render(
      ctx({
        modes: [
          {
            id: "1v1",
            icon: "swords",
            title: "1v1 match",
            blurb: "Two decks.",
            art: true,
            open: () => {},
          },
        ],
      }),
    );
    expect(html).toContain('data-mode-art="--art-mode-1v1"');
    expect(html).toContain('<img class="home-mode-card" alt="1v1 match" />');
    // The painting carries all of this, so the page draws none of it.
    expect(html).not.toContain("home-mode-name");
    expect(html).not.toContain("home-mode-text");
    expect(html).not.toContain('home-mode-art"');
    expect(html).not.toContain("Two decks.");
    expect(html).not.toContain("data-composed");
  });

  it("ignores art on a mode whose id could not name an anchor", () => {
    const html = render(
      ctx({
        modes: [
          {
            id: "1v1 or bust",
            icon: "swords",
            title: "Odd one",
            blurb: "Two decks.",
            art: true,
            open: () => {},
          },
        ],
      }),
    );
    expect(html).not.toContain("data-mode-art");
    expect(html).toContain("data-composed");
  });

  it("escapes mode text rather than trusting it as markup", () => {
    const html = render(
      ctx({
        modes: [
          {
            id: "x",
            icon: "swords",
            title: "<script>bad()</script>",
            blurb: "a & b",
            open: () => {},
          },
        ],
      }),
    );
    expect(html).not.toContain("<script>bad()");
    expect(html).toContain("&amp;");
  });

  it("asks for no asset pack: the app is only reached once one is in", () => {
    const html = render(ctx());
    expect(html).not.toContain("home-assets");
    expect(html).not.toContain("data-asset-zip");
  });

  it("offers the remembered match back above the modes, and not otherwise", () => {
    const html = render(
      ctx({
        resumable: () => ({
          turn: 7,
          p1Deck: "(Red) Monkey.D.Luffy - Starter Deck 31",
          p2Deck: "My <Kid> list",
        }),
      }),
    );
    expect(html).toContain("data-home-resume");
    expect(html).toContain("Turn 7");
    expect(html).toContain("&lt;Kid&gt;");
    expect(html.indexOf("data-home-resume")).toBeLessThan(
      html.indexOf("home-modes"),
    );
    expect(render(ctx())).not.toContain("data-home-resume");
  });

  it("offers it as a modal that can be waved away", () => {
    const html = render(
      ctx({ resumable: () => ({ turn: 7, p1Deck: "A", p2Deck: "B" }) }),
    );
    // A dialog rather than a banner in the layout: the lobby behind it is the
    // page, and the question is answered once, either way.
    expect(html).toContain('id="resume-dialog"');
    expect(html).toContain("app-dialog-backdrop");
    expect(html).toContain('data-close-dialog="resume-dialog"');
    expect(html).toContain("data-dismiss-resume");
  });

  it("prints why a resume failed in the offer's place", () => {
    const html = render(
      ctx({
        resumable: () => ({ turn: 2, p1Deck: "A", p2Deck: "B" }),
        resumeNotice: () => "That match could not be picked up again: stale",
      }),
    );
    expect(html).toContain("home-resume-notice");
    expect(html).not.toContain("data-home-resume");
  });

  it("hands the asset pack setting to the Configure dialog", () => {
    const settings = renderLanding(ctx()).settings;
    expect(settings).toContain("Card text and art");
    expect(settings).toContain("data-asset-zip");
  });

  it("hands the resume offer to the slot above the decks", () => {
    const landing = renderLanding(
      ctx({ resumable: () => ({ turn: 7, p1Deck: "A", p2Deck: "B" }) }),
    );
    expect(landing.above).toContain("data-home-resume");
    expect(renderLanding(ctx()).above).toBe("");
  });
});

/**
 * The floor of every menu page: where the app came from.
 *
 * Shared rather than owned by the landing page, because it says the same thing
 * wherever it appears -- this is an open-source project -- and a reader who
 * lands deep in the app (a shared sealed link, say) should not have to
 * walk back to the front page to find the repository. The board is the one
 * screen without it: a match in progress is not a page to leave from.
 *
 * The mark alone, with no label and no sentence around it: a GitHub logo in a
 * footer is a convention a reader arrives already knowing, and the words that
 * used to sit beside it only widened the band.
 */

/** The repository this project lives at, for the footer's GitHub link. */
const GITHUB_URL = "https://github.com/daavoo/open-optcg";

export function render(): string {
  return `<footer class="home-footer">
        <button class="home-github" type="button" data-github aria-label="Check the project on GitHub" title="GitHub"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.27-.01-1.17-.02-2.12-3.2.7-3.88-1.36-3.88-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.72-1.54-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.18-3.09-.12-.29-.51-1.46.11-3.05 0 0 .96-.31 3.15 1.18a10.9 10.9 0 0 1 2.87-.39c.97 0 1.95.13 2.87.39 2.19-1.49 3.15-1.18 3.15-1.18.62 1.59.23 2.76.11 3.05.73.81 1.18 1.83 1.18 3.09 0 4.41-2.69 5.38-5.25 5.67.41.35.77 1.05.77 2.12 0 1.53-.01 2.76-.01 3.14 0 .31.21.67.8.56A10.52 10.52 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z"/></svg></button>
      </footer>`;
}

/**
 * Wires the footer of whichever page is on screen.
 *
 * Bound by attribute rather than by id: every menu screen prints this same
 * markup, and one page's footer is the only one in the document at a time.
 * A button opened in script rather than an `<a href>`: the artifact must
 * contain no external `href` at all, which `tools/build-web.ts` enforces.
 */
export function bind(): void {
  document.querySelectorAll<HTMLElement>("[data-github]").forEach((button) => {
    button.addEventListener("click", () => {
      window.open(GITHUB_URL, "_blank", "noopener");
    });
  });
}

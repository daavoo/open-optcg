/**
 * Printed card text, marked up the way Bandai prints it.
 *
 * On an official card every bracketed keyword is a coloured box, and the
 * colour tells you what kind of keyword it is:
 *
 *   · blue    — timing and activation ([On Play], [Activate: Main], …)
 *   · red     — [Counter] and per-turn limits ([Once Per Turn])
 *   · orange  — the keyword abilities ([Blocker], [Rush], …)
 *   · black   — the DON!! requirement ([DON!! x2])
 *   · gold    — [Trigger]
 *
 * Reminder text in parentheses is italic. Card names ([Sanji]) and type
 * references ({Straw Hat Crew}) are printed plain, so they stay plain here.
 *
 * `renderCardText` escapes as it goes and returns HTML — callers must not
 * escape its result again.
 */

export type CardKeywordKind =
  "timing" | "counter" | "limit" | "ability" | "cost" | "trigger";

const TIMING_KEYWORDS = new Set([
  "activate: main",
  "activate:main",
  "main",
  "on play",
  "on k.o.",
  "on k.o",
  "on block",
  "when attacking",
  "when blocking",
  "on your opponent's attack",
  "on opponent's attack",
  "your turn",
  "opponent's turn",
  "during your turn",
  "end of your turn",
  "end of your opponent's turn",
]);

const ABILITY_KEYWORDS = new Set([
  "blocker",
  "rush",
  "double attack",
  "banish",
]);

const LIMIT_KEYWORDS = new Set(["once per turn", "once per deck"]);

const DON_REQUIREMENT = /^don!!\s*[x×]\s*(\d+)$/;

/** The kind of chip a bracketed token gets, or null when it is not a keyword. */
export function cardKeywordKind(keyword: string): CardKeywordKind | null {
  const normalized = keyword.trim().toLowerCase();
  if (DON_REQUIREMENT.test(normalized)) return "cost";
  if (normalized === "trigger") return "trigger";
  if (normalized === "counter") return "counter";
  if (LIMIT_KEYWORDS.has(normalized)) return "limit";
  if (TIMING_KEYWORDS.has(normalized)) return "timing";
  if (ABILITY_KEYWORDS.has(normalized)) return "ability";
  // Variants such as [Rush: Character] keep the base keyword's colour.
  const base = normalized.split(":")[0]!.trim();
  if (base !== normalized && ABILITY_KEYWORDS.has(base)) return "ability";
  return null;
}

export function escapeHtml(value: string): string {
  return value.replace(
    /[&<>'"]/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;",
      })[character]!,
  );
}

/** Print uses a multiplication sign in the DON!! requirement; the data uses "x". */
function keywordLabel(keyword: string): string {
  const don = DON_REQUIREMENT.exec(keyword.trim().toLowerCase());
  return don ? `DON!!×${don[1]}` : keyword.trim();
}

const TOKEN = /\[([^[\]]*)\]|\(([^()]*)\)/g;

/**
 * Renders printed effect or trigger text as HTML with the official keyword
 * colouring. Bracketed text that is not a keyword — card names, mostly — is
 * printed plain, brackets and all, exactly as it appears on the card.
 *
 * Each clause marker ([On Play], [On K.O.], [Activate: Main], [Trigger],
 * [Counter], …) starts a new line so multi-clause cards read the way they
 * print. A [DON!! xN] requirement that directly gates a clause stays on that
 * clause's line, and combined markers like "[On Play]/[On K.O.]" are not
 * split apart. Markers that follow a word rather than sentence punctuation
 * are card references ("[printed text omitted -- pnpm card:text <card>]") and stay
 * inline.
 */
export function renderCardText(text: string): string {
  let html = "";
  let cursor = 0;
  let prevEnd = 0;
  let prevWasGatingCost = false;
  for (const match of text.matchAll(TOKEN)) {
    html += escapeHtml(text.slice(cursor, match.index));
    cursor = match.index + match[0].length;
    const [, keyword, reminder] = match;
    if (reminder !== undefined) {
      html += `<i class="card-reminder">(${escapeHtml(reminder)})</i>`;
      prevWasGatingCost = false;
      prevEnd = cursor;
      continue;
    }
    const kind = cardKeywordKind(keyword!);
    // A clause starts at a timing keyword, [Counter], or [Trigger] — and also
    // at a [DON!! xN] requirement that directly gates one ("[printed text omitted -- pnpm card:text <card>]"), so the requirement stays on its clause's line.
    const restAfter = text.slice(match.index + match[0].length);
    const nextClause = restAfter.match(/^\s*\[([^[\]]*)\]/);
    const nextKind = nextClause ? cardKeywordKind(nextClause[1]!) : null;
    const gatesClause =
      kind === "cost" &&
      (nextKind === "timing" ||
        nextKind === "counter" ||
        nextKind === "trigger");
    const clauseStarter =
      kind === "timing" ||
      kind === "counter" ||
      kind === "trigger" ||
      gatesClause;
    // Real clause markers follow sentence punctuation or a closing bracket.
    // Markers that follow a word are references ("[printed text omitted -- pnpm card:text <card>]", "this card's [On Play] effect") and must not break.
    const followsBoundary = /[.:)\]]\s*$/.test(text.slice(0, match.index));
    // A timing keyword that follows a gating [DON!! xN] is the same clause, so
    // the break belongs to the requirement, not here. `prevWasGatingCost` is
    // cleared by the requirement itself when it decides not to break (first
    // clause of the text), which would otherwise re-break on this keyword.
    const directlyAfterGatingCost =
      prevWasGatingCost && /^\s*$/.test(text.slice(prevEnd, match.index));
    if (
      clauseStarter &&
      html.length > 0 &&
      followsBoundary &&
      !directlyAfterGatingCost
    ) {
      html += "<br>";
    }
    prevWasGatingCost = gatesClause;
    prevEnd = cursor;
    html += kind
      ? `<span class="card-keyword card-keyword-${kind}">${escapeHtml(keywordLabel(keyword!))}</span>`
      : escapeHtml(match[0]);
  }
  return html + escapeHtml(text.slice(cursor));
}

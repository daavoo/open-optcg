import { unimplementedClauses } from "@one-piece-sim/cards";
import {
  escapeXml,
  promptRecord,
  promptString,
  type PromptRecord,
} from "../prompt-record.js";

function promptList(title: string, value: unknown): string {
  if (!Array.isArray(value) || value.length === 0) return "";
  const items = value
    .filter((item): item is string => typeof item === "string" && item !== "")
    .map((item, index) => `${index + 1}. ${item}`);
  return items.length > 0 ? `\n#### ${title}\n\n${items.join("\n")}\n` : "";
}

function promptCard(value: unknown, count?: unknown): string {
  const card = promptRecord(value);
  if (!card) return "";
  const attributeEntries: [string, unknown][] = [
    ["number", card.cardNumber],
    ["name", card.name],
    ["category", card.category],
    ["count", count],
    ["cost", card.cost],
    ["power", card.power],
    ["counter", card.counter],
    ["colors", Array.isArray(card.colors) ? card.colors.join(", ") : undefined],
    ["types", Array.isArray(card.types) ? card.types.join(", ") : undefined],
    ["attribute", card.attribute],
  ];
  const attributes = attributeEntries
    .filter((entry) => entry[1] !== undefined && entry[1] !== null)
    .map(([key, field]) => `${key}="${escapeXml(field)}"`)
    .join(" ");
  const gaps =
    typeof card.cardNumber === "string"
      ? unimplementedClauses(card.cardNumber)
      : [];
  const text = [
    typeof card.effect === "string" && card.effect
      ? `<effect>${escapeXml(card.effect)}</effect>`
      : "",
    typeof card.trigger === "string" && card.trigger
      ? `<trigger>${escapeXml(card.trigger)}</trigger>`
      : "",
    gaps.length > 0
      ? `<unimplemented>${escapeXml(gaps.join(" and "))} ${gaps.length > 1 ? "do" : "does"} not resolve in this engine. Treat the clause as absent: it will produce no effect and no choice. The rest of the card works.</unimplemented>`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
  return text
    ? `<card ${attributes}>\n${text}\n</card>`
    : `<card ${attributes} />`;
}

/** Renders a `llmMatchContext` object into the prompt's match-context section. */
export function formatDeckDossierContext(
  context: PromptRecord,
): string | undefined {
  const selfDeck = promptRecord(context.selfDeck);
  const opponent = promptRecord(context.opponentScouting);
  const strategy = promptRecord(selfDeck?.strategy);
  if (!selfDeck || !opponent || !strategy) return undefined;

  const selfSections = [
    `### Archetype\n\n${promptString(strategy.archetype)}`,
    promptList("Game Plan", strategy.gamePlan),
    promptList("Mulligan", strategy.mulligan),
    promptList("Priorities", strategy.priorities),
    promptList("Common Variants", strategy.commonVariants),
    promptList("Common Combos", strategy.commonCombos),
    promptList(
      "How Opponents Beat This Deck",
      selfDeck.howOpponentsBeatThisDeck,
    ),
    `\n### Leader\n\n${promptCard(selfDeck.leader)}`,
    `\n### Exact Card List\n\n${
      Array.isArray(selfDeck.cards)
        ? selfDeck.cards
            .map((item) => promptCard(item, promptRecord(item)?.count))
            .filter(Boolean)
            .join("\n")
        : ""
    }`,
  ];
  const opponentSections = [
    `### Scope\n\n${promptString(opponent.scope)}`,
    `\n### Archetype\n\n${promptString(opponent.archetype)}`,
    `\n### Leader\n\n${promptCard(opponent.leader)}`,
    promptList("Common Variants", opponent.commonVariants),
    promptList("Common Combos", opponent.commonCombos),
    promptList("Common Strategy", opponent.commonStrategy),
    promptList("Likely Priorities", opponent.likelyPriorities),
    promptList("Counterplay", opponent.counterplay),
    `\n### Common Key Cards\n\n${
      Array.isArray(opponent.commonKeyCards)
        ? opponent.commonKeyCards
            .map((card) => promptCard(card))
            .filter(Boolean)
            .join("\n")
        : ""
    }`,
  ];

  return `# Match Context

Use this reference as supporting context. The current observation and legal actions remain authoritative.

<own_deck>
## Own Deck

${selfSections.join("\n").trim()}
</own_deck>

<opponent_scouting>
## Opponent Scouting

${opponentSections.join("\n").trim()}
</opponent_scouting>`;
}

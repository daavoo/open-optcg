export type PromptRecord = Record<string, unknown>;

export function promptRecord(value: unknown): PromptRecord | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as PromptRecord)
    : undefined;
}

export function promptString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function escapeXml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

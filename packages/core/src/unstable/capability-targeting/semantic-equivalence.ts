/** Formatter-agnostic semantic comparison for rendered Markdown. */

import { marked } from "marked";

const whitespaceInsensitiveText = (value: string): string => value.replace(/\s+/g, " ").trim();

const normalize = (value: unknown, preserveWhitespace = false): unknown => {
  if (typeof value === "string") {
    return preserveWhitespace
      ? value.replace(/\r\n|\r/g, "\n").trimEnd()
      : whitespaceInsensitiveText(value);
  }
  if (Array.isArray(value)) return value.map((item) => normalize(item, preserveWhitespace));
  if (typeof value !== "object" || value === null) return value;

  const record: Record<string, unknown> = {};
  const entries = Object.entries(value);
  const tokenType = entries.find(([key]) => key === "type")?.[1];
  const hasChildTokens = entries.some(([key]) => key === "tokens");
  const preserves =
    preserveWhitespace || tokenType === "code" || tokenType === "codespan" || tokenType === "html";
  for (const [key, entry] of entries.sort(([left], [right]) => left.localeCompare(right))) {
    if (key === "raw" || key === "loose" || (key === "text" && hasChildTokens)) continue;
    record[key] = normalize(entry, preserves);
  }
  return record;
};

const semanticDocument = (markdown: string): string =>
  JSON.stringify(normalize(marked.lexer(markdown)));

/** Compare Markdown meaning while ignoring documented formatting perturbations. */
export const markdownSemanticallyEquivalent = (left: string, right: string): boolean =>
  semanticDocument(left) === semanticDocument(right);

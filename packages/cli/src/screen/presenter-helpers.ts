import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";
import type { SuggestionOptions } from "./output.js";

const ANSI_RESET = "\u001b[0m";

export const annotate = (text: string, styles: ReadonlyArray<string>): string =>
  styles.length === 0 ? text : `${styles.join("")}${text}${ANSI_RESET}`;

export const repeat = (value: string, count: number): string => value.repeat(Math.max(0, count));

export const taskCompletionMessage = (title: string, result: string | void): string => {
  if (result === undefined || result.length === 0 || result === title) {
    return title;
  }
  if (result.startsWith(`${title}:`) || result.startsWith(`${title} `)) {
    return result;
  }
  return `${title}: ${result}`;
};

export const normalizeSuggestions = (
  suggestions: ReadonlyArray<SuggestedAction> | undefined,
  options?: SuggestionOptions,
): ReadonlyArray<SuggestedAction> =>
  options?.withoutSuggestions === true || suggestions === undefined || suggestions.length === 0
    ? []
    : suggestions;

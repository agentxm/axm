import * as Effect from "effect/Effect";

import type { SuggestedAction } from "../cli-runtime/suggested-action.js";
import type { SuggestionOptions } from "./cli-renderer.js";

const ANSI_RESET = "\u001b[0m";

export const annotate = (text: string, styles: ReadonlyArray<string>): string =>
  styles.length === 0 ? text : `${styles.join("")}${text}${ANSI_RESET}`;

export const repeat = (value: string, count: number): string => value.repeat(Math.max(0, count));

export const indentedMessage = (depth: number, message: string): string =>
  `${" ".repeat(depth)}${message}`;

export const writeStdout = (content: string) =>
  Effect.sync(() => {
    process.stdout.write(content);
  });

export const writeStdoutLine = (content: string) =>
  Effect.sync(() => {
    process.stdout.write(content + "\n");
  });

export const writeStderrLine = (content: string) =>
  Effect.sync(() => {
    process.stderr.write(content + "\n");
  });

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

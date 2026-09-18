import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";

import type { Doc, SummaryPart, Text, Tone } from "./doc.js";
import type { SuggestionOptions, SuccessOptions } from "./output.js";
import { normalizeSuggestions } from "./presenter-helpers.js";

export const paragraphDoc = (message: string): Doc => [{ _tag: "paragraph", text: message }];

/** Semantic facts an aside or summary asks the active glyph set to join. */
export const factParts = (values: ReadonlyArray<Text | undefined>): ReadonlyArray<SummaryPart> =>
  values.filter((value): value is Text => value !== undefined).map((text) => ({ text }));

export const headlineDoc = (tone: Tone, message: string): Doc => [
  { _tag: "headline", tone, text: message },
];

export const suggestionsDoc = (
  suggestions: ReadonlyArray<SuggestedAction> | undefined,
  options?: SuggestionOptions,
): Doc => {
  const visible = normalizeSuggestions(suggestions, options);
  return visible.length === 0 ? [] : [{ _tag: "next", actions: visible }];
};

export const successDoc = (message: string, options?: SuccessOptions): Doc => [
  { _tag: "headline", tone: "ok", text: message },
  ...(options?.summary === undefined
    ? []
    : [
        {
          _tag: "section",
          children: [{ _tag: "raw", content: options.summary }],
        } as const,
      ]),
  ...suggestionsDoc(options?.suggestions, options),
];

export const errorDoc = (message: string, options?: SuggestionOptions): Doc => [
  ...headlineDoc("error", message),
  ...suggestionsDoc(options?.suggestions, options),
];

export const rawDoc = (content: string): Doc => [{ _tag: "raw", content }];

export const markdownDoc = (content: string): Doc => [{ _tag: "markdown", content }];

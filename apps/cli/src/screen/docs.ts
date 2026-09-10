import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";

import { resolveDetailFields, resolveTableColumns } from "./command-output.js";
import type { Doc, Tone } from "./doc.js";
import type { DetailView, SuggestionOptions, SuccessOptions, TableView } from "./output.js";
import { normalizeSuggestions } from "./presenter-helpers.js";

export const paragraphDoc = (message: string): Doc => [{ _tag: "paragraph", text: message }];

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

export const calloutDoc = (message: string, title = "Note", tone: Tone = "info"): Doc => [
  {
    _tag: "callout",
    tone,
    title,
    children: paragraphDoc(message),
  },
];

export const rawDoc = (content: string): Doc => [{ _tag: "raw", content }];

export const markdownDoc = (content: string): Doc => [{ _tag: "markdown", content }];

export const tableViewDoc = <T extends object>(
  items: ReadonlyArray<T>,
  view: TableView<T>,
  caption?: string,
): Doc => {
  const columns = resolveTableColumns(view);
  return columns.length === 0
    ? []
    : [
        {
          _tag: "table",
          columns: columns.map((column) => ({
            header: column.header,
            align: column.align,
            ...(typeof column.width === "number" ? { width: column.width } : {}),
          })),
          rows: items.map((item) => columns.map((column) => column.render(item))),
          ...(caption === undefined ? {} : { caption }),
        },
      ];
};

export const detailViewDoc = <T extends object>(
  item: T,
  view: DetailView<T>,
  title?: string,
): Doc => [
  ...(title === undefined ? [] : [{ _tag: "headline", tone: "neutral", text: title } as const]),
  {
    _tag: "fields",
    fields: resolveDetailFields(view).map((field) => ({
      label: field.label,
      value: field.render(item),
    })),
  },
];

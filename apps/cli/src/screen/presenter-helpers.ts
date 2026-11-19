import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";
import {
  renderSuggestedAction,
  type FailureSuggestedAction,
} from "@agentxm/workspace-kernel/operations";

import type { SuggestionOptions } from "./output.js";
import type { LedgerColumn, Span } from "./doc.js";

export const ensureNewline = (content: string): string =>
  content.length === 0 || content.endsWith("\n") ? content : `${content}\n`;

/** Terminal streams are width-bound; captured streams preserve natural line width. */
export const streamPaintWidth = (isTTY: boolean, columns: number): number | "unbounded" =>
  isTTY ? columns : "unbounded";

export const PROSE_SEPARATOR = ", ";
export const VERBOSE_DETAILS_HINT = "--verbose for details";
export const VERBOSE_LIST_HINT = "--verbose to list";

/** Join present prose fragments without leaking painter glyph choices into a feature view. */
export const joined = (parts: ReadonlyArray<string | undefined>): string =>
  parts
    .filter((part): part is string => part !== undefined && part.trim().length > 0)
    .join(PROSE_SEPARATOR);

/**
 * A command name as help lists one: the command tint, but free to share its
 * line, because a name in a list is read rather than copied.
 */
export const commandSpan = (value: string): Span => ({ text: value, tint: "cyan" });

/** A command a person runs, as prose, records, and `Next` show one. */
export const invocation = (value: string): ReadonlyArray<Span> => [
  { text: value, kind: "command" },
];

/** A URL a person opens: never broken, and a terminal hyperlink where colour is on. */
export const urlSpan = (value: string): Span => ({ text: value, kind: "url" });

/** A value a person copies exactly, such as a one-time code or a request ID. */
export const identifierSpan = (value: string, options?: { readonly bold?: true }): Span => ({
  text: value,
  kind: "identifier",
  ...(options?.bold === undefined ? {} : { bold: true }),
});

/**
 * A path as a person reads it: under their home directory it starts at `~`,
 * and it wraps at its separators.
 */
export const pathSpan = (value: string, home?: string): Span => ({
  text:
    home !== undefined && home.length > 1 && (value === home || value.startsWith(`${home}/`))
      ? `~${value.slice(home.length)}`
      : value,
  kind: "path",
});

/** A title or verdict with the common emphatic treatment. */
export const emphatic = (value: string): ReadonlyArray<Span> => [{ text: value, bold: true }];

/** The common four-column grammar shared by plan and result ledgers. */
export const resultLedgerColumns = (
  subject: string,
  outcome: "Plan" | "Status",
): ReadonlyArray<LedgerColumn> => [
  { header: subject, role: "name" },
  { header: "Version", role: "fixed", priority: "preferred" },
  { header: outcome, role: "fixed", priority: "required" },
  { header: "Detail", role: "elastic", priority: "optional" },
];

/** Shared visibility decision for every settled ledger view. */
export const ledgerViewPolicy = (
  verbosity: "quiet" | "normal" | "verbose" | "debug",
): { readonly quiet: boolean; readonly detailed: boolean } => ({
  quiet: verbosity === "quiet",
  detailed: verbosity === "verbose" || verbosity === "debug",
});

export const normalizeSuggestions = (
  suggestions: ReadonlyArray<FailureSuggestedAction> | undefined,
  options?: SuggestionOptions,
): ReadonlyArray<SuggestedAction> =>
  options?.withoutSuggestions === true || suggestions === undefined || suggestions.length === 0
    ? []
    : suggestions.map(renderSuggestedAction);

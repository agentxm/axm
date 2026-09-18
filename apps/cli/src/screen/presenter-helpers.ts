import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";
import type { SuggestionOptions } from "./output.js";
import type { LedgerColumn, Span } from "./doc.js";

const ANSI_RESET = "\u001b[0m";

export const annotate = (text: string, styles: ReadonlyArray<string>): string =>
  styles.length === 0 ? text : `${styles.join("")}${text}${ANSI_RESET}`;

export const repeat = (value: string, count: number): string => value.repeat(Math.max(0, count));

export const ensureNewline = (content: string): string =>
  content.length === 0 || content.endsWith("\n") ? content : `${content}\n`;

/** Terminal streams are width-bound; captured streams preserve natural line width. */
export const streamPaintWidth = (isTTY: boolean, columns: number): number | "unbounded" =>
  isTTY ? columns : "unbounded";

/** Established empty-version glyphs for the operation and publication grammars. */
export const MISSING_VERSION = { operation: "-", publication: "—" };
export const PROSE_SEPARATOR = ", ";
export const VERBOSE_DETAILS_HINT = "--verbose for details";
export const VERBOSE_LIST_HINT = "--verbose to list";

/** Join present prose fragments without leaking painter glyph choices into a feature view. */
export const joined = (parts: ReadonlyArray<string | undefined>): string =>
  parts
    .filter((part): part is string => part !== undefined && part.trim().length > 0)
    .join(PROSE_SEPARATOR);

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
  suggestions: ReadonlyArray<SuggestedAction> | undefined,
  options?: SuggestionOptions,
): ReadonlyArray<SuggestedAction> =>
  options?.withoutSuggestions === true || suggestions === undefined || suggestions.length === 0
    ? []
    : suggestions;

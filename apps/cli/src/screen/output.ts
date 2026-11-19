import type { FailureSuggestedAction } from "@agentxm/workspace-kernel/operations";
import type { ResultCompletion } from "../cli-runtime/result-completion.js";

export interface SuggestionOptions {
  readonly suggestions?: ReadonlyArray<FailureSuggestedAction>;
  readonly withoutSuggestions?: boolean;
}

export interface ResultOptions extends SuggestionOptions {
  /** A machine envelope's summary; the human document states its own facts. */
  readonly summary?: string;
  readonly completion?: ResultCompletion;
  /** Explicit owner-declared fields promoted to the ordinary result envelope. */
  readonly promotedResultFields?: ReadonlyArray<"mode" | "outcome">;
  readonly diagnosticId?: string;
}

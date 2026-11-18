import type { FailureSuggestedAction } from "@agentxm/workspace-kernel/operations";
import type { ResultCompletion } from "../cli-runtime/result-completion.js";

export interface SuggestionOptions {
  readonly suggestions?: ReadonlyArray<FailureSuggestedAction>;
  readonly withoutSuggestions?: boolean;
}

export interface SuccessOptions extends SuggestionOptions {
  readonly summary?: string;
}

export interface ResultOptions extends SuccessOptions {
  readonly completion?: ResultCompletion;
  /** Explicit owner-declared fields promoted to the ordinary result envelope. */
  readonly promotedResultFields?: ReadonlyArray<"mode" | "outcome">;
  readonly diagnosticId?: string;
}

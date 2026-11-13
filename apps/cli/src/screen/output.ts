import type { FailureSuggestedAction } from "@agentxm/workspace-kernel/operations";
import type { ResultCompletion } from "../cli-runtime/result-completion.js";

export type LogMessage =
  | { readonly _tag: "message"; readonly message: string }
  | { readonly _tag: "info"; readonly message: string }
  | { readonly _tag: "success"; readonly message: string }
  | { readonly _tag: "step"; readonly message: string }
  | { readonly _tag: "warn"; readonly message: string }
  | { readonly _tag: "error"; readonly message: string };

export interface BoxOptions {
  readonly contentAlignment?: "left" | "center" | "right";
  readonly titleAlignment?: "left" | "center" | "right";
  readonly width?: number;
  readonly padding?: number;
  readonly rounded?: boolean;
}

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

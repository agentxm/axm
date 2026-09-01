/**
 * Conversions from model- and protocol-level typed failures into CLI-facing
 * `AppError` values. These live with the application error vocabulary so the
 * shared packages stay free of CLI error concerns.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { FqnInvalidError } from "@agentxm/extension-model/unstable/extensions/fqn";
import { FrontmatterParseFailure } from "@agentxm/registry-protocol/unstable/content/frontmatter";
import { FRONTMATTER_PARSE_FALLBACK_REASON } from "@agentxm/registry-protocol/unstable/content/frontmatter";
import { SubagentContentError } from "@agentxm/registry-protocol/unstable/content/subagent-content";
import type { AppErrorCode } from "./app-error.js";
import {
  WorkspaceRestorationIncomplete,
  restorationIncompleteToAppError,
} from "../workspace/transaction.js";
import {
  OPERATION_ERROR_CATEGORIES,
  STALE_CANDIDATE_DETAIL,
  StaleExecutionCandidate,
  StepFailure,
} from "../plan/errors.js";
import { makeAppError, type AppError } from "./index.js";

// The kernel's serialized category vocabulary and the CLI's AppErrorCode must
// stay the same strings; divergence is a compile error here, at the boundary
// that owns the mapping.
OPERATION_ERROR_CATEGORIES satisfies ReadonlyArray<AppErrorCode>;

/**
 * Translate a `FqnInvalidError` into a CLI-facing `AppError` with the canonical
 * format suggestion. Use at user-input boundaries (CLI handlers, publish
 * operations) where the parse failure is a user error.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const fqnInvalidErrorToAppError = (error: FqnInvalidError): AppError =>
  makeAppError({
    code: "validation",
    detail: `Invalid fully qualified name: ${error.input}`,
    suggestions: [
      {
        description:
          "Use the 3-segment format: @handle/(skills|mcps|subagents|rules|hooks|knowledge|packs)/name",
      },
    ],
    cause: error,
  });

/** Preserve the former CLI-facing validation error at higher-level boundaries. */
export const frontmatterParseFailureToAppError = (cause: FrontmatterParseFailure): AppError =>
  makeAppError({
    code: "validation",
    detail: FRONTMATTER_PARSE_FALLBACK_REASON,
    suggestions: [
      {
        description: "Ensure the frontmatter block contains valid YAML between --- delimiters.",
      },
    ],
    cause,
  });

/** Translate a subagent content failure into a CLI-facing `AppError`. */
export const subagentContentErrorToAppError = (error: SubagentContentError): AppError =>
  makeAppError({
    code: "validation",
    detail: error.detail,
    suggestions: error.suggestion === undefined ? [] : [{ description: error.suggestion }],
    cause: error,
  });

/**
 * Translate a plan step failure into the CLI-facing `AppError` envelope: the
 * category is the code, and detail, suggestions, and cause carry over 1:1.
 */
export const stepFailureToAppError = (error: StepFailure): AppError =>
  makeAppError({
    code: error.category,
    detail: error.detail,
    ...(error.suggestions === undefined ? {} : { suggestions: error.suggestions }),
    ...(error.cause === undefined ? {} : { cause: error.cause }),
  });

/** Translate a stale execution candidate, byte-identical to the former sniffed shape. */
export const staleExecutionCandidateToAppError = (_error: StaleExecutionCandidate): AppError =>
  makeAppError({
    code: "conflict",
    detail: STALE_CANDIDATE_DETAIL,
  });

/**
 * Interim bridge for producers whose dependencies still fail with `AppError`:
 * the step failure keeps the category (code), detail, suggestions, and cause
 * so plan data and machine output stay byte-identical. Call sites dissolve as
 * later decoupling waves give those dependencies typed failures.
 */
export const appErrorToStepFailure = (error: AppError): StepFailure =>
  new StepFailure({
    category: error.code,
    detail: error.detail,
    ...(error.suggestions === undefined ? {} : { suggestions: error.suggestions }),
    ...(error.cause === undefined ? {} : { cause: error.cause }),
  });

/**
 * Every typed failure the application boundary knows how to convert. Each
 * package's error union registers here as it stops constructing `AppError`
 * directly; the dispatcher is the single conversion seam the CLI uses.
 */
export type KnownFailure =
  | FqnInvalidError
  | FrontmatterParseFailure
  | SubagentContentError
  | WorkspaceRestorationIncomplete
  | StepFailure
  | StaleExecutionCandidate;

export const isKnownFailure = (error: unknown): error is KnownFailure =>
  error instanceof FqnInvalidError ||
  error instanceof FrontmatterParseFailure ||
  error instanceof SubagentContentError ||
  error instanceof WorkspaceRestorationIncomplete ||
  error instanceof StepFailure ||
  error instanceof StaleExecutionCandidate;

/** Convert a known typed failure into the CLI-facing `AppError` envelope. */
export const toAppError = (error: KnownFailure): AppError => {
  switch (error._tag) {
    case "FqnInvalidError":
      return fqnInvalidErrorToAppError(error);
    case "FrontmatterParseFailure":
      return frontmatterParseFailureToAppError(error);
    case "SubagentContentError":
      return subagentContentErrorToAppError(error);
    case "WorkspaceRestorationIncomplete":
      return restorationIncompleteToAppError(error);
    case "StepFailure":
      return stepFailureToAppError(error);
    case "StaleExecutionCandidate":
      return staleExecutionCandidateToAppError(error);
  }
};

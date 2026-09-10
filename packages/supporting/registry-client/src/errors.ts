/**
 * Failure vocabulary for the registry-client layer.
 *
 * The three families carry registry-born facts — the problem-details
 * document, the transport evidence, and the request-policy verdict — as
 * typed fields. The category vocabulary uses the same strings as the
 * application error codes so the boundary conversion is a field copy; the
 * application asserts the parity at compile time. Suggestions carried here
 * are external display data (registry-supplied problem guidance, retry
 * hints, network diagnosis) in the shared `SuggestedAction` contract shape.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Data from "effect/Data";
import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";

/** Every category a registry failure can carry. Identical strings to the CLI error codes. */
export const REGISTRY_ERROR_CATEGORIES = [
  "auth",
  "conflict",
  "forbidden",
  "internal",
  "network",
  "not_found",
  "quota",
  "rate_limit",
  "timeout",
  "unavailable",
  "validation",
] as const;

export type RegistryErrorCategory = (typeof REGISTRY_ERROR_CATEGORIES)[number];

export interface RegistryRequestMetadata {
  readonly service: "registry";
  readonly method?: string;
  readonly url: string;
}

export interface RegistryResponseMetadata {
  readonly status: number;
  readonly requestId?: string;
  readonly problemCode?: string;
  readonly body?: unknown;
}

export interface RegistryRequestPolicyMetadata {
  readonly retryable: boolean;
  readonly attemptCount: number;
  readonly maxAttempts: number;
  readonly exhausted: boolean;
  readonly stoppedBy?: "attempt-limit" | "deadline" | "replay-unsafe";
  readonly replaySafety: "safe" | "mutation" | "idempotency-keyed";
}

export interface RegistryErrorMetadata {
  readonly request?: RegistryRequestMetadata;
  readonly response?: RegistryResponseMetadata;
  readonly requestPolicy?: RegistryRequestPolicyMetadata;
}

/**
 * The registry answered with a problem-details document. `title` and
 * `detail` are the registry-supplied display strings (absent when the
 * document had none — the application boundary supplies its per-category
 * defaults); `metadata` retains the request and response evidence.
 */
export class RegistryProblem extends Data.TaggedError("RegistryProblem")<{
  readonly category: RegistryErrorCategory;
  readonly title?: string;
  readonly detail?: string;
  readonly metadata: RegistryErrorMetadata;
  readonly suggestions?: ReadonlyArray<SuggestedAction>;
  readonly cause: unknown;
}> {}

/**
 * A registry request failed without a decodable problem document: network
 * transport, an incompatible response shape, request construction, a
 * deadline timeout, or an unexpected failure.
 */
export class RegistryRequestFailed extends Data.TaggedError("RegistryRequestFailed")<{
  readonly category: RegistryErrorCategory;
  readonly detail: string;
  readonly metadata?: RegistryErrorMetadata;
  readonly suggestions?: ReadonlyArray<SuggestedAction>;
  readonly cause?: unknown;
}> {}

/**
 * A registry operation failed outside request transport: the local
 * filesystem registry, the archive cache, version selection, or archive
 * extraction.
 */
export class RegistryOperationFailed extends Data.TaggedError("RegistryOperationFailed")<{
  readonly category: RegistryErrorCategory;
  readonly detail: string;
  readonly metadata?: RegistryErrorMetadata;
  readonly suggestions?: ReadonlyArray<SuggestedAction>;
  readonly cause?: unknown;
}> {}

/** Every typed failure the registry-client modules construct. */
export type RegistryClientFailure =
  RegistryProblem | RegistryRequestFailed | RegistryOperationFailed;

export const isRegistryClientFailure = (error: unknown): error is RegistryClientFailure =>
  error instanceof RegistryProblem ||
  error instanceof RegistryRequestFailed ||
  error instanceof RegistryOperationFailed;

/**
 * Change endpoint semantics while preserving failure evidence and recovery:
 * the given category/title/detail/suggestions replace the carried values,
 * metadata and cause travel unchanged.
 */
export const withRegistrySemantics = (
  error: RegistryClientFailure,
  semantics: {
    readonly category?: RegistryErrorCategory;
    readonly title?: string;
    readonly detail?: string;
    readonly suggestions?: ReadonlyArray<SuggestedAction>;
  },
): RegistryClientFailure => {
  switch (error._tag) {
    case "RegistryProblem":
      return new RegistryProblem({
        category: semantics.category ?? error.category,
        ...((semantics.title ?? error.title) === undefined
          ? {}
          : { title: semantics.title ?? error.title }),
        ...((semantics.detail ?? error.detail) === undefined
          ? {}
          : { detail: semantics.detail ?? error.detail }),
        metadata: error.metadata,
        ...((semantics.suggestions ?? error.suggestions) === undefined
          ? {}
          : { suggestions: semantics.suggestions ?? error.suggestions }),
        cause: error.cause,
      });
    case "RegistryRequestFailed":
      return new RegistryRequestFailed({
        category: semantics.category ?? error.category,
        detail: semantics.detail ?? error.detail,
        ...(error.metadata === undefined ? {} : { metadata: error.metadata }),
        ...((semantics.suggestions ?? error.suggestions) === undefined
          ? {}
          : { suggestions: semantics.suggestions ?? error.suggestions }),
        ...(error.cause === undefined ? {} : { cause: error.cause }),
      });
    case "RegistryOperationFailed":
      return new RegistryOperationFailed({
        category: semantics.category ?? error.category,
        detail: semantics.detail ?? error.detail,
        ...(error.metadata === undefined ? {} : { metadata: error.metadata }),
        ...((semantics.suggestions ?? error.suggestions) === undefined
          ? {}
          : { suggestions: semantics.suggestions ?? error.suggestions }),
        ...(error.cause === undefined ? {} : { cause: error.cause }),
      });
  }
};

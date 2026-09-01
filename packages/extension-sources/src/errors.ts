/**
 * Failure vocabulary for the extension-sources layer.
 *
 * Source resolution interprets user-supplied locators against configured
 * hosts and external systems, so its failures carry the deciding facts as
 * typed fields plus the user-facing sentence the resolution site owns. The
 * category vocabulary uses the same strings as the application error codes so
 * the boundary conversion is a field copy; the application asserts the parity
 * at compile time. Suggestions carried here are display data in the shared
 * `SuggestedAction` contract shape, and `recover`/`cmd` reproduce the
 * application envelope's recovery sugar verbatim.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Data from "effect/Data";
import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";
import { isRegistryClientFailure, type RegistryClientFailure } from "@agentxm/registry-client";
import { AxmSkillGateUnavailable } from "./axm-skill-gate.js";
import { WorkspaceCatalogUnavailable } from "./workspace-catalog.js";

/** Every category a source-resolution failure can carry. Identical strings to the CLI error codes. */
export const SOURCE_ERROR_CATEGORIES = [
  "conflict",
  "internal",
  "network",
  "not_found",
  "validation",
] as const;

export type SourceErrorCategory = (typeof SOURCE_ERROR_CATEGORIES)[number];

/**
 * Input that does not parse as any source locator grammar the resolver
 * understands: malformed URLs, SCP addresses, provider shorthands, or empty
 * input. Always a validation failure.
 */
export class SourceSyntaxInvalid extends Data.TaggedError("SourceSyntaxInvalid")<{
  readonly detail: string;
  readonly suggestions?: ReadonlyArray<SuggestedAction>;
  readonly cause?: unknown;
}> {}

/**
 * Syntactically valid input that no configured source host serves: an
 * unmatched hostname, an unknown source name, a host/params type mismatch, or
 * an ambiguous match across configured hosts. Always a validation failure.
 */
export class SourceHostNotConfigured extends Data.TaggedError("SourceHostNotConfigured")<{
  readonly detail: string;
  readonly suggestions?: ReadonlyArray<SuggestedAction>;
  readonly cause?: unknown;
}> {}

/**
 * A well-formed locator or identifier that did not resolve to a usable
 * extension source: nothing matched, the match was ambiguous, discovered
 * content was invalid, or resolution was refused. The constructing site owns
 * the category and the sentence; `recover`/`cmd` reproduce the application
 * envelope's recovery sugar.
 */
export class SourceNotResolvable extends Data.TaggedError("SourceNotResolvable")<{
  readonly category: SourceErrorCategory;
  readonly detail: string;
  readonly recover?: string;
  readonly cmd?: string;
  readonly suggestions?: ReadonlyArray<SuggestedAction>;
  readonly cause?: unknown;
}> {}

/**
 * A network-facing acquisition step failed: temp-dir staging for a clone or
 * archive, an integrity mismatch, or a ref that carries no fetchable
 * location. Always a network failure; `retryable` is carried only when the
 * failing step established it.
 */
export class SourceNetworkFailure extends Data.TaggedError("SourceNetworkFailure")<{
  readonly detail: string;
  readonly retryable?: boolean;
  readonly cause?: unknown;
}> {}

/** The git subprocess operations this package performs. */
export type GitOperation = "clone" | "get-commit-sha" | "get-tree-sha";

/**
 * A git subprocess operation failed. Clones are network failures; SHA reads
 * over an existing checkout are validation failures.
 */
export class GitOperationFailed extends Data.TaggedError("GitOperationFailed")<{
  readonly operation: GitOperation;
  readonly detail: string;
  readonly cause?: unknown;
}> {}

/** Every typed failure constructed by this package's own modules. */
export type SourceError =
  | SourceSyntaxInvalid
  | SourceHostNotConfigured
  | SourceNotResolvable
  | SourceNetworkFailure
  | GitOperationFailed;

/**
 * Every failure a source-resolution effect can surface: this package's own
 * families, the two composition-root port failures, and registry-client
 * failures propagated from registry-backed providers.
 */
export type SourceResolutionFailure =
  SourceError | WorkspaceCatalogUnavailable | AxmSkillGateUnavailable | RegistryClientFailure;

export const isSourceError = (error: unknown): error is SourceError =>
  error instanceof SourceSyntaxInvalid ||
  error instanceof SourceHostNotConfigured ||
  error instanceof SourceNotResolvable ||
  error instanceof SourceNetworkFailure ||
  error instanceof GitOperationFailed;

export const isSourceResolutionFailure = (error: unknown): error is SourceResolutionFailure =>
  isSourceError(error) ||
  error instanceof WorkspaceCatalogUnavailable ||
  error instanceof AxmSkillGateUnavailable ||
  isRegistryClientFailure(error);

/**
 * The category a source-resolution failure resolves to at the application
 * boundary. Fallback branches key typed decisions on this instead of
 * sniffing the rendered envelope.
 */
export const sourceResolutionFailureCategory = (error: SourceResolutionFailure): string => {
  switch (error._tag) {
    case "SourceSyntaxInvalid":
    case "SourceHostNotConfigured":
      return "validation";
    case "SourceNotResolvable":
      return error.category;
    case "SourceNetworkFailure":
      return "network";
    case "GitOperationFailed":
      return error.operation === "clone" ? "network" : "validation";
    case "WorkspaceCatalogUnavailable":
    case "AxmSkillGateUnavailable":
      return error.category;
    case "RegistryProblem":
    case "RegistryRequestFailed":
    case "RegistryOperationFailed":
      return error.category;
  }
};

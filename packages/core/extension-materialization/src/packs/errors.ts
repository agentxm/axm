/**
 * Typed failure family for the pack manager and dependency resolution.
 * Fields are domain facts; the application error boundary owns rendering,
 * codes, and suggestions.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Data from "effect/Data";
import type { PackDependencyResolutionFailure } from "@agentxm/extension-resolution";

/**
 * A pack source or manifest input did not validate. `detail` carries the
 * site's fact sentence verbatim.
 */
export class PackDefinitionInvalid extends Data.TaggedError("PackDefinitionInvalid")<{
  readonly detail: string;
  readonly cause?: unknown;
}> {}

/** A lock entry was requested before install recorded the package state. */
export class PackInstallStateMissing extends Data.TaggedError("PackInstallStateMissing")<{
  readonly name: string;
}> {}

/** Fetching the pack archive from its source failed. */
export class PackArchiveFetchFailed extends Data.TaggedError("PackArchiveFetchFailed")<{
  readonly message: string;
  readonly cause: unknown;
}> {}

/** Staging fetched pack content into the canonical tree failed. */
export class PackStagingFailed extends Data.TaggedError("PackStagingFailed")<{
  readonly packDir: string;
  readonly cause: unknown;
}> {}

/** Every failure the pack module constructs. */
export type PackManagerError =
  | PackDefinitionInvalid
  | PackInstallStateMissing
  | PackArchiveFetchFailed
  | PackStagingFailed
  | PackDependencyResolutionFailure;

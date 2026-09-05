/**
 * Typed failure family for the pack manager and dependency resolution.
 * Fields are domain facts; the application error boundary owns rendering,
 * codes, and suggestions.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Data from "effect/Data";

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

/**
 * A declared pack dependency cannot be resolved as requested. `detail`
 * carries the site's fact sentence verbatim.
 */
export class PackDependencyInvalid extends Data.TaggedError("PackDependencyInvalid")<{
  readonly detail: string;
}> {}

/**
 * A pack dependency resolution conflicts with workspace state. `detail`
 * carries the site's fact sentence verbatim.
 */
export class PackDependencyConflict extends Data.TaggedError("PackDependencyConflict")<{
  readonly detail: string;
}> {}

/** Workspace authority shadows a pack member outside the pack's constraint. */
export class PackConstraintShadowed extends Data.TaggedError("PackConstraintShadowed")<{
  readonly packSource: "workspace" | "registry";
  readonly packFqn: string;
  readonly memberFqn: string;
  readonly constraint: string;
  readonly workspaceVersion: string;
}> {}

/** A pack dependency does not exist at its source. */
export class PackDependencyMissing extends Data.TaggedError("PackDependencyMissing")<{
  readonly dependencyTarget: string;
}> {}

/** No visible dependency version satisfies the pack's constraint. */
export class PackDependencyUnsatisfied extends Data.TaggedError("PackDependencyUnsatisfied")<{
  readonly dependencyTarget: string;
  readonly constraint: string;
}> {}

/** Every failure the pack module constructs. */
export type PackManagerError =
  | PackDefinitionInvalid
  | PackInstallStateMissing
  | PackArchiveFetchFailed
  | PackStagingFailed
  | PackDependencyInvalid
  | PackDependencyConflict
  | PackConstraintShadowed
  | PackDependencyMissing
  | PackDependencyUnsatisfied;

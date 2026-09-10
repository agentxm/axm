/**
 * Typed failure family for canonical package materialization: staging, swap,
 * copy, integrity, and the shared lifecycle closure postconditions. Fields are
 * domain facts; the application error boundary owns rendering, codes, and
 * suggestions.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { PathTraversalDetected } from "@agentxm/workspace-state";
import * as Data from "effect/Data";

/** Canonical package staging/swap machinery failed at a filesystem step. */
export class PackageMaterializationFailed extends Data.TaggedError("PackageMaterializationFailed")<{
  /** The canonical path for most steps; the staging path for `prepare-staging`. */
  readonly path: string;
  readonly step:
    | "recover"
    | "prepare-parent"
    | "prepare-staging"
    | "inspect"
    | "replace"
    | "inspect-create-destination";
  readonly cause: unknown;
}> {}

/** A staged package tree is missing or misshapes a type-required file. */
export class StagedPackageInvalid extends Data.TaggedError("StagedPackageInvalid")<{
  readonly file: string;
  readonly kind: "missing" | "not-file";
  readonly cause?: unknown;
}> {}

/**
 * Probing installed canonical state failed. `detail` carries the caller's
 * fact sentence verbatim; each call site owns its subject wording.
 */
export class CanonicalPackageProbeFailed extends Data.TaggedError("CanonicalPackageProbeFailed")<{
  readonly detail: string;
  readonly cause: unknown;
}> {}

/**
 * Copying package content into staging failed. `severity` records the caller's
 * decision about whether the failure indicts the source content (`validation`)
 * or the machinery (`internal`).
 */
export class PackageCopyFailed extends Data.TaggedError("PackageCopyFailed")<{
  readonly severity: "internal" | "validation";
  readonly detail: string;
  readonly cause: unknown;
}> {}

/** The fetched archive did not match the accepted integrity pin. */
export class ArchiveIntegrityMismatch extends Data.TaggedError("ArchiveIntegrityMismatch")<{
  /** The caller's subject sentence, e.g. `Integrity mismatch for name@1.0.0`. */
  readonly subject: string;
}> {}

/** A lifecycle transition committed but its observable postcondition failed. */
export class LifecyclePostconditionViolated extends Data.TaggedError(
  "LifecyclePostconditionViolated",
)<{
  readonly postcondition:
    | "install-observable"
    | "install-declared"
    | "new-observable"
    | "new-declared"
    | "materialize-observable"
    | "uninstall-remains-declared"
    | "uninstall-observed-state";
  readonly targetType: string;
  readonly targetName: string;
}> {}

/** A newly scaffolded extension could not be resolved from its workspace source. */
export class ScaffoldedExtensionUnresolved extends Data.TaggedError(
  "ScaffoldedExtensionUnresolved",
)<{
  readonly targetType: string;
  readonly targetName: string;
}> {}

/** A create-only operation found existing state at its destination path. */
export class CreateDestinationExists extends Data.TaggedError("CreateDestinationExists")<{
  readonly subject: string;
  readonly path: string;
}> {}

/** Every failure canonical materialization and the closure recipes construct. */
export type MaterializationError =
  | PackageMaterializationFailed
  | StagedPackageInvalid
  | CanonicalPackageProbeFailed
  | PackageCopyFailed
  | ArchiveIntegrityMismatch
  | CreateDestinationExists
  | PathTraversalDetected
  | LifecyclePostconditionViolated
  | ScaffoldedExtensionUnresolved;

/**
 * Typed failure family for shared extension-workspace operations: canonical
 * package materialization, create preflight, fork, native import, and the
 * shared lifecycle orchestration. Fields are domain facts; the application
 * error boundary owns rendering, codes, and suggestions.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { PathTraversalDetected } from "@agentxm/workspace-state";
import * as Data from "effect/Data";
import type { ExtensionType } from "@agentxm/extension-model/unstable/extensions/common";

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

/** A create-only operation found existing state at its destination path. */
export class CreateDestinationExists extends Data.TaggedError("CreateDestinationExists")<{
  readonly subject: string;
  readonly path: string;
}> {}

/** A create operation's name is already declared in workspace settings. */
export class CreateNameConfigured extends Data.TaggedError("CreateNameConfigured")<{
  readonly subject: string;
  readonly name: string;
}> {}

/** Inspecting a create destination before scaffolding failed. */
export class CreateDestinationInspectionFailed extends Data.TaggedError(
  "CreateDestinationInspectionFailed",
)<{
  readonly path: string;
  readonly cause: unknown;
}> {}

/** Fork input content or identity did not validate. */
export class ForkPackageInvalid extends Data.TaggedError("ForkPackageInvalid")<{
  readonly detail: string;
  readonly cause?: unknown;
}> {}

/** Fork found conflicting workspace or source state. */
export class ForkPackageConflict extends Data.TaggedError("ForkPackageConflict")<{
  readonly detail: string;
}> {}

/** A fork filesystem step failed. */
export class ForkPackageFailed extends Data.TaggedError("ForkPackageFailed")<{
  readonly detail: string;
  readonly cause: unknown;
}> {}

/** Native package import does not support the requested extension type. */
export class NativeImportUnsupported extends Data.TaggedError("NativeImportUnsupported")<{
  readonly type: ExtensionType;
}> {}

/** Native import input content did not validate. */
export class NativeImportInvalid extends Data.TaggedError("NativeImportInvalid")<{
  readonly detail: string;
  readonly cause?: unknown;
}> {}

/** Native import found existing state at its target directory. */
export class NativeImportConflict extends Data.TaggedError("NativeImportConflict")<{
  readonly targetDir: string;
}> {}

/** A native-import filesystem step failed. */
export class NativeImportFailed extends Data.TaggedError("NativeImportFailed")<{
  readonly detail: string;
  readonly cause: unknown;
}> {}

/** Source-authority evaluation refused the requested transition. */
export class SourceAuthorityBlocked extends Data.TaggedError("SourceAuthorityBlocked")<{
  readonly detail: string;
  readonly recovery: ReadonlyArray<{ readonly description: string }>;
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

/** Every failure the shared extensions module constructs. */
export type ExtensionsError =
  | PackageMaterializationFailed
  | StagedPackageInvalid
  | CanonicalPackageProbeFailed
  | PackageCopyFailed
  | ArchiveIntegrityMismatch
  | CreateDestinationExists
  | CreateNameConfigured
  | CreateDestinationInspectionFailed
  | PathTraversalDetected
  | ForkPackageInvalid
  | ForkPackageConflict
  | ForkPackageFailed
  | NativeImportUnsupported
  | NativeImportInvalid
  | NativeImportConflict
  | NativeImportFailed
  | SourceAuthorityBlocked
  | LifecyclePostconditionViolated
  | ScaffoldedExtensionUnresolved;

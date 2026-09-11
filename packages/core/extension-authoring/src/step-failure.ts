/**
 * How an authoring closure serializes a failure into the plan-step vocabulary.
 *
 * The feature owns this: an authoring step that failed must report the same
 * category, sentence, and recovery whether the failure came from authoring's
 * own policy, from the canonical-materialization machinery underneath it, or
 * from the workspace transaction around it. Nothing is supplied by the
 * application, so no authoring operation carries a failure adapter in its
 * requirements.
 *
 * Categories and detail sentences are the serialized contract of machine
 * output; they are reproduced here verbatim from the families that construct
 * them.
 *
 * @experimental This API is unstable and may change without notice.
 */

import {
  OPERATION_ERROR_CATEGORIES,
  StepFailure,
  restorationIncompleteToStepFailure,
  workspaceStateReadFailureToStepFailure,
  workspaceTransactionFailureToStepFailure,
  type OperationErrorCategory,
} from "@agentxm/workspace-operations";
import {
  ArchiveIntegrityMismatch,
  CanonicalPackageProbeFailed,
  CreateDestinationExists,
  LifecyclePostconditionViolated,
  NativeMcpEntryRetirementFailed,
  PackageCopyFailed,
  PackageMaterializationFailed,
  ScaffoldedExtensionUnresolved,
  StagedPackageInvalid,
  type ExtensionManagerFailure,
} from "@agentxm/extension-materialization";
import {
  WorkspaceRestorationIncomplete,
  type WorkspaceTransactionFailure,
} from "@agentxm/workspace-transactions";

import { AuthoringFailed } from "./errors.js";
import {
  CreateDestinationInspectionFailed,
  CreateNameConfigured,
  type AuthoredPackageError,
  ForkPackageConflict,
  ForkPackageFailed,
  ForkPackageInvalid,
  NativeImportConflict,
  NativeImportFailed,
  NativeImportInvalid,
  NativeImportUnsupported,
} from "./authored-package-errors.js";

/** Every failure an authoring closure can settle a plan step with. */
export type AuthoringStepFailure =
  | ExtensionManagerFailure
  | AuthoredPackageError
  | AuthoringFailed
  | NativeMcpEntryRetirementFailed
  | StepFailure;

const CATEGORIES: ReadonlySet<string> = new Set<string>(OPERATION_ERROR_CATEGORIES);

const isCategory = (value: unknown): value is OperationErrorCategory =>
  typeof value === "string" && CATEGORIES.has(value);

const property = (failure: object, key: string): unknown =>
  key in failure ? Reflect.get(failure, key) : undefined;

/**
 * A failure family this conversion does not name yet still carries its own
 * decision: producers in the kernel record a category and a fact sentence, so
 * both survive rather than being replaced with a generic sentence, and the
 * failure itself stays in `cause` for the diagnostic chain.
 */
const carriedFailure = (failure: AuthoringStepFailure): StepFailure => {
  const carriedCategory = property(failure, "category");
  const carriedDetail = property(failure, "detail");
  return new StepFailure({
    category: isCategory(carriedCategory) ? carriedCategory : "internal",
    detail:
      typeof carriedDetail === "string"
        ? carriedDetail
        : `The authoring step failed with ${failure._tag}`,
    cause: failure,
  });
};

const materializationDetail = (failure: PackageMaterializationFailed): string => {
  switch (failure.step) {
    case "recover":
      return `Failed to recover interrupted canonical materialization at ${failure.path}`;
    case "prepare-parent":
      return `Failed to prepare canonical package parent for ${failure.path}`;
    case "prepare-staging":
      return `Failed to prepare canonical package staging at ${failure.path}`;
    case "inspect":
      return `Failed to inspect canonical package at ${failure.path}`;
    case "replace":
      return `Failed to replace canonical package at ${failure.path}`;
    case "inspect-create-destination":
      return `Failed to inspect create-only destination: ${failure.path}`;
  }
};

const postconditionDetail = (failure: LifecyclePostconditionViolated): string => {
  switch (failure.postcondition) {
    case "install-observable":
      return `Installed ${failure.targetType} "${failure.targetName}" did not satisfy its observable contract`;
    case "install-declared":
      return `Installed ${failure.targetType} "${failure.targetName}" has no desired-state declaration`;
    case "new-observable":
      return `New ${failure.targetType} "${failure.targetName}" did not satisfy its observable contract`;
    case "new-declared":
      return `New ${failure.targetType} "${failure.targetName}" has no desired-state declaration`;
    case "materialize-observable":
      return `Reconciled ${failure.targetType} "${failure.targetName}" did not satisfy its observable contract`;
    case "uninstall-remains-declared":
      return `Uninstalled ${failure.targetType} "${failure.targetName}" remains declared`;
    case "uninstall-observed-state":
      return `Uninstalled ${failure.targetType} "${failure.targetName}" has an invalid observed postcondition`;
  }
};

const WORKSPACE_STATE_READ_TAGS: ReadonlySet<string> = new Set([
  "SettingsDecodeError",
  "SettingsParseError",
  "SettingsIoError",
  "LockfileIoError",
  "LockfileParseError",
  "LockfileDecodeError",
  "LockfileVersionUnsupported",
  "WorkspaceRootEscape",
]);

const WORKSPACE_TRANSACTION_TAGS: ReadonlySet<string> = new Set([
  "WorkspaceSnapshotError",
  "WorkspaceDirectoryError",
  "TransitionLockError",
  "TransitionLockUnavailable",
  "WorkspaceTransitionCompromised",
]);

const isWorkspaceStateReadFailure = (
  failure: AuthoringStepFailure,
): failure is Extract<
  ExtensionManagerFailure,
  { readonly _tag: "SettingsDecodeError" | "WorkspaceRootEscape" }
> => WORKSPACE_STATE_READ_TAGS.has(failure._tag);

const isWorkspaceTransactionFailure = (
  failure: AuthoringStepFailure,
): failure is WorkspaceTransactionFailure => WORKSPACE_TRANSACTION_TAGS.has(failure._tag);

/**
 * Serialize one authoring-closure failure into the plan-step vocabulary.
 *
 * Families this feature or the machinery beneath it constructs are rendered
 * exactly; families the kernel already serializes are delegated to it; and
 * anything else carries its producer's own category and sentence through.
 */
export const authoringStepFailure = (failure: AuthoringStepFailure): StepFailure => {
  if (failure instanceof StepFailure) return failure;

  if (failure instanceof AuthoringFailed) {
    return new StepFailure({
      category: failure.category,
      detail: failure.detail,
      ...(failure.recover === undefined && failure.suggestions === undefined
        ? {}
        : {
            suggestions: [
              ...(failure.recover === undefined ? [] : [{ description: failure.recover }]),
              ...(failure.suggestions ?? []),
            ],
          }),
      ...(failure.cause === undefined ? {} : { cause: failure.cause }),
    });
  }

  if (failure instanceof CreateNameConfigured) {
    return new StepFailure({
      category: "conflict",
      detail: `${failure.subject} '${failure.name}' already exists in settings`,
      suggestions: [
        {
          description: `Choose a different name or remove the existing ${failure.subject.toLowerCase()} first`,
        },
      ],
    });
  }
  if (failure instanceof CreateDestinationExists) {
    return new StepFailure({
      category: "conflict",
      detail: `${failure.subject} destination already exists: ${failure.path}`,
      suggestions: [
        { description: "Choose a different name or remove the existing directory first" },
      ],
    });
  }
  if (failure instanceof CreateDestinationInspectionFailed) {
    return new StepFailure({
      category: "internal",
      detail: `Failed to inspect create destination: ${failure.path}`,
      cause: failure.cause,
    });
  }
  if (failure instanceof ScaffoldedExtensionUnresolved) {
    return new StepFailure({
      category: "not_found",
      detail: `Newly scaffolded ${failure.targetType} "${failure.targetName}" could not be resolved from its workspace source`,
    });
  }
  if (failure instanceof LifecyclePostconditionViolated) {
    return new StepFailure({ category: "internal", detail: postconditionDetail(failure) });
  }
  if (failure instanceof PackageMaterializationFailed) {
    return new StepFailure({
      category: "internal",
      detail: materializationDetail(failure),
      cause: failure.cause,
    });
  }
  if (failure instanceof StagedPackageInvalid) {
    return new StepFailure({
      category: "validation",
      detail:
        failure.kind === "missing"
          ? `Staged package is missing required file: ${failure.file}`
          : `Staged package path is not a file: ${failure.file}`,
      ...(failure.cause === undefined ? {} : { cause: failure.cause }),
    });
  }
  if (failure instanceof CanonicalPackageProbeFailed) {
    return new StepFailure({
      category: "internal",
      detail: failure.detail,
      cause: failure.cause,
    });
  }
  if (failure instanceof PackageCopyFailed) {
    return new StepFailure({
      category: failure.severity,
      detail: failure.detail,
      cause: failure.cause,
    });
  }
  if (failure instanceof NativeMcpEntryRetirementFailed) {
    return new StepFailure({
      category: failure.category,
      detail: failure.detail,
      ...(failure.cause === undefined ? {} : { cause: failure.cause }),
    });
  }
  if (failure instanceof ArchiveIntegrityMismatch) {
    return new StepFailure({
      category: "validation",
      detail: `${failure.subject} — the fetched archive does not match the accepted integrity. Verify the source and rerun, or update to accept a republished version.`,
    });
  }

  if (failure instanceof ForkPackageInvalid) {
    return new StepFailure({
      category: "validation",
      detail: failure.detail,
      ...(failure.cause === undefined ? {} : { cause: failure.cause }),
    });
  }
  if (failure instanceof ForkPackageConflict) {
    return new StepFailure({ category: "conflict", detail: failure.detail });
  }
  if (failure instanceof ForkPackageFailed) {
    return new StepFailure({
      category: "internal",
      detail: failure.detail,
      cause: failure.cause,
    });
  }
  if (failure instanceof NativeImportUnsupported) {
    return new StepFailure({
      category: "usage",
      detail: `Native package import is not supported for ${failure.type}`,
    });
  }
  if (failure instanceof NativeImportInvalid) {
    return new StepFailure({
      category: "validation",
      detail: failure.detail,
      ...(failure.cause === undefined ? {} : { cause: failure.cause }),
    });
  }
  if (failure instanceof NativeImportConflict) {
    return new StepFailure({
      category: "conflict",
      detail: `Import target already exists: ${failure.targetDir}`,
    });
  }
  if (failure instanceof NativeImportFailed) {
    return new StepFailure({
      category: "internal",
      detail: failure.detail,
      cause: failure.cause,
    });
  }

  if (failure instanceof WorkspaceRestorationIncomplete) {
    return restorationIncompleteToStepFailure(failure);
  }
  if (isWorkspaceTransactionFailure(failure)) {
    return workspaceTransactionFailureToStepFailure(failure);
  }
  if (isWorkspaceStateReadFailure(failure)) {
    return workspaceStateReadFailureToStepFailure(failure);
  }

  return carriedFailure(failure);
};

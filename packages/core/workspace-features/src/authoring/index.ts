/**
 * Extension-authoring feature: creating new authored packages, forking and
 * importing existing ones, authored identity decoding, and authored pack
 * membership. Every use case settles its decisions in a `prepare` phase that
 * writes nothing and resolves them in `previewOrApply`; failures are typed
 * and carry the facts a person needs to recover.
 *
 * @experimental All exports from this module are unstable and may change without notice.
 * @packageDocumentation
 */

export { authoringRefused } from "./errors.js";
export {
  CreateDestinationInspectionFailed,
  CreateNameConfigured,
  ForkPackageConflict,
  ForkPackageFailed,
  ForkPackageInvalid,
  NativeImportConflict,
  NativeImportFailed,
  NativeImportInvalid,
  NativeImportUnsupported,
  NativeSubagentRuntimeRequired,
  NativeSubagentImportUnsupported,
} from "./authored-package-errors.js";
export {
  authoringFailures,
  authoringFailureToStepFailure,
  authoringStepFailure,
  type AuthoringFamilyFailure,
} from "./step-failure.js";

// Creating a new authored extension
export {
  CreateExtension,
  createExtensionPlanName,
  type CreatableExtensionType,
  type CreateExtensionCandidate,
  type CreateExtensionRequest,
} from "./create/create-extension.js";
export {
  AuthoringOwnerMismatch,
  AuthoringOwnerRequired,
  AuthoringScopeUnsupported,
  ScaffoldNameInvalid,
} from "./create/errors.js";
// Changing an authored pack's membership
export {
  ChangePackMembership,
  packMembershipPlanName,
  type PackMembershipRequest,
} from "./pack-membership/change-pack-membership.js";
export {
  PackGraphInvalid,
  PackManifestUnavailable,
  PackMemberAmbiguous,
  PackMemberNotDeclared,
  PackMemberNotFound,
  PackMemberUnmanaged,
  PackNotAuthored,
  PackNotConfigured,
  PackOwnerUnconfigured,
  PackSelectorAmbiguous,
  PackSelectorNotAPack,
  PackSourceMissing,
} from "./pack-membership/membership-errors.js";

// Forking a managed package into workspace authorship
export { ForkExtension, forkExtensionPlanName } from "./fork/fork-extension.js";

// Adopting an acquired package into workspace authorship
export { AdoptExtension, adoptExtensionPlanName } from "./adopt/adopt-extension.js";

// Importing native content as an authored package
export {
  ImportNativeExtension,
  importNativeExtensionPlanName,
  type ImportNativeHookRequest,
  type NativeMcpCandidate,
} from "./import/import-native-extension.js";

// Changing an authored manifest's version
export {
  ChangeAuthoredVersion,
  changeAuthoredVersionPlanName,
  type AuthoredVersionChange,
} from "./version/change-authored-version.js";
export { TestHook } from "./hooks/test-hook.js";
export { ExportHook } from "./hooks/export-hook.js";

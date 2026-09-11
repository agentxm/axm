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

export { AuthoringFailed } from "./errors.js";
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
  type AuthoredPackageError,
} from "./authored-package-errors.js";
export { authoringStepFailure, type AuthoringStepFailure } from "./step-failure.js";

export { forkExtensionPackage, type ForkExtensionPackageArgs } from "./fork-package.js";
export {
  importNativeExtensionPackage,
  type ImportNativeExtensionPackageArgs,
  type NativeImportError,
} from "./import-native-package.js";

export { preflightCreateOnly, type CreateOnlyPreflightArgs } from "./create-preflight.js";

export {
  authoredDeclaration,
  type AuthoredDeclaration,
  type AuthoredDeclarationState,
} from "./authored-declaration.js";

export { markerFqnForRef, type MarkerFqnRef } from "./marker-fqn.js";

// Creating a new authored extension
export {
  CreateExtension,
  createExtensionPlanName,
  prepareCreateExtension,
  previewOrApplyCreateExtension,
  type CreatableExtensionType,
  type CreateExtensionCandidate,
  type CreateExtensionFailure,
  type CreateExtensionRequest,
  type CreateExtensionRequirements,
  type CreateHookRequest,
  type CreateKnowledgeRequest,
  type CreateMcpServerRequest,
  type CreatePackRequest,
  type CreateRuleRequest,
  type CreateSkillRequest,
  type CreateSubagentRequest,
  type PrepareCreateExtensionRequirements,
} from "./create/create-extension.js";
export {
  AuthoringOwnerMismatch,
  AuthoringOwnerRequired,
  AuthoringScopeUnsupported,
  ScaffoldNameInvalid,
} from "./create/errors.js";
export {
  requireAuthoredOwner,
  resolveAuthoringOwner,
  settingsRelativePath,
  type AuthoringOwner,
  type AuthoringTarget,
} from "./create/authoring-owner.js";
export {
  SCAFFOLD_NAME_MAX_LENGTH,
  SCAFFOLD_NAME_PATTERN,
  isValidScaffoldName,
  normalizeScaffoldOwner,
} from "./create/scaffold-name.js";
export { hookEntrypointFilename } from "./create/scaffolds/hook.js";

// Changing an authored pack's membership
export {
  ChangePackMembership,
  packMembershipPlanName,
  preparePackMembership,
  previewOrApplyPackMembership,
  type PackMembershipCandidate,
  type PackMembershipChange,
  type PackMembershipRequest,
  type PackMembershipRequirements,
  type PackMembershipUnchanged,
} from "./packs/change-pack-membership.js";
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
  type PackMembershipError,
} from "./packs/membership-errors.js";

// Forking a managed package into workspace authorship
export {
  ForkExtension,
  forkExtensionPlanName,
  prepareForkExtension,
  previewOrApplyForkExtension,
  type ForkExtensionCandidate,
  type ForkExtensionFailure,
  type ForkExtensionRequest,
  type ForkExtensionRequirements,
  type PrepareForkExtensionRequirements,
} from "./fork/fork-extension.js";

// Adopting an acquired package into workspace authorship
export {
  AdoptExtension,
  adoptExtensionPlanName,
  prepareAdoptExtension,
  previewOrApplyAdoptExtension,
  type AdoptExtensionCandidate,
  type AdoptExtensionFailure,
  type AdoptExtensionRequest,
  type AdoptExtensionRequirements,
  type PrepareAdoptExtensionRequirements,
} from "./adopt/adopt-extension.js";

// Importing native content as an authored package
export {
  ImportNativeExtension,
  importNativeExtensionPlanName,
  prepareImportNativeExtension,
  previewOrApplyImportNativeExtension,
  type ImportNativeExtensionCandidate,
  type ImportNativeExtensionFailure,
  type ImportNativeExtensionRequest,
  type ImportNativeExtensionRequirements,
  type ImportNativeMcpServerRequest,
  type ImportNativeSkillRequest,
  type ImportNativeSubagentRequest,
  type NativeImportType,
  type NativeMcpCandidate,
  type NativeMcpDiscovery,
  type PrepareImportNativeExtensionRequirements,
} from "./import/import-native-extension.js";

// Changing an authored manifest's version
export {
  ChangeAuthoredVersion,
  changeAuthoredVersionPlanName,
  prepareChangeAuthoredVersion,
  previewOrApplyChangeAuthoredVersion,
  type AuthoredVersionChange,
  type ChangeAuthoredVersionCandidate,
  type ChangeAuthoredVersionFailure,
  type ChangeAuthoredVersionRequest,
  type ChangeAuthoredVersionRequirements,
  type PrepareChangeAuthoredVersionRequirements,
  type VersionBumpRule,
} from "./version/change-authored-version.js";
export {
  AuthoredManifestUnavailable,
  VersionTargetIdentityMismatch,
  VersionTargetInvalid,
  VersionTargetNotAuthored,
  type AuthoredVersionError,
} from "./version/errors.js";

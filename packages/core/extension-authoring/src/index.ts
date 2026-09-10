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

export {
  decodeDesiredExtensionIdentity,
  type DecodedDesiredExtensionIdentity,
  type DesiredPackageAuthority,
} from "./desired-identity.js";

export { forkExtensionPackage, type ForkExtensionPackageArgs } from "./fork-package.js";
export {
  importNativeExtensionPackage,
  type ImportNativeExtensionPackageArgs,
  type NativeImportError,
} from "./import-native-package.js";

export { preflightCreateOnly, type CreateOnlyPreflightArgs } from "./create-preflight.js";

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

/**
 * Extension-lifecycle feature: install, update, uninstall, enable, and
 * disable policy across root and type-specific command forms — configured
 * entry resolution, and the install, update, uninstall, unpack, and demote use
 * cases every command spelling routes through. The per-type planners belong
 * to each extension kind.
 *
 * @experimental All exports from this module are unstable and may change without notice.
 * @packageDocumentation
 */

// Activation: enable and disable for every extension type, as one use case.
export {
  prepareSetActivation,
  previewOrApplySetActivation,
  SetActivation,
  type ActivationUnchanged,
  type SetActivationCandidate,
  type SetActivationFailure,
  type SetActivationRequest,
  type SetActivationRequirements,
} from "./activation/set-activation.js";
export type { SetActivationExecutionFailure } from "./activation/errors.js";

export {
  SOURCE_FAMILY_LIFECYCLE_CELLS,
  SOURCE_FAMILY_LIFECYCLE_OPERATIONS,
  SOURCE_FAMILY_LIFECYCLE_OUTCOMES,
  type BlockedLifecycleCell,
  type SourceFamilyLifecycleCell,
  type SourceFamilyLifecycleOperation,
  type SourceFamilyLifecycleOutcome,
  type SupportedLifecycleCell,
  type UnsupportedLifecycleCell,
} from "./source-family-conformance.js";

export {
  PUBLISHER_CHANGE_CONDITION_ID,
  publisherChangeRiskCondition,
  withPublisherTrust,
  withPublisherTrustConditions,
} from "./publisher-binding.js";

// Install: acquiring extensions a request names, or the ones the workspace
// already declares, as one use case behind every command spelling.
export {
  InstallExtensions,
  prepareInstallExtensions,
  previewOrApplyInstallExtensions,
  type InstallDiagnostics,
  type InstallExtensionsCandidate,
  type InstallExtensionsFailure,
  type InstallExtensionsRequest,
  type InstallExtensionSelectors,
  type InstallSubject,
  installSelectorsFor,
} from "./install/install-extensions.js";
export {
  selectInstallRefs,
  type InstallSelectionFailure,
  type InstallSelectionRequest,
} from "./install/selection.js";
export { type PrepareInstallRequirements } from "./install/vocabulary.js";
export {
  resolveRootInstallIntent,
  rootInstallableTypeSegments,
  RootInstallableTypeSegmentSchema,
  type RootInstallIntent,
  type RootInstallableType,
  type RootInstallableTypeSegment,
} from "./install/root-intent.js";
export {
  installCommandFor,
  installSourceArgumentDescription,
  perTypeInstallPluralSegments,
} from "./install/per-type-install.js";
export {
  buildConfiguredInstallPlan,
  type ConfiguredInstallPlanResult,
  type ConfiguredInstallRequirements,
  type ConfiguredInstallableType,
} from "./install/configured.js";
export { inlineMcpNotApplicablePlan } from "./install/inline-mcp-operation.js";

// Uninstall: withdrawing extensions, as one use case behind every spelling.
export { MigrateDeprecated } from "./migrate-deprecated.js";
export {
  UninstallExtensions,
  prepareUninstallExtensions,
  previewOrApplyUninstallExtensions,
  type PrepareUninstallRequirements,
  type UninstallExtensionsCandidate,
  type UninstallExtensionsFailure,
  type UninstallExtensionsRequest,
} from "./uninstall/uninstall-extensions.js";
export {
  resolveRootUninstallIntent,
  rootUninstallableTypeSegments,
  type RootUninstallIntent,
  type RootUninstallableType,
} from "./uninstall/root-intent.js";

// Update: the atomicity a workspace-wide sweep declares.
export {
  WORKSPACE_UPDATE_ATOMICITY,
  WORKSPACE_UPDATE_EXECUTION_CAPABILITIES,
} from "./update/atomicity.js";

// Update: advancing what the workspace already accepted, for a named
// extension or for the configured entries as a whole.
export {
  UpdateExtensions,
  prepareUpdate,
  previewOrApplyUpdate,
  contextForResolution,
  type BlockedUpdateCandidate,
  type ConfiguredUpdateRequest,
  type NothingConfiguredUpdateCandidate,
  type PlannedUpdateCandidate,
  type PrepareUpdateRequirements,
  type PreservedUpdateCandidate,
  type TargetedUpdateRequest,
  type UpdateCandidate,
  type UpdateFailure,
  type UpdateRequest,
  type UpdateRequirements,
  type UpdateSubjectType,
} from "./update/update-extensions.js";
export {
  UPDATE_NAME_FILTER_FLAG,
  type ConfiguredUpdateSelection,
  type ConfiguredUpdateSelector,
  type ConfiguredUpdateSelectorType,
} from "./update/selector.js";
export {
  resolveRootUpdateIntent,
  rootUpdatableTypeSegments,
  RootUpdatableTypeSegmentSchema,
  type RootUpdatableType,
  type RootUpdatableTypeSegment,
  type RootUpdateIntent,
} from "./update/root-request.js";
export { TARGETED_UPDATE_STALE_DETAIL } from "./update/targeted-plan.js";

export {
  makeWorkspaceUpdatePlan,
  type ConfiguredUpdateFailure,
  type WorkspaceUpdatableType,
  type WorkspaceUpdatePlanRequest,
  type WorkspaceUpdatePlanResult,
} from "./update/configured.js";

// Unpack: promoting a Pack's members to direct declarations.
export {
  PromoteAuthoredPack,
  preparePromoteAuthoredPack,
  previewOrApplyPromoteAuthoredPack,
  type PreparePromoteAuthoredPackRequirements,
  type PromoteAuthoredPackCandidate,
  type PromoteAuthoredPackFailure,
  type PromoteAuthoredPackRequest,
  type PromoteAuthoredPackRequirements,
  type PromotedPackMember,
} from "./unpack/promote-authored-pack.js";

// Demote: returning a workspace-authored package to an external source.
export {
  DEMOTE_RISK_CONDITION_ID,
  DemoteToExternalSource,
  prepareDemote,
  previewOrApplyDemote,
  type DemoteCandidate,
  type DemoteFailure,
  type DemoteRequest,
  type DemoteRequirements,
  type PrepareDemoteRequirements,
} from "./demote/demote-to-external-source.js";

export { HandoffSkills, type HandoffRequest } from "./handoff.js";

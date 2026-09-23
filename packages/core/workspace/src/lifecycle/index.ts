/**
 * Extension-lifecycle feature: install, update, uninstall, enable, and
 * disable policy across root and type-specific command forms — configured
 * entry resolution, the install and uninstall use cases every command
 * spelling routes through, and the per-type lifecycle operations. The environment-backed per-type manager
 * layers live behind `./live`.
 *
 * @experimental All exports from this module are unstable and may change without notice.
 * @packageDocumentation
 */

export { ExtensionLifecycleFailed } from "./errors.js";
export {
  StepFailureConversion,
  withAdaptedStepFailures,
  type LifecycleFailure,
  type StepFailureConversionService,
} from "./step-failure-conversion.js";

// Activation: enable and disable for every extension type, as one use case.
export {
  prepareSetActivation,
  previewOrApplySetActivation,
  SetActivation,
  type ActivationTransition,
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
  InstallSelectionInteraction,
  InstallSelectionCancelled,
  InstallSelectionUnavailable,
  extensionRefName,
  selectInstallRefs,
  type InstallSelectionCandidate,
  type InstallSelectionFailure,
} from "./install/selection.js";
export {
  installRefused,
  type HookInstallIntent,
  type InstallStepRequirements,
  type KnowledgeInstallIntent,
  type McpServerInstallIntent,
  type PackInstallIntent,
  type PackRecoveryDependencyResolver,
  type PrepareInstallRequirements,
  type ResolveInstallRequirements,
  type RuleInstallIntent,
  type SkillInstallIntent,
  type SubagentInstallIntent,
} from "./install/vocabulary.js";
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
export { buildAggregateProjectionStep } from "./install/aggregate-projection-step.js";
export { inlineMcpNotApplicablePlan } from "./install/inline-mcp-operation.js";
export {
  formatRegistryProbe,
  type RegistryLookupProbe,
} from "./install/registry-source-resolution.js";

// The per-type install planners every install and update route shares.
export { planHookInstall } from "../hooks/lifecycle/install/plan.js";
export { planKnowledgeInstall } from "../knowledge/lifecycle/install/plan.js";
export {
  parseMcpEnvInputs,
  planMcpServerInstall,
} from "../mcp-connections/lifecycle/install/plan.js";
export { planPackInstall, type PackInstallRequirements } from "../packs/lifecycle/install/plan.js";
export { planRuleInstall } from "../instructions/lifecycle/install/plan.js";
export { planSkillInstall } from "../skills/lifecycle/install/plan.js";
export { planSubagentInstall } from "../subagents/lifecycle/install/plan.js";

// The bundled official AXM skill, and the asset port the application fills.
export {
  BUNDLED_AXM_SKILL_AUTHORED_BLOCKER,
  BundledAxmSkillAsset,
  bundledAxmSkillCanonicalPath,
  inspectBundledAxmSkillReadiness,
  installBundledAxmSkill,
  type BundledAxmSkillAssetService,
  type BundledAxmSkillReadiness,
  type BundledAxmSkillSourceFile,
} from "../skills/lifecycle/install/bundled.js";

// Pack graph transitions: the atomic step and its desired-state predicate.
export { validatePackGraphPostcondition } from "../packs/lifecycle/graph-transition.js";
export {
  buildPackMemberInstallStep,
  type PackMemberRef,
} from "../packs/lifecycle/member-install-step.js";
export {
  configuredPackConstraintBlockPlan,
  PACK_CONSTRAINT_CONFLICT_BLOCKER_ID,
  packUpdateGroups,
  relevantPackConstraintProblems,
  type PackUpdateGroup,
} from "../packs/lifecycle/constraint-gate.js";

// Uninstall: withdrawing extensions, as one use case behind every spelling.
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

export {
  PACK_UNINSTALL_GRAPH_BLOCKER_ID,
  packUninstallRecoveryIdentifiers,
  planPackUninstallGraphReadiness,
  type PackRetirement,
  type PackUninstallGraphReadiness,
} from "../packs/lifecycle/uninstall/readiness.js";
export {
  type PackUninstallIntent,
  type PackUninstallRequirements,
  type ResolvedPackUninstallTarget,
} from "../packs/lifecycle/uninstall/plan.js";

// Skill lifecycle operations
export { getSkillDisplayName } from "../skills/lifecycle/utils.js";
export { enableSkill, type EnableSkillOperation } from "../skills/lifecycle/operations/enable.js";
export {
  disableSkill,
  type DisableSkillOperation,
} from "../skills/lifecycle/operations/disable.js";

// MCP server lifecycle operations. Installation itself is a materialization
// capability (`@agentxm/workspace/materialization`) because the authoring
// routes need it too and a feature may not import a peer feature.
export {
  uninstallMcpServer,
  type UninstallMcpServerOperation,
  type UninstallMcpServerOperationArgs,
} from "../mcp-connections/lifecycle/operations/uninstall.js";
export {
  enableMcpServer,
  type EnableMcpServerOperation,
} from "../mcp-connections/lifecycle/operations/enable.js";
export {
  disableMcpServer,
  type DisableMcpServerOperation,
} from "../mcp-connections/lifecycle/operations/disable.js";

// Subagent lifecycle operations
export {
  SUBAGENT_CONFIG_SURFACE,
  renderedSubagentTargets,
  subagentConfigTarget,
  subagentLifecycleArtifact,
} from "../subagents/lifecycle/operations/artifact.js";
export {
  enableSubagent,
  type EnableSubagentOperation,
} from "../subagents/lifecycle/operations/enable.js";
export {
  disableSubagent,
  type DisableSubagentOperation,
} from "../subagents/lifecycle/operations/disable.js";

// Update: the atomicity a workspace-wide sweep declares.
export {
  WORKSPACE_UPDATE_ATOMICITY,
  WORKSPACE_UPDATE_EXECUTION_CAPABILITIES,
} from "./update/atomicity.js";

// Pack lifecycle operations
export {
  expandPackInstallRefs,
  expandPackInstallRefsWithReleaseAge,
  type ReleaseAgeAwarePackExpansion,
} from "../packs/lifecycle/expansion.js";
export { validateExactPackDependencyVersions } from "../packs/lifecycle/resolved-dependency.js";
export {
  installPack,
  type InstallPackOperation,
  type InstallPackOperationArgs,
} from "../packs/lifecycle/operations/install.js";

// How a lifecycle closure serializes its own failures into a plan step.
export { lifecycleStepFailure, type LifecycleStepFailure } from "./step-failure.js";

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

// Update: advancing the entries a person selected by name or by source.
export {
  SelectiveUpdate,
  prepareSelectiveUpdate,
  type SelectiveUpdateRequest,
} from "./update/selective/use-case.js";
export {
  previewOrApplySelectiveUpdate,
  selectiveUpdatePlanName,
  type NothingSelectiveUpdateCandidate,
  type PlannedSelectiveUpdateCandidate,
  type SelectiveUpdateCandidate,
  type SelectiveUpdateSubjectType,
} from "./update/selective/vocabulary.js";
export type { SelectiveUpdateNothingReason } from "./update/selective/selection.js";
export type { SelectiveSkillUpdateRequest } from "./update/selective/skills.js";
export type { SelectiveSubagentUpdateRequest } from "./update/selective/subagents.js";
export type { SelectiveUpdateStepRequirements } from "./update/selective/requirements.js";
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
} from "../packs/lifecycle/promote-authored-pack.js";

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

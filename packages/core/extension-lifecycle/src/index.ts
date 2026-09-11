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
  type InstallSubject,
} from "./install/install-extensions.js";
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
  ExtensionSelectionCancelled,
  ExtensionSelectionInteraction,
  type ExtensionSelectionFailure,
  type ExtensionSelectionInteractionService,
} from "./install/selection-interaction.js";
export {
  resolveRootInstallIntent,
  rootInstallableTypeSegments,
  RootInstallableTypeSegmentSchema,
  type RootInstallIntent,
  type RootInstallableType,
  type RootInstallableTypeSegment,
} from "./install/root-intent.js";
export { installCommandFor, perTypeInstallPluralSegments } from "./install/per-type-install.js";
export {
  buildConfiguredInstallPlan,
  buildConfiguredPackInstallPlan,
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
export { planHookInstall } from "./hooks/install/plan.js";
export { planKnowledgeInstall } from "./knowledge/install/plan.js";
export { parseMcpEnvInputs, planMcpServerInstall } from "./mcps/install/plan.js";
export { planPackInstall, type PackInstallRequirements } from "./packs/install/plan.js";
export { planRuleInstall } from "./rules/install/plan.js";
export { planSkillInstall } from "./skills/install/plan.js";
export { planSubagentInstall } from "./subagents/install/plan.js";

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
} from "./skills/install/bundled.js";

// Pack graph transitions: the atomic step and its desired-state predicate.
export {
  buildAtomicPackGraphStep,
  validatePackGraphPostcondition,
  type AtomicPackGraphChild,
} from "./packs/graph-transition.js";
export { buildPackMemberInstallStep, type PackMemberRef } from "./packs/member-install-step.js";
export {
  configuredPackConstraintBlockPlan,
  prospectivePackConstraintProblems,
  relevantPackConstraintProblems,
} from "./packs/constraint-gate.js";

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
  exclusiveMemberRetentionPolicy,
  makeWorkspaceRetentionPolicy,
} from "./uninstall/retention-policy.js";
export {
  PACK_UNINSTALL_GRAPH_BLOCKER_ID,
  packUninstallRecoveryIdentifiers,
  planPackUninstallGraphReadiness,
  type PackRetirement,
  type PackUninstallGraphReadiness,
} from "./packs/uninstall/readiness.js";
export {
  type PackUninstallIntent,
  type PackUninstallRequirements,
  type ResolvedPackUninstallTarget,
} from "./packs/uninstall/plan.js";

// Skill lifecycle operations
export { getSkillDisplayName } from "./skills/utils.js";
export {
  gitHostedSkillArtifactSource,
  installSkill,
  type InstallSkillOperation,
  type InstallSkillOperationArgs,
} from "./skills/operations/install.js";
export type { InstallResult } from "./skills/operations/install-result.js";
export { enableSkill, type EnableSkillOperation } from "./skills/operations/enable.js";
export { disableSkill, type DisableSkillOperation } from "./skills/operations/disable.js";

// MCP server lifecycle operations. Installation itself is a materialization
// capability (`@agentxm/extension-materialization`) because the authoring
// routes need it too and a feature may not import a peer feature.
export {
  uninstallMcpServer,
  type UninstallMcpServerOperation,
  type UninstallMcpServerOperationArgs,
} from "./mcps/operations/uninstall.js";
export { enableMcpServer, type EnableMcpServerOperation } from "./mcps/operations/enable.js";
export { disableMcpServer, type DisableMcpServerOperation } from "./mcps/operations/disable.js";

// Subagent lifecycle operations
export {
  SUBAGENT_CONFIG_SURFACE,
  renderedSubagentTargets,
  subagentConfigTarget,
  subagentLifecycleArtifact,
} from "./subagents/operations/artifact.js";
export { enableSubagent, type EnableSubagentOperation } from "./subagents/operations/enable.js";
export { disableSubagent, type DisableSubagentOperation } from "./subagents/operations/disable.js";

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
} from "./packs/expansion.js";
export { validateExactPackDependencyVersions } from "./packs/resolved-dependency.js";
export {
  installPack,
  type InstallPackOperation,
  type InstallPackOperationArgs,
} from "./packs/operations/install.js";

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
} from "./packs/promote-authored-pack.js";

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

import * as Cause from "effect/Cause";
import { ConfigError } from "effect/Config";
import { SourceError } from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { afterAll, describe, expect, it } from "@effect/vitest";

import type { WorkspaceScope } from "@agentxm/extension-model/unstable/workspace-scope";
import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";
import {
  prepareExecutionCandidate,
  resolveExecutionCandidate,
  type FailureInput,
  type Plan,
} from "@agentxm/workspace/transitions/planning";
import { preapprovedPlanExecution } from "@agentxm/workspace/transitions/planning/testing";

import { defineSpecification } from "@agentxm/specification-metadata";
import { FqnInvalidError } from "@agentxm/extension-model/unstable/extensions/fqn";
import { FrontmatterParseFailure, SubagentContentError } from "@agentxm/extension-content";
import { AxmSkillCompatibilityUnavailable } from "@agentxm/cli-maintenance/official-skill/application";
import {
  AxmSkillIncompatible,
  type AxmSkillCompatibility,
} from "@agentxm/cli-maintenance/official-skill/domain";
import {
  RegistryOperationFailed,
  RegistryProblem,
  RegistryRequestFailed,
} from "@agentxm/registry-client";
import {
  AuthExchangeFailed,
  AuthInteractionAbandoned,
  AuthTokenPolicyRequired,
  DeviceAuthorizationPending,
  DeviceLoginCodeExpired,
  DeviceLoginDenied,
  RegistryAccessFailed,
  SignedOut,
} from "@agentxm/registry-access/authentication";
import { PublishFailed } from "@agentxm/workspace/publishing";
import {
  ApprovalRecoveryMissing,
  CandidateFingerprintFailed,
  LifecyclePostconditionViolated,
  PlanInteractionFailed,
  ScaffoldedExtensionUnresolved,
  StaleExecutionCandidate,
  StepFailure,
} from "@agentxm/workspace/transitions/planning";
import {
  TransitionLockError,
  TransitionLockUnavailable,
  WorkspaceDirectoryError,
  WorkspaceRestorationError,
  WorkspaceRestorationIncomplete,
  WorkspaceSnapshotError,
  WorkspaceTransitionCompromised,
} from "@agentxm/workspace/transitions/settlement";
import {
  AcceptedResolutionMissing,
  CanonicalPathRemovalError,
  ConfiguredAgentOutcomesUnavailable,
  DesiredPackGraphIncomplete,
  InlineExtensionSourceMissing,
  InvalidAgentId,
  LockEntryEndpointConflict,
  LockEntryNameInvalid,
  LockedSkillMissing,
  LockfileDecodeError,
  LockfileIoError,
  LockfileParseError,
  LockfileResolvedVersionInvalid,
  LockfileValidationError,
  LockfileVersionUnsupported,
  LockfileWriteError,
  MaterializedTreeInvalid,
  PackageContentHashFailed,
  PathTraversalDetected,
  SettingsDecodeError,
  SettingsEntryMissing,
  SettingsIoError,
  SettingsParseError,
  SettingsWriteError,
  SkillDiscoveryRootInvalid,
  SubagentScanFailed,
  SupersededCanonicalRemovalFailed,
  SymlinkCreationError,
  WorkspaceLayoutError,
  WorkspaceNotInitialized,
  WorkspaceRootEscape,
  WorkspaceSourceInvalid,
} from "@agentxm/workspace/desired-state";
import {
  ArchiveIntegrityMismatch,
  CanonicalPackageProbeFailed,
  CreateDestinationExists,
  HookDefinitionInvalid,
  KnowledgeDefinitionInvalid,
  KnowledgeDesiredStateUnreconcilable,
  KnowledgeIoFailed,
  KnowledgeResolutionMissing,
  KnowledgeUnavailable,
  McpAgentSyncRefused,
  McpCanonicalPathUnsafe,
  McpInstallStateMissing,
  McpLocalNameConflict,
  McpRequiredInputsMissing,
  McpWorkspacePackageInvalid,
  NativeMcpEntryRetirementFailed,
  PackArchiveFetchFailed,
  PackDefinitionInvalid,
  PackInstallStateMissing,
  PackStagingFailed,
  PackageCopyFailed,
  PackageMaterializationFailed,
  RuleDefinitionInvalid,
  SkillDefinitionInvalid,
  InstallStateMissing,
  SkillMaterializationFailed,
  StagedPackageInvalid,
  SubagentContentUnreadable,
  SubagentDefinitionInvalid,
} from "@agentxm/workspace/materialization";
import {
  AgentDetectionFailed,
  HookConfigInvalid,
  HookIoFailed,
  McpConfigInvalid,
  McpConfigIoFailed,
  McpDefinitionInvalid,
  McpEntryUnmanaged,
  McpOwnershipMarkerInvalid,
  McpSharedTargetConflict,
  NativeWriteRefused,
  SubagentIoFailed,
  TransientBackupFailed,
  WriteBackupRetained,
} from "@agentxm/workspace/projection/agent-adapters";
import {
  AuthoredContributorUnsupported,
  ContributorIdentityInvalid,
  ContributorTreeMismatch,
  ContributorUnresolved,
  DesiredStateIncomplete,
  InstructionMaintenanceFailed,
  ManagedRegionViolation,
  ProjectionIoFailed,
  ProjectionTargetUnsupported,
} from "@agentxm/workspace/projection";
import {
  AxmSkillGateUnavailable,
  GitOperationFailed,
  SourceHostNotConfigured,
  SourceNetworkFailure,
  SourceNotResolvable,
  SourceSyntaxInvalid,
  WorkspaceCatalogUnavailable,
} from "@agentxm/workspace/resolution/sources";
import {
  ExtensionResolutionFailed,
  PackConstraintShadowed,
  PackDependencyConflict,
  PackDependencyInvalid,
  PackDependencyMissing,
  PackDependencyUnsatisfied,
  SourceAuthorityBlocked,
} from "@agentxm/workspace/resolution";
import {
  AuthoringFailed,
  AuthoringOwnerMismatch,
  AuthoringOwnerRequired,
  AuthoringScopeUnsupported,
  CreateDestinationInspectionFailed,
  CreateNameConfigured,
  ForkPackageConflict,
  ForkPackageFailed,
  ForkPackageInvalid,
  NativeImportConflict,
  NativeImportFailed,
  NativeImportInvalid,
  NativeImportUnsupported,
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
  ScaffoldNameInvalid,
  authoringStepFailure,
} from "@agentxm/workspace/authoring";
import {
  ExtensionLifecycleFailed,
  InstallSelectionUnavailable,
  LifecycleFailureConversionLive,
  StepFailureConversion,
  lifecycleStepFailure,
} from "@agentxm/workspace/lifecycle";
import {
  WorkspaceConfigurationFailed,
  configurationFailedToStepFailure,
} from "@agentxm/workspace/configuration";
import {
  ReconciliationFailureConversionLive,
  SyncStepFailureConversion,
  isWorkspaceFailure,
  WorkspaceSyncFailed,
  workspaceFailureToStepFailure,
  type WorkspaceFailure,
} from "@agentxm/workspace/reconciliation";

import { AppError } from "./app-error/index.js";
import { stepFailureToAppError, toAppError } from "./app-error/conversions.js";
import { JsonErrorEnvelopeSchema, classifyError } from "./cli-runtime/index.js";
import { withOperationLifecycle } from "./operation-lifecycle.js";
import { PlanResolutionResultSchema, emitOperationResolution } from "./operation-output.js";
import { failureForWorkspaceScope, scopedRoutesOf } from "./root/shared/scoped-command.js";
import { rootCommand } from "./app.js";
import { makeSpecWorkspace } from "./test-support/install-harness.js";

export const specification = defineSpecification({
  requirement: "cli/failures-render-identically-on-direct-and-plan-paths",
  title: "A failure reads the same whether a command or a plan step reports it",
  statement:
    "A typed failure shall report the same category, exit code, title, detail, structured problem, recorded evidence, and stated recoveries, each recovery's command addressed to the scope it runs in, whether it surfaces directly at the command boundary or settles a plan step.",
  class: "functional",
  role: "experience",
  goals: ["actionable-diagnostics", "machine-automation"],
  boundary: "memory",
  boundaryRationale:
    "The two paths share only the kernel's rendering of the typed failure and diverge where the envelope is built, so each row compares their printed output in process: the direct column is the runtime's classification of a failure the workspace boundary addressed to its scope (exit code and machine error document); the plan column is an applied one-unit plan resolved by the plan pipeline over a temporary workspace and written by the plan-family renderer (exit code and plan result document).",
  methods: ["decision-table", "example"],
  derivedFrom: [
    "apps/cli/src/app-error/conversions.test.ts",
    "apps/cli/src/app-error/conversions/extension-materialization.test.ts",
  ],
  supersedes: [],
  assumptions: [
    "Where a failure states no recovery, the command boundary offers its category's generic recovery and a plan offers the command's own route; cli/non-success-results-name-a-fitting-recovery owns the plan's choice, so only stated recoveries are compared.",
    "An operation's message names the failed unit's settled message; the failure's own sentence is the unit's error message, which the plan result carries at verbose detail.",
  ],
  openQuestions: [],
  limitations: [
    {
      limitation:
        "Inputs appear only in human output and are compared on the failure each human renderer is handed, not on painted text; the plan-family human render does not list them.",
      retirementCondition:
        "Compare painted text once the plan-family human render lists a failure's inputs.",
    },
    {
      limitation:
        "A selection the terminal could not obtain renders the terminal interaction's own guidance when that interaction supplied it; selection happens before any plan exists, so no plan step carries it.",
      retirementCondition:
        "Bind a plan-step example here if extension selection ever runs inside a plan.",
    },
  ],
});

const ioCause = new Error("EACCES");

const incompatibleAxmSkill: AxmSkillCompatibility = {
  status: "incompatible",
  cliVersion: "1.0.0",
  skillVersion: "0.9.0",
  source: null,
  declaredCliVersion: null,
  declaredCliVersionRange: "^2.0.0",
  reasonCode: "cli-version-incompatible",
  detail: "Official AXM skill 0.9.0 requires AXM CLI ^2.0.0.",
  recovery: {
    action: "upgrade-cli",
    targetCliVersion: "2.0.0",
    targetSkillVersion: "0.9.0",
  },
};

const registryMetadata = {
  request: { service: "registry", method: "GET", url: "https://registry.agentxm.ai/v1/x" },
  response: { status: 503, requestId: "req_1", problemCode: "service_unavailable" },
} as const;

type Representatives = {
  readonly [Tag in WorkspaceFailure["_tag"]]: readonly [
    Extract<WorkspaceFailure, { readonly _tag: Tag }>,
    ...Array<Extract<WorkspaceFailure, { readonly _tag: Tag }>>,
  ];
};

/**
 * One or more representative failures for every tag the kernel renders. The
 * table is keyed by tag, so a rendered family without a representative is a
 * compile error rather than an untested row.
 */
const representatives: Representatives = {
  StepFailure: [
    new StepFailure({
      category: "conflict",
      detail: "A step already rendered its failure.",
      suggestions: [{ description: "Resolve it.", cmd: "axm sync", commandScope: "workspace" }],
    }),
  ],
  ConfigError: [new ConfigError(new SourceError({ message: "Configuration source unavailable" }))],
  SettingsIoError: [new SettingsIoError({ path: "/w/axm.json", cause: ioCause })],
  SettingsParseError: [new SettingsParseError({ path: "/w/axm.json", raw: "{", cause: ioCause })],
  SettingsDecodeError: [
    new SettingsDecodeError({ path: "/w/axm.json", issues: ["agents must be an array"], raw: {} }),
  ],
  LockfileIoError: [new LockfileIoError({ path: "/w/axm-lock.yaml", cause: ioCause })],
  LockfileParseError: [
    new LockfileParseError({ path: "/w/axm-lock.yaml", raw: ":", cause: ioCause }),
  ],
  LockfileDecodeError: [
    new LockfileDecodeError({ path: "/w/axm-lock.yaml", issues: ["bad"], raw: {} }),
  ],
  LockfileVersionUnsupported: [
    new LockfileVersionUnsupported({
      path: "/w/axm-lock.yaml",
      observedVersion: 5,
      supportedVersion: 7,
    }),
    new LockfileVersionUnsupported({
      path: "/w/axm-lock.yaml",
      observedVersion: 8,
      supportedVersion: 7,
    }),
  ],
  WorkspaceRootEscape: [new WorkspaceRootEscape({ workspaceRoot: "/outside", allowedRoot: "/w" })],
  SettingsWriteError: [
    new SettingsWriteError({ path: "/w/.axm", step: "mkdir", cause: ioCause }),
    new SettingsWriteError({ path: "/w/axm.json", step: "encode", cause: new Error("bad") }),
  ],
  LockfileWriteError: [
    new LockfileWriteError({ path: "/w/axm-lock.yaml", step: "encode", cause: ioCause }),
    new LockfileWriteError({ path: "/w/axm-lock.yaml", step: "rename", cause: ioCause }),
  ],
  LockfileValidationError: [
    new LockfileValidationError({ path: "/w/axm-lock.yaml", step: "read", cause: ioCause }),
  ],
  LockfileResolvedVersionInvalid: [
    new LockfileResolvedVersionInvalid({ field: "version", value: "^1.2.3", cause: ioCause }),
  ],
  WorkspaceLayoutError: [
    new WorkspaceLayoutError({
      detail: "Invalid rule authored root /w/rules: expected a directory",
    }),
  ],
  WorkspaceNotInitialized: [new WorkspaceNotInitialized({ settingsPath: "/w/axm.json" })],
  LockedSkillMissing: [new LockedSkillMissing({ name: "review" })],
  SettingsEntryMissing: [
    new SettingsEntryMissing({ entryType: "skill", name: "review" }),
    new SettingsEntryMissing({ entryType: "mcp-server", name: "srv" }),
  ],
  InvalidAgentId: [new InvalidAgentId({ agentId: "universal", cause: ioCause })],
  DesiredPackGraphIncomplete: [new DesiredPackGraphIncomplete()],
  CanonicalPathRemovalError: [
    new CanonicalPathRemovalError({ path: "/w/pkg", step: "remove", cause: ioCause }),
  ],
  SymlinkCreationError: [
    new SymlinkCreationError({ path: "/w/link", step: "symlink", cause: ioCause }),
  ],
  LockEntryNameInvalid: [new LockEntryNameInvalid({ name: "Bad Name" })],
  LockEntryEndpointConflict: [
    new LockEntryEndpointConflict({
      sourceKind: "registry",
      sourceName: "main",
      acceptedEndpoint: "https://a.example",
      resolvedEndpoint: "https://b.example",
    }),
  ],
  AcceptedResolutionMissing: [new AcceptedResolutionMissing({ label: "skill", name: "review" })],
  InlineExtensionSourceMissing: [new InlineExtensionSourceMissing({ name: "srv" })],
  SupersededCanonicalRemovalFailed: [
    new SupersededCanonicalRemovalFailed({ path: "/w/old", cause: ioCause }),
  ],
  PackageContentHashFailed: [
    new PackageContentHashFailed({ packageDir: "/w/pkg", cause: ioCause }),
  ],
  WorkspaceSourceInvalid: [
    new WorkspaceSourceInvalid({ source: "workspace:x", detail: "missing manifest" }),
  ],
  SkillDiscoveryRootInvalid: [
    new SkillDiscoveryRootInvalid({ searchRoot: "/w/skills", problem: "not-directory" }),
  ],
  SubagentScanFailed: [new SubagentScanFailed({ agentName: "claude-code", cause: ioCause })],
  MaterializedTreeInvalid: [
    new MaterializedTreeInvalid({ root: "/w/pkg", reason: "symlink is not allowed: src/link" }),
  ],
  PathTraversalDetected: [new PathTraversalDetected({ path: "/outside" })],
  ConfiguredAgentOutcomesUnavailable: [
    new ConfiguredAgentOutcomesUnavailable({
      category: "unavailable",
      detail: "Agent outcomes could not be read.",
      suggestions: [{ description: "Retry." }],
    }),
  ],
  WorkspaceSnapshotError: [
    new WorkspaceSnapshotError({ target: "/w/axm.json", step: "copy", cause: ioCause }),
  ],
  WorkspaceDirectoryError: [
    new WorkspaceDirectoryError({ path: "/w/.axm", step: "create", cause: ioCause }),
  ],
  TransitionLockError: [
    new TransitionLockError({ path: "/w/.axm/tmp/lock", step: "acquire", cause: ioCause }),
  ],
  TransitionLockUnavailable: [
    new TransitionLockUnavailable({
      holder: { command: "install", pid: 123 },
      waitedMillis: 60_000,
    }),
  ],
  WorkspaceTransitionCompromised: [
    new WorkspaceTransitionCompromised({
      workspaceDir: "/w/.axm",
      lockPath: "/w/.axm/tmp/lock",
      cause: ioCause,
    }),
  ],
  WorkspaceRestorationError: [
    new WorkspaceRestorationError({ target: "/w/axm.json", step: "verify", cause: undefined }),
  ],
  WorkspaceRestorationIncomplete: [
    new WorkspaceRestorationIncomplete({
      terminationCause: "failure",
      transitionCause: Cause.fail(
        new WorkspaceSnapshotError({ target: "/w/axm.json", step: "copy", cause: ioCause }),
      ),
      restorationCause: new Error("restoration defect"),
      snapshotDir: "/w/.axm/tmp/snapshots",
      retained: ["axm.json"],
    }),
  ],
  StaleExecutionCandidate: [new StaleExecutionCandidate({ candidate: "Install extensions" })],
  CandidateFingerprintFailed: [
    new CandidateFingerprintFailed({ target: "/w/axm.json", cause: ioCause }),
  ],
  ApprovalRecoveryMissing: [new ApprovalRecoveryMissing()],
  PlanInteractionFailed: [
    new PlanInteractionFailed({ category: "usage", detail: "The terminal closed." }),
  ],
  LifecyclePostconditionViolated: [
    new LifecyclePostconditionViolated({
      postcondition: "install-observable",
      targetType: "skill",
      targetName: "demo",
    }),
  ],
  ScaffoldedExtensionUnresolved: [
    new ScaffoldedExtensionUnresolved({ targetType: "skill", targetName: "demo" }),
  ],
  PackageMaterializationFailed: [
    new PackageMaterializationFailed({ path: "/w/pkg", step: "replace", cause: ioCause }),
  ],
  StagedPackageInvalid: [new StagedPackageInvalid({ file: "skill.json", kind: "missing" })],
  CanonicalPackageProbeFailed: [
    new CanonicalPackageProbeFailed({ detail: "Failed to check /w/pkg", cause: ioCause }),
  ],
  PackageCopyFailed: [
    new PackageCopyFailed({ severity: "validation", detail: "Failed to copy", cause: ioCause }),
  ],
  ArchiveIntegrityMismatch: [
    new ArchiveIntegrityMismatch({ subject: "Integrity mismatch for demo@1.0.0" }),
  ],
  CreateDestinationExists: [
    new CreateDestinationExists({ subject: "Skill", path: "/w/skills/demo" }),
  ],
  RuleDefinitionInvalid: [new RuleDefinitionInvalid({ detail: "Failed to read rule.json" })],
  HookDefinitionInvalid: [new HookDefinitionInvalid({ detail: "Hook entrypoint missing" })],
  SubagentDefinitionInvalid: [
    new SubagentDefinitionInvalid({ detail: "Workspace subagent source is missing" }),
  ],
  SubagentContentUnreadable: [
    new SubagentContentUnreadable({
      expectedFilename: "demo.md",
      subagentSrcPath: "/w/subagents/demo/src",
      contentPath: "/w/subagents/demo/src/demo.md",
      cause: ioCause,
    }),
  ],
  McpInstallStateMissing: [new McpInstallStateMissing({ name: "demo" })],
  McpLocalNameConflict: [
    new McpLocalNameConflict({
      localName: "demo",
      requestedIdentity: "@a/mcps/demo",
      owningIdentity: "@b/mcps/demo",
    }),
  ],
  McpCanonicalPathUnsafe: [
    new McpCanonicalPathUnsafe({ serverName: "demo", canonicalPath: "/outside" }),
  ],
  McpWorkspacePackageInvalid: [
    new McpWorkspacePackageInvalid({
      serverName: "demo",
      location: "/w/mcps/demo",
      fault: "missing",
    }),
  ],
  McpRequiredInputsMissing: [
    new McpRequiredInputsMissing({ localName: "demo", inputNames: ["API_KEY"] }),
  ],
  McpAgentSyncRefused: [
    new McpAgentSyncRefused({ serverName: "demo", fault: "unknown-agents", agentIds: ["x"] }),
  ],
  NativeMcpEntryRetirementFailed: [
    new NativeMcpEntryRetirementFailed({
      category: "conflict",
      detail: "The native entry changed since AXM wrote it.",
      filePath: "/w/.mcp.json",
    }),
  ],
  SkillDefinitionInvalid: [new SkillDefinitionInvalid({ detail: "Invalid skills directory" })],
  SkillMaterializationFailed: [
    new SkillMaterializationFailed({ detail: "Failed to remove skill artifact", cause: ioCause }),
  ],
  InstallStateMissing: [new InstallStateMissing({ type: "skill", name: "demo" })],
  AxmSkillCompatibilityUnavailable: [new AxmSkillCompatibilityUnavailable()],
  AxmSkillIncompatible: [new AxmSkillIncompatible({ compatibility: incompatibleAxmSkill })],
  PackDefinitionInvalid: [new PackDefinitionInvalid({ detail: "Workspace pack is missing" })],
  PackInstallStateMissing: [new PackInstallStateMissing({ name: "demo" })],
  PackArchiveFetchFailed: [new PackArchiveFetchFailed({ message: "reset", cause: ioCause })],
  PackStagingFailed: [new PackStagingFailed({ packDir: "/w/packs/demo", cause: ioCause })],
  KnowledgeDefinitionInvalid: [
    new KnowledgeDefinitionInvalid({ detail: "Failed to parse knowledge.json" }),
  ],
  KnowledgeIoFailed: [new KnowledgeIoFailed({ detail: "Failed to stage", cause: ioCause })],
  KnowledgeResolutionMissing: [new KnowledgeResolutionMissing({ name: "demo" })],
  KnowledgeDesiredStateUnreconcilable: [new KnowledgeDesiredStateUnreconcilable()],
  KnowledgeUnavailable: [new KnowledgeUnavailable({ detail: "Cannot be restored: demo" })],
  FqnInvalidError: [new FqnInvalidError({ input: "not-a-valid-fqn" })],
  FrontmatterParseFailure: [
    new FrontmatterParseFailure({ reason: "YAML frontmatter could not be parsed" }),
  ],
  SubagentContentError: [
    new SubagentContentError({
      reason: "missing-frontmatter",
      detail: "Subagent content has no frontmatter",
      suggestion: "Add a frontmatter block.",
    }),
  ],
  AgentDetectionFailed: [new AgentDetectionFailed({ detail: "Detection failed", cause: ioCause })],
  HookConfigInvalid: [new HookConfigInvalid({ detail: "Invalid hooks config" })],
  HookIoFailed: [new HookIoFailed({ detail: "Failed to read hooks config", cause: ioCause })],
  TransientBackupFailed: [
    new TransientBackupFailed({ path: "/w/config.json", step: "write-backup", cause: ioCause }),
  ],
  SubagentIoFailed: [new SubagentIoFailed({ detail: "Failed to materialize", cause: ioCause })],
  McpConfigInvalid: [new McpConfigInvalid({ detail: "Invalid MCP config YAML" })],
  McpConfigIoFailed: [
    new McpConfigIoFailed({ detail: "Failed to write MCP config", cause: ioCause }),
  ],
  McpEntryUnmanaged: [new McpEntryUnmanaged({ serverName: "demo", configPath: "/w/.mcp.json" })],
  McpOwnershipMarkerInvalid: [
    new McpOwnershipMarkerInvalid({
      serverName: "demo",
      state: "unsupported-version",
      operation: "modify",
    }),
  ],
  McpDefinitionInvalid: [new McpDefinitionInvalid({ detail: "No command or URL" })],
  McpSharedTargetConflict: [
    new McpSharedTargetConflict({ reason: "members disagree on the shared target" }),
  ],
  NativeWriteRefused: [new NativeWriteRefused({ path: "/w/.mcp.json", cause: ioCause })],
  WriteBackupRetained: [
    new WriteBackupRetained({
      backupPath: "/tmp/backup/config.json.bak",
      failure: new McpConfigIoFailed({ detail: "Failed to write MCP config", cause: ioCause }),
    }),
  ],
  DesiredStateIncomplete: [new DesiredStateIncomplete({ problems: "pack demo is missing" })],
  AuthoredContributorUnsupported: [new AuthoredContributorUnsupported({ type: "rule" })],
  ContributorIdentityInvalid: [
    new ContributorIdentityInvalid({ type: "rule", identity: "workspace:bad" }),
  ],
  ContributorUnresolved: [new ContributorUnresolved({ type: "rule", name: "demo" })],
  ContributorTreeMismatch: [new ContributorTreeMismatch({ packageRoot: "/w/rules/demo" })],
  ProjectionTargetUnsupported: [
    new ProjectionTargetUnsupported({ detail: "Target does not support comments: notes.txt" }),
  ],
  ManagedRegionViolation: [
    new ManagedRegionViolation({ displayPath: "AGENTS.md", reason: "unpaired markers" }),
  ],
  ProjectionIoFailed: [
    new ProjectionIoFailed({ path: "/w/AGENTS.md", step: "reconcile", cause: ioCause }),
  ],
  InstructionMaintenanceFailed: [
    new InstructionMaintenanceFailed({
      category: "conflict",
      detail: "AGENTS.md is owned by another writer.",
      suggestions: [{ description: "Resolve the conflict." }],
    }),
  ],
  SourceSyntaxInvalid: [
    new SourceSyntaxInvalid({
      detail: 'Invalid provider shorthand "github:x"',
      suggestions: [{ description: "Use github:owner/repo." }],
    }),
  ],
  SourceHostNotConfigured: [
    new SourceHostNotConfigured({ detail: 'No configured source matches "https://x.example"' }),
  ],
  SourceNotResolvable: [
    new SourceNotResolvable({
      category: "conflict",
      detail: "The official AXM skill release is incompatible.",
      recover: "Converge to AXM CLI 2.0.0",
      cmd: "axm upgrade",
    }),
  ],
  SourceNetworkFailure: [
    new SourceNetworkFailure({ detail: "Clone timed out", retryable: true, cause: ioCause }),
  ],
  GitOperationFailed: [
    new GitOperationFailed({ operation: "clone", detail: "Failed to clone", cause: ioCause }),
    new GitOperationFailed({
      operation: "fetch-commit",
      detail: "Failed to fetch commit abc123",
      cause: ioCause,
    }),
    new GitOperationFailed({ operation: "list-remote-refs", detail: "Failed to list refs" }),
    new GitOperationFailed({ operation: "get-tree-sha", detail: "Failed to get tree SHA" }),
  ],
  WorkspaceCatalogUnavailable: [
    new WorkspaceCatalogUnavailable({
      category: "validation",
      detail: "Workspace lockfile at /w/axm-lock.yaml declares version 8.",
      cause: new LockfileVersionUnsupported({
        path: "/w/axm-lock.yaml",
        observedVersion: 8,
        supportedVersion: 7,
      }),
    }),
    new WorkspaceCatalogUnavailable({
      category: "unavailable",
      detail: "Skill discovery could not stat /w/.claude/skills.",
      cause: ioCause,
    }),
  ],
  AxmSkillGateUnavailable: [
    new AxmSkillGateUnavailable({ category: "internal", detail: "Gate did not evaluate." }),
  ],
  RegistryProblem: [
    new RegistryProblem({
      category: "unavailable",
      title: "Advisory title",
      detail: "The service is unavailable.",
      metadata: registryMetadata,
      cause: ioCause,
    }),
  ],
  RegistryRequestFailed: [
    new RegistryRequestFailed({
      category: "timeout",
      detail: "Registry request did not complete within the configured deadline.",
      metadata: {
        request: registryMetadata.request,
        requestPolicy: {
          retryable: true,
          attemptCount: 1,
          maxAttempts: 1,
          exhausted: true,
          stoppedBy: "replay-unsafe",
          replaySafety: "mutation",
        },
      },
      cause: ioCause,
    }),
  ],
  RegistryOperationFailed: [
    new RegistryOperationFailed({ category: "internal", detail: "Archive extraction failed." }),
  ],
  ExtensionResolutionFailed: [
    new ExtensionResolutionFailed({
      category: "conflict",
      title: "No compatible version",
      detail: "No visible version satisfies ^2.0.0",
      recover: "Relax the constraint",
      cmd: "axm update @owner/skills/demo",
    }),
  ],
  SourceAuthorityBlocked: [
    new SourceAuthorityBlocked({
      detail: "skill demo is workspace-authored",
      recovery: [{ description: "Fork the package first" }],
    }),
  ],
  PackDependencyInvalid: [new PackDependencyInvalid({ detail: "Unable to resolve dependency" })],
  PackDependencyConflict: [new PackDependencyConflict({ detail: "Authority does not match" })],
  PackConstraintShadowed: [
    new PackConstraintShadowed({
      packSource: "registry",
      packFqn: "@owner/packs/demo",
      memberFqn: "@owner/skills/member",
      constraint: "^1.0.0",
      workspaceVersion: "2.0.0",
    }),
  ],
  PackDependencyMissing: [new PackDependencyMissing({ dependencyTarget: "@owner/skills/demo" })],
  PackDependencyUnsatisfied: [
    new PackDependencyUnsatisfied({ dependencyTarget: "@owner/skills/demo", constraint: "^1.0.0" }),
  ],
  AuthoringFailed: [
    new AuthoringFailed({
      category: "conflict",
      detail: "The package is already authored here.",
      recover: "Choose another name.",
    }),
  ],
  CreateNameConfigured: [new CreateNameConfigured({ subject: "Skill", name: "demo" })],
  CreateDestinationInspectionFailed: [
    new CreateDestinationInspectionFailed({ path: "/w/skills/demo", cause: ioCause }),
  ],
  ForkPackageInvalid: [new ForkPackageInvalid({ detail: "Manifest could not be read" })],
  ForkPackageConflict: [new ForkPackageConflict({ detail: "Fork target already exists" })],
  ForkPackageFailed: [new ForkPackageFailed({ detail: "Fork failed", cause: ioCause })],
  NativeImportUnsupported: [new NativeImportUnsupported({ type: "rule" })],
  NativeImportInvalid: [new NativeImportInvalid({ detail: "Native content needs frontmatter" })],
  NativeImportConflict: [new NativeImportConflict({ targetDir: "/w/authored/demo" })],
  NativeImportFailed: [new NativeImportFailed({ detail: "Native import failed", cause: ioCause })],
  AuthoringOwnerRequired: [
    new AuthoringOwnerRequired({
      subject: "skill",
      command: "skills new",
      name: "demo",
      candidates: ["@acme"],
      settingsPath: "axm.json",
    }),
  ],
  AuthoringOwnerMismatch: [new AuthoringOwnerMismatch({ requested: "@a", configured: "@b" })],
  ScaffoldNameInvalid: [
    new ScaffoldNameInvalid({
      subject: "skill",
      name: "Bad Name",
      pattern: "^[a-z][a-z0-9-]*$",
      maxLength: 64,
    }),
  ],
  AuthoringScopeUnsupported: [new AuthoringScopeUnsupported({ subject: "skill", scope: "user" })],
  PackSelectorNotAPack: [new PackSelectorNotAPack({ selector: "@owner/skills/demo" })],
  PackNotConfigured: [new PackNotConfigured({ selector: "demo" })],
  PackSelectorAmbiguous: [
    new PackSelectorAmbiguous({ selector: "demo", configuredNames: ["demo-a", "demo-b"] }),
  ],
  PackSourceMissing: [new PackSourceMissing({ pack: "demo" })],
  PackNotAuthored: [new PackNotAuthored({ pack: "demo" })],
  PackOwnerUnconfigured: [new PackOwnerUnconfigured({ pack: "demo", settingsPath: "axm.json" })],
  PackManifestUnavailable: [
    new PackManifestUnavailable({
      path: "/w/packs/demo/pack.json",
      reason: "unreadable",
      cause: ioCause,
    }),
  ],
  PackGraphInvalid: [new PackGraphInvalid({ packFqn: "@owner/packs/demo" })],
  PackMemberAmbiguous: [
    new PackMemberAmbiguous({
      selector: "demo",
      pack: "@owner/packs/demo",
      matches: [
        { type: "skill", fqn: "@owner/skills/demo" },
        { type: "rule", fqn: "@owner/rules/demo" },
      ],
    }),
  ],
  PackMemberUnmanaged: [new PackMemberUnmanaged({ selector: "demo" })],
  PackMemberNotFound: [
    new PackMemberNotFound({ selector: "demo", pattern: false }),
    new PackMemberNotFound({ selector: "demo-*", pattern: true }),
  ],
  PackMemberNotDeclared: [new PackMemberNotDeclared({ selector: "demo", pattern: false })],
  ExtensionLifecycleFailed: [
    new ExtensionLifecycleFailed({
      category: "conflict",
      title: "Update refused",
      detail: "The pack owns this constraint.",
      recover: "Update the pack instead.",
      cmd: "axm update @owner/packs/demo",
    }),
    new ExtensionLifecycleFailed({ category: "validation" }),
  ],
  InstallSelectionUnavailable: [new InstallSelectionUnavailable({ cause: new Error("closed") })],
  WorkspaceConfigurationFailed: [
    new WorkspaceConfigurationFailed({
      category: "usage",
      detail: "Name at least one agent.",
      recover: "Pass an agent ID.",
      cmd: "axm agents add claude-code",
    }),
  ],
  WorkspaceSyncFailed: [
    new WorkspaceSyncFailed({
      category: "conflict",
      detail: "A managed region on AGENTS.md is owned by another writer.",
      suggestions: [{ description: "Resolve the region." }],
    }),
    // A cleanup failure inside an uninstall or activation closure.
    new WorkspaceSyncFailed({
      category: "internal",
      detail: "Failed to remove managed agent artifact: /w/.claude/skills/demo",
      cause: ioCause,
    }),
  ],
  PublishFailed: [
    new PublishFailed({
      category: "conflict",
      detail: "Version 1.2.3 already exists.",
      recover: "Bump the version in your manifest.",
    }),
    new PublishFailed({
      category: "validation",
      detail: "The package is not authored by this workspace.",
      suggestions: [{ description: "Adopt it first.", cmd: "axm adopt @owner/skills/demo" }],
    }),
  ],
  RegistryAccessFailed: [
    new RegistryAccessFailed({
      category: "auth_expired",
      detail: "The pending device sign-in expired.",
      suggestions: [
        { description: "Start a new device sign-in.", cmd: "axm login --device-code --json" },
      ],
    }),
    new RegistryAccessFailed({
      category: "auth_denied",
      detail: "The pending device sign-in was denied.",
      suggestions: [
        {
          description: "Request a new device sign-in code.",
          cmd: "axm login --device-code --json",
        },
      ],
      cause: new DeviceLoginDenied(),
    }),
  ],
  SignedOut: [new SignedOut({ message: "You are not signed in." })],
  AuthTokenPolicyRequired: [new AuthTokenPolicyRequired({})],
  DeviceLoginDenied: [new DeviceLoginDenied()],
  DeviceLoginCodeExpired: [new DeviceLoginCodeExpired()],
  DeviceAuthorizationPending: [
    new DeviceAuthorizationPending({
      waitEnded: { _tag: "Elapsed", seconds: 30 },
      registryUrl: "https://registry.example.test",
      intervalSeconds: 2,
      verificationUri: "https://auth.agentxm.ai/device",
      verificationUriComplete: "https://auth.agentxm.ai/device?user_code=ABCD-1234",
      userCode: "ABCD-1234",
      expiresAt: "2099-01-01T00:00:00.000Z",
      resume: "axm login --device-code --wait-for-human 300 --json",
    }),
    new DeviceAuthorizationPending({
      waitEnded: { _tag: "Stopped" },
      registryUrl: "https://registry.example.test",
      intervalSeconds: 2,
      verificationUri: "https://auth.agentxm.ai/device",
      verificationUriComplete: "https://auth.agentxm.ai/device?user_code=ABCD-1234",
      userCode: "ABCD-1234",
      expiresAt: "2099-01-01T00:00:00.000Z",
      resume: "axm login --device-code --wait-for-human 300 --json",
    }),
  ],
  AuthInteractionAbandoned: [
    new AuthInteractionAbandoned({ message: "The sign-in prompt was abandoned." }),
  ],
  AuthExchangeFailed: [
    new AuthExchangeFailed({
      detail: "Token refresh request failed",
      suggestions: [{ description: "Sign in again.", cmd: "axm login" }],
      failure: new RegistryRequestFailed({
        category: "network",
        detail: "Token exchange failed: the Registry could not be reached.",
        cause: ioCause,
      }),
    }),
  ],
};

const rows: ReadonlyArray<WorkspaceFailure> = Object.values(representatives).flat();

/** Every field an operator reads from a reported failure, whichever path reported it. */
interface OperatorView {
  readonly code: string;
  readonly exitCode: number;
  readonly title: string | undefined;
  readonly detail: string | undefined;
  readonly problemCode: string | undefined;
  readonly metadata: unknown;
  readonly retryable: boolean | undefined;
  readonly inputs: ReadonlyArray<FailureInput> | undefined;
  readonly suggestions: ReadonlyArray<SuggestedAction>;
}

/**
 * A suggestion as an operator reads it from either document. The published
 * suggestion contract also rejects commands that are not one inert AXM
 * invocation; several producers still state placeholder commands, which both
 * paths print alike, so this reader keeps what was printed.
 */
const PrintedSuggestionSchema = Schema.Struct({
  description: Schema.String,
  cmd: Schema.optional(Schema.String),
  url: Schema.optional(Schema.String),
});

/** The machine error document the runtime writes for a failed command. */
const decodeErrorDocument = Schema.decodeUnknownEffect(
  Schema.fromJsonString(
    Schema.Struct({
      ...JsonErrorEnvelopeSchema.fields,
      suggestions: Schema.optional(Schema.Array(PrintedSuggestionSchema)),
    }),
  ),
);

/** The machine document a plan-family command writes for a settled operation. */
const decodePlanDocument = Schema.decodeUnknownEffect(
  Schema.fromJsonString(
    Schema.Struct({
      result: PlanResolutionResultSchema,
      suggestions: Schema.optional(Schema.Array(PrintedSuggestionSchema)),
    }),
  ),
);

/**
 * The direct path: the failure leaves a command inside the workspace
 * boundary, which addresses it to the workspace's scope, and the runtime
 * classifies it into its exit code and machine error document. Inputs appear
 * only in human output, so they are read from the envelope that output is
 * rendered from. The document offers a category's generic recovery when a
 * failure states none, so only the recoveries the failure states are compared.
 */
const directView = (failure: WorkspaceFailure, scope: WorkspaceScope) =>
  Effect.gen(function* () {
    const reported = failureForWorkspaceScope(failure, scope, scopedRoutesOf(rootCommand));
    const envelope = reported instanceof AppError ? reported : undefined;
    const classified = classifyError(reported, "json");
    const document = yield* decodeErrorDocument(classified.stdout ?? "");
    return {
      code: document.code,
      exitCode: classified.exitCode,
      title: document.title,
      detail: document.detail,
      problemCode: document.problem?.code,
      metadata: document.metadata,
      retryable: document.retryable,
      inputs: envelope?.inputs,
      suggestions: envelope?.suggestions === undefined ? [] : (document.suggestions ?? []),
    } satisfies OperatorView;
  });

/** A one-unit plan whose unit settles with the kernel's rendering of the failure. */
const failingPlan = (failure: StepFailure): Plan => ({
  _tag: "Plan",
  name: "Render a failure",
  description: Option.none(),
  jobs: [
    {
      concurrency: 1,
      steps: [{ readiness: "ready", key: "unit", label: "unit", run: Effect.fail(failure) }],
    },
  ],
});

const PARITY_COMMAND = "failure-parity";

/**
 * A workspace in each scope whose plan pipeline and machine renderer are the
 * product's own, reused across rows so each row runs one plan.
 */
const planWorkspaces = {
  project: makeSpecWorkspace({
    machine: true,
    flags: { json: true, verbose: true },
    screen: { kind: "machine" },
  }),
  user: makeSpecWorkspace({
    scope: "user",
    userSettings: {},
    machine: true,
    flags: { json: true, verbose: true },
    screen: { kind: "machine" },
  }),
} as const;

afterAll(() => {
  planWorkspaces.project.cleanup();
  planWorkspaces.user.cleanup();
});

/**
 * The plan path: an applied plan whose unit settled with the kernel's
 * rendering is resolved by the plan pipeline and written by the plan-family
 * renderer, which carries the failure on the operation and its unit and
 * addresses the operation's recoveries to the workspace's scope. Detail is the
 * unit's rendered sentence; the operation's message names the unit's settled
 * message instead. Inputs are read from the settled failure the human
 * renderer is handed.
 */
const planView = (failure: WorkspaceFailure, scope: WorkspaceScope) =>
  Effect.gen(function* () {
    const workspace = planWorkspaces[scope];
    const log = workspace.streams?.log ?? [];
    const written = log.length;
    const { resolution, emitted } = yield* withOperationLifecycle(
      { command: PARITY_COMMAND, mode: "apply", planName: "Render a failure" },
      Effect.gen(function* () {
        const candidate = yield* prepareExecutionCandidate(
          failingPlan(workspaceFailureToStepFailure(failure)),
        );
        const resolution = yield* resolveExecutionCandidate(candidate, preapprovedPlanExecution);
        const emitted = yield* emitOperationResolution(resolution);
        return { resolution, emitted };
      }),
    ).pipe(workspace.provide);
    const stdout = log
      .slice(written)
      .flatMap((entry) => (entry.channel === "stdout" ? [entry.content] : []))
      .join("");
    const document = yield* decodePlanDocument(stdout);
    const operation = document.result.failure;
    const [unit] = document.result.units;
    return {
      code: operation?.code ?? document.result.outcome,
      exitCode: emitted.exitCode,
      title: operation?.title,
      detail: unit?.error?.message,
      problemCode: operation?.problem?.code,
      metadata: operation?.metadata,
      retryable: operation?.retryable,
      inputs: resolution.failure?.inputs,
      suggestions: document.suggestions ?? [],
    } satisfies OperatorView;
  });

/** Every field a person or a machine reads from a rendered failure. */
const rendered = (error: AppError) => ({
  code: error.code,
  title: error.title,
  detail: error.detail,
  problem: error.problem,
  metadata: error.metadata,
  retryable: error.retryable,
  inputs: error.inputs,
  suggestions: error.suggestions,
});

const viaPlanStep = (failure: StepFailure): AppError => stepFailureToAppError(failure);

describe("A failure reads the same on the direct and plan paths", () => {
  // A kernel rendering reaches the direct column only through the CLI's
  // envelope projection and the runtime's error document, and the plan
  // column only through the plan pipeline and the plan-family renderer, so a
  // CLI-side rendering of any one tag breaks that tag's rows.
  it.effect.each(
    rows.flatMap((failure, index) =>
      (["project", "user"] as const).map(
        (scope) => [`${failure._tag} #${index} in a ${scope} workspace`, failure, scope] as const,
      ),
    ),
  )("%s reads the same whether a command or a plan step reports it", ([, failure, scope]) =>
    Effect.gen(function* () {
      expect(isWorkspaceFailure(failure)).toBe(true);
      const direct = yield* directView(failure, scope);
      const plan = yield* planView(failure, scope);
      expect(plan).toEqual(direct);
    }),
  );

  it.effect("addresses a lockfile recovery to the scope it runs in on every path", () =>
    Effect.gen(function* () {
      const lockfile = (observedVersion: number) =>
        new LockfileVersionUnsupported({
          path: "/w/axm-lock.yaml",
          observedVersion,
          supportedVersion: 7,
        });
      const viaCatalog = (cause: LockfileVersionUnsupported) =>
        new WorkspaceCatalogUnavailable({
          category: "validation",
          detail: "Workspace state is invalid.",
          cause,
        });
      // A newer lockfile needs a newer AXM, which is upgraded for the whole
      // installation; an older one is regenerated in the workspace itself.
      const views = [
        ...[lockfile(8), viaCatalog(lockfile(8))].map((failure) => directView(failure, "user")),
        planView(lockfile(8), "user"),
      ];
      for (const view of yield* Effect.all(views)) {
        expect(view.problemCode).toBe("workspace-lockfile-version-unsupported");
        expect(view.suggestions.map((suggestion) => suggestion.cmd)).toEqual(["axm upgrade"]);
      }
      for (const view of yield* Effect.all([
        directView(lockfile(5), "user"),
        directView(viaCatalog(lockfile(5)), "user"),
        planView(lockfile(5), "user"),
      ])) {
        expect(view.suggestions.flatMap((suggestion) => suggestion.cmd ?? [])).toEqual([
          "axm sync --preview --scope user",
          "axm sync --scope user",
        ]);
      }
    }),
  );

  it.effect("exits a Git fetch failure as a network failure on both paths", () =>
    Effect.gen(function* () {
      // A pinned ref is fetched from the remote; the one category table
      // classifies it once, so the plan path and the direct path agree.
      const failure = new GitOperationFailed({
        operation: "fetch-commit",
        detail: "Failed to fetch commit abc123",
        cause: ioCause,
      });
      for (const view of yield* Effect.all([
        directView(failure, "project"),
        planView(failure, "project"),
      ])) {
        expect(view.code).toBe("network");
        expect(view.exitCode).toBe(8);
      }
    }),
  );

  it.effect("keeps a sign-in recovery unscoped in a user workspace on both paths", () =>
    Effect.gen(function* () {
      // Signing in runs for the whole installation: `axm login` takes no
      // `--scope`, so a user-scope workspace must not narrow it.
      const failures = [
        new SignedOut({ message: "You are not signed in." }),
        new DeviceLoginCodeExpired(),
        new ExtensionLifecycleFailed({
          category: "not_found",
          detail: "@acme/skills/private was not found in configured registries",
          suggestions: [
            {
              description: "Sign in to check whether the extension is private.",
              cmd: "axm login",
              commandScope: "global",
            },
          ],
        }),
      ];
      for (const failure of failures) {
        for (const view of yield* Effect.all([
          directView(failure, "user"),
          planView(failure, "user"),
        ])) {
          const commands = view.suggestions.flatMap((suggestion) => suggestion.cmd ?? []);
          expect(commands.length).toBeGreaterThan(0);
          for (const command of commands) {
            expect(command).toMatch(/^axm login/);
            expect(command).not.toContain("--scope");
          }
        }
      }
    }),
  );

  it.effect(
    "reads an unreadable settings or lockfile as unavailable storage that names the file and implies no retry",
    () =>
      Effect.gen(function* () {
        for (const [failure, title, repair] of [
          [
            new SettingsIoError({ path: "/w/axm.json", cause: ioCause }),
            "Workspace settings unreadable",
            "Repair the settings file permissions or restore the file, then re-run.",
          ],
          [
            new LockfileIoError({ path: "/w/axm-lock.yaml", cause: ioCause }),
            "Workspace lockfile unreadable",
            "Repair the lockfile permissions or restore a known-good copy, then re-run.",
          ],
        ] as const) {
          for (const view of yield* Effect.all([
            directView(failure, "project"),
            planView(failure, "project"),
          ])) {
            expect(view.code).toBe("unavailable");
            expect(view.exitCode).toBe(11);
            expect(view.title).toBe(title);
            expect(view.retryable).toBe(false);
            expect(view.suggestions.map((suggestion) => suggestion.description)).toEqual([repair]);
          }
        }
      }),
  );

  it.effect("renders a lifecycle plan step the same way through the provided conversion", () =>
    Effect.gen(function* () {
      const conversion = yield* StepFailureConversion;
      const failures = [
        new McpSharedTargetConflict({ reason: "members disagree on the shared target" }),
        new LockfileVersionUnsupported({
          path: "/w/axm-lock.yaml",
          observedVersion: 8,
          supportedVersion: 7,
        }),
        new ExtensionLifecycleFailed({ category: "conflict", title: "Update refused" }),
        new RegistryProblem({
          category: "unavailable",
          metadata: registryMetadata,
          cause: ioCause,
        }),
      ];
      for (const failure of failures) {
        const direct = rendered(toAppError(failure));
        expect(rendered(viaPlanStep(conversion.toStepFailure(failure)))).toEqual(direct);
        expect(rendered(viaPlanStep(lifecycleStepFailure(failure)))).toEqual(direct);
      }
    }).pipe(Effect.provide(LifecycleFailureConversionLive)),
  );

  it.effect("renders a reconciliation plan step the same way through the provided conversion", () =>
    Effect.gen(function* () {
      const conversion = yield* SyncStepFailureConversion;
      const failures = [
        new WorkspaceSyncFailed({ category: "conflict", detail: "Owned by another writer." }),
        new InstructionMaintenanceFailed({ category: "internal", detail: "AGENTS.md failed." }),
        new PackConstraintShadowed({
          packSource: "workspace",
          packFqn: "@owner/packs/demo",
          memberFqn: "@owner/skills/member",
          constraint: "^1.0.0",
          workspaceVersion: "2.0.0",
        }),
        new LockfileIoError({ path: "/w/axm-lock.yaml", cause: ioCause }),
      ];
      for (const failure of failures) {
        expect(rendered(viaPlanStep(conversion.toStepFailure(failure)))).toEqual(
          rendered(toAppError(failure)),
        );
      }
    }).pipe(Effect.provide(ReconciliationFailureConversionLive)),
  );

  it("renders authoring and configuration plan steps the same way", () => {
    for (const failure of [
      new AuthoringFailed({
        category: "conflict",
        detail: "Already authored.",
        recover: "Rename.",
      }),
      new CreateNameConfigured({ subject: "Skill", name: "demo" }),
      new NativeMcpEntryRetirementFailed({
        category: "conflict",
        detail: "The native entry changed.",
        filePath: "/w/.mcp.json",
      }),
    ]) {
      expect(rendered(viaPlanStep(authoringStepFailure(failure)))).toEqual(
        rendered(toAppError(failure)),
      );
    }
    const configuration = new WorkspaceConfigurationFailed({
      category: "usage",
      detail: "Name at least one agent.",
      recover: "Pass an agent ID.",
      cmd: "axm agents add claude-code",
    });
    expect(rendered(viaPlanStep(configurationFailedToStepFailure(configuration)))).toEqual(
      rendered(toAppError(configuration)),
    );
  });
});

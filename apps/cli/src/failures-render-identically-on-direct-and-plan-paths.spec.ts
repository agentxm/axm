import * as Cause from "effect/Cause";
import { ConfigError } from "effect/Config";
import { SourceError } from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";

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
  HookInstallStateMissing,
  KnowledgeDefinitionInvalid,
  KnowledgeDesiredStateUnreconcilable,
  KnowledgeInstallStateMissing,
  KnowledgeIoFailed,
  KnowledgeObservableContractViolated,
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
  RuleInstallStateMissing,
  SkillDefinitionInvalid,
  SkillInstallStateMissing,
  SkillMaterializationFailed,
  StagedPackageInvalid,
  SubagentContentUnreadable,
  SubagentDefinitionInvalid,
  SubagentInstallStateMissing,
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
  SkillSelectionNotFound,
  SkillSelectionUnavailable,
} from "@agentxm/workspace/skills/lifecycle/application";
import {
  SubagentSelectionNotFound,
  SubagentSelectionUnavailable,
} from "@agentxm/workspace/subagents/lifecycle/application";
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

import type { AppError } from "./app-error/index.js";
import { stepFailureToAppError, toAppError } from "./app-error/conversions.js";

export const specification = defineSpecification({
  requirement: "cli/failures-render-identically-on-direct-and-plan-paths",
  title: "A failure reads the same whether a command or a plan step reports it",
  statement:
    "A typed failure shall render with the same category, title, detail, structured problem, recorded evidence, and recoveries, including each recovery's command and the scope that command runs in, whether it surfaces directly at the command boundary or settles a plan step.",
  class: "functional",
  role: "experience",
  goals: ["actionable-diagnostics", "machine-automation"],
  methods: ["decision-table", "example"],
  derivedFrom: [
    "apps/cli/src/app-error/conversions.test.ts",
    "apps/cli/src/app-error/conversions/extension-materialization.test.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
  limitations: [
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
  RuleInstallStateMissing: [new RuleInstallStateMissing({ name: "demo", kind: "tree-integrity" })],
  HookDefinitionInvalid: [new HookDefinitionInvalid({ detail: "Hook entrypoint missing" })],
  HookInstallStateMissing: [
    new HookInstallStateMissing({ name: "demo", kind: "content-identity" }),
  ],
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
  SubagentInstallStateMissing: [
    new SubagentInstallStateMissing({ name: "demo", kind: "external-resolution" }),
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
  SkillInstallStateMissing: [
    new SkillInstallStateMissing({ name: "demo", kind: "content-identity" }),
  ],
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
  KnowledgeInstallStateMissing: [
    new KnowledgeInstallStateMissing({ name: "demo", kind: "staged-tree-integrity" }),
  ],
  KnowledgeResolutionMissing: [new KnowledgeResolutionMissing({ name: "demo" })],
  KnowledgeDesiredStateUnreconcilable: [new KnowledgeDesiredStateUnreconcilable()],
  KnowledgeUnavailable: [new KnowledgeUnavailable({ detail: "Cannot be restored: demo" })],
  KnowledgeObservableContractViolated: [new KnowledgeObservableContractViolated({ name: "demo" })],
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
  SkillSelectionNotFound: [
    new SkillSelectionNotFound({ requested: ["missing"], available: ["z-last", "a-first"] }),
  ],
  SubagentSelectionNotFound: [
    new SubagentSelectionNotFound({ requested: ["missing"], available: ["review"] }),
  ],
  SkillSelectionUnavailable: [new SkillSelectionUnavailable({ cause: new Error("closed") })],
  SubagentSelectionUnavailable: [new SubagentSelectionUnavailable({ cause: new Error("closed") })],
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
  ],
};

const rows: ReadonlyArray<WorkspaceFailure> = Object.values(representatives).flat();

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
  it.each(rows.map((failure, index) => [`${failure._tag} #${index}`, failure] as const))(
    "%s renders identically whether a command or a plan step reports it",
    (_name, failure) => {
      expect(isWorkspaceFailure(failure)).toBe(true);
      const direct = toAppError(failure);
      const plan = viaPlanStep(workspaceFailureToStepFailure(failure));
      expect(rendered(plan)).toEqual(rendered(direct));
    },
  );

  it("names the unsupported lockfile problem and its upgrade on every path", () => {
    const newer = new LockfileVersionUnsupported({
      path: "/w/axm-lock.yaml",
      observedVersion: 8,
      supportedVersion: 7,
    });
    const catalog = new WorkspaceCatalogUnavailable({
      category: "validation",
      detail: "Workspace state is invalid.",
      cause: newer,
    });
    for (const error of [
      toAppError(newer),
      toAppError(catalog),
      viaPlanStep(workspaceFailureToStepFailure(newer)),
    ]) {
      expect(error.code).toBe("validation");
      expect(error.problem?.code).toBe("workspace-lockfile-version-unsupported");
      expect(error.suggestions).toEqual([
        {
          description: "Upgrade AXM before accessing this workspace.",
          cmd: "axm upgrade",
          commandScope: "global",
        },
      ]);
    }
  });

  it("reads an unreadable settings or lockfile as unavailable storage on every path", () => {
    for (const failure of [
      new SettingsIoError({ path: "/w/axm.json", cause: ioCause }),
      new LockfileIoError({ path: "/w/axm-lock.yaml", cause: ioCause }),
    ]) {
      expect(toAppError(failure).code).toBe("unavailable");
      expect(viaPlanStep(workspaceFailureToStepFailure(failure)).code).toBe("unavailable");
    }
  });

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

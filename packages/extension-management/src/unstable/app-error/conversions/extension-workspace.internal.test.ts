import { describe, expect, it } from "vitest";

import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";
import { AppError, type AppErrorCode } from "../app-error.js";
import { isKnownFailure, toAppError, type KnownFailure } from "../conversions.js";
import {
  ArchiveIntegrityMismatch,
  CanonicalPackageProbeFailed,
  CreateDestinationExists,
  CreateDestinationInspectionFailed,
  CreateNameConfigured,
  ForkPackageConflict,
  ForkPackageFailed,
  ForkPackageInvalid,
  LifecyclePostconditionViolated,
  NativeImportConflict,
  NativeImportFailed,
  NativeImportInvalid,
  NativeImportUnsupported,
  PackageCopyFailed,
  PackageMaterializationFailed,
  ScaffoldedExtensionUnresolved,
  SourceAuthorityBlocked,
  StagedPackageInvalid,
} from "../../extensions/errors.js";
import { PathTraversalDetected } from "@agentxm/workspace-state";
import { MaterializedTreeInvalid } from "@agentxm/workspace-state";
import {
  AuthoredContributorUnsupported,
  ContributorIdentityInvalid,
  ContributorTreeMismatch,
  ContributorUnresolved,
  DesiredStateIncomplete,
  ManagedRegionViolation,
  ProjectionIoFailed,
  ProjectionTargetUnsupported,
} from "../../projection/errors.js";
import { RuleDefinitionInvalid, RuleInstallStateMissing } from "../../rules/errors.js";
import {
  HookConfigInvalid,
  HookDefinitionInvalid,
  HookInstallStateMissing,
  HookIoFailed,
} from "../../hooks/errors.js";
import {
  SubagentContentUnreadable,
  SubagentDefinitionInvalid,
  SubagentInstallStateMissing,
  SubagentIoFailed,
} from "../../subagents/errors.js";
import {
  McpConfigInvalid,
  McpConfigIoFailed,
  McpDefinitionInvalid,
  McpEntryUnmanaged,
  McpInstallStateMissing,
  McpOwnershipMarkerInvalid,
  McpRegistryOnlyInstall,
  McpSharedTargetConflict,
} from "../../mcps/errors.js";
import {
  AxmSkillCompatibilityUnavailable,
  AxmSkillIncompatible,
  SkillDefinitionInvalid,
  SkillInstallStateMissing,
  SkillMaterializationFailed,
} from "../../skills/errors.js";
import type { AxmSkillCompatibility } from "../../skills/axm-skill-compatibility.js";
import {
  PackArchiveFetchFailed,
  PackConstraintShadowed,
  PackDefinitionInvalid,
  PackDependencyConflict,
  PackDependencyInvalid,
  PackDependencyMissing,
  PackDependencyUnsatisfied,
  PackInstallStateMissing,
  PackStagingFailed,
} from "../../packs/errors.js";
import {
  KnowledgeDefinitionInvalid,
  KnowledgeDesiredStateUnreconcilable,
  KnowledgeInstallStateMissing,
  KnowledgeIoFailed,
  KnowledgeObservableContractViolated,
  KnowledgeResolutionMissing,
  KnowledgeUnavailable,
} from "../../knowledge/errors.js";
import { TransientBackupFailed } from "../../utils/transient-backup.js";
import { WriteBackupRetained } from "../../extension-workspace/errors.js";

const ioCause = new Error("EACCES");

interface ConversionCase {
  readonly name: string;
  readonly failure: KnownFailure;
  readonly code: AppErrorCode;
  readonly detail: string;
  readonly title?: string;
  readonly suggestions?: ReadonlyArray<SuggestedAction>;
  /** Expected `cause`; "self" pins the typed failure itself as the cause. */
  readonly cause?: unknown | "self";
}

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
    nextAction: "axm upgrade",
    steps: [],
  },
};

// One row per distinct code/detail template; the byte-for-byte contract for
// the extension-workspace families lives here, not in the producing modules.
const cases: ReadonlyArray<ConversionCase> = [
  {
    name: "PackageMaterializationFailed recover",
    failure: new PackageMaterializationFailed({ path: "/w/pkg", step: "recover", cause: ioCause }),
    code: "internal",
    detail: "Failed to recover interrupted canonical materialization at /w/pkg",
    cause: ioCause,
  },
  {
    name: "PackageMaterializationFailed prepare-parent",
    failure: new PackageMaterializationFailed({
      path: "/w/pkg",
      step: "prepare-parent",
      cause: ioCause,
    }),
    code: "internal",
    detail: "Failed to prepare canonical package parent for /w/pkg",
    cause: ioCause,
  },
  {
    name: "PackageMaterializationFailed prepare-staging",
    failure: new PackageMaterializationFailed({
      path: "/w/pkg.axm-staging",
      step: "prepare-staging",
      cause: ioCause,
    }),
    code: "internal",
    detail: "Failed to prepare canonical package staging at /w/pkg.axm-staging",
    cause: ioCause,
  },
  {
    name: "PackageMaterializationFailed inspect",
    failure: new PackageMaterializationFailed({ path: "/w/pkg", step: "inspect", cause: ioCause }),
    code: "internal",
    detail: "Failed to inspect canonical package at /w/pkg",
    cause: ioCause,
  },
  {
    name: "PackageMaterializationFailed replace",
    failure: new PackageMaterializationFailed({ path: "/w/pkg", step: "replace", cause: ioCause }),
    code: "internal",
    detail: "Failed to replace canonical package at /w/pkg",
    cause: ioCause,
  },
  {
    name: "PackageMaterializationFailed inspect-create-destination",
    failure: new PackageMaterializationFailed({
      path: "/w/pkg",
      step: "inspect-create-destination",
      cause: ioCause,
    }),
    code: "internal",
    detail: "Failed to inspect create-only destination: /w/pkg",
    cause: ioCause,
  },
  {
    name: "StagedPackageInvalid missing",
    failure: new StagedPackageInvalid({ file: "skill.json", kind: "missing", cause: ioCause }),
    code: "validation",
    detail: "Staged package is missing required file: skill.json",
    cause: ioCause,
  },
  {
    name: "StagedPackageInvalid not-file",
    failure: new StagedPackageInvalid({ file: "skill.json", kind: "not-file" }),
    code: "validation",
    detail: "Staged package path is not a file: skill.json",
  },
  {
    name: "CanonicalPackageProbeFailed",
    failure: new CanonicalPackageProbeFailed({
      detail: "Failed to check if canonical path exists: /w/pkg",
      cause: ioCause,
    }),
    code: "internal",
    detail: "Failed to check if canonical path exists: /w/pkg",
    cause: ioCause,
  },
  {
    name: "PackageCopyFailed internal",
    failure: new PackageCopyFailed({
      severity: "internal",
      detail: "Failed to copy skill files to /w/pkg",
      cause: ioCause,
    }),
    code: "internal",
    detail: "Failed to copy skill files to /w/pkg",
    cause: ioCause,
  },
  {
    name: "PackageCopyFailed validation",
    failure: new PackageCopyFailed({
      severity: "validation",
      detail: "Failed to copy rule package files to /w/pkg",
      cause: ioCause,
    }),
    code: "validation",
    detail: "Failed to copy rule package files to /w/pkg",
    cause: ioCause,
  },
  {
    name: "ArchiveIntegrityMismatch",
    failure: new ArchiveIntegrityMismatch({ subject: "Integrity mismatch for demo@1.0.0" }),
    code: "validation",
    detail:
      "Integrity mismatch for demo@1.0.0 — the fetched archive does not match the accepted integrity. Verify the source and rerun, or update to accept a republished version.",
  },
  {
    name: "CreateDestinationExists",
    failure: new CreateDestinationExists({ subject: "Skill", path: "/w/skills/demo" }),
    code: "conflict",
    detail: "Skill destination already exists: /w/skills/demo",
    suggestions: [
      { description: "Choose a different name or remove the existing directory first" },
    ],
  },
  {
    name: "CreateNameConfigured",
    failure: new CreateNameConfigured({ subject: "Skill", name: "demo" }),
    code: "conflict",
    detail: "Skill 'demo' already exists in settings",
    suggestions: [{ description: "Choose a different name or remove the existing skill first" }],
  },
  {
    name: "CreateDestinationInspectionFailed",
    failure: new CreateDestinationInspectionFailed({ path: "/w/skills/demo", cause: ioCause }),
    code: "internal",
    detail: "Failed to inspect create destination: /w/skills/demo",
    cause: ioCause,
  },
  {
    name: "PathTraversalDetected",
    failure: new PathTraversalDetected({ path: "/outside" }),
    code: "internal",
    detail: "Path traversal detected: /outside",
  },
  {
    name: "ForkPackageInvalid",
    failure: new ForkPackageInvalid({
      detail: "Manifest could not be read: /w/pkg/skill.json",
      cause: ioCause,
    }),
    code: "validation",
    detail: "Manifest could not be read: /w/pkg/skill.json",
    cause: ioCause,
  },
  {
    name: "ForkPackageConflict",
    failure: new ForkPackageConflict({ detail: "Fork target already exists: /w/authored/demo" }),
    code: "conflict",
    detail: "Fork target already exists: /w/authored/demo",
  },
  {
    name: "ForkPackageFailed",
    failure: new ForkPackageFailed({
      detail: "Fork target manifest could not be written: /w/authored/demo/skill.json",
      cause: ioCause,
    }),
    code: "internal",
    detail: "Fork target manifest could not be written: /w/authored/demo/skill.json",
    cause: ioCause,
  },
  {
    name: "NativeImportUnsupported",
    failure: new NativeImportUnsupported({ type: "rule" }),
    code: "usage",
    detail: "Native package import is not supported for rule",
  },
  {
    name: "NativeImportInvalid",
    failure: new NativeImportInvalid({
      detail: "Native content must contain YAML frontmatter: /w/src/SKILL.md",
    }),
    code: "validation",
    detail: "Native content must contain YAML frontmatter: /w/src/SKILL.md",
  },
  {
    name: "NativeImportConflict",
    failure: new NativeImportConflict({ targetDir: "/w/authored/demo" }),
    code: "conflict",
    detail: "Import target already exists: /w/authored/demo",
  },
  {
    name: "NativeImportFailed",
    failure: new NativeImportFailed({
      detail: "Native import failed for /source",
      cause: ioCause,
    }),
    code: "internal",
    detail: "Native import failed for /source",
    cause: ioCause,
  },
  {
    name: "SourceAuthorityBlocked",
    failure: new SourceAuthorityBlocked({
      detail: "skill demo is workspace-authored",
      recovery: [{ description: "Fork the package first" }],
    }),
    code: "conflict",
    detail: "skill demo is workspace-authored",
    suggestions: [{ description: "Fork the package first" }],
  },
  {
    name: "LifecyclePostconditionViolated install-observable",
    failure: new LifecyclePostconditionViolated({
      postcondition: "install-observable",
      targetType: "skill",
      targetName: "demo",
    }),
    code: "internal",
    detail: 'Installed skill "demo" did not satisfy its observable contract',
  },
  {
    name: "LifecyclePostconditionViolated install-declared",
    failure: new LifecyclePostconditionViolated({
      postcondition: "install-declared",
      targetType: "skill",
      targetName: "demo",
    }),
    code: "internal",
    detail: 'Installed skill "demo" has no desired-state declaration',
  },
  {
    name: "LifecyclePostconditionViolated new-observable",
    failure: new LifecyclePostconditionViolated({
      postcondition: "new-observable",
      targetType: "skill",
      targetName: "demo",
    }),
    code: "internal",
    detail: 'New skill "demo" did not satisfy its observable contract',
  },
  {
    name: "LifecyclePostconditionViolated new-declared",
    failure: new LifecyclePostconditionViolated({
      postcondition: "new-declared",
      targetType: "skill",
      targetName: "demo",
    }),
    code: "internal",
    detail: 'New skill "demo" has no desired-state declaration',
  },
  {
    name: "LifecyclePostconditionViolated materialize-observable",
    failure: new LifecyclePostconditionViolated({
      postcondition: "materialize-observable",
      targetType: "skill",
      targetName: "demo",
    }),
    code: "internal",
    detail: 'Reconciled skill "demo" did not satisfy its observable contract',
  },
  {
    name: "LifecyclePostconditionViolated uninstall-remains-declared",
    failure: new LifecyclePostconditionViolated({
      postcondition: "uninstall-remains-declared",
      targetType: "skill",
      targetName: "demo",
    }),
    code: "internal",
    detail: 'Uninstalled skill "demo" remains declared',
  },
  {
    name: "LifecyclePostconditionViolated uninstall-observed-state",
    failure: new LifecyclePostconditionViolated({
      postcondition: "uninstall-observed-state",
      targetType: "skill",
      targetName: "demo",
    }),
    code: "internal",
    detail: 'Uninstalled skill "demo" has an invalid observed postcondition',
  },
  {
    name: "ScaffoldedExtensionUnresolved",
    failure: new ScaffoldedExtensionUnresolved({ targetType: "skill", targetName: "demo" }),
    code: "not_found",
    detail: 'Newly scaffolded skill "demo" could not be resolved from its workspace source',
  },
  {
    name: "MaterializedTreeInvalid",
    failure: new MaterializedTreeInvalid({
      root: "/w/pkg",
      reason: "symlink is not allowed: src/link",
    }),
    code: "validation",
    detail: "Invalid materialized package tree at /w/pkg: symlink is not allowed: src/link",
  },
  {
    name: "DesiredStateIncomplete",
    failure: new DesiredStateIncomplete({ problems: "pack demo is missing" }),
    code: "conflict",
    detail:
      "Desired state cannot be enumerated completely; fix pack and declaration problems first: pack demo is missing",
  },
  {
    name: "AuthoredContributorUnsupported",
    failure: new AuthoredContributorUnsupported({ type: "rule" }),
    code: "validation",
    detail: "User workspaces do not support workspace-authored rule packages",
  },
  {
    name: "ContributorIdentityInvalid",
    failure: new ContributorIdentityInvalid({ type: "rule", identity: "workspace:bad" }),
    code: "validation",
    detail: "Invalid workspace rule identity: workspace:bad",
  },
  {
    name: "ContributorUnresolved",
    failure: new ContributorUnresolved({ type: "rule", name: "demo" }),
    code: "conflict",
    detail: "Active rule has no accepted resolution: demo",
  },
  {
    name: "ContributorTreeMismatch",
    failure: new ContributorTreeMismatch({ packageRoot: "/w/rules/demo" }),
    code: "conflict",
    detail: "Materialized package tree does not match the accepted lock entry: /w/rules/demo",
    suggestions: [
      {
        description:
          "Restore the accepted package with install or update, or fork it into the authored workspace tree before editing.",
      },
    ],
  },
  {
    name: "ProjectionTargetUnsupported",
    failure: new ProjectionTargetUnsupported({
      detail: "Managed-region target does not support comments: notes.txt",
    }),
    code: "validation",
    detail: "Managed-region target does not support comments: notes.txt",
  },
  {
    name: "ManagedRegionViolation with message",
    failure: new ManagedRegionViolation({
      displayPath: "AGENTS.md",
      reason: "AXM managed region rules has duplicate, nested, or unpaired markers",
    }),
    code: "conflict",
    detail: "AXM managed region rules has duplicate, nested, or unpaired markers: AGENTS.md",
  },
  {
    name: "ManagedRegionViolation without message",
    failure: new ManagedRegionViolation({ displayPath: "AGENTS.md" }),
    code: "conflict",
    detail: "Cannot reconcile managed region: AGENTS.md",
  },
  {
    name: "ProjectionIoFailed inspect",
    failure: new ProjectionIoFailed({ path: "/w/AGENTS.md", step: "inspect", cause: ioCause }),
    code: "internal",
    detail: "Failed to inspect managed-region target: /w/AGENTS.md",
    cause: ioCause,
  },
  {
    name: "ProjectionIoFailed read",
    failure: new ProjectionIoFailed({ path: "/w/AGENTS.md", step: "read", cause: ioCause }),
    code: "internal",
    detail: "Failed to read managed-region target: /w/AGENTS.md",
    cause: ioCause,
  },
  {
    name: "ProjectionIoFailed reconcile",
    failure: new ProjectionIoFailed({ path: "/w/AGENTS.md", step: "reconcile", cause: ioCause }),
    code: "internal",
    detail: "Failed to reconcile managed-region target: /w/AGENTS.md",
    cause: ioCause,
  },
  {
    name: "RuleDefinitionInvalid",
    failure: new RuleDefinitionInvalid({ detail: "Failed to read rule.json", cause: ioCause }),
    code: "validation",
    detail: "Failed to read rule.json",
    cause: ioCause,
  },
  {
    name: "RuleInstallStateMissing tree-integrity",
    failure: new RuleInstallStateMissing({ name: "demo", kind: "tree-integrity" }),
    code: "internal",
    detail: "Rule demo has no materialized tree integrity",
  },
  {
    name: "RuleInstallStateMissing content-identity",
    failure: new RuleInstallStateMissing({ name: "demo", kind: "content-identity" }),
    code: "internal",
    detail: "Rule demo has no materialized content identity",
  },
  {
    name: "HookDefinitionInvalid",
    failure: new HookDefinitionInvalid({ detail: "Hook entrypoint does not exist: run.sh" }),
    code: "validation",
    detail: "Hook entrypoint does not exist: run.sh",
  },
  {
    name: "HookConfigInvalid",
    failure: new HookConfigInvalid({
      detail: "Invalid Claude Code hooks config JSON/JSONC: /w/.claude/settings.json",
      cause: ioCause,
    }),
    code: "validation",
    detail: "Invalid Claude Code hooks config JSON/JSONC: /w/.claude/settings.json",
    cause: ioCause,
  },
  {
    name: "HookIoFailed",
    failure: new HookIoFailed({
      detail: "Failed to read Claude Code hooks config: /w/.claude/settings.json",
      cause: ioCause,
    }),
    code: "internal",
    detail: "Failed to read Claude Code hooks config: /w/.claude/settings.json",
    cause: ioCause,
  },
  {
    name: "HookInstallStateMissing tree-integrity",
    failure: new HookInstallStateMissing({ name: "demo", kind: "tree-integrity" }),
    code: "internal",
    detail: "Hook demo has no materialized tree integrity",
  },
  {
    name: "HookInstallStateMissing content-identity",
    failure: new HookInstallStateMissing({ name: "demo", kind: "content-identity" }),
    code: "internal",
    detail: "Hook demo has no materialized content identity",
  },
  {
    name: "TransientBackupFailed create-temp-dir",
    failure: new TransientBackupFailed({
      path: "/w/config.json",
      step: "create-temp-dir",
      cause: ioCause,
    }),
    code: "internal",
    detail: "Failed to create temporary directory for backup of /w/config.json",
    cause: ioCause,
  },
  {
    name: "TransientBackupFailed write-backup",
    failure: new TransientBackupFailed({
      path: "/tmp/backup/config.json.bak",
      step: "write-backup",
      cause: ioCause,
    }),
    code: "internal",
    detail: "Failed to write backup: /tmp/backup/config.json.bak",
    cause: ioCause,
  },
  {
    name: "TransientBackupFailed remove-backup",
    failure: new TransientBackupFailed({
      path: "/tmp/backup/config.json.bak",
      step: "remove-backup",
      cause: ioCause,
    }),
    code: "internal",
    detail: "Failed to remove temporary backup after successful write: /tmp/backup/config.json.bak",
    cause: ioCause,
  },
  {
    name: "SubagentDefinitionInvalid",
    failure: new SubagentDefinitionInvalid({
      detail: "Workspace subagent source is missing: /w/authored/demo/src",
    }),
    code: "validation",
    detail: "Workspace subagent source is missing: /w/authored/demo/src",
  },
  {
    name: "SubagentContentUnreadable",
    failure: new SubagentContentUnreadable({
      expectedFilename: "demo.md",
      subagentSrcPath: "/w/subagents/demo/src",
      contentPath: "/w/subagents/demo/src/demo.md",
      cause: ioCause,
    }),
    code: "internal",
    detail: "Failed to read demo.md from /w/subagents/demo/src",
    suggestions: [
      {
        description: "Ensure the subagent content file exists at /w/subagents/demo/src/demo.md.",
      },
    ],
    cause: ioCause,
  },
  {
    name: "SubagentIoFailed",
    failure: new SubagentIoFailed({
      detail: "Failed to materialize subagent fallback for claude-code",
      cause: ioCause,
    }),
    code: "internal",
    detail: "Failed to materialize subagent fallback for claude-code",
    cause: ioCause,
  },
  {
    name: "SubagentInstallStateMissing content-identity",
    failure: new SubagentInstallStateMissing({ name: "demo", kind: "content-identity" }),
    code: "internal",
    detail: "Subagent demo has no materialized content identity",
  },
  {
    name: "SubagentInstallStateMissing external-resolution",
    failure: new SubagentInstallStateMissing({ name: "demo", kind: "external-resolution" }),
    code: "internal",
    detail: "Subagent demo did not produce an external resolution",
  },
  {
    name: "McpConfigInvalid",
    failure: new McpConfigInvalid({ detail: "Invalid MCP config YAML: /w/config.yaml" }),
    code: "validation",
    detail: "Invalid MCP config YAML: /w/config.yaml",
  },
  {
    name: "McpConfigIoFailed",
    failure: new McpConfigIoFailed({
      detail: "Failed to write MCP config: /w/.mcp.json",
      cause: ioCause,
    }),
    code: "internal",
    detail: "Failed to write MCP config: /w/.mcp.json",
    cause: ioCause,
  },
  {
    name: "McpEntryUnmanaged",
    failure: new McpEntryUnmanaged({ serverName: "demo", configPath: "/w/.mcp.json" }),
    code: "conflict",
    detail: "MCP server demo is unmanaged in /w/.mcp.json; AXM will not remove it",
  },
  {
    name: "McpOwnershipMarkerInvalid unsupported-version modify",
    failure: new McpOwnershipMarkerInvalid({
      serverName: "demo",
      state: "unsupported-version",
      operation: "modify",
    }),
    code: "conflict",
    detail: "MCP server demo uses a newer AXM ownership marker; upgrade AXM before modifying it",
  },
  {
    name: "McpOwnershipMarkerInvalid unsupported-version inspect",
    failure: new McpOwnershipMarkerInvalid({
      serverName: "demo",
      state: "unsupported-version",
      operation: "inspect",
    }),
    code: "conflict",
    detail: "MCP server demo uses a newer AXM ownership marker; upgrade AXM before inspecting it",
  },
  {
    name: "McpOwnershipMarkerInvalid malformed",
    failure: new McpOwnershipMarkerInvalid({
      serverName: "demo",
      state: "malformed",
      operation: "modify",
    }),
    code: "conflict",
    detail: "MCP server demo has malformed AXM ownership markers",
  },
  {
    name: "McpDefinitionInvalid",
    failure: new McpDefinitionInvalid({ detail: "Inline MCP server has no command or URL" }),
    code: "validation",
    detail: "Inline MCP server has no command or URL",
  },
  {
    name: "McpRegistryOnlyInstall",
    failure: new McpRegistryOnlyInstall({ serverName: "demo", refType: "workspace" }),
    code: "usage",
    detail: "MCP servers materialize from a registry package, not from a workspace source",
    suggestions: [
      { description: "Install from the registry", cmd: "axm mcps install @owner/mcps/demo" },
    ],
  },
  {
    name: "McpInstallStateMissing",
    failure: new McpInstallStateMissing({ name: "demo" }),
    code: "internal",
    detail: "MCP server demo has no materialized tree integrity",
  },
  {
    name: "McpSharedTargetConflict",
    failure: new McpSharedTargetConflict({ reason: "members disagree on the shared target" }),
    code: "conflict",
    detail: "members disagree on the shared target",
  },
  {
    name: "SkillDefinitionInvalid",
    failure: new SkillDefinitionInvalid({
      detail: "One or more configured agents have invalid skills directory settings",
    }),
    code: "validation",
    detail: "One or more configured agents have invalid skills directory settings",
  },
  {
    name: "SkillMaterializationFailed",
    failure: new SkillMaterializationFailed({
      detail: "Failed to remove skill artifact at /w/.claude/skills/demo",
      cause: ioCause,
    }),
    code: "internal",
    detail: "Failed to remove skill artifact at /w/.claude/skills/demo",
    cause: ioCause,
  },
  {
    name: "SkillInstallStateMissing tree-integrity",
    failure: new SkillInstallStateMissing({ name: "demo", kind: "tree-integrity" }),
    code: "internal",
    detail: "Skill demo has no materialized tree integrity",
  },
  {
    name: "SkillInstallStateMissing content-identity",
    failure: new SkillInstallStateMissing({ name: "demo", kind: "content-identity" }),
    code: "internal",
    detail: "Skill demo has no materialized content identity",
  },
  {
    name: "SkillInstallStateMissing external-resolution",
    failure: new SkillInstallStateMissing({ name: "demo", kind: "external-resolution" }),
    code: "internal",
    detail: "Skill demo did not produce an external resolution",
  },
  {
    name: "AxmSkillCompatibilityUnavailable",
    failure: new AxmSkillCompatibilityUnavailable(),
    code: "internal",
    detail: "AXM compatibility policy did not evaluate the official AXM skill",
  },
  {
    name: "AxmSkillIncompatible",
    failure: new AxmSkillIncompatible({ compatibility: incompatibleAxmSkill }),
    code: "conflict",
    detail: "Official AXM skill 0.9.0 requires AXM CLI ^2.0.0.",
    suggestions: [
      {
        description:
          "Converge to AXM CLI 2.0.0 + official AXM skill 0.9.0 with the upgrade-cli recovery plan",
        cmd: "axm upgrade",
      },
    ],
  },
  {
    name: "PackDefinitionInvalid",
    failure: new PackDefinitionInvalid({
      detail: "Workspace pack package is missing: /w/packs/demo",
    }),
    code: "validation",
    detail: "Workspace pack package is missing: /w/packs/demo",
  },
  {
    name: "PackInstallStateMissing",
    failure: new PackInstallStateMissing({ name: "demo" }),
    code: "internal",
    detail: "Pack demo has no materialized tree integrity",
  },
  {
    name: "PackArchiveFetchFailed",
    failure: new PackArchiveFetchFailed({ message: "connection reset", cause: ioCause }),
    code: "network",
    detail: "Failed to fetch pack archive: connection reset",
    cause: ioCause,
  },
  {
    name: "PackStagingFailed",
    failure: new PackStagingFailed({ packDir: "/w/packs/demo", cause: ioCause }),
    code: "internal",
    detail: "Failed to stage pack at /w/packs/demo",
    cause: ioCause,
  },
  {
    name: "PackDependencyInvalid",
    failure: new PackDependencyInvalid({
      detail: "Unable to resolve pack dependency @owner/skills/demo@^1.0.0",
    }),
    code: "usage",
    detail: "Unable to resolve pack dependency @owner/skills/demo@^1.0.0",
  },
  {
    name: "PackDependencyConflict",
    failure: new PackDependencyConflict({
      detail: "Configured workspace authority does not match pack dependency @owner/skills/demo",
    }),
    code: "conflict",
    detail: "Configured workspace authority does not match pack dependency @owner/skills/demo",
  },
  {
    name: "PackConstraintShadowed workspace",
    failure: new PackConstraintShadowed({
      packSource: "workspace",
      packFqn: "@owner/packs/demo",
      memberFqn: "@owner/skills/member",
      constraint: "^1.0.0",
      workspaceVersion: "2.0.0",
    }),
    code: "conflict",
    detail:
      "Workspace-authored pack @owner/packs/demo requires @owner/skills/member@^1.0.0, but workspace authority provides @owner/skills/member@2.0.0.",
    suggestions: [
      {
        description: "Replace the authored pack constraint with the current workspace version",
        cmd: "axm packs add @owner/packs/demo @owner/skills/member",
      },
    ],
  },
  {
    name: "PackConstraintShadowed registry",
    failure: new PackConstraintShadowed({
      packSource: "registry",
      packFqn: "@owner/packs/demo",
      memberFqn: "@owner/skills/member",
      constraint: "^1.0.0",
      workspaceVersion: "2.0.0",
    }),
    code: "conflict",
    detail:
      "Registry pack @owner/packs/demo requires @owner/skills/member@^1.0.0, but workspace authority shadows that member with @owner/skills/member@2.0.0.",
    suggestions: [
      {
        description:
          "Update the pack if its owner has published a constraint that includes the workspace version",
        cmd: "axm update @owner/packs/demo",
      },
      {
        description: "Otherwise stop workspace authority from shadowing @owner/skills/member",
      },
    ],
  },
  {
    name: "PackDependencyMissing",
    failure: new PackDependencyMissing({ dependencyTarget: "@owner/skills/demo" }),
    code: "not_found",
    detail: "Pack dependency @owner/skills/demo was not found",
  },
  {
    name: "PackDependencyUnsatisfied",
    failure: new PackDependencyUnsatisfied({
      dependencyTarget: "@owner/skills/demo",
      constraint: "^1.0.0",
    }),
    code: "conflict",
    title: "No compatible version",
    detail: "Pack dependency @owner/skills/demo has no visible version satisfying ^1.0.0",
  },
  {
    name: "KnowledgeDefinitionInvalid",
    failure: new KnowledgeDefinitionInvalid({
      detail: "Failed to parse knowledge.json",
      cause: ioCause,
    }),
    code: "validation",
    detail: "Failed to parse knowledge.json",
    cause: ioCause,
  },
  {
    name: "KnowledgeIoFailed",
    failure: new KnowledgeIoFailed({
      detail: "Failed to stage Knowledge bundle demo",
      cause: ioCause,
    }),
    code: "internal",
    detail: "Failed to stage Knowledge bundle demo",
    cause: ioCause,
  },
  {
    name: "KnowledgeInstallStateMissing tree-integrity",
    failure: new KnowledgeInstallStateMissing({ name: "demo", kind: "tree-integrity" }),
    code: "internal",
    detail: "Knowledge demo has no materialized tree integrity",
  },
  {
    name: "KnowledgeInstallStateMissing content-identity",
    failure: new KnowledgeInstallStateMissing({ name: "demo", kind: "content-identity" }),
    code: "internal",
    detail: "Knowledge demo has no materialized content identity",
  },
  {
    name: "KnowledgeInstallStateMissing staged-tree-integrity",
    failure: new KnowledgeInstallStateMissing({ name: "demo", kind: "staged-tree-integrity" }),
    code: "internal",
    detail: "Knowledge demo has no staged tree integrity",
  },
  {
    name: "KnowledgeResolutionMissing",
    failure: new KnowledgeResolutionMissing({ name: "demo" }),
    code: "conflict",
    detail: "Active external Knowledge bundle has no accepted resolution: demo",
  },
  {
    name: "KnowledgeDesiredStateUnreconcilable",
    failure: new KnowledgeDesiredStateUnreconcilable(),
    code: "conflict",
    detail:
      "Knowledge desired state cannot be reconciled until pack and declaration problems are fixed",
  },
  {
    name: "KnowledgeUnavailable",
    failure: new KnowledgeUnavailable({
      detail: "Locked registry Knowledge bundle has no integrity and cannot be restored: demo",
    }),
    code: "unavailable",
    detail: "Locked registry Knowledge bundle has no integrity and cannot be restored: demo",
  },
  {
    name: "KnowledgeObservableContractViolated",
    failure: new KnowledgeObservableContractViolated({ name: "demo" }),
    code: "internal",
    detail: 'Installed Knowledge bundle "demo" did not satisfy its observable contract',
  },
];

describe("extension-workspace conversions", () => {
  it.each(cases.map((entry) => [entry.name, entry] as const))(
    "converts %s byte-identically",
    (_name, entry) => {
      const converted = toAppError(entry.failure);
      expect(converted).toBeInstanceOf(AppError);
      expect(converted.code).toBe(entry.code);
      expect(converted.detail).toBe(entry.detail);
      if (entry.title !== undefined) {
        expect(converted.title).toBe(entry.title);
      }
      if (entry.suggestions === undefined) {
        expect(converted.suggestions).toBeUndefined();
      } else {
        expect(converted.suggestions).toEqual(entry.suggestions);
      }
      if (entry.cause === "self") {
        expect(converted.cause).toBe(entry.failure);
      } else {
        expect(converted.cause).toEqual(entry.cause);
      }
    },
  );

  it("registers every table row as a known failure", () => {
    for (const entry of cases) {
      expect(isKnownFailure(entry.failure)).toBe(true);
    }
  });

  it("re-renders a retained write backup around the inner failure", () => {
    const inner = new McpConfigIoFailed({
      detail: "Failed to write MCP config: /w/.mcp.json",
      cause: ioCause,
    });
    const retained = new WriteBackupRetained({
      backupPath: "/tmp/backup/config.json.bak",
      failure: inner,
    });
    expect(isKnownFailure(retained)).toBe(true);
    const converted = toAppError(retained);
    expect(converted.code).toBe("internal");
    expect(converted.detail).toBe(
      "Failed to write MCP config: /w/.mcp.json\nOriginal file backup retained at: /tmp/backup/config.json.bak",
    );
    expect(converted.cause).toBe(ioCause);
  });
});

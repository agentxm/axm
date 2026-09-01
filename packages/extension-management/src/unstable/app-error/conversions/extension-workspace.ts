/**
 * Conversions from the extension-workspace typed failure families into
 * CLI-facing `AppError` values. Each converter reproduces the detail template
 * its construction sites rendered before decoupling — the byte-for-byte
 * contract for these families lives in the table-driven conversion tests.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type {
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
  PathTraversalDetected,
  ScaffoldedExtensionUnresolved,
  SourceAuthorityBlocked,
  StagedPackageInvalid,
} from "../../extensions/errors.js";
import type {
  AuthoredContributorUnsupported,
  ContributorIdentityInvalid,
  ContributorTreeMismatch,
  ContributorUnresolved,
  DesiredStateIncomplete,
  ManagedRegionViolation,
  ProjectionIoFailed,
  ProjectionTargetUnsupported,
} from "../../projection/errors.js";
import type {
  HookConfigInvalid,
  HookDefinitionInvalid,
  HookInstallStateMissing,
  HookIoFailed,
} from "../../hooks/errors.js";
import type {
  McpConfigInvalid,
  McpConfigIoFailed,
  McpDefinitionInvalid,
  McpEntryUnmanaged,
  McpInstallStateMissing,
  McpOwnershipMarkerInvalid,
  McpRegistryOnlyInstall,
  McpSharedTargetConflict,
} from "../../mcps/errors.js";
import type {
  KnowledgeDefinitionInvalid,
  KnowledgeDesiredStateUnreconcilable,
  KnowledgeInstallStateMissing,
  KnowledgeIoFailed,
  KnowledgeObservableContractViolated,
  KnowledgeResolutionMissing,
  KnowledgeUnavailable,
} from "../../knowledge/errors.js";
import type {
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
import type { RuleDefinitionInvalid, RuleInstallStateMissing } from "../../rules/errors.js";
import type {
  AxmSkillCompatibilityUnavailable,
  AxmSkillIncompatible,
  SkillDefinitionInvalid,
  SkillInstallStateMissing,
  SkillMaterializationFailed,
} from "../../skills/errors.js";
import { formatAxmSkillCompatibilityTarget } from "../../skills/axm-skill-compatibility.js";
import type {
  SubagentContentUnreadable,
  SubagentDefinitionInvalid,
  SubagentInstallStateMissing,
  SubagentIoFailed,
} from "../../subagents/errors.js";
import type { TransientBackupFailed } from "../../utils/transient-backup.js";
import type { MaterializedTreeInvalid } from "../../workspace/materialized-tree.js";
import { AppError, makeAppError } from "../app-error.js";

/** Translate a staging/swap machinery failure, reproducing each step's detail. */
export const packageMaterializationFailedToAppError = (
  error: PackageMaterializationFailed,
): AppError => {
  const detail = (): string => {
    switch (error.step) {
      case "recover":
        return `Failed to recover interrupted canonical materialization at ${error.path}`;
      case "prepare-parent":
        return `Failed to prepare canonical package parent for ${error.path}`;
      case "prepare-staging":
        return `Failed to prepare canonical package staging at ${error.path}`;
      case "inspect":
        return `Failed to inspect canonical package at ${error.path}`;
      case "replace":
        return `Failed to replace canonical package at ${error.path}`;
      case "inspect-create-destination":
        return `Failed to inspect create-only destination: ${error.path}`;
    }
  };
  return makeAppError({ code: "internal", detail: detail(), cause: error.cause });
};

/** Translate a staged-package required-file failure. */
export const stagedPackageInvalidToAppError = (error: StagedPackageInvalid): AppError =>
  makeAppError({
    code: "validation",
    detail:
      error.kind === "missing"
        ? `Staged package is missing required file: ${error.file}`
        : `Staged package path is not a file: ${error.file}`,
    ...(error.cause === undefined ? {} : { cause: error.cause }),
  });

/** Translate a canonical-state probe failure; the site owns the fact sentence. */
export const canonicalPackageProbeFailedToAppError = (
  error: CanonicalPackageProbeFailed,
): AppError => makeAppError({ code: "internal", detail: error.detail, cause: error.cause });

/** Translate a package copy failure with the caller's severity decision. */
export const packageCopyFailedToAppError = (error: PackageCopyFailed): AppError =>
  makeAppError({ code: error.severity, detail: error.detail, cause: error.cause });

/** Translate an archive integrity mismatch with the canonical recovery text. */
export const archiveIntegrityMismatchToAppError = (error: ArchiveIntegrityMismatch): AppError =>
  makeAppError({
    code: "validation",
    detail: `${error.subject} — the fetched archive does not match the accepted integrity. Verify the source and rerun, or update to accept a republished version.`,
  });

/** Translate a create-only destination collision with the canonical recovery. */
export const createDestinationExistsToAppError = (error: CreateDestinationExists): AppError =>
  makeAppError({
    code: "conflict",
    detail: `${error.subject} destination already exists: ${error.path}`,
    recover: "Choose a different name or remove the existing directory first",
  });

/** Translate a create-name settings collision with the canonical recovery. */
export const createNameConfiguredToAppError = (error: CreateNameConfigured): AppError =>
  makeAppError({
    code: "conflict",
    detail: `${error.subject} '${error.name}' already exists in settings`,
    recover: `Choose a different name or remove the existing ${error.subject.toLowerCase()} first`,
  });

/** Translate a create-destination inspection failure. */
export const createDestinationInspectionFailedToAppError = (
  error: CreateDestinationInspectionFailed,
): AppError =>
  makeAppError({
    code: "internal",
    detail: `Failed to inspect create destination: ${error.path}`,
    cause: error.cause,
  });

/** Translate a path-safety violation. */
export const pathTraversalDetectedToAppError = (error: PathTraversalDetected): AppError =>
  makeAppError({ code: "internal", detail: `Path traversal detected: ${error.path}` });

/** Translate a fork validation failure; the site owns the fact sentence. */
export const forkPackageInvalidToAppError = (error: ForkPackageInvalid): AppError =>
  makeAppError({
    code: "validation",
    detail: error.detail,
    ...(error.cause === undefined ? {} : { cause: error.cause }),
  });

/** Translate a fork conflict; the site owns the fact sentence. */
export const forkPackageConflictToAppError = (error: ForkPackageConflict): AppError =>
  makeAppError({ code: "conflict", detail: error.detail });

/** Translate a fork filesystem failure; the site owns the fact sentence. */
export const forkPackageFailedToAppError = (error: ForkPackageFailed): AppError =>
  makeAppError({ code: "internal", detail: error.detail, cause: error.cause });

/** Translate an unsupported native-import type. */
export const nativeImportUnsupportedToAppError = (error: NativeImportUnsupported): AppError =>
  makeAppError({
    code: "usage",
    detail: `Native package import is not supported for ${error.type}`,
  });

/** Translate a native-import validation failure; the site owns the fact sentence. */
export const nativeImportInvalidToAppError = (error: NativeImportInvalid): AppError =>
  makeAppError({
    code: "validation",
    detail: error.detail,
    ...(error.cause === undefined ? {} : { cause: error.cause }),
  });

/** Translate a native-import target collision. */
export const nativeImportConflictToAppError = (error: NativeImportConflict): AppError =>
  makeAppError({ code: "conflict", detail: `Import target already exists: ${error.targetDir}` });

/** Translate a native-import filesystem failure; the site owns the fact sentence. */
export const nativeImportFailedToAppError = (error: NativeImportFailed): AppError =>
  makeAppError({ code: "internal", detail: error.detail, cause: error.cause });

/** Translate a refused source-authority transition with its recovery facts. */
export const sourceAuthorityBlockedToAppError = (error: SourceAuthorityBlocked): AppError =>
  makeAppError({ code: "conflict", detail: error.detail, suggestions: error.recovery });

/** Translate a lifecycle postcondition violation, reproducing each phase's detail. */
export const lifecyclePostconditionViolatedToAppError = (
  error: LifecyclePostconditionViolated,
): AppError => {
  const detail = (): string => {
    switch (error.postcondition) {
      case "install-observable":
        return `Installed ${error.targetType} "${error.targetName}" did not satisfy its observable contract`;
      case "install-declared":
        return `Installed ${error.targetType} "${error.targetName}" has no desired-state declaration`;
      case "new-observable":
        return `New ${error.targetType} "${error.targetName}" did not satisfy its observable contract`;
      case "new-declared":
        return `New ${error.targetType} "${error.targetName}" has no desired-state declaration`;
      case "materialize-observable":
        return `Reconciled ${error.targetType} "${error.targetName}" did not satisfy its observable contract`;
      case "uninstall-remains-declared":
        return `Uninstalled ${error.targetType} "${error.targetName}" remains declared`;
      case "uninstall-observed-state":
        return `Uninstalled ${error.targetType} "${error.targetName}" has an invalid observed postcondition`;
    }
  };
  return makeAppError({ code: "internal", detail: detail() });
};

/** Translate an unresolvable freshly scaffolded extension. */
export const scaffoldedExtensionUnresolvedToAppError = (
  error: ScaffoldedExtensionUnresolved,
): AppError =>
  makeAppError({
    code: "not_found",
    detail: `Newly scaffolded ${error.targetType} "${error.targetName}" could not be resolved from its workspace source`,
  });

/** Translate a materialized-tree integrity walk failure. */
export const materializedTreeInvalidToAppError = (error: MaterializedTreeInvalid): AppError =>
  makeAppError({
    code: "validation",
    detail: `Invalid materialized package tree at ${error.root}: ${error.reason}`,
    ...(error.cause === undefined ? {} : { cause: error.cause }),
  });

/** Translate an incompletely enumerable desired-state graph. */
export const desiredStateIncompleteToAppError = (error: DesiredStateIncomplete): AppError =>
  makeAppError({
    code: "conflict",
    detail: `Desired state cannot be enumerated completely; fix pack and declaration problems first: ${error.problems}`,
  });

/** Translate a workspace-authored contributor in a user workspace. */
export const authoredContributorUnsupportedToAppError = (
  error: AuthoredContributorUnsupported,
): AppError =>
  makeAppError({
    code: "validation",
    detail: `User workspaces do not support workspace-authored ${error.type} packages`,
  });

/** Translate an unparseable workspace contributor identity. */
export const contributorIdentityInvalidToAppError = (error: ContributorIdentityInvalid): AppError =>
  makeAppError({
    code: "validation",
    detail: `Invalid workspace ${error.type} identity: ${error.identity}`,
  });

/** Translate an active contributor without an accepted resolution. */
export const contributorUnresolvedToAppError = (error: ContributorUnresolved): AppError =>
  makeAppError({
    code: "conflict",
    detail: `Active ${error.type} has no accepted resolution: ${error.name}`,
  });

/** Translate a contributor tree drifted from its accepted lock entry. */
export const contributorTreeMismatchToAppError = (error: ContributorTreeMismatch): AppError =>
  makeAppError({
    code: "conflict",
    detail: `Materialized package tree does not match the accepted lock entry: ${error.packageRoot}`,
    suggestions: [
      {
        description:
          "Restore the accepted package with install or update, or fork it into the authored workspace tree before editing.",
      },
    ],
  });

/** Translate an unsupported managed-region target; the site owns the sentence. */
export const projectionTargetUnsupportedToAppError = (
  error: ProjectionTargetUnsupported,
): AppError => makeAppError({ code: "validation", detail: error.detail });

/** Translate an irreconcilable managed region. */
export const managedRegionViolationToAppError = (error: ManagedRegionViolation): AppError =>
  makeAppError({
    code: "conflict",
    detail:
      error.reason === undefined
        ? `Cannot reconcile managed region: ${error.displayPath}`
        : `${error.reason}: ${error.displayPath}`,
  });

/** Translate a managed-region filesystem failure, reproducing each step's detail. */
export const projectionIoFailedToAppError = (error: ProjectionIoFailed): AppError => {
  const detail = (): string => {
    switch (error.step) {
      case "inspect":
        return `Failed to inspect managed-region target: ${error.path}`;
      case "read":
        return `Failed to read managed-region target: ${error.path}`;
      case "reconcile":
        return `Failed to reconcile managed-region target: ${error.path}`;
    }
  };
  return makeAppError({ code: "internal", detail: detail(), cause: error.cause });
};

/** Translate an invalid rule definition; the site owns the fact sentence. */
export const ruleDefinitionInvalidToAppError = (error: RuleDefinitionInvalid): AppError =>
  makeAppError({
    code: "validation",
    detail: error.detail,
    ...(error.cause === undefined ? {} : { cause: error.cause }),
  });

/** Translate missing rule install state, reproducing each kind's detail. */
export const ruleInstallStateMissingToAppError = (error: RuleInstallStateMissing): AppError =>
  makeAppError({
    code: "internal",
    detail:
      error.kind === "tree-integrity"
        ? `Rule ${error.name} has no materialized tree integrity`
        : `Rule ${error.name} has no materialized content identity`,
  });

/** Translate an invalid hook definition; the site owns the fact sentence. */
export const hookDefinitionInvalidToAppError = (error: HookDefinitionInvalid): AppError =>
  makeAppError({
    code: "validation",
    detail: error.detail,
    ...(error.cause === undefined ? {} : { cause: error.cause }),
  });

/** Translate an invalid agent hooks configuration file. */
export const hookConfigInvalidToAppError = (error: HookConfigInvalid): AppError =>
  makeAppError({
    code: "validation",
    detail: error.detail,
    ...(error.cause === undefined ? {} : { cause: error.cause }),
  });

/** Translate a hook filesystem failure; the site owns the fact sentence. */
export const hookIoFailedToAppError = (error: HookIoFailed): AppError =>
  makeAppError({ code: "internal", detail: error.detail, cause: error.cause });

/** Translate missing hook install state, reproducing each kind's detail. */
export const hookInstallStateMissingToAppError = (error: HookInstallStateMissing): AppError =>
  makeAppError({
    code: "internal",
    detail:
      error.kind === "tree-integrity"
        ? `Hook ${error.name} has no materialized tree integrity`
        : `Hook ${error.name} has no materialized content identity`,
  });

/** Translate a transient-backup failure, reproducing each step's detail. */
export const transientBackupFailedToAppError = (error: TransientBackupFailed): AppError => {
  const detail = (): string => {
    switch (error.step) {
      case "create-temp-dir":
        return `Failed to create temporary directory for backup of ${error.path}`;
      case "write-backup":
        return `Failed to write backup: ${error.path}`;
      case "remove-backup":
        return `Failed to remove temporary backup after successful write: ${error.path}`;
    }
  };
  return makeAppError({ code: "internal", detail: detail(), cause: error.cause });
};

/** Translate an invalid subagent definition; the site owns the fact sentence. */
export const subagentDefinitionInvalidToAppError = (error: SubagentDefinitionInvalid): AppError =>
  makeAppError({
    code: "validation",
    detail: error.detail,
    ...(error.cause === undefined ? {} : { cause: error.cause }),
  });

/** Translate unreadable canonical subagent content with its location hint. */
export const subagentContentUnreadableToAppError = (error: SubagentContentUnreadable): AppError =>
  makeAppError({
    code: "internal",
    detail: `Failed to read ${error.expectedFilename} from ${error.subagentSrcPath}`,
    suggestions: [
      { description: `Ensure the subagent content file exists at ${error.contentPath}.` },
    ],
    cause: error.cause,
  });

/** Translate a subagent filesystem failure; the site owns the fact sentence. */
export const subagentIoFailedToAppError = (error: SubagentIoFailed): AppError =>
  makeAppError({
    code: "internal",
    detail: error.detail,
    ...(error.cause === undefined ? {} : { cause: error.cause }),
  });

/** Translate missing subagent install state, reproducing each kind's detail. */
export const subagentInstallStateMissingToAppError = (
  error: SubagentInstallStateMissing,
): AppError =>
  makeAppError({
    code: "internal",
    detail:
      error.kind === "content-identity"
        ? `Subagent ${error.name} has no materialized content identity`
        : `Subagent ${error.name} did not produce an external resolution`,
  });

/** Translate an invalid agent MCP config; the site owns the fact sentence. */
export const mcpConfigInvalidToAppError = (error: McpConfigInvalid): AppError =>
  makeAppError({
    code: "validation",
    detail: error.detail,
    ...(error.cause === undefined ? {} : { cause: error.cause }),
  });

/** Translate an MCP filesystem failure; the site owns the fact sentence. */
export const mcpConfigIoFailedToAppError = (error: McpConfigIoFailed): AppError =>
  makeAppError({ code: "internal", detail: error.detail, cause: error.cause });

/** Translate a refusal to touch an unmanaged MCP entry. */
export const mcpEntryUnmanagedToAppError = (error: McpEntryUnmanaged): AppError =>
  makeAppError({
    code: "conflict",
    detail: `MCP server ${error.serverName} is unmanaged in ${error.configPath}; AXM will not remove it`,
  });

/** Translate irreconcilable AXM ownership markers per state and operation. */
export const mcpOwnershipMarkerInvalidToAppError = (error: McpOwnershipMarkerInvalid): AppError =>
  makeAppError({
    code: "conflict",
    detail:
      error.state === "unsupported-version"
        ? `MCP server ${error.serverName} uses a newer AXM ownership marker; upgrade AXM before ${
            error.operation === "modify" ? "modifying" : "inspecting"
          } it`
        : `MCP server ${error.serverName} has malformed AXM ownership markers`,
  });

/** Translate an invalid MCP definition; the site owns the fact sentence. */
export const mcpDefinitionInvalidToAppError = (error: McpDefinitionInvalid): AppError =>
  makeAppError({
    code: "validation",
    detail: error.detail,
    ...(error.cause === undefined ? {} : { cause: error.cause }),
  });

/** Translate a non-registry MCP install with the canonical registry suggestion. */
export const mcpRegistryOnlyInstallToAppError = (error: McpRegistryOnlyInstall): AppError =>
  makeAppError({
    code: "usage",
    detail: `MCP servers materialize from a registry package, not from a ${error.refType} source`,
    suggestions: [
      {
        description: "Install from the registry",
        cmd: `axm mcps install @owner/mcps/${error.serverName}`,
      },
    ],
  });

/** Translate missing MCP install state. */
export const mcpInstallStateMissingToAppError = (error: McpInstallStateMissing): AppError =>
  makeAppError({
    code: "internal",
    detail: `MCP server ${error.name} has no materialized tree integrity`,
  });

/** Translate a shared-target resolution conflict; members own the reason. */
export const mcpSharedTargetConflictToAppError = (error: McpSharedTargetConflict): AppError =>
  makeAppError({ code: "conflict", detail: error.reason });

/** Translate an invalid skill definition; the site owns the fact sentence. */
export const skillDefinitionInvalidToAppError = (error: SkillDefinitionInvalid): AppError =>
  makeAppError({
    code: "validation",
    detail: error.detail,
    ...(error.cause === undefined ? {} : { cause: error.cause }),
  });

/** Translate a skill artifact failure; the site owns the fact sentence. */
export const skillMaterializationFailedToAppError = (error: SkillMaterializationFailed): AppError =>
  makeAppError({ code: "internal", detail: error.detail, cause: error.cause });

/** Translate missing skill install state, reproducing each kind's detail. */
export const skillInstallStateMissingToAppError = (error: SkillInstallStateMissing): AppError => {
  const detail = (): string => {
    switch (error.kind) {
      case "tree-integrity":
        return `Skill ${error.name} has no materialized tree integrity`;
      case "content-identity":
        return `Skill ${error.name} has no materialized content identity`;
      case "external-resolution":
        return `Skill ${error.name} did not produce an external resolution`;
    }
  };
  return makeAppError({ code: "internal", detail: detail() });
};

/** Translate a missing AXM skill compatibility verdict. */
export const axmSkillCompatibilityUnavailableToAppError = (
  _error: AxmSkillCompatibilityUnavailable,
): AppError =>
  makeAppError({
    code: "internal",
    detail: "AXM compatibility policy did not evaluate the official AXM skill",
  });

/** Translate an incompatible official AXM skill with its recovery plan. */
export const axmSkillIncompatibleToAppError = (error: AxmSkillIncompatible): AppError =>
  makeAppError({
    code: "conflict",
    detail:
      error.compatibility.detail ?? "The official AXM skill is incompatible with this AXM CLI.",
    recover: `Converge to ${formatAxmSkillCompatibilityTarget(error.compatibility.recovery)} with the ${error.compatibility.recovery.action} recovery plan`,
    ...(error.compatibility.recovery.nextAction === null
      ? {}
      : { cmd: error.compatibility.recovery.nextAction }),
  });

/** Translate an invalid pack input; the site owns the fact sentence. */
export const packDefinitionInvalidToAppError = (error: PackDefinitionInvalid): AppError =>
  makeAppError({
    code: "validation",
    detail: error.detail,
    ...(error.cause === undefined ? {} : { cause: error.cause }),
  });

/** Translate missing pack install state. */
export const packInstallStateMissingToAppError = (error: PackInstallStateMissing): AppError =>
  makeAppError({
    code: "internal",
    detail: `Pack ${error.name} has no materialized tree integrity`,
  });

/** Translate a pack archive fetch failure. */
export const packArchiveFetchFailedToAppError = (error: PackArchiveFetchFailed): AppError =>
  makeAppError({
    code: "network",
    detail: `Failed to fetch pack archive: ${error.message}`,
    cause: error.cause,
  });

/** Translate a pack staging failure. */
export const packStagingFailedToAppError = (error: PackStagingFailed): AppError =>
  makeAppError({
    code: "internal",
    detail: `Failed to stage pack at ${error.packDir}`,
    cause: error.cause,
  });

/** Translate an unresolvable pack dependency request; the site owns the sentence. */
export const packDependencyInvalidToAppError = (error: PackDependencyInvalid): AppError =>
  makeAppError({ code: "usage", detail: error.detail });

/** Translate a pack dependency conflict; the site owns the sentence. */
export const packDependencyConflictToAppError = (error: PackDependencyConflict): AppError =>
  makeAppError({ code: "conflict", detail: error.detail });

/** Translate a shadowed pack constraint per pack source, with its recovery. */
export const packConstraintShadowedToAppError = (error: PackConstraintShadowed): AppError =>
  error.packSource === "workspace"
    ? makeAppError({
        code: "conflict",
        detail: `Workspace-authored pack ${error.packFqn} requires ${error.memberFqn}@${error.constraint}, but workspace authority provides ${error.memberFqn}@${error.workspaceVersion}.`,
        suggestions: [
          {
            description: "Replace the authored pack constraint with the current workspace version",
            cmd: `axm packs add ${error.packFqn} ${error.memberFqn}`,
          },
        ],
      })
    : makeAppError({
        code: "conflict",
        detail: `Registry pack ${error.packFqn} requires ${error.memberFqn}@${error.constraint}, but workspace authority shadows that member with ${error.memberFqn}@${error.workspaceVersion}.`,
        suggestions: [
          {
            description:
              "Update the pack if its owner has published a constraint that includes the workspace version",
            cmd: `axm update ${error.packFqn}`,
          },
          {
            description: `Otherwise stop workspace authority from shadowing ${error.memberFqn}`,
          },
        ],
      });

/** Translate a missing pack dependency. */
export const packDependencyMissingToAppError = (error: PackDependencyMissing): AppError =>
  makeAppError({
    code: "not_found",
    detail: `Pack dependency ${error.dependencyTarget} was not found`,
  });

/** Translate an unsatisfiable pack dependency constraint. */
export const packDependencyUnsatisfiedToAppError = (error: PackDependencyUnsatisfied): AppError =>
  makeAppError({
    code: "conflict",
    title: "No compatible version",
    detail: `Pack dependency ${error.dependencyTarget} has no visible version satisfying ${error.constraint}`,
  });

/** Translate an invalid Knowledge input; the site owns the fact sentence. */
export const knowledgeDefinitionInvalidToAppError = (error: KnowledgeDefinitionInvalid): AppError =>
  makeAppError({
    code: "validation",
    detail: error.detail,
    ...(error.cause === undefined ? {} : { cause: error.cause }),
  });

/** Translate a Knowledge filesystem failure; the site owns the fact sentence. */
export const knowledgeIoFailedToAppError = (error: KnowledgeIoFailed): AppError =>
  makeAppError({ code: "internal", detail: error.detail, cause: error.cause });

/** Translate missing Knowledge install state, reproducing each kind's detail. */
export const knowledgeInstallStateMissingToAppError = (
  error: KnowledgeInstallStateMissing,
): AppError => {
  const detail = (): string => {
    switch (error.kind) {
      case "tree-integrity":
        return `Knowledge ${error.name} has no materialized tree integrity`;
      case "content-identity":
        return `Knowledge ${error.name} has no materialized content identity`;
      case "staged-tree-integrity":
        return `Knowledge ${error.name} has no staged tree integrity`;
    }
  };
  return makeAppError({ code: "internal", detail: detail() });
};

/** Translate a missing Knowledge lock resolution. */
export const knowledgeResolutionMissingToAppError = (error: KnowledgeResolutionMissing): AppError =>
  makeAppError({
    code: "conflict",
    detail: `Active external Knowledge bundle has no accepted resolution: ${error.name}`,
  });

/** Translate an unreconcilable Knowledge desired-state graph. */
export const knowledgeDesiredStateUnreconcilableToAppError = (
  _error: KnowledgeDesiredStateUnreconcilable,
): AppError =>
  makeAppError({
    code: "conflict",
    detail:
      "Knowledge desired state cannot be reconciled until pack and declaration problems are fixed",
  });

/** Translate unrestorable locked Knowledge content; the site owns the sentence. */
export const knowledgeUnavailableToAppError = (error: KnowledgeUnavailable): AppError =>
  makeAppError({
    code: "unavailable",
    detail: error.detail,
    ...(error.cause === undefined ? {} : { cause: error.cause }),
  });

/** Translate a Knowledge observable postcondition violation. */
export const knowledgeObservableContractViolatedToAppError = (
  error: KnowledgeObservableContractViolated,
): AppError =>
  makeAppError({
    code: "internal",
    detail: `Installed Knowledge bundle "${error.name}" did not satisfy its observable contract`,
  });

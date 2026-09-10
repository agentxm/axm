/**
 * Conversions from the extension-materialization typed failure families into
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
  HookDefinitionInvalid,
  HookInstallStateMissing,
  KnowledgeDefinitionInvalid,
  KnowledgeDesiredStateUnreconcilable,
  KnowledgeInstallStateMissing,
  KnowledgeIoFailed,
  KnowledgeObservableContractViolated,
  KnowledgeResolutionMissing,
  KnowledgeUnavailable,
  LifecyclePostconditionViolated,
  McpInstallStateMissing,
  McpRegistryOnlyInstall,
  PackArchiveFetchFailed,
  PackDefinitionInvalid,
  PackInstallStateMissing,
  PackStagingFailed,
  PackageCopyFailed,
  PackageMaterializationFailed,
  RuleDefinitionInvalid,
  RuleInstallStateMissing,
  ScaffoldedExtensionUnresolved,
  SkillDefinitionInvalid,
  SkillInstallStateMissing,
  SkillMaterializationFailed,
  StagedPackageInvalid,
  SubagentContentUnreadable,
  SubagentDefinitionInvalid,
  SubagentInstallStateMissing,
} from "@agentxm/extension-materialization";
import { makeAppError, type AppError } from "../app-error.js";

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
export const hookInstallStateMissingToAppError = (error: HookInstallStateMissing): AppError =>
  makeAppError({
    code: "internal",
    detail:
      error.kind === "tree-integrity"
        ? `Hook ${error.name} has no materialized tree integrity`
        : `Hook ${error.name} has no materialized content identity`,
  });

/** Translate a transient-backup failure, reproducing each step's detail. */
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

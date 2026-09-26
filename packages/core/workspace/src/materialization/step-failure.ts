/**
 * The rendering of the extension-materialization failure families — package
 * acquisition, the per-type managers, and the extension content they read —
 * into the one rendered failure a plan step settles with and the application
 * boundary projects. Each family renders here once.
 *
 * @experimental This API is unstable and may change without notice.
 */

import {
  FRONTMATTER_PARSE_FALLBACK_REASON,
  type FrontmatterParseFailure,
  type SubagentContentError,
} from "@agentxm/extension-content";
import { EXTENSION_TYPE_TABLE } from "@agentxm/extension-model/unstable/extensions/common";
import type { FqnInvalidError } from "@agentxm/extension-model/unstable/extensions/fqn";
import type { AxmSkillCompatibilityUnavailable } from "@agentxm/cli-maintenance/official-skill/application";
import type { AxmSkillIncompatible } from "@agentxm/cli-maintenance/official-skill/domain";
import {
  formatAxmSkillCompatibilityTarget,
  renderAxmSkillRecovery,
} from "@agentxm/cli-maintenance/official-skill/adapters/cli";

import type {
  ArchiveIntegrityMismatch,
  CanonicalPackageProbeFailed,
  CreateDestinationExists,
  PackageCopyFailed,
  PackageMaterializationFailed,
  StagedPackageInvalid,
} from "../acquisition/errors.js";
import type { HookDefinitionInvalid } from "../hooks/errors.js";
import type { RuleDefinitionInvalid } from "../instructions/errors.js";
import type {
  KnowledgeDefinitionInvalid,
  KnowledgeDesiredStateUnreconcilable,
  KnowledgeIoFailed,
  KnowledgeResolutionMissing,
  KnowledgeUnavailable,
} from "../knowledge/errors.js";
import type {
  McpAgentSyncRefused,
  McpCanonicalPathUnsafe,
  McpInstallStateMissing,
  McpLocalNameConflict,
  McpRequiredInputsMissing,
  McpWorkspacePackageInvalid,
} from "../mcp-connections/errors.js";
import type {
  PackArchiveFetchFailed,
  PackDefinitionInvalid,
  PackInstallStateMissing,
  PackStagingFailed,
} from "../packs/errors.js";
import type { SkillDefinitionInvalid, SkillMaterializationFailed } from "../skills/errors.js";
import type { SubagentContentUnreadable, SubagentDefinitionInvalid } from "../subagents/errors.js";
import { makeStepFailure, type StepFailure } from "../transitions/planning/plan/errors.js";
import type { InstallStateMissing } from "./accepted-resolution.js";

/** Every failure package acquisition and the per-type managers construct. */
export type MaterializationFamilyFailure =
  | PackageMaterializationFailed
  | StagedPackageInvalid
  | CanonicalPackageProbeFailed
  | PackageCopyFailed
  | ArchiveIntegrityMismatch
  | CreateDestinationExists
  | InstallStateMissing
  | RuleDefinitionInvalid
  | HookDefinitionInvalid
  | SubagentDefinitionInvalid
  | SubagentContentUnreadable
  | McpInstallStateMissing
  | McpLocalNameConflict
  | McpCanonicalPathUnsafe
  | McpWorkspacePackageInvalid
  | McpRequiredInputsMissing
  | McpAgentSyncRefused
  | SkillDefinitionInvalid
  | SkillMaterializationFailed
  | AxmSkillCompatibilityUnavailable
  | AxmSkillIncompatible
  | PackDefinitionInvalid
  | PackInstallStateMissing
  | PackArchiveFetchFailed
  | PackStagingFailed
  | KnowledgeDefinitionInvalid
  | KnowledgeIoFailed
  | KnowledgeResolutionMissing
  | KnowledgeDesiredStateUnreconcilable
  | KnowledgeUnavailable
  | FqnInvalidError
  | FrontmatterParseFailure
  | SubagentContentError;

const packageMaterializationDetail = (error: PackageMaterializationFailed): string => {
  switch (error.step) {
    case "recover":
      return `Failed to recover an interrupted package installation at ${error.path}`;
    case "prepare-parent":
      return `Failed to prepare the package location for ${error.path}`;
    case "prepare-staging":
      return `Failed to prepare temporary package files at ${error.path}`;
    case "inspect":
      return `Failed to inspect the installed package at ${error.path}`;
    case "replace":
      return `Failed to replace the installed package at ${error.path}`;
    case "inspect-create-destination":
      return `Failed to inspect create-only destination: ${error.path}`;
  }
};

const mcpAgentSyncDetail = (error: McpAgentSyncRefused): string => {
  switch (error.fault) {
    case "unknown-agents":
      return `Unknown configured agents in strict mode: ${error.agentIds.join(", ")}`;
    case "failed":
      return `MCP server ${error.serverName} sync failed in strict mode`;
  }
};

const mcpWorkspacePackageDetail = (error: McpWorkspacePackageInvalid): string => {
  switch (error.fault) {
    case "outside-workspace":
      return `Invalid workspace MCP server source location: ${error.location}`;
    case "missing":
      return `Workspace MCP server package is missing: ${error.location}`;
    case "unreadable":
      return `Failed to inspect workspace MCP server package: ${error.location}`;
  }
};

const axmSkillIncompatibleFailure = (error: AxmSkillIncompatible): StepFailure => {
  const recovery = renderAxmSkillRecovery(error.compatibility.recovery);
  return makeStepFailure({
    category: "conflict",
    detail:
      error.compatibility.detail ?? "The official AXM skill is incompatible with this AXM CLI.",
    recover: `Converge to ${formatAxmSkillCompatibilityTarget(error.compatibility.recovery)} with the ${error.compatibility.recovery.action} recovery plan`,
    ...(recovery.nextAction === null ? {} : { cmd: recovery.nextAction }),
    cause: error,
  });
};

/** Translate one acquisition, manager, or extension-content failure. */
export const materializationFailureToStepFailure = (
  error: MaterializationFamilyFailure,
): StepFailure => {
  switch (error._tag) {
    case "PackageMaterializationFailed":
      return makeStepFailure({
        category: "internal",
        detail: packageMaterializationDetail(error),
        cause: error.cause,
      });
    case "StagedPackageInvalid":
      return makeStepFailure({
        category: "validation",
        detail:
          error.kind === "missing"
            ? `Staged package is missing required file: ${error.file}`
            : `Staged package path is not a file: ${error.file}`,
        cause: error.cause,
      });
    case "CanonicalPackageProbeFailed":
      return makeStepFailure({ category: "internal", detail: error.detail, cause: error.cause });
    case "PackageCopyFailed":
      return makeStepFailure({
        category: error.severity,
        detail: error.detail,
        cause: error.cause,
      });
    case "ArchiveIntegrityMismatch":
      return makeStepFailure({
        category: "validation",
        detail: `${error.subject} — the fetched archive does not match the accepted integrity. Verify the source and rerun, or update to accept a republished version.`,
      });
    case "CreateDestinationExists":
      return makeStepFailure({
        category: "conflict",
        detail: `${error.subject} destination already exists: ${error.path}`,
        recover: "Choose a different name or remove the existing directory first",
      });
    case "RuleDefinitionInvalid":
    case "HookDefinitionInvalid":
    case "SubagentDefinitionInvalid":
    case "SkillDefinitionInvalid":
    case "PackDefinitionInvalid":
    case "KnowledgeDefinitionInvalid":
      return makeStepFailure({ category: "validation", detail: error.detail, cause: error.cause });
    case "InstallStateMissing":
      return makeStepFailure({
        category: "internal",
        detail: `Installed content for ${EXTENSION_TYPE_TABLE[error.type].sentenceLabel} ${error.name} could not be identified`,
      });
    case "SubagentContentUnreadable":
      return makeStepFailure({
        category: "internal",
        detail: `Failed to read ${error.expectedFilename} from ${error.subagentSrcPath}`,
        suggestions: [
          { description: `Ensure the subagent content file exists at ${error.contentPath}.` },
        ],
        cause: error.cause,
      });
    case "McpInstallStateMissing":
      return makeStepFailure({
        category: "internal",
        detail: `Installed files for MCP server ${error.name} could not be verified`,
      });
    case "McpLocalNameConflict":
      return makeStepFailure({
        category: "conflict",
        detail: `Local MCP name "${error.localName}" is already owned by a different source`,
      });
    case "McpCanonicalPathUnsafe":
      return makeStepFailure({
        category: "internal",
        detail: `Path traversal detected: ${error.canonicalPath}`,
      });
    case "McpWorkspacePackageInvalid":
      return makeStepFailure({
        category: error.fault === "unreadable" ? "internal" : "validation",
        detail: mcpWorkspacePackageDetail(error),
        cause: error.cause,
      });
    case "McpRequiredInputsMissing":
      return makeStepFailure({
        category: "usage",
        detail: `${error.localName} needs ${error.inputNames.join(", ")}, and no prompt can open to ask for them`,
        suggestions: [
          {
            description: "Supply each required input on the command line",
            cmd: error.inputNames.map((name) => `--env ${name}=<value>`).join(" "),
          },
        ],
      });
    case "McpAgentSyncRefused":
      return makeStepFailure({
        category: error.fault === "unknown-agents" ? "not_found" : "internal",
        detail: mcpAgentSyncDetail(error),
      });
    case "SkillMaterializationFailed":
      return makeStepFailure({ category: "internal", detail: error.detail, cause: error.cause });
    case "AxmSkillCompatibilityUnavailable":
      return makeStepFailure({
        category: "internal",
        detail: "AXM compatibility policy did not evaluate the official AXM skill",
      });
    case "AxmSkillIncompatible":
      return axmSkillIncompatibleFailure(error);
    case "PackInstallStateMissing":
      return makeStepFailure({
        category: "internal",
        detail: `Installed files for pack ${error.name} could not be verified`,
      });
    case "PackArchiveFetchFailed":
      return makeStepFailure({
        category: "network",
        detail: `Failed to fetch pack archive: ${error.message}`,
        cause: error.cause,
      });
    case "PackStagingFailed":
      return makeStepFailure({
        category: "internal",
        detail: `Failed to stage pack at ${error.packDir}`,
        cause: error.cause,
      });
    case "KnowledgeIoFailed":
      return makeStepFailure({ category: "internal", detail: error.detail, cause: error.cause });
    case "KnowledgeResolutionMissing":
      return makeStepFailure({
        category: "conflict",
        detail: `AXM has no locked version for active Knowledge bundle ${error.name}`,
      });
    case "KnowledgeDesiredStateUnreconcilable":
      return makeStepFailure({
        category: "conflict",
        detail:
          "AXM could not determine which Knowledge bundles should be installed because some pack or axm.json entries are invalid",
      });
    case "KnowledgeUnavailable":
      return makeStepFailure({ category: "unavailable", detail: error.detail, cause: error.cause });
    case "FqnInvalidError":
      return makeStepFailure({
        category: "validation",
        title: "Invalid fully qualified name",
        detail: `Invalid fully qualified name: ${error.input}`,
        inputs: [{ label: "Name", value: error.input }],
        suggestions: [
          {
            description:
              "Use the 3-segment format: @handle/(skills|mcps|subagents|rules|hooks|knowledge|packs)/name",
          },
        ],
        cause: error,
      });
    case "FrontmatterParseFailure":
      return makeStepFailure({
        category: "validation",
        detail: FRONTMATTER_PARSE_FALLBACK_REASON,
        suggestions: [
          {
            description: "Ensure the frontmatter block contains valid YAML between --- delimiters.",
          },
        ],
        cause: error,
      });
    case "SubagentContentError":
      return makeStepFailure({
        category: "validation",
        detail: error.detail,
        ...(error.suggestion === undefined
          ? {}
          : { suggestions: [{ description: error.suggestion }] }),
        cause: error,
      });
  }
};

/**
 * The rendering of the extension-materialization failure families — package
 * acquisition, the failures extension kinds construct under the kernel's
 * brand, the official AXM skill's compatibility refusals, and the extension
 * content they read — into the one rendered failure a plan step settles with
 * and the application boundary projects. Each family renders here once; a
 * kind's failure renders from the rendering data it carries.
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
import {
  type AxmSkillIncompatible,
  formatAxmSkillCompatibilityTarget,
  renderAxmSkillRecovery,
} from "@agentxm/cli-maintenance/official-skill/domain";

import { makeStepFailure, type StepFailure } from "../operations/index.js";
import type { InstallStateMissing } from "./accepted-resolution.js";
import { isExtensionKindFailure, type ExtensionKindFailure } from "./kind-failure.js";
import type {
  ArchiveIntegrityMismatch,
  CanonicalPackageProbeFailed,
  CreateDestinationExists,
  PackageCopyFailed,
  PackageMaterializationFailed,
  StagedPackageInvalid,
} from "../acquisition/index.js";

/** Every failure package acquisition and the per-type managers construct. */
export type MaterializationFamilyFailure =
  | PackageMaterializationFailed
  | StagedPackageInvalid
  | CanonicalPackageProbeFailed
  | PackageCopyFailed
  | ArchiveIntegrityMismatch
  | CreateDestinationExists
  | InstallStateMissing
  | ExtensionKindFailure
  | AxmSkillCompatibilityUnavailable
  | AxmSkillIncompatible
  | FqnInvalidError
  | FrontmatterParseFailure
  | SubagentContentError;

const packageMaterializationDetail = (error: PackageMaterializationFailed): string => {
  switch (error.step) {
    case "recover":
      return `Failed to recover an interrupted package installation at ${error.path}`;
    case "prepare-parent":
      return `Failed to prepare the package location for ${error.path}`;
    case "record-parent-creation":
      return `Failed to preserve parent creation evidence for ${error.path}`;
    case "retire":
      return `Failed to retire the installed package at ${error.path}`;
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
  if (isExtensionKindFailure(error)) {
    return makeStepFailure({
      category: error.category,
      detail: error.detail,
      recover: error.recover,
      cmd: error.cmd,
      suggestions: error.suggestions,
      cause: error.cause,
    });
  }
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
    case "InstallStateMissing":
      return makeStepFailure({
        category: "internal",
        detail: `Installed content for ${EXTENSION_TYPE_TABLE[error.type].sentenceLabel} ${error.name} could not be identified`,
      });
    case "AxmSkillCompatibilityUnavailable":
      return makeStepFailure({
        category: "internal",
        detail: "AXM compatibility policy did not evaluate the official AXM skill",
      });
    case "AxmSkillIncompatible":
      return axmSkillIncompatibleFailure(error);
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
        cause: error,
      });
  }
};

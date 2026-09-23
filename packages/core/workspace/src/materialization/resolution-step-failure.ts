/**
 * The rendering of the resolution failure families — source locators and
 * hosts, the registry client, the workspace catalog and official-skill gate
 * ports, and pack dependency and source-authority resolution — into the one
 * rendered failure a plan step settles with and the application boundary
 * projects.
 *
 * Resolution states facts and owns no rendering, so the capability that
 * unions these families into `ExtensionManagerFailure` renders them.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type {
  RegistryOperationFailed,
  RegistryProblem,
  RegistryRequestFailed,
} from "@agentxm/registry-client";

import {
  LockfileDecodeError,
  LockfileIoError,
  LockfileParseError,
  LockfileVersionUnsupported,
  SettingsDecodeError,
  SettingsIoError,
  SettingsParseError,
  WorkspaceRootEscape,
} from "../desired-state/workspace/read-model/errors.js";
import type { WorkspaceStateReadFailure } from "../desired-state/index.js";
import type {
  ExtensionResolutionFailed,
  PackConstraintShadowed,
  PackDependencyConflict,
  PackDependencyInvalid,
  PackDependencyMissing,
  PackDependencyUnsatisfied,
  SourceAuthorityBlocked,
} from "../resolution/errors.js";
import type { AxmSkillGateUnavailable } from "../resolution/sources/axm-skill-gate.js";
import type {
  GitOperationFailed,
  SourceHostNotConfigured,
  SourceNetworkFailure,
  SourceNotResolvable,
  SourceSyntaxInvalid,
} from "../resolution/sources/errors.js";
import type { WorkspaceCatalogUnavailable } from "../resolution/sources/workspace-catalog.js";
import { workspaceStateReadFailureToStepFailure } from "../transitions/planning/plan/step-failure-conversions.js";
import { makeStepFailure, type StepFailure } from "../transitions/planning/plan/errors.js";

/** Every source, registry, and dependency-resolution failure. */
export type ResolutionFamilyFailure =
  | SourceSyntaxInvalid
  | SourceHostNotConfigured
  | SourceNotResolvable
  | SourceNetworkFailure
  | GitOperationFailed
  | WorkspaceCatalogUnavailable
  | AxmSkillGateUnavailable
  | RegistryProblem
  | RegistryRequestFailed
  | RegistryOperationFailed
  | ExtensionResolutionFailed
  | SourceAuthorityBlocked
  | PackDependencyInvalid
  | PackDependencyConflict
  | PackConstraintShadowed
  | PackDependencyMissing
  | PackDependencyUnsatisfied;

const isWorkspaceStateReadFailure = (value: unknown): value is WorkspaceStateReadFailure =>
  value instanceof SettingsIoError ||
  value instanceof SettingsParseError ||
  value instanceof SettingsDecodeError ||
  value instanceof LockfileIoError ||
  value instanceof LockfileParseError ||
  value instanceof LockfileDecodeError ||
  value instanceof LockfileVersionUnsupported ||
  value instanceof WorkspaceRootEscape;

const packConstraintShadowedFailure = (error: PackConstraintShadowed): StepFailure =>
  error.packSource === "workspace"
    ? makeStepFailure({
        category: "conflict",
        detail: `Workspace-authored pack ${error.packFqn} requires ${error.memberFqn}@${error.constraint}, but workspace authority provides ${error.memberFqn}@${error.workspaceVersion}.`,
        suggestions: [
          {
            description: "Replace the authored pack constraint with the current workspace version",
            cmd: `axm packs add ${error.packFqn} ${error.memberFqn}`,
          },
        ],
      })
    : makeStepFailure({
        category: "conflict",
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

/** Translate one source, registry, or dependency-resolution failure. */
export const resolutionFailureToStepFailure = (error: ResolutionFamilyFailure): StepFailure => {
  switch (error._tag) {
    case "SourceSyntaxInvalid":
    case "SourceHostNotConfigured":
      return makeStepFailure({
        category: "validation",
        detail: error.detail,
        suggestions: error.suggestions,
        cause: error.cause,
      });
    case "SourceNotResolvable":
      return makeStepFailure({
        category: error.category,
        detail: error.detail,
        recover: error.recover,
        cmd: error.cmd,
        suggestions: error.suggestions,
        cause: error.cause,
      });
    case "SourceNetworkFailure":
      return makeStepFailure({
        category: "network",
        detail: error.detail,
        retryable: error.retryable,
        cause: error.cause,
      });
    case "GitOperationFailed":
      return makeStepFailure({
        category: error.operation === "clone" ? "network" : "validation",
        detail: error.detail,
        cause: error.cause,
      });
    case "WorkspaceCatalogUnavailable":
      // The catalog carries the workspace failure it could not read past; a
      // recognized one renders exactly as it does wherever else it surfaces.
      return isWorkspaceStateReadFailure(error.cause)
        ? workspaceStateReadFailureToStepFailure(error.cause)
        : makeStepFailure({
            category: error.category,
            detail: error.detail,
            suggestions: error.suggestions,
            cause: error.cause,
          });
    case "AxmSkillGateUnavailable":
      return makeStepFailure({
        category: error.category,
        detail: error.detail,
        suggestions: error.suggestions,
        cause: error.cause,
      });
    case "RegistryProblem":
      return makeStepFailure({
        category: error.category,
        title: error.title,
        detail: error.detail,
        metadata: error.metadata,
        suggestions: error.suggestions,
        cause: error.cause,
      });
    case "RegistryRequestFailed":
    case "RegistryOperationFailed":
      return makeStepFailure({
        category: error.category,
        detail: error.detail,
        metadata: error.metadata,
        suggestions: error.suggestions,
        cause: error.cause,
      });
    case "ExtensionResolutionFailed":
      return makeStepFailure({
        category: error.category,
        title: error.title,
        detail: error.detail,
        recover: error.recover,
        cmd: error.cmd,
        suggestions: error.suggestions,
        cause: error.cause,
      });
    case "SourceAuthorityBlocked":
      return makeStepFailure({
        category: "conflict",
        detail: error.detail,
        suggestions: error.recovery,
      });
    case "PackDependencyInvalid":
      return makeStepFailure({ category: "usage", detail: error.detail });
    case "PackDependencyConflict":
      return makeStepFailure({ category: "conflict", detail: error.detail });
    case "PackConstraintShadowed":
      return packConstraintShadowedFailure(error);
    case "PackDependencyMissing":
      return makeStepFailure({
        category: "not_found",
        detail: `Pack dependency ${error.dependencyTarget} was not found`,
      });
    case "PackDependencyUnsatisfied":
      return makeStepFailure({
        category: "conflict",
        title: "No compatible version",
        detail: `Pack dependency ${error.dependencyTarget} has no visible version satisfying ${error.constraint}`,
      });
  }
};

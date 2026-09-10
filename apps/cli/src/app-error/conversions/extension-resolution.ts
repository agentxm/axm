/**
 * Conversions from the extension-resolution typed failure families into
 * CLI-facing `AppError` values. The resolution failure chose its category and
 * wording at construction, so the envelope carries those over 1:1; the
 * remaining families render a detail template whose byte-for-byte contract
 * lives in the table-driven conversion tests.
 *
 * @experimental This API is unstable and may change without notice.
 */

import {
  type AxmSkillCompatibilityUnavailable,
  type AxmSkillIncompatible,
  type ExtensionResolutionFailed,
  type PackConstraintShadowed,
  type PackDependencyConflict,
  type PackDependencyInvalid,
  type PackDependencyMissing,
  type PackDependencyUnsatisfied,
  type SourceAuthorityBlocked,
  formatAxmSkillCompatibilityTarget,
} from "@agentxm/extension-resolution";
import { makeAppError, type AppError } from "../app-error.js";

/** Translate a resolution policy failure. */
export const extensionResolutionFailedToAppError = (error: ExtensionResolutionFailed): AppError =>
  makeAppError({
    code: error.category,
    ...(error.title === undefined ? {} : { title: error.title }),
    ...(error.detail === undefined ? {} : { detail: error.detail }),
    ...(error.recover === undefined ? {} : { recover: error.recover }),
    ...(error.cmd === undefined ? {} : { cmd: error.cmd }),
    ...(error.suggestions === undefined ? {} : { suggestions: error.suggestions }),
    ...(error.cause === undefined ? {} : { cause: error.cause }),
  });

export const sourceAuthorityBlockedToAppError = (error: SourceAuthorityBlocked): AppError =>
  makeAppError({ code: "conflict", detail: error.detail, suggestions: error.recovery });

/** Translate a lifecycle postcondition violation, reproducing each phase's detail. */
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

/**
 * Conversions from the workspace-projection typed failure family into
 * CLI-facing `AppError` values. Each converter reproduces the detail template
 * its construction sites rendered before decoupling — the byte-for-byte
 * contract for this family lives in the table-driven conversion tests.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type {
  AuthoredContributorUnsupported,
  ContributorIdentityInvalid,
  ContributorTreeMismatch,
  ContributorUnresolved,
  DesiredStateIncomplete,
  ManagedRegionViolation,
  ProjectionIoFailed,
  ProjectionTargetUnsupported,
} from "@agentxm/workspace/projection";
import { makeAppError, type AppError } from "../app-error.js";

export const desiredStateIncompleteToAppError = (error: DesiredStateIncomplete): AppError =>
  makeAppError({
    code: "conflict",
    detail: `AXM could not determine what should be installed because some pack or axm.json entries are invalid: ${error.problems}`,
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
    detail: `AXM has no locked version for active ${error.type} ${error.name}`,
  });

/** Translate a contributor tree drifted from its accepted lock entry. */
export const contributorTreeMismatchToAppError = (error: ContributorTreeMismatch): AppError =>
  makeAppError({
    code: "conflict",
    detail: `Installed package files differ from axm-lock.yaml: ${error.packageRoot}`,
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
    detail: `AXM cannot safely update its section in ${error.displayPath}${error.reason === undefined ? "" : `: ${error.reason}`}`,
  });

/** Translate a managed-region filesystem failure, reproducing each step's detail. */
export const projectionIoFailedToAppError = (error: ProjectionIoFailed): AppError => {
  const detail = (): string => {
    switch (error.step) {
      case "inspect":
        return `Failed to inspect AXM's section in ${error.path}`;
      case "read":
        return `Failed to read AXM's section in ${error.path}`;
      case "reconcile":
        return `Failed to update AXM's section in ${error.path}`;
    }
  };
  return makeAppError({ code: "internal", detail: detail(), cause: error.cause });
};

/** Translate an invalid rule definition; the site owns the fact sentence. */

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
} from "@agentxm/workspace-projection";
import { makeAppError, type AppError } from "../app-error.js";

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

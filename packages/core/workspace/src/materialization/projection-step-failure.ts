/**
 * The rendering of the shared-projection failure family into the one
 * rendered failure a plan step settles with and the application boundary
 * projects.
 *
 * Projection states domain facts and owns no rendering, so the capability
 * that unions projection into `ExtensionManagerFailure` renders it.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { makeStepFailure, type StepFailure } from "../transitions/planning/plan/errors.js";
import type { ProjectionError } from "../projection/errors.js";
import type { InstructionMaintenanceFailed } from "../projection/instructions/errors.js";

/** Every shared-projection failure, including instruction maintenance. */
export type ProjectionFamilyFailure = ProjectionError | InstructionMaintenanceFailed;

/** Translate one shared-projection failure. */
export const projectionErrorToStepFailure = (error: ProjectionFamilyFailure): StepFailure => {
  switch (error._tag) {
    case "DesiredStateIncomplete":
      return makeStepFailure({
        category: "conflict",
        detail: `AXM could not determine what should be installed because some pack or axm.json entries are invalid: ${error.problems}`,
      });
    case "AuthoredContributorUnsupported":
      return makeStepFailure({
        category: "validation",
        detail: `User workspaces do not support workspace-authored ${error.type} packages`,
      });
    case "ContributorIdentityInvalid":
      return makeStepFailure({
        category: "validation",
        detail: `Invalid workspace ${error.type} identity: ${error.identity}`,
      });
    case "ContributorUnresolved":
      return makeStepFailure({
        category: "conflict",
        detail: `AXM has no locked version for active ${error.type} ${error.name}`,
      });
    case "ContributorTreeMismatch":
      return makeStepFailure({
        category: "conflict",
        detail: `Installed package files differ from axm-lock.yaml: ${error.packageRoot}`,
        suggestions: [
          {
            description:
              "Restore the accepted package with install or update, or fork it into the authored workspace tree before editing.",
          },
        ],
      });
    case "ProjectionTargetUnsupported":
      return makeStepFailure({ category: "validation", detail: error.detail });
    case "ManagedRegionViolation":
      return makeStepFailure({
        category: "conflict",
        detail: `AXM cannot safely update its section in ${error.displayPath}${error.reason === undefined ? "" : `: ${error.reason}`}`,
      });
    case "ProjectionIoFailed":
      return makeStepFailure({
        category: "internal",
        detail:
          error.step === "inspect"
            ? `Failed to inspect AXM's section in ${error.path}`
            : error.step === "read"
              ? `Failed to read AXM's section in ${error.path}`
              : `Failed to update AXM's section in ${error.path}`,
        cause: error.cause,
      });
    case "InstructionMaintenanceFailed":
      return makeStepFailure({
        category: error.category,
        detail: error.detail,
        suggestions: error.suggestions,
        cause: error.cause,
      });
  }
};

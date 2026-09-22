/**
 * Conversions from the shared-projection failure family into the plan-step
 * vocabulary.
 *
 * Projection states domain facts and owns no rendering, and the package that
 * owns `StepFailure` cannot see it, so the capability that unions projection
 * into `ExtensionManagerFailure` renders it. Category, detail, and suggestion
 * strings are the plan pipeline's serialized contract: they stay
 * byte-identical to the CLI boundary's `AppError` renderings of the same
 * failures, exactly as `workspaceStateReadFailureToStepFailure` does for the
 * workspace-state family.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { StepFailure } from "../transitions/planning/index.js";
import type { ProjectionError } from "../projection/index.js";

/** Translate one shared-projection failure into the plan-step vocabulary. */
export const projectionErrorToStepFailure = (error: ProjectionError): StepFailure => {
  switch (error._tag) {
    case "DesiredStateIncomplete":
      return new StepFailure({
        category: "conflict",
        detail: `AXM could not determine what should be installed because some pack or axm.json entries are invalid: ${error.problems}`,
        cause: error,
      });
    case "AuthoredContributorUnsupported":
      return new StepFailure({
        category: "validation",
        detail: `User workspaces do not support workspace-authored ${error.type} packages`,
        cause: error,
      });
    case "ContributorIdentityInvalid":
      return new StepFailure({
        category: "validation",
        detail: `Invalid workspace ${error.type} identity: ${error.identity}`,
        cause: error,
      });
    case "ContributorUnresolved":
      return new StepFailure({
        category: "conflict",
        detail: `AXM has no locked version for active ${error.type} ${error.name}`,
        cause: error,
      });
    case "ContributorTreeMismatch":
      return new StepFailure({
        category: "conflict",
        detail: `Installed package files differ from axm-lock.yaml: ${error.packageRoot}`,
        suggestions: [
          {
            description:
              "Restore the accepted package with install or update, or fork it into the authored workspace tree before editing.",
          },
        ],
        cause: error,
      });
    case "ProjectionTargetUnsupported":
      return new StepFailure({ category: "validation", detail: error.detail, cause: error });
    case "ManagedRegionViolation":
      return new StepFailure({
        category: "conflict",
        detail: `AXM cannot safely update its section in ${error.displayPath}${error.reason === undefined ? "" : `: ${error.reason}`}`,
        cause: error,
      });
    case "ProjectionIoFailed":
      return new StepFailure({
        category: "internal",
        detail:
          error.step === "inspect"
            ? `Failed to inspect AXM's section in ${error.path}`
            : error.step === "read"
              ? `Failed to read AXM's section in ${error.path}`
              : `Failed to update AXM's section in ${error.path}`,
        cause: error.cause,
      });
  }
};

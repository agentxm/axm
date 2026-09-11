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

import { StepFailure } from "@agentxm/workspace-operations";
import type { ProjectionError } from "@agentxm/workspace-projection";

/** Translate one shared-projection failure into the plan-step vocabulary. */
export const projectionErrorToStepFailure = (error: ProjectionError): StepFailure => {
  switch (error._tag) {
    case "DesiredStateIncomplete":
      return new StepFailure({
        category: "conflict",
        detail: `Desired state cannot be enumerated completely; fix pack and declaration problems first: ${error.problems}`,
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
        detail: `Active ${error.type} has no accepted resolution: ${error.name}`,
        cause: error,
      });
    case "ContributorTreeMismatch":
      return new StepFailure({
        category: "conflict",
        detail: `Materialized package tree does not match the accepted lock entry: ${error.packageRoot}`,
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
        detail:
          error.reason === undefined
            ? `Cannot reconcile managed region: ${error.displayPath}`
            : `${error.reason}: ${error.displayPath}`,
        cause: error,
      });
    case "ProjectionIoFailed":
      return new StepFailure({
        category: "internal",
        detail:
          error.step === "inspect"
            ? `Failed to inspect managed-region target: ${error.path}`
            : error.step === "read"
              ? `Failed to read managed-region target: ${error.path}`
              : `Failed to reconcile managed-region target: ${error.path}`,
        cause: error.cause,
      });
  }
};

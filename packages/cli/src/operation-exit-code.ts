/**
 * Exit-code projection for operation resolutions. Exit codes are application
 * vocabulary: the kernel derives outcomes, and this boundary owns the
 * outcome-to-exit mapping the published exit-code reference pins.
 */

import { ExitCode, exitCodeFor } from "@agentxm/extension-management/unstable/app-error";
import {
  deriveOperationOutcome,
  type BlockingClass,
  type OperationOutcome,
  type OperationResolution,
} from "@agentxm/workspace-operations";

const BLOCKED_CONFLICT_CLASSES: ReadonlySet<BlockingClass> = new Set([
  "stale-candidate",
  "resource-conflict",
  "policy-excluded",
  "dependency-cycle",
]);

/**
 * The exit code for a resolution, from one outcome-to-exit mapping:
 * previewed/applied/no-op/cancelled exit 0 (a flag-requested divergence on a
 * preview exits 1); partial exits 1; failed exits by cause class (default 1);
 * blocked exits by blocking class (approval/override 2; stale-candidate,
 * resource-conflict, policy-excluded, dependency-cycle 6; otherwise cause
 * class); interrupted exits 130/143.
 */
export const operationExitCode = (
  resolution: OperationResolution<unknown>,
  outcome: OperationOutcome = deriveOperationOutcome(resolution),
): number => {
  switch (outcome) {
    case "previewed":
      return resolution.divergence === true ? ExitCode.Issues : ExitCode.Success;
    case "applied":
    case "no-op":
    case "cancelled":
      return ExitCode.Success;
    case "partial":
      return ExitCode.Issues;
    case "failed":
      return exitCodeFor(resolution.failure?.category ?? "issues");
    case "blocked": {
      const blocking = resolution.blocking;
      if (blocking === undefined) return ExitCode.Issues;
      if (blocking.class === "approval-required" || blocking.class === "override-required") {
        return ExitCode.Usage;
      }
      if (BLOCKED_CONFLICT_CLASSES.has(blocking.class)) return ExitCode.Conflict;
      return exitCodeFor(blocking.causeCode ?? resolution.failure?.category ?? "issues");
    }
    case "interrupted":
      return resolution.interruption?.signal === "SIGTERM" ? 143 : 130;
  }
};

/** The machine envelope's `ok`: true exactly for the zero-exit outcome set. */
export const operationOk = (
  resolution: OperationResolution<unknown>,
  outcome: OperationOutcome = deriveOperationOutcome(resolution),
): boolean => operationExitCode(resolution, outcome) === ExitCode.Success;

/**
 * Exit-code projection for operation resolutions. Exit codes are application
 * vocabulary: the kernel derives outcomes, and this boundary owns the
 * outcome-to-exit mapping the published exit-code reference pins.
 */

import { ExitCode, exitCodeFor } from "./app-error/index.js";
import {
  deriveOperationOutcome,
  type BlockingClass,
  type OperationErrorCategory,
  type OperationOutcome,
  type OperationResolution,
} from "@agentxm/workspace/transitions/planning";

const BLOCKED_CONFLICT_CLASSES: ReadonlySet<BlockingClass> = new Set([
  "stale-candidate",
  "resource-conflict",
  "policy-excluded",
  "dependency-cycle",
]);

/**
 * What the outcome-to-exit mapping reads from a settled operation: an
 * `OperationResolution` supplies every field, and a feature that settles into
 * its own outcome vocabulary supplies the same fields so its exit is decided
 * here and nowhere else.
 */
export interface OperationVerdict {
  readonly divergence?: boolean;
  readonly failure?: { readonly category: OperationErrorCategory };
  readonly blocking?: {
    readonly class: BlockingClass;
    readonly causeCode?: OperationErrorCategory;
  };
  readonly interruption?: { readonly signal: "SIGINT" | "SIGTERM" };
}

/**
 * The exit code for a settled operation, from one outcome-to-exit mapping:
 * previewed/applied/no-op/cancelled exit 0 (a flag-requested divergence on a
 * preview exits 1); partial exits 1; failed exits by cause class (default 1);
 * blocked exits by blocking class (approval/override 2; stale-candidate,
 * resource-conflict, policy-excluded, dependency-cycle 6; otherwise cause
 * class); interrupted exits 130/143.
 */
export const operationExitCode = (verdict: OperationVerdict, outcome: OperationOutcome): number => {
  switch (outcome) {
    case "previewed":
      return verdict.divergence === true ? ExitCode.Issues : ExitCode.Success;
    case "applied":
    case "no-op":
    case "cancelled":
      return ExitCode.Success;
    case "partial":
      return ExitCode.Issues;
    case "failed":
      return exitCodeFor(verdict.failure?.category ?? "issues");
    case "blocked": {
      const blocking = verdict.blocking;
      if (blocking === undefined) return ExitCode.Issues;
      if (blocking.class === "approval-required" || blocking.class === "override-required") {
        return ExitCode.Usage;
      }
      if (BLOCKED_CONFLICT_CLASSES.has(blocking.class)) return ExitCode.Conflict;
      return exitCodeFor(blocking.causeCode ?? verdict.failure?.category ?? "issues");
    }
    case "interrupted":
      return verdict.interruption?.signal === "SIGTERM" ? 143 : 130;
  }
};

/** The exit code of a resolution, from its derived outcome. */
export const resolutionExitCode = (resolution: OperationResolution<unknown>): number =>
  operationExitCode(resolution, deriveOperationOutcome(resolution));

/** The machine envelope's `ok`: true exactly for the zero-exit outcome set. */
export const operationOk = (verdict: OperationVerdict, outcome: OperationOutcome): boolean =>
  operationExitCode(verdict, outcome) === ExitCode.Success;

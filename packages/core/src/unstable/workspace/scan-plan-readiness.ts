/**
 * Pure function to scan a plan's steps and collect readiness statistics.
 *
 * Extracts from the inline logic in `previewOrApplyPlan` so it can be tested
 * independently and reused from core without CLI dependencies.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { Plan } from "./plan.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface PlanReadinessReport {
  readonly hasErrors: boolean;
  readonly hasWarnings: boolean;
  readonly errorMessages: ReadonlyArray<string>;
  readonly warnMessages: ReadonlyArray<string>;
}

// -----------------------------------------------------------------------------
// Implementation
// -----------------------------------------------------------------------------

/**
 * Scan all steps in a plan and collect readiness statistics.
 *
 * Pure function: no side effects, no service dependencies.
 */
export const scanPlanReadiness = (plan: Plan): PlanReadinessReport => {
  const errorMessages: string[] = [];
  const warnMessages: string[] = [];

  for (const job of plan.jobs) {
    for (const step of job.steps) {
      switch (step.readiness) {
        case "error":
          errorMessages.push(`${step.label}: ${step.errorMessage}`);
          break;
        case "warn":
          warnMessages.push(`${step.label}: ${step.warnMessage}`);
          break;
        case "ready":
          break;
      }
    }
  }

  return {
    hasErrors: errorMessages.length > 0,
    hasWarnings: warnMessages.length > 0,
    errorMessages,
    warnMessages,
  };
};

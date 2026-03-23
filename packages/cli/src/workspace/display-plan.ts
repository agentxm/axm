/**
 * Shared plan display module.
 *
 * Renders a human-readable summary of a Plan or ExecutedPlan via the Log service.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as ServiceMap from "effect/ServiceMap";
import { ClackLog } from "../clack-effect/index.js";
import { renderCliError, type RenderCliErrorOptions } from "../cli-error/index.js";
import type { CompletedJobStep, ExecutedPlan, Plan, PlannedJobStep } from "./plan.js";

// -----------------------------------------------------------------------------
// Implementation
// -----------------------------------------------------------------------------

const defaultVerbosity: RenderCliErrorOptions = {
  verbose: false,
  debug: false,
};

export interface DisplayPlanOptions {
  readonly verbosity?: RenderCliErrorOptions;
}

/**
 * Display a plan or executed plan summary via the Log service.
 */
export const displayPlan = (plan: Plan | ExecutedPlan, options: DisplayPlanOptions = {}) =>
  Effect.gen(function* () {
    const log = yield* ClackLog;
    const verbosity = options.verbosity ?? defaultVerbosity;

    // Heading
    const heading = Option.match(plan.description, {
      onNone: () => plan.name,
      onSome: (desc) => `${plan.name}\n${desc}`,
    });
    yield* log.info(heading);

    // Determine if this is an executed plan using _tag discriminant
    const firstJob = plan.jobs[0];
    if (!firstJob || firstJob.steps.length === 0) {
      return;
    }

    const isExecuted = plan._tag === "ExecutedPlan";

    if (isExecuted) {
      // Assertion safe: _tag === "ExecutedPlan" confirmed above; TS can't narrow union parameter
      const executedPlan = plan as ExecutedPlan;
      const allSteps = executedPlan.jobs.flatMap((job) => [...job.steps]);
      for (const step of allSteps) {
        yield* renderCompletedStep(step, log, verbosity);
      }
      yield* renderCompletedSummary(allSteps, log);
    } else {
      // Assertion safe: _tag === "Plan" (only alternative in union)
      const plannedPlan = plan as Plan;
      const allSteps = plannedPlan.jobs.flatMap((job) => [...job.steps]);
      for (const step of allSteps) {
        yield* renderPlannedStep(step, log);
      }
      yield* renderPlannedSummary(allSteps, log);
    }
  });

const renderPlannedStep = (
  step: PlannedJobStep,
  log: ServiceMap.Service.Shape<typeof ClackLog>,
) => {
  switch (step.readiness) {
    case "ready":
      return log.success(`  + ${step.label}`);
    case "warn":
      return log.warn(`  \u26A0 ${step.label} (${step.warnMessage})`);
    case "error":
      return log.error(`  \u2717 ${step.label} (${step.errorMessage})`);
  }
};

const renderCompletedStep = (
  step: CompletedJobStep,
  log: ServiceMap.Service.Shape<typeof ClackLog>,
  verbosity: RenderCliErrorOptions,
) => {
  switch (step.result.result) {
    case "success": {
      const suffix = step.result.message.length > 0 ? ` (${step.result.message})` : "";
      return log.success(`  \u2713 ${step.label}${suffix}`);
    }
    case "error": {
      const renderedLines = renderCliError(step.result.error, verbosity).split("\n");
      const [firstLine, ...rest] = renderedLines;
      const first = firstLine ?? step.result.message;
      const headline = first.startsWith("\u2717 ") ? first.slice(2) : first;

      return Effect.gen(function* () {
        yield* log.error(`  \u2717 ${step.label}: ${headline}`);
        for (const line of rest) {
          yield* log.error(`    ${line.trimStart()}`);
        }
      });
    }
  }
};

const renderPlannedSummary = (
  allSteps: ReadonlyArray<PlannedJobStep>,
  log: ServiceMap.Service.Shape<typeof ClackLog>,
) =>
  Effect.gen(function* () {
    const readyCount = allSteps.filter((s) => s.readiness === "ready").length;
    const warnCount = allSteps.filter((s) => s.readiness === "warn").length;
    const errorCount = allSteps.filter((s) => s.readiness === "error").length;

    const parts: string[] = [];
    if (readyCount > 0) parts.push(`${readyCount} to apply`);
    if (errorCount > 0) parts.push(`${errorCount} error${errorCount > 1 ? "s" : ""}`);
    if (warnCount > 0) parts.push(`${warnCount} warning${warnCount > 1 ? "s" : ""}`);

    if (parts.length > 0) {
      yield* log.message(parts.join(", "));
    }
  });

const renderCompletedSummary = (
  allSteps: ReadonlyArray<CompletedJobStep>,
  log: ServiceMap.Service.Shape<typeof ClackLog>,
) =>
  Effect.gen(function* () {
    const successCount = allSteps.filter((s) => s.result.result === "success").length;
    const failCount = allSteps.filter((s) => s.result.result === "error").length;

    const parts: string[] = [];
    if (successCount > 0) parts.push(`${successCount} applied`);
    if (failCount > 0) parts.push(`${failCount} failed`);

    if (parts.length > 0) {
      yield* log.message(parts.join(", "));
    }
  });

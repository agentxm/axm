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
import { Output } from "@axm.sh/core/unstable/output";
import { CliFlags } from "@axm.sh/core/unstable/cli-flags";
import { renderAppError } from "@axm.sh/core/unstable/app-error";
import type { CompletedJobStep, ExecutedPlan, Plan, PlannedJobStep } from "./plan.js";

// -----------------------------------------------------------------------------
// Implementation
// -----------------------------------------------------------------------------

/**
 * Display a plan or executed plan summary via the Log service.
 *
 * Reads verbosity settings from the `CliFlags` service.
 */
export const displayPlan = (plan: Plan | ExecutedPlan) =>
  Effect.gen(function* () {
    const output = yield* Output;
    const flags = yield* CliFlags;
    const verbosity: { readonly verbose: boolean; readonly debug: boolean } = {
      verbose: flags.verbose,
      debug: flags.debug,
    };

    // Heading
    const heading = Option.match(plan.description, {
      onNone: () => plan.name,
      onSome: (desc) => `${plan.name}\n${desc}`,
    });
    yield* output.info(heading);

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
        yield* renderCompletedStep(step, output, verbosity);
      }
      yield* renderCompletedSummary(allSteps, output);
    } else {
      // Assertion safe: _tag === "Plan" (only alternative in union)
      const plannedPlan = plan as Plan;
      const allSteps = plannedPlan.jobs.flatMap((job) => [...job.steps]);
      for (const step of allSteps) {
        yield* renderPlannedStep(step, output);
      }
      yield* renderPlannedSummary(allSteps, output);
    }
  });

const renderPlannedStep = (
  step: PlannedJobStep,
  output: ServiceMap.Service.Shape<typeof Output>,
) => {
  switch (step.readiness) {
    case "ready":
      return output.success(`  + ${step.label}`);
    case "warn":
      return output.warn(`  \u26A0 ${step.label} (${step.warnMessage})`);
    case "error":
      return output.error(`  \u2717 ${step.label} (${step.errorMessage})`);
  }
};

const renderCompletedStep = (
  step: CompletedJobStep,
  output: ServiceMap.Service.Shape<typeof Output>,
  verbosity: { readonly verbose: boolean; readonly debug: boolean },
) => {
  switch (step.result.result) {
    case "success": {
      const suffix = step.result.message.length > 0 ? ` (${step.result.message})` : "";
      return output.success(`  \u2713 ${step.label}${suffix}`);
    }
    case "error": {
      const renderedLines = renderAppError(step.result.error, verbosity).split("\n");
      const [firstLine, ...rest] = renderedLines;
      const first = firstLine ?? step.result.message;
      const headline = first.startsWith("\u2717 ") ? first.slice(2) : first;

      return Effect.gen(function* () {
        yield* output.error(`  \u2717 ${step.label}: ${headline}`);
        for (const line of rest) {
          yield* output.error(`    ${line.trimStart()}`);
        }
      });
    }
  }
};

const renderPlannedSummary = (
  allSteps: ReadonlyArray<PlannedJobStep>,
  output: ServiceMap.Service.Shape<typeof Output>,
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
      yield* output.message(parts.join(", "));
    }
  });

const renderCompletedSummary = (
  allSteps: ReadonlyArray<CompletedJobStep>,
  output: ServiceMap.Service.Shape<typeof Output>,
) =>
  Effect.gen(function* () {
    const successCount = allSteps.filter((s) => s.result.result === "success").length;
    const failCount = allSteps.filter((s) => s.result.result === "error").length;

    const parts: string[] = [];
    if (successCount > 0) parts.push(`${successCount} applied`);
    if (failCount > 0) parts.push(`${failCount} failed`);

    if (parts.length > 0) {
      yield* output.message(parts.join(", "));
    }
  });

/**
 * Shared plan display module.
 *
 * Renders a human-readable summary of a Plan or ExecutedPlan via the CliRenderer service.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as ServiceMap from "effect/ServiceMap";
import { CliRenderer } from "../cli-renderer/index.js";
import { Verbosity } from "../cli-flags/index.js";
import { renderAppError } from "../app-error/index.js";
import type { CompletedJobStep, ExecutedPlan, Plan, PlannedJobStep } from "./plan.js";

// -----------------------------------------------------------------------------
// Implementation
// -----------------------------------------------------------------------------

/**
 * Display a plan or executed plan summary via the CliRenderer service.
 *
 * Reads verbosity settings from the `Verbosity` service.
 */
export const displayPlan = (plan: Plan | ExecutedPlan) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    const v = yield* Verbosity;
    const verbosity: { readonly verbose: boolean; readonly debug: boolean } = {
      verbose: v.isAtLeast("verbose"),
      debug: v.isAtLeast("debug"),
    };

    // Heading
    const heading = Option.match(plan.description, {
      onNone: () => plan.name,
      onSome: (desc) => `${plan.name}\n${desc}`,
    });
    yield* renderer.info(heading);

    // Determine if this is an executed plan using _tag discriminant
    const firstJob = plan.jobs[0];
    if (!firstJob || firstJob.steps.length === 0) {
      return;
    }

    if (plan._tag === "ExecutedPlan") {
      const allSteps = plan.jobs.flatMap((job) => [...job.steps]);
      for (const step of allSteps) {
        yield* renderCompletedStep(step, renderer, verbosity);
      }
      yield* renderCompletedSummary(allSteps, renderer);
    } else {
      const allSteps = plan.jobs.flatMap((job) => [...job.steps]);
      for (const step of allSteps) {
        yield* renderPlannedStep(step, renderer);
      }
      yield* renderPlannedSummary(allSteps, renderer);
    }
  });

const renderPlannedStep = (
  step: PlannedJobStep,
  renderer: ServiceMap.Service.Shape<typeof CliRenderer>,
) => {
  switch (step.readiness) {
    case "ready":
      return renderer.success(`  + ${step.label}`);
    case "warn":
      return renderer.warn(`  \u26A0 ${step.label} (${step.warnMessage})`);
    case "error":
      return renderer.error(`  \u2717 ${step.label} (${step.errorMessage})`);
  }
};

const renderCompletedStep = (
  step: CompletedJobStep,
  renderer: ServiceMap.Service.Shape<typeof CliRenderer>,
  verbosity: { readonly verbose: boolean; readonly debug: boolean },
) => {
  switch (step.result.result) {
    case "success": {
      const suffix = step.result.message.length > 0 ? ` (${step.result.message})` : "";
      return renderer.success(`  \u2713 ${step.label}${suffix}`);
    }
    case "error": {
      const renderedLines = renderAppError(step.result.error, verbosity).split("\n");
      const [firstLine, ...rest] = renderedLines;
      const first = firstLine ?? step.result.message;
      const headline = first.startsWith("\u2717 ") ? first.slice(2) : first;

      return Effect.gen(function* () {
        yield* renderer.error(`  \u2717 ${step.label}: ${headline}`);
        for (const line of rest) {
          yield* renderer.error(`    ${line.trimStart()}`);
        }
      });
    }
  }
};

const renderPlannedSummary = (
  allSteps: ReadonlyArray<PlannedJobStep>,
  renderer: ServiceMap.Service.Shape<typeof CliRenderer>,
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
      yield* renderer.message(parts.join(", "));
    }
  });

const renderCompletedSummary = (
  allSteps: ReadonlyArray<CompletedJobStep>,
  renderer: ServiceMap.Service.Shape<typeof CliRenderer>,
) =>
  Effect.gen(function* () {
    const successCount = allSteps.filter((s) => s.result.result === "success").length;
    const failCount = allSteps.filter((s) => s.result.result === "error").length;

    const parts: string[] = [];
    if (successCount > 0) parts.push(`${successCount} applied`);
    if (failCount > 0) parts.push(`${failCount} failed`);

    if (parts.length > 0) {
      yield* renderer.message(parts.join(", "));
    }
  });

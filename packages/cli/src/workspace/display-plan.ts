/**
 * Shared plan display module.
 *
 * Renders a human-readable summary of any Plan<Op> via the Log service,
 * without knowledge of the specific operation type.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { renderCliError, type RenderCliErrorOptions } from "../cli-error/index.js";
import { Log } from "../tui/index.js";
import type { JobStep, Plan } from "./plan.js";

// -----------------------------------------------------------------------------
// Implementation
// -----------------------------------------------------------------------------

const defaultVerbosity: RenderCliErrorOptions = {
  verbose: false,
  debug: false,
};

const extensionTypeOrder = [
  "skills",
  "commands",
  "packs",
  "mcp-servers",
  "reconciliation",
  "other",
] as const;

type ExtensionTypeBucket = (typeof extensionTypeOrder)[number];

const getExtensionTypeBucket = (operationName: string): ExtensionTypeBucket => {
  if (
    operationName === "read-recover-lockfile" ||
    operationName === "reconcile-materialize-lockfile"
  ) {
    return "reconciliation";
  }
  if (
    operationName.endsWith("-skill") ||
    operationName === "copy-skill" ||
    operationName === "enable-skill" ||
    operationName === "disable-skill" ||
    operationName === "rename-skill" ||
    operationName === "new-skill"
  ) {
    return "skills";
  }
  if (operationName.endsWith("-command")) {
    return "commands";
  }
  if (
    operationName.endsWith("-pack") ||
    operationName === "add-to-pack" ||
    operationName === "remove-from-pack"
  ) {
    return "packs";
  }
  if (operationName.endsWith("-mcp-server")) {
    return "mcp-servers";
  }
  return "other";
};

const collectTypeCounts = <Op>(allSteps: ReadonlyArray<JobStep<Op>>) => {
  const counts = new Map<ExtensionTypeBucket, number>();
  for (const step of allSteps) {
    const opName = (step.operation as { readonly name: string }).name;
    const bucket = getExtensionTypeBucket(opName);
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }
  return counts;
};

export interface DisplayPlanOptions {
  readonly verbosity?: RenderCliErrorOptions;
}

/**
 * Display a plan summary via the Log service.
 *
 * Uses `step.label` for human-readable output — never inspects `step.operation`.
 */
export const displayPlan = <Op>(plan: Plan<Op>, options: DisplayPlanOptions = {}) =>
  Effect.gen(function* () {
    const log = yield* Log;
    const verbosity = options.verbosity ?? defaultVerbosity;

    const allSteps = Array.flatMap(plan.jobs, (job) => [...job.steps]);

    const isApplied = allSteps.length > 0 && allSteps[0]!._tag === "JobStepResult";

    // Heading
    const heading = Option.match(plan.description, {
      onNone: () => plan.name,
      onSome: (desc) => `${plan.name}\n${desc}`,
    });
    yield* log.info(heading);

    // Render each step
    for (const step of allSteps) {
      yield* renderStep(step, log, verbosity);
    }

    // Summary
    yield* renderSummary(allSteps, isApplied, log);
  });

const renderStep = <Op>(step: JobStep<Op>, log: Log["Type"], verbosity: RenderCliErrorOptions) => {
  if (step._tag === "JobStepResult") {
    switch (step.result.result) {
      case "success":
        return log.success(`  \u2713 ${step.label}`);
      case "no-op":
        return log.warn(`  - ${step.label} (${step.result.message})`);
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
  }

  // PlannedJobStep — branch on readiness.status
  switch (step.readiness.status) {
    case "ready":
      return Option.match(step.readiness.message, {
        onNone: () => log.success(`  + ${step.label}`),
        onSome: (msg) => log.success(`  + ${step.label} (${msg})`),
      });
    case "skip":
      return log.warn(`  - ${step.label} (${step.readiness.message})`);
    case "warn":
      return log.warn(`  \u26A0 ${step.label} (${step.readiness.message})`);
    case "error":
      return log.error(`  \u2717 ${step.label} (${step.readiness.message})`);
  }
};

const renderSummary = <Op>(
  allSteps: ReadonlyArray<JobStep<Op>>,
  isApplied: boolean,
  log: Log["Type"],
) => {
  return Effect.gen(function* () {
    if (isApplied) {
      const successCount = Array.filter(
        allSteps,
        (s) => s._tag === "JobStepResult" && s.result.result === "success",
      ).length;
      const skipCount = Array.filter(
        allSteps,
        (s) => s._tag === "JobStepResult" && s.result.result === "no-op",
      ).length;
      const failCount = Array.filter(
        allSteps,
        (s) => s._tag === "JobStepResult" && s.result.result === "error",
      ).length;

      const parts: string[] = [];
      if (successCount > 0) parts.push(`${successCount} applied`);
      if (skipCount > 0) parts.push(`${skipCount} skipped`);
      if (failCount > 0) parts.push(`${failCount} failed`);

      if (parts.length > 0) {
        yield* log.message(parts.join(", "));
      }
    } else {
      // Unapplied plan — count by readiness
      const readyCount = Array.filter(
        allSteps,
        (s) => s._tag === "PlannedJobStep" && s.readiness.status === "ready",
      ).length;
      const skipCount = Array.filter(
        allSteps,
        (s) => s._tag === "PlannedJobStep" && s.readiness.status === "skip",
      ).length;
      const warnCount = Array.filter(
        allSteps,
        (s) => s._tag === "PlannedJobStep" && s.readiness.status === "warn",
      ).length;
      const errorCount = Array.filter(
        allSteps,
        (s) => s._tag === "PlannedJobStep" && s.readiness.status === "error",
      ).length;

      const parts: string[] = [];
      if (readyCount > 0) parts.push(`${readyCount} to apply`);
      if (skipCount > 0) parts.push(`${skipCount} to skip`);
      if (errorCount > 0) parts.push(`${errorCount} error${errorCount > 1 ? "s" : ""}`);
      if (warnCount > 0) parts.push(`${warnCount} warning${warnCount > 1 ? "s" : ""}`);

      if (parts.length > 0) {
        yield* log.message(parts.join(", "));
      }
    }

    const typeCounts = collectTypeCounts(allSteps);
    const orderedCounts = extensionTypeOrder
      .filter((bucket) => (typeCounts.get(bucket) ?? 0) > 0)
      .map((bucket) => `${bucket}=${typeCounts.get(bucket) ?? 0}`);
    if (orderedCounts.length > 0) {
      yield* log.message(`by type: ${orderedCounts.join(", ")}`);
    }
  });
};

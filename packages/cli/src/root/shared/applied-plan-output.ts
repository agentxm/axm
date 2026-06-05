import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Verbosity } from "@agentxm/client-core/unstable/cli-flags";
import { CliRenderer, count } from "@agentxm/client-core/unstable/cli-renderer";
import type { SuggestedAction } from "@agentxm/client-core/unstable/cli-runtime";
import type {
  CompletedJobStep,
  ExecutedPlan,
  JobStepArtifact,
  PlanResolution,
} from "@agentxm/client-core/unstable/plan";
import { emitPlanResolutionResult } from "../../json-output.js";

const formatArtifactTargets = (artifact: JobStepArtifact): string => {
  if (artifact.targets === undefined || artifact.targets.length === 0) {
    return artifact.path;
  }
  return artifact.targets
    .map((target) => {
      const agents =
        target.agentIds === undefined || target.agentIds.length === 0
          ? undefined
          : ` [${target.agentIds.join(", ")}]`;
      return `${target.path} (${target.change})${agents ?? ""}`;
    })
    .join(", ");
};

const formatCompletedArtifactStep = (step: CompletedJobStep): string | undefined => {
  if (step.result.result !== "success" || step.result.artifact === undefined) return undefined;
  const artifact = step.result.artifact;
  const details = [
    artifact.change,
    artifact.fileCount === undefined ? undefined : count(artifact.fileCount, "file"),
    formatArtifactTargets(artifact),
  ].filter((part): part is string => part !== undefined && part.length > 0);
  return `${step.label}   ${details.join("   ")}`;
};

const formatFailedStep = (step: CompletedJobStep): string | undefined => {
  if (step.result.result !== "error") return undefined;
  const message = step.result.message.trim();
  return message.length === 0
    ? `${step.label}   failed   ${step.result.error.code}`
    : `${step.label}   failed   ${message}`;
};

export const summarizeExecutedArtifacts = (plan: ExecutedPlan): string | undefined => {
  const rows = plan.jobs
    .flatMap((job) => job.steps)
    .flatMap((step) => {
      const summary = formatCompletedArtifactStep(step);
      return summary === undefined ? [] : [summary];
    });
  return rows.length === 0 ? undefined : rows.join("\n");
};

const summarizeExecutedOutcome = (plan: ExecutedPlan): string | undefined => {
  const rows = plan.jobs
    .flatMap((job) => job.steps)
    .flatMap((step) => {
      const artifactSummary = formatCompletedArtifactStep(step);
      if (artifactSummary !== undefined) return [artifactSummary];
      const failedSummary = formatFailedStep(step);
      return failedSummary === undefined ? [] : [failedSummary];
    });
  return rows.length === 0 ? undefined : rows.join("\n");
};

const hasFailedSteps = (plan: ExecutedPlan): boolean =>
  plan.jobs.some((job) => job.steps.some((step) => step.result.result === "error"));

const failureHeadline = (headline: string): string => {
  if (headline.startsWith("Installed ")) {
    return `Failed to install ${headline.slice("Installed ".length)}`;
  }
  if (headline.startsWith("Uninstalled ")) {
    return `Failed to uninstall ${headline.slice("Uninstalled ".length)}`;
  }
  if (headline.startsWith("Enabled ")) {
    return `Failed to enable ${headline.slice("Enabled ".length)}`;
  }
  if (headline.startsWith("Disabled ")) {
    return `Failed to disable ${headline.slice("Disabled ".length)}`;
  }
  if (headline.startsWith("Pruned ")) {
    return `Failed to prune ${headline.slice("Pruned ".length)}`;
  }
  return `Failed: ${headline}`;
};

const defaultFailureSuggestions: ReadonlyArray<SuggestedAction> = [
  { description: "Review the failed step above, fix the source or workspace state, and retry." },
];

export const unchangedPlanHeadline = (resolution: PlanResolution, fallback: string): string => {
  if (resolution._tag !== "ExecutedPlan") return fallback;

  const unchangedStep = resolution.jobs
    .flatMap((job) => job.steps)
    .find(
      (step) => step.result.result === "success" && step.result.artifact?.change === "unchanged",
    );
  if (unchangedStep === undefined || unchangedStep.result.result !== "success") {
    return fallback;
  }

  const version = unchangedStep.result.artifact?.version;
  return `Already up to date — ${unchangedStep.label}${version === undefined ? "" : ` ${version}`}`;
};

export const emitAppliedPlanOutcome = <TCommand extends string>(args: {
  readonly command: TCommand;
  readonly headline: string;
  readonly resolution: PlanResolution;
  readonly suggestions: ReadonlyArray<SuggestedAction>;
  readonly failureSuggestions?: ReadonlyArray<SuggestedAction>;
}) =>
  Effect.gen(function* () {
    const failed =
      args.resolution._tag === "ExecutedPlan" ? hasFailedSteps(args.resolution) : false;
    const suggestions = failed
      ? (args.failureSuggestions ?? defaultFailureSuggestions)
      : args.suggestions;
    const summary =
      args.resolution._tag === "ExecutedPlan"
        ? summarizeExecutedOutcome(args.resolution)
        : undefined;
    const resultOptions = summary === undefined ? { suggestions } : { summary, suggestions };
    const emitted = yield* emitPlanResolutionResult(
      args.command,
      args.resolution,
      args.resolution._tag === "ExecutedPlan" ? resultOptions : undefined,
    );

    if (args.resolution._tag === "ExecutedPlan") {
      const renderer = yield* CliRenderer;
      const verbosity = yield* Verbosity;
      if (verbosity.isAtLeast("verbose")) {
        const description = Option.getOrUndefined(args.resolution.description);
        if (description !== undefined && description.length > 0) {
          yield* renderer.info(description);
        }
      }
      const successOptions =
        summary === undefined
          ? { suggestions, withoutSuggestions: emitted }
          : { summary, suggestions, withoutSuggestions: emitted };
      if (failed) {
        if (verbosity.level === "quiet") {
          yield* renderer.error(failureHeadline(args.headline));
          return;
        }
        yield* renderer.error(failureHeadline(args.headline), {
          suggestions,
          withoutSuggestions: emitted,
        });
        if (summary !== undefined) {
          yield* renderer.info(summary);
        }
        return;
      }
      yield* renderer.success(
        args.headline,
        verbosity.level === "quiet" ? undefined : successOptions,
      );
    }
  });

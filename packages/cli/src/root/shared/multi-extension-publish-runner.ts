import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { makeAppError, type AppError } from "@agentxm/client-core/unstable/app-error";
import { CliRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { Verbosity } from "@agentxm/client-core/unstable/cli-flags";
import {
  setCommandSemanticProperties,
  summarizeCommandOutcome,
  type SubjectType,
} from "@agentxm/client-core/unstable/cli-runtime";
import type {
  CompletedJobStep,
  JobStepArtifact,
  JobStepResult,
  Plan,
  PlanResolution,
  PlannedJobStep,
} from "@agentxm/client-core/unstable/plan";
import { previewOrApplyPlan } from "@agentxm/client-core/unstable/plan";
import {
  emitPlanResolutionResult,
  emitPublishResult,
  planResolutionToSummary,
  type PublishResult,
  type PublishResultItem,
} from "../../json-output.js";
import { publishSuccessRender } from "./publish-success.js";
import type { PublishPreflightDecision } from "./publish-preflight.js";
import {
  skippedExistingPublishResult,
  wrapPublishStepForSkipExistingRace,
} from "./publish-skip-existing.js";

export interface PublishOperationResult {
  readonly result: string;
  readonly message: string;
  readonly error?: AppError;
  readonly links?: { readonly html: string };
  readonly artifact?: JobStepArtifact;
}

export const publishOperationResultToJobStepResult = (
  result: PublishOperationResult,
): JobStepResult =>
  result.result === "error" && result.error !== undefined
    ? { result: "error", message: result.message, error: result.error }
    : {
        result: "success",
        message: result.message,
        ...(result.links !== undefined ? { links: result.links } : {}),
        ...(result.artifact !== undefined ? { artifact: result.artifact } : {}),
      };

const publishStepLabel = (fqn: string): string => `Publish ${fqn}`;
const skipStepLabel = (fqn: string): string => `Skip ${fqn}`;

const skippedStep = (
  decision: Extract<PublishPreflightDecision, { readonly action: "skip" }>,
): PlannedJobStep => ({
  readiness: "ready",
  label: skipStepLabel(decision.fqn),
  run: Effect.succeed(skippedExistingPublishResult(decision, "project")),
});

const stepByLabel = (resolution: PlanResolution, label: string): CompletedJobStep | undefined => {
  if (resolution._tag !== "ExecutedPlan") return undefined;
  return resolution.jobs.flatMap((job) => job.steps).find((step) => step.label === label);
};

const publishResultItem = (
  decision: PublishPreflightDecision,
  action: PublishResultItem["action"],
  step: CompletedJobStep | undefined,
): PublishResultItem => {
  const base = {
    owner: decision.identity.owner,
    type: decision.identity.type,
    name: decision.identity.name,
    version: decision.identity.version,
    action,
  };

  if (step === undefined) {
    return decision.action === "skip" ? { ...base, reason: decision.reason } : base;
  }

  if (step.result.result === "error") {
    return {
      owner: decision.identity.owner,
      type: decision.identity.type,
      name: decision.identity.name,
      version: decision.identity.version,
      action: "error",
      status: "failed",
      message: step.result.message,
    };
  }

  return {
    ...base,
    ...(decision.action === "skip" ? { reason: decision.reason } : {}),
    status: "success",
    ...(step.result.message.length > 0 ? { message: step.result.message } : {}),
    ...(step.result.links !== undefined ? { links: step.result.links } : {}),
  };
};

const toPublishResult = (args: {
  readonly decisions: ReadonlyArray<PublishPreflightDecision>;
  readonly preview: boolean;
  readonly resolution: PlanResolution;
}): PublishResult => ({
  mode: args.preview ? "preview" : "apply",
  results: args.decisions.map((decision) => {
    switch (decision.action) {
      case "publish":
        return publishResultItem(
          decision,
          "publish",
          stepByLabel(args.resolution, publishStepLabel(decision.fqn)),
        );
      case "skip":
        return publishResultItem(
          decision,
          "skip",
          stepByLabel(args.resolution, skipStepLabel(decision.fqn)),
        );
    }
  }),
});

export const runMultiExtensionPublishPlan = Effect.fn("Publish.runMultiExtensionPublishPlan")(
  function* (args: {
    readonly commandName: string;
    readonly planName: string;
    readonly subjectType: SubjectType;
    readonly extensionNames: ReadonlyArray<string>;
    readonly registryName: string;
    readonly registryUrl?: string;
    readonly singularLabel: string;
    readonly pluralLabel: string;
    readonly yes: boolean;
    readonly force: boolean;
    readonly preview: boolean;
    readonly makeStep: (extensionName: string) => PlannedJobStep;
    readonly preflightDecisions?: ReadonlyArray<PublishPreflightDecision>;
    readonly skipExisting?: boolean;
    readonly includeSingleFailureSuggestions?: boolean;
  }) {
    const renderer = yield* CliRenderer;
    const verbosity = yield* Verbosity;
    const steps =
      args.preflightDecisions === undefined
        ? args.extensionNames.map(args.makeStep)
        : args.preflightDecisions.map((decision) => {
            if (decision.action === "skip") return skippedStep(decision);

            const step = args.makeStep(decision.fqn);
            if (args.skipExisting !== true || args.registryUrl === undefined) return step;
            return wrapPublishStepForSkipExistingRace({
              step,
              registryUrl: args.registryUrl,
              target: decision,
              scope: "project",
            });
          });
    const description =
      args.extensionNames.length === 1
        ? `Publish ${args.extensionNames[0]} to registry "${args.registryName}"`
        : `Publish ${args.extensionNames.length} ${args.pluralLabel} to registry "${args.registryName}"`;

    const plan: Plan = {
      _tag: "Plan",
      name: args.planName,
      description: Option.some(description),
      jobs: [{ steps, concurrency: 1 }],
    };

    const resolvedPlan = yield* previewOrApplyPlan(plan, {
      yes: args.yes,
      force: args.force,
      preview: args.preview,
      displayApplied: false,
    });

    const failedStepErrors =
      resolvedPlan._tag === "ExecutedPlan"
        ? resolvedPlan.jobs
            .flatMap((job) => job.steps)
            .flatMap((step) => (step.result.result === "error" ? [step.result] : []))
        : [];

    if (args.preflightDecisions !== undefined) {
      const success =
        resolvedPlan._tag === "ExecutedPlan" ? publishSuccessRender(resolvedPlan) : undefined;
      const emitted = yield* emitPublishResult(
        args.commandName,
        toPublishResult({
          decisions: args.preflightDecisions,
          preview: args.preview,
          resolution: resolvedPlan,
        }),
        {
          ...(success?.suggestions !== undefined ? { suggestions: success.suggestions } : {}),
        },
      );
      if (emitted && failedStepErrors.length === 0) {
        return;
      }
    }

    if (failedStepErrors.length > 0) {
      const [singleFailure] = failedStepErrors;
      if (
        failedStepErrors.length === 1 &&
        singleFailure !== undefined &&
        singleFailure.error.metadata?.response !== undefined
      ) {
        return yield* singleFailure.error;
      }

      const suggestions =
        args.includeSingleFailureSuggestions === true &&
        failedStepErrors.length === 1 &&
        singleFailure !== undefined
          ? (singleFailure.error.suggestions ?? [])
          : undefined;

      return yield* makeAppError({
        code: "internal",
        detail: `Failed to publish ${failedStepErrors.length} ${
          failedStepErrors.length === 1 ? args.singularLabel : args.pluralLabel
        }`,
        ...(suggestions !== undefined ? { suggestions } : {}),
      });
    }

    yield* setCommandSemanticProperties(
      summarizeCommandOutcome(
        planResolutionToSummary(resolvedPlan, {
          subjectType: args.subjectType,
          sourceKind: "registry",
        }),
      ),
    );
    const success =
      resolvedPlan._tag === "ExecutedPlan" ? publishSuccessRender(resolvedPlan) : undefined;
    const emitted = yield* emitPlanResolutionResult(args.commandName, resolvedPlan, {
      ...(success?.suggestions !== undefined ? { suggestions: success.suggestions } : {}),
    });
    if (emitted) {
      return;
    }

    if (success !== undefined) {
      yield* renderer.success(
        success.message,
        verbosity.level === "quiet"
          ? undefined
          : {
              ...(success.suggestions !== undefined ? { suggestions: success.suggestions } : {}),
            },
      );
    }
  },
);

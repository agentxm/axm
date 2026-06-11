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
  JobStepArtifact,
  JobStepResult,
  Plan,
  PlannedJobStep,
} from "@agentxm/client-core/unstable/plan";
import { previewOrApplyPlan } from "@agentxm/client-core/unstable/plan";
import { emitPlanResolutionResult, planResolutionToSummary } from "../../json-output.js";
import { publishSuccessRender } from "./publish-success.js";

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

export const runMultiExtensionPublishPlan = Effect.fn("Publish.runMultiExtensionPublishPlan")(
  function* (args: {
    readonly commandName: string;
    readonly planName: string;
    readonly subjectType: SubjectType;
    readonly extensionNames: ReadonlyArray<string>;
    readonly registryName: string;
    readonly singularLabel: string;
    readonly pluralLabel: string;
    readonly yes: boolean;
    readonly force: boolean;
    readonly preview: boolean;
    readonly makeStep: (extensionName: string) => PlannedJobStep;
    readonly includeSingleFailureSuggestions?: boolean;
  }) {
    const renderer = yield* CliRenderer;
    const verbosity = yield* Verbosity;
    const steps = args.extensionNames.map(args.makeStep);
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

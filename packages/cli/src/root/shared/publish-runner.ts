import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import { CliRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { Verbosity } from "@agentxm/client-core/unstable/cli-flags";
import {
  setCommandSemanticProperties,
  summarizeCommandOutcome,
  type SourceKind,
  type SubjectType,
} from "@agentxm/client-core/unstable/cli-runtime";
import {
  previewOrApplyPlan,
  type Plan,
  type PlanResolution,
  type PlannedJobStep,
} from "@agentxm/client-core/unstable/plan";
import { emitPlanResolutionResult, planResolutionToSummary } from "../../json-output.js";
import { checkPublishVersionPreflight } from "./publish-preflight.js";
import { type TargetRegistry } from "./publish-resolution.js";
import { publishSuccessRender } from "./publish-success.js";

interface RunMultiExtensionPublishPlanArgs {
  readonly command: string;
  readonly planName: string;
  readonly subjectType: SubjectType;
  readonly sourceKind?: SourceKind;
  readonly noun: string;
  readonly pluralNoun: string;
  readonly preflightType: Parameters<typeof checkPublishVersionPreflight>[0]["type"];
  readonly extensionNames: ReadonlyArray<string>;
  readonly targetRegistry: TargetRegistry;
  readonly yes: boolean;
  readonly force: boolean;
  readonly preview: boolean;
  readonly includeSingleFailureSuggestions?: boolean;
  readonly makeStep: (extensionName: string) => PlannedJobStep;
}

const failedPublishResults = (plan: PlanResolution) =>
  plan._tag === "ExecutedPlan"
    ? plan.jobs
        .flatMap((job) => job.steps)
        .flatMap((step) => (step.result.result === "error" ? [step.result] : []))
    : [];

export const runMultiExtensionPublishPlan = Effect.fn("PublishRunner.runMultiExtensionPlan")(
  function* (args: RunMultiExtensionPublishPlanArgs) {
    const renderer = yield* CliRenderer;
    const verbosity = yield* Verbosity;

    yield* Effect.forEach(
      args.extensionNames,
      (extName) =>
        checkPublishVersionPreflight({
          fqn: extName,
          type: args.preflightType,
          registryName: args.targetRegistry.registryName,
          registryUrl: args.targetRegistry.registryUrl,
          force: args.force,
        }),
      { concurrency: "unbounded" },
    );

    const description =
      args.extensionNames.length === 1
        ? `Publish ${args.extensionNames[0]} to registry "${args.targetRegistry.registryName}"`
        : `Publish ${args.extensionNames.length} ${args.pluralNoun} to registry "${args.targetRegistry.registryName}"`;

    const plan: Plan = {
      _tag: "Plan",
      name: args.planName,
      description: Option.some(description),
      jobs: [{ steps: args.extensionNames.map(args.makeStep), concurrency: 1 as const }],
    };

    const resolvedPlan = yield* previewOrApplyPlan(plan, {
      yes: args.yes,
      force: args.force,
      preview: args.preview,
      displayApplied: false,
    });

    const failedStepErrors = failedPublishResults(resolvedPlan);
    if (failedStepErrors.length > 0) {
      const [singleFailure] = failedStepErrors;
      if (
        failedStepErrors.length === 1 &&
        singleFailure !== undefined &&
        singleFailure.error.metadata?.response !== undefined
      ) {
        return yield* singleFailure.error;
      }

      return yield* makeAppError({
        code: "internal",
        detail: `Failed to publish ${failedStepErrors.length} ${args.noun}${failedStepErrors.length === 1 ? "" : "s"}`,
        ...(args.includeSingleFailureSuggestions === true &&
        failedStepErrors.length === 1 &&
        singleFailure !== undefined
          ? { suggestions: singleFailure.error.suggestions ?? [] }
          : {}),
      });
    }

    yield* setCommandSemanticProperties(
      summarizeCommandOutcome(
        planResolutionToSummary(resolvedPlan, {
          subjectType: args.subjectType,
          ...(args.sourceKind !== undefined ? { sourceKind: args.sourceKind } : {}),
        }),
      ),
    );
    const success =
      resolvedPlan._tag === "ExecutedPlan" ? publishSuccessRender(resolvedPlan) : undefined;
    const emitted = yield* emitPlanResolutionResult(args.command, resolvedPlan, {
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

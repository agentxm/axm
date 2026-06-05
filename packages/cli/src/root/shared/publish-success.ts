import type { SuggestedAction } from "@agentxm/client-core/unstable/cli-runtime";
import { parseExtensionFqnParts } from "@agentxm/client-core/unstable/extensions";
import type { CompletedJobStep, PlanResolution } from "@agentxm/client-core/unstable/plan";

type LinkedSuccessStep = CompletedJobStep & {
  readonly result: {
    readonly result: "success";
    readonly message: string;
    readonly links: { readonly html: string };
  };
};

export interface PublishSuccessRender {
  readonly message: string;
  readonly suggestions?: ReadonlyArray<SuggestedAction>;
}

const hasLinks = (step: CompletedJobStep): step is LinkedSuccessStep =>
  step.result.result === "success" && step.result.links !== undefined;

const linkedSuccessfulSteps = (resolution: PlanResolution): ReadonlyArray<LinkedSuccessStep> => {
  if (resolution._tag !== "ExecutedPlan") {
    return [];
  }

  return resolution.jobs.flatMap((job) => job.steps).filter(hasLinks);
};

const successfulMessages = (resolution: PlanResolution): ReadonlyArray<string> => {
  if (resolution._tag !== "ExecutedPlan") {
    return [];
  }

  return resolution.jobs
    .flatMap((job) => job.steps)
    .filter((step) => step.result.result === "success")
    .map((step) => step.result.message);
};

const successfulSteps = (resolution: PlanResolution): ReadonlyArray<CompletedJobStep> => {
  if (resolution._tag !== "ExecutedPlan") {
    return [];
  }

  return resolution.jobs
    .flatMap((job) => job.steps)
    .filter((step) => step.result.result === "success");
};

const publishedFqnFromStep = (step: CompletedJobStep): string | undefined => {
  const prefix = "Publish ";
  if (!step.label.startsWith(prefix)) {
    return undefined;
  }

  const fqn = step.label.slice(prefix.length);
  return parseExtensionFqnParts(fqn) === undefined ? undefined : fqn;
};

const viewSuggestions = (steps: ReadonlyArray<CompletedJobStep>): ReadonlyArray<SuggestedAction> =>
  steps.flatMap((step) => {
    const fqn = publishedFqnFromStep(step);
    return fqn === undefined
      ? []
      : [{ description: "View published metadata", cmd: `axm view ${fqn}` }];
  });

export const publishSuccessRender = (resolution: PlanResolution): PublishSuccessRender => {
  const linkedSteps = linkedSuccessfulSteps(resolution);

  if (linkedSteps.length === 0) {
    const messages = successfulMessages(resolution);
    const suggestions = viewSuggestions(successfulSteps(resolution));

    return {
      message: messages.length === 0 ? "Publish complete" : messages.join("\n"),
      ...(suggestions.length > 0 ? { suggestions } : {}),
    };
  }

  return {
    message: linkedSteps
      .flatMap((step) => [step.result.message, `→ ${step.result.links.html}`])
      .join("\n"),
    suggestions: linkedSteps.map((step) => ({
      description: "View in browser",
      url: step.result.links.html,
    })),
  };
};

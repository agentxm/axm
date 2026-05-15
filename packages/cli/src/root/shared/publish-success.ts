import type { SuggestedAction } from "@agentxm/client-core/unstable/cli-runtime";
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

export const publishSuccessRender = (resolution: PlanResolution): PublishSuccessRender => {
  const linkedSteps = linkedSuccessfulSteps(resolution);

  if (linkedSteps.length === 0) {
    return { message: "Done" };
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

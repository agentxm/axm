import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { CliRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import type {
  SuggestedAction,
  CommandOutcomeSummary,
  SourceKind,
  SubjectType,
} from "@agentxm/client-core/unstable/cli-runtime";
import type {
  CompletedJobStep,
  ExecutedPlan,
  PlanResolution,
  PlannedJobStep,
} from "@agentxm/client-core/unstable/plan";

const StepStatusSchema = Schema.Literals([
  "ready",
  "warning",
  "error",
  "applied",
  "unchanged",
  "failed",
  "blocked",
] as const).annotate({
  identifier: "StepStatus",
  title: "Step Status",
  description:
    "Execution status of a plan step: ready, warning, error, applied, unchanged, failed, or blocked.",
});

const StepArtifactTargetSchema = Schema.Struct({
  path: Schema.String,
  change: Schema.Literals(["created", "updated", "unchanged"] as const),
  agentIds: Schema.optional(Schema.Array(Schema.String)),
}).annotate({
  identifier: "StepArtifactTarget",
  title: "Plan Step Artifact Target",
  description: "One materialized target surface for a plan step artifact.",
});

const StepArtifactSchema = Schema.Struct({
  path: Schema.String,
  scope: Schema.Literals(["project", "user"] as const),
  agents: Schema.optional(Schema.Array(Schema.String)),
  version: Schema.optional(Schema.String),
  change: Schema.Literals(["created", "updated", "unchanged"] as const),
  previousVersion: Schema.optional(Schema.String),
  fileCount: Schema.optional(Schema.Number),
  targets: Schema.optional(Schema.Array(StepArtifactTargetSchema)),
}).annotate({
  identifier: "StepArtifact",
  title: "Plan Step Artifact",
  description: "Optional artifact metadata describing what changed and where.",
});

const StepSchema = Schema.Struct({
  label: Schema.String,
  status: StepStatusSchema,
  message: Schema.optional(Schema.String),
  code: Schema.optional(Schema.String),
  artifact: Schema.optional(StepArtifactSchema),
  links: Schema.optional(
    Schema.Struct({
      html: Schema.String,
    }),
  ),
}).annotate({
  identifier: "Step",
  title: "Plan Step",
  description:
    "A single step in a plan resolution result with label, status, and optional details.",
});
type Step = typeof StepSchema.Type;

export const PlanResolutionResultSchema = Schema.Struct({
  outcome: Schema.Literals(["previewed", "cancelled", "applied", "no-op"] as const).annotate({
    identifier: "PlanOutcome",
    title: "Plan Outcome",
    description: "Final outcome of a plan resolution: previewed, cancelled, applied, or no-op.",
  }),
  planName: Schema.String,
  planDescription: Schema.optional(Schema.String),
  message: Schema.optional(Schema.String),
  totalSteps: Schema.Number,
  readyCount: Schema.Number,
  warningCount: Schema.Number,
  errorCount: Schema.Number,
  appliedCount: Schema.Number,
  failedCount: Schema.Number,
  blockedCount: Schema.Number,
  steps: Schema.Array(StepSchema),
}).annotate({
  identifier: "PlanResolutionResult",
  title: "Plan Resolution Result",
  description:
    "Result of a plan resolution including outcome, step counts, and individual step details.",
});
export type PlanResolutionResult = typeof PlanResolutionResultSchema.Type;

const PlanResolutionDocumentFields = {
  result: PlanResolutionResultSchema,
} satisfies Schema.Struct.Fields;

const plannedStepToStep = (step: PlannedJobStep): Step => {
  switch (step.readiness) {
    case "ready":
      return { label: step.label, status: "ready" };
    case "warn":
      return {
        label: step.label,
        status: "warning",
        message: step.warnMessage,
      };
    case "error":
      return {
        label: step.label,
        status: "error",
        message: step.errorMessage,
      };
  }
};

const completedStepToStep = (step: CompletedJobStep): Step => {
  if (step.result.result === "success") {
    const status = step.result.artifact?.change === "unchanged" ? "unchanged" : "applied";
    return {
      label: step.label,
      status,
      ...(step.result.message.length > 0 ? { message: step.result.message } : {}),
      ...(step.result.artifact !== undefined ? { artifact: step.result.artifact } : {}),
      ...(step.result.links !== undefined ? { links: step.result.links } : {}),
    };
  }

  const code = step.result.error.code;
  return {
    label: step.label,
    status: step.result.message.includes("blocked") ? "blocked" : "failed",
    ...(step.result.message.length > 0 ? { message: step.result.message } : {}),
    code,
  };
};

const flattenExecutedSteps = (plan: ExecutedPlan): ReadonlyArray<CompletedJobStep> =>
  plan.jobs.flatMap((job) => [...job.steps]);

const planDescription = (resolution: PlanResolution): string | undefined =>
  Option.getOrUndefined(resolution.description);

export const toPlanResolutionResult = (resolution: PlanResolution): PlanResolutionResult => {
  switch (resolution._tag) {
    case "PreviewedPlan":
    case "CancelledPlan": {
      const steps = resolution.jobs.flatMap((job) => [...job.steps]).map(plannedStepToStep);
      const readyCount = steps.filter((step) => step.status === "ready").length;
      const warningCount = steps.filter((step) => step.status === "warning").length;
      const errorCount = steps.filter((step) => step.status === "error").length;
      const description = planDescription(resolution);

      return {
        outcome: resolution._tag === "PreviewedPlan" ? "previewed" : "cancelled",
        planName: resolution.name,
        ...(description !== undefined ? { planDescription: description } : {}),
        totalSteps: steps.length,
        readyCount,
        warningCount,
        errorCount,
        appliedCount: 0,
        failedCount: 0,
        blockedCount: 0,
        steps,
      };
    }
    case "ExecutedPlan": {
      const steps = flattenExecutedSteps(resolution).map(completedStepToStep);
      const appliedCount = steps.filter((step) => step.status === "applied").length;
      const failedCount = steps.filter((step) => step.status === "failed").length;
      const blockedCount = steps.filter((step) => step.status === "blocked").length;
      const description = planDescription(resolution);
      const outcome =
        appliedCount === 0 && failedCount === 0 && blockedCount === 0 ? "no-op" : "applied";

      return {
        outcome,
        planName: resolution.name,
        ...(description !== undefined ? { planDescription: description } : {}),
        totalSteps: steps.length,
        readyCount: 0,
        warningCount: 0,
        errorCount: 0,
        appliedCount,
        failedCount,
        blockedCount,
        steps,
      };
    }
  }
};

export const emitPlanResolutionResult = <TCommand extends string>(
  command: TCommand,
  resolution: PlanResolution,
  options?: {
    readonly summary?: string;
    readonly suggestions?: ReadonlyArray<SuggestedAction>;
    readonly withoutSuggestions?: boolean;
  },
) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    return yield* renderer.result(
      { result: toPlanResolutionResult(resolution) },
      Schema.Struct(PlanResolutionDocumentFields),
      options,
    );
  });

/**
 * Convert a PlanResolution to a CommandOutcomeSummary for telemetry.
 * Produces normalized outcome, counts, and optional subject/source context.
 */
export const planResolutionToSummary = (
  resolution: PlanResolution,
  files: { readonly subjectType?: SubjectType; readonly sourceKind?: SourceKind },
): CommandOutcomeSummary => {
  const result = toPlanResolutionResult(resolution);
  return {
    outcome: result.outcome,
    ...(files.subjectType !== undefined ? { subjectType: files.subjectType } : {}),
    ...(files.sourceKind !== undefined ? { sourceKind: files.sourceKind } : {}),
    ...(result.appliedCount > 0 ? { appliedCount: result.appliedCount } : {}),
    ...(result.failedCount > 0 ? { failedCount: result.failedCount } : {}),
    ...(result.blockedCount > 0 ? { blockedCount: result.blockedCount } : {}),
  };
};

export const emitNoOpResult = <TCommand extends string>(
  command: TCommand,
  args: {
    readonly planName: string;
    readonly planDescription?: string;
    readonly message: string;
    readonly suggestions?: ReadonlyArray<SuggestedAction>;
    readonly withoutSuggestions?: boolean;
  },
) => {
  const options = {
    ...(args.suggestions !== undefined ? { suggestions: args.suggestions } : {}),
    ...(args.withoutSuggestions !== undefined
      ? { withoutSuggestions: args.withoutSuggestions }
      : {}),
  };

  return Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    return yield* renderer.result(
      {
        result: {
          outcome: "no-op",
          planName: args.planName,
          ...(args.planDescription !== undefined ? { planDescription: args.planDescription } : {}),
          message: args.message,
          totalSteps: 0,
          readyCount: 0,
          warningCount: 0,
          errorCount: 0,
          appliedCount: 0,
          failedCount: 0,
          blockedCount: 0,
          steps: [],
        },
      },
      Schema.Struct(PlanResolutionDocumentFields),
      options,
    );
  });
};

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { CliRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { Verbosity } from "@agentxm/client-core/unstable/cli-flags";
import {
  type SuggestedAction,
  type CommandOutcomeSummary,
  type SourceKind,
  type SubjectType,
  getCommandSemanticProperties,
  setCommandSemanticProperties,
  summarizeCommandOutcome,
} from "@agentxm/client-core/unstable/cli-runtime";
import type {
  CompletedJobStep,
  ExecutedPlan,
  JobStepArtifact,
  PlanResolution,
  PlannedJobStep,
} from "@agentxm/client-core/unstable/plan";
import { ArtifactChangeSchema } from "@agentxm/client-core/unstable/plan";
import { serializeErrorCauseChain } from "@agentxm/client-core/unstable/app-error";
import {
  ExtensionNameSchema,
  ExtensionTypeSchema,
  HandleSchema,
} from "@agentxm/client-core/unstable/extensions";
import { VersionSchema } from "@agentxm/client-core/unstable/version-constraints";

export interface PlanResolutionResultOptions {
  readonly verbose?: boolean;
  readonly debug?: boolean;
}

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
  change: ArtifactChangeSchema,
  agentIds: Schema.optional(Schema.Array(Schema.String)),
}).annotate({
  identifier: "StepArtifactTarget",
  title: "Plan Step Artifact Target",
  description: "One materialized target surface for a plan step artifact.",
});

const StepArtifactSourceSchema = Schema.Struct({
  type: Schema.String,
  origin: Schema.String,
  ref: Schema.optional(Schema.String),
  directory: Schema.optional(Schema.String),
  gitTreeHash: Schema.optional(Schema.String),
}).annotate({
  identifier: "StepArtifactSource",
  title: "Plan Step Artifact Source",
  description: "Optional source metadata describing where the artifact came from.",
});

const StepArtifactSchema = Schema.Struct({
  path: Schema.optional(Schema.String),
  scope: Schema.Literals(["project", "user"] as const),
  agents: Schema.optional(Schema.Array(Schema.String)),
  version: Schema.optional(Schema.String),
  change: ArtifactChangeSchema,
  previousVersion: Schema.optional(Schema.String),
  fileCount: Schema.optional(Schema.Number),
  targets: Schema.optional(Schema.Array(StepArtifactTargetSchema)),
  source: Schema.optional(StepArtifactSourceSchema),
}).annotate({
  identifier: "StepArtifact",
  title: "Plan Step Artifact",
  description: "Optional artifact metadata describing what changed and where.",
});

const ErrorCauseSchema = Schema.Struct({
  _tag: Schema.String,
  code: Schema.optional(Schema.String),
  message: Schema.String,
  stack: Schema.optional(Schema.String),
}).annotate({
  identifier: "ErrorCause",
  title: "Error Cause",
  description: "One serialized entry from a failed step error cause chain.",
});

const StepErrorSchema = Schema.Struct({
  code: Schema.String,
  message: Schema.String,
  causes: Schema.optional(Schema.Array(ErrorCauseSchema)),
}).annotate({
  identifier: "StepError",
  title: "Plan Step Error",
  description: "Detailed error metadata for a failed plan step.",
});

const StepSchema = Schema.Struct({
  label: Schema.String,
  status: StepStatusSchema,
  message: Schema.optional(Schema.String),
  warnings: Schema.optional(Schema.Array(Schema.String)),
  code: Schema.optional(Schema.String),
  error: Schema.optional(StepErrorSchema),
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
type StepArtifact = typeof StepArtifactSchema.Type;

const artifactForJson = (
  artifact: JobStepArtifact,
  options: PlanResolutionResultOptions,
): StepArtifact => {
  const { targets, source, ...base } = artifact;
  const rest = options.debug === true && source !== undefined ? { ...base, source } : base;
  if (targets === undefined) return rest;
  const additionalTargets = artifact.targets?.filter((target) => target.path !== artifact.path);
  return additionalTargets === undefined || additionalTargets.length === 0
    ? rest
    : { ...rest, targets: additionalTargets };
};

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

const PublishActionSchema = Schema.Literals(["publish", "skip", "error"] as const).annotate({
  identifier: "PublishAction",
  title: "Publish Action",
  description: "Publish reconciliation decision for an extension version.",
});

const PublishModeSchema = Schema.Literals(["preview", "apply"] as const).annotate({
  identifier: "PublishMode",
  title: "Publish Mode",
  description: "Whether the publish command previewed or applied the reconciliation decisions.",
});

const PublishStatusSchema = Schema.Literals(["success", "failed", "pending"] as const).annotate({
  identifier: "PublishStatus",
  title: "Publish Status",
  description: "Execution status for an applied publish decision.",
});

const PublishReasonSchema = Schema.Literals(["version_already_published"] as const).annotate({
  identifier: "PublishReason",
  title: "Publish Reason",
  description: "Reason a publish item was skipped or errored.",
});

const PublishResultItemSchema = Schema.Struct({
  owner: HandleSchema,
  type: ExtensionTypeSchema,
  name: ExtensionNameSchema,
  version: VersionSchema,
  action: PublishActionSchema,
  reason: Schema.optional(PublishReasonSchema),
  status: Schema.optional(PublishStatusSchema),
  message: Schema.optional(Schema.String),
  links: Schema.optional(
    Schema.Struct({
      html: Schema.String,
    }),
  ),
}).annotate({
  identifier: "PublishResultItem",
  title: "Publish Result Item",
  description: "Structured result for one publish reconciliation item.",
});

export const PublishResultSchema = Schema.Struct({
  mode: PublishModeSchema,
  results: Schema.Array(PublishResultItemSchema),
}).annotate({
  identifier: "PublishResult",
  title: "Publish Result",
  description: "Structured publish reconciliation result.",
});
export type PublishResult = typeof PublishResultSchema.Type;
export type PublishResultItem = typeof PublishResultItemSchema.Type;

const plannedStepToStep = (step: PlannedJobStep): Step => {
  switch (step.readiness) {
    case "ready":
      return {
        label: step.label,
        status: "ready",
        ...(step.message !== undefined && step.message.length > 0 ? { message: step.message } : {}),
      };
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

const completedStepToStep = (
  step: CompletedJobStep,
  options: PlanResolutionResultOptions,
): Step => {
  if (step.result.result === "success") {
    const status = step.result.artifact?.change === "unchanged" ? "unchanged" : "applied";
    return {
      label: step.label,
      status,
      ...(step.result.message.length > 0 ? { message: step.result.message } : {}),
      ...(step.result.warnings !== undefined && step.result.warnings.length > 0
        ? { warnings: step.result.warnings }
        : {}),
      ...(step.result.artifact !== undefined
        ? { artifact: artifactForJson(step.result.artifact, options) }
        : {}),
      ...(step.result.links !== undefined ? { links: step.result.links } : {}),
    };
  }

  const code = step.result.error.code;
  const includeErrorDetails = options.verbose === true || options.debug === true;
  const causes = includeErrorDetails
    ? serializeErrorCauseChain(step.result.error.cause, { debug: options.debug === true })
    : [];
  return {
    label: step.label,
    status: step.result.message.includes("blocked") ? "blocked" : "failed",
    ...(step.result.message.length > 0 ? { message: step.result.message } : {}),
    code,
    ...(includeErrorDetails
      ? {
          error: {
            code,
            message: step.result.error.detail,
            ...(causes.length > 0 ? { causes } : {}),
          },
        }
      : {}),
  };
};

const flattenExecutedSteps = (plan: ExecutedPlan): ReadonlyArray<CompletedJobStep> =>
  plan.jobs.flatMap((job) => [...job.steps]);

const planDescription = (resolution: PlanResolution): string | undefined =>
  Option.getOrUndefined(resolution.description);

export const toPlanResolutionResult = (
  resolution: PlanResolution,
  options: PlanResolutionResultOptions = {},
): PlanResolutionResult => {
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
      const steps = flattenExecutedSteps(resolution).map((step) =>
        completedStepToStep(step, options),
      );
      const appliedCount = steps.filter((step) => step.status === "applied").length;
      const failedCount = steps.filter((step) => step.status === "failed").length;
      const blockedCount = steps.filter((step) => step.status === "blocked").length;
      const warningCount = steps.reduce((total, step) => total + (step.warnings?.length ?? 0), 0);
      const description = planDescription(resolution);
      const outcome =
        appliedCount === 0 && failedCount === 0 && blockedCount === 0 ? "no-op" : "applied";

      return {
        outcome,
        planName: resolution.name,
        ...(description !== undefined ? { planDescription: description } : {}),
        totalSteps: steps.length,
        readyCount: 0,
        warningCount,
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
    const verbosity = yield* Verbosity;
    const existingSemanticProperties = yield* getCommandSemanticProperties;
    yield* setCommandSemanticProperties({
      ...existingSemanticProperties,
      ...summarizeCommandOutcome(planResolutionToSummary(resolution, {})),
    });
    return yield* renderer.result(
      {
        result: toPlanResolutionResult(resolution, {
          verbose: verbosity.isAtLeast("verbose"),
          debug: verbosity.level === "debug",
        }),
      },
      Schema.Struct(PlanResolutionDocumentFields),
      options,
    );
  });

export const emitPublishResult = <TCommand extends string>(
  command: TCommand,
  result: PublishResult,
  options?: {
    readonly summary?: string;
    readonly suggestions?: ReadonlyArray<SuggestedAction>;
    readonly withoutSuggestions?: boolean;
  },
) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    return yield* renderer.result(result, PublishResultSchema, options);
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

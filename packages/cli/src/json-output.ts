import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { SourceTypeSchema } from "@agentxm/client-core/unstable/sources";

import { CliRenderer, count } from "@agentxm/client-core/unstable/cli-renderer";
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
import {
  ArtifactChangeSchema,
  ArtifactMechanismSchema,
  OperationPreconditionSchema,
} from "@agentxm/client-core/unstable/plan";
import {
  redactSensitiveText,
  serializeErrorCauseChain,
} from "@agentxm/client-core/unstable/app-error";
import {
  ExtensionNameSchema,
  ExtensionTypeSchema,
  HandleSchema,
  formatFqn,
} from "@agentxm/client-core/unstable/extensions";
import { VersionSchema } from "@agentxm/client-core/unstable/version-constraints";
import { suggestionsForCurrentWorkspace } from "./root/shared/scoped-command.js";

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
  mechanism: Schema.optional(ArtifactMechanismSchema),
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
  const sanitizedBase = {
    ...base,
    ...(base.path === undefined ? {} : { path: redactSensitiveText(base.path) }),
  };
  const sanitizedSource =
    source === undefined
      ? undefined
      : {
          ...source,
          origin: redactSensitiveText(source.origin),
          ...(source.ref === undefined ? {} : { ref: redactSensitiveText(source.ref) }),
        };
  const rest =
    options.debug === true && sanitizedSource !== undefined
      ? { ...sanitizedBase, source: sanitizedSource }
      : sanitizedBase;
  if (targets === undefined) return rest;
  const additionalTargets = artifact.targets?.filter((target) => target.path !== artifact.path);
  return additionalTargets === undefined || additionalTargets.length === 0
    ? rest
    : {
        ...rest,
        targets: additionalTargets.map((target) => ({
          ...target,
          path: redactSensitiveText(target.path),
        })),
      };
};

export const PlanResolutionResultSchema = Schema.Struct({
  outcome: Schema.Literals([
    "previewed",
    "cancelled",
    "applied",
    "partial",
    "failed",
    "no-op",
  ] as const).annotate({
    identifier: "PlanOutcome",
    title: "Plan Outcome",
    description:
      "Final outcome of a plan resolution: previewed, cancelled, applied, partial, failed, or no-op.",
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
  importedCount: Schema.optional(Schema.Number),
  skippedCount: Schema.optional(Schema.Number),
  conflictingCount: Schema.optional(Schema.Number),
  preconditions: Schema.optional(Schema.Array(OperationPreconditionSchema)),
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
export const PlanResolutionDocumentSchema = Schema.Struct(PlanResolutionDocumentFields).annotate({
  identifier: "PlanResolutionDocument",
  title: "Plan Resolution Document",
  description: "Top-level machine-output payload for a resolved AXM operation plan.",
});
export type PlanResolutionDocument = typeof PlanResolutionDocumentSchema.Type;

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

const PublishReasonSchema = Schema.Literals([
  "version_already_published",
  "not_authored",
  "not_publishable",
  "invalid_workspace_source",
  "authorization_failed",
  "version_exists",
  "integrity_drift",
  "verify_failed",
] as const).annotate({
  identifier: "PublishReason",
  title: "Publish Reason",
  description: "Reason a publish item was skipped or errored.",
});

const PublishResultItemSchema = Schema.Struct({
  owner: HandleSchema,
  type: ExtensionTypeSchema,
  name: ExtensionNameSchema,
  // Omitted when no version was resolved (skipped, not-publishable, or
  // preflight-failed items). Never fabricated.
  version: Schema.optional(VersionSchema),
  sourceType: Schema.optional(SourceTypeSchema),
  authored: Schema.optional(Schema.Boolean),
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
  preconditions: Schema.optional(Schema.Array(OperationPreconditionSchema)),
  selection: Schema.optional(
    Schema.Struct({
      mode: Schema.Literals(["authored", "all", "explicit", "filtered-explicit"] as const),
      scope: Schema.Literals(["project", "user"] as const),
      owners: Schema.Array(HandleSchema),
      types: Schema.Array(ExtensionTypeSchema),
      registry: Schema.String,
    }),
  ),
  results: Schema.Array(PublishResultItemSchema),
}).annotate({
  identifier: "PublishResult",
  title: "Publish Result",
  description: "Structured publish reconciliation result.",
});
export type PublishResult = typeof PublishResultSchema.Type;
export type PublishResultItem = typeof PublishResultItemSchema.Type;

const publishIdentity = (item: PublishResultItem): string => {
  const fqn = formatFqn({ owner: item.owner, type: item.type, name: item.name });
  return item.version === undefined ? fqn : `${fqn}@${item.version}`;
};

const publishBrowserSuggestions = (result: PublishResult): ReadonlyArray<SuggestedAction> =>
  result.results.flatMap((item) =>
    item.links === undefined ? [] : [{ description: "View in browser", url: item.links.html }],
  );

const publishItemLine = (item: PublishResultItem): string =>
  item.links === undefined ? publishIdentity(item) : `${publishIdentity(item)}\n${item.links.html}`;

const renderHumanPublishResult = (
  renderer: typeof CliRenderer.Service,
  result: PublishResult,
  options: {
    readonly suggestions: ReadonlyArray<SuggestedAction>;
    readonly withoutSuggestions?: boolean;
  },
) =>
  Effect.gen(function* () {
    const verbosity = yield* Verbosity;
    if (verbosity.level === "quiet") return;

    for (const precondition of result.preconditions ?? []) {
      if (precondition.status === "unmet") {
        yield* renderer.warn(
          `${precondition.label}: ${precondition.detail ?? "Required before apply"}`,
        );
      }
    }

    const published = result.results.filter(
      (item) => item.action === "publish" && item.status === "success",
    );
    const publishable = result.results.filter((item) => item.action === "publish");
    const skipped = result.results.filter((item) => item.action === "skip");
    const failed = result.results.filter(
      (item) => item.action === "error" || item.status === "failed",
    );
    const suggestions =
      options.suggestions.length === 0
        ? undefined
        : {
            suggestions: options.suggestions,
            ...(options.withoutSuggestions === undefined
              ? {}
              : { withoutSuggestions: options.withoutSuggestions }),
          };

    if (result.results.length === 0) {
      yield* renderer.success("No extensions selected for publishing", suggestions);
      return;
    }

    if (result.mode === "preview") {
      const previewItems = publishable.filter((item) => item.status !== "failed");
      const [previewItem] = previewItems;
      const headline =
        previewItem !== undefined && previewItems.length === 1
          ? `Would publish ${publishIdentity(previewItem)}`
          : `Would publish ${count(previewItems.length, "extension")}`;
      const summary =
        previewItems.length <= 1
          ? undefined
          : previewItems.map((item) => publishItemLine(item)).join("\n");
      const previewOptions = {
        ...(summary === undefined ? {} : { summary }),
        ...(suggestions ?? {}),
      };
      yield* renderer.success(headline, previewOptions);
      if (failed.length > 0) {
        yield* renderer.error(`${count(failed.length, "extension")} blocked from publishing`);
      }
      return;
    }

    if (published.length > 0 && failed.length === 0) {
      const [publishedItem] = published;
      const headline =
        publishedItem !== undefined && published.length === 1
          ? `Published ${publishItemLine(publishedItem)}`
          : `Published ${count(published.length, "extension")}`;
      const summary =
        published.length <= 1
          ? undefined
          : published.map((item) => publishItemLine(item)).join("\n");
      yield* renderer.success(headline, {
        ...(summary === undefined ? {} : { summary }),
        ...(suggestions ?? {}),
      });
      return;
    }

    if (published.length > 0) {
      const headline = `Published ${count(published.length, "extension")}; ${count(
        failed.length,
        "extension",
      )} failed`;
      yield* renderer.error(headline, suggestions);
      yield* renderer.info(
        [...published, ...failed].map((item) => publishItemLine(item)).join("\n"),
      );
      return;
    }

    if (failed.length > 0) {
      const [failedItem] = failed;
      const headline =
        failedItem !== undefined && failed.length === 1
          ? `Failed to publish ${publishIdentity(failedItem)}`
          : `Failed to publish ${count(failed.length, "extension")}`;
      yield* renderer.error(headline, suggestions);
      return;
    }

    const [skippedItem] = skipped;
    const headline =
      skippedItem !== undefined && skipped.length === 1
        ? `Already published — ${publishIdentity(skippedItem)}`
        : `No extensions published — ${count(skipped.length, "extension")} already published`;
    yield* renderer.success(headline, suggestions);
  });

const plannedStepToStep = (step: PlannedJobStep, options: PlanResolutionResultOptions): Step => {
  const artifact =
    step.artifact === undefined ? {} : { artifact: artifactForJson(step.artifact, options) };
  switch (step.readiness) {
    case "ready":
      return {
        label: step.label,
        status: "ready",
        ...(step.message !== undefined && step.message.length > 0 ? { message: step.message } : {}),
        ...artifact,
      };
    case "warn":
      return {
        label: step.label,
        status: "warning",
        message: step.warnMessage,
        ...artifact,
      };
    case "error":
      return {
        label: step.label,
        status: "error",
        message: step.errorMessage,
        ...artifact,
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
      ...(step.result.message.length > 0
        ? { message: redactSensitiveText(step.result.message) }
        : {}),
      ...(step.result.warnings !== undefined && step.result.warnings.length > 0
        ? { warnings: step.result.warnings.map((warning) => redactSensitiveText(warning)) }
        : {}),
      ...(step.result.artifact !== undefined
        ? { artifact: artifactForJson(step.result.artifact, options) }
        : {}),
      ...(step.result.links !== undefined
        ? { links: { html: redactSensitiveText(step.result.links.html) } }
        : {}),
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
    ...(step.result.message.length > 0
      ? { message: redactSensitiveText(step.result.message) }
      : {}),
    code,
    ...(includeErrorDetails
      ? {
          error: {
            code,
            message: redactSensitiveText(step.result.error.detail),
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
      const steps = resolution.jobs
        .flatMap((job) => [...job.steps])
        .map((step) => plannedStepToStep(step, options));
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
        ...(resolution.preconditions === undefined
          ? {}
          : { preconditions: resolution.preconditions }),
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
        failedCount > 0 || blockedCount > 0
          ? appliedCount > 0
            ? "partial"
            : "failed"
          : appliedCount > 0
            ? "applied"
            : "no-op";

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
        ...(resolution.preconditions === undefined
          ? {}
          : { preconditions: resolution.preconditions }),
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
    readonly message?: string;
    readonly operationCounts?: {
      readonly importedCount: number;
      readonly skippedCount: number;
      readonly conflictingCount: number;
    };
  },
) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    const verbosity = yield* Verbosity;
    const suggestions =
      options?.suggestions === undefined
        ? undefined
        : yield* suggestionsForCurrentWorkspace(options.suggestions);
    const existingSemanticProperties = yield* getCommandSemanticProperties;
    yield* setCommandSemanticProperties({
      ...existingSemanticProperties,
      ...summarizeCommandOutcome(planResolutionToSummary(resolution, {})),
    });
    const planResult = toPlanResolutionResult(resolution, {
      verbose: verbosity.isAtLeast("verbose"),
      debug: verbosity.level === "debug",
    });
    const result = {
      ...planResult,
      ...(options?.message === undefined ? {} : { message: options.message }),
      ...(options?.operationCounts ?? {}),
    };
    return yield* renderer.result(
      {
        result,
      },
      PlanResolutionDocumentSchema,
      {
        ...options,
        ...(suggestions === undefined ? {} : { suggestions }),
        ok: result.outcome !== "failed" && result.outcome !== "partial",
      },
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
    const browserSuggestions = publishBrowserSuggestions(result);
    const suggestions = [...(options?.suggestions ?? []), ...browserSuggestions];
    const summary = publishResultToSummary(result);
    const renderOptions = {
      ...(options?.summary === undefined ? {} : { summary: options.summary }),
      ...(suggestions.length === 0 ? {} : { suggestions }),
      ...(options?.withoutSuggestions === undefined
        ? {}
        : { withoutSuggestions: options.withoutSuggestions }),
      ok: summary.failedCount === 0,
    };
    const existingSemanticProperties = yield* getCommandSemanticProperties;
    yield* setCommandSemanticProperties({
      ...existingSemanticProperties,
      ...summarizeCommandOutcome(summary),
    });
    const emitted = yield* renderer.result(result, PublishResultSchema, renderOptions);
    if (!emitted) {
      yield* renderHumanPublishResult(renderer, result, {
        suggestions,
        ...(options?.withoutSuggestions === undefined
          ? {}
          : { withoutSuggestions: options.withoutSuggestions }),
      });
    }
    return emitted;
  });

/**
 * Convert a PublishResult to a CommandOutcomeSummary for telemetry.
 *
 * Outcome follows the same convention as executed plans: a run that touched
 * nothing is `no-op`, and any applied or failed work is `applied` even when
 * every item failed, so partial failures stay in one bucket.
 */
export const publishResultToSummary = (result: PublishResult): CommandOutcomeSummary => {
  const appliedCount = result.results.filter(
    (item) => item.action === "publish" && item.status === "success",
  ).length;
  const failedCount = result.results.filter((item) => item.status === "failed").length;
  const types = new Set(result.results.map((item) => item.type));
  const [onlyType] = [...types];
  const subjectType: SubjectType =
    onlyType === undefined ? "unknown" : types.size === 1 ? onlyType : "mixed";
  return {
    outcome:
      result.mode === "preview"
        ? "previewed"
        : appliedCount === 0 && failedCount === 0
          ? "no-op"
          : "applied",
    subjectType,
    sourceKind: "workspace",
    appliedCount,
    failedCount,
  };
};

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
) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    const suggestions =
      args.suggestions === undefined
        ? undefined
        : yield* suggestionsForCurrentWorkspace(args.suggestions);
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
      PlanResolutionDocumentSchema,
      {
        ...(suggestions === undefined ? {} : { suggestions }),
        ...(args.withoutSuggestions === undefined
          ? {}
          : { withoutSuggestions: args.withoutSuggestions }),
      },
    );
  });

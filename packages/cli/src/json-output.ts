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
  PlanExecutionReasonSchema,
  PlanRiskConditionSchema,
} from "@agentxm/client-core/unstable/plan";
import {
  redactSensitiveText,
  serializeErrorCauseChain,
} from "@agentxm/client-core/unstable/app-error";
import {
  PublishVisibilitySchema,
  type PublishVisibility,
} from "@agentxm/client-core/unstable/publish";
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
  readonly agentCoverage?: AgentCoverage;
}

export const AgentCoverageSchema = Schema.Struct({
  scope: Schema.Literals(["project", "user"] as const),
  agents: Schema.Array(Schema.String),
}).annotate({
  identifier: "AgentCoverage",
  title: "Agent Coverage",
  description: "Coding agents where at least one retained coverage-applicable extension is usable.",
});
export type AgentCoverage = typeof AgentCoverageSchema.Type;

const StepStatusSchema = Schema.Literals([
  "ready",
  "warning",
  "error",
  "applied",
  "unchanged",
  "failed",
  "blocked",
  "rolled-back",
  "unapplied",
] as const).annotate({
  identifier: "StepStatus",
  title: "Step Status",
  description: "Execution status of a plan step, including local rollback and unapplied work.",
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

const ReleaseAgeRecordSchema = Schema.Struct({
  reason: Schema.Literal("minimum-release-age"),
  target: Schema.String,
  dependencyPath: Schema.Array(Schema.String),
  requestedRange: Schema.optional(Schema.String),
  currentVersion: Schema.optional(Schema.String),
  selectedVersion: Schema.optional(Schema.String),
  candidateVersion: Schema.String,
  publishedAt: Schema.String,
  eligibleAt: Schema.String,
  minimumReleaseAgeSeconds: Schema.Number,
  bypassCause: Schema.optional(Schema.Literals(["exclude", "ignore-flag"] as const)),
  exemptionScope: Schema.optional(Schema.Literals(["project", "user"] as const)),
}).annotate({
  identifier: "ReleaseAgeRecord",
  title: "Release Age Record",
  description: "One deterministic minimum-release-age holdback or bypass record.",
});

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
  reason: Schema.optional(PlanExecutionReasonSchema),
  errorCode: Schema.optional(Schema.String),
  candidateId: Schema.optional(Schema.String),
  evaluatedAt: Schema.optional(Schema.String),
  holdbackCount: Schema.optional(Schema.Number),
  holdbacks: Schema.optional(Schema.Array(ReleaseAgeRecordSchema)),
  releaseAgeBypassCount: Schema.optional(Schema.Number),
  releaseAgeBypasses: Schema.optional(Schema.Array(ReleaseAgeRecordSchema)),
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
  rolledBackCount: Schema.optional(Schema.Number),
  unappliedCount: Schema.optional(Schema.Number),
  importedCount: Schema.optional(Schema.Number),
  skippedCount: Schema.optional(Schema.Number),
  conflictingCount: Schema.optional(Schema.Number),
  preconditions: Schema.optional(Schema.Array(OperationPreconditionSchema)),
  riskConditions: Schema.optional(Schema.Array(PlanRiskConditionSchema)),
  agentCoverage: Schema.optional(AgentCoverageSchema),
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

const PublishStatusSchema = Schema.Literals([
  "success",
  "failed",
  "pending",
  "blocked",
] as const).annotate({
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
  "blocked_by_preflight",
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
  visibility: Schema.optional(PublishVisibilitySchema),
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
  counts: Schema.Struct({
    selected: Schema.Number,
    published: Schema.Number,
    alreadyPublished: Schema.Number,
    skipped: Schema.Number,
    blocked: Schema.Number,
    failed: Schema.Number,
    pending: Schema.Number,
  }),
}).annotate({
  identifier: "PublishResult",
  title: "Publish Result",
  description: "Structured publish reconciliation result.",
});
export type PublishResult = typeof PublishResultSchema.Type;
export type PublishResultItem = typeof PublishResultItemSchema.Type;

type PublishResultInput = Omit<PublishResult, "counts">;

export const classifyPublishResults = (
  results: ReadonlyArray<PublishResultItem>,
): PublishResult["counts"] => {
  const published = results.filter(
    (item) => item.action === "publish" && item.status === "success",
  ).length;
  const alreadyPublished = results.filter(
    (item) =>
      item.action === "skip" &&
      item.status === "success" &&
      item.reason === "version_already_published",
  ).length;
  const blocked = results.filter((item) => item.status === "blocked").length;
  const failed = results.filter((item) => item.status === "failed").length;
  const pending = results.filter((item) => item.status === "pending").length;
  const skipped = results.length - published - alreadyPublished - blocked - failed - pending;
  return {
    selected: results.length,
    published,
    alreadyPublished,
    skipped,
    blocked,
    failed,
    pending,
  };
};

const normalizePublishResult = (result: PublishResultInput): PublishResult => ({
  ...result,
  counts: classifyPublishResults(result.results),
});

const publishIdentity = (item: PublishResultItem): string => {
  const fqn = formatFqn({ owner: item.owner, type: item.type, name: item.name });
  return item.version === undefined ? fqn : `${fqn}@${item.version}`;
};

const publishBrowserSuggestions = (result: PublishResult): ReadonlyArray<SuggestedAction> =>
  result.results.flatMap((item) =>
    item.links === undefined ? [] : [{ description: "View in browser", url: item.links.html }],
  );

const publishVisibilityLine = (visibility: PublishVisibility): string =>
  `visibility: ${visibility.value} (${visibility.disposition}, ${visibility.source})`;

const publishItemLine = (item: PublishResultItem): string => {
  const identity = publishIdentity(item);
  const withVisibility =
    item.visibility === undefined
      ? identity
      : `${identity} — ${publishVisibilityLine(item.visibility)}`;
  return item.links === undefined ? withVisibility : `${withVisibility}\n${item.links.html}`;
};

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
    const verifiedExisting = result.results.filter(
      (item) => item.action === "skip" && item.reason === "version_already_published",
    );
    const skipped = result.results.filter(
      (item) => item.action === "skip" && item.reason !== "version_already_published",
    );
    const blocked = result.results.filter((item) => item.status === "blocked");
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
      const previewItems = publishable.filter(
        (item) => item.status !== "failed" && item.status !== "blocked",
      );
      if (previewItems.length > 0) {
        const [previewItem] = previewItems;
        const headline =
          previewItem !== undefined && previewItems.length === 1
            ? `Would publish ${publishItemLine(previewItem)}`
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
      } else if (verifiedExisting.length > 0 && failed.length === 0 && blocked.length === 0) {
        yield* renderer.success(
          `All ${verifiedExisting.length} selected versions are already published and integrity-verified`,
          {
            summary: verifiedExisting.map((item) => publishItemLine(item)).join("\n"),
            ...(suggestions ?? {}),
          },
        );
      }
      if (
        verifiedExisting.length > 0 &&
        (previewItems.length > 0 || failed.length > 0 || blocked.length > 0)
      ) {
        yield* renderer.info(
          `${count(verifiedExisting.length, "version")} already published and integrity-verified\n${verifiedExisting
            .map((item) => publishItemLine(item))
            .join("\n")}`,
        );
      }
      if (failed.length > 0) {
        yield* renderer.error(`${count(failed.length, "extension")} failed preflight`);
      }
      if (blocked.length > 0) {
        yield* renderer.warn(`${count(blocked.length, "extension")} not attempted`);
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
      if (verifiedExisting.length > 0) {
        yield* renderer.info(
          `${count(verifiedExisting.length, "version")} already published and integrity-verified\n${verifiedExisting
            .map((item) => publishItemLine(item))
            .join("\n")}`,
        );
      }
      return;
    }

    if (published.length > 0) {
      const headline = `Published ${count(published.length, "extension")}; ${count(failed.length, "extension")} failed; ${count(blocked.length, "extension")} not attempted`;
      yield* renderer.error(headline, suggestions);
      yield* renderer.info(
        [...published, ...failed].map((item) => publishItemLine(item)).join("\n"),
      );
      if (verifiedExisting.length > 0) {
        yield* renderer.info(
          `${count(verifiedExisting.length, "version")} already published and integrity-verified\n${verifiedExisting
            .map((item) => publishItemLine(item))
            .join("\n")}`,
        );
      }
      return;
    }

    if (failed.length > 0) {
      const [failedItem] = failed;
      const headline =
        failedItem !== undefined && failed.length === 1
          ? `Publish preflight failed for ${publishIdentity(failedItem)}`
          : `Publish preflight failed for ${count(failed.length, "extension")}`;
      yield* renderer.error(headline, suggestions);
      if (verifiedExisting.length > 0) {
        yield* renderer.info(
          `${count(verifiedExisting.length, "version")} already published and integrity-verified\n${verifiedExisting
            .map((item) => publishItemLine(item))
            .join("\n")}`,
        );
      }
      if (blocked.length > 0) {
        yield* renderer.warn(`${count(blocked.length, "extension")} ready but not attempted`);
      }
      return;
    }

    const [verifiedItem] = verifiedExisting;
    const headline =
      verifiedItem !== undefined && verifiedExisting.length === 1 && skipped.length === 0
        ? `Already published and integrity-verified — ${publishItemLine(verifiedItem)}`
        : verifiedExisting.length > 0
          ? `All ${verifiedExisting.length} selected versions are already published and integrity-verified`
          : `No extensions published — ${count(skipped.length, "extension")} skipped`;
    yield* renderer.success(headline, {
      ...(verifiedExisting.length > 1
        ? { summary: verifiedExisting.map((item) => publishItemLine(item)).join("\n") }
        : {}),
      ...(suggestions ?? {}),
    });
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

const releaseAgeResultFields = (resolution: PlanResolution) =>
  resolution.releaseAge === undefined
    ? {}
    : {
        evaluatedAt: resolution.releaseAge.evaluatedAt,
        holdbackCount: resolution.releaseAge.holdbacks.length,
        holdbacks: resolution.releaseAge.holdbacks,
        releaseAgeBypassCount: resolution.releaseAge.bypasses.length,
        releaseAgeBypasses: resolution.releaseAge.bypasses,
      };

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
        ...releaseAgeResultFields(resolution),
        ...(resolution.candidateId === undefined ? {} : { candidateId: resolution.candidateId }),
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
        ...(resolution.riskConditions === undefined
          ? {}
          : { riskConditions: resolution.riskConditions }),
        steps,
      };
    }
    case "FailedPlan": {
      const steps =
        resolution.executionSteps === undefined
          ? resolution.jobs
              .flatMap((job) => [...job.steps])
              .map((step) => plannedStepToStep(step, options))
          : resolution.executionSteps.map((step) => ({
              label: step.label,
              status: step.status,
              message: redactSensitiveText(step.message),
            }));
      const warningCount = steps.filter((step) => step.status === "warning").length;
      const errorCount = steps.filter((step) => step.status === "error").length;
      const description = planDescription(resolution);
      return {
        outcome: "failed",
        reason: resolution.reason,
        errorCode: resolution.errorCode,
        ...(resolution.candidateId === undefined ? {} : { candidateId: resolution.candidateId }),
        planName: resolution.name,
        ...releaseAgeResultFields(resolution),
        ...(description === undefined ? {} : { planDescription: description }),
        totalSteps: steps.length,
        readyCount: steps.filter((step) => step.status === "ready").length,
        warningCount,
        errorCount,
        appliedCount: 0,
        failedCount: resolution.reason === "execution-failed" ? 1 : 0,
        blockedCount: resolution.reason === "hard-blocked" ? Math.max(1, errorCount) : 0,
        ...(resolution.executionSteps === undefined
          ? {}
          : {
              rolledBackCount: steps.filter((step) => step.status === "rolled-back").length,
              unappliedCount: steps.filter((step) => step.status === "unapplied").length,
            }),
        ...(resolution.preconditions === undefined
          ? {}
          : { preconditions: resolution.preconditions }),
        ...(resolution.riskConditions === undefined
          ? {}
          : { riskConditions: resolution.riskConditions }),
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
        ...releaseAgeResultFields(resolution),
        ...(description !== undefined ? { planDescription: description } : {}),
        totalSteps: steps.length,
        readyCount: 0,
        warningCount,
        errorCount: 0,
        appliedCount,
        failedCount,
        blockedCount,
        ...(outcome === "failed" || outcome === "partial" || options.agentCoverage === undefined
          ? {}
          : { agentCoverage: options.agentCoverage }),
        ...(resolution.preconditions === undefined
          ? {}
          : { preconditions: resolution.preconditions }),
        ...(resolution.riskConditions === undefined
          ? {}
          : { riskConditions: resolution.riskConditions }),
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
    readonly agentCoverage?: AgentCoverage;
  },
) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    const verbosity = yield* Verbosity;
    const resolutionSuggestions =
      resolution._tag === "FailedPlan" ? resolution.suggestions : undefined;
    const requestedSuggestions = options?.suggestions ?? [];
    const combinedSuggestions = [...requestedSuggestions, ...(resolutionSuggestions ?? [])];
    const suggestions =
      combinedSuggestions.length === 0
        ? undefined
        : yield* suggestionsForCurrentWorkspace(combinedSuggestions);
    const planResult = toPlanResolutionResult(resolution, {
      verbose: verbosity.isAtLeast("verbose"),
      debug: verbosity.level === "debug",
      ...(options?.agentCoverage === undefined ? {} : { agentCoverage: options.agentCoverage }),
    });
    const existingSemanticProperties = yield* getCommandSemanticProperties;
    yield* setCommandSemanticProperties({
      ...existingSemanticProperties,
      ...summarizeCommandOutcome(planResolutionToSummary(resolution, {})),
      ...(planResult.reason === undefined ? {} : { "cli.reason": planResult.reason }),
      ...(planResult.errorCode === undefined ? {} : { "cli.error_code": planResult.errorCode }),
    });
    const result = {
      ...planResult,
      ...(options?.message === undefined ? {} : { message: options.message }),
      ...(options?.operationCounts ?? {}),
    };
    const emitted = yield* renderer.result(
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
    if (!emitted && result.outcome === "cancelled") {
      yield* renderer.info("Cancelled — no changes applied");
    }
    if (!emitted && result.outcome === "failed") {
      const detail =
        result.reason === "approval-required"
          ? "Approval required — no changes applied"
          : result.reason === "override-required"
            ? "Safety override required — no changes applied"
            : result.reason === "stale-candidate"
              ? "Workspace changed after planning — no changes applied"
              : result.reason === "hard-blocked"
                ? "Plan is blocked — no changes applied"
                : result.reason === "interrupted"
                  ? "Interrupted — changes rolled back"
                  : (result.rolledBackCount ?? 0) > 0
                    ? "Plan execution failed — local changes rolled back"
                    : "Plan execution failed";
      yield* renderer.error(detail, {
        ...(suggestions === undefined ? {} : { suggestions }),
        withoutSuggestions: emitted,
      });
      for (const step of result.steps) {
        if ((step.status === "failed" || step.status === "blocked") && step.message !== undefined) {
          yield* renderer.info(`${step.label}: ${step.message}`);
        }
      }
    }
    if (!emitted && result.holdbacks !== undefined && result.holdbacks.length > 0) {
      yield* renderer.warn(
        `Held by minimum release age (${count(result.holdbacks.length, "release")})`,
      );
      for (const holdback of result.holdbacks) {
        yield* renderer.info(
          `${holdback.target} ${holdback.candidateVersion} is eligible at ${holdback.eligibleAt}`,
        );
      }
      const targets = Array.from(
        new Set(result.holdbacks.map((holdback) => holdback.dependencyPath[0] ?? holdback.target)),
      );
      yield* renderer.info(
        `Wait until eligible, choose an eligible version, or change minimumReleaseAge.${
          targets.length === 1
            ? ` For a one-shot bypass, run axm update ${targets[0]} --ignore-release-age.`
            : " For a one-shot bypass, target one held Registry extension with axm update <fqn> --ignore-release-age."
        }`,
      );
    }
    if (
      !emitted &&
      result.releaseAgeBypasses !== undefined &&
      result.releaseAgeBypasses.length > 0
    ) {
      yield* renderer.warn(
        `${count(result.releaseAgeBypasses.length, "release")} bypassed minimumReleaseAge`,
      );
      for (const bypass of result.releaseAgeBypasses) {
        const cause =
          bypass.bypassCause === "exclude"
            ? `settings exclude (${bypass.exemptionScope ?? "unknown"} scope)`
            : "--ignore-release-age";
        yield* renderer.info(
          `${bypass.target} ${bypass.candidateVersion} was selected before ${bypass.eligibleAt} via ${cause}`,
        );
      }
    }
    return emitted;
  });

export const emitPublishResult = <TCommand extends string>(
  command: TCommand,
  input: PublishResultInput,
  options?: {
    readonly summary?: string;
    readonly suggestions?: ReadonlyArray<SuggestedAction>;
    readonly withoutSuggestions?: boolean;
  },
) =>
  Effect.gen(function* () {
    const result = normalizePublishResult(input);
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
  const appliedCount = result.counts.published;
  const failedCount = result.counts.failed;
  const blockedCount = result.counts.blocked;
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
    blockedCount,
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

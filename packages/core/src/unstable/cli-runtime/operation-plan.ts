import * as Schema from "effect/Schema";
import {
  ArtifactChangeSchema,
  OperationPreconditionSchema,
  PlanExecutionReasonSchema,
  PlanRiskConditionSchema,
} from "../plan/plan.js";

const OperationPlanStepStatusSchema = Schema.Literals([
  "ready",
  "warning",
  "error",
  "applied",
  "unchanged",
  "failed",
  "blocked",
  "rolled-back",
  "unapplied",
] as const);

const OperationPlanStepArtifactSchema = Schema.Struct({
  path: Schema.optional(Schema.String),
  scope: Schema.Literals(["project", "user"] as const),
  version: Schema.optional(Schema.String),
  change: ArtifactChangeSchema,
  previousVersion: Schema.optional(Schema.String),
  fileCount: Schema.optional(Schema.Number),
});

const OperationPlanStepSchema = Schema.Struct({
  label: Schema.String,
  status: OperationPlanStepStatusSchema,
  message: Schema.optional(Schema.String),
  warnings: Schema.optional(Schema.Array(Schema.String)),
  artifact: Schema.optional(OperationPlanStepArtifactSchema),
});

const OperationReleaseAgeRecordSchema = Schema.Struct({
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
});

export const OperationPlanFields = {
  outcome: Schema.Literals([
    "previewed",
    "cancelled",
    "applied",
    "partial",
    "failed",
    "no-op",
  ] as const),
  reason: Schema.optional(PlanExecutionReasonSchema),
  errorCode: Schema.optional(Schema.String),
  candidateId: Schema.optional(Schema.String),
  evaluatedAt: Schema.optional(Schema.String),
  holdbackCount: Schema.optional(Schema.Number),
  holdbacks: Schema.optional(Schema.Array(OperationReleaseAgeRecordSchema)),
  releaseAgeBypassCount: Schema.optional(Schema.Number),
  releaseAgeBypasses: Schema.optional(Schema.Array(OperationReleaseAgeRecordSchema)),
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
  preconditions: Schema.optional(Schema.Array(OperationPreconditionSchema)),
  riskConditions: Schema.optional(Schema.Array(PlanRiskConditionSchema)),
  steps: Schema.Array(OperationPlanStepSchema),
} satisfies Schema.Struct.Fields;

export const OperationPlanSchema = Schema.Struct(OperationPlanFields);

export type OperationPlan = typeof OperationPlanSchema.Type;
export type OperationPlanStep = typeof OperationPlanStepSchema.Type;
export type OperationPlanStepArtifact = typeof OperationPlanStepArtifactSchema.Type;

export const makeOperationPlan = (args: {
  readonly planName: string;
  readonly planDescription?: string;
  readonly message?: string;
  readonly steps: ReadonlyArray<OperationPlanStep>;
  readonly outcome?: OperationPlan["outcome"];
  readonly preconditions?: OperationPlan["preconditions"];
  readonly evaluatedAt?: string;
  readonly holdbacks?: OperationPlan["holdbacks"];
  readonly releaseAgeBypasses?: OperationPlan["releaseAgeBypasses"];
}): OperationPlan => {
  const readyCount = args.steps.filter((step) => step.status === "ready").length;
  const warningStatusCount = args.steps.filter((step) => step.status === "warning").length;
  const warningCount = args.steps.reduce(
    (total, step) => total + (step.warnings?.length ?? 0),
    warningStatusCount,
  );
  const errorCount = args.steps.filter((step) => step.status === "error").length;
  const appliedCount = args.steps.filter((step) => step.status === "applied").length;
  const failedCount = args.steps.filter((step) => step.status === "failed").length;
  const blockedCount = args.steps.filter((step) => step.status === "blocked").length;
  const outcome =
    args.outcome ??
    (failedCount > 0 || blockedCount > 0
      ? appliedCount > 0
        ? "partial"
        : "failed"
      : appliedCount > 0
        ? "applied"
        : "no-op");

  return {
    outcome,
    planName: args.planName,
    ...(args.evaluatedAt === undefined ? {} : { evaluatedAt: args.evaluatedAt }),
    ...(args.holdbacks === undefined
      ? {}
      : { holdbackCount: args.holdbacks.length, holdbacks: [...args.holdbacks] }),
    ...(args.releaseAgeBypasses === undefined
      ? {}
      : {
          releaseAgeBypassCount: args.releaseAgeBypasses.length,
          releaseAgeBypasses: [...args.releaseAgeBypasses],
        }),
    ...(args.planDescription !== undefined ? { planDescription: args.planDescription } : {}),
    ...(args.message !== undefined ? { message: args.message } : {}),
    totalSteps: args.steps.length,
    readyCount,
    warningCount,
    errorCount,
    appliedCount,
    failedCount,
    blockedCount,
    ...(args.preconditions === undefined ? {} : { preconditions: args.preconditions }),
    steps: [...args.steps],
  };
};

export const makeSingleStepOperationPlan = (args: {
  readonly planName: string;
  readonly planDescription?: string;
  readonly message: string;
  readonly stepLabel: string;
  readonly stepStatus: OperationPlanStep["status"];
  readonly stepMessage?: string;
  readonly warnings?: ReadonlyArray<string>;
  readonly artifact?: OperationPlanStepArtifact;
  readonly outcome?: OperationPlan["outcome"];
}): OperationPlan =>
  makeOperationPlan({
    planName: args.planName,
    ...(args.planDescription !== undefined ? { planDescription: args.planDescription } : {}),
    message: args.message,
    ...(args.outcome !== undefined ? { outcome: args.outcome } : {}),
    steps: [
      {
        label: args.stepLabel,
        status: args.stepStatus,
        ...(args.stepMessage !== undefined ? { message: args.stepMessage } : {}),
        ...(args.warnings !== undefined && args.warnings.length > 0
          ? { warnings: [...args.warnings] }
          : {}),
        ...(args.artifact !== undefined ? { artifact: args.artifact } : {}),
      },
    ],
  });

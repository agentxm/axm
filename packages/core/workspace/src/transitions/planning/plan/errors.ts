/**
 * Error category vocabulary and the rendered failure shape for serialized
 * plan and step data.
 *
 * The categories are the same strings as the CLI's `AppErrorCode` so machine
 * output stays byte-identical across the package boundary; the conversion
 * boundary beside the CLI error vocabulary asserts the parity at compile
 * time. The kernel owns the vocabulary and the rendered failure because
 * plans, journals, and machine output serialize them, and because a failure
 * must read the same whether it surfaces directly at a command boundary or
 * settles a plan step. The application owns only exit codes and the envelope
 * it prints.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";

import type { RegistryErrorMetadata } from "@agentxm/registry-client";
import { HumanHandoffActionSchema } from "@agentxm/registry-protocol/unstable/human-handoff";
import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";

/** Every category a plan, step result, or risk condition may serialize. */
export const OPERATION_ERROR_CATEGORIES = [
  "issues",
  "usage",
  "not_found",
  "auth",
  "forbidden",
  "conflict",
  "rate_limit",
  "network",
  "validation",
  "internal",
  "unavailable",
  "quota",
  "auth_required",
  "auth_expired",
  "auth_denied",
  "timeout",
] as const;

export const OperationErrorCategorySchema = Schema.Literals(OPERATION_ERROR_CATEGORIES).annotate({
  identifier: "OperationErrorCategory",
});

export type OperationErrorCategory = (typeof OPERATION_ERROR_CATEGORIES)[number];

const DefaultDetailByCategory: Readonly<Record<OperationErrorCategory, string>> = {
  auth: "Credentials were rejected, are invalid, or expired.",
  forbidden: "You do not have permission to perform this operation.",
  not_found: "The requested resource was not found.",
  conflict: "The request conflicts with the current state.",
  rate_limit: "The request was rate limited.",
  validation: "The request is invalid.",
  network: "The remote service could not be reached.",
  unavailable: "The service is temporarily unavailable.",
  quota: "A quota, storage, or plan limit has been exhausted.",
  internal: "An internal error occurred.",
  usage: "The command invocation is invalid.",
  issues: "The command found issues.",
  auth_required: "Authentication requires approval from a person.",
  auth_expired: "The pending authentication flow expired.",
  auth_denied: "The pending authentication flow was denied or cancelled.",
  timeout: "The operation did not complete before the deadline.",
};

/** The sentence a failure reads when its producer supplied none. */
export const defaultFailureDetail = (category: OperationErrorCategory): string =>
  DefaultDetailByCategory[category];

/**
 * The `SuggestedAction` contract shape, without the safe-command runtime
 * filter, plus where its command runs: a step failure carries whatever
 * suggestion its producer chose, and the application boundary sanitizes
 * suggested commands and applies `commandScope` before rendering them. A
 * `global` command is never narrowed to the current workspace scope.
 *
 * Every producer that carries suggestions on a typed failure carries them in
 * this shape, so a suggestion states where its command runs once, at the
 * site that knows.
 */
export const FailureSuggestedActionSchema = Schema.Struct({
  description: Schema.String,
  cmd: Schema.optional(Schema.String),
  url: Schema.optional(Schema.String),
  commandScope: Schema.optional(Schema.Literals(["workspace", "global"] as const)),
});

export type FailureSuggestedAction = typeof FailureSuggestedActionSchema.Type;

// Every contract suggestion is a carried suggestion, and a carried suggestion
// without its scope is a contract suggestion.
const _suggestedActionParity = (
  value: SuggestedAction,
  carried: Omit<FailureSuggestedAction, "commandScope">,
): readonly [FailureSuggestedAction, SuggestedAction] => [value, carried];
void _suggestedActionParity;

const LockfileVersionNumberSchema = Schema.Int.pipe(
  Schema.check(
    Schema.makeFilter((value) =>
      Number.isSafeInteger(value) && value > 0
        ? undefined
        : "lockfile versions must be positive safe integers",
    ),
  ),
);

const WorkspaceLockfileVersionUnsupportedProblemSchema = Schema.Struct({
  code: Schema.Literal("workspace-lockfile-version-unsupported"),
  path: Schema.String,
  observedVersion: LockfileVersionNumberSchema,
  supportedVersion: LockfileVersionNumberSchema,
  direction: Schema.Literals(["older", "newer"] as const),
}).annotate({
  identifier: "WorkspaceLockfileVersionUnsupportedProblem",
  title: "Unsupported Workspace Lockfile Version",
  description: "Identifies an unsupported workspace lockfile version and its direction.",
});

/** Structured details for a recognized failure, keyed by a stable problem code. */
export const FailureProblemSchema = Schema.Union([
  WorkspaceLockfileVersionUnsupportedProblemSchema,
]).annotate({
  identifier: "FailureProblem",
  title: "Failure Problem",
  description: "Structured details for a recognized failure.",
});

export type FailureProblem = typeof FailureProblemSchema.Type;

/**
 * Request, response, and request-policy evidence a remote failure carries.
 * The shape is the one the registry client records, so a registry failure
 * keeps its evidence on every path.
 */
export const FailureMetadataSchema = Schema.Struct({
  request: Schema.optional(
    Schema.Struct({
      service: Schema.String,
      method: Schema.optional(Schema.String),
      url: Schema.String,
    }),
  ),
  response: Schema.optional(
    Schema.Struct({
      status: Schema.Number,
      requestId: Schema.optional(Schema.String),
      problemCode: Schema.optional(Schema.String),
      body: Schema.optional(Schema.Unknown),
    }),
  ),
  requestPolicy: Schema.optional(
    Schema.Struct({
      retryable: Schema.Boolean,
      attemptCount: Schema.Number,
      maxAttempts: Schema.Number,
      exhausted: Schema.Boolean,
      stoppedBy: Schema.optional(
        Schema.Literals(["attempt-limit", "deadline", "replay-unsafe"] as const),
      ),
      replaySafety: Schema.Literals(["safe", "mutation", "idempotency-keyed"] as const),
    }),
  ),
});

export type FailureMetadata = typeof FailureMetadataSchema.Type;

// Registry evidence travels as failure metadata without translation.
const _registryMetadataParity = (value: RegistryErrorMetadata): FailureMetadata => value;
void _registryMetadataParity;

/**
 * One input a failure is about, such as the name a validation rejected.
 * Human output lists inputs as fields under the reason. They restate what the
 * detail already names, so machine output does not carry them.
 */
const FailureInputSchema = Schema.Struct({
  label: Schema.String,
  value: Schema.String,
});

export type FailureInput = typeof FailureInputSchema.Type;

/**
 * The pending action a failure hands to a person: a full human handoff with
 * the request to resume, or the bare page to open when the producer knows no
 * more than that.
 */
export const FailureActionSchema = Schema.Union([
  HumanHandoffActionSchema,
  Schema.Struct({
    kind: Schema.Literal("open-url"),
    url: Schema.String,
    fallbackUrl: Schema.optional(Schema.String),
    code: Schema.optional(Schema.String),
    expiresAt: Schema.optional(Schema.String),
    resume: Schema.optional(Schema.String),
  }),
]);

export type FailureAction = typeof FailureActionSchema.Type;

/**
 * The one rendered, serializable failure. A plan step settles with it, and
 * the application boundary projects it into its envelope, so a typed failure
 * reads the same on both paths. `title` is absent when the category's own
 * title fits; `problem` identifies a recognized failure for machines;
 * `metadata`, `retryable`, and `inputs` carry what the producer recorded;
 * `suggestions` carry the producer's recoveries; `status`, `blockedOn`, and
 * `action` carry a handoff that is waiting on a person and can resume; and
 * `cause` carries the typed feature error or raw cause for diagnostic chains.
 */
export class StepFailure extends Schema.TaggedError<StepFailure>()("StepFailure", {
  category: OperationErrorCategorySchema,
  title: Schema.optional(Schema.String),
  detail: Schema.String,
  problem: Schema.optional(FailureProblemSchema),
  metadata: Schema.optional(FailureMetadataSchema),
  retryable: Schema.optional(Schema.Boolean),
  status: Schema.optional(Schema.Literal("pending-human")),
  blockedOn: Schema.optional(Schema.Literal("human")),
  action: Schema.optional(FailureActionSchema),
  inputs: Schema.optional(Schema.Array(FailureInputSchema)),
  suggestions: Schema.optional(Schema.Array(FailureSuggestedActionSchema)),
  cause: Schema.optional(Schema.Unknown),
}) {}

/**
 * The categories a retry can change when the producer stated no
 * retryability: the `external` class of the shared vocabulary less `quota`,
 * which a retry does not refill.
 */
const RETRYABLE_BY_DEFAULT: ReadonlySet<OperationErrorCategory> = new Set([
  "network",
  "rate_limit",
  "timeout",
  "unavailable",
]);

/**
 * Whether re-running the operation that produced this failure could change
 * its outcome. The producer's own `retryable` verdict stands when it stated
 * one; otherwise the category decides. A condition a person resolves never
 * offers a retry, which would send the reader round the same loop.
 */
export const stepFailureRetryCanHelp = (
  failure: Pick<StepFailure, "category" | "retryable">,
): boolean => failure.retryable ?? RETRYABLE_BY_DEFAULT.has(failure.category);

/**
 * Construct a rendered failure the way a producer states it: the category's
 * default sentence when none is given, and a `recover` sentence (with its
 * optional command) as the first suggestion, ahead of any others.
 */
export const makeStepFailure = (args: {
  readonly category: OperationErrorCategory;
  readonly title?: string | undefined;
  readonly detail?: string | undefined;
  readonly problem?: FailureProblem | undefined;
  readonly metadata?: FailureMetadata | undefined;
  readonly retryable?: boolean | undefined;
  readonly status?: "pending-human" | undefined;
  readonly blockedOn?: "human" | undefined;
  readonly action?: FailureAction | undefined;
  readonly inputs?: ReadonlyArray<FailureInput> | undefined;
  readonly recover?: string | undefined;
  readonly cmd?: string | undefined;
  readonly suggestions?: ReadonlyArray<FailureSuggestedAction> | undefined;
  readonly cause?: unknown;
}): StepFailure => {
  const suggestions = [
    ...(args.recover === undefined
      ? []
      : [{ description: args.recover, ...(args.cmd === undefined ? {} : { cmd: args.cmd }) }]),
    ...(args.suggestions ?? []),
  ];
  return new StepFailure({
    category: args.category,
    ...(args.title === undefined ? {} : { title: args.title }),
    detail: args.detail ?? defaultFailureDetail(args.category),
    ...(args.problem === undefined ? {} : { problem: args.problem }),
    ...(args.metadata === undefined ? {} : { metadata: args.metadata }),
    ...(args.retryable === undefined ? {} : { retryable: args.retryable }),
    ...(args.status === undefined ? {} : { status: args.status }),
    ...(args.blockedOn === undefined ? {} : { blockedOn: args.blockedOn }),
    ...(args.action === undefined ? {} : { action: args.action }),
    ...(args.inputs === undefined || args.inputs.length === 0 ? {} : { inputs: args.inputs }),
    ...(suggestions.length === 0 ? {} : { suggestions }),
    ...(args.cause === undefined ? {} : { cause: args.cause }),
  });
};

/**
 * The same rendered failure carrying a different cause: a step that settles
 * with a rendering keeps the typed failure it rendered for readers that
 * recover its evidence from the cause.
 */
export const stepFailureWithCause = (failure: StepFailure, cause: unknown): StepFailure =>
  new StepFailure({
    category: failure.category,
    ...(failure.title === undefined ? {} : { title: failure.title }),
    detail: failure.detail,
    ...(failure.problem === undefined ? {} : { problem: failure.problem }),
    ...(failure.metadata === undefined ? {} : { metadata: failure.metadata }),
    ...(failure.retryable === undefined ? {} : { retryable: failure.retryable }),
    ...(failure.status === undefined ? {} : { status: failure.status }),
    ...(failure.blockedOn === undefined ? {} : { blockedOn: failure.blockedOn }),
    ...(failure.action === undefined ? {} : { action: failure.action }),
    ...(failure.inputs === undefined ? {} : { inputs: failure.inputs }),
    ...(failure.suggestions === undefined ? {} : { suggestions: failure.suggestions }),
    cause,
  });

/**
 * Detail sentence for a stale execution candidate; every rendering of the
 * failure reads it verbatim.
 */
export const STALE_CANDIDATE_DETAIL = "The execution candidate became stale before apply.";

/**
 * The frozen execution candidate's material preimages changed between
 * validation and apply. Detected by tag, never by detail-string comparison.
 */
export class StaleExecutionCandidate extends Schema.TaggedError<StaleExecutionCandidate>()(
  "StaleExecutionCandidate",
  {
    /** The plan name of the candidate that went stale. */
    candidate: Schema.String,
  },
) {}

/** Fingerprinting one execution-material path failed. */
export class CandidateFingerprintFailed extends Schema.TaggedError<CandidateFingerprintFailed>()(
  "CandidateFingerprintFailed",
  {
    /** The material path whose preimage could not be read. */
    target: Schema.String,
    cause: Schema.Unknown,
  },
) {}

/**
 * An apply-mode execution reached the plan pipeline without approval
 * recovery metadata: a caller violated the `PlanExecution` contract.
 */
export class ApprovalRecoveryMissing extends Schema.TaggedError<ApprovalRecoveryMissing>()(
  "ApprovalRecoveryMissing",
  {},
) {}

/**
 * The plan interaction implementation could not complete a presentation or
 * confirmation exchange. The implementation owns wording and category choice;
 * the kernel only transports the failure to the boundary that renders it.
 */
export class PlanInteractionFailed extends Schema.TaggedError<PlanInteractionFailed>()(
  "PlanInteractionFailed",
  {
    category: OperationErrorCategorySchema,
    detail: Schema.String,
    suggestions: Schema.optional(Schema.Array(FailureSuggestedActionSchema)),
    cause: Schema.optional(Schema.Unknown),
  },
) {}

import { collectSensitiveStrings, redactRegistryText } from "@agentxm/registry-client";
import { HumanHandoffActionSchema } from "@agentxm/registry-protocol/unstable/human-handoff";
import * as Schema from "effect/Schema";

import {
  FailureMetadataSchema,
  FailureProblemSchema,
  type FailureMetadata,
} from "@agentxm/workspace/transitions/planning";
import {
  AppErrorCodeSchema,
  type AppError,
  type AppErrorCode,
  effectiveSuggestionsFor,
  redactAppErrorMetadata,
  redactSuggestedAction,
} from "../app-error/index.js";
// The cause-chain module is read directly: this module evaluates inside the
// application error boundary's own import cycle, before its index settles.
import {
  SerializedErrorCauseSchema,
  serializeErrorCauseChain,
  type SerializedErrorCause,
} from "../app-error/cause-chain.js";
import {
  SuggestedActionSchema,
  type SuggestedAction,
} from "@agentxm/registry-protocol/unstable/suggested-action";

export const JsonErrorEnvelopeSchema = Schema.Struct({
  ok: Schema.Literal(false),
  code: AppErrorCodeSchema,
  title: Schema.String,
  detail: Schema.String,
  problem: Schema.optional(FailureProblemSchema),
  cause: Schema.optional(Schema.Array(SerializedErrorCauseSchema)),
  metadata: Schema.optional(FailureMetadataSchema),
  status: Schema.optional(Schema.Literal("pending-human")),
  retryable: Schema.optional(Schema.Boolean),
  blockedOn: Schema.optional(Schema.Literal("human")),
  action: Schema.optional(
    Schema.Union([
      HumanHandoffActionSchema,
      Schema.Struct({
        kind: Schema.Literal("open-url"),
        url: Schema.String,
        fallbackUrl: Schema.optional(Schema.String),
        code: Schema.optional(Schema.String),
        expiresAt: Schema.optional(Schema.String),
        resume: Schema.optional(Schema.String),
      }),
    ]),
  ),
  suggestions: Schema.optional(Schema.Array(SuggestedActionSchema)),
}).annotate({
  identifier: "JsonErrorEnvelope",
  title: "JSON Error Envelope",
  description: "Structured JSON error envelope for machine-readable CLI error output.",
});
export type JsonErrorEnvelope = typeof JsonErrorEnvelopeSchema.Type;

export const JsonSuccessEnvelopeSchema = Schema.Struct({
  ok: Schema.Literal(true),
  result: Schema.Unknown,
  summary: Schema.optional(Schema.String),
  suggestions: Schema.optional(Schema.Array(SuggestedActionSchema)),
}).annotate({
  identifier: "JsonSuccessEnvelope",
  title: "JSON Success Envelope",
  description: "Structured JSON success envelope for machine-readable CLI output.",
});
export type JsonSuccessEnvelope = typeof JsonSuccessEnvelopeSchema.Type;

export const JsonOperationFailureEnvelopeSchema = Schema.Struct({
  ok: Schema.Literal(false),
  result: Schema.Unknown,
  summary: Schema.optional(Schema.String),
  suggestions: Schema.optional(Schema.Array(SuggestedActionSchema)),
}).annotate({
  identifier: "JsonOperationFailureEnvelope",
  title: "JSON Operation Failure Envelope",
  description:
    "Structured result for an operation that completed its plan but reported failed or partial work.",
});
export type JsonOperationFailureEnvelope = typeof JsonOperationFailureEnvelopeSchema.Type;

export const JsonEnvelopeSchema = Schema.Union([
  JsonSuccessEnvelopeSchema,
  JsonOperationFailureEnvelopeSchema,
  JsonErrorEnvelopeSchema,
]).annotate({
  identifier: "JsonEnvelope",
  title: "JSON Envelope",
  description: "Structured JSON success or error envelope for machine-readable CLI output.",
});
export type JsonEnvelope = typeof JsonEnvelopeSchema.Type;

const normalizeResult = (payload: unknown): unknown => {
  if (
    typeof payload === "object" &&
    payload !== null &&
    !Array.isArray(payload) &&
    Object.keys(payload).length === 1 &&
    Object.hasOwn(payload, "result")
  ) {
    return Reflect.get(payload, "result");
  }
  return payload === undefined ? {} : payload;
};

export const makeJsonSuccessEnvelope = (args?: {
  readonly payload?: unknown;
  readonly ok?: boolean;
  readonly summary?: string;
  readonly suggestions?: ReadonlyArray<SuggestedAction>;
}): JsonSuccessEnvelope | JsonOperationFailureEnvelope => ({
  ok: args?.ok === false ? false : true,
  result: normalizeResult(args?.payload),
  ...(args?.summary !== undefined ? { summary: redactRegistryText(args.summary) } : {}),
  ...(args?.suggestions !== undefined && args.suggestions.length > 0
    ? { suggestions: args.suggestions.map((suggestion) => redactSuggestedAction(suggestion)) }
    : {}),
});

export const makeJsonErrorEnvelope = (args: {
  readonly code: AppErrorCode;
  readonly title: string;
  readonly detail: string;
  readonly cause?: ReadonlyArray<SerializedErrorCause>;
  readonly metadata?: FailureMetadata;
  readonly status?: "pending-human";
  readonly retryable?: boolean;
  readonly blockedOn?: "human";
  readonly action?: AppError["action"];
  readonly problem?: AppError["problem"];
  readonly suggestions?: ReadonlyArray<SuggestedAction>;
}): JsonErrorEnvelope => {
  const secrets = collectSensitiveStrings(args.metadata);
  return {
    ok: false,
    code: args.code,
    title: redactRegistryText(args.title, { secrets }),
    detail: redactRegistryText(args.detail, { secrets }),
    ...(args.problem !== undefined ? { problem: args.problem } : {}),
    ...(args.cause !== undefined && args.cause.length > 0
      ? {
          cause: args.cause.map((cause) => ({
            ...cause,
            message: redactRegistryText(cause.message, { secrets }),
            ...(cause.stack === undefined
              ? {}
              : { stack: redactRegistryText(cause.stack, { secrets }) }),
          })),
        }
      : {}),
    ...(args.metadata !== undefined
      ? { metadata: redactAppErrorMetadata(args.metadata, secrets) }
      : {}),
    ...(args.status !== undefined ? { status: args.status } : {}),
    ...(args.retryable !== undefined ? { retryable: args.retryable } : {}),
    ...(args.blockedOn !== undefined ? { blockedOn: args.blockedOn } : {}),
    ...(args.action !== undefined ? { action: args.action } : {}),
    ...(args.suggestions !== undefined && args.suggestions.length > 0
      ? {
          suggestions: args.suggestions.map((suggestion) =>
            redactSuggestedAction(suggestion, secrets),
          ),
        }
      : {}),
  };
};

export const makeJsonErrorEnvelopeFromAppError = (
  error: AppError,
  options: { readonly debug?: boolean } = {},
): JsonErrorEnvelope =>
  (() => {
    const secrets = collectSensitiveStrings(error.metadata);
    return makeJsonErrorEnvelope({
      code: error.code,
      title: error.title,
      detail: error.detail,
      cause: serializeErrorCauseChain(error.cause, {
        ...(options.debug === undefined ? {} : { debug: options.debug }),
        secrets,
      }),
      ...(error.metadata !== undefined ? { metadata: error.metadata } : {}),
      ...(error.status !== undefined ? { status: error.status } : {}),
      ...(error.retryable !== undefined ? { retryable: error.retryable } : {}),
      ...(error.blockedOn !== undefined ? { blockedOn: error.blockedOn } : {}),
      ...(error.action !== undefined ? { action: error.action } : {}),
      ...(error.problem !== undefined ? { problem: error.problem } : {}),
      suggestions: effectiveSuggestionsFor(error),
    });
  })();

import * as Schema from "effect/Schema";

import {
  AppErrorCodeSchema,
  type AppError,
  type AppErrorCode,
  type AppErrorMetadata,
  type SerializedErrorCause,
  serializeErrorCauseChain,
  effectiveSuggestionsFor,
  collectSensitiveStrings,
  redactAppErrorMetadata,
  redactSensitiveText,
  redactSuggestedAction,
} from "../app-error/index.js";
import { SuggestedActionSchema, type SuggestedAction } from "./suggested-action.js";

export const JsonErrorEnvelopeSchema = Schema.Struct({
  ok: Schema.Literal(false),
  code: AppErrorCodeSchema,
  title: Schema.String,
  detail: Schema.String,
  cause: Schema.optional(
    Schema.Array(
      Schema.Struct({
        _tag: Schema.String,
        code: Schema.optional(AppErrorCodeSchema),
        message: Schema.String,
        stack: Schema.optional(Schema.String),
      }),
    ),
  ),
  metadata: Schema.optional(
    Schema.Struct({
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
    }),
  ),
  blockedOn: Schema.optional(Schema.Literal("human")),
  action: Schema.optional(
    Schema.Struct({
      kind: Schema.Literal("open-url"),
      url: Schema.String,
      code: Schema.optional(Schema.String),
      expiresAt: Schema.optional(Schema.String),
      resume: Schema.optional(Schema.String),
    }),
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
  ...(args?.summary !== undefined ? { summary: redactSensitiveText(args.summary) } : {}),
  ...(args?.suggestions !== undefined && args.suggestions.length > 0
    ? { suggestions: args.suggestions.map((suggestion) => redactSuggestedAction(suggestion)) }
    : {}),
});

export const makeJsonErrorEnvelope = (args: {
  readonly code: AppErrorCode;
  readonly title: string;
  readonly detail: string;
  readonly cause?: ReadonlyArray<SerializedErrorCause>;
  readonly metadata?: AppErrorMetadata;
  readonly blockedOn?: "human";
  readonly action?: AppError["action"];
  readonly suggestions?: ReadonlyArray<SuggestedAction>;
}): JsonErrorEnvelope => {
  const secrets = collectSensitiveStrings(args.metadata);
  return {
    ok: false,
    code: args.code,
    title: redactSensitiveText(args.title, { secrets }),
    detail: redactSensitiveText(args.detail, { secrets }),
    ...(args.cause !== undefined && args.cause.length > 0
      ? {
          cause: args.cause.map((cause) => ({
            ...cause,
            message: redactSensitiveText(cause.message, { secrets }),
            ...(cause.stack === undefined
              ? {}
              : { stack: redactSensitiveText(cause.stack, { secrets }) }),
          })),
        }
      : {}),
    ...(args.metadata !== undefined
      ? { metadata: redactAppErrorMetadata(args.metadata, secrets) }
      : {}),
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
      ...(error.blockedOn !== undefined ? { blockedOn: error.blockedOn } : {}),
      ...(error.action !== undefined ? { action: error.action } : {}),
      suggestions: effectiveSuggestionsFor(error),
    });
  })();

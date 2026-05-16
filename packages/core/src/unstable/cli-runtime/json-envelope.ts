import * as Schema from "effect/Schema";

import {
  AppErrorCodeSchema,
  type AppError,
  type AppErrorCode,
  type AppErrorMetadata,
  effectiveSuggestionsFor,
} from "../app-error/index.js";
import { SuggestedActionSchema, type SuggestedAction } from "./suggested-action.js";

const ReservedSuccessEnvelopeKeys = new Set(["ok", "summary", "suggestions"]);

export const JsonErrorEnvelopeSchema = Schema.Struct({
  ok: Schema.Literal(false),
  code: AppErrorCodeSchema,
  title: Schema.String,
  detail: Schema.String,
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
    }),
  ),
  suggestions: Schema.optional(Schema.Array(SuggestedActionSchema)),
}).annotate({
  identifier: "JsonErrorEnvelope",
  title: "JSON Error Envelope",
  description: "Structured JSON error envelope for machine-readable CLI error output.",
});
export type JsonErrorEnvelope = typeof JsonErrorEnvelopeSchema.Type;

export const JsonSuccessEnvelopeSchema = Schema.StructWithRest(
  Schema.Struct({
    ok: Schema.Literal(true),
    summary: Schema.optional(Schema.String),
    suggestions: Schema.optional(Schema.Array(SuggestedActionSchema)),
  }),
  [Schema.Record(Schema.String, Schema.Unknown)],
).annotate({
  identifier: "JsonSuccessEnvelope",
  title: "JSON Success Envelope",
  description: "Structured JSON success envelope for machine-readable CLI output.",
});
export type JsonSuccessEnvelope = typeof JsonSuccessEnvelopeSchema.Type;

export const JsonEnvelopeSchema = Schema.Union([
  JsonSuccessEnvelopeSchema,
  JsonErrorEnvelopeSchema,
]).annotate({
  identifier: "JsonEnvelope",
  title: "JSON Envelope",
  description: "Structured JSON success or error envelope for machine-readable CLI output.",
});
export type JsonEnvelope = typeof JsonEnvelopeSchema.Type;

const ensurePayloadObject = (payload: unknown): Record<string, unknown> => {
  if (payload === undefined) {
    return {};
  }
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return { value: payload };
  }
  return Object.fromEntries(Object.entries(payload));
};

const ensureNoReservedPayloadKeys = (payload: Record<string, unknown>): void => {
  for (const key of Object.keys(payload)) {
    if (ReservedSuccessEnvelopeKeys.has(key)) {
      throw new Error(`JSON success payload cannot include reserved key: ${key}`);
    }
  }
};

export const makeJsonSuccessEnvelope = (args?: {
  readonly payload?: unknown;
  readonly summary?: string;
  readonly suggestions?: ReadonlyArray<SuggestedAction>;
}): JsonSuccessEnvelope => ({
  ok: true,
  ...(() => {
    const payload = ensurePayloadObject(args?.payload);
    ensureNoReservedPayloadKeys(payload);
    return payload;
  })(),
  ...(args?.summary !== undefined ? { summary: args.summary } : {}),
  ...(args?.suggestions !== undefined && args.suggestions.length > 0
    ? { suggestions: [...args.suggestions] }
    : {}),
});

export const makeJsonErrorEnvelope = (args: {
  readonly code: AppErrorCode;
  readonly title: string;
  readonly detail: string;
  readonly metadata?: AppErrorMetadata;
  readonly suggestions?: ReadonlyArray<SuggestedAction>;
}): JsonErrorEnvelope => ({
  ok: false,
  code: args.code,
  title: args.title,
  detail: args.detail,
  ...(args.metadata !== undefined ? { metadata: args.metadata } : {}),
  ...(args.suggestions !== undefined && args.suggestions.length > 0
    ? { suggestions: [...args.suggestions] }
    : {}),
});

export const makeJsonErrorEnvelopeFromAppError = (error: AppError): JsonErrorEnvelope =>
  makeJsonErrorEnvelope({
    code: error.code,
    title: error.title,
    detail: error.detail,
    ...(error.metadata !== undefined ? { metadata: error.metadata } : {}),
    suggestions: effectiveSuggestionsFor(error),
  });

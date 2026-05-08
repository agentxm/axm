import * as Schema from "effect/Schema";

import { AppErrorCategories, type AppError, type AppErrorCategory } from "../app-error/index.js";
import { BreadcrumbSchema, type Breadcrumb } from "./breadcrumb.js";

const ReservedSuccessEnvelopeKeys = new Set(["ok", "summary", "breadcrumbs"]);

export const JsonErrorEnvelopeSchema = Schema.Struct({
  ok: Schema.Literal(false),
  code: Schema.String,
  category: Schema.Literals(AppErrorCategories),
  message: Schema.String,
  retryable: Schema.optional(Schema.Boolean),
  httpStatus: Schema.optional(Schema.Number),
  breadcrumbs: Schema.optional(Schema.Array(BreadcrumbSchema)),
  exitCode: Schema.Number,
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
    breadcrumbs: Schema.optional(Schema.Array(BreadcrumbSchema)),
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
  readonly breadcrumbs?: ReadonlyArray<Breadcrumb>;
}): JsonSuccessEnvelope => ({
  ok: true,
  ...(() => {
    const payload = ensurePayloadObject(args?.payload);
    ensureNoReservedPayloadKeys(payload);
    return payload;
  })(),
  ...(args?.summary !== undefined ? { summary: args.summary } : {}),
  ...(args?.breadcrumbs !== undefined && args.breadcrumbs.length > 0
    ? { breadcrumbs: [...args.breadcrumbs] }
    : {}),
});

export const makeJsonErrorEnvelope = (args: {
  readonly code: string;
  readonly category: AppErrorCategory;
  readonly message: string;
  readonly retryable?: boolean;
  readonly httpStatus?: number;
  readonly breadcrumbs?: ReadonlyArray<Breadcrumb>;
  readonly exitCode: number;
}): JsonErrorEnvelope => ({
  ok: false,
  code: args.code,
  category: args.category,
  message: args.message,
  ...(args.retryable !== undefined ? { retryable: args.retryable } : {}),
  ...(args.httpStatus !== undefined ? { httpStatus: args.httpStatus } : {}),
  ...(args.breadcrumbs !== undefined && args.breadcrumbs.length > 0
    ? { breadcrumbs: [...args.breadcrumbs] }
    : {}),
  exitCode: args.exitCode,
});

export const makeJsonErrorEnvelopeFromAppError = (
  error: AppError,
  exitCode: number,
): JsonErrorEnvelope =>
  makeJsonErrorEnvelope({
    code: error.code,
    category: error.category,
    message: error.what,
    ...(error.retryable !== undefined ? { retryable: error.retryable } : {}),
    ...(error.httpStatus !== undefined ? { httpStatus: error.httpStatus } : {}),
    breadcrumbs: error.breadcrumbs ?? [],
    exitCode,
  });

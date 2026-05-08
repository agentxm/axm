import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import type { AppError } from "../app-error/index.js";
import { BreadcrumbSchema, type Breadcrumb } from "./breadcrumb.js";

export const JsonErrorEnvelopeSchema = Schema.Struct({
  ok: Schema.Literal(false),
  code: Schema.String,
  message: Schema.String,
  details: Schema.optional(Schema.Array(Schema.String)),
  howToFix: Schema.optional(Schema.String),
  breadcrumbs: Schema.optional(Schema.Array(BreadcrumbSchema)),
  exitCode: Schema.Number,
}).annotate({
  identifier: "JsonErrorEnvelope",
  title: "JSON Error Envelope",
  description: "Structured JSON error envelope for machine-readable CLI error output.",
});
export type JsonErrorEnvelope = typeof JsonErrorEnvelopeSchema.Type;

export const JsonSuccessEnvelopeSchema = Schema.Struct({
  ok: Schema.Literal(true),
  data: Schema.optional(Schema.Unknown),
  summary: Schema.optional(Schema.String),
  breadcrumbs: Schema.optional(Schema.Array(BreadcrumbSchema)),
}).annotate({
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

export const makeJsonSuccessEnvelope = (args?: {
  readonly data?: unknown;
  readonly summary?: string;
  readonly breadcrumbs?: ReadonlyArray<Breadcrumb>;
}): JsonSuccessEnvelope => ({
  ok: true,
  ...(args?.data !== undefined ? { data: args.data } : {}),
  ...(args?.summary !== undefined ? { summary: args.summary } : {}),
  ...(args?.breadcrumbs !== undefined && args.breadcrumbs.length > 0
    ? { breadcrumbs: [...args.breadcrumbs] }
    : {}),
});

export const makeJsonErrorEnvelope = (args: {
  readonly code: string;
  readonly message: string;
  readonly details?: ReadonlyArray<string>;
  readonly howToFix?: string;
  readonly breadcrumbs?: ReadonlyArray<Breadcrumb>;
  readonly exitCode: number;
}): JsonErrorEnvelope => ({
  ok: false,
  code: args.code,
  message: args.message,
  ...(args.details !== undefined && args.details.length > 0 ? { details: [...args.details] } : {}),
  ...(args.howToFix !== undefined ? { howToFix: args.howToFix } : {}),
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
    message: error.what,
    details: error.details,
    ...(Option.isSome(error.howToFix) ? { howToFix: error.howToFix.value } : {}),
    breadcrumbs: error.breadcrumbs ?? [],
    exitCode,
  });

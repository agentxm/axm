import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import type { AppError } from "../app-error/index.js";

export const JsonSchemaVersion = 1;

export const JsonSchemaVersionSchema = Schema.Literal(JsonSchemaVersion);

export const JsonErrorEnvelopeSchema = Schema.Struct({
  schemaVersion: JsonSchemaVersionSchema,
  type: Schema.Literal("error"),
  code: Schema.String,
  message: Schema.String,
  details: Schema.optional(Schema.Array(Schema.String)),
  howToFix: Schema.optional(Schema.String),
  exitCode: Schema.Number,
});
export type JsonErrorEnvelope = typeof JsonErrorEnvelopeSchema.Type;

export const makeJsonErrorEnvelope = (args: {
  readonly code: string;
  readonly message: string;
  readonly details?: ReadonlyArray<string>;
  readonly howToFix?: string;
  readonly exitCode: number;
}): JsonErrorEnvelope => ({
  schemaVersion: JsonSchemaVersion,
  type: "error",
  code: args.code,
  message: args.message,
  ...(args.details !== undefined && args.details.length > 0 ? { details: [...args.details] } : {}),
  ...(args.howToFix !== undefined ? { howToFix: args.howToFix } : {}),
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
    exitCode,
  });

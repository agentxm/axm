import * as Schema from "effect/Schema";

import { OperationEventSchema, type OperationEvent } from "@agentxm/workspace-operations";

import { redactSensitiveValue } from "../app-error/secret-redaction.js";

/**
 * One lifecycle event of a running operation, written to stderr as it
 * happens. The `event` is the published lifecycle contract: `seq` increases
 * strictly within one operation and exactly one `OperationSettled` event
 * precedes the result document.
 */
export const ProgressEventSchema = Schema.Struct({
  type: Schema.Literal("progress"),
  event: OperationEventSchema,
}).annotate({ identifier: "ProgressEvent" });
export type ProgressEvent = typeof ProgressEventSchema.Type;

export const LogEventSchema = Schema.Struct({
  type: Schema.Literal("log"),
  level: Schema.Literals(["info", "warn", "error"] as const),
  message: Schema.String,
}).annotate({ identifier: "LogEvent" });
export type LogEvent = typeof LogEventSchema.Type;

export const ErrorEventSchema = Schema.Struct({
  type: Schema.Literal("error"),
  code: Schema.String,
  message: Schema.String,
  reason: Schema.optional(Schema.String),
  signal: Schema.optional(Schema.Literals(["SIGINT", "SIGTERM"] as const)),
}).annotate({ identifier: "ErrorEvent" });
export type ErrorEvent = typeof ErrorEventSchema.Type;

export const SuggestionEventSchema = Schema.Struct({
  type: Schema.Literal("suggestion"),
  description: Schema.String,
  cmd: Schema.optional(Schema.String),
  url: Schema.optional(Schema.String),
}).annotate({ identifier: "SuggestionEvent" });
export type SuggestionEvent = typeof SuggestionEventSchema.Type;

export const InstructionEventSchema = Schema.Struct({
  type: Schema.Literal("instruction"),
  message: Schema.String,
}).annotate({ identifier: "InstructionEvent" });
export type InstructionEvent = typeof InstructionEventSchema.Type;

export const MachineEventSchema = Schema.Union([
  ProgressEventSchema,
  LogEventSchema,
  ErrorEventSchema,
  SuggestionEventSchema,
  InstructionEventSchema,
]).annotate({ identifier: "MachineEvent" });
export type MachineEvent = typeof MachineEventSchema.Type;

const encodeOperationEvent = Schema.encodeSync(OperationEventSchema);

export const progressEvent = (event: OperationEvent): ProgressEvent => ({
  type: "progress",
  event: encodeOperationEvent(event),
});

export const logEvent = (level: LogEvent["level"], message: string): LogEvent => ({
  type: "log",
  level,
  message,
});

export const errorEvent = (
  code: string,
  message: string,
  detail?: Pick<ErrorEvent, "reason" | "signal">,
): ErrorEvent => ({ type: "error", code, message, ...detail });

export const suggestionEvent = (suggestion: {
  readonly description: string;
  readonly cmd?: string | undefined;
  readonly url?: string | undefined;
}): SuggestionEvent => ({
  type: "suggestion",
  description: suggestion.description,
  ...(suggestion.cmd === undefined ? {} : { cmd: suggestion.cmd }),
  ...(suggestion.url === undefined ? {} : { url: suggestion.url }),
});

export const instructionEvent = (message: string): InstructionEvent => ({
  type: "instruction",
  message,
});

export const encodeMachineEvent = (event: MachineEvent): string =>
  `${JSON.stringify(redactSensitiveValue(event))}\n`;

import * as Schema from "effect/Schema";

import { redactSensitiveValue } from "../app-error/secret-redaction.js";

export const ProgressEventSchema = Schema.Struct({
  type: Schema.Literal("progress"),
  phase: Schema.String,
  percent: Schema.Number,
  message: Schema.String,
  unit: Schema.optional(Schema.String),
  state: Schema.optional(Schema.String),
  reason: Schema.optional(Schema.String),
  atMs: Schema.optional(Schema.Number),
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

export type MachineEvent =
  ProgressEvent | LogEvent | ErrorEvent | SuggestionEvent | InstructionEvent;

export const progressEvent = (
  phase: string,
  percent: number,
  message: string,
  detail?: Omit<ProgressEvent, "type" | "phase" | "percent" | "message">,
): ProgressEvent => ({ type: "progress", phase, percent, message, ...detail });

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

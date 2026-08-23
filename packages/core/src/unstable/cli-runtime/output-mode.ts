import * as Console from "effect/Console";
import * as Schema from "effect/Schema";
import type { SuggestedAction } from "./suggested-action.js";
import { redactSensitiveText, redactSuggestedAction } from "../app-error/secret-redaction.js";

// ---------------------------------------------------------------------------
// Output format
// ---------------------------------------------------------------------------

export type OutputFormat = "text" | "json";

// ---------------------------------------------------------------------------
// NDJSON event schemas — typed contract for machine-mode stderr events
//
// Machine mode emits a sequence of independently-parseable JSON lines (NDJSON)
// on stderr. Each line has a "type" discriminator so consumers can route
// events without buffering the full stream:
//
//   progress → drive progress bars (phase, percent, message)
//   log      → informational messages at different severity levels
//   error    → typed error with stable code for programmatic handling
// ---------------------------------------------------------------------------

export const ProgressEventSchema = Schema.Struct({
  type: Schema.Literal("progress"),
  phase: Schema.String,
  percent: Schema.Number,
  message: Schema.String,
  /** Unit identity, terminal state, waiting reason, and a monotonic timestamp for lifecycle progress. */
  unit: Schema.optional(Schema.String),
  state: Schema.optional(Schema.String),
  reason: Schema.optional(Schema.String),
  atMs: Schema.optional(Schema.Number),
}).annotate({
  identifier: "ProgressEvent",
  title: "Progress Event",
  description: "NDJSON progress event for driving progress bars in machine mode.",
});
export type ProgressEvent = typeof ProgressEventSchema.Type;

export const LogEventSchema = Schema.Struct({
  type: Schema.Literal("log"),
  level: Schema.Literals(["info", "warn", "error"] as const).annotate({
    identifier: "LogLevel",
    title: "Log Level",
    description: "Severity level for log events.",
  }),
  message: Schema.String,
}).annotate({
  identifier: "LogEvent",
  title: "Log Event",
  description: "NDJSON log event for informational messages at different severity levels.",
});
export type LogEvent = typeof LogEventSchema.Type;

export const ErrorEventSchema = Schema.Struct({
  type: Schema.Literal("error"),
  code: Schema.String,
  message: Schema.String,
}).annotate({
  identifier: "ErrorEvent",
  title: "Error Event",
  description: "NDJSON error event with a stable error code for programmatic handling.",
});
export type ErrorEvent = typeof ErrorEventSchema.Type;

/**
 * Construct an NDJSON `error` event — the single source of truth for the
 * machine-mode error event shape. The full structured detail (title, metadata,
 * suggestions) lives in the stdout envelope; the stream event carries only the
 * stable `code` and a human `message`.
 */
export const makeErrorEvent = (code: string, message: string): ErrorEvent => ({
  type: "error",
  code,
  message: redactSensitiveText(message),
});

export const SuggestionEventSchema = Schema.Struct({
  type: Schema.Literal("suggestion"),
  description: Schema.String,
  cmd: Schema.optional(Schema.String),
  url: Schema.optional(Schema.String),
}).annotate({
  identifier: "SuggestionEvent",
  title: "Suggestion Event",
  description: "NDJSON suggestion event with a suggested follow-up.",
});
export type SuggestionEvent = typeof SuggestionEventSchema.Type;

/**
 * Construct an NDJSON `suggestion` event — the single source of truth for the
 * machine-mode suggestion event shape, shared by the renderer and error paths.
 */
export const makeSuggestionEvent = (suggestion: SuggestedAction): SuggestionEvent => {
  const redacted = redactSuggestedAction(suggestion);
  return {
    type: "suggestion",
    description: redacted.description,
    ...(redacted.cmd !== undefined ? { cmd: redacted.cmd } : {}),
    ...(redacted.url !== undefined ? { url: redacted.url } : {}),
  };
};

export type StreamEvent = ProgressEvent | LogEvent | ErrorEvent | SuggestionEvent;

// ---------------------------------------------------------------------------
// Event emitter — writes a single NDJSON line to stderr
// ---------------------------------------------------------------------------

export const emitEvent = (event: StreamEvent) => Console.error(JSON.stringify(event));

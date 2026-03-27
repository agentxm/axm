import * as Console from "effect/Console";
import * as Schema from "effect/Schema";

// ---------------------------------------------------------------------------
// Output format
// ---------------------------------------------------------------------------

export type OutputFormat = "text" | "json" | "stream-json";

// ---------------------------------------------------------------------------
// NDJSON stream event schemas — typed contract for stream-json mode
//
// In stream-json mode, stdout carries a sequence of independently-parseable
// JSON lines (NDJSON). Each line has a "type" discriminator so consumers can
// route events without buffering the full stream:
//
//   progress → drive progress bars (phase, percent, message)
//   log      → informational messages at different severity levels
//   error    → typed error with stable code for programmatic handling
//   result   → final output (emitted last, wraps command-specific data)
// ---------------------------------------------------------------------------

export const ProgressEventSchema = Schema.Struct({
  type: Schema.Literal("progress"),
  phase: Schema.String,
  percent: Schema.Number,
  message: Schema.String,
});
export type ProgressEvent = typeof ProgressEventSchema.Type;

export const LogEventSchema = Schema.Struct({
  type: Schema.Literal("log"),
  level: Schema.Literals(["info", "warn", "error"] as const),
  message: Schema.String,
});
export type LogEvent = typeof LogEventSchema.Type;

export const ErrorEventSchema = Schema.Struct({
  type: Schema.Literal("error"),
  code: Schema.String,
  message: Schema.String,
  details: Schema.optional(Schema.Array(Schema.String)),
});
export type ErrorEvent = typeof ErrorEventSchema.Type;

export type StreamEvent = ProgressEvent | LogEvent | ErrorEvent;

// ---------------------------------------------------------------------------
// Event emitter — writes a single NDJSON line to stdout
// ---------------------------------------------------------------------------

export const emitEvent = (event: StreamEvent) => Console.log(JSON.stringify(event));

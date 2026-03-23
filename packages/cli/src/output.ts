import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
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
//   result   → final output (emitted by writeOutput, always last)
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
// Format resolution
//
// Resolution cascade:
//   1. Explicit --output-format flag (user override)
//   2. TTY → "text" (interactive terminal)
//   3. Pipe + instant command → "json" (single parseable object)
//   4. Pipe + long-running command → "stream-json" (NDJSON with progress)
// ---------------------------------------------------------------------------

export const resolveOutputFormat = (
  explicit: Option.Option<OutputFormat>,
  isLongRunning: boolean = false,
): OutputFormat =>
  Option.getOrElse(explicit, () =>
    process.stdout.isTTY ? "text" : isLongRunning ? "stream-json" : "json",
  );

// ---------------------------------------------------------------------------
// Output helpers
// ---------------------------------------------------------------------------

export const writeOutput = <S extends Schema.Encoder<unknown>>(
  format: OutputFormat,
  schema: S,
  data: S["Type"],
  textRenderer: (data: S["Type"]) => string,
): Effect.Effect<void> =>
  Effect.gen(function* () {
    switch (format) {
      case "text":
        yield* Console.log(textRenderer(data));
        break;
      case "json": {
        const encoded = Schema.encodeSync(schema)(data);
        yield* Console.log(JSON.stringify(encoded));
        break;
      }
      case "stream-json": {
        const encoded = Schema.encodeSync(schema)(data);
        yield* Console.log(JSON.stringify({ type: "result", data: encoded }));
        break;
      }
    }
  });

export const emitEvent = (event: StreamEvent): Effect.Effect<void> =>
  Console.log(JSON.stringify(event));

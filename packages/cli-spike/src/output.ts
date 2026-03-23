// ==========================================================================
// output.ts — Structured output system
//
// Every command produces output in one of three modes:
//   text        → human-readable (colors, tables, symbols) for TTY terminals
//   json        → single JSON object/array for instant commands piped to tools
//   stream-json → NDJSON (one JSON object per line) for long-running ops
//
// The mode is resolved once per command invocation:
//   1. Explicit --output-format flag takes precedence
//   2. TTY detection: stdout is TTY → text, pipe → json or stream-json
//   3. Long-running commands default to stream-json when piped (not json)
//      because they emit incremental progress events before the final result
//
// All JSON output is encoded through Effect Schema to enforce the published
// contract. This means adding a field to the schema type-checks the encoder,
// and consumers can trust the shape won't drift from the type definition.
//
// See contributing/guides/cli-design.md#structured-output-contracts for the
// full design rationale and anti-patterns to avoid.
// ==========================================================================
import * as Schema from "effect/Schema";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

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
//
// Desktop apps parse these line-by-line to update UI in real time.
// All events go to stdout (not stderr) because NDJSON requires a single
// ordered stream — stderr is reserved for unstructured diagnostics.
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
//
// The isLongRunning parameter is set by the command handler — it controls
// whether piped output defaults to json (parseable after completion) or
// stream-json (parseable line-by-line during execution).
// ---------------------------------------------------------------------------

/**
 * Resolve output format from explicit flag, falling back to TTY detection.
 * Pipe → json for instant commands, stream-json for long-running.
 */
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

/**
 * Write command output routed by format. Every command calls this once at
 * the end to emit its result.
 *
 * Schema encoding is used even for mock/simple data to enforce the published
 * contract — if the schema and the data diverge, encoding fails at dev time
 * rather than silently shipping broken JSON to consumers.
 *
 * In stream-json mode, the result is wrapped in { type: "result", data }
 * to distinguish it from progress/log events in the NDJSON stream. The
 * "result" event is always the last line — consumers can stop reading after
 * seeing it.
 *
 * The textRenderer is a pure function (data → string) kept separate from
 * the command handler for testability. Each command defines its own renderer
 * co-located with the command file.
 */
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
        // Bare object/array — no envelope. Consumers parse with JSON.parse().
        const encoded = Schema.encodeSync(schema)(data);
        yield* Console.log(JSON.stringify(encoded));
        break;
      }
      case "stream-json": {
        // Wrapped with { type: "result" } so consumers can distinguish the
        // final result from earlier progress/log events in the NDJSON stream.
        const encoded = Schema.encodeSync(schema)(data);
        yield* Console.log(JSON.stringify({ type: "result", data: encoded }));
        break;
      }
    }
  });

/**
 * Emit a single NDJSON event line to stdout (stream-json mode).
 *
 * Events go to stdout (not stderr) because NDJSON requires all structured
 * data on a single ordered stream. Desktop apps parse stdout line-by-line;
 * stderr is only for unstructured diagnostics they don't parse.
 */
export const emitEvent = (event: StreamEvent): Effect.Effect<void> =>
  Console.log(JSON.stringify(event));

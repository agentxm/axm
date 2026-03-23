import * as Schema from "effect/Schema"
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

// ---------------------------------------------------------------------------
// Output format
// ---------------------------------------------------------------------------

export type OutputFormat = "text" | "json" | "stream-json";

// ---------------------------------------------------------------------------
// NDJSON stream event schemas — typed contract for stream-json mode
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
 * Write command output routed by format. Encodes data through the schema
 * in json/stream-json modes so the output matches the published contract.
 * - text: human-readable via textRenderer
 * - json: schema-encoded JSON to stdout
 * - stream-json: schema-encoded JSON wrapped with { type: "result" }
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

/**
 * Emit a single NDJSON event line to stdout (stream-json mode).
 * Events are typed by the individual event schemas above.
 */
export const emitEvent = (event: StreamEvent): Effect.Effect<void> =>
  Console.log(JSON.stringify(event));

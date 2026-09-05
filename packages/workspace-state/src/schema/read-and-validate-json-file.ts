import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { formatSchemaIssuesToLines } from "@agentxm/extension-model/unstable/schema-issues";
import type { JsonFileReadResult } from "./types.js";

/**
 * Extract a human-readable location string from a JSON `SyntaxError`.
 *
 * Returns `Option.some("at position N")` or `Option.some("line N column N")`
 * when the engine includes position information, otherwise `Option.none()`.
 */
const extractParseErrorLocation = (error: unknown): Option.Option<string> => {
  if (error instanceof SyntaxError && typeof error.message === "string") {
    const posMatch = /at position (\d+)/.exec(error.message);
    if (posMatch !== null) {
      return Option.some(`at position ${posMatch[1]}`);
    }
    const lineMatch = /line (\d+) column (\d+)/.exec(error.message);
    if (lineMatch !== null) {
      return Option.some(`line ${lineMatch[1]} column ${lineMatch[2]}`);
    }
  }
  return Option.none();
};

/**
 * Read a JSON file, parse it, and validate it against a schema.
 *
 * Returns a {@link JsonFileReadResult} discriminated union so callers can
 * decide how to present each failure mode (missing file, I/O error, malformed
 * JSON, schema mismatch) without catching exceptions.
 *
 * @param filePath - Absolute path to the JSON file.
 * @param schema   - Effect Schema to validate the parsed JSON against.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const readAndValidateJsonFile = <S extends Schema.Top>(
  filePath: string,
  schema: S,
  options?: { readonly maxSchemaIssues?: number },
): Effect.Effect<
  JsonFileReadResult<S["Type"]>,
  never,
  FileSystem.FileSystem | S["DecodingServices"]
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;

    // 1. Check existence
    const existsResult = yield* Effect.result(fs.exists(filePath));
    if (existsResult._tag === "Failure") {
      return {
        _tag: "read-failure",
        error: `Failed to check if file exists: ${String(existsResult.failure)}`,
      } as const;
    }
    if (!existsResult.success) {
      return { _tag: "missing" } as const;
    }

    // 2. Read file
    const readResult = yield* Effect.result(fs.readFileString(filePath));
    if (readResult._tag === "Failure") {
      return {
        _tag: "read-failure",
        error: `Failed to read file: ${String(readResult.failure)}`,
      } as const;
    }

    // 3. Parse JSON
    const parseResult = yield* Effect.result(
      Effect.try({
        try: (): unknown => JSON.parse(readResult.success),
        catch: (error) => {
          const message = error instanceof Error ? error.message : String(error);
          const location = Option.getOrUndefined(extractParseErrorLocation(error));
          return { message, location };
        },
      }),
    );
    if (parseResult._tag === "Failure") {
      const failure = parseResult.failure;
      return {
        _tag: "unparseable",
        error: failure.message,
        ...(failure.location !== undefined ? { location: failure.location } : {}),
      } as const;
    }

    // 4. Validate against schema
    const decoded = yield* Effect.result(Schema.decodeUnknownEffect(schema)(parseResult.success));
    if (decoded._tag === "Failure") {
      return {
        _tag: "schema-invalid",
        issues: formatSchemaIssuesToLines(decoded.failure.issue, options?.maxSchemaIssues),
      } as const;
    }

    return { _tag: "ok", value: decoded.success } as const;
  });

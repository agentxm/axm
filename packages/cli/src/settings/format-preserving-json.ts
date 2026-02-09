/**
 * Format-preserving JSON modification utilities.
 *
 * Detects and preserves existing formatting (indentation, line endings)
 * when modifying JSON files using jsonc-parser's surgical edit operations.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as FileSystem from "@effect/platform/FileSystem";
import * as Effect from "effect/Effect";
import { applyEdits, modify } from "jsonc-parser";
import type { FormattingOptions } from "jsonc-parser";
import { SettingsWriteError } from "./settings.js";

// -----------------------------------------------------------------------------
// Formatting Detection
// -----------------------------------------------------------------------------

/**
 * Detected formatting options including EOL style.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface DetectedFormatting extends FormattingOptions {
  readonly eol: string;
}

/**
 * Detect formatting (indentation and line endings) from existing JSON text.
 *
 * Scans for the first indented line to determine tab vs space indentation
 * and tab size. Detects CRLF vs LF line endings.
 *
 * Falls back to 2-space indentation with LF line endings.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const detectFormatting = (text: string): DetectedFormatting => {
  // Detect EOL: if \r\n appears, use CRLF, else LF
  const eol = text.includes("\r\n") ? "\r\n" : "\n";

  // Detect indentation: find first line that starts with whitespace
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^(\s+)/);
    if (match) {
      const indent = match[1]!;
      if (indent.startsWith("\t")) {
        return { tabSize: 1, insertSpaces: false, eol };
      }
      return { tabSize: indent.length, insertSpaces: true, eol };
    }
  }

  // Default: 2-space, LF
  return { tabSize: 2, insertSpaces: true, eol };
};

// -----------------------------------------------------------------------------
// Format-Preserving Modification
// -----------------------------------------------------------------------------

/**
 * A single JSON modification: set or remove a value at a path.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface JsonModification {
  readonly path: ReadonlyArray<string | number>;
  readonly value: unknown;
}

/**
 * Read a JSON file, apply surgical modifications preserving formatting, and write back.
 *
 * Each modification targets a JSON path and sets (or removes via `undefined`) a value.
 * Modifications are applied sequentially since each edit may shift offsets.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const modifyJsonFile = (filePath: string, modifications: ReadonlyArray<JsonModification>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;

    // Read raw text
    let text = yield* fs.readFileString(filePath).pipe(
      Effect.mapError(
        (error) =>
          new SettingsWriteError({
            path: filePath,
            message: `Failed to read file for modification: ${filePath}`,
            cause: error,
          }),
      ),
    );

    // Detect formatting from existing content
    const formatting = detectFormatting(text);

    // Apply each modification sequentially (each edit may shift offsets)
    for (const mod of modifications) {
      const edits = modify(text, [...mod.path], mod.value, { formattingOptions: formatting });
      text = applyEdits(text, edits);
    }

    // Write back
    yield* fs.writeFileString(filePath, text).pipe(
      Effect.mapError(
        (error) =>
          new SettingsWriteError({
            path: filePath,
            message: `Failed to write modified file: ${filePath}`,
            cause: error,
          }),
      ),
    );
  });

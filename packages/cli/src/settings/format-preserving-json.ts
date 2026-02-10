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
import { applyEdits, findNodeAtLocation, modify, parseTree } from "jsonc-parser";
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
// Surgical Property Insertion
// -----------------------------------------------------------------------------

/**
 * Ensure a top-level property exists in JSON text without reformatting siblings.
 *
 * `jsonc-parser`'s `modify` rewrites all sibling content when inserting a new
 * top-level property, which can reformat compact arrays into multi-line. This
 * function inserts the property by direct text manipulation, leaving all
 * existing content byte-for-byte identical.
 *
 * Returns the text unchanged if the property already exists.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const ensureTopLevelProperty = (
  text: string,
  key: string,
  defaultValue: unknown,
  formatting: DetectedFormatting,
  keyOrder?: ReadonlyArray<string>,
): string => {
  const tree = parseTree(text);
  if (!tree || tree.type !== "object") return text;

  // Already exists — no-op
  if (findNodeAtLocation(tree, [key])) return text;

  const indent = formatting.insertSpaces ? " ".repeat(formatting.tabSize ?? 2) : "\t";
  const serialized = JSON.stringify(defaultValue);
  const newEntry = `${indent}"${key}": ${serialized}`;

  // When keyOrder is provided, try to insert at the correct position
  if (keyOrder && tree.children && tree.children.length > 0) {
    const keyIndex = keyOrder.indexOf(key);
    if (keyIndex !== -1) {
      // Find the first existing property that comes after `key` in the schema order
      for (const child of tree.children) {
        const childKey = child.children?.[0]?.value as string | undefined;
        if (!childKey) continue;
        const childIndex = keyOrder.indexOf(childKey);
        if (childIndex > keyIndex) {
          // Insert before this child's line
          const childOffset = child.offset;
          // Find the start of the line containing this property
          let lineStart = childOffset;
          while (lineStart > 0 && text[lineStart - 1] !== "\n") {
            lineStart--;
          }
          const before = text.substring(0, lineStart);
          const after = text.substring(lineStart);
          return `${before}${newEntry},${formatting.eol}${after}`;
        }
      }
    }
  }

  // Fall back: append at the end (before closing brace)
  const closingBrace = text.lastIndexOf("}");
  if (closingBrace === -1) return text;

  const hasProperties = (tree.children?.length ?? 0) > 0;

  const before = text.substring(0, closingBrace).trimEnd();
  const comma = hasProperties ? "," : "";
  const after = text.substring(closingBrace);

  return `${before}${comma}${formatting.eol}${newEntry}${formatting.eol}${after.trimStart()}`;
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

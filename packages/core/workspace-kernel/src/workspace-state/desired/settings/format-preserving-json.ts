/**
 * Format-preserving JSON modification utilities.
 *
 * Detects and preserves existing formatting (indentation, line endings)
 * when modifying JSON files using jsonc-parser's surgical edit operations.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as JsonPatch from "effect/JsonPatch";
import * as JsonPointer from "effect/JsonPointer";
import * as Option from "effect/Option";
import type * as Schema from "effect/Schema";
import { applyEdits, modify, type ModificationOptions } from "jsonc-parser";
import { deriveStructuralInverse } from "../../../locations/index.js";

/**
 * A single JSON modification: set or remove a value at a path.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface JsonModification {
  readonly path: ReadonlyArray<string | number>;
  readonly value: unknown;
}

export type JsonPointerPathResult =
  | {
      readonly _tag: "Success";
      readonly path: ReadonlyArray<string | number>;
    }
  | {
      readonly _tag: "Failure";
      readonly reason: "invalid_pointer" | "untranslatable_pointer";
    };

export interface ApplyJsonPatchOptions {
  readonly preserveInsertionBaseline?: boolean;
  readonly getInsertionIndex?: (
    path: ReadonlyArray<string | number>,
    properties: ReadonlyArray<string>,
  ) => number;
}

export type JsonPatchTextResult =
  | {
      readonly _tag: "Success";
      readonly text: string;
    }
  | {
      readonly _tag: "Failure";
      readonly reason: "invalid_pointer" | "untranslatable_pointer" | "edit_failed";
    };

const arrayIndexPattern = /^(0|[1-9][0-9]*)$/;

const isJsonArray = (value: Schema.Json): value is Schema.JsonArray => Array.isArray(value);

export const jsonPointerToJsonPath = (
  pointer: string,
  document: Schema.Json,
): JsonPointerPathResult => {
  if (pointer === "") return { _tag: "Success", path: [] };
  if (!pointer.startsWith("/")) return { _tag: "Failure", reason: "invalid_pointer" };

  const tokens = pointer.slice(1).split("/").map(JsonPointer.unescapeToken);
  const path: Array<string | number> = [];
  let current: Schema.Json | undefined = document;

  for (const [position, token] of tokens.entries()) {
    if (current === undefined) {
      return { _tag: "Failure", reason: "untranslatable_pointer" };
    }

    const isLast = position === tokens.length - 1;
    if (isJsonArray(current)) {
      if (!arrayIndexPattern.test(token)) {
        return { _tag: "Failure", reason: "untranslatable_pointer" };
      }
      const index = Number(token);
      if (!Number.isSafeInteger(index)) {
        return { _tag: "Failure", reason: "untranslatable_pointer" };
      }
      path.push(index);
      if (!isLast) current = current[index];
      continue;
    }

    if (typeof current === "object" && current !== null) {
      path.push(token);
      if (!isLast) current = current[token];
      continue;
    }

    return { _tag: "Failure", reason: "untranslatable_pointer" };
  }

  return { _tag: "Success", path };
};

export const applyJsonPatchToText = (
  text: string,
  document: Schema.Json,
  patch: JsonPatch.JsonPatch,
  options: ApplyJsonPatchOptions = {},
): JsonPatchTextResult => {
  let currentText = text;
  let currentDocument = document;

  for (const operation of patch) {
    const translated = jsonPointerToJsonPath(operation.path, currentDocument);
    if (translated._tag === "Failure") return translated;

    const value = operation.op === "remove" ? undefined : operation.value;
    const modificationOptions: ModificationOptions = {
      formattingOptions: {
        insertSpaces: true,
        tabSize: 2,
        eol: text.includes("\r\n") ? "\r\n" : "\n",
      },
      ...(options.getInsertionIndex === undefined
        ? {}
        : {
            getInsertionIndex: (properties: string[]) =>
              options.getInsertionIndex?.(translated.path, properties) ?? -1,
          }),
    };

    try {
      const formatted = applyEdits(
        currentText,
        modify(currentText, [...translated.path], value, modificationOptions),
      );
      // Formatting an insertion can rewrite a neighboring authored value. Keep
      // the formatted edit only when its inverse contains syntax alone.
      currentText =
        options.preserveInsertionBaseline === true &&
        operation.op === "add" &&
        Option.isNone(deriveStructuralInverse(currentText, formatted))
          ? applyEdits(
              currentText,
              modify(currentText, [...translated.path], value, {
                ...(modificationOptions.getInsertionIndex === undefined
                  ? {}
                  : { getInsertionIndex: modificationOptions.getInsertionIndex }),
              }),
            )
          : formatted;
      currentDocument = JsonPatch.apply([operation], currentDocument);
    } catch {
      return { _tag: "Failure", reason: "edit_failed" };
    }
  }

  return { _tag: "Success", text: currentText };
};

/**
 * Normalization and validation for ignored extension patterns.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import { makeAppError } from "../app-error/index.js";
import { expandGlob } from "../utils/glob.js";

/**
 * Normalize ignored patterns: trim whitespace, reject empty patterns, deduplicate.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const normalizeIgnoredPatterns = (patterns: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const trimmed = Array.map(patterns, (p) => p.trim());
    const invalid = Array.filter(trimmed, (p) => p.length === 0);
    if (invalid.length > 0) {
      return yield* makeAppError({
        code: "validation",
        message: "Ignored pattern is empty after trimming whitespace",
        breadcrumbs: [
          { task: "Recover", description: "Remove empty ignored patterns from settings" },
        ],
      });
    }
    return Array.dedupe(trimmed);
  });

/**
 * Validate that no configured extension names conflict with ignored patterns.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const validateIgnoredConfigConflicts = (
  configuredNames: ReadonlyArray<string>,
  ignoredPatterns: ReadonlyArray<string>,
) =>
  Effect.gen(function* () {
    if (configuredNames.length === 0 || ignoredPatterns.length === 0) return;
    const conflicts = Array.filter(configuredNames, (name) =>
      Array.some(ignoredPatterns, (pattern) => expandGlob(pattern, [name]).length > 0),
    );
    if (conflicts.length > 0) {
      return yield* makeAppError({
        code: "conflict",
        message: `Configured extensions conflict with ignored patterns: ${conflicts.join(", ")}`,
        breadcrumbs: [
          {
            task: "Recover",
            description:
              "Remove conflicting entries from either the configured extensions or the ignored patterns in settings",
          },
        ],
      });
    }
  });

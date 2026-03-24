/**
 * Format-preserving JSON modification utilities.
 *
 * Detects and preserves existing formatting (indentation, line endings)
 * when modifying JSON files using jsonc-parser's surgical edit operations.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

/**
 * A single JSON modification: set or remove a value at a path.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface JsonModification {
  readonly path: ReadonlyArray<string | number>;
  readonly value: unknown;
}

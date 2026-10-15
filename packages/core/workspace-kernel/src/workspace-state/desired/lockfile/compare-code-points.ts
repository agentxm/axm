/**
 * Code-point string order: the one sort order the lockfile uses for keys,
 * records, and rows, so every machine writes the same bytes. Locale collation
 * varies with the ICU build and is never used here.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const compareCodePoints = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

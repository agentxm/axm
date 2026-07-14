import { expandGlob } from "../../../utils/glob.js";

export const matchingIgnoredPatterns = (
  name: string,
  patterns: ReadonlySet<string>,
): ReadonlyArray<string> =>
  Array.from(patterns)
    .filter((pattern) => expandGlob(pattern, [name]).length > 0)
    .sort((left, right) => left.localeCompare(right));

export const matchesIgnoredPattern = (name: string, patterns: ReadonlySet<string>): boolean =>
  matchingIgnoredPatterns(name, patterns).length > 0;

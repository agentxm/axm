import { expandGlob } from "../../../utils/glob.js";

export const matchesIgnoredPattern = (name: string, patterns: ReadonlySet<string>): boolean =>
  Array.from(patterns).some((pattern) => expandGlob(pattern, [name]).length > 0);

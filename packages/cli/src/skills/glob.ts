/**
 * Glob expansion for skill names.
 *
 * Expands `*` wildcards against a list of skill names. Only `*` is supported
 * as a wildcard — all other characters are treated as literals.
 *
 * @experimental This API is unstable and may change without notice.
 */

/**
 * Expand a glob pattern against a list of skill names.
 *
 * Only `*` wildcards are supported. All other characters (including `?`, `[`, `]`)
 * are treated as literals. Matching is case-sensitive.
 *
 * @param pattern - The pattern to match (may contain `*`)
 * @param skillNames - Available skill names to match against
 * @returns Matching skill names in their original order
 */
export const expandGlob = (
  pattern: string,
  skillNames: ReadonlyArray<string>,
): ReadonlyArray<string> => {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  const regexSource = `^${escaped.replace(/\*/g, ".*")}$`;
  const regex = new RegExp(regexSource);
  return skillNames.filter((name) => regex.test(name));
};

/**
 * Expand multiple glob patterns against a list of skill names.
 *
 * Returns the union of all matches, deduplicated, preserving the original
 * order of `names`.
 *
 * @param patterns - Patterns to match (may contain `*`)
 * @param names - Available skill names to match against
 * @returns Matching skill names in their original order, deduplicated
 */
export const expandGlobs = (
  patterns: ReadonlyArray<string>,
  names: ReadonlyArray<string>,
): ReadonlyArray<string> => {
  const matched = new Set<string>();
  for (const pattern of patterns) {
    for (const name of expandGlob(pattern, names)) {
      matched.add(name);
    }
  }
  return names.filter((n) => matched.has(n));
};

/**
 * Returns true when an input should be treated as a glob pattern.
 */
export const isGlobPattern = (input: string): boolean => input.includes("*");

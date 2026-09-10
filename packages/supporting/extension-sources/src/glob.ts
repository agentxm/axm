/**
 * Glob expansion for extension names.
 *
 * Expands `*` wildcards against a list of names. Only `*` is supported
 * as a wildcard — all other characters are treated as literals.
 *
 * Deliberately duplicated from the CLI-destined glob module: the
 * integration may not depend on application utilities, and this helper is
 * within the sanctioned duplication budget for small pure functions.
 *
 * @experimental This API is unstable and may change without notice.
 */

/**
 * Expand a glob pattern against a list of names.
 *
 * Only `*` wildcards are supported. All other characters (including `?`, `[`, `]`)
 * are treated as literals. Matching is case-sensitive.
 *
 * @param pattern - The pattern to match (may contain `*`)
 * @param names - Available names to match against
 * @returns Matching names in their original order
 */
export const expandGlob = (
  pattern: string,
  names: ReadonlyArray<string>,
): ReadonlyArray<string> => {
  const matches = (name: string): boolean => {
    let patternIndex = 0;
    let nameIndex = 0;
    let wildcardIndex = -1;
    let wildcardNameIndex = 0;

    while (nameIndex < name.length) {
      const token = pattern[patternIndex];
      if (token !== undefined && token !== "*" && token === name[nameIndex]) {
        patternIndex += 1;
        nameIndex += 1;
      } else if (token === "*") {
        wildcardIndex = patternIndex;
        wildcardNameIndex = nameIndex;
        patternIndex += 1;
      } else if (wildcardIndex >= 0) {
        patternIndex = wildcardIndex + 1;
        wildcardNameIndex += 1;
        nameIndex = wildcardNameIndex;
      } else {
        return false;
      }
    }

    while (pattern[patternIndex] === "*") {
      patternIndex += 1;
    }
    return patternIndex === pattern.length;
  };

  return names.filter(matches);
};

/**
 * Expand multiple glob patterns against a list of skill names.
 *
 * Returns the union of all matches, deduplicated, preserving the original
 * order of `names`.
 *
 * @param patterns - Patterns to match (may contain `*`)
 * @param names - Available names to match against
 * @returns Matching names in their original order, deduplicated
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

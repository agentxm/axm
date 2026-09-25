/**
 * Glob expansion for extension names.
 *
 * Expands `*` wildcards against a list of names. Only `*` is supported
 * as a wildcard — all other characters are treated as literals.
 *
 * @experimental This API is unstable and may change without notice.
 */

/**
 * Match one extension name against a pattern.
 *
 * Only `*` wildcards are supported. All other characters (including `?`, `[`, `]`)
 * are treated as literals. Matching is case-sensitive.
 *
 * @param pattern - The pattern to match (may contain `*`)
 * @param name - The name to check
 * @returns Whether the complete name matches
 */
export const matchesPattern = (pattern: string, name: string): boolean => {
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

/** Expand a glob pattern against names, preserving their original order. */
export const expandGlob = (pattern: string, names: ReadonlyArray<string>): ReadonlyArray<string> =>
  names.filter((name) => matchesPattern(pattern, name));

/**
 * Expand multiple glob patterns against a list of extension names.
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

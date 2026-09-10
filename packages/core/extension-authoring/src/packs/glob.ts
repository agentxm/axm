/**
 * Matching a member selector that carries a `*` wildcard.
 *
 * Only `*` is a wildcard; every other character, `?` and `[` included, is a
 * literal, so an owner-qualified identity matches itself. Matching is
 * case-sensitive.
 *
 * @experimental This API is unstable and may change without notice.
 */

const matches = (pattern: string, name: string): boolean => {
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

/** Whether a selector carries a wildcard rather than naming one member. */
export const isSelectorPattern = (selector: string): boolean => selector.includes("*");

/** Whether a selector matches this name. */
export const selectorMatches = (selector: string, name: string): boolean => matches(selector, name);

/**
 * Pure extension-name vocabulary.
 *
 * Deterministic naming helpers shared by every extension type: sanitizing an
 * extension name into a safe on-disk directory name.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

const isAsciiAlphaNumeric = (character: string): boolean => {
  const code = character.charCodeAt(0);
  return (code >= 48 && code <= 57) || (code >= 97 && code <= 122);
};

const collapseDisallowedCharacters = (value: string): string => {
  let result = "";
  let pendingSeparator = false;
  for (const character of value.toLowerCase()) {
    const allowed = isAsciiAlphaNumeric(character) || character === "." || character === "_";
    if (allowed) {
      if (pendingSeparator && result.length > 0) {
        result += "-";
      }
      result += character;
      pendingSeparator = false;
    } else {
      pendingSeparator = true;
    }
  }
  return result;
};

const trimFileBoundaries = (value: string): string => {
  let start = 0;
  let end = value.length;
  while (start < end && (value[start] === "." || value[start] === "-")) {
    start += 1;
  }
  while (end > start && (value[end - 1] === "." || value[end - 1] === "-")) {
    end -= 1;
  }
  return value.slice(start, end);
};

/**
 * Sanitizes an extension name into a safe on-disk directory name.
 *
 * Transformation pipeline:
 * 1. Convert to lowercase
 * 2. Replace non-alphanumeric characters (except `.` and `_`) with hyphens
 * 3. Strip leading dots and hyphens
 * 4. Truncate to 255 characters, then strip trailing dots and hyphens
 * 5. Fall back to `"unnamed-skill"` if empty
 * 6. Preserve canonical names; otherwise append a deterministic discriminator
 */
export const sanitizeName = (name: string): string => {
  const sanitized = trimFileBoundaries(collapseDisallowedCharacters(name).slice(0, 255));

  const fallback = sanitized || "unnamed-skill";
  if (fallback === name) {
    return fallback;
  }

  // Extension names are normally canonical before reaching filesystem code.
  // Preserve those stable paths. For defensive non-canonical input,
  // append a deterministic discriminator so distinct display names that
  // normalize to the same slug cannot address each other's files.
  let high = 0x9e3779b9;
  let low = 0x811c9dc5;
  for (const codePoint of name) {
    const value = codePoint.codePointAt(0) ?? 0;
    low = Math.imul(low ^ value, 0x01000193);
    high = Math.imul(high ^ value, 0x85ebca6b);
  }
  const discriminator = `${(high >>> 0).toString(16).padStart(8, "0")}${(low >>> 0)
    .toString(16)
    .padStart(8, "0")}`;
  const maxSlugLength = 255 - discriminator.length - 2;
  const slug = trimFileBoundaries(fallback.slice(0, maxSlugLength)) || "unnamed-skill";
  return `${slug}__${discriminator}`;
};

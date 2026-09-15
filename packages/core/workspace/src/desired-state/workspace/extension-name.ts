/**
 * Pure extension-name vocabulary.
 *
 * Deterministic naming helpers shared by every extension type: sanitizing an
 * extension name into a safe on-disk directory name and normalizing a
 * human-authored label into a valid AXM extension name.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import {
  decodeExtensionNameSync,
  type ExtensionName,
} from "@agentxm/extension-model/unstable/extensions/common";

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
  const sanitized = name
    .toLowerCase()
    .replace(/[^a-z0-9._]+/g, "-")
    .replace(/^[.-]+/, "")
    .slice(0, 255)
    .replace(/[.-]+$/, "");

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
  const slug = fallback.slice(0, maxSlugLength).replace(/[.-]+$/, "") || "unnamed-skill";
  return `${slug}__${discriminator}`;
};

/**
 * Converts a human-authored label into a valid AXM extension name.
 */
export const normalizeExtensionName = (name: string): ExtensionName => {
  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "")
    .slice(0, 64)
    .replace(/-+$/, "");

  return decodeExtensionNameSync(normalized || "unnamed-extension");
};

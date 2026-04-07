/**
 * Managed marker utilities for extension-rendered files.
 *
 * A managed marker is a comment placed at the start of a file to indicate
 * that axm owns and manages the file. This allows conflict detection to
 * distinguish user-written files from axm-rendered files.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";

/**
 * Branded string type for managed markers.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const ManagedMarkerSchema = Schema.String.pipe(Schema.brand("ManagedMarker"));

/**
 * Branded ManagedMarker type.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type ManagedMarker = Schema.Schema.Type<typeof ManagedMarkerSchema>;

const decodeManagedMarker = Schema.decodeUnknownSync(ManagedMarkerSchema);

const MARKDOWN_MARKER_PREFIX = `<!-- Managed by axm \u2014 see "axm `;
const MARKDOWN_MARKER_SUFFIX = ` --help" -->`;
const HASH_MARKER_PREFIX = `# Managed by axm \u2014 see "axm `;
const HASH_MARKER_SUFFIX = ` --help"`;

/**
 * Regex matching managed markers at the start of content.
 * Matches both markdown-style (`<!-- ... -->`) and hash-style (`# ...`) markers.
 */
const MANAGED_MARKER_PATTERN =
  /^(?:<!-- Managed by axm — see "axm [^"]+ --help" -->|# Managed by axm — see "axm [^"]+ --help")/;

/**
 * Generate a managed marker for a given extension type and file format.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const generateMarker = (
  extensionType: string,
  format: "markdown" | "toml" | "text",
): ManagedMarker => {
  const marker =
    format === "markdown"
      ? `${MARKDOWN_MARKER_PREFIX}${extensionType}${MARKDOWN_MARKER_SUFFIX}`
      : `${HASH_MARKER_PREFIX}${extensionType}${HASH_MARKER_SUFFIX}`;
  return decodeManagedMarker(marker);
};

/**
 * Check whether content starts with a managed marker.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const isManagedByAxm = (content: string): boolean => MANAGED_MARKER_PATTERN.test(content);

/**
 * Remove the managed marker line from the beginning of content.
 * Returns the original content unchanged if no marker is present.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const stripMarker = (content: string): string => {
  if (!isManagedByAxm(content)) {
    return content;
  }
  const newlineIndex = content.indexOf("\n");
  if (newlineIndex === -1) {
    return "";
  }
  return content.slice(newlineIndex + 1);
};

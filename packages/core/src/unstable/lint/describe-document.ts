/**
 * The one place lint turns a document filename into the human label that opens
 * a finding message ("Skill manifest has unrecognized top-level field ...").
 *
 * Three copies of this switch used to exist — one in `issues-to-findings.ts`,
 * one in `catalog/shared/schema-rule.ts`, one in
 * `catalog/shared/manifest-json.ts` — and they had drifted: only one knew
 * `hook.json`, none knew `rule.json` or `knowledge.json`, and the parse-failure
 * copy defaulted to "Manifest" where the others defaulted to "Document".
 *
 * The manifest labels are derived from `MANIFEST_FILENAME_BY_TYPE` and
 * `extensionTypeSentenceLabels`, both of which are total over `ExtensionType`,
 * so a new extension type gets a label the moment its row lands in
 * `EXTENSION_TYPE_TABLE`.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import { extensionTypeSentenceLabels, extensionTypes } from "../extensions/common.js";
import { LOCKFILE_NAME } from "../lockfile/lockfile.js";
import { MANIFEST_FILENAME_BY_TYPE } from "../publish/manifest-policy.js";
import { SETTINGS_FILENAME } from "../workspace/constants.js";

/** Label used when a filename matches no known document. */
export const UNKNOWN_DOCUMENT_LABEL = "Document";

const capitalizeFirst = (value: string): string =>
  value.length === 0 ? value : `${value.charAt(0).toUpperCase()}${value.slice(1)}`;

// eslint-disable-next-line no-restricted-syntax -- Immutable lookup over the closed manifest filename vocabulary.
const documentLabels: ReadonlyMap<string, string> = new Map<string, string>([
  ...extensionTypes.map((type): readonly [string, string] => [
    MANIFEST_FILENAME_BY_TYPE[type],
    `${capitalizeFirst(extensionTypeSentenceLabels[type])} manifest`,
  ]),
  [SETTINGS_FILENAME, "Workspace settings"],
  [LOCKFILE_NAME, "Lockfile"],
]);

const basename = (file: string): string => {
  const normalized = file.replace(/\\/g, "/");
  const parts = normalized.split("/");
  return parts[parts.length - 1] ?? normalized;
};

/**
 * Describe the document at `file` for use as the subject of a finding message.
 *
 * Keyed by basename, so both bare accessor-relative filenames (`hook.json`,
 * as the per-extension rules pass) and workspace-relative paths
 * (`axm.json`, as `issues-to-findings` passes) resolve.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const describeSchemaDocument = (file: string): string =>
  documentLabels.get(basename(file)) ?? UNKNOWN_DOCUMENT_LABEL;

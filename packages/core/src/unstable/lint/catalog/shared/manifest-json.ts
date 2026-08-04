/**
 * Shared loose-manifest JSON helpers.
 *
 * Workspace lint parses installed manifests before per-extension rules run.
 * The parsed value must stay raw JSON, not a schema-decoded manifest, so
 * `*-keys-recognized` rules can still see excess top-level fields.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { describeSchemaDocument } from "../../describe-document.js";
import type { AdvisoryFinding, Severity } from "../../rule.js";

export interface ManifestJsonParseFailure {
  readonly _tag: "ManifestJsonParseFailure";
  readonly file: string;
}

export const makeManifestJsonParseFailure = (file: string): ManifestJsonParseFailure => ({
  _tag: "ManifestJsonParseFailure",
  file,
});

export const isManifestJsonParseFailure = (value: unknown): value is ManifestJsonParseFailure => {
  if (value === null || typeof value !== "object") {
    return false;
  }
  return "_tag" in value && value._tag === "ManifestJsonParseFailure";
};

export const manifestJsonParseFailureToFinding = (
  ruleId: string,
  severity: Severity,
  file: string,
  input: ManifestJsonParseFailure,
): AdvisoryFinding => ({
  kind: "advisory",
  ruleId,
  severity,
  message: `${describeSchemaDocument(file)} contains invalid JSON. Edit \`${input.file}\` and fix the JSON syntax.`,
  location: { file },
});

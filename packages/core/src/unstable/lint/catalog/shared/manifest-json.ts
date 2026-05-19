/**
 * Shared loose-manifest JSON helpers.
 *
 * Workspace lint parses installed manifests before per-extension rules run.
 * The parsed value must stay raw JSON, not a schema-decoded manifest, so
 * `*-keys-recognized` rules can still see excess top-level fields.
 *
 * @experimental This API is unstable and may change without notice.
 */

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
  message: `${describeManifest(file)} contains invalid JSON. Edit \`${input.file}\` and fix the JSON syntax.`,
  location: { file },
});

const describeManifest = (file: string): string => {
  switch (file) {
    case "command.json":
      return "Command manifest";
    case "context-files.json":
      return "Context files manifest";
    case "mcp-server.json":
      return "MCP server manifest";
    case "pack.json":
      return "Pack manifest";
    case "skill.json":
      return "Skill manifest";
    case "subagent.json":
      return "Subagent manifest";
    default:
      return "Manifest";
  }
};

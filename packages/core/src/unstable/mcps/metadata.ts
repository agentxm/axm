/**
 * AXM metadata embedded in agent-native MCP config entries.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { isWorkspaceSourceLocator, type SourceType } from "../sources/index.js";

export const AXM_MCP_METADATA_KEY = "x-axm";

const ResolvableSourceTypeSchema = Schema.Literals([
  "github",
  "gitlab",
  "bitbucket",
  "azurerepos",
  "git",
  "registry",
  "local",
  "workspace",
]);

export const AxmMcpMetadataSchema = Schema.Union([
  Schema.Struct({
    v: Schema.Literal(1),
    managed: Schema.Literal(true),
    ext: Schema.NonEmptyString,
    source: Schema.Literal("inline"),
  }),
  Schema.Struct({
    v: Schema.Literal(1),
    managed: Schema.Literal(true),
    ext: Schema.NonEmptyString,
    source: ResolvableSourceTypeSchema,
    ref: Schema.NonEmptyString,
  }),
]).annotate({
  identifier: "AxmMcpMetadata",
  title: "AXM MCP Metadata",
  description: "AXM ownership and provenance metadata for an agent MCP config entry.",
});

export type AxmMcpMetadata = typeof AxmMcpMetadataSchema.Type;

const decodeMetadataOption = Schema.decodeUnknownOption(AxmMcpMetadataSchema);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasValidRefShape = (metadata: Record<string, unknown>): boolean => {
  const source = metadata["source"];
  const ref = metadata["ref"];
  if (source === "inline") return ref === undefined;
  return typeof ref === "string" && ref.length > 0;
};

const sourceTypeFromSettingsSource = (source: string): Exclude<SourceType, "inline"> => {
  if (isWorkspaceSourceLocator(source)) return "workspace";
  switch (source) {
    case "github":
      return "github";
    case "gitlab":
      return "gitlab";
    case "bitbucket":
      return "bitbucket";
    case "azurerepos":
      return "azurerepos";
    case "git":
      return "git";
    case "local":
      return "local";
    case "registry":
      return "registry";
    default:
      return "registry";
  }
};

export const buildAxmMcpMetadata = (args: {
  readonly ext: string;
  readonly source: SourceType;
  readonly ref?: string | undefined;
}): AxmMcpMetadata =>
  args.source === "inline"
    ? { v: 1, managed: true, ext: args.ext, source: "inline" }
    : {
        v: 1,
        managed: true,
        ext: args.ext,
        source: args.source,
        ref: args.ref ?? args.source,
      };

export const buildAxmMcpMetadataFromSettingsSource = (
  source: string,
  serverName: string,
): AxmMcpMetadata =>
  source === "inline"
    ? {
        v: 1,
        managed: true,
        ext: `@workspace/mcps/${serverName}`,
        source: "inline",
      }
    : {
        v: 1,
        managed: true,
        ext: source,
        source: sourceTypeFromSettingsSource(source),
        ref: source,
      };

export const readAxmMcpMetadata = (
  entry: Readonly<Record<string, unknown>>,
): Option.Option<AxmMcpMetadata> => {
  const metadata = entry[AXM_MCP_METADATA_KEY];
  if (!isRecord(metadata) || !hasValidRefShape(metadata)) return Option.none();
  return decodeMetadataOption(metadata);
};

export const isAxmManagedMcpEntry = (entry: Readonly<Record<string, unknown>>): boolean =>
  Option.isSome(readAxmMcpMetadata(entry));

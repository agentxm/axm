/**
 * Settings-semantics predicates for MCP server entries.
 *
 * Pure derivations over workspace-owned MCP entry shapes: per-agent targeting
 * of a configured settings entry, and AXM ownership/provenance metadata
 * embedded in agent-native MCP config entries.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import type { McpServerEntry } from "../settings/schema.js";

export const isMcpServerApplicableToAgent = (entry: McpServerEntry, agentId: string): boolean =>
  entry.agents === undefined || entry.agents.some((candidate) => candidate === agentId);

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

export const readAxmMcpMetadata = (
  entry: Readonly<Record<string, unknown>>,
): Option.Option<AxmMcpMetadata> => {
  const metadata = entry[AXM_MCP_METADATA_KEY];
  if (!isRecord(metadata) || !hasValidRefShape(metadata)) return Option.none();
  return decodeMetadataOption(metadata);
};

export const isAxmManagedMcpEntry = (entry: Readonly<Record<string, unknown>>): boolean =>
  Option.isSome(readAxmMcpMetadata(entry));

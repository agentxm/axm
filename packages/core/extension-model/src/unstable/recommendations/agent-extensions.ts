/**
 * Portable package metadata for recommending agent extensions.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";

import { ExtensionFqnSchema } from "../extensions/common.js";
import { SourceRefSchema, SourceSubPathSchema } from "../sources/types.js";
import { VersionRangeSchema } from "../version-constraints/version-constraints.js";

/** The Registry used by portable recommendations that omit an explicit source. */
export const AGENTXM_REGISTRY_URL = "https://registry.agentxm.ai";

export const AgentExtensionGitSourceSchema = Schema.Struct({
  type: Schema.Literal("git"),
  url: Schema.URLFromString,
  path: Schema.optionalKey(SourceSubPathSchema),
  revision: Schema.optionalKey(SourceRefSchema),
}).annotate({
  identifier: "AgentExtensionGitSource",
  title: "Git recommendation source",
  description: "A self-describing Git locator for a recommended extension.",
});

export const AgentExtensionRegistrySourceSchema = Schema.Struct({
  type: Schema.Literal("registry"),
  url: Schema.URLFromString,
}).annotate({
  identifier: "AgentExtensionRegistrySource",
  title: "Registry recommendation source",
  description: "A self-describing Registry locator for a recommended extension.",
});

export const AgentExtensionPathSourceSchema = Schema.Struct({
  type: Schema.Literal("path"),
  path: Schema.NonEmptyString,
}).annotate({
  identifier: "AgentExtensionPathSource",
  title: "Path recommendation source",
  description: "A self-describing filesystem locator for a recommended extension.",
});

export const AgentExtensionSourceSchema = Schema.Union([
  AgentExtensionGitSourceSchema,
  AgentExtensionRegistrySourceSchema,
  AgentExtensionPathSourceSchema,
]).annotate({
  identifier: "AgentExtensionSource",
  title: "Agent extension recommendation source",
  description: "A self-describing Git, Registry, or filesystem locator.",
});

export type AgentExtensionSource = Schema.Schema.Type<typeof AgentExtensionSourceSchema>;

const RegistryAgentExtensionRecommendationSchema = Schema.Struct({
  ref: ExtensionFqnSchema,
  source: Schema.optionalKey(AgentExtensionRegistrySourceSchema),
  versionRange: Schema.optionalKey(VersionRangeSchema),
});

const GitAgentExtensionRecommendationSchema = Schema.Struct({
  ref: ExtensionFqnSchema,
  source: AgentExtensionGitSourceSchema,
  versionRange: Schema.optionalKey(Schema.Never),
});

const PathAgentExtensionRecommendationSchema = Schema.Struct({
  ref: ExtensionFqnSchema,
  source: AgentExtensionPathSourceSchema,
  versionRange: Schema.optionalKey(Schema.Never),
});

export const AgentExtensionRecommendationSchema = Schema.Union([
  RegistryAgentExtensionRecommendationSchema,
  GitAgentExtensionRecommendationSchema,
  PathAgentExtensionRecommendationSchema,
]).annotate({
  identifier: "AgentExtensionRecommendation",
  title: "Agent extension recommendation",
  description:
    "A qualified extension reference with an optional self-describing source. Sourceless entries use the fixed AgentXM Registry; versionRange is valid only for Registry sources.",
});

export type AgentExtensionRecommendation = Schema.Schema.Type<
  typeof AgentExtensionRecommendationSchema
>;

export const AgentExtensionsMetadataSchema = Schema.Struct({
  $schema: Schema.optionalKey(Schema.String),
  agentExtensions: Schema.Array(AgentExtensionRecommendationSchema),
}).annotate({
  identifier: "AgentExtensionsMetadata",
  title: "Agent Extensions Metadata",
  description:
    "Version 1 of the portable package metadata contract for recommended agent extensions.",
});

export type AgentExtensionsMetadata = Schema.Schema.Type<typeof AgentExtensionsMetadataSchema>;

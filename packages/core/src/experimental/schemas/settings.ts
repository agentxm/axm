/**
 * Schema definitions for AXM settings configuration.
 *
 * Settings define global configuration including sources, agents, and extensions.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { Schema } from "effect";
import { AgentId } from "./common.js";

/**
 * URL-based source configuration for GitHub, GitLab, Bitbucket, and Azure DevOps.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const UrlSource = Schema.Struct({
  url: Schema.String,
});

/**
 * Inferred type for UrlSource schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type UrlSource = typeof UrlSource.Type;

/**
 * Path-based source configuration for local registries.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const PathSource = Schema.Struct({
  path: Schema.String,
});

/**
 * Inferred type for PathSource schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type PathSource = typeof PathSource.Type;

/**
 * Registry source type - either URL-based or path-based.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type RegistrySource = { url: string } | { path: string };

/**
 * Registry source configuration - can be URL or path based (but not both).
 *
 * Uses Schema.declare for strict validation that rejects objects with both
 * 'url' and 'path' properties, as well as objects missing both properties.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const RegistrySource: Schema.Schema<RegistrySource> = Schema.declare(
  (input): input is RegistrySource => {
    if (typeof input !== "object" || input === null) return false;
    const obj = input as Record<string, unknown>;
    const hasUrl = "url" in obj && typeof obj["url"] === "string";
    const hasPath = "path" in obj && typeof obj["path"] === "string";
    // Must have exactly one of url or path (XOR)
    return (hasUrl && !hasPath) || (!hasUrl && hasPath);
  },
  {
    identifier: "RegistrySource",
    description: "Registry source with either url or path (but not both)",
  },
).annotations({
  jsonSchema: {
    oneOf: [
      {
        type: "object",
        properties: { url: { type: "string" } },
        required: ["url"],
        additionalProperties: false,
      },
      {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
        additionalProperties: false,
      },
    ],
  },
});

/**
 * Empty source configuration for git (no additional fields needed).
 *
 * @experimental This API is unstable and may change without notice.
 */
export const EmptySource = Schema.Struct({});

/**
 * Inferred type for EmptySource schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type EmptySource = typeof EmptySource.Type;

/**
 * Sources configuration for extension origins.
 *
 * Defines URLs/paths for various source providers:
 * - github: GitHub Enterprise or github.com
 * - gitlab: GitLab self-hosted or gitlab.com
 * - bitbucket: Bitbucket Server or bitbucket.org
 * - azuredevops: Azure DevOps Server or dev.azure.com
 * - git: Generic git configuration (empty)
 * - registry: One or more extension registries
 *
 * @experimental This API is unstable and may change without notice.
 */
export const SourcesConfig = Schema.Struct({
  github: Schema.optional(UrlSource),
  gitlab: Schema.optional(UrlSource),
  bitbucket: Schema.optional(UrlSource),
  azuredevops: Schema.optional(UrlSource),
  git: Schema.optional(EmptySource),
  registry: Schema.optional(Schema.Union(RegistrySource, Schema.Array(RegistrySource))),
});

/**
 * Inferred type for SourcesConfig schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type SourcesConfig = typeof SourcesConfig.Type;

/**
 * Pattern for skill names per agentskills.io specification:
 * - Max 64 characters
 * - Lowercase letters, numbers, and hyphens only
 * - Must not start or end with a hyphen
 *
 * @see https://agentskills.io/specification
 */
const SKILL_NAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$|^[a-z0-9]$/;

/**
 * Extension map - maps skill names to version specifiers.
 *
 * Keys must be valid skill names per agentskills.io specification:
 * - Max 64 characters
 * - Lowercase letters, numbers, and hyphens only
 * - Must not start or end with a hyphen
 *
 * Values are semver range strings (e.g., "^1.0.0", "~2.1.0", ">=1.0.0") or "*".
 *
 * @experimental This API is unstable and may change without notice.
 */
export const ExtensionMap = Schema.Record({
  key: Schema.String,
  value: Schema.String,
}).pipe(
  Schema.filter((record) => {
    const invalidKeys = Object.keys(record).filter(
      (key) => key.length > 64 || !SKILL_NAME_PATTERN.test(key),
    );
    if (invalidKeys.length > 0) {
      return `Invalid skill name(s): ${invalidKeys.join(", ")}. Names must be max 64 chars, lowercase letters/numbers/hyphens, not starting or ending with hyphen.`;
    }
    return undefined;
  }),
);

/**
 * Inferred type for ExtensionMap schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type ExtensionMap = typeof ExtensionMap.Type;

/**
 * AXM settings configuration schema.
 *
 * Settings define global configuration for AXM including:
 * - scope: Default scope for resolving/publishing extensions
 * - sources: Source provider configurations
 * - agents: List of agent IDs to sync extensions to
 * - skills: Desired skills by name to version specifier
 * - commands: Desired commands by name to version specifier
 * - packs: Desired packs by name to version specifier
 * - mcp-servers: Desired MCP servers by name to version specifier
 *
 * @experimental This API is unstable and may change without notice.
 */
export const Settings = Schema.Struct({
  scope: Schema.optional(Schema.String),
  sources: Schema.optional(SourcesConfig),
  agents: Schema.optional(Schema.Array(AgentId)),
  skills: Schema.optional(ExtensionMap),
  commands: Schema.optional(ExtensionMap),
  packs: Schema.optional(ExtensionMap),
  "mcp-servers": Schema.optional(ExtensionMap),
});

/**
 * Inferred type for Settings schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type Settings = typeof Settings.Type;

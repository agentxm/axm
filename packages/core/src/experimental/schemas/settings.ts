/**
 * Schema definitions for AXM settings configuration.
 *
 * Settings define global configuration including sources, agents, and extensions.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";
import { AgentIdSchema } from "./common.js";

/**
 * URL-based source configuration for GitHub, GitLab, Bitbucket, and Azure DevOps.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const UrlSourceSchema = Schema.Struct({
  url: Schema.String,
});

/**
 * Inferred type for UrlSource schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type UrlSource = typeof UrlSourceSchema.Type;

/**
 * Path-based source configuration for local registries.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const PathSourceSchema = Schema.Struct({
  path: Schema.String,
});

/**
 * Inferred type for PathSource schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type PathSource = typeof PathSourceSchema.Type;

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
export const RegistrySourceSchema: Schema.Schema<RegistrySource> = Schema.declare(
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
export const EmptySourceSchema = Schema.Struct({});

/**
 * Inferred type for EmptySource schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type EmptySource = typeof EmptySourceSchema.Type;

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
export const SourcesConfigSchema = Schema.Struct({
  github: Schema.optional(UrlSourceSchema),
  gitlab: Schema.optional(UrlSourceSchema),
  bitbucket: Schema.optional(UrlSourceSchema),
  azuredevops: Schema.optional(UrlSourceSchema),
  git: Schema.optional(EmptySourceSchema),
  registry: Schema.optional(Schema.Union(RegistrySourceSchema, Schema.Array(RegistrySourceSchema))),
});

/**
 * Inferred type for SourcesConfig schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type SourcesConfig = typeof SourcesConfigSchema.Type;

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
 * @deprecated Use SkillsMapSchema for skills. This is kept for other extension types.
 * @experimental This API is unstable and may change without notice.
 */
export const ExtensionMapSchema = Schema.Record({
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
export type ExtensionMap = typeof ExtensionMapSchema.Type;

/**
 * Skills map - maps skill names to source strings.
 *
 * Keys must be valid skill names per agentskills.io specification:
 * - Max 64 characters
 * - Lowercase letters, numbers, and hyphens only
 * - Must not start or end with a hyphen
 *
 * Values are source strings in one of these formats:
 * - Registry: `@scope/name` or `@scope/name@version`
 * - GitHub: `github:owner/repo[/path][#ref]`
 * - Git: `git:url[#ref]`
 * - Local: `local:path`
 *
 * @experimental This API is unstable and may change without notice.
 */
export const SkillsMapSchema = Schema.Record({
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
 * Inferred type for SkillsMap schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type SkillsMap = typeof SkillsMapSchema.Type;

/**
 * AXM settings configuration schema.
 *
 * Settings define global configuration for AXM including:
 * - scope: Default scope for resolving/publishing extensions
 * - sources: Source provider configurations
 * - agents: List of agent IDs to sync extensions to
 * - skills: Desired skills by name to source string
 * - commands: Desired commands by name to version specifier
 * - packs: Desired packs by name to version specifier
 * - mcp-servers: Desired MCP servers by name to version specifier
 *
 * @experimental This API is unstable and may change without notice.
 */
export const SettingsSchema = Schema.Struct({
  scope: Schema.optional(Schema.String),
  sources: Schema.optional(SourcesConfigSchema),
  agents: Schema.optional(Schema.Array(AgentIdSchema)),
  skills: Schema.optional(SkillsMapSchema),
  commands: Schema.optional(ExtensionMapSchema),
  packs: Schema.optional(ExtensionMapSchema),
  "mcp-servers": Schema.optional(ExtensionMapSchema),
});

/**
 * Inferred type for Settings schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type Settings = typeof SettingsSchema.Type;

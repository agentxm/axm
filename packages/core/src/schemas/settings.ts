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
 * Pattern for fully qualified names: `@<scope>/<name>`
 */
const FQN_PATTERN = /^@[\w-]+\/[\w-]+$/;

/**
 * Extension map - maps fully qualified names to version specifiers.
 *
 * Keys must match `@<scope>/<name>` pattern. All keys are strictly validated.
 * Values are semver range strings (e.g., "^1.0.0", "~2.1.0", ">=1.0.0").
 *
 * @experimental This API is unstable and may change without notice.
 */
export const ExtensionMap = Schema.Record({
  key: Schema.String,
  value: Schema.String,
}).pipe(
  Schema.filter((record) => {
    const invalidKeys = Object.keys(record).filter((key) => !FQN_PATTERN.test(key));
    if (invalidKeys.length > 0) {
      return `Invalid extension name(s): ${invalidKeys.join(", ")}. Names must match @<scope>/<name> pattern.`;
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
 * Extensions configuration for desired extensions by type.
 *
 * Each field is an optional map of extension names to version specifiers.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const ExtensionsConfig = Schema.Struct({
  skills: Schema.optional(ExtensionMap),
  commands: Schema.optional(ExtensionMap),
  packs: Schema.optional(ExtensionMap),
  "mcp-servers": Schema.optional(ExtensionMap),
});

/**
 * Inferred type for ExtensionsConfig schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type ExtensionsConfig = typeof ExtensionsConfig.Type;

/**
 * AXM settings configuration schema.
 *
 * Settings define global configuration for AXM including:
 * - scope: Default scope for resolving/publishing extensions
 * - sources: Source provider configurations
 * - agents: List of agent IDs to sync extensions to
 * - extensions: Desired extensions by type
 *
 * @experimental This API is unstable and may change without notice.
 */
export const Settings = Schema.Struct({
  scope: Schema.optional(Schema.String),
  sources: Schema.optional(SourcesConfig),
  agents: Schema.optional(Schema.Array(AgentId)),
  extensions: Schema.optional(ExtensionsConfig),
});

/**
 * Inferred type for Settings schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type Settings = typeof Settings.Type;

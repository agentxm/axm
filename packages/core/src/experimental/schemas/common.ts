/**
 * Common schema definitions shared across AXM configuration files.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { Schema } from "effect";

/**
 * Author information for a manifest.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const AuthorSchema = Schema.Struct({
  name: Schema.String,
  email: Schema.optional(Schema.String),
  url: Schema.optional(Schema.String),
});

/**
 * Inferred type for Author schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type Author = typeof AuthorSchema.Type;

/**
 * Fully qualified name pattern: `@<scope>/<name>` where scope and name
 * contain only alphanumeric characters, hyphens, and underscores.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const FullyQualifiedNameSchema = Schema.String.pipe(Schema.pattern(/^@[\w-]+\/[\w-]+$/));

/**
 * Inferred type for FullyQualifiedName schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type FullyQualifiedName = typeof FullyQualifiedNameSchema.Type;

/**
 * Common fields shared across all manifest types.
 * Used as a spread in manifest struct definitions.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const CommonManifestFields = {
  name: FullyQualifiedNameSchema,
  version: Schema.String,
  description: Schema.optional(Schema.String),
  keywords: Schema.optional(Schema.Array(Schema.String)),
  repository: Schema.optional(Schema.String),
  homepage: Schema.optional(Schema.String),
  license: Schema.optional(Schema.String),
  bugs: Schema.optional(Schema.String),
  author: Schema.optional(AuthorSchema),
};

/**
 * Extension type enumeration.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const ExtensionTypeSchema = Schema.Union(
  Schema.Literal("skill"),
  Schema.Literal("command"),
  Schema.Literal("pack"),
  Schema.Literal("mcp-server"),
);

/**
 * Inferred type for ExtensionType schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type ExtensionType = typeof ExtensionTypeSchema.Type;

/**
 * Source type enumeration for extension origins.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const SourceTypeSchema = Schema.Union(
  Schema.Literal("github"),
  Schema.Literal("gitlab"),
  Schema.Literal("bitbucket"),
  Schema.Literal("azuredevops"),
  Schema.Literal("git"),
  Schema.Literal("url"),
  Schema.Literal("path"),
  Schema.Literal("registry"),
);

/**
 * Inferred type for SourceType schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type SourceType = typeof SourceTypeSchema.Type;

/**
 * Agent identifier enumeration for supported coding agents.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const AgentIdSchema = Schema.Union(
  Schema.Literal("claude-code"),
  Schema.Literal("cursor"),
  Schema.Literal("windsurf"),
  Schema.Literal("codex"),
  Schema.Literal("copilot"),
  Schema.Literal("gemini"),
  Schema.Literal("vscode"),
  Schema.Literal("opencode"),
);

/**
 * Inferred type for AgentId schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type AgentId = typeof AgentIdSchema.Type;

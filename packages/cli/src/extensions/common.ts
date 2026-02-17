/**
 * Common schema definitions shared across AXM configuration files.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";
import * as Option from "effect/Option";

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
 * Author information in runtime/domain models.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface Author {
  readonly name: string;
  readonly email: Option.Option<string>;
  readonly url: Option.Option<string>;
}

/** Convert schema-decoded author shape into runtime/domain Author. */
export const toAuthor = (author: typeof AuthorSchema.Type): Author => ({
  name: author.name,
  email: Option.fromNullable(author.email),
  url: Option.fromNullable(author.url),
});

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
  authors: Schema.optional(Schema.Array(AuthorSchema)),
};

/**
 * Extension type enumeration.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const ExtensionTypeSchema = Schema.Union(
  Schema.Literal("skill"),
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
 * Agent identifier enumeration for supported coding agents.
 *
 * Must be kept in sync with AgentId in agents/types.ts.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const AgentIdSchema = Schema.Union(
  Schema.Literal("adal"),
  Schema.Literal("amp"),
  Schema.Literal("antigravity"),
  Schema.Literal("augment"),
  Schema.Literal("claude-code"),
  Schema.Literal("cline"),
  Schema.Literal("codebuddy"),
  Schema.Literal("codex"),
  Schema.Literal("command-code"),
  Schema.Literal("continue"),
  Schema.Literal("crush"),
  Schema.Literal("cursor"),
  Schema.Literal("droid"),
  Schema.Literal("gemini-cli"),
  Schema.Literal("github-copilot"),
  Schema.Literal("goose"),
  Schema.Literal("iflow-cli"),
  Schema.Literal("junie"),
  Schema.Literal("kilo"),
  Schema.Literal("kimi-cli"),
  Schema.Literal("kiro-cli"),
  Schema.Literal("kode"),
  Schema.Literal("mcpjam"),
  Schema.Literal("mistral-vibe"),
  Schema.Literal("mux"),
  Schema.Literal("neovate"),
  Schema.Literal("openclaw"),
  Schema.Literal("opencode"),
  Schema.Literal("openhands"),
  Schema.Literal("pi"),
  Schema.Literal("pochi"),
  Schema.Literal("qoder"),
  Schema.Literal("qwen-code"),
  Schema.Literal("replit"),
  Schema.Literal("roo"),
  Schema.Literal("trae"),
  Schema.Literal("trae-cn"),
  Schema.Literal("windsurf"),
  Schema.Literal("zencoder"),
);

/**
 * Inferred type for AgentId schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type AgentId = typeof AgentIdSchema.Type;

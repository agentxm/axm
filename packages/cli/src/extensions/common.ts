/**
 * Common schema definitions shared across AXM configuration files.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";
import * as Option from "effect/Option";
import { AGENT_IDS } from "../agents/index.js";

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
export const toAuthor = (author: Schema.Schema.Type<typeof AuthorSchema>): Author => ({
  name: author.name,
  email: Option.fromUndefinedOr(author.email),
  url: Option.fromUndefinedOr(author.url),
});

/**
 * Fully qualified name regex: `@<namespace>/<type>/<name>` where namespace and name
 * contain only alphanumeric characters, hyphens, and underscores, and type is one
 * of skills, packs, commands, or mcp-servers.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const FQN_PATTERN = /^@[\w-]+\/(skills|packs|commands|mcp-servers)\/[\w-]+$/;

/**
 * Manifest namespace regex: `@<namespace>`.
 */
export const MANIFEST_NAMESPACE_PATTERN = /^@[\w-]+$/;

/**
 * Manifest short name regex: `<name>` with alphanumeric, hyphen, underscore.
 */
export const MANIFEST_NAME_PATTERN = /^[\w-]+$/;

/**
 * Fully qualified name schema using {@link FQN_PATTERN}.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const FullyQualifiedNameSchema = Schema.String.pipe(Schema.check(Schema.isPattern(FQN_PATTERN)));

/**
 * Inferred type for FullyQualifiedName schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type FullyQualifiedName = Schema.Schema.Type<typeof FullyQualifiedNameSchema>;

/**
 * Manifest namespace schema.
 */
export const ManifestNamespaceSchema = Schema.String.pipe(
  Schema.check(Schema.isPattern(MANIFEST_NAMESPACE_PATTERN)),
);

/**
 * Manifest short name schema.
 */
export const ManifestNameSchema = Schema.String.pipe(Schema.check(Schema.isPattern(MANIFEST_NAME_PATTERN)));

/**
 * Common fields shared across all manifest types.
 * Used as a spread in manifest struct definitions.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const CommonManifestFields = {
  namespace: ManifestNamespaceSchema,
  name: ManifestNameSchema,
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
export const ExtensionTypeSchema = Schema.Union([Schema.Literal("skill"), Schema.Literal("command"), Schema.Literal("pack"), Schema.Literal("mcp-server")]);

/**
 * Inferred type for ExtensionType schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type ExtensionType = Schema.Schema.Type<typeof ExtensionTypeSchema>;

/**
 * Agent identifier enumeration for supported coding agents.
 *
 * Derived from `AGENT_IDS` in agents/types.ts — compile-time enforced,
 * no manual sync required.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const AgentIdSchema = Schema.Literals([...AGENT_IDS]);

/**
 * Inferred type for AgentId schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type AgentId = Schema.Schema.Type<typeof AgentIdSchema>;

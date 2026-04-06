/**
 * Common schema definitions shared across AXM configuration files.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import { AGENT_IDS } from "../agents/types.js";
import { HANDLE_PATTERN_SOURCE, HandleSchema } from "./handle.js";
import {
  ExactSemverVersionSchema,
  VersionConstraintSchema,
} from "../version-constraints/version-constraints.js";

/**
 * Author information for a manifest.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const AuthorSchema = Schema.Struct({
  name: Schema.String.pipe(Schema.annotateKey({ messageMissingKey: "author name is required" })),
  email: Schema.optional(Schema.String),
  url: Schema.optional(Schema.String),
}).annotate({
  identifier: "Author",
  title: "Author",
  description: "Author details: name, email, and URL.",
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

export const extensionTypes = [
  "skill",
  "command",
  "mcp-server",
  "subagent",
  "file",
  "rule",
  "pack",
] as const;

export type ExtensionType = (typeof extensionTypes)[number];

const extensionTypeSet = new Set<string>(extensionTypes);

export const isExtensionType = (value: string | undefined): value is ExtensionType =>
  value !== undefined && extensionTypeSet.has(value);

export const extensionTypePluralSegments = [
  "skills",
  "commands",
  "mcp-servers",
  "subagents",
  "files",
  "rules",
  "packs",
] as const;

export type ExtensionTypePlural = (typeof extensionTypePluralSegments)[number];

const extensionTypePluralSet = new Set<string>(extensionTypePluralSegments);

export const isExtensionTypePlural = (value: string | undefined): value is ExtensionTypePlural =>
  value !== undefined && extensionTypePluralSet.has(value);

export const extensionTypeFromPlural: Record<ExtensionTypePlural, ExtensionType> = {
  skills: "skill",
  commands: "command",
  "mcp-servers": "mcp-server",
  subagents: "subagent",
  files: "file",
  rules: "rule",
  packs: "pack",
};

export const extensionTypeToPlural: Record<ExtensionType, ExtensionTypePlural> = {
  skill: "skills",
  command: "commands",
  "mcp-server": "mcp-servers",
  subagent: "subagents",
  file: "files",
  rule: "rules",
  pack: "packs",
};

export const toExtensionType = (segment: ExtensionTypePlural): ExtensionType =>
  extensionTypeFromPlural[segment];

export const toExtensionTypePlural = (type: ExtensionType): ExtensionTypePlural =>
  extensionTypeToPlural[type];

export const extensionTypeLabels: Record<ExtensionType, string> = {
  skill: "Skill",
  command: "Command",
  "mcp-server": "MCP Server",
  subagent: "Subagent",
  file: "File",
  rule: "Rule",
  pack: "Pack",
};

export const extensionTypePluralLabels: Record<ExtensionTypePlural, string> = {
  skills: "Skills",
  commands: "Commands",
  "mcp-servers": "MCP Servers",
  subagents: "Subagents",
  files: "Files",
  rules: "Rules",
  packs: "Packs",
};

const EXTENSION_TYPE_PLURAL_PATTERN_SOURCE = extensionTypePluralSegments.join("|");
const EXTENSION_NAME_MAX_LENGTH = 64;
const EXTENSION_NAME_PATTERN_SOURCE = "[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?";
const EXTENSION_NAME_BRAND = "ExtensionName" as const;

const invalidExtensionName = (value: string) =>
  `Expected extension name to be max ${EXTENSION_NAME_MAX_LENGTH} characters, use lowercase letters, numbers, and hyphens only, and not start or end with a hyphen, got: ${value}`;

const makeExtensionNameSchema = () =>
  Schema.String.pipe(
    Schema.check(
      Schema.makeFilter((value: string) =>
        EXTENSION_NAME_PATTERN.test(value) ? undefined : invalidExtensionName(value),
      ),
    ),
    Schema.annotate({
      identifier: "ExtensionName",
      title: "Extension Name",
      description:
        "The name of an extension — lowercase letters, numbers, and hyphens (e.g. my-skill).",
      examples: ["my-skill", "code-review", "prettier"],
      message:
        "Expected a valid extension name (lowercase letters, numbers, and hyphens, e.g., my-skill)",
    }),
    Schema.brand(EXTENSION_NAME_BRAND),
  );

/**
 * Fully qualified name regex: `@<handle>/<type>/<name>` where handle and name
 * use the canonical handle, plural extension type, and extension name grammar.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const FQN_PATTERN = new RegExp(
  `^(${HANDLE_PATTERN_SOURCE})\\/(${EXTENSION_TYPE_PLURAL_PATTERN_SOURCE})\\/(${EXTENSION_NAME_PATTERN_SOURCE})$`,
);

/**
 * Canonical extension short name regex.
 */
export const EXTENSION_NAME_PATTERN = new RegExp(`^${EXTENSION_NAME_PATTERN_SOURCE}$`);

/**
 * Canonical extension short name schema shared by generic extension surfaces.
 */
export const ExtensionNameSchema = makeExtensionNameSchema();

export type ExtensionName = Schema.Schema.Type<typeof ExtensionNameSchema>;

export const decodeExtensionNameSync = Schema.decodeUnknownSync(ExtensionNameSchema);

/**
 * Extension type enumeration.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const ExtensionTypeSchema = Schema.Literals(extensionTypes).annotate({
  identifier: "ExtensionType",
  title: "Extension Type",
  description:
    "What kind of extension this is: skill, command, mcp-server, subagent, file, rule, or pack.",
});

/**
 * Plural extension-type segment enumeration used by route/FQN surfaces.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const ExtensionTypePluralSchema = Schema.Literals(extensionTypePluralSegments).annotate({
  identifier: "ExtensionTypePlural",
  title: "Extension Type (Plural)",
  description:
    "Plural form of the extension type used in URLs and identifiers (e.g. skills, commands, packs).",
});

/**
 * Structured FQN parts schema composed from the canonical handle, type, and name schemas.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const FullyQualifiedNamePartsSchema = Schema.Struct({
  owner: HandleSchema,
  type: ExtensionTypePluralSchema,
  name: ExtensionNameSchema,
}).annotate({
  identifier: "FullyQualifiedNameParts",
  title: "Fully Qualified Name Parts",
  description: "The parts of a full extension identifier like @my-org/skills/code-review.",
});

/**
 * Inferred type for parsed FQN parts.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type FullyQualifiedNameParts = Schema.Schema.Type<typeof FullyQualifiedNamePartsSchema>;

const decodeFullyQualifiedNameParts = Schema.decodeUnknownResult(FullyQualifiedNamePartsSchema);

/**
 * Parse a fully qualified name string into validated structured parts.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const parseFullyQualifiedNameParts = (
  input: string,
): FullyQualifiedNameParts | undefined => {
  const parts = input.split("/");
  if (parts.length !== 3) {
    return undefined;
  }

  const [owner, type, name] = parts;
  if (owner === undefined || type === undefined || name === undefined) {
    return undefined;
  }

  const result = decodeFullyQualifiedNameParts({ owner, type, name });
  return Result.isSuccess(result) ? result.success : undefined;
};

/**
 * Fully qualified name string schema validated through the composed parts schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const FullyQualifiedNameSchema = Schema.String.pipe(
  Schema.check(
    Schema.makeFilter((value: string) => {
      return parseFullyQualifiedNameParts(value) === undefined
        ? `Expected fully qualified name in @handle/(skills|commands|mcp-servers|subagents|files|rules|packs)/name form, got: ${value}`
        : undefined;
    }),
  ),
);

/**
 * Inferred type for FullyQualifiedName schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type FullyQualifiedName = Schema.Schema.Type<typeof FullyQualifiedNameSchema>;

/**
 * Map of fully-qualified extension names to semver constraints.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const ExtensionDependencyConstraintMapSchema = Schema.Record(
  FullyQualifiedNameSchema,
  VersionConstraintSchema,
);

/**
 * Inferred type for extension dependency constraint maps.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type ExtensionDependencyConstraintMap = Schema.Schema.Type<
  typeof ExtensionDependencyConstraintMapSchema
>;

/**
 * Common base fields shared across manifest types.
 * Type-specific manifests provide their own `type` and `name` fields explicitly.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const CommonManifestBaseFields = {
  owner: HandleSchema.pipe(Schema.annotateKey({ messageMissingKey: "owner is required" })),
  version: ExactSemverVersionSchema.pipe(
    Schema.annotateKey({ messageMissingKey: "version is required" }),
  ),
  description: Schema.optional(Schema.String),
  keywords: Schema.optional(Schema.Array(Schema.String)),
  repository: Schema.optional(Schema.String),
  homepage: Schema.optional(Schema.String),
  license: Schema.optional(Schema.String),
  bugs: Schema.optional(Schema.String),
  authors: Schema.optional(Schema.Array(AuthorSchema)),
};

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

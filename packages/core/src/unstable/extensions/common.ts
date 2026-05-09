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
import { PackageUrlSchema } from "../packaging/package-url.js";
import { VersionSchema, VersionRangeSchema } from "../version-constraints/version-constraints.js";

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

export const extensionTypeSentenceLabels: Record<ExtensionType, string> = {
  skill: "skill",
  command: "command",
  "mcp-server": "MCP server",
  subagent: "subagent",
  file: "file",
  rule: "rule",
  pack: "pack",
};

export const extensionTypePluralSentenceLabels: Record<ExtensionTypePlural, string> = {
  skills: "skills",
  commands: "commands",
  "mcp-servers": "MCP servers",
  subagents: "subagents",
  files: "files",
  rules: "rules",
  packs: "packs",
};

const EXTENSION_TYPE_PLURAL_PATTERN_SOURCE = extensionTypePluralSegments.join("|");

/**
 * Plural extension-type segments that may appear as dependency keys —
 * everything except `packs`. Packs cannot depend on other packs.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const nonPackExtensionTypePluralSegments = [
  "skills",
  "commands",
  "mcp-servers",
  "subagents",
  "files",
  "rules",
] as const satisfies ReadonlyArray<Exclude<ExtensionTypePlural, "packs">>;

export type NonPackExtensionTypePlural = (typeof nonPackExtensionTypePluralSegments)[number];

const NON_PACK_EXTENSION_TYPE_PLURAL_PATTERN_SOURCE = nonPackExtensionTypePluralSegments.join("|");
const EXTENSION_NAME_MAX_LENGTH = 64;
const EXTENSION_NAME_PATTERN_SOURCE = "[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?";
const EXTENSION_NAME_BRAND = "ExtensionName" as const;

const INVALID_EXTENSION_NAME_MESSAGE = `Expected a valid extension name: max ${EXTENSION_NAME_MAX_LENGTH} characters, lowercase letters, numbers, and hyphens only, and not starting or ending with a hyphen (e.g., my-skill)`;

const makeExtensionNameSchema = () =>
  Schema.String.pipe(
    Schema.check(
      Schema.isPattern(EXTENSION_NAME_PATTERN, { message: INVALID_EXTENSION_NAME_MESSAGE }),
    ),
    Schema.annotate({
      identifier: "ExtensionName",
      title: "Extension Name",
      description:
        "The name of an extension — lowercase letters, numbers, and hyphens (e.g. my-skill).",
      examples: ["my-skill", "code-review", "prettier"],
      message: INVALID_EXTENSION_NAME_MESSAGE,
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
 * Fully qualified name regex restricted to non-pack extension types. Matches
 * `@<handle>/<type>/<name>` where `<type>` is any plural extension type other
 * than `packs`.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const NON_PACK_FQN_PATTERN = new RegExp(
  `^(${HANDLE_PATTERN_SOURCE})\\/(${NON_PACK_EXTENSION_TYPE_PLURAL_PATTERN_SOURCE})\\/(${EXTENSION_NAME_PATTERN_SOURCE})$`,
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
export const ExtensionFqnPartsSchema = Schema.Struct({
  owner: HandleSchema,
  type: ExtensionTypeSchema,
  name: ExtensionNameSchema,
}).annotate({
  identifier: "ExtensionFqnParts",
  title: "Extension FQN Parts",
  description: "The parts of a full extension identifier like @my-org/skills/code-review.",
});

/**
 * Inferred type for parsed FQN parts.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type ExtensionFqnParts = Schema.Schema.Type<typeof ExtensionFqnPartsSchema>;

const decodeExtensionFqnParts = Schema.decodeUnknownResult(ExtensionFqnPartsSchema);

/**
 * Parse a fully qualified name string into validated structured parts.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const parseExtensionFqnParts = (input: string): ExtensionFqnParts | undefined => {
  const parts = input.split("/");
  if (parts.length !== 3) {
    return undefined;
  }

  const [owner, typeSegment, name] = parts;
  if (owner === undefined || typeSegment === undefined || name === undefined) {
    return undefined;
  }

  if (!isExtensionTypePlural(typeSegment)) {
    return undefined;
  }

  const type = toExtensionType(typeSegment);
  const result = decodeExtensionFqnParts({ owner, type, name });
  return Result.isSuccess(result) ? result.success : undefined;
};

/**
 * Parse an extension spec string (with optional version constraint) into parts.
 * Strips the version constraint suffix and returns the validated FQN parts.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const parseExtensionSpecParts = (input: string): ExtensionFqnParts | undefined => {
  const lastSlash = input.lastIndexOf("/");
  const constraintAt = lastSlash > 0 ? input.indexOf("@", lastSlash + 1) : -1;
  const fqnPart = constraintAt > 0 ? input.slice(0, constraintAt) : input;
  return parseExtensionFqnParts(fqnPart);
};

const INVALID_EXTENSION_FQN_MESSAGE =
  "Expected fully qualified name in @handle/(skills|commands|mcp-servers|subagents|files|rules|packs)/name form";

/**
 * Fully qualified name string schema validated against the composed handle,
 * type, and name patterns. Annotated so JSON Schema generation surfaces a
 * `pattern` and a top-level `ExtensionFqn` definition that `Schema.Record`
 * keys can reference via `propertyNames`.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const ExtensionFqnSchema = Schema.String.pipe(
  Schema.check(Schema.isPattern(FQN_PATTERN, { message: INVALID_EXTENSION_FQN_MESSAGE })),
  Schema.annotate({
    identifier: "ExtensionFqn",
    title: "Extension FQN",
    description:
      "Fully qualified extension name in @handle/type/name form, like @acme/skills/code-review.",
    examples: ["@acme/skills/code-review", "@my-org/commands/format"],
    message: INVALID_EXTENSION_FQN_MESSAGE,
  }),
);

/**
 * Inferred type for ExtensionFqn schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type ExtensionFqn = Schema.Schema.Type<typeof ExtensionFqnSchema>;

const INVALID_NON_PACK_EXTENSION_FQN_MESSAGE =
  "Expected fully qualified name in @handle/(skills|commands|mcp-servers|subagents|files|rules)/name form (packs are not allowed)";

/**
 * Fully qualified name string schema restricted to non-pack extension types.
 * Used wherever pack-typed FQNs are not permitted, like the keys of a pack
 * manifest's `dependencies` map.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const NonPackExtensionFqnSchema = Schema.String.pipe(
  Schema.check(
    Schema.isPattern(NON_PACK_FQN_PATTERN, { message: INVALID_NON_PACK_EXTENSION_FQN_MESSAGE }),
  ),
  Schema.annotate({
    identifier: "NonPackExtensionFqn",
    title: "Non-Pack Extension FQN",
    description:
      "Fully qualified extension name in @handle/type/name form, restricted to non-pack types like skills, commands, mcp-servers, subagents, files, and rules.",
    examples: ["@acme/skills/code-review", "@my-org/commands/format"],
    message: INVALID_NON_PACK_EXTENSION_FQN_MESSAGE,
  }),
);

/**
 * Inferred type for NonPackExtensionFqn schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type NonPackExtensionFqn = Schema.Schema.Type<typeof NonPackExtensionFqnSchema>;

/**
 * Extension spec — fully qualified extension name with an optional version
 * constraint suffix. Accepts `@owner/type/name` or `@owner/type/name@constraint`
 * where the FQN portion validates through ExtensionFqnSchema and the optional
 * constraint validates as a semver VersionRange.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const ExtensionSpecSchema = Schema.String.pipe(
  Schema.check(
    Schema.makeFilter((value: string) => {
      // Find the constraint separator: the @ after the last slash
      const lastSlash = value.lastIndexOf("/");
      const constraintAt = lastSlash > 0 ? value.indexOf("@", lastSlash + 1) : -1;

      const fqnPart = constraintAt > 0 ? value.slice(0, constraintAt) : value;
      const constraintPart = constraintAt > 0 ? value.slice(constraintAt + 1) : undefined;

      // Validate FQN portion
      if (parseExtensionFqnParts(fqnPart) === undefined) {
        return `Expected extension spec in @handle/type/name[@constraint] form, got: ${value}`;
      }

      // Validate constraint portion if present
      if (constraintPart !== undefined) {
        const constraintResult = Schema.decodeUnknownResult(VersionRangeSchema)(constraintPart);
        if (Result.isFailure(constraintResult)) {
          return `Expected valid version constraint after @, got: ${constraintPart}`;
        }
      }

      return undefined;
    }),
  ),
  Schema.annotate({
    identifier: "ExtensionSpec",
    title: "Extension Spec",
    description:
      "Fully qualified extension name with an optional version constraint, like @owner/skills/name or @owner/skills/name@^1.0.0.",
    examples: ["@acme/skills/code-review", "@acme/skills/code-review@^1.0.0"],
  }),
  Schema.brand("ExtensionSpec"),
);

/**
 * Inferred type for ExtensionSpec schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type ExtensionSpec = Schema.Schema.Type<typeof ExtensionSpecSchema>;

/**
 * Map of fully-qualified extension names to semver constraints.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const ExtensionDependencyConstraintMapSchema = Schema.Record(
  ExtensionFqnSchema,
  VersionRangeSchema,
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
 * Map of non-pack fully-qualified extension names to semver constraints.
 * Used for pack manifest `dependencies`, which cannot include other packs.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const NonPackExtensionDependencyConstraintMapSchema = Schema.Record(
  NonPackExtensionFqnSchema,
  VersionRangeSchema,
);

/**
 * Inferred type for non-pack extension dependency constraint maps.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type NonPackExtensionDependencyConstraintMap = Schema.Schema.Type<
  typeof NonPackExtensionDependencyConstraintMapSchema
>;

/**
 * Common base fields shared across manifest types.
 * Type-specific manifests provide their own `type` and `name` fields explicitly.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const CommonManifestBaseFields = {
  owner: HandleSchema.pipe(Schema.annotateKey({ messageMissingKey: "owner is required" })),
  version: VersionSchema.pipe(Schema.annotateKey({ messageMissingKey: "version is required" })),
  description: Schema.optional(Schema.String),
  keywords: Schema.optional(Schema.Array(Schema.String)),
  repository: Schema.optional(Schema.String),
  homepage: Schema.optional(Schema.String),
  license: Schema.optional(Schema.String),
  bugs: Schema.optional(Schema.String),
  authors: Schema.optional(Schema.Array(AuthorSchema)),
  compatiblePackages: Schema.optional(
    Schema.Array(PackageUrlSchema).pipe(
      Schema.annotate({
        description: "Packages this extension is designed to work with, as Package URLs (purls).",
      }),
    ),
  ),
};

/**
 * Fields shared across non-pack extension manifests (skills, commands,
 * MCP servers, subagents). These describe how an extension relates to
 * packs.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const NonPackManifestFields = {
  recommendedPacks: Schema.optional(
    Schema.Array(ExtensionSpecSchema).pipe(
      Schema.annotate({
        description:
          "Packs this extension is intended to work with, as extension specs (e.g. @owner/packs/name or @owner/packs/name@^1.0.0).",
      }),
    ),
  ),
  standalone: Schema.optional(
    Schema.Boolean.pipe(
      Schema.annotate({
        description:
          "Whether this extension is designed to work without a pack. Defaults to true when omitted.",
      }),
    ),
  ),
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

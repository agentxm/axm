/**
 * Common schema definitions shared across AXM configuration files.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as EffectRecord from "effect/Record";
import * as Schema from "effect/Schema";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import { AGENT_IDS, CONFIGURABLE_AGENT_IDS } from "../agents/types.js";
import { HANDLE_PATTERN_SOURCE, HandleSchema } from "./handle.js";
import { parseLicenseExpression } from "./license.js";
import { CompanionPackageSchema } from "../package-urls/index.js";
import { ExtensionMetadataSchema } from "./manifest-metadata.js";
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
  description: "A person credited as a creator or maintainer of this extension.",
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
 * Repository field for extension manifests. Accepts either a URL string
 * (or shorthand like `github:owner/repo`) or an npm-style object with
 * optional `type` and `directory` for monorepo subpaths.
 *
 * Matches the shape accepted by npm's `package.json` `repository` field.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const RepositorySchema = Schema.Union([
  Schema.String.annotate({
    examples: ["https://github.com/acme/code-review", "github:acme/code-review"],
    format: "uri-reference",
  }),
  Schema.Struct({
    type: Schema.optional(
      Schema.NonEmptyString.annotate({
        description: "Version control system (e.g., `git`).",
        examples: ["git"],
      }),
    ),
    url: Schema.NonEmptyString.pipe(
      Schema.annotateKey({ messageMissingKey: "repository url is required" }),
      Schema.annotate({
        description: "Repository URL.",
        examples: ["https://github.com/acme/code-review"],
        format: "uri",
      }),
    ),
    directory: Schema.optional(
      Schema.NonEmptyString.annotate({
        description: "Subdirectory within the repository, for monorepo publishers.",
        examples: ["packages/code-review"],
      }),
    ),
  }),
]).annotate({
  identifier: "Repository",
  title: "Repository",
  description:
    "Source repository for this extension. Accepts a URL string (or `host:owner/repo` shorthand) or an object with `type`, `url`, and optional `directory`.",
});

/**
 * Inferred type for {@link RepositorySchema}.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type Repository = Schema.Schema.Type<typeof RepositorySchema>;

/**
 * Bugs field for extension manifests. Accepts either a URL string or an
 * npm-style object with optional `url` and `email`.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const BugsSchema = Schema.Union([
  Schema.String.annotate({
    examples: ["https://github.com/acme/code-review/issues"],
    format: "uri",
  }),
  Schema.Struct({
    url: Schema.optional(
      Schema.NonEmptyString.annotate({
        description: "Issue tracker URL.",
        examples: ["https://github.com/acme/code-review/issues"],
        format: "uri",
      }),
    ),
    email: Schema.optional(
      Schema.NonEmptyString.annotate({
        description: "Contact email for bug reports.",
        examples: ["bugs@acme.dev"],
        format: "email",
      }),
    ),
  }),
]).annotate({
  identifier: "Bugs",
  title: "Bugs",
  description:
    "Where to report bugs against this extension. Accepts a URL string or an object with optional `url` and `email`.",
});

/**
 * Inferred type for {@link BugsSchema}.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type Bugs = Schema.Schema.Type<typeof BugsSchema>;

/**
 * License field for extension manifests.
 *
 * Accepts valid SPDX license expressions plus the npm-compatible
 * `UNLICENSED` literal for proprietary code that grants no license.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const LicenseSchema = Schema.String.annotate({
  identifier: "License",
  title: "License",
  description: "SPDX license expression, or `UNLICENSED` for proprietary code.",
  examples: ["MIT", "Apache-2.0", "MIT OR Apache-2.0", "UNLICENSED"],
  format: "spdx-expression",
}).check(
  Schema.makeFilter((value) =>
    Result.isSuccess(parseLicenseExpression(value))
      ? true
      : "Expected a valid SPDX license expression or UNLICENSED",
  ),
);

/** How an extension type is distributed. All current types are registry-distributed. */
export type ExtensionDistribution = "registry";

/**
 * Where an extension type's installed artifacts live: in per-agent locations
 * AXM can collide with, in workspace-owned locations, or nowhere of its own
 * (container types like pack).
 */
export type ExtensionPlacement = "per-agent" | "workspace" | "container";

/** What a governing standard covers for a type, when one exists. */
export type StandardGoverns = "package-body" | "runtime-protocol" | "host-file";

/** Workspace-level capability a type participates in. */
export type WorkspaceCapabilityKey = "instructions";

/**
 * One extension type's naming and capability-axis row. Every CONDITIONAL
 * parity obligation is a predicate over the five axis columns.
 */
interface ExtensionTypeRow {
  readonly plural: string;
  readonly label: string;
  readonly pluralLabel: string;
  readonly sentenceLabel: string;
  readonly pluralSentenceLabel: string;
  readonly distribution: ExtensionDistribution;
  readonly placement: ExtensionPlacement;
  readonly governs: StandardGoverns | null;
  readonly installInputs: boolean;
  readonly workspaceCapability: WorkspaceCapabilityKey | null;
}

/**
 * Single source of truth for extension type naming. Row order is the canonical
 * display order. Every other type-naming export in this module derives from
 * this table, so a new extension type is exactly one row here: a missing
 * column is TS2741, an excess column is TS2353, and every downstream
 * `satisfies Record<ExtensionType, _>` table fails until the new type is
 * decided everywhere.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const EXTENSION_TYPE_TABLE = {
  skill: {
    plural: "skills",
    label: "Skill",
    pluralLabel: "Skills",
    sentenceLabel: "skill",
    pluralSentenceLabel: "skills",
    distribution: "registry",
    placement: "per-agent",
    governs: "package-body",
    installInputs: false,
    workspaceCapability: null,
  },
  "mcp-server": {
    plural: "mcps",
    label: "MCP Server",
    pluralLabel: "MCP Servers",
    sentenceLabel: "MCP server",
    pluralSentenceLabel: "MCP servers",
    distribution: "registry",
    placement: "per-agent",
    governs: "runtime-protocol",
    installInputs: true,
    workspaceCapability: null,
  },
  subagent: {
    plural: "subagents",
    label: "Subagent",
    pluralLabel: "Subagents",
    sentenceLabel: "subagent",
    pluralSentenceLabel: "subagents",
    distribution: "registry",
    placement: "per-agent",
    governs: null,
    installInputs: false,
    workspaceCapability: null,
  },
  rule: {
    plural: "rules",
    label: "Rule",
    pluralLabel: "Rules",
    sentenceLabel: "rule",
    pluralSentenceLabel: "rules",
    distribution: "registry",
    placement: "workspace",
    governs: "host-file",
    installInputs: false,
    workspaceCapability: "instructions",
  },
  hook: {
    plural: "hooks",
    label: "Hook",
    pluralLabel: "Hooks",
    sentenceLabel: "hook",
    pluralSentenceLabel: "hooks",
    distribution: "registry",
    placement: "per-agent",
    governs: null,
    installInputs: false,
    workspaceCapability: null,
  },
  knowledge: {
    plural: "knowledge",
    label: "Knowledge",
    pluralLabel: "Knowledge",
    sentenceLabel: "knowledge bundle",
    pluralSentenceLabel: "knowledge bundles",
    distribution: "registry",
    placement: "workspace",
    governs: "package-body",
    installInputs: false,
    workspaceCapability: null,
  },
  pack: {
    plural: "packs",
    label: "Pack",
    pluralLabel: "Packs",
    sentenceLabel: "pack",
    pluralSentenceLabel: "packs",
    distribution: "registry",
    placement: "container",
    governs: null,
    installInputs: false,
    workspaceCapability: null,
  },
} as const satisfies { readonly [key: string]: ExtensionTypeRow };

export type ExtensionType = keyof typeof EXTENSION_TYPE_TABLE;

export type ExtensionTypePlural = (typeof EXTENSION_TYPE_TABLE)[ExtensionType]["plural"];

export const extensionTypes: ReadonlyArray<ExtensionType> = EffectRecord.keys(EXTENSION_TYPE_TABLE);

// Row union carrying its own key, so the plural-keyed view can map back to the
// singular type id.
const tableRowsWithType = EffectRecord.map(EXTENSION_TYPE_TABLE, (row, type) => ({
  ...row,
  type,
}));
const tableByPlural = EffectRecord.mapKeys(tableRowsWithType, (_type, row) => row.plural);

export const extensionTypePluralSegments: ReadonlyArray<ExtensionTypePlural> =
  EffectRecord.keys(tableByPlural);

const extensionTypeSet = new Set<string>(extensionTypes);

export const isExtensionType = (value: string | undefined): value is ExtensionType =>
  value !== undefined && extensionTypeSet.has(value);

const extensionTypePluralSet = new Set<string>(extensionTypePluralSegments);

export const isExtensionTypePlural = (value: string | undefined): value is ExtensionTypePlural =>
  value !== undefined && extensionTypePluralSet.has(value);

export const extensionTypeFromPlural: Record<ExtensionTypePlural, ExtensionType> = EffectRecord.map(
  tableByPlural,
  (row) => row.type,
);

export const extensionTypeToPlural: Record<ExtensionType, ExtensionTypePlural> = EffectRecord.map(
  EXTENSION_TYPE_TABLE,
  (row) => row.plural,
);

export const toExtensionType = (segment: ExtensionTypePlural): ExtensionType =>
  extensionTypeFromPlural[segment];

export const toExtensionTypePlural = (type: ExtensionType): ExtensionTypePlural =>
  extensionTypeToPlural[type];

export const extensionTypeLabels: Record<ExtensionType, string> = EffectRecord.map(
  EXTENSION_TYPE_TABLE,
  (row) => row.label,
);

export const extensionTypePluralLabels: Record<ExtensionTypePlural, string> = EffectRecord.map(
  tableByPlural,
  (row) => row.pluralLabel,
);

export const extensionTypeSentenceLabels: Record<ExtensionType, string> = EffectRecord.map(
  EXTENSION_TYPE_TABLE,
  (row) => row.sentenceLabel,
);

export const extensionTypePluralSentenceLabels: Record<ExtensionTypePlural, string> =
  EffectRecord.map(tableByPlural, (row) => row.pluralSentenceLabel);

const EXTENSION_TYPE_PLURAL_PATTERN_SOURCE = extensionTypePluralSegments.join("|");

/**
 * Plural extension-type segments that may appear as dependency keys —
 * everything except `packs`. Packs cannot depend on other packs.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type NonPackExtensionTypePlural = Exclude<ExtensionTypePlural, "packs">;

export const nonPackExtensionTypePluralSegments: ReadonlyArray<NonPackExtensionTypePlural> =
  extensionTypePluralSegments.filter(
    (segment): segment is NonPackExtensionTypePlural => segment !== "packs",
  );

const NON_PACK_EXTENSION_TYPE_PLURAL_PATTERN_SOURCE = nonPackExtensionTypePluralSegments.join("|");

// ---------------------------------------------------------------------------
// Axis-derived type unions and arrays
// ---------------------------------------------------------------------------

type ExtensionTypeRows = typeof EXTENSION_TYPE_TABLE;

/**
 * Extension types whose table row matches an axis value. Derived, never
 * hand-written: an axis change on a row updates every union below, and the
 * exact-membership pins in extension-type-table.type-test.ts fail compile in
 * both directions if a union gains or loses a member.
 */
type TypesWhere<Axis extends keyof ExtensionTypeRow, Value> = {
  [Key in ExtensionType]: ExtensionTypeRows[Key][Axis] extends Value ? Key : never;
}[ExtensionType];

/** Extension types materialized into agent-owned locations. */
export type PerAgentType = TypesWhere<"placement", "per-agent">;

/** Extension types materialized into workspace-owned locations. */
export type WorkspaceType = TypesWhere<"placement", "workspace">;

/** Extension types that coordinate other extensions instead of projecting directly. */
export type ContainerType = TypesWhere<"placement", "container">;

/** Registry-distributed non-container extension types. */
export type RegistryType = PerAgentType | WorkspaceType;

/** Extension types whose installs accept user-provided inputs. */
export type InputType = TypesWhere<"installInputs", true>;

/** Extension types whose governing standard covers the package body. */
export type BodyGovernedType = TypesWhere<"governs", "package-body">;

/**
 * Extension types a standard governs at all. The agent catalog records a
 * standards-compliance grade for exactly these, so the grade is never
 * hand-applied per capability schema.
 */
export type SpecTrackedType = TypesWhere<"governs", StandardGoverns>;

/**
 * Extension types that double as a workspace-level capability toggle. These
 * carry workspace configuration of their own, so surfaces that split extension
 * management from workspace management group them with the workspace.
 */
export type WorkspaceCapabilityType = TypesWhere<"workspaceCapability", WorkspaceCapabilityKey>;

export const PER_AGENT_EXTENSION_TYPES: ReadonlyArray<PerAgentType> = extensionTypes.filter(
  (type): type is PerAgentType => EXTENSION_TYPE_TABLE[type].placement === "per-agent",
);

export const WORKSPACE_EXTENSION_TYPES: ReadonlyArray<WorkspaceType> = extensionTypes.filter(
  (type): type is WorkspaceType => EXTENSION_TYPE_TABLE[type].placement === "workspace",
);

export const CONTAINER_EXTENSION_TYPES: ReadonlyArray<ContainerType> = extensionTypes.filter(
  (type): type is ContainerType => EXTENSION_TYPE_TABLE[type].placement === "container",
);

export const REGISTRY_EXTENSION_TYPES: ReadonlyArray<RegistryType> = extensionTypes.filter(
  (type): type is RegistryType => EXTENSION_TYPE_TABLE[type].placement !== "container",
);

export const INPUT_EXTENSION_TYPES: ReadonlyArray<InputType> = extensionTypes.filter(
  (type): type is InputType => EXTENSION_TYPE_TABLE[type].installInputs,
);

export const BODY_GOVERNED_EXTENSION_TYPES: ReadonlyArray<BodyGovernedType> = extensionTypes.filter(
  (type): type is BodyGovernedType => EXTENSION_TYPE_TABLE[type].governs === "package-body",
);

export const SPEC_TRACKED_EXTENSION_TYPES: ReadonlyArray<SpecTrackedType> = extensionTypes.filter(
  (type): type is SpecTrackedType => EXTENSION_TYPE_TABLE[type].governs !== null,
);

export const WORKSPACE_CAPABILITY_EXTENSION_TYPES: ReadonlyArray<WorkspaceCapabilityType> =
  extensionTypes.filter(
    (type): type is WorkspaceCapabilityType =>
      EXTENSION_TYPE_TABLE[type].workspaceCapability !== null,
  );

/** Extension types managed purely as extensions, with no workspace capability. */
export const EXTENSION_ONLY_TYPES: ReadonlyArray<Exclude<ExtensionType, WorkspaceCapabilityType>> =
  extensionTypes.filter(
    (type): type is Exclude<ExtensionType, WorkspaceCapabilityType> =>
      EXTENSION_TYPE_TABLE[type].workspaceCapability === null,
  );
const EXTENSION_NAME_MAX_LENGTH = 64;
const EXTENSION_NAME_PATTERN_SOURCE = "[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?";
const EXTENSION_NAME_BRAND = "ExtensionName" as const;

const INVALID_EXTENSION_NAME_MESSAGE = `Expected a valid extension name: max ${EXTENSION_NAME_MAX_LENGTH} characters, lowercase letters, numbers, and hyphens only, and not starting or ending with a hyphen (e.g., my-skill)`;

const makeExtensionNameSchema = () =>
  Schema.NonEmptyString.pipe(
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
 * Fully qualified name regex restricted to the pack extension type. Matches
 * `@<handle>/packs/<name>`.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const PACK_FQN_PATTERN = new RegExp(
  `^(${HANDLE_PATTERN_SOURCE})\\/packs\\/(${EXTENSION_NAME_PATTERN_SOURCE})$`,
);

const EXTENSION_SPEC_PATTERN = new RegExp(
  `^(${HANDLE_PATTERN_SOURCE})\\/(${EXTENSION_TYPE_PLURAL_PATTERN_SOURCE})\\/(${EXTENSION_NAME_PATTERN_SOURCE})(?:@.+)?$`,
);

const PACK_SPEC_PATTERN = new RegExp(
  `^(${HANDLE_PATTERN_SOURCE})\\/packs\\/(${EXTENSION_NAME_PATTERN_SOURCE})(?:@.+)?$`,
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
    "What kind of extension this is: skill, mcp-server, subagent, rule, hook, knowledge, or pack.",
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
    "Plural form of the extension type used in URLs and identifiers (e.g. skills, hooks, packs).",
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
  "Expected fully qualified name in @handle/(skills|mcps|subagents|rules|hooks|knowledge|packs)/name form";

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
    description: "Canonical extension identifier in @owner/<type>s/<name> form.",
    examples: ["@acme/skills/code-review", "@my-org/rules/typescript"],
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
  "Expected fully qualified name in @handle/(skills|mcps|subagents|rules|hooks|knowledge)/name form (packs are not allowed)";

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
      "Extension identifier restricted to non-pack types (skills, mcps, subagents, rules, hooks, knowledge).",
    examples: ["@acme/skills/code-review", "@my-org/rules/typescript"],
    message: INVALID_NON_PACK_EXTENSION_FQN_MESSAGE,
  }),
);

/**
 * Inferred type for NonPackExtensionFqn schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type NonPackExtensionFqn = Schema.Schema.Type<typeof NonPackExtensionFqnSchema>;

const INVALID_PACK_FQN_MESSAGE = "Expected fully qualified pack name in @handle/packs/name form";

/**
 * Fully qualified name string schema restricted to the pack extension type.
 * Used wherever only pack-typed FQNs are permitted, like the items of a
 * non-pack manifest's `recommendedPacks` list.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const PackFqnSchema = Schema.String.pipe(
  Schema.check(Schema.isPattern(PACK_FQN_PATTERN, { message: INVALID_PACK_FQN_MESSAGE })),
  Schema.annotate({
    identifier: "PackFqn",
    title: "Pack FQN",
    description: "Pack identifier in @owner/packs/<name> form.",
    examples: ["@acme/packs/typescript", "@my-org/packs/web"],
    message: INVALID_PACK_FQN_MESSAGE,
  }),
);

/**
 * Inferred type for PackFqn schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type PackFqn = Schema.Schema.Type<typeof PackFqnSchema>;

/**
 * Extension spec — fully qualified extension name with an optional version
 * constraint suffix. Accepts `@owner/type/name` or `@owner/type/name@constraint`
 * where the FQN portion validates through ExtensionFqnSchema and the optional
 * constraint validates as a semver VersionRange.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const ExtensionSpecSchema = Schema.NonEmptyString.pipe(
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
  Schema.check(
    Schema.isPattern(EXTENSION_SPEC_PATTERN, {
      message: "Expected extension spec in @handle/type/name[@constraint] form",
    }),
  ),
  Schema.annotate({
    identifier: "ExtensionSpec",
    title: "Extension Spec",
    description: "Extension reference with an optional version constraint suffix.",
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
 * Pack spec — fully qualified pack name with an optional version constraint
 * suffix. Accepts `@owner/packs/name` or `@owner/packs/name@constraint` where
 * the FQN portion validates through PackFqnSchema and the optional constraint
 * validates as a semver VersionRange.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const PackSpecSchema = Schema.NonEmptyString.pipe(
  Schema.check(
    Schema.makeFilter((value: string) => {
      const lastSlash = value.lastIndexOf("/");
      const constraintAt = lastSlash > 0 ? value.indexOf("@", lastSlash + 1) : -1;

      const fqnPart = constraintAt > 0 ? value.slice(0, constraintAt) : value;
      const constraintPart = constraintAt > 0 ? value.slice(constraintAt + 1) : undefined;

      if (!PACK_FQN_PATTERN.test(fqnPart)) {
        return `Expected pack spec in @handle/packs/name[@constraint] form, got: ${value}`;
      }

      if (constraintPart !== undefined) {
        const constraintResult = Schema.decodeUnknownResult(VersionRangeSchema)(constraintPart);
        if (Result.isFailure(constraintResult)) {
          return `Expected valid version constraint after @, got: ${constraintPart}`;
        }
      }

      return undefined;
    }),
  ),
  Schema.check(
    Schema.isPattern(PACK_SPEC_PATTERN, {
      message: "Expected pack spec in @handle/packs/name[@constraint] form",
    }),
  ),
  Schema.annotate({
    identifier: "PackSpec",
    title: "Pack Spec",
    description: "Pack reference with an optional version constraint suffix.",
    examples: ["@acme/packs/typescript", "@acme/packs/typescript@^1.0.0"],
  }),
  Schema.brand("PackSpec"),
);

/**
 * Inferred type for PackSpec schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type PackSpec = Schema.Schema.Type<typeof PackSpecSchema>;

/**
 * Map of fully-qualified extension names to semver constraints.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const ExtensionDependencyConstraintMapSchema = Schema.Record(
  Schema.String,
  VersionRangeSchema,
).check(Schema.isPropertyNames(ExtensionFqnSchema));

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
  Schema.String,
  VersionRangeSchema,
)
  .check(Schema.isPropertyNames(NonPackExtensionFqnSchema))
  .annotate({
    description:
      "Map of fully-qualified non-pack extension names to version ranges. Packs cannot depend on other packs.",
  });

/**
 * Inferred type for non-pack extension dependency constraint maps.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type NonPackExtensionDependencyConstraintMap = Schema.Schema.Type<
  typeof NonPackExtensionDependencyConstraintMapSchema
>;

/**
 * Publish-time packaging options.
 *
 * Declared in the manifest rather than in workspace settings so the policy
 * travels with the package: whoever publishes a checkout produces the same
 * archive. Absent means every file under the package directory is published,
 * which is the default and the only behavior before this field existed.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const PublishOptionsSchema = Schema.Struct({
  ignore: Schema.optional(
    Schema.Array(Schema.NonEmptyString)
      .pipe(Schema.check(Schema.isUnique()))
      .annotate({
        description:
          "Glob patterns matched against archive-relative POSIX paths. Matching files are left out of the published archive. `*` matches any run of characters, including `/`. A pattern that would drop the manifest is rejected at publish time.",
        examples: [["*.test.ts", "fixtures/*"]],
      }),
  ),
}).annotate({
  identifier: "PublishOptions",
  title: "Publish Options",
  description: "Options that shape the archive this package publishes.",
});

/** @experimental This API is unstable and may change without notice. */
export type PublishOptions = Schema.Schema.Type<typeof PublishOptionsSchema>;

/**
 * Common base fields shared across manifest types.
 * Type-specific manifests provide their own `type` and `name` fields explicitly.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const CommonManifestBaseFields = {
  publish: Schema.optional(PublishOptionsSchema),
  metadata: Schema.optional(ExtensionMetadataSchema),
  owner: HandleSchema.pipe(Schema.annotateKey({ messageMissingKey: "owner is required" })),
  version: VersionSchema.pipe(Schema.annotateKey({ messageMissingKey: "version is required" })),
  description: Schema.optional(
    Schema.String.annotate({
      description:
        "Short, registry-facing summary of this extension shown in listings and search results.",
    }),
  ),
  keywords: Schema.optional(
    Schema.Array(Schema.NonEmptyString).annotate({
      examples: [["lint", "typescript", "review"]],
    }),
  ),
  repository: Schema.optional(RepositorySchema),
  homepage: Schema.optional(
    Schema.String.annotate({
      examples: ["https://acme.dev/code-review"],
      format: "uri",
    }),
  ),
  license: Schema.optional(LicenseSchema),
  bugs: Schema.optional(BugsSchema),
  authors: Schema.optional(Schema.Array(AuthorSchema)),
  packages: Schema.optional(
    Schema.Array(CompanionPackageSchema).pipe(
      Schema.annotate({
        description:
          "External ecosystem packages this extension is designed to work with, declared as identity Package URLs with optional VERS compatibility ranges.",
      }),
    ),
  ),
};

/**
 * Fields shared across non-pack extension manifests. These describe how an
 * extension relates to packs.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const NonPackManifestFields = {
  enhances: Schema.optional(
    Schema.Array(
      Schema.NonEmptyString.pipe(
        Schema.check(
          Schema.isPattern(
            /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?::[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)?$/,
            {
              message:
                "Expected a lowercase kebab-case capability key with an optional :grade suffix.",
            },
          ),
        ),
      ),
    )
      .pipe(Schema.check(Schema.isUnique()))
      .annotate({
        description:
          "Soft capability enhancements used by the source. These never block installation.",
      }),
  ),
  requires: Schema.optional(
    Schema.Array(
      Schema.NonEmptyString.pipe(
        Schema.check(
          Schema.isPattern(
            /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?::[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)?$/,
            {
              message:
                "Expected a lowercase kebab-case capability key with an optional :grade suffix.",
            },
          ),
        ),
      ),
    )
      .pipe(Schema.check(Schema.isUnique()))
      .annotate({
        description: "Hard capabilities without which the extension cannot operate.",
      }),
  ),
  fallback: Schema.optional(
    Schema.Literals(["auto", "none"]).annotate({
      description:
        "Whether AXM may apply platform-provided capability fallbacks. Defaults to auto.",
      default: "auto",
    }),
  ),
  recommendedPacks: Schema.optional(
    Schema.Array(PackSpecSchema).pipe(
      Schema.annotate({
        description:
          "Pack recommendations and same-pack composition metadata. Entries do not install or guarantee the pack or its members.",
      }),
    ),
  ),
  standalone: Schema.optional(
    Schema.Boolean.pipe(
      Schema.annotate({
        description:
          "False means the extension requires sibling extensions that are direct members of a pack named in recommendedPacks; it does not create dependencies.",
        default: true,
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
export const AgentIdSchema = Schema.Literals([...AGENT_IDS]).annotate({
  identifier: "AgentId",
  title: "Agent ID",
  description: "Supported coding agent identifier.",
  examples: ["claude-code", "codex", "cursor"],
});

/**
 * Agent identifiers users may persist in `.axm/settings.json`.
 *
 * Synthetic materialization targets such as `universal` are known agents, but
 * they are injected by repository code rather than configured by users.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const ConfigurableAgentIdSchema = Schema.Literals([...CONFIGURABLE_AGENT_IDS]).annotate({
  identifier: "ConfigurableAgentId",
  title: "Configurable Agent ID",
  description: "Supported coding agent identifier used in `.axm/settings.json` `agents`.",
  examples: ["claude-code", "codex", "cursor"],
});

/**
 * Inferred type for AgentId schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type AgentId = Schema.Schema.Type<typeof AgentIdSchema>;

/** @experimental This API is unstable and may change without notice. */
export type ConfigurableAgentId = Schema.Schema.Type<typeof ConfigurableAgentIdSchema>;

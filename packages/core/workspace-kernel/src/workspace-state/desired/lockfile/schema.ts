import {
  ArtifactUrlSchema,
  HttpArtifactSnapshotSchema,
} from "@agentxm/extension-model/unstable/sources/http-artifact";
import { DistributionDescriptorSchema } from "@agentxm/extension-model/unstable/extensions/refs/ref-base";
/**
 * Lockfile schema definition.
 *
 * The lockfile (`axm.lock`, TOML) records accepted immutable resolutions for
 * externally sourced extensions.
 *
 * Lockfile version 1 is authority, not receipt history. It contains no authored,
 * bundled, inline, completion-time, or command-history state. Its optional
 * `projections` section records projection generation currency and the
 * digests of bytes AXM last wrote; it never establishes ownership.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import {
  localSourceCoordinates,
  retainedPackageId,
  type SourceAddressInvalid,
} from "../../workspace/source-address.js";
import { McpSourceKey } from "../../workspace/mcp-source-identity.js";
import * as SchemaIssue from "effect/SchemaIssue";
import * as SchemaTransformation from "effect/SchemaTransformation";
import { HandleSchema } from "@agentxm/extension-model/unstable/extensions";
import {
  RegistryEndpointFromString,
  type RegistryEndpoint,
} from "@agentxm/extension-model/unstable/extensions/registry-endpoint";
import { SourceHashSchema } from "@agentxm/extension-model/unstable/sources/source-hash";
import { TreeIntegritySchema } from "../../workspace/materialized-tree.js";
import { computePackManifestContentIdentity } from "../../workspace/pack-manifest-content-identity.js";
import {
  ExtensionNameSchema,
  NonPackExtensionFqnSchema,
  PackMemberConstraintMapSchema,
  parseExtensionFqnParts,
  toExtensionTypePlural,
  type ExtensionTypePlural,
} from "@agentxm/extension-model/unstable/extensions/common";
import type { InstallableExtensionType } from "@agentxm/extension-model/unstable/extensions/installable-types";
import {
  VersionRangeSchema,
  VersionSchema,
} from "@agentxm/extension-model/unstable/version-constraints";
import {
  GitSha1ObjectIdSchema,
  GitSha256ObjectIdSchema,
  SourceRefSchema,
  SourceSubPathSchema,
} from "@agentxm/extension-model/unstable/sources/types";
import { normalizeProjections, ProjectionsSchema } from "./projections.js";
import { compareCodePoints } from "./compare-code-points.js";

export const LOCKFILE_VERSION = 1;

// =============================================================================
// Self-describing source locators and accepted resolutions
// =============================================================================

const LocalSourceLockPathSchema = Schema.NonEmptyString.check(
  Schema.makeFilter((value: string) => {
    const coordinates = localSourceCoordinates(value);
    return Result.isFailure(coordinates) ? coordinates.failure.detail : undefined;
  }),
);

const GitSourceLocatorSchema = Schema.Struct({
  type: Schema.Literal("git"),
  url: Schema.URLFromString,
  path: Schema.optional(SourceSubPathSchema),
  revision: Schema.optional(SourceRefSchema),
  distribution: Schema.optional(DistributionDescriptorSchema),
});

const RegistrySourceLocatorSchema = Schema.Struct({
  type: Schema.Literal("registry"),
  url: RegistryEndpointFromString,
});

const PathSourceLocatorSchema = Schema.Struct({
  type: Schema.Literal("path"),
  path: LocalSourceLockPathSchema,
  distribution: Schema.optional(DistributionDescriptorSchema),
});

const makeExtensionIdentitySchema = <TOwner extends Schema.Top>(owner: TOwner) =>
  Schema.Struct({ owner, name: ExtensionNameSchema });

const GitAcceptedResolutionSchema = Schema.Union([
  Schema.Struct({ commit: GitSha1ObjectIdSchema, tree: GitSha1ObjectIdSchema }),
  Schema.Struct({ commit: GitSha256ObjectIdSchema, tree: GitSha256ObjectIdSchema }),
]);

const ArchiveIntegritySchema = Schema.String.check(
  Schema.isPattern(/^sha512-[A-Za-z0-9+/]{85}[AQgw]==(?![\s\S])/u, {
    message: "Expected one canonical SHA-512 archive integrity token",
  }),
).annotate({ identifier: "ArchiveIntegrity" });

const RegistryAcceptedResolutionSchema = Schema.Struct({
  version: VersionSchema,
  integrity: ArchiveIntegritySchema.annotate({
    description:
      "SRI sha512 of the published archive, verified against downloaded bytes before " +
      "extraction. The supply-chain guarantee for registry installs; never compared " +
      "against installed files on disk.",
  }),
  publisherBindingId: Schema.NonEmptyString,
});

const PathAcceptedResolutionSchema = Schema.Struct({
  tree: TreeIntegritySchema,
});

// =============================================================================
// Source Lock Entry Factory
// =============================================================================

/**
 * Creates the external-source lock-entry union.
 *
 * Used to produce lock-entry schemas with feature-specific shared fields.
 */
const makeSourceLockUnion = <TOwner extends Schema.Top, F extends Schema.Struct.Fields>(
  owner: TOwner,
  extraFields: F,
) =>
  Schema.Union([
    Schema.Struct({
      source: GitSourceLocatorSchema,
      identity: makeExtensionIdentitySchema(owner),
      resolved: GitAcceptedResolutionSchema,
      treeIntegrity: TreeIntegritySchema,
      ...extraFields,
    }),
    Schema.Struct({
      source: RegistrySourceLocatorSchema,
      identity: makeExtensionIdentitySchema(HandleSchema),
      resolved: RegistryAcceptedResolutionSchema,
      treeIntegrity: TreeIntegritySchema,
      ...extraFields,
    }),
    Schema.Struct({
      source: PathSourceLocatorSchema,
      identity: makeExtensionIdentitySchema(owner),
      resolved: PathAcceptedResolutionSchema,
      treeIntegrity: TreeIntegritySchema,
      ...extraFields,
    }),
  ]);

// =============================================================================
// Skill Lock Entry (union of all source types)
// =============================================================================

/**
 * Lock entry for a single installed skill.
 * Discriminated union by the nested `source.type` field.
 *
 * Every external source carries immutable accepted-resolution identity:
 * registry version/integrity/publisher binding, Git commit/tree, or local-path
 * tree identity. Source, extension identity, and accepted resolution remain
 * distinct nested records.
 *
 * @experimental This API is unstable and may change without notice.
 */
const HttpSkillLockEntrySchema = Schema.Struct({
  source: Schema.Struct({
    type: Schema.Literal("http"),
    url: ArtifactUrlSchema,
    kind: Schema.Literals(["skill-md", "archive", "index"]),
    entry: Schema.optional(Schema.NonEmptyString),
    path: SourceSubPathSchema,
    portable: Schema.Boolean,
    distribution: Schema.optional(DistributionDescriptorSchema),
  }),
  identity: makeExtensionIdentitySchema(Schema.optional(HandleSchema)),
  resolved: HttpArtifactSnapshotSchema,
  treeIntegrity: TreeIntegritySchema,
});
export const SkillLockEntrySchema = Schema.Union([
  makeSourceLockUnion(Schema.optional(HandleSchema), {}),
  HttpSkillLockEntrySchema,
]);

/**
 * Inferred type for SkillLockEntry schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type SkillLockEntry = Schema.Schema.Type<typeof SkillLockEntrySchema>;

// =============================================================================
// Skills Lock Map
// =============================================================================

/**
 * Map of skill names to their lock entries.
 * Skill names are simple identifiers (not FQN patterns).
 *
 * @experimental This API is unstable and may change without notice.
 */
const SkillsLockMapSchema = Schema.Record(
  Schema.toEncoded(ExtensionNameSchema),
  SkillLockEntrySchema,
);

// =============================================================================
// Subagent Lock Entry (union of all source types)
// =============================================================================

/**
 * Common fields for subagent lock entries.
 */
/**
 * Lock entry for a single installed subagent.
 * Discriminated union by the nested `source.type` field.
 *
 * External source entries carry immutable accepted-resolution identity.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const SubagentLockEntrySchema = makeSourceLockUnion(HandleSchema, {});

/**
 * Inferred type for SubagentLockEntry schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type SubagentLockEntry = Schema.Schema.Type<typeof SubagentLockEntrySchema>;

// =============================================================================
// Subagents Lock Map
// =============================================================================

/**
 * Map of subagent names to their lock entries.
 *
 * @experimental This API is unstable and may change without notice.
 */
const SubagentsLockMapSchema = Schema.Record(
  Schema.toEncoded(ExtensionNameSchema),
  SubagentLockEntrySchema,
);

// =============================================================================
// MCP Server Lock Entry (union of all source types, no agents)
// =============================================================================

/**
 * Lock entry for a single installed MCP server.
 * Discriminated union by the nested `source.type` field.
 *
 * External source entries carry immutable accepted-resolution identity. Inline
 * servers are authored settings and therefore have no lock row.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const McpServerLockEntrySchema = makeSourceLockUnion(Schema.optional(HandleSchema), {});

/**
 * Inferred type for McpServerLockEntry schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type McpServerLockEntry = Schema.Schema.Type<typeof McpServerLockEntrySchema>;

// =============================================================================
// MCP Servers Lock Map
// =============================================================================

/**
 * Map of canonical MCP source-resolution identities to their lock entries.
 * Local connection names live only in settings and native projections.
 *
 * @experimental This API is unstable and may change without notice.
 */
const McpServersLockMapSchema = Schema.Record(Schema.String, McpServerLockEntrySchema);

/**
 * Materialized file target recorded for rule and hook lifecycle decisions.
 *
 * @experimental This API is unstable and may change without notice.
 */
// =============================================================================
// Rule Lock Entry (union of all source types, no agents)
// =============================================================================

/**
 * Lock entry for a single installed rule.
 *
 * External source entries carry immutable accepted-resolution identity.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const RuleLockEntrySchema = makeSourceLockUnion(HandleSchema, {});

/** @experimental */
export type RuleLockEntry = Schema.Schema.Type<typeof RuleLockEntrySchema>;

/**
 * Map of rule names to their lock entries.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const RulesLockMapSchema = Schema.Record(
  Schema.toEncoded(ExtensionNameSchema),
  RuleLockEntrySchema,
);

/** @experimental */
export type RulesLockMap = Schema.Schema.Type<typeof RulesLockMapSchema>;

// =============================================================================
// Hook Lock Entry (union of all source types, no agents)
// =============================================================================

/**
 * Lock entry for a single installed hook.
 *
 * External source entries carry immutable accepted-resolution identity.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const HookLockEntrySchema = makeSourceLockUnion(HandleSchema, {});

/** @experimental */
export type HookLockEntry = Schema.Schema.Type<typeof HookLockEntrySchema>;

/**
 * Map of hook names to their lock entries.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const HooksLockMapSchema = Schema.Record(
  Schema.toEncoded(ExtensionNameSchema),
  HookLockEntrySchema,
);

/** @experimental */
export type HooksLockMap = Schema.Schema.Type<typeof HooksLockMapSchema>;

// =============================================================================
// Knowledge Lock Entry (isolated OKF bundle plus derived index)
// =============================================================================

/**
 * Lock entry for a single installed knowledge bundle.
 *
 * External source entries carry immutable accepted-resolution identity.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const KnowledgeLockEntrySchema = makeSourceLockUnion(HandleSchema, {});

export type KnowledgeLockEntry = Schema.Schema.Type<typeof KnowledgeLockEntrySchema>;
const KnowledgeLockMapSchema = Schema.Record(
  Schema.toEncoded(ExtensionNameSchema),
  KnowledgeLockEntrySchema,
);

// =============================================================================
// Pack Lock Entry
// =============================================================================

const packLockFields = {
  manifestVersion: VersionSchema,
  manifestContentIdentity: SourceHashSchema.annotate({
    description:
      "Semantic consistency digest over the accepted Pack identity, manifest version, and dependency declarations. It is not an authenticity signature.",
  }),
  dependencies: PackMemberConstraintMapSchema,
} satisfies Schema.Struct.Fields;

const consistentPackDeclaration = Schema.makeFilter(
  (entry: {
    readonly identity: { readonly owner: string; readonly name: string };
    readonly manifestVersion: string;
    readonly manifestContentIdentity: string;
    readonly dependencies: Schema.Schema.Type<typeof PackMemberConstraintMapSchema>;
    readonly resolved: { readonly version: string } | { readonly tree: string };
  }) => {
    if ("version" in entry.resolved && entry.resolved.version !== entry.manifestVersion) {
      return "Pack manifestVersion must match the accepted Registry version";
    }
    const identity = computePackManifestContentIdentity({
      ...entry.identity,
      type: "pack",
      version: entry.manifestVersion,
      dependencies: entry.dependencies,
    });
    return identity === entry.manifestContentIdentity
      ? undefined
      : "Pack manifestContentIdentity must match its accepted identity, version, and dependencies";
  },
);

/**
 * Lock entry for a Pack from any external source family. @experimental
 *
 * A Git or path Pack also records `sourceRoot`: the source view the Pack and
 * its sourceless members were discovered under, which `source.path` (the
 * Pack's own directory) does not determine. For Git it is the repository
 * subdirectory the locator named, absent at the repository root; for a path
 * source it is the workspace-relative directory the locator named. Pack member
 * source authority is derived from it.
 */
export const PackLockEntrySchema = Schema.Union([
  Schema.Struct({
    source: GitSourceLocatorSchema,
    identity: makeExtensionIdentitySchema(HandleSchema),
    resolved: GitAcceptedResolutionSchema,
    treeIntegrity: TreeIntegritySchema,
    ...packLockFields,
    sourceRoot: Schema.optional(SourceSubPathSchema),
  }),
  Schema.Struct({
    source: RegistrySourceLocatorSchema,
    identity: makeExtensionIdentitySchema(HandleSchema),
    resolved: RegistryAcceptedResolutionSchema,
    treeIntegrity: TreeIntegritySchema,
    ...packLockFields,
  }),
  Schema.Struct({
    source: PathSourceLocatorSchema,
    identity: makeExtensionIdentitySchema(HandleSchema),
    resolved: PathAcceptedResolutionSchema,
    treeIntegrity: TreeIntegritySchema,
    ...packLockFields,
    sourceRoot: LocalSourceLockPathSchema,
  }),
])
  .check(consistentPackDeclaration)
  .annotate({
    identifier: "PackLockEntry",
    title: "Pack Lock Entry",
    description: "Accepted immutable resolution and dependency constraints for a Pack.",
  });

/**
 * Inferred type for RegistryPackLockEntry schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type PackLockEntry = Schema.Schema.Type<typeof PackLockEntrySchema>;

/** @experimental */
export type RegistryPackLockEntry = Extract<
  PackLockEntry,
  { readonly source: { readonly type: "registry" } }
>;

/**
 * Constructor args for a registry pack lock entry.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type RegistryPackLockEntryArgs = RegistryPackLockEntry;

/**
 * Build a registry pack lock entry from typed args.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const makeRegistryPackLockEntry = (args: RegistryPackLockEntryArgs): RegistryPackLockEntry =>
  args;

// =============================================================================
// Packs Lock Map
// =============================================================================

/**
 * Map of pack names to their lock entries.
 *
 * @experimental This API is unstable and may change without notice.
 */
const PacksLockMapSchema = Schema.Record(
  Schema.toEncoded(ExtensionNameSchema),
  PackLockEntrySchema,
);

// =============================================================================
// Lock entry schemas by extension type
// =============================================================================

/**
 * Every installable extension type's lock-entry schema, keyed by type.
 *
 * Total by construction: a new extension type fails compile here until its lock
 * entry exists. The parity conformance suite decodes a synthetic entry through
 * each schema to check obligations that must hold for every type.
 *
 * Pack rows additionally carry their accepted dependency declaration.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const LOCK_ENTRY_SCHEMA_BY_TYPE = {
  skill: SkillLockEntrySchema,
  "mcp-server": McpServerLockEntrySchema,
  subagent: SubagentLockEntrySchema,
  rule: RuleLockEntrySchema,
  hook: HookLockEntrySchema,
  knowledge: KnowledgeLockEntrySchema,
  pack: PackLockEntrySchema,
} as const satisfies Record<InstallableExtensionType, Schema.Top>;

// =============================================================================
// Lockfile
// =============================================================================

/**
 * The joined in-memory view of the lockfile (`axm.lock`).
 *
 * The lockfile records the exact resolved state of all installed extensions,
 * enabling reproducible installations across environments.
 *
 * Structure:
 * - lockfileVersion: Schema version (currently 1)
 * - skills: Map of skill names to their lock entries
 * - packs: Map of pack names to their lock entries (optional)
 * - projections: Projection generation currency per kind and unit (optional)
 *
 * @experimental This API is unstable and may change without notice.
 */
export const LockfileViewSchema = Schema.Struct({
  lockfileVersion: Schema.Literal(LOCKFILE_VERSION).pipe(
    Schema.annotate({
      description: "Lockfile schema version.",
      default: LOCKFILE_VERSION,
    }),
    Schema.annotateKey({ messageMissingKey: "lockfileVersion is required" }),
  ),
  skills: SkillsLockMapSchema.pipe(
    Schema.annotateKey({ messageMissingKey: "skills map is required" }),
  ),
  subagents: Schema.optional(SubagentsLockMapSchema),
  mcpServers: Schema.optional(McpServersLockMapSchema),
  rules: Schema.optional(RulesLockMapSchema),
  hooks: Schema.optional(HooksLockMapSchema),
  knowledge: Schema.optional(KnowledgeLockMapSchema),
  packs: Schema.optional(PacksLockMapSchema),
  projections: Schema.optional(ProjectionsSchema),
});

/** In-memory joined resolution view. The wire codec stores packages only once. */
export type Lockfile = Schema.Schema.Type<typeof LockfileViewSchema>;

// =============================================================================
// Stored document (axm.lock)
// =============================================================================

const SourceFormatSchema = Schema.Literals([
  "native",
  "agent-plugins",
  "claude",
  "codex",
  "cursor",
]);
type SourceFormat = typeof SourceFormatSchema.Type;

const StoredRegistrySourceSchema = Schema.Struct({ registry: RegistryEndpointFromString });

const StoredGitSourceSchema = Schema.Struct({
  git: Schema.URLFromString,
  path: SourceSubPathSchema,
  format: SourceFormatSchema,
});

const StoredHttpSourceSchema = Schema.Struct({
  http: ArtifactUrlSchema,
  kind: Schema.Literals(["skill-md", "archive", "index"]),
  entry: Schema.optionalKey(Schema.NonEmptyString),
  path: SourceSubPathSchema,
  portable: Schema.Boolean,
  format: SourceFormatSchema,
});

const StoredPathSourceSchema = Schema.Struct({
  path: LocalSourceLockPathSchema,
  format: SourceFormatSchema,
});

const StoredPackDependencySchema = Schema.Union([
  Schema.Struct({
    name: NonPackExtensionFqnSchema,
    range: VersionRangeSchema,
    registry: RegistryEndpointFromString,
  }),
  Schema.Struct({ name: NonPackExtensionFqnSchema, range: VersionRangeSchema }),
]);

const StoredPackDependenciesSchema = Schema.Array(StoredPackDependencySchema).check(
  Schema.makeFilter((dependencies) => {
    const first = new Map<string, number>();
    const issues: Array<{ path: [number, string]; issue: string }> = [];
    dependencies.forEach((dependency, index) => {
      const previous = first.get(dependency.name);
      if (previous === undefined) first.set(dependency.name, index);
      else
        issues.push({
          path: [index, "name"],
          issue: `Duplicate dependency "${dependency.name}"; first declared at dependencies[${previous}].name`,
        });
    });
    return issues;
  }),
);

const storedPackDeclarationFields = {
  "manifest-version": Schema.optionalKey(VersionSchema),
  "manifest-identity": Schema.optionalKey(
    SourceHashSchema.annotate({
      description:
        "Semantic consistency digest over the accepted Pack identity, manifest version, and dependency declarations. It is not an authenticity signature.",
    }),
  ),
  dependencies: Schema.optionalKey(StoredPackDependenciesSchema),
} satisfies Schema.Struct.Fields;

const StoredRegistryPackageSchema = Schema.Struct({
  id: Schema.NonEmptyString,
  source: StoredRegistrySourceSchema,
  version: VersionSchema,
  archive: ArchiveIntegritySchema,
  publisher: Schema.NonEmptyString,
  tree: TreeIntegritySchema,
  ...storedPackDeclarationFields,
});

const storedGitPackageFields = {
  id: Schema.NonEmptyString,
  source: StoredGitSourceSchema,
  tree: TreeIntegritySchema,
  ...storedPackDeclarationFields,
  "source-root": Schema.optionalKey(Schema.String),
};
const StoredGitPackageSchema = Schema.Union([
  Schema.Struct({
    ...storedGitPackageFields,
    commit: GitSha1ObjectIdSchema,
    "git-tree": GitSha1ObjectIdSchema,
  }),
  Schema.Struct({
    ...storedGitPackageFields,
    commit: GitSha256ObjectIdSchema,
    "git-tree": GitSha256ObjectIdSchema,
  }),
]);

const StoredHttpPackageSchema = Schema.Struct({
  id: Schema.NonEmptyString,
  source: StoredHttpSourceSchema,
  artifact: HttpArtifactSnapshotSchema,
  tree: TreeIntegritySchema,
});

const StoredPathPackageSchema = Schema.Struct({
  id: Schema.NonEmptyString,
  source: StoredPathSourceSchema,
  tree: TreeIntegritySchema,
  ...storedPackDeclarationFields,
  "source-root": Schema.optionalKey(Schema.String),
});

/** One retained package: its source address, accepted snapshot, and tree integrity. */
const StoredPackageSchema = Schema.Union([
  StoredRegistryPackageSchema,
  StoredGitPackageSchema,
  StoredHttpPackageSchema,
  StoredPathPackageSchema,
]);
type StoredPackage = typeof StoredPackageSchema.Type;

const StoredComponentSchema = Schema.Struct({
  format: Schema.Literals(["agent-plugins", "claude", "codex", "cursor"]),
  root: Schema.String,
  path: Schema.String,
  manifest: Schema.optionalKey(Schema.String),
  marketplace: Schema.optionalKey(Schema.Struct({ path: Schema.String, name: Schema.String })),
});

/** One selected extension: the package it is retained in and its declared identity. */
const StoredBindingSchema = Schema.Struct({
  package: Schema.NonEmptyString,
  name: Schema.NonEmptyString,
  spec: Schema.optionalKey(SourceRefSchema),
  component: Schema.optionalKey(StoredComponentSchema),
});
type StoredBinding = typeof StoredBindingSchema.Type;
const StoredBindingsSchema = Schema.Record(
  Schema.toEncoded(ExtensionNameSchema),
  StoredBindingSchema,
);

/**
 * Tool-owned tables, preserved on write and never read for installation. Their
 * values are opaque: any TOML value a tool wrote is carried through as parsed.
 */
const LockfileToolTablesSchema = Schema.Record(
  Schema.String,
  Schema.Record(Schema.String, Schema.Unknown),
);

/**
 * The sole accepted on-disk contract: the data model of the `axm.lock` TOML
 * document. Older lock formats are not converted.
 */
export const StoredLockfileSchema = Schema.Struct({
  version: Schema.Literal(LOCKFILE_VERSION).annotate({
    description: "Lockfile format version.",
    default: LOCKFILE_VERSION,
  }),
  package: Schema.optionalKey(Schema.Array(StoredPackageSchema)),
  skills: Schema.optionalKey(StoredBindingsSchema),
  mcp: Schema.optionalKey(Schema.Array(StoredBindingSchema)),
  subagents: Schema.optionalKey(StoredBindingsSchema),
  rules: Schema.optionalKey(StoredBindingsSchema),
  hooks: Schema.optionalKey(StoredBindingsSchema),
  knowledge: Schema.optionalKey(StoredBindingsSchema),
  packs: Schema.optionalKey(StoredBindingsSchema),
  projections: Schema.optionalKey(ProjectionsSchema),
  tool: Schema.optionalKey(LockfileToolTablesSchema),
});
type StoredLockfile = typeof StoredLockfileSchema.Type;

/** The parsed TOML document the canonical emitter writes. */
export type StoredLockfileDocument = typeof StoredLockfileSchema.Encoded;

/** Binding tables in file order, with the view map and route plural each corresponds to. */
const BINDING_TABLES = [
  { view: "skills", plural: "skills" },
  { view: "mcpServers", plural: "mcps" },
  { view: "subagents", plural: "subagents" },
  { view: "rules", plural: "rules" },
  { view: "hooks", plural: "hooks" },
  { view: "knowledge", plural: "knowledge" },
  { view: "packs", plural: "packs" },
] as const satisfies ReadonlyArray<{
  readonly view: keyof Lockfile;
  readonly plural: ExtensionTypePlural;
}>;
type BindingTable = (typeof BINDING_TABLES)[number];

type AnyLockEntry =
  | SkillLockEntry
  | SubagentLockEntry
  | McpServerLockEntry
  | RuleLockEntry
  | HookLockEntry
  | KnowledgeLockEntry
  | PackLockEntry;

/** Where one retained package comes from, as the bindings it serves agree on it. */
export type RetainedPackageSource =
  | {
      readonly type: "registry";
      readonly url: RegistryEndpoint;
      readonly owner: string;
      readonly extensionType: ExtensionTypePlural;
      readonly name: string;
    }
  | {
      readonly type: "git";
      readonly url: URL;
      readonly path: string;
      readonly format: SourceFormat;
    }
  | { readonly type: "path"; readonly path: string; readonly format: SourceFormat }
  | {
      readonly type: "http";
      readonly url: URL;
      readonly kind: "skill-md" | "archive" | "index";
      readonly entry?: string;
      readonly path: string;
      readonly portable: boolean;
      readonly format: SourceFormat;
    };

const isRegistryEntry = (
  entry: AnyLockEntry,
): entry is Extract<AnyLockEntry, { readonly source: { readonly type: "registry" } }> =>
  entry.source.type === "registry";

const packageRootOf = (path: string, componentPath: string | undefined): string => {
  const suffix = componentPath === undefined || componentPath === "." ? "" : `/${componentPath}`;
  return path === componentPath
    ? "."
    : suffix.length > 0 && path.endsWith(suffix)
      ? path.slice(0, -suffix.length) || "."
      : path;
};

/** The retained package one accepted binding of `type` selects a component of. */
export const packageSourceForEntry = (
  type: ExtensionTypePlural,
  entry: AnyLockEntry,
): RetainedPackageSource => {
  if (isRegistryEntry(entry))
    return {
      type: "registry",
      url: entry.source.url,
      owner: entry.identity.owner,
      extensionType: type,
      name: entry.identity.name,
    };
  const source = entry.source;
  const format = source.distribution?.format ?? "native";
  if (source.type === "git")
    return {
      type: "git",
      url: source.url,
      path: source.distribution?.packageRoot ?? source.path ?? ".",
      format,
    };
  if (source.type === "http")
    return {
      type: "http",
      url: source.url,
      kind: source.kind,
      ...(source.entry === undefined ? {} : { entry: source.entry }),
      path: source.distribution?.packageRoot ?? source.path,
      portable: source.portable,
      format,
    };
  return {
    type: "path",
    path: packageRootOf(source.path, source.distribution?.componentPath),
    format,
  };
};

const invalidStoredLock = (message: string) => new SchemaIssue.InvalidValue({ message });

const sortedRecord = <T>(record: Readonly<Record<string, T>>): Record<string, T> =>
  Object.fromEntries(
    Object.entries(record).sort(([left], [right]) => compareCodePoints(left, right)),
  );

/** `@owner/<plural>/<name>` for an owned identity; the bare name otherwise. */
const bindingName = (
  identity: { readonly owner?: string | undefined; readonly name: string },
  plural: ExtensionTypePlural,
): string =>
  identity.owner === undefined ? identity.name : `${identity.owner}/${plural}/${identity.name}`;

const isExtensionName = Schema.is(ExtensionNameSchema);

const parseBindingName = (
  name: string,
  plural: ExtensionTypePlural,
): { readonly owner?: string; readonly name: string } | undefined => {
  if (!name.includes("/")) return isExtensionName(name) ? { name } : undefined;
  const parts = parseExtensionFqnParts(name);
  return parts !== undefined && toExtensionTypePlural(parts.type) === plural
    ? { owner: parts.owner, name: parts.name }
    : undefined;
};

const storedSourceOf = (source: RetainedPackageSource) => {
  switch (source.type) {
    case "registry":
      return { registry: source.url };
    case "git":
      return { git: source.url, path: source.path, format: source.format };
    case "path":
      return { path: source.path, format: source.format };
    case "http":
      return {
        http: source.url,
        kind: source.kind,
        ...(source.entry === undefined ? {} : { entry: source.entry }),
        path: source.path,
        portable: source.portable,
        format: source.format,
      };
  }
};

/** The accepted snapshot fields a record stores; `undefined` when they cannot be stored. */
const storedSnapshotOf = (entry: AnyLockEntry): Record<string, unknown> | undefined => {
  const resolved = entry.resolved;
  if ("publisherBindingId" in resolved)
    return {
      version: resolved.version,
      archive: resolved.integrity,
      publisher: resolved.publisherBindingId,
    };
  if ("commit" in resolved) return { commit: resolved.commit, "git-tree": resolved.tree };
  if ("format" in resolved) return { artifact: resolved };
  // A path package's accepted snapshot is its tree integrity, stored once.
  return resolved.tree === entry.treeIntegrity ? {} : undefined;
};

const storedPackDeclarationOf = (entry: PackLockEntry): Record<string, unknown> => ({
  "manifest-version": entry.manifestVersion,
  "manifest-identity": entry.manifestContentIdentity,
  ...("sourceRoot" in entry && entry.sourceRoot !== undefined
    ? { "source-root": entry.sourceRoot }
    : {}),
  dependencies: Object.entries(entry.dependencies)
    .sort(([left], [right]) => compareCodePoints(left, right))
    .map(([name, constraint]) =>
      typeof constraint === "string"
        ? { name, range: constraint }
        : { name, range: constraint.versionRange, registry: constraint.source.url },
    ),
});

const storedBindingOf = (
  id: string,
  plural: ExtensionTypePlural,
  entry: AnyLockEntry,
): Record<string, unknown> => {
  const source = entry.source;
  const distribution = "distribution" in source ? source.distribution : undefined;
  return {
    package: id,
    name: bindingName(entry.identity, plural),
    ...(source.type === "git" && source.revision !== undefined ? { spec: source.revision } : {}),
    ...(distribution === undefined
      ? {}
      : {
          component: {
            format: distribution.format,
            root: distribution.packageRoot,
            path: distribution.componentPath,
            ...(distribution.manifestPath === undefined
              ? {}
              : { manifest: distribution.manifestPath }),
            ...(distribution.marketplace === undefined
              ? {}
              : { marketplace: distribution.marketplace }),
          },
        }),
  };
};

const viewEntriesOf = (
  view: Lockfile,
  table: BindingTable,
): ReadonlyArray<readonly [string, AnyLockEntry]> => Object.entries(view[table.view] ?? {});

const normalizeLockfile = (view: Lockfile) =>
  Effect.gen(function* () {
    const records = new Map<
      string,
      { readonly record: Record<string, unknown>; pack: Record<string, unknown> | undefined }
    >();
    const tables: Record<string, Record<string, unknown>> = {};
    const mcp: Array<Record<string, unknown>> = [];
    for (const table of BINDING_TABLES) {
      const bindings = new Map<string, unknown>();
      for (const [alias, entry] of viewEntriesOf(view, table)) {
        const source = packageSourceForEntry(table.plural, entry);
        const id = retainedPackageId(source);
        if (Result.isFailure(id)) return yield* Effect.fail(invalidStoredLock(id.failure.detail));
        const snapshot = storedSnapshotOf(entry);
        if (snapshot === undefined)
          return yield* Effect.fail(
            invalidStoredLock("A path package's accepted tree must equal its tree integrity"),
          );
        const record = {
          id: id.success,
          source: storedSourceOf(source),
          ...snapshot,
          tree: entry.treeIntegrity,
        };
        const pack =
          table.view === "packs" && "manifestVersion" in entry
            ? storedPackDeclarationOf(entry)
            : undefined;
        const previous = records.get(id.success);
        if (
          previous !== undefined &&
          (JSON.stringify(previous.record) !== JSON.stringify(record) ||
            (pack !== undefined &&
              previous.pack !== undefined &&
              JSON.stringify(previous.pack) !== JSON.stringify(pack)))
        )
          return yield* Effect.fail(
            invalidStoredLock(
              "Selected components of one retained package have conflicting accepted snapshots",
            ),
          );
        if (previous === undefined) records.set(id.success, { record, pack });
        else if (pack !== undefined) previous.pack = pack;
        const binding = storedBindingOf(id.success, table.plural, entry);
        if (table.view === "mcpServers") mcp.push(binding);
        else bindings.set(alias, binding);
      }
      if (table.view !== "mcpServers" && bindings.size > 0)
        tables[table.view] = sortedRecord(Object.fromEntries(bindings));
    }
    const packages = [...records.entries()]
      .sort(([left], [right]) => compareCodePoints(left, right))
      .map(([, { record, pack }]) => ({ ...record, ...pack }));
    const mcpKey = (binding: Record<string, unknown>) =>
      JSON.stringify([binding["package"], binding["name"]]);
    const mcpRows = mcp.sort((left, right) => compareCodePoints(mcpKey(left), mcpKey(right)));
    if (new Set(mcpRows.map(mcpKey)).size !== mcpRows.length)
      return yield* Effect.fail(
        invalidStoredLock("Two accepted MCP resolutions select one package component"),
      );
    const projections = normalizeProjections(view.projections);
    return yield* Schema.decodeUnknownEffect(Schema.toType(StoredLockfileSchema))({
      version: LOCKFILE_VERSION,
      ...(packages.length === 0 ? {} : { package: packages }),
      ...tables,
      ...(mcpRows.length === 0 ? {} : { mcp: mcpRows }),
      ...(projections === undefined ? {} : { projections }),
    }).pipe(Effect.mapError((error) => error.issue));
  });

const joinPackageComponent = (root: string, component: string): string =>
  [root, component].filter((part) => part !== "." && part !== "").join("/") || ".";

/** The package id a record's source places it at; a Registry id also needs its binding. */
const recordIdOf = (
  record: StoredPackage,
): Result.Result<string, SourceAddressInvalid> | undefined => {
  const source = record.source;
  if ("registry" in source) return undefined;
  if ("git" in source)
    return retainedPackageId({ type: "git", url: source.git, path: source.path });
  if ("http" in source)
    return retainedPackageId({
      type: "http",
      url: source.http,
      kind: source.kind,
      entry: source.entry,
      path: source.path,
    });
  return retainedPackageId({ type: "path", path: source.path });
};

const hasPackDeclaration = (record: StoredPackage): boolean =>
  "manifest-version" in record ||
  "manifest-identity" in record ||
  "dependencies" in record ||
  "source-root" in record;

const expandBinding = (
  table: BindingTable,
  binding: StoredBinding,
  record: StoredPackage,
): Effect.Effect<
  { readonly entry: Record<string, unknown>; readonly mcpKey?: string },
  SchemaIssue.Issue
> =>
  Effect.gen(function* () {
    const identity = parseBindingName(binding.name, table.plural);
    if (identity === undefined)
      return yield* Effect.fail(
        invalidStoredLock(
          `Binding name "${binding.name}" does not name one of the ${table.plural}`,
        ),
      );
    const component = binding.component;
    const distribution =
      component === undefined
        ? undefined
        : {
            format: component.format,
            packageRoot: component.root,
            componentPath: component.path,
            ...(component.manifest === undefined ? {} : { manifestPath: component.manifest }),
            ...(component.marketplace === undefined ? {} : { marketplace: component.marketplace }),
          };
    const source = record.source;
    if (binding.spec !== undefined && !("git" in source))
      return yield* Effect.fail(invalidStoredLock("Only Git component bindings may carry a spec"));
    if ("registry" in source) {
      const id =
        identity.owner === undefined || component !== undefined
          ? undefined
          : retainedPackageId({
              type: "registry",
              url: source.registry,
              owner: identity.owner,
              extensionType: table.plural,
              name: identity.name,
            });
      if (id === undefined || Result.isFailure(id) || id.success !== record.id)
        return yield* Effect.fail(
          invalidStoredLock("Registry binding does not match its published package identity"),
        );
    } else {
      if (source.format !== (component?.format ?? "native"))
        return yield* Effect.fail(
          invalidStoredLock("Component format does not match its retained package"),
        );
      if (
        ("git" in source || "http" in source) &&
        component !== undefined &&
        component.root !== source.path
      )
        return yield* Effect.fail(
          invalidStoredLock("Component package root does not match its retained package boundary"),
        );
    }
    const selectedPath =
      "registry" in source ? "." : joinPackageComponent(source.path, component?.path ?? ".");
    const withDistribution = distribution === undefined ? {} : { distribution };
    const reconstructed =
      "registry" in source
        ? { type: "registry", url: source.registry }
        : "git" in source
          ? {
              type: "git",
              url: source.git,
              ...(selectedPath === "." ? {} : { path: selectedPath }),
              ...(binding.spec === undefined ? {} : { revision: binding.spec }),
              ...withDistribution,
            }
          : "http" in source
            ? {
                type: "http",
                url: source.http,
                kind: source.kind,
                ...(source.entry === undefined ? {} : { entry: source.entry }),
                path: selectedPath,
                portable: source.portable,
                ...withDistribution,
              }
            : { type: "path", path: selectedPath, ...withDistribution };
    const resolved =
      "version" in record
        ? {
            version: record.version,
            integrity: record.archive,
            publisherBindingId: record.publisher,
          }
        : "commit" in record
          ? { commit: record.commit, tree: record["git-tree"] }
          : "artifact" in record
            ? record.artifact
            : { tree: record.tree };
    const pack =
      table.view !== "packs"
        ? {}
        : "artifact" in record ||
            record["manifest-version"] === undefined ||
            record["manifest-identity"] === undefined ||
            record.dependencies === undefined
          ? undefined
          : {
              ...("source-root" in record && record["source-root"] !== undefined
                ? { sourceRoot: record["source-root"] }
                : {}),
              manifestVersion: record["manifest-version"],
              manifestContentIdentity: record["manifest-identity"],
              dependencies: Object.fromEntries(
                record.dependencies.map((dependency) => [
                  dependency.name,
                  "registry" in dependency
                    ? {
                        source: { type: "registry", url: dependency.registry },
                        versionRange: dependency.range,
                      }
                    : dependency.range,
                ]),
              ),
            };
    if (pack === undefined)
      return yield* Effect.fail(
        invalidStoredLock(
          "A Pack binding refers to a package without its accepted Pack declaration",
        ),
      );
    const entry = {
      source: reconstructed,
      identity,
      resolved,
      treeIntegrity: record.tree,
      ...pack,
    };
    if (table.view !== "mcpServers") return { entry };
    const row =
      "registry" in source
        ? { type: "registry" as const, url: source.registry }
        : "git" in source
          ? { type: "git" as const, url: source.git }
          : "http" in source
            ? undefined
            : { type: "path" as const, path: selectedPath };
    if (row === undefined)
      return yield* Effect.fail(invalidStoredLock("An MCP binding cannot select an HTTP package"));
    return { entry, mcpKey: McpSourceKey.fromLockEntry({ source: row, identity }) };
  });

const storedBindingsOf = (
  stored: StoredLockfile,
  table: BindingTable,
): ReadonlyArray<readonly [string | undefined, StoredBinding]> =>
  table.view === "mcpServers"
    ? (stored.mcp ?? []).map((binding) => [undefined, binding] as const)
    : Object.entries(stored[table.view] ?? {});

const expandLockfile = (stored: StoredLockfile) =>
  Effect.gen(function* () {
    const records = new Map<string, StoredPackage>();
    for (const record of stored.package ?? []) {
      if (records.has(record.id))
        return yield* Effect.fail(
          invalidStoredLock(`Retained package "${record.id}" is recorded twice`),
        );
      const id = recordIdOf(record);
      if (id !== undefined && (Result.isFailure(id) || id.success !== record.id))
        return yield* Effect.fail(
          invalidStoredLock(
            `Retained package id "${record.id}" does not match its source address and boundary`,
          ),
        );
      records.set(record.id, record);
    }
    const maps: Record<string, Record<string, unknown>> = {};
    const referenced = new Set<string>();
    const packBound = new Set<string>();
    for (const table of BINDING_TABLES) {
      const entries = new Map<string, unknown>();
      for (const [alias, binding] of storedBindingsOf(stored, table)) {
        const record = records.get(binding.package);
        if (record === undefined)
          return yield* Effect.fail(
            invalidStoredLock("A selected extension refers to an absent retained package"),
          );
        referenced.add(binding.package);
        if (table.view === "packs") packBound.add(binding.package);
        const expanded = yield* expandBinding(table, binding, record);
        const key = expanded.mcpKey ?? alias;
        if (key === undefined) continue;
        if (entries.has(key))
          return yield* Effect.fail(
            invalidStoredLock("Two accepted MCP resolutions select one package component"),
          );
        entries.set(key, expanded.entry);
      }
      if (entries.size > 0 || table.view === "skills")
        maps[table.view] = Object.fromEntries(entries);
    }
    for (const record of records.values()) {
      if (!referenced.has(record.id))
        return yield* Effect.fail(
          invalidStoredLock(
            "An unbound retained package requires explicit retirement before its last binding is withdrawn",
          ),
        );
      if (hasPackDeclaration(record) && !packBound.has(record.id))
        return yield* Effect.fail(
          invalidStoredLock("Only a Pack's retained package may carry a Pack declaration"),
        );
    }
    return yield* Schema.decodeUnknownEffect(Schema.toType(LockfileViewSchema))({
      lockfileVersion: LOCKFILE_VERSION,
      ...maps,
      ...(stored.projections === undefined ? {} : { projections: stored.projections }),
    }).pipe(Effect.mapError((error) => error.issue));
  });

/** The `axm.lock` codec: the stored TOML data model decoded to the joined view. */
export const LockfileSchema = StoredLockfileSchema.pipe(
  Schema.decodeTo(
    Schema.toType(LockfileViewSchema),
    SchemaTransformation.transformEffect({
      decode: expandLockfile,
      encode: normalizeLockfile,
    }),
  ),
).annotate({
  identifier: "Lockfile",
  title: "AXM Lockfile",
  description:
    "Accepted retained packages, selected component bindings, and projection generation currency. JSON Schema describes structural and lexical constraints; the CLI additionally validates cross-record references, dependency-name uniqueness, accepted Pack declarations, source and component consistency, semver ranges, and URL/locator semantics. TOML syntax, scalar kinds, and tool-value fidelity belong to the TOML reader. Desired state and projection ownership are authoritative elsewhere.",
});

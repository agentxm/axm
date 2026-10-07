import {
  ArtifactUrlSchema,
  HttpArtifactSnapshotSchema,
} from "@agentxm/extension-model/unstable/sources/http-artifact";
import { DistributionDescriptorSchema } from "@agentxm/extension-model/unstable/extensions/refs/ref-base";
/**
 * Lockfile schema definition.
 *
 * The lockfile (axm-lock.yaml) records accepted immutable resolutions for
 * externally sourced extensions.
 *
 * Lockfile v11 is authority, not receipt history. It contains no authored,
 * bundled, inline, projection, completion-time, or command-history state.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import {
  encodeSourcePath,
  localSourceCoordinates,
  fileSourceCoordinates,
  sourceUrlCoordinates,
} from "../../workspace/source-address.js";
import * as SchemaIssue from "effect/SchemaIssue";
import * as SchemaTransformation from "effect/SchemaTransformation";
import { HandleSchema } from "@agentxm/extension-model/unstable/extensions";
import { SourceHashSchema } from "@agentxm/extension-model/unstable/sources/source-hash";
import { TreeIntegritySchema } from "../../workspace/materialized-tree.js";
import { computePackManifestContentIdentity } from "../../workspace/pack-manifest-content-identity.js";
import {
  ExtensionNameSchema,
  PackMemberConstraintMapSchema,
} from "@agentxm/extension-model/unstable/extensions/common";
import type { InstallableExtensionType } from "@agentxm/extension-model/unstable/extensions/installable-types";
import { VersionSchema } from "@agentxm/extension-model/unstable/version-constraints";
import {
  SourceRefSchema,
  SourceSubPathSchema,
} from "@agentxm/extension-model/unstable/sources/types";

export const LOCKFILE_VERSION = 11;

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
  url: Schema.URLFromString,
});

const PathSourceLocatorSchema = Schema.Struct({
  type: Schema.Literal("path"),
  path: LocalSourceLockPathSchema,
  distribution: Schema.optional(DistributionDescriptorSchema),
});

const makeExtensionIdentitySchema = <TOwner extends Schema.Top>(owner: TOwner) =>
  Schema.Struct({ owner, name: ExtensionNameSchema });

const GitAcceptedResolutionSchema = Schema.Struct({
  commit: Schema.NonEmptyString,
  tree: Schema.NonEmptyString,
});

const RegistryAcceptedResolutionSchema = Schema.Struct({
  version: VersionSchema,
  integrity: Schema.String.annotate({
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
export const HttpSkillLockEntrySchema = Schema.Struct({
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
export const SkillsLockMapSchema = Schema.Record(Schema.String, SkillLockEntrySchema);

/**
 * Inferred type for SkillsLockMap schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type SkillsLockMap = Schema.Schema.Type<typeof SkillsLockMapSchema>;

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
export const SubagentsLockMapSchema = Schema.Record(Schema.String, SubagentLockEntrySchema);

/**
 * Inferred type for SubagentsLockMap schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type SubagentsLockMap = Schema.Schema.Type<typeof SubagentsLockMapSchema>;

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
export const McpServersLockMapSchema = Schema.Record(Schema.String, McpServerLockEntrySchema);

/**
 * Inferred type for McpServersLockMap schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type McpServersLockMap = Schema.Schema.Type<typeof McpServersLockMapSchema>;

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
export const RulesLockMapSchema = Schema.Record(Schema.String, RuleLockEntrySchema);

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
export const HooksLockMapSchema = Schema.Record(Schema.String, HookLockEntrySchema);

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
export const KnowledgeLockMapSchema = Schema.Record(Schema.String, KnowledgeLockEntrySchema);
export type KnowledgeLockMap = Schema.Schema.Type<typeof KnowledgeLockMapSchema>;

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

/** Registry variant of the Pack lock entry. @experimental */
export const RegistryPackLockEntrySchema = Schema.Struct({
  source: RegistrySourceLocatorSchema,
  identity: Schema.Struct({ owner: HandleSchema, name: ExtensionNameSchema }),
  resolved: RegistryAcceptedResolutionSchema,
  treeIntegrity: TreeIntegritySchema,
  ...packLockFields,
})
  .check(consistentPackDeclaration)
  .annotate({
    identifier: "RegistryPackLockEntry",
    title: "Registry Pack Lock Entry",
    description: "Accepted immutable resolution for a Registry Pack.",
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
export const PacksLockMapSchema = Schema.Record(Schema.String, PackLockEntrySchema);

/**
 * Inferred type for PacksLockMap schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type PacksLockMap = Schema.Schema.Type<typeof PacksLockMapSchema>;

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
 * Schema for lockfile (axm-lock.yaml).
 *
 * The lockfile records the exact resolved state of all installed extensions,
 * enabling reproducible installations across environments.
 *
 * Structure:
 * - lockfileVersion: Schema version (currently 11)
 * - skills: Map of skill names to their lock entries
 * - packs: Map of pack names to their lock entries (optional)
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
});

/** In-memory joined resolution view. The wire codec stores packages only once. */
export type Lockfile = Schema.Schema.Type<typeof LockfileViewSchema>;

const RetainedPackageSourceBaseSchema = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("git"),
    url: Schema.URLFromString,
    path: SourceSubPathSchema,
    format: Schema.String,
  }),
  Schema.Struct({
    type: Schema.Literal("registry"),
    url: Schema.URLFromString,
    owner: HandleSchema,
    extensionType: Schema.String,
    name: ExtensionNameSchema,
  }),
  Schema.Struct({
    type: Schema.Literal("path"),
    path: LocalSourceLockPathSchema,
    format: Schema.String,
  }),
  Schema.Struct({
    type: Schema.Literal("http"),
    url: ArtifactUrlSchema,
    kind: Schema.Literals(["skill-md", "archive", "index"]),
    entry: Schema.optional(Schema.NonEmptyString),
    path: SourceSubPathSchema,
    portable: Schema.Boolean,
    format: Schema.String,
  }),
]);

const RetainedPackageSourceSchema = RetainedPackageSourceBaseSchema.check(
  Schema.makeFilter((source) => {
    if (source.type === "path") return undefined;
    if ((source.type === "registry" || source.type === "git") && source.url.protocol === "file:") {
      const coordinates = fileSourceCoordinates(source.url);
      return Result.isFailure(coordinates) ? coordinates.failure.detail : undefined;
    }
    const address = sourceUrlCoordinates(source.url);
    if (Result.isFailure(address)) return address.failure.detail;
    const boundary =
      source.type === "registry"
        ? [source.owner, source.extensionType, source.name]
        : source.path === "."
          ? []
          : source.path.split("/");
    const encoded = encodeSourcePath([...address.success, ...boundary]);
    return Result.isFailure(encoded) ? encoded.failure.detail : undefined;
  }),
);

export const RetainedPackageSchema = Schema.Struct({
  source: RetainedPackageSourceSchema,
  resolved: Schema.Union([
    GitAcceptedResolutionSchema,
    RegistryAcceptedResolutionSchema,
    PathAcceptedResolutionSchema,
    HttpArtifactSnapshotSchema,
  ]),
  treeIntegrity: TreeIntegritySchema,
});
export type RetainedPackage = typeof RetainedPackageSchema.Type;

/** Stable package identity excludes selectors, accepted snapshots and transport context. */
export const retainedPackageKey = (source: typeof RetainedPackageSourceSchema.Type): string => {
  switch (source.type) {
    case "registry":
      return JSON.stringify([
        source.type,
        source.url.href.replace(/\/$/u, ""),
        source.owner,
        source.extensionType,
        source.name,
      ]);
    case "git":
      return JSON.stringify([source.type, source.url.href, source.path, source.format]);
    case "path":
      return JSON.stringify([source.type, source.path, source.format]);
    case "http":
      return JSON.stringify([
        source.type,
        source.url.href,
        source.kind,
        source.entry ?? null,
        source.path,
        source.portable,
        source.format,
      ]);
  }
};

const RetainedBindingSchema = Schema.Struct({
  package: Schema.NonEmptyString,
  identity: makeExtensionIdentitySchema(Schema.optional(HandleSchema)),
  component: Schema.optional(DistributionDescriptorSchema),
  revision: Schema.optional(SourceRefSchema),
});
const RetainedBindingsSchema = Schema.Record(Schema.String, RetainedBindingSchema);
const RetainedPackBindingSchema = Schema.Struct({
  ...RetainedBindingSchema.fields,
  sourceRoot: Schema.optional(Schema.String),
  identity: makeExtensionIdentitySchema(HandleSchema),
  manifestVersion: VersionSchema,
  manifestContentIdentity: SourceHashSchema,
  dependencies: PackMemberConstraintMapSchema,
});

/** The sole accepted on-disk contract; older lock formats are not converted. */
export const StoredLockfileSchema = Schema.Struct({
  lockfileVersion: Schema.Literal(LOCKFILE_VERSION).annotate({ default: LOCKFILE_VERSION }),
  packages: Schema.Record(Schema.String, RetainedPackageSchema),
  skills: RetainedBindingsSchema,
  subagents: Schema.optional(RetainedBindingsSchema),
  mcpServers: Schema.optional(RetainedBindingsSchema),
  rules: Schema.optional(RetainedBindingsSchema),
  hooks: Schema.optional(RetainedBindingsSchema),
  knowledge: Schema.optional(RetainedBindingsSchema),
  packs: Schema.optional(Schema.Record(Schema.String, RetainedPackBindingSchema)),
});
type StoredLockfile = typeof StoredLockfileSchema.Type;
const bindingMaps = [
  "skills",
  "subagents",
  "mcpServers",
  "rules",
  "hooks",
  "knowledge",
  "packs",
] as const;

const joinPackageComponent = (root: string, component: string): string =>
  [root, component].filter((part) => part !== "." && part !== "").join("/") || ".";

export const packageSourceForEntry = (
  type: (typeof bindingMaps)[number],
  entry:
    | SkillLockEntry
    | SubagentLockEntry
    | McpServerLockEntry
    | RuleLockEntry
    | HookLockEntry
    | KnowledgeLockEntry
    | PackLockEntry,
): typeof RetainedPackageSourceSchema.Type => {
  const source = entry.source;
  if (source.type === "registry") {
    // Registry rows require an owner in their source-specific resolution schema.
    const owner = Schema.decodeUnknownSync(HandleSchema)(entry.identity.owner);
    return {
      type: "registry",
      url: new URL(source.url.href.replace(/\/$/u, "")),
      owner,
      extensionType: type,
      name: entry.identity.name,
    };
  }
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
  const component = source.distribution?.componentPath;
  const suffix = component === undefined || component === "." ? "" : `/${component}`;
  const root =
    source.path === component
      ? "."
      : suffix.length > 0 && source.path.endsWith(suffix)
        ? source.path.slice(0, -suffix.length) || "."
        : source.path;
  return { type: "path", path: root, format };
};

const invalidStoredLock = (message: string) => new SchemaIssue.InvalidValue({ message });

const normalizeLockfile = (view: Lockfile) =>
  Effect.gen(function* () {
    const packages: Record<string, RetainedPackage> = {};
    const maps: Record<string, Record<string, unknown>> = {};
    for (const type of bindingMaps) {
      const entries = view[type];
      if (entries === undefined) continue;
      const bindings: Record<string, unknown> = {};
      for (const [name, entry] of Object.entries(entries)) {
        const source = packageSourceForEntry(type, entry);
        const key = retainedPackageKey(source);
        const proposed = { source, resolved: entry.resolved, treeIntegrity: entry.treeIntegrity };
        const previous = packages[key];
        if (previous !== undefined && JSON.stringify(previous) !== JSON.stringify(proposed)) {
          return yield* Effect.fail(
            invalidStoredLock(
              "Selected components of one retained package have conflicting accepted snapshots",
            ),
          );
        }
        packages[key] = proposed;
        bindings[name] = {
          package: key,
          identity: entry.identity,
          ...("distribution" in entry.source && entry.source.distribution !== undefined
            ? { component: entry.source.distribution }
            : {}),
          ...(entry.source.type === "git" && entry.source.revision !== undefined
            ? { revision: entry.source.revision }
            : {}),
          ...("sourceRoot" in entry ? { sourceRoot: entry.sourceRoot } : {}),
          ...("dependencies" in entry ? { dependencies: entry.dependencies } : {}),
          ...("manifestVersion" in entry ? { manifestVersion: entry.manifestVersion } : {}),
          ...("manifestContentIdentity" in entry
            ? { manifestContentIdentity: entry.manifestContentIdentity }
            : {}),
        };
      }
      maps[type] = bindings;
    }
    return yield* Schema.decodeUnknownEffect(Schema.toType(StoredLockfileSchema))({
      lockfileVersion: LOCKFILE_VERSION,
      packages,
      ...maps,
    }).pipe(Effect.mapError((error) => error.issue));
  });

const expandLockfile = (stored: StoredLockfile) =>
  Effect.gen(function* () {
    const maps: Record<string, Record<string, unknown>> = {};
    const referenced = new Set<string>();
    for (const type of bindingMaps) {
      const bindings = stored[type];
      if (bindings === undefined) continue;
      const entries: Record<string, unknown> = {};
      for (const [name, binding] of Object.entries(bindings)) {
        const retained = stored.packages[binding.package];
        if (retained === undefined)
          return yield* Effect.fail(
            invalidStoredLock("A selected extension refers to an absent retained package"),
          );
        if (retainedPackageKey(retained.source) !== binding.package)
          return yield* Effect.fail(
            invalidStoredLock(
              "Retained package key does not match its source authority and boundary",
            ),
          );
        referenced.add(binding.package);
        const source = retained.source;
        const component = binding.component;
        if (binding.revision !== undefined && source.type !== "git")
          return yield* Effect.fail(
            invalidStoredLock("Only Git component bindings may carry a revision"),
          );
        if (
          source.type === "registry" &&
          (source.extensionType !== type ||
            source.owner !== binding.identity.owner ||
            source.name !== binding.identity.name ||
            component !== undefined)
        )
          return yield* Effect.fail(
            invalidStoredLock("Registry binding does not match its published package identity"),
          );
        if (source.type !== "registry" && source.format !== (component?.format ?? "native"))
          return yield* Effect.fail(
            invalidStoredLock("Component format does not match its retained package"),
          );
        if (
          (source.type === "git" || source.type === "http") &&
          component !== undefined &&
          component.packageRoot !== source.path
        )
          return yield* Effect.fail(
            invalidStoredLock(
              "Component package root does not match its retained package boundary",
            ),
          );
        const selectedPath =
          source.type === "registry"
            ? undefined
            : joinPackageComponent(source.path, component?.componentPath ?? ".");
        const reconstructed =
          source.type === "registry"
            ? { type: "registry", url: source.url }
            : source.type === "git"
              ? {
                  type: "git",
                  url: source.url,
                  ...(selectedPath === "." ? {} : { path: selectedPath }),
                  ...(binding.revision === undefined ? {} : { revision: binding.revision }),
                  ...(component === undefined ? {} : { distribution: component }),
                }
              : source.type === "path"
                ? {
                    type: "path",
                    path: selectedPath,
                    ...(component === undefined ? {} : { distribution: component }),
                  }
                : {
                    type: "http",
                    url: source.url,
                    kind: source.kind,
                    ...(source.entry === undefined ? {} : { entry: source.entry }),
                    path: selectedPath,
                    portable: source.portable,
                    ...(component === undefined ? {} : { distribution: component }),
                  };
        entries[name] = {
          source: reconstructed,
          identity: binding.identity,
          resolved: retained.resolved,
          treeIntegrity: retained.treeIntegrity,
          ...("sourceRoot" in binding && binding.sourceRoot !== undefined
            ? { sourceRoot: binding.sourceRoot }
            : {}),
          ...("manifestVersion" in binding ? { manifestVersion: binding.manifestVersion } : {}),
          ...("manifestContentIdentity" in binding
            ? { manifestContentIdentity: binding.manifestContentIdentity }
            : {}),
          ...("dependencies" in binding ? { dependencies: binding.dependencies } : {}),
        };
      }
      maps[type] = entries;
    }
    if (Object.keys(stored.packages).some((key) => !referenced.has(key)))
      return yield* Effect.fail(
        invalidStoredLock(
          "An unbound retained package requires explicit retirement before its last binding is withdrawn",
        ),
      );
    return yield* Schema.decodeUnknownEffect(Schema.toType(LockfileViewSchema))({
      lockfileVersion: LOCKFILE_VERSION,
      ...maps,
    }).pipe(Effect.mapError((error) => error.issue));
  });

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
    "Accepted retained packages and selected component bindings. Desired state and projection ownership are authoritative elsewhere.",
});

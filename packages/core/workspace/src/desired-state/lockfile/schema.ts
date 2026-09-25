/**
 * Lockfile schema definition.
 *
 * The lockfile (axm-lock.yaml) records accepted immutable resolutions for
 * externally sourced extensions.
 *
 * Lockfile v8 is authority, not receipt history. It contains no authored,
 * bundled, inline, projection, completion-time, or command-history state.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";
import { ExtensionFqnSchema, HandleSchema } from "@agentxm/extension-model/unstable/extensions";
import { SourceHashSchema } from "@agentxm/extension-model/unstable/sources/source-hash";
import { TreeIntegritySchema } from "../workspace/materialized-tree.js";
import { ExtensionNameSchema } from "@agentxm/extension-model/unstable/extensions/common";
import type { InstallableExtensionType } from "@agentxm/extension-model/unstable/extensions/installable-types";
import { VersionSchema } from "@agentxm/extension-model/unstable/version-constraints";
import {
  SourceRefSchema,
  SourceSubPathSchema,
} from "@agentxm/extension-model/unstable/sources/types";

export const LOCKFILE_VERSION = 8;

// =============================================================================
// Self-describing source locators and accepted resolutions
// =============================================================================

const looksAbsolutePath = (value: string): boolean =>
  value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value) || value.startsWith("\\\\");

const LocalSourceLockPathSchema = Schema.String.pipe(
  Schema.check(
    Schema.makeFilter((value: string) =>
      looksAbsolutePath(value) ? "Expected a relative local source path" : undefined,
    ),
  ),
);

const GitSourceLocatorSchema = Schema.Struct({
  type: Schema.Literal("git"),
  url: Schema.URLFromString,
  path: Schema.optional(SourceSubPathSchema),
  revision: Schema.optional(SourceRefSchema),
});

const RegistrySourceLocatorSchema = Schema.Struct({
  type: Schema.Literal("registry"),
  url: Schema.URLFromString,
});

const PathSourceLocatorSchema = Schema.Struct({
  type: Schema.Literal("path"),
  path: LocalSourceLockPathSchema,
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
  tree: SourceHashSchema,
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
export const SkillLockEntrySchema = makeSourceLockUnion(Schema.optional(HandleSchema), {});

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
export const McpServerLockEntrySchema = makeSourceLockUnion(HandleSchema, {});

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
  manifestContentIdentity: SourceHashSchema,
  members: Schema.Array(ExtensionFqnSchema),
} satisfies Schema.Struct.Fields;

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
]).annotate({
  identifier: "PackLockEntry",
  title: "Pack Lock Entry",
  description: "Accepted immutable resolution and declared members for a Pack.",
});

/** Registry variant of the Pack lock entry. @experimental */
export const RegistryPackLockEntrySchema = Schema.Struct({
  source: RegistrySourceLocatorSchema,
  identity: Schema.Struct({ owner: HandleSchema, name: ExtensionNameSchema }),
  resolved: RegistryAcceptedResolutionSchema,
  treeIntegrity: TreeIntegritySchema,
  ...packLockFields,
}).annotate({
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
 * Packs are excluded — a pack lock entry records resolved members rather than a
 * single installed source, so it is not shape-comparable with the others.
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
 * - lockfileVersion: Schema version (currently 8)
 * - skills: Map of skill names to their lock entries
 * - packs: Map of pack names to their lock entries (optional)
 *
 * @experimental This API is unstable and may change without notice.
 */
const LockfileBaseSchema = Schema.Struct({
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

export const LockfileSchema = LockfileBaseSchema.annotate({
  identifier: "Lockfile",
  title: "AXM Lockfile",
  description:
    "Accepted immutable external source resolutions and provenance. Desired state and projection ownership are authoritative elsewhere.",
});

/**
 * Inferred type for Lockfile schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type Lockfile = Schema.Schema.Type<typeof LockfileSchema>;

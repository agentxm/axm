/**
 * Lockfile schema definition.
 *
 * The lockfile (axm-lock.yaml) records accepted immutable resolutions for
 * externally sourced extensions.
 *
 * Lockfile v6 is authority, not receipt history. It contains no authored,
 * bundled, inline, projection, completion-time, or command-history state.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";
import { HandleSchema } from "@agentxm/extension-model/unstable/extensions";
import { SourceHashSchema } from "@agentxm/extension-model/unstable/sources/source-hash";
import { TreeIntegritySchema } from "../workspace/materialized-tree.js";
import { ExtensionNameSchema } from "@agentxm/extension-model/unstable/extensions/common";
import type { CatalogExtensionType } from "@agentxm/extension-model/unstable/extension-types/schema";
import { VersionSchema } from "@agentxm/extension-model/unstable/version-constraints";
import {
  SourceNamespaceSchema,
  SourceRefSchema,
  SourceSegmentSchema,
  SourceSubPathSchema,
} from "@agentxm/extension-model/unstable/sources/types";

export const LOCKFILE_VERSION = 6;

// =============================================================================
// Flat Source Schemas (discriminated by type field)
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

// =============================================================================
// Source Lock Entry Factory
// =============================================================================

/**
 * Creates the external-source lock-entry union.
 *
 * Used to produce lock-entry schemas with feature-specific shared fields.
 */
const makeSourceLockUnion = <
  TExtensionType extends CatalogExtensionType,
  TPackageOwner extends Schema.Top,
  TPackageFormat extends Schema.Top,
  F extends Schema.Struct.Fields,
>(
  extensionType: TExtensionType,
  packageOwner: TPackageOwner,
  packageFormat: TPackageFormat,
  extraFields: F,
) =>
  Schema.Union([
    Schema.Struct({
      type: Schema.Literal("github"),
      sourceType: Schema.Literal("github"),
      sourceName: Schema.String,
      endpoint: Schema.URLFromString,
      extensionType: Schema.Literal(extensionType),
      workspaceName: ExtensionNameSchema,
      packageFormat,
      packageOwner,
      packageName: ExtensionNameSchema,
      owner: SourceNamespaceSchema,
      repo: SourceSegmentSchema,
      ref: Schema.optional(SourceRefSchema),
      path: Schema.optional(SourceSubPathSchema),
      resolvedCommit: Schema.NonEmptyString,
      resolvedTree: Schema.NonEmptyString,
      contentIdentity: SourceHashSchema,
      treeIntegrity: TreeIntegritySchema,
      ...extraFields,
    }),
    Schema.Struct({
      type: Schema.Literal("gitlab"),
      sourceType: Schema.Literal("gitlab"),
      sourceName: Schema.String,
      endpoint: Schema.URLFromString,
      extensionType: Schema.Literal(extensionType),
      workspaceName: ExtensionNameSchema,
      packageFormat,
      packageOwner,
      packageName: ExtensionNameSchema,
      owner: SourceNamespaceSchema,
      repo: SourceSegmentSchema,
      ref: Schema.optional(SourceRefSchema),
      path: Schema.optional(SourceSubPathSchema),
      resolvedCommit: Schema.NonEmptyString,
      resolvedTree: Schema.NonEmptyString,
      contentIdentity: SourceHashSchema,
      treeIntegrity: TreeIntegritySchema,
      ...extraFields,
    }),
    Schema.Struct({
      type: Schema.Literal("bitbucket"),
      sourceType: Schema.Literal("bitbucket"),
      sourceName: Schema.String,
      endpoint: Schema.URLFromString,
      extensionType: Schema.Literal(extensionType),
      workspaceName: ExtensionNameSchema,
      packageFormat,
      packageOwner,
      packageName: ExtensionNameSchema,
      owner: SourceNamespaceSchema,
      repo: SourceSegmentSchema,
      ref: Schema.optional(SourceRefSchema),
      path: Schema.optional(SourceSubPathSchema),
      resolvedCommit: Schema.NonEmptyString,
      resolvedTree: Schema.NonEmptyString,
      contentIdentity: SourceHashSchema,
      treeIntegrity: TreeIntegritySchema,
      ...extraFields,
    }),
    Schema.Struct({
      type: Schema.Literal("azurerepos"),
      sourceType: Schema.Literal("azurerepos"),
      sourceName: Schema.String,
      endpoint: Schema.URLFromString,
      extensionType: Schema.Literal(extensionType),
      workspaceName: ExtensionNameSchema,
      packageFormat,
      packageOwner,
      packageName: ExtensionNameSchema,
      organization: SourceSegmentSchema,
      project: SourceSegmentSchema,
      repo: SourceSegmentSchema,
      ref: Schema.optional(SourceRefSchema),
      path: Schema.optional(SourceSubPathSchema),
      resolvedCommit: Schema.NonEmptyString,
      resolvedTree: Schema.NonEmptyString,
      contentIdentity: SourceHashSchema,
      treeIntegrity: TreeIntegritySchema,
      ...extraFields,
    }),
    Schema.Struct({
      type: Schema.Literal("git"),
      sourceType: Schema.Literal("git"),
      sourceName: Schema.Literal("git"),
      extensionType: Schema.Literal(extensionType),
      workspaceName: ExtensionNameSchema,
      packageFormat,
      packageOwner,
      packageName: ExtensionNameSchema,
      url: Schema.String,
      ref: Schema.optional(SourceRefSchema),
      path: Schema.optional(SourceSubPathSchema),
      resolvedCommit: Schema.NonEmptyString,
      resolvedTree: Schema.NonEmptyString,
      contentIdentity: SourceHashSchema,
      treeIntegrity: TreeIntegritySchema,
      ...extraFields,
    }),
    Schema.Struct({
      type: Schema.Literal("local"),
      sourceType: Schema.Literal("local"),
      sourceName: Schema.Literal("local"),
      extensionType: Schema.Literal(extensionType),
      workspaceName: ExtensionNameSchema,
      packageFormat,
      packageOwner,
      packageName: ExtensionNameSchema,
      path: LocalSourceLockPathSchema,
      contentIdentity: SourceHashSchema,
      treeIntegrity: TreeIntegritySchema,
      ...extraFields,
    }),
    Schema.Struct({
      type: Schema.Literal("registry"),
      sourceType: Schema.Literal("registry"),
      endpoint: Schema.URLFromString,
      extensionType: Schema.Literal(extensionType),
      workspaceName: ExtensionNameSchema,
      packageFormat: Schema.Literal("agentxm"),
      owner: HandleSchema,
      name: ExtensionNameSchema,
      resolvedVersion: VersionSchema,
      integrity: Schema.String.annotate({
        description:
          "SRI sha512 of the published archive, verified against downloaded bytes before " +
          "extraction. The supply-chain guarantee for registry installs; never compared " +
          "against installed files on disk.",
      }),
      sourceName: Schema.String,
      publisherBindingId: Schema.NonEmptyString,
      treeIntegrity: TreeIntegritySchema,
      ...extraFields,
    }),
  ]);

// =============================================================================
// Skill Lock Entry (union of all source types)
// =============================================================================

/**
 * Lock entry for a single installed skill.
 * Discriminated union by the `type` field.
 *
 * Every external source carries immutable accepted-resolution identity:
 * registry version/integrity/publisher binding, Git commit/tree/content identity,
 * or local-path content identity.
 *
 * Source-specific fields are at the top level based on source type.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const SkillLockEntrySchema = makeSourceLockUnion(
  "skill",
  Schema.optional(HandleSchema),
  Schema.Literals(["agentxm", "agent-skill"]),
  {},
);

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
 * Discriminated union by the `type` field.
 *
 * External source entries carry immutable accepted-resolution identity.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const SubagentLockEntrySchema = makeSourceLockUnion(
  "subagent",
  HandleSchema,
  Schema.Literal("agentxm"),
  {},
);

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
 * Discriminated union by the `type` field.
 *
 * Same structure as SkillLockEntry but without the `agents` field.
 *
 * External source entries carry immutable accepted-resolution identity. Inline
 * servers are authored settings and therefore have no lock row.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const McpServerLockEntrySchema = makeSourceLockUnion(
  "mcp-server",
  HandleSchema,
  Schema.Literal("agentxm"),
  {},
);

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
 * Map of MCP server names to their lock entries.
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
export const RuleLockEntrySchema = makeSourceLockUnion(
  "rule",
  HandleSchema,
  Schema.Literal("agentxm"),
  {},
);

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
export const HookLockEntrySchema = makeSourceLockUnion(
  "hook",
  HandleSchema,
  Schema.Literal("agentxm"),
  {},
);

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
export const KnowledgeLockEntrySchema = makeSourceLockUnion(
  "knowledge",
  HandleSchema,
  Schema.Literal("agentxm"),
  {},
);

export type KnowledgeLockEntry = Schema.Schema.Type<typeof KnowledgeLockEntrySchema>;
export const KnowledgeLockMapSchema = Schema.Record(Schema.String, KnowledgeLockEntrySchema);
export type KnowledgeLockMap = Schema.Schema.Type<typeof KnowledgeLockMapSchema>;

// =============================================================================
// Pack Lock Entry
// =============================================================================

/**
 * Registry pack lock entry - pack from a registry.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const RegistryPackLockEntrySchema = Schema.Struct({
  type: Schema.Literal("registry"),
  sourceType: Schema.Literal("registry"),
  endpoint: Schema.URLFromString,
  extensionType: Schema.Literal("pack"),
  workspaceName: ExtensionNameSchema,
  packageFormat: Schema.Literal("agentxm"),
  owner: HandleSchema,
  name: ExtensionNameSchema,
  resolvedVersion: VersionSchema,
  integrity: Schema.String,
  manifestContentIdentity: SourceHashSchema,
  sourceName: Schema.String,
  publisherBindingId: Schema.NonEmptyString,
  treeIntegrity: TreeIntegritySchema,
}).annotate({
  identifier: "RegistryPackLockEntry",
  title: "Registry Pack Lock Entry",
  description: "Pinned version info for a pack installed from a registry.",
});

/**
 * Inferred type for RegistryPackLockEntry schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type RegistryPackLockEntry = Schema.Schema.Type<typeof RegistryPackLockEntrySchema>;

/**
 * Constructor args for a registry pack lock entry.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type RegistryPackLockEntryArgs = Omit<RegistryPackLockEntry, "type">;

/**
 * Build a registry pack lock entry from typed args.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const makeRegistryPackLockEntry = (
  args: RegistryPackLockEntryArgs,
): RegistryPackLockEntry => ({
  type: "registry",
  ...args,
});

/**
 * Lock entry for a single installed pack.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const PackLockEntrySchema = RegistryPackLockEntrySchema.annotate({
  identifier: "PackLockEntry",
  title: "Pack Lock Entry",
  description: "Accepted immutable resolution for a Registry Pack.",
});

/**
 * Inferred type for PackLockEntry schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type PackLockEntry = Schema.Schema.Type<typeof PackLockEntrySchema>;

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
 * Every catalog extension type's lock-entry schema, keyed by type.
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
} as const satisfies Record<CatalogExtensionType, Schema.Top>;

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
 * - lockfileVersion: Schema version (currently 6)
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

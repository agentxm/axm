/**
 * Lockfile schema definition.
 *
 * The lockfile (axm-lock.yaml) records the exact resolved state of all installed
 * skills, enabling reproducible installations across environments.
 *
 * Lockfile v3 format boundary:
 * - Shared package resolution and pins belong in the committed lockfile.
 * - Agent-specific and render-derived state (`agents`, `syncedAgents`, rendered
 *   files and inputs, degraded renders, and materialized targets) is derived
 *   from settings, manifests, markers, and the workspace filesystem. It is not
 *   persisted in the shared lockfile.
 * - New observed or render state belongs in marker/scan-based ownership (see
 *   `workspace/rendered-file-cleanup.ts`) or feature-local storage, not here.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";
import { DateTimeUtcSchema } from "../date-time.js";
import {
  ExtensionFqnSchema,
  type ExtensionType,
  HandleSchema,
  SourceHashSchema,
} from "../extensions/index.js";
import { ExtensionNameSchema } from "../extensions/common.js";
import type { CatalogExtensionType } from "../extension-types/schema.js";
import { RelativePathSchema } from "../utils/path-types.js";
import { VersionSchema } from "../version-constraints/version-constraints.js";
import {
  SourceNamespaceSchema,
  SourceRefSchema,
  SourceSegmentSchema,
  SourceSubPathSchema,
} from "../sources/types.js";

export const LOCKFILE_VERSION = 3;

// =============================================================================
// Flat Source Schemas (discriminated by type field)
// =============================================================================

/**
 * Common fields shared by all lock entries (without agents).
 */
const BaseCommonFields = {
  installedAt: DateTimeUtcSchema,
  updatedAt: DateTimeUtcSchema,
  gitTreeHash: Schema.optional(Schema.String),
  retainedByPack: Schema.optional(Schema.Boolean),
};

const looksAbsolutePath = (value: string): boolean =>
  value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value) || value.startsWith("\\\\");

const LocalSourceLockPathSchema = Schema.String.pipe(
  Schema.check(
    Schema.makeFilter((value: string) =>
      looksAbsolutePath(value) ? "Expected a relative local source path" : undefined,
    ),
  ),
);

/**
 * Common fields for skill lock entries.
 */
const SkillCommonFields = {
  ...BaseCommonFields,
  sourceHash: Schema.optional(SourceHashSchema),
};

// =============================================================================
// Source Lock Entry Factory
// =============================================================================

/**
 * Creates a Schema.Union of all 8 source-type lock entry structs,
 * parameterized by extra fields to spread into each variant.
 *
 * Used to produce lock-entry schemas with feature-specific shared fields.
 */
const makeSourceLockUnion = <
  F extends Schema.Struct.Fields,
  T extends ExtensionType,
  W extends Schema.Struct.Fields,
>(
  extraFields: F,
  extensionType: T,
  workspaceExtraFields: W,
) =>
  Schema.Union([
    Schema.Struct({
      type: Schema.Literal("github"),
      owner: SourceNamespaceSchema,
      repo: SourceSegmentSchema,
      ref: Schema.optional(SourceRefSchema),
      path: Schema.optional(SourceSubPathSchema),
      ...extraFields,
    }),
    Schema.Struct({
      type: Schema.Literal("gitlab"),
      owner: SourceNamespaceSchema,
      repo: SourceSegmentSchema,
      ref: Schema.optional(SourceRefSchema),
      path: Schema.optional(SourceSubPathSchema),
      ...extraFields,
    }),
    Schema.Struct({
      type: Schema.Literal("bitbucket"),
      owner: SourceNamespaceSchema,
      repo: SourceSegmentSchema,
      ref: Schema.optional(SourceRefSchema),
      path: Schema.optional(SourceSubPathSchema),
      ...extraFields,
    }),
    Schema.Struct({
      type: Schema.Literal("azurerepos"),
      organization: SourceSegmentSchema,
      project: SourceSegmentSchema,
      repo: SourceSegmentSchema,
      ref: Schema.optional(SourceRefSchema),
      path: Schema.optional(SourceSubPathSchema),
      ...extraFields,
    }),
    Schema.Struct({
      type: Schema.Literal("git"),
      url: Schema.String,
      ref: Schema.optional(SourceRefSchema),
      path: Schema.optional(SourceSubPathSchema),
      ...extraFields,
    }),
    Schema.Struct({
      type: Schema.Literal("local"),
      path: LocalSourceLockPathSchema,
      ...extraFields,
    }),
    Schema.Struct({
      type: Schema.Literal("registry"),
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
      ...extraFields,
    }),
    Schema.Struct({
      type: Schema.Literal("workspace"),
      owner: HandleSchema,
      extensionType: Schema.Literal(extensionType),
      name: ExtensionNameSchema,
      version: VersionSchema,
      ...workspaceExtraFields,
      sourceHash: SourceHashSchema,
    }),
  ]);

const InlineMcpServerLockEntrySchema = Schema.Struct({
  type: Schema.Literal("inline"),
  command: Schema.optional(Schema.NonEmptyString),
  args: Schema.optional(Schema.Array(Schema.String)),
  url: Schema.optional(Schema.NonEmptyString),
  headers: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  ...BaseCommonFields,
}).annotate({
  identifier: "InlineMcpServerLockEntry",
  title: "Inline MCP Server Lock Entry",
  description: "Lockfile entry for an inline MCP server configured directly in settings.json.",
});

// =============================================================================
// Skill Lock Entry (union of all source types)
// =============================================================================

/**
 * Lock entry for a single installed skill.
 * Discriminated union by the `type` field.
 *
 * Fields common to all entries:
 * - type: Source type ("github", "gitlab", "bitbucket", "azurerepos", "git", "local", "registry")
 * - installedAt: ISO 8601 timestamp of initial installation (DateTime.Utc in TS)
 * - updatedAt: ISO 8601 timestamp of last update (DateTime.Utc in TS)
 * - gitTreeHash: Git tree SHA of source folder (git sources, optional)
 * - sourceHash: advisory SHA-256 change marker of the canonical skill source
 *   captured at install time (canonical recursive package content; optional).
 *   Used for created/updated/unchanged reporting, never as a tamper check —
 *   installed content is workspace-owned and may be rewritten by
 *   content-preserving tools after install
 *
 * Source-specific fields are at the top level based on source type.
 *
 * @experimental This API is unstable and may change without notice.
 */
const SkillWorkspaceFields = {
  ...BaseCommonFields,
};

export const SkillLockEntrySchema = makeSourceLockUnion(
  SkillCommonFields,
  "skill",
  SkillWorkspaceFields,
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
const SubagentLockEntryCommonFields = {
  ...BaseCommonFields,
  sourceHash: Schema.optional(Schema.String),
};

const SubagentWorkspaceFields = {
  ...BaseCommonFields,
};

/**
 * Lock entry for a single installed subagent.
 * Discriminated union by the `type` field.
 *
 * Includes an advisory `sourceHash` change marker for the shared source content.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const SubagentLockEntrySchema = makeSourceLockUnion(
  SubagentLockEntryCommonFields,
  "subagent",
  SubagentWorkspaceFields,
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
 * Includes an advisory `sourceHash` change marker for the installed package
 * content — used for created/updated/unchanged reporting, never as a tamper
 * check. Inline servers carry no source content and so have no `sourceHash`.
 *
 * @experimental This API is unstable and may change without notice.
 */
const McpServerCommonFields = {
  ...BaseCommonFields,
  sourceHash: Schema.optional(SourceHashSchema),
};

export const McpServerLockEntrySchema = Schema.Union([
  makeSourceLockUnion(McpServerCommonFields, "mcp-server", BaseCommonFields),
  InlineMcpServerLockEntrySchema,
]);

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
export const MaterializedFileTargetSchema = Schema.Struct({
  target: RelativePathSchema,
  mode: Schema.Literals(["sync-once", "sync-always", "managed-region"]),
  region: Schema.optional(Schema.NonEmptyString),
  renderHash: Schema.optional(SourceHashSchema),
}).annotate({
  identifier: "MaterializedFileTarget",
  title: "Materialized File Target",
  description: "A materialized rule or hook target, plus optional region and render hash.",
});

/** @experimental */
export type MaterializedFileTarget = Schema.Schema.Type<typeof MaterializedFileTargetSchema>;

// =============================================================================
// Rule Lock Entry (union of all source types, no agents)
// =============================================================================

const RuleCommonFields = {
  ...BaseCommonFields,
  sourceHash: Schema.optional(SourceHashSchema),
};

/**
 * Lock entry for a single installed rule.
 *
 * Includes an advisory `sourceHash` change marker for the installed package
 * content — used for created/updated/unchanged reporting, never as a tamper
 * check.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const RuleLockEntrySchema = makeSourceLockUnion(RuleCommonFields, "rule", BaseCommonFields);

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

const HookCommonFields = {
  ...BaseCommonFields,
  sourceHash: Schema.optional(SourceHashSchema),
};

/**
 * Lock entry for a single installed hook.
 *
 * Includes an advisory `sourceHash` change marker for the installed package
 * content — used for created/updated/unchanged reporting, never as a tamper
 * check.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const HookLockEntrySchema = makeSourceLockUnion(HookCommonFields, "hook", BaseCommonFields);

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

const KnowledgeCommonFields = {
  ...BaseCommonFields,
  sourceHash: Schema.optional(SourceHashSchema),
};

/**
 * Lock entry for a single installed knowledge bundle.
 *
 * Includes an advisory `sourceHash` change marker for the installed bundle
 * content — used for created/updated/unchanged reporting, never as a tamper
 * check.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const KnowledgeLockEntrySchema = makeSourceLockUnion(
  KnowledgeCommonFields,
  "knowledge",
  BaseCommonFields,
);

export type KnowledgeLockEntry = Schema.Schema.Type<typeof KnowledgeLockEntrySchema>;
export const KnowledgeLockMapSchema = Schema.Record(Schema.String, KnowledgeLockEntrySchema);
export type KnowledgeLockMap = Schema.Schema.Type<typeof KnowledgeLockMapSchema>;

// =============================================================================
// Pack Lock Entry
// =============================================================================

/**
 * Resolved extension map: FQN keys to exact version strings.
 * Used for resolved pack members.
 */
const LegacyResolvedRegistryExtensionSchema = Schema.Struct({
  version: VersionSchema,
  publisherBindingId: Schema.NonEmptyString,
});

const ResolvedRegistryExtensionSchema = Schema.Struct({
  source: Schema.Literal("registry"),
  version: VersionSchema,
  publisherBindingId: Schema.NonEmptyString,
  integrity: Schema.String,
});

const ResolvedWorkspaceExtensionSchema = Schema.Struct({
  source: Schema.Literal("workspace"),
  version: VersionSchema,
  sourceIdentity: Schema.String,
  contentIdentity: SourceHashSchema,
});

export const ResolvedExtensionSchema = Schema.Union([
  ResolvedRegistryExtensionSchema,
  ResolvedWorkspaceExtensionSchema,
  LegacyResolvedRegistryExtensionSchema,
]).annotate({
  identifier: "ResolvedExtension",
  title: "Resolved Extension",
  description:
    "Last successful pack-member resolution from a workspace or Registry authority. Legacy Registry receipts remain readable.",
});

export type ResolvedExtension = Schema.Schema.Type<typeof ResolvedExtensionSchema>;

export const ResolvedExtensionMapSchema = Schema.Record(
  ExtensionFqnSchema,
  ResolvedExtensionSchema,
);

/**
 * Inferred type for resolved extension maps.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type ResolvedExtensionMap = Schema.Schema.Type<typeof ResolvedExtensionMapSchema>;

/**
 * Registry pack lock entry - pack from a registry.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const RegistryPackLockEntrySchema = Schema.Struct({
  type: Schema.Literal("registry"),
  owner: HandleSchema,
  name: ExtensionNameSchema,
  resolvedVersion: VersionSchema,
  integrity: Schema.String,
  sourceName: Schema.String,
  publisherBindingId: Schema.NonEmptyString,
  sourceHash: Schema.optional(SourceHashSchema),
  installedAt: DateTimeUtcSchema,
  updatedAt: DateTimeUtcSchema,
  resolvedSkills: ResolvedExtensionMapSchema,
  resolvedMcpServers: ResolvedExtensionMapSchema,
  resolvedSubagents: ResolvedExtensionMapSchema,
  resolvedRules: Schema.optional(ResolvedExtensionMapSchema),
  resolvedHooks: Schema.optional(ResolvedExtensionMapSchema),
  resolvedKnowledge: Schema.optional(ResolvedExtensionMapSchema),
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

/** Workspace pack lock entry reconstructed from the canonical authored package. */
export const WorkspacePackLockEntrySchema = Schema.Struct({
  type: Schema.Literal("workspace"),
  owner: HandleSchema,
  extensionType: Schema.Literal("pack"),
  name: ExtensionNameSchema,
  version: VersionSchema,
  sourceHash: SourceHashSchema,
  installedAt: DateTimeUtcSchema,
  updatedAt: DateTimeUtcSchema,
  resolvedSkills: ResolvedExtensionMapSchema,
  resolvedMcpServers: ResolvedExtensionMapSchema,
  resolvedSubagents: ResolvedExtensionMapSchema,
  resolvedRules: Schema.optional(ResolvedExtensionMapSchema),
  resolvedHooks: Schema.optional(ResolvedExtensionMapSchema),
  resolvedKnowledge: Schema.optional(ResolvedExtensionMapSchema),
}).annotate({
  identifier: "WorkspacePackLockEntry",
  title: "Workspace Pack Lock Entry",
  description: "Manifest version, content hash, and resolved members for an authored pack.",
});

/** @experimental */
export type WorkspacePackLockEntry = Schema.Schema.Type<typeof WorkspacePackLockEntrySchema>;

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
export const PackLockEntrySchema = Schema.Union([
  RegistryPackLockEntrySchema,
  WorkspacePackLockEntrySchema,
]).annotate({
  identifier: "PackLockEntry",
  title: "Pack Lock Entry",
  description: "Pinned or workspace-derived version info for an installed pack.",
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
 * - lockfileVersion: Schema version (currently 3)
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

// Unknown top-level keys are carried by the rest record so a lockfile written
// by a newer AXM survives a read-modify-write cycle here. Nested strictness is
// unchanged: unknown keys inside lock entries still fail decode. The removed
// legacy `libraries` key is rejected by explicit pre-decode guards on the
// lockfile read paths, not by this schema.
export const LockfileSchema = Schema.StructWithRest(LockfileBaseSchema, [
  Schema.Record(Schema.String, Schema.Unknown),
]).annotate({
  identifier: "Lockfile",
  title: "AXM Lockfile",
  description:
    "Optional receipt history for successful extension resolution and materialization. Desired, observed, and trust state remain authoritative elsewhere.",
});

/**
 * Inferred type for Lockfile schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type Lockfile = Schema.Schema.Type<typeof LockfileSchema>;

const LOCKFILE_KNOWN_KEYS: ReadonlySet<string> = new Set(Object.keys(LockfileBaseSchema.fields));

/**
 * The unknown top-level entries carried on a decoded lockfile.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const lockfileRestEntries = (lockfile: Lockfile): Record<string, unknown> =>
  Object.fromEntries(Object.entries(lockfile).filter(([key]) => !LOCKFILE_KNOWN_KEYS.has(key)));

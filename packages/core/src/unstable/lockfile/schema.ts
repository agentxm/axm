/**
 * Lockfile schema definition.
 *
 * The lockfile (axm-lock.yaml) records the exact resolved state of all installed
 * skills, enabling reproducible installations across environments.
 *
 * Lockfile v2 format boundary:
 * - Shared package resolution and pins belong in the committed lockfile.
 * - Agent-specific and render-derived fields (`agents`, `renderedFiles`,
 *   `renderInputs`, `degradedRenders`, and render state in
 *   `materializedTargets`) are frozen compatibility debt pending the v3 split;
 *   do not add new fields of these kinds to v2.
 * - New observed or render state belongs in marker/scan-based ownership (see
 *   `workspace/rendered-file-cleanup.ts`) or feature-local storage, not here.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";
import { DateFromIsoDateTimeStringSchema } from "../date-time.js";
import {
  ExtensionFqnSchema,
  type ExtensionType,
  HandleSchema,
  RenderedFilesMapSchema,
  SourceHashSchema,
} from "../extensions/index.js";
import { ExtensionNameSchema } from "../extensions/common.js";
import { FileInputValueSchema, FileMaterializationModeSchema } from "../files/manifest-schema.js";
import { RelativePathSchema } from "../utils/path-types.js";
import { VersionSchema } from "../version-constraints/version-constraints.js";
import {
  SourceNamespaceSchema,
  SourceRefSchema,
  SourceSegmentSchema,
  SourceSubPathSchema,
} from "../sources/types.js";

export const LOCKFILE_VERSION = 2;

// =============================================================================
// Flat Source Schemas (discriminated by type field)
// =============================================================================

/**
 * Common fields shared by all lock entries (without agents).
 */
const BaseCommonFields = {
  installedAt: DateFromIsoDateTimeStringSchema,
  updatedAt: DateFromIsoDateTimeStringSchema,
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
 * Common fields shared by skill lock entries (includes agents).
 */
const CommonFields = {
  agents: Schema.Array(Schema.String),
  ...BaseCommonFields,
};

/** Inputs that deterministically pin one capability-targeted render. */
export const CapabilityRenderInputSchema = Schema.Struct({
  sourceHash: SourceHashSchema,
  agent: Schema.NonEmptyString,
  catalogVersion: Schema.NonEmptyString,
  dslVersion: Schema.NonEmptyString,
  capabilityHash: SourceHashSchema,
  referencedCapabilities: Schema.Array(Schema.NonEmptyString),
}).annotate({
  identifier: "CapabilityRenderInput",
  title: "Capability Render Input",
  description:
    "Pinned source, target, catalog, DSL, and referenced-capability inputs for a rendered artifact.",
});

export type CapabilityRenderInput = Schema.Schema.Type<typeof CapabilityRenderInputSchema>;

export const CapabilityRenderInputsMapSchema = Schema.Record(
  Schema.String,
  CapabilityRenderInputSchema,
);

export const DegradedRendersMapSchema = Schema.Record(
  Schema.String,
  Schema.Array(Schema.NonEmptyString),
);

/**
 * Common fields for skill lock entries (includes agents + rendered files).
 */
const SkillCommonFields = {
  ...CommonFields,
  sourceHash: Schema.optional(SourceHashSchema),
  renderedFiles: Schema.optional(RenderedFilesMapSchema),
  renderInputs: Schema.optional(CapabilityRenderInputsMapSchema),
  degradedRenders: Schema.optional(DegradedRendersMapSchema),
};

// =============================================================================
// Source Lock Entry Factory
// =============================================================================

/**
 * Creates a Schema.Union of all 8 source-type lock entry structs,
 * parameterized by extra fields to spread into each variant.
 *
 * Used to produce SkillLockEntrySchema (with `agents`),
 * CommandLockEntrySchema (with `agents` + extra fields) and
 * McpServerLockEntrySchema (without `agents`).
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
      integrity: Schema.String,
      sourceName: Schema.String,
      publisherBindingId: Schema.optional(Schema.NonEmptyString),
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
  syncedAgents: Schema.optional(Schema.Array(Schema.String)),
  ...BaseCommonFields,
}).annotate({
  identifier: "InlineMcpServerLockEntry",
  title: "Inline MCP Server Lock Entry",
  description: "Lockfile entry for an inline MCP server configured directly in settings.json.",
});

// =============================================================================
// Skill Lock Entry (union of all source types, with agents)
// =============================================================================

/**
 * Lock entry for a single installed skill.
 * Discriminated union by the `type` field.
 *
 * Fields common to all entries:
 * - type: Source type ("github", "gitlab", "bitbucket", "azurerepos", "git", "local", "registry")
 * - agents: Agent IDs this skill is installed for (can be empty)
 * - installedAt: ISO 8601 timestamp of initial installation (Date in TS)
 * - updatedAt: ISO 8601 timestamp of last update (Date in TS)
 * - gitTreeHash: Git tree SHA of source folder (git sources, optional)
 * - sourceHash: SHA-256 hash of canonical skill source (copy-mode only, optional)
 * - renderedFiles: Map of agent ID to rendered file paths (copy-mode only, optional)
 *
 * Source-specific fields are at the top level based on source type.
 *
 * @experimental This API is unstable and may change without notice.
 */
const SkillWorkspaceFields = {
  ...CommonFields,
  renderedFiles: Schema.optional(RenderedFilesMapSchema),
  renderInputs: Schema.optional(CapabilityRenderInputsMapSchema),
  degradedRenders: Schema.optional(DegradedRendersMapSchema),
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
// Command Lock Entry (union of all source types, with agents)
// =============================================================================

/**
 * Common fields for command lock entries (includes agents + rendered files).
 */
const CommandCommonFields = {
  ...CommonFields,
  sourceHash: Schema.optional(Schema.String),
  renderedFiles: Schema.optional(RenderedFilesMapSchema),
};

/**
 * Lock entry for a single installed command.
 * Discriminated union by the `type` field.
 *
 * Includes `agents` array (like skills), plus `sourceHash` and `renderedFiles`
 * for tracking rendered output.
 *
 * @experimental This API is unstable and may change without notice.
 */
const CommandWorkspaceFields = {
  ...CommonFields,
  renderedFiles: Schema.optional(RenderedFilesMapSchema),
};

export const CommandLockEntrySchema = makeSourceLockUnion(
  CommandCommonFields,
  "command",
  CommandWorkspaceFields,
);

/**
 * Inferred type for CommandLockEntry schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type CommandLockEntry = Schema.Schema.Type<typeof CommandLockEntrySchema>;

// =============================================================================
// Commands Lock Map
// =============================================================================

/**
 * Map of command names to their lock entries.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const CommandsLockMapSchema = Schema.Record(Schema.String, CommandLockEntrySchema);

/**
 * Inferred type for CommandsLockMap schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type CommandsLockMap = Schema.Schema.Type<typeof CommandsLockMapSchema>;

// =============================================================================
// Subagent Lock Entry (union of all source types, with agents)
// =============================================================================

/**
 * Common fields for subagent lock entries (includes agents + rendered files).
 */
const SubagentLockEntryCommonFields = {
  ...CommonFields,
  sourceHash: Schema.optional(Schema.String),
  renderedFiles: Schema.optional(RenderedFilesMapSchema),
};

const SubagentWorkspaceFields = {
  ...CommonFields,
  renderedFiles: Schema.optional(RenderedFilesMapSchema),
};

/**
 * Lock entry for a single installed subagent.
 * Discriminated union by the `type` field.
 *
 * Includes `agents` array (like skills), plus `sourceHash` and `renderedFiles`
 * for tracking rendered output.
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
 * @experimental This API is unstable and may change without notice.
 */
export const McpServerLockEntrySchema = Schema.Union([
  makeSourceLockUnion(
    {
      syncedAgents: Schema.optional(Schema.Array(Schema.String)),
      ...BaseCommonFields,
    },
    "mcp-server",
    {
      syncedAgents: Schema.optional(Schema.Array(Schema.String)),
      ...BaseCommonFields,
    },
  ),
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

// =============================================================================
// Files Lock Entry (union of all source types, no agents)
// =============================================================================

/**
 * Resolved scalar input values captured for a Context Files package install.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const FilesResolvedInputsMapSchema = Schema.Record(
  Schema.String,
  FileInputValueSchema,
).annotate({
  identifier: "FilesResolvedInputsMap",
  title: "Files Resolved Inputs Map",
  description: "Scalar input values resolved for a Context Files package lock entry.",
});

/** @experimental */
export type FilesResolvedInputsMap = Schema.Schema.Type<typeof FilesResolvedInputsMapSchema>;

/**
 * Materialized file target recorded for sync and uninstall decisions.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const MaterializedFileTargetSchema = Schema.Struct({
  target: RelativePathSchema,
  mode: FileMaterializationModeSchema,
  region: Schema.optional(Schema.NonEmptyString),
  renderHash: Schema.optional(SourceHashSchema),
}).annotate({
  identifier: "MaterializedFileTarget",
  title: "Materialized File Target",
  description:
    "A workspace target written by a Context Files package, plus optional region and render hash.",
});

/** @experimental */
export type MaterializedFileTarget = Schema.Schema.Type<typeof MaterializedFileTargetSchema>;

const FilesCommonFields = {
  ...BaseCommonFields,
  resolvedInputs: Schema.optional(FilesResolvedInputsMapSchema),
  materializedTargets: Schema.optional(Schema.Array(MaterializedFileTargetSchema)),
};

/**
 * Lock entry for a single installed Context Files package.
 * Discriminated union by the `type` field.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const FilesLockEntrySchema = makeSourceLockUnion(
  FilesCommonFields,
  "files",
  FilesCommonFields,
);

/** @experimental */
export type FilesLockEntry = Schema.Schema.Type<typeof FilesLockEntrySchema>;

/**
 * Map of Context Files package names to their lock entries.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const FilesLockMapSchema = Schema.Record(Schema.String, FilesLockEntrySchema);

/** @experimental */
export type FilesLockMap = Schema.Schema.Type<typeof FilesLockMapSchema>;

// =============================================================================
// Rule Lock Entry (union of all source types, no agents)
// =============================================================================

const RuleCommonFields = {
  ...BaseCommonFields,
  materializedTargets: Schema.optional(Schema.Array(MaterializedFileTargetSchema)),
};

/**
 * Lock entry for a single installed rule.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const RuleLockEntrySchema = makeSourceLockUnion(RuleCommonFields, "rule", RuleCommonFields);

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
  materializedTargets: Schema.optional(Schema.Array(MaterializedFileTargetSchema)),
};

/**
 * Lock entry for a single installed hook.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const HookLockEntrySchema = makeSourceLockUnion(HookCommonFields, "hook", HookCommonFields);

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
  materializedTargets: Schema.optional(Schema.Array(MaterializedFileTargetSchema)),
};

export const KnowledgeLockEntrySchema = makeSourceLockUnion(
  KnowledgeCommonFields,
  "knowledge",
  KnowledgeCommonFields,
);

export type KnowledgeLockEntry = Schema.Schema.Type<typeof KnowledgeLockEntrySchema>;
export const KnowledgeLockMapSchema = Schema.Record(Schema.String, KnowledgeLockEntrySchema);
export type KnowledgeLockMap = Schema.Schema.Type<typeof KnowledgeLockMapSchema>;

// =============================================================================
// Pack Lock Entry
// =============================================================================

/**
 * Resolved extension map: FQN keys to exact version strings.
 * Used for resolvedSkills, resolvedCommands, and resolvedMcpServers.
 */
export const ResolvedExtensionMapSchema = Schema.Record(ExtensionFqnSchema, VersionSchema);

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
  publisherBindingId: Schema.optional(Schema.NonEmptyString),
  installedAt: DateFromIsoDateTimeStringSchema,
  updatedAt: DateFromIsoDateTimeStringSchema,
  resolvedSkills: ResolvedExtensionMapSchema,
  resolvedCommands: ResolvedExtensionMapSchema,
  resolvedMcpServers: ResolvedExtensionMapSchema,
  resolvedSubagents: ResolvedExtensionMapSchema,
  resolvedFiles: Schema.optional(ResolvedExtensionMapSchema),
  resolvedRules: Schema.optional(ResolvedExtensionMapSchema),
  resolvedHooks: Schema.optional(ResolvedExtensionMapSchema),
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
  installedAt: DateFromIsoDateTimeStringSchema,
  updatedAt: DateFromIsoDateTimeStringSchema,
  resolvedSkills: ResolvedExtensionMapSchema,
  resolvedCommands: ResolvedExtensionMapSchema,
  resolvedMcpServers: ResolvedExtensionMapSchema,
  resolvedSubagents: ResolvedExtensionMapSchema,
  resolvedFiles: Schema.optional(ResolvedExtensionMapSchema),
  resolvedRules: Schema.optional(ResolvedExtensionMapSchema),
  resolvedHooks: Schema.optional(ResolvedExtensionMapSchema),
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
// Library Lock Entry
// =============================================================================

/**
 * Registry Library lock entry.
 *
 * Libraries are live registry collections, not versioned artifacts. The lock
 * entry pins the resolved membership snapshot and exact member versions.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const RegistryLibraryLockEntrySchema = Schema.Struct({
  type: Schema.Literal("registry"),
  owner: HandleSchema,
  name: ExtensionNameSchema,
  sourceName: Schema.String,
  installedAt: DateFromIsoDateTimeStringSchema,
  updatedAt: DateFromIsoDateTimeStringSchema,
  resolvedAt: DateFromIsoDateTimeStringSchema,
  membershipDigest: Schema.String,
  resolvedSkills: ResolvedExtensionMapSchema,
  resolvedCommands: ResolvedExtensionMapSchema,
  resolvedMcpServers: ResolvedExtensionMapSchema,
  resolvedSubagents: ResolvedExtensionMapSchema,
  resolvedFiles: ResolvedExtensionMapSchema,
  resolvedRules: ResolvedExtensionMapSchema,
  resolvedHooks: ResolvedExtensionMapSchema,
}).annotate({
  identifier: "RegistryLibraryLockEntry",
  title: "Registry Library Lock Entry",
  description: "Pinned membership snapshot for a Library subscription.",
});

/** @experimental */
export type RegistryLibraryLockEntry = Schema.Schema.Type<typeof RegistryLibraryLockEntrySchema>;

/** @experimental */
export type RegistryLibraryLockEntryArgs = Omit<RegistryLibraryLockEntry, "type">;

/** @experimental */
export const makeRegistryLibraryLockEntry = (
  args: RegistryLibraryLockEntryArgs,
): RegistryLibraryLockEntry => ({
  type: "registry",
  ...args,
});

/**
 * Lock entry for a single Library subscription.
 *
 * @experimental
 */
export const LibraryLockEntrySchema = RegistryLibraryLockEntrySchema.annotate({
  identifier: "LibraryLockEntry",
  title: "Library Lock Entry",
  description: "Pinned membership snapshot for an installed Library subscription.",
});

/** @experimental */
export type LibraryLockEntry = Schema.Schema.Type<typeof LibraryLockEntrySchema>;

/**
 * Map of Library subscription names to lock entries.
 *
 * @experimental
 */
export const LibrariesLockMapSchema = Schema.Record(Schema.String, LibraryLockEntrySchema);

/** @experimental */
export type LibrariesLockMap = Schema.Schema.Type<typeof LibrariesLockMapSchema>;

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
 * - lockfileVersion: Schema version (currently 2)
 * - skills: Map of skill names to their lock entries
 * - packs: Map of pack names to their lock entries (optional)
 *
 * @experimental This API is unstable and may change without notice.
 */
export const LockfileSchema = Schema.Struct({
  lockfileVersion: Schema.Int.pipe(
    Schema.check(Schema.isGreaterThanOrEqualTo(1)),
    Schema.annotate({
      description: "Lockfile schema version (currently 2).",
      default: LOCKFILE_VERSION,
    }),
    Schema.annotateKey({ messageMissingKey: "lockfileVersion is required" }),
  ),
  skills: SkillsLockMapSchema.pipe(
    Schema.annotateKey({ messageMissingKey: "skills map is required" }),
  ),
  commands: Schema.optional(CommandsLockMapSchema),
  subagents: Schema.optional(SubagentsLockMapSchema),
  mcpServers: Schema.optional(McpServersLockMapSchema),
  files: Schema.optional(FilesLockMapSchema),
  rules: Schema.optional(RulesLockMapSchema),
  hooks: Schema.optional(HooksLockMapSchema),
  knowledge: Schema.optional(KnowledgeLockMapSchema),
  packs: Schema.optional(PacksLockMapSchema),
  libraries: Schema.optional(LibrariesLockMapSchema),
}).annotate({
  identifier: "Lockfile",
  title: "AXM Lockfile",
  description:
    "Records the exact versions of all installed extensions so installs are reproducible.",
});

/**
 * Inferred type for Lockfile schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type Lockfile = Schema.Schema.Type<typeof LockfileSchema>;

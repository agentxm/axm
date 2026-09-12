import type { DesiredStateGraph } from "@agentxm/workspace-state";
/**
 * Per-extension-type manager service tags and the materialization facts each
 * manager reports.
 *
 * Plan-building features require a manager through its tag without depending
 * on the module that implements it. Every tag pins the facts type its manager
 * carries from a materialization to the settings and lockfile writes that
 * follow it in the same closure, so nothing travels through state the layer
 * keeps alive between calls.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type * as Effect from "effect/Effect";
import type * as Option from "effect/Option";
import * as ServiceMap from "effect/Context";

import type {
  ExtensionManager,
  ManagerRequirements,
  MaterializationFacts,
  MaterializationObservation,
} from "./manager-contract.js";
import type { ExtensionManagerFailure } from "./errors.js";
import type { ProjectionPlan } from "@agentxm/workspace-projection";
import type { ConfiguredAgentOutcome, McpServerEntry } from "@agentxm/workspace-state";
import type { WorkspaceTransactionScope } from "@agentxm/workspace-transactions";
import type { SourceHash } from "@agentxm/extension-model/unstable/sources/source-hash";
import type { TreeIntegrity } from "@agentxm/workspace-state";
import type { HookExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/hook";
import type { KnowledgeExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/knowledge";
import type { McpServerExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/mcp-server";
import type { PackRef } from "@agentxm/extension-model/unstable/extensions/refs/pack";
import type { RuleExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/rule";
import type { SkillExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/skill";
import type { SubagentExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/subagent";
import type { VersionRange } from "@agentxm/extension-model/unstable/version-constraints";

// -----------------------------------------------------------------------------
// Per-type materialization facts
// -----------------------------------------------------------------------------

/** The content identity a canonical acquisition established, when it ran. */
export interface AcquiredContentFacts extends MaterializationFacts {
  /** Absent for workspace-authored packages, which carry no accepted tree. */
  readonly treeIntegrity: Option.Option<TreeIntegrity>;
}

/** What a skill materialization observed. */
export interface SkillMaterializationFacts extends AcquiredContentFacts {
  readonly sourceHash: Option.Option<SourceHash>;
}

/** What a subagent materialization observed. */
export interface SubagentMaterializationFacts extends AcquiredContentFacts {
  readonly sourceHash: Option.Option<SourceHash>;
}

/** What a rule materialization observed, including the ref it accepted. */
export interface RuleMaterializationFacts extends AcquiredContentFacts {
  readonly acquired: Option.Option<{
    readonly ref: RuleExtensionRef;
    readonly workspaceRelativeLocalSourcePath: Option.Option<string>;
    readonly sourceHash: SourceHash;
    readonly treeIntegrity: TreeIntegrity;
  }>;
}

/** What a hook materialization observed, including the ref it accepted. */
export interface HookMaterializationFacts extends AcquiredContentFacts {
  readonly acquired: Option.Option<{
    readonly ref: HookExtensionRef;
    readonly workspaceRelativeLocalSourcePath: Option.Option<string>;
    readonly sourceHash: SourceHash;
    readonly treeIntegrity: TreeIntegrity;
  }>;
}

/** What a Knowledge materialization observed. */
export interface KnowledgeMaterializationFacts extends MaterializationFacts {
  readonly acquired: Option.Option<{
    readonly relativeLocalSource: Option.Option<string>;
    readonly sourceHash: SourceHash;
    readonly treeIntegrity?: TreeIntegrity;
  }>;
}

/**
 * What an MCP server materialization observed. A withdrawal also reports which
 * shared registry resolution its lockfile entry may release.
 */
export interface McpServerMaterializationFacts extends AcquiredContentFacts {
  readonly removal: Option.Option<{
    readonly resolutionKey: Option.Option<string>;
    readonly retainShared: boolean;
  }>;
}

/** What a Pack materialization observed: the acquired content identity alone. */
export type PackMaterializationFacts = AcquiredContentFacts;

// -----------------------------------------------------------------------------
// Service tags
// -----------------------------------------------------------------------------

export class SkillManager extends ServiceMap.Service<
  SkillManager,
  ExtensionManager<SkillExtensionRef, SkillMaterializationFacts, ManagerRequirements>
>()("@agentxm/extension-materialization/managers/SkillManager") {}

export interface McpServerManagerService extends ExtensionManager<
  McpServerExtensionRef,
  McpServerMaterializationFacts,
  ManagerRequirements
> {
  readonly configuredAgentOutcomes: (
    state: "projected" | "current",
  ) => Effect.Effect<
    ReadonlyArray<ConfiguredAgentOutcome>,
    ExtensionManagerFailure,
    ManagerRequirements
  >;
  readonly configuredAgentOutcomesForEntry: (args: {
    readonly name: string;
    readonly entry: McpServerEntry;
    readonly state: "projected" | "current";
  }) => Effect.Effect<
    ReadonlyArray<ConfiguredAgentOutcome>,
    ExtensionManagerFailure,
    ManagerRequirements
  >;
}

export class McpServerManager extends ServiceMap.Service<
  McpServerManager,
  McpServerManagerService
>()("@agentxm/extension-materialization/managers/McpServerManager") {}

export interface SubagentManagerService extends ExtensionManager<
  SubagentExtensionRef,
  SubagentMaterializationFacts,
  ManagerRequirements
> {
  readonly projectionObservation: (
    ref: SubagentExtensionRef,
  ) => Effect.Effect<
    { readonly present: boolean; readonly current: boolean },
    ExtensionManagerFailure,
    ManagerRequirements
  >;
}

export class SubagentManager extends ServiceMap.Service<SubagentManager, SubagentManagerService>()(
  "@agentxm/extension-materialization/managers/SubagentManager",
) {}

export interface RuleManagerService extends ExtensionManager<
  RuleExtensionRef,
  RuleMaterializationFacts,
  ManagerRequirements
> {
  readonly aggregateProjectionObservation: Effect.Effect<
    MaterializationObservation,
    ExtensionManagerFailure,
    ManagerRequirements
  >;
  readonly projectionPlans: () => Effect.Effect<
    ReadonlyArray<ProjectionPlan<void, ExtensionManagerFailure, ManagerRequirements>>,
    ExtensionManagerFailure,
    ManagerRequirements
  >;
}

export class RuleManager extends ServiceMap.Service<RuleManager, RuleManagerService>()(
  "@agentxm/extension-materialization/managers/RuleManager",
) {}

/** Hook contributors verified during preparation, before they enter the lockfile. */
export interface PreparedHookProjection {
  readonly plans: ReadonlyArray<ProjectionPlan<void, ExtensionManagerFailure, ManagerRequirements>>;
  readonly agentOutcomes: ReadonlyArray<ConfiguredAgentOutcome>;
  readonly acquisitions: ReadonlyArray<{
    readonly name: string;
    readonly treeIntegrity: TreeIntegrity;
  }>;
}

export interface HookManagerService extends ExtensionManager<
  HookExtensionRef,
  HookMaterializationFacts,
  ManagerRequirements
> {
  readonly prepareProjection: (
    refs: ReadonlyArray<HookExtensionRef>,
  ) => Effect.Effect<PreparedHookProjection, ExtensionManagerFailure, ManagerRequirements>;
  readonly aggregateProjectionObservation: Effect.Effect<
    MaterializationObservation,
    ExtensionManagerFailure,
    ManagerRequirements
  >;
  readonly projectionPlans: () => Effect.Effect<
    ReadonlyArray<ProjectionPlan<void, ExtensionManagerFailure, ManagerRequirements>>,
    ExtensionManagerFailure,
    ManagerRequirements
  >;
  readonly configuredAgentOutcomes?: (
    state: "projected" | "current",
    proposedGraph?: DesiredStateGraph,
  ) => Effect.Effect<
    ReadonlyArray<ConfiguredAgentOutcome>,
    ExtensionManagerFailure,
    ManagerRequirements
  >;
  readonly configuredAgentOutcomesForRef?: (
    ref: HookExtensionRef,
    state: "projected" | "current",
  ) => Effect.Effect<
    ReadonlyArray<ConfiguredAgentOutcome>,
    ExtensionManagerFailure,
    ManagerRequirements
  >;
}

export class HookManager extends ServiceMap.Service<HookManager, HookManagerService>()(
  "@agentxm/extension-materialization/managers/HookManager",
) {}

export interface KnowledgeSyncResult {
  readonly changed: boolean;
  readonly warnings: ReadonlyArray<string>;
  readonly artifacts: ReadonlyArray<{
    readonly path: string;
    readonly change: "created" | "updated" | "removed" | "unchanged";
    readonly mechanism?: "symlink" | "copy";
  }>;
}

export interface KnowledgeManagerService extends ExtensionManager<
  KnowledgeExtensionRef,
  KnowledgeMaterializationFacts,
  ManagerRequirements
> {
  readonly projectionPlans: () => Effect.Effect<
    ReadonlyArray<ProjectionPlan<void, ExtensionManagerFailure, ManagerRequirements>>,
    ExtensionManagerFailure,
    ManagerRequirements
  >;
  /**
   * Catalog refresh, sync, and the atomic install open their own workspace
   * transaction, so they name the transaction scope alongside the manager's
   * own requirements.
   */
  readonly refreshCatalog: () => Effect.Effect<
    void,
    ExtensionManagerFailure,
    ManagerRequirements | WorkspaceTransactionScope
  >;
  readonly sync: (options: {
    readonly dryRun: boolean;
  }) => Effect.Effect<
    KnowledgeSyncResult,
    ExtensionManagerFailure,
    ManagerRequirements | WorkspaceTransactionScope
  >;
  readonly install: (args: {
    readonly ref: KnowledgeExtensionRef;
    readonly versionRange: Option.Option<VersionRange>;
    readonly deferProjection?: boolean;
  }) => Effect.Effect<
    void,
    ExtensionManagerFailure,
    ManagerRequirements | WorkspaceTransactionScope
  >;
}

export class KnowledgeManager extends ServiceMap.Service<
  KnowledgeManager,
  KnowledgeManagerService
>()("@agentxm/extension-materialization/managers/KnowledgeManager") {}

export class PackManager extends ServiceMap.Service<
  PackManager,
  ExtensionManager<PackRef, PackMaterializationFacts, ManagerRequirements>
>()("@agentxm/extension-materialization/managers/PackManager") {}

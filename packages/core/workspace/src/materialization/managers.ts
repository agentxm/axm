import type {
  AuthorMaterialization,
  InstallMaterialization,
  SynchronizeMaterialization,
  UninstallMaterialization,
} from "../transitions/planning/index.js";
import type { ExtensionTargetFor } from "../desired-state/index.js";
import type { DesiredStateGraph } from "../desired-state/index.js";
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
  CanonicalMaterializationRequirements,
  ManagerRequirements,
  MaterializationFacts,
  MaterializationObservation,
} from "./manager-contract.js";
import type { ExtensionManagerFailure } from "./errors.js";
import type { ProjectionPlan } from "../projection/index.js";
import type { ConfiguredAgentOutcome } from "../desired-state/index.js";
import type { WorkspaceTransactionScope } from "../transitions/settlement/index.js";
import type { SourceHash } from "@agentxm/extension-model/unstable/sources/source-hash";
import type { TreeIntegrity } from "../desired-state/index.js";
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
export interface PackMaterializationFacts {
  readonly treeIntegrity: Option.Option<TreeIntegrity>;
}

// -----------------------------------------------------------------------------
// Service tags
// -----------------------------------------------------------------------------

export interface SkillManagerService
  extends
    InstallMaterialization<
      SkillExtensionRef,
      SkillMaterializationFacts,
      ExtensionManagerFailure,
      ManagerRequirements
    >,
    AuthorMaterialization<
      SkillExtensionRef,
      SkillMaterializationFacts,
      ExtensionManagerFailure,
      ManagerRequirements
    >,
    SynchronizeMaterialization<
      SkillExtensionRef,
      SkillMaterializationFacts,
      ExtensionManagerFailure,
      ManagerRequirements
    >,
    UninstallMaterialization<
      ExtensionTargetFor<SkillExtensionRef>,
      SkillMaterializationFacts,
      ExtensionManagerFailure,
      ManagerRequirements
    > {
  readonly materializeDeactivate: (args: {
    readonly target: ExtensionTargetFor<SkillExtensionRef>;
  }) => Effect.Effect<SkillMaterializationFacts, ExtensionManagerFailure, ManagerRequirements>;
}

export class SkillManager extends ServiceMap.Service<SkillManager, SkillManagerService>()(
  "@agentxm/workspace/materialization/managers/SkillManager",
) {}

export interface McpServerManagerService
  extends
    InstallMaterialization<
      McpServerExtensionRef,
      McpServerMaterializationFacts,
      ExtensionManagerFailure,
      ManagerRequirements
    >,
    AuthorMaterialization<
      McpServerExtensionRef,
      McpServerMaterializationFacts,
      ExtensionManagerFailure,
      ManagerRequirements
    >,
    SynchronizeMaterialization<
      McpServerExtensionRef,
      McpServerMaterializationFacts,
      ExtensionManagerFailure,
      ManagerRequirements
    >,
    UninstallMaterialization<
      ExtensionTargetFor<McpServerExtensionRef>,
      McpServerMaterializationFacts,
      ExtensionManagerFailure,
      ManagerRequirements
    > {
  readonly materializeDeactivate: (args: {
    readonly target: ExtensionTargetFor<McpServerExtensionRef>;
  }) => Effect.Effect<McpServerMaterializationFacts, ExtensionManagerFailure, ManagerRequirements>;
  /**
   * Every desired MCP connection's per-agent outcome, judged from the
   * desired-state graph (or a proposed one) rather than from raw settings.
   */
  readonly configuredAgentOutcomes: (
    state: "projected" | "current",
    proposedGraph?: DesiredStateGraph,
    /** Only these connections, when a change concerns some rather than all. */
    selection?: { readonly names: ReadonlyArray<string> },
  ) => Effect.Effect<
    ReadonlyArray<ConfiguredAgentOutcome>,
    ExtensionManagerFailure,
    ManagerRequirements
  >;
}

export class McpServerManager extends ServiceMap.Service<
  McpServerManager,
  McpServerManagerService
>()("@agentxm/workspace/materialization/managers/McpServerManager") {}

export interface SubagentManagerService
  extends
    InstallMaterialization<
      SubagentExtensionRef,
      SubagentMaterializationFacts,
      ExtensionManagerFailure,
      ManagerRequirements
    >,
    AuthorMaterialization<
      SubagentExtensionRef,
      SubagentMaterializationFacts,
      ExtensionManagerFailure,
      ManagerRequirements
    >,
    SynchronizeMaterialization<
      SubagentExtensionRef,
      SubagentMaterializationFacts,
      ExtensionManagerFailure,
      ManagerRequirements
    >,
    UninstallMaterialization<
      ExtensionTargetFor<SubagentExtensionRef>,
      SubagentMaterializationFacts,
      ExtensionManagerFailure,
      ManagerRequirements
    > {
  readonly materializeDeactivate: (args: {
    readonly target: ExtensionTargetFor<SubagentExtensionRef>;
  }) => Effect.Effect<SubagentMaterializationFacts, ExtensionManagerFailure, ManagerRequirements>;
  readonly projectionObservation: (
    ref: SubagentExtensionRef,
  ) => Effect.Effect<
    { readonly present: boolean; readonly current: boolean },
    ExtensionManagerFailure,
    ManagerRequirements
  >;
}

export class SubagentManager extends ServiceMap.Service<SubagentManager, SubagentManagerService>()(
  "@agentxm/workspace/materialization/managers/SubagentManager",
) {}

export interface RuleManagerService
  extends
    InstallMaterialization<
      RuleExtensionRef,
      RuleMaterializationFacts,
      ExtensionManagerFailure,
      ManagerRequirements
    >,
    AuthorMaterialization<
      RuleExtensionRef,
      RuleMaterializationFacts,
      ExtensionManagerFailure,
      ManagerRequirements
    >,
    SynchronizeMaterialization<
      RuleExtensionRef,
      RuleMaterializationFacts,
      ExtensionManagerFailure,
      ManagerRequirements
    >,
    UninstallMaterialization<
      ExtensionTargetFor<RuleExtensionRef>,
      RuleMaterializationFacts,
      ExtensionManagerFailure,
      ManagerRequirements
    > {
  readonly materializeDeactivate: (args: {
    readonly target: ExtensionTargetFor<RuleExtensionRef>;
  }) => Effect.Effect<RuleMaterializationFacts, ExtensionManagerFailure, ManagerRequirements>;
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
  "@agentxm/workspace/materialization/managers/RuleManager",
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

export interface HookManagerService
  extends
    InstallMaterialization<
      HookExtensionRef,
      HookMaterializationFacts,
      ExtensionManagerFailure,
      ManagerRequirements
    >,
    AuthorMaterialization<
      HookExtensionRef,
      HookMaterializationFacts,
      ExtensionManagerFailure,
      ManagerRequirements
    >,
    SynchronizeMaterialization<
      HookExtensionRef,
      HookMaterializationFacts,
      ExtensionManagerFailure,
      ManagerRequirements
    >,
    UninstallMaterialization<
      ExtensionTargetFor<HookExtensionRef>,
      HookMaterializationFacts,
      ExtensionManagerFailure,
      ManagerRequirements
    > {
  readonly materializeDeactivate: (args: {
    readonly target: ExtensionTargetFor<HookExtensionRef>;
  }) => Effect.Effect<HookMaterializationFacts, ExtensionManagerFailure, ManagerRequirements>;
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
  "@agentxm/workspace/materialization/managers/HookManager",
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

export interface KnowledgeManagerService
  extends
    InstallMaterialization<
      KnowledgeExtensionRef,
      KnowledgeMaterializationFacts,
      ExtensionManagerFailure,
      ManagerRequirements
    >,
    AuthorMaterialization<
      KnowledgeExtensionRef,
      KnowledgeMaterializationFacts,
      ExtensionManagerFailure,
      ManagerRequirements
    >,
    SynchronizeMaterialization<
      KnowledgeExtensionRef,
      KnowledgeMaterializationFacts,
      ExtensionManagerFailure,
      ManagerRequirements
    >,
    UninstallMaterialization<
      ExtensionTargetFor<KnowledgeExtensionRef>,
      KnowledgeMaterializationFacts,
      ExtensionManagerFailure,
      ManagerRequirements
    > {
  readonly materializeDeactivate: (args: {
    readonly target: ExtensionTargetFor<KnowledgeExtensionRef>;
  }) => Effect.Effect<KnowledgeMaterializationFacts, ExtensionManagerFailure, ManagerRequirements>;
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
>()("@agentxm/workspace/materialization/managers/KnowledgeManager") {}

export interface PackManagerService
  extends
    InstallMaterialization<
      PackRef,
      PackMaterializationFacts,
      ExtensionManagerFailure,
      CanonicalMaterializationRequirements
    >,
    AuthorMaterialization<
      PackRef,
      PackMaterializationFacts,
      ExtensionManagerFailure,
      CanonicalMaterializationRequirements
    >,
    SynchronizeMaterialization<
      PackRef,
      PackMaterializationFacts,
      ExtensionManagerFailure,
      CanonicalMaterializationRequirements
    >,
    UninstallMaterialization<
      ExtensionTargetFor<PackRef>,
      PackMaterializationFacts,
      ExtensionManagerFailure,
      CanonicalMaterializationRequirements
    > {}

export class PackManager extends ServiceMap.Service<PackManager, PackManagerService>()(
  "@agentxm/workspace/materialization/managers/PackManager",
) {}

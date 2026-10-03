import type {
  AcceptedResolutionWriter,
  DesiredStateGraph,
  DesiredStateWriter,
  ExtensionTargetFor,
  LockfileReader,
  SettingsWriter,
  WorkspaceLocation,
} from "../workspace-state/index.js";
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
import type { CodingAgentRepository, ProjectionPlan } from "../projection/index.js";
import type { ConfiguredAgentOutcome, JobStepResult, Operation } from "../operations/index.js";
import type { FootprintRecorder, WorkspaceTransactionScope } from "../settlement/index.js";
import type { McpAuth, McpBinding, McpDistribution } from "../agent-adapters/index.js";
import type { SourceHash } from "@agentxm/extension-model/unstable/sources/source-hash";
import type { TreeIntegrity } from "../workspace-state/index.js";
import type { NativeLocationOutcome } from "../locations/index.js";
import type { HookExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/hook";
import type { KnowledgeExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/knowledge";
import type { McpServerExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/mcp-server";
import type { PackRef } from "@agentxm/extension-model/unstable/extensions/refs/pack";
import type { RuleExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/rule";
import type { SkillExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/skill";
import type { SubagentExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/subagent";
import type {
  AuthorMaterialization,
  InstallMaterialization,
  SynchronizeMaterialization,
  UninstallMaterialization,
  NativeProjectionOptions,
} from "./ports/transition-materialization.js";

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
    readonly workspaceRelativeLocalSourcePath: Option.Option<string>;
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
  "@agentxm/workspace-kernel/materialization/managers/SkillManager",
) {}

/**
 * What installing one MCP connection is asked to do.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface InstallMcpServerOperationArgs {
  /** Explicit authoring/install authority to select a unique distribution. Never set by sync. */
  readonly authorizeDistributionSelection?: boolean;
  readonly nativeInsertionEligible?: boolean;
  /** Physical routes newly authorized by a captured membership transition. */
  readonly nativeInsertionEligiblePaths?: ReadonlySet<string>;
  readonly ref: McpServerExtensionRef;
  /**
   * The source identity the connection's credentials and lock rows are keyed
   * by, when the caller already settled it. Absent, the identity of the
   * requested package itself is used.
   */
  readonly sourceIdentity?: string;
  /** Local connection identity and exact agent-native MCP key. */
  readonly localName?: string;
  readonly force: boolean;
  /** Explicit connection declaration; absent when realizing inherited or authored state. */
  readonly declaration?: { readonly name: string; readonly versionRange: Option.Option<string> };
  /** When true, enforce strict policy for MCP sync outcomes. */
  readonly strictAgentSync?: Option.Option<boolean>;
  readonly distribution?: McpDistribution;
  /** Convenience selector accepted only at an authorizing installation boundary. */
  readonly distributionId?: string;
  readonly bindings?: ReadonlyArray<McpBinding>;
  readonly auth?: McpAuth;
  /**
   * Whether the invoking surface can prompt for missing required inputs.
   * The transport boundary resolves flag, CI, and TTY state.
   */
  readonly nonInteractive: boolean;
}

/**
 * Add an MCP server to the workspace.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type InstallMcpServerOperation = Operation<
  "install-mcp-server",
  InstallMcpServerOperationArgs
>;

/**
 * Everything installing one MCP connection reads and writes: the manager
 * requirements, the workspace records the install declares, the agents it
 * projects into. Native hosts own runtime credentials.
 */
export type McpConnectionInstallRequirements =
  | ManagerRequirements
  | FootprintRecorder
  | SettingsWriter
  | DesiredStateWriter
  | AcceptedResolutionWriter
  | LockfileReader
  | CodingAgentRepository
  | WorkspaceLocation;

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
  /**
   * Install one connection: acquire its package, reconcile its credentials,
   * record its settings entry and accepted resolution, and project it into
   * every configured agent. Every surface that installs an MCP connection
   * reaches the installation through this member.
   */
  readonly installConnection: (
    op: InstallMcpServerOperation,
  ) => Effect.Effect<JobStepResult, ExtensionManagerFailure, McpConnectionInstallRequirements>;
}

export class McpServerManager extends ServiceMap.Service<
  McpServerManager,
  McpServerManagerService
>()("@agentxm/workspace-kernel/materialization/managers/McpServerManager") {}

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
    options?: { readonly sourceRoot: string },
  ) => Effect.Effect<
    {
      readonly present: boolean;
      readonly current: boolean;
      readonly nativeLocations?: ReadonlyArray<NativeLocationOutcome>;
    },
    ExtensionManagerFailure,
    ManagerRequirements
  >;
}

export class SubagentManager extends ServiceMap.Service<SubagentManager, SubagentManagerService>()(
  "@agentxm/workspace-kernel/materialization/managers/SubagentManager",
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
  readonly prepareProjection: (
    refs: ReadonlyArray<RuleExtensionRef>,
    options?: NativeProjectionOptions,
  ) => Effect.Effect<
    ReadonlyArray<ProjectionPlan<void, ExtensionManagerFailure, ManagerRequirements>>,
    ExtensionManagerFailure,
    ManagerRequirements
  >;
  readonly projectionPlans: (
    options?: NativeProjectionOptions,
  ) => Effect.Effect<
    ReadonlyArray<ProjectionPlan<void, ExtensionManagerFailure, ManagerRequirements>>,
    ExtensionManagerFailure,
    ManagerRequirements
  >;
}

export class RuleManager extends ServiceMap.Service<RuleManager, RuleManagerService>()(
  "@agentxm/workspace-kernel/materialization/managers/RuleManager",
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
    options?: NativeProjectionOptions,
  ) => Effect.Effect<PreparedHookProjection, ExtensionManagerFailure, ManagerRequirements>;
  readonly aggregateProjectionObservation: Effect.Effect<
    MaterializationObservation,
    ExtensionManagerFailure,
    ManagerRequirements
  >;
  readonly projectionPlans: (
    options?: NativeProjectionOptions,
  ) => Effect.Effect<
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
  "@agentxm/workspace-kernel/materialization/managers/HookManager",
) {}

export interface KnowledgeSyncResult {
  readonly nativeLocations?: ReadonlyArray<NativeLocationOutcome>;
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
  readonly aggregateProjectionObservation: Effect.Effect<
    MaterializationObservation,
    ExtensionManagerFailure,
    ManagerRequirements
  >;
  readonly prepareProjection: (
    refs: ReadonlyArray<KnowledgeExtensionRef>,
    options?: NativeProjectionOptions,
  ) => Effect.Effect<
    ReadonlyArray<ProjectionPlan<void, ExtensionManagerFailure, ManagerRequirements>>,
    ExtensionManagerFailure,
    ManagerRequirements
  >;
  readonly projectionPlans: (
    options?: NativeProjectionOptions,
  ) => Effect.Effect<
    ReadonlyArray<ProjectionPlan<void, ExtensionManagerFailure, ManagerRequirements>>,
    ExtensionManagerFailure,
    ManagerRequirements
  >;
  /**
   * Catalog refresh and sync open their own workspace transaction, so they
   * name the transaction scope alongside the manager's own requirements.
   */
  readonly refreshCatalog: () => Effect.Effect<
    void,
    ExtensionManagerFailure,
    ManagerRequirements | WorkspaceTransactionScope
  >;
  readonly sync: (options: {
    readonly dryRun: boolean;
    readonly nativeProjection?: NativeProjectionOptions;
  }) => Effect.Effect<
    KnowledgeSyncResult,
    ExtensionManagerFailure,
    ManagerRequirements | WorkspaceTransactionScope
  >;
}

export class KnowledgeManager extends ServiceMap.Service<
  KnowledgeManager,
  KnowledgeManagerService
>()("@agentxm/workspace-kernel/materialization/managers/KnowledgeManager") {}

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
  "@agentxm/workspace-kernel/materialization/managers/PackManager",
) {}

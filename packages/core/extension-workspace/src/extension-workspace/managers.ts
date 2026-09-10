/**
 * Per-extension-type manager service tags.
 *
 * The kernel owns the manager contract ({@link ExtensionManager}) and these
 * service identities so plan-building features can require a manager through
 * its tag without depending on the package that implements it. The Live
 * implementations stay with the extension-lifecycle feature code.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type * as Effect from "effect/Effect";
import type * as Option from "effect/Option";
import * as ServiceMap from "effect/Context";

import type { ExtensionManager } from "./extension-manager.js";
import type { ExtensionManagerFailure } from "./errors.js";
import type { ProjectionPlan } from "../projection/planning.js";
import type { ConfiguredAgentOutcome } from "@agentxm/workspace-state";
import type { HookExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/hook";
import type { KnowledgeExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/knowledge";
import type { McpServerExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/mcp-server";
import type { PackRef } from "@agentxm/extension-model/unstable/extensions/refs/pack";
import type { RuleExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/rule";
import type { SkillExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/skill";
import type { SubagentExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/subagent";
import type { VersionRange } from "@agentxm/extension-model/unstable/version-constraints";

// -----------------------------------------------------------------------------
// Projection-region ownership identities
// -----------------------------------------------------------------------------

export const RULES_REGION_OWNER = "@agentxm/rules/instructions";
export const HOOK_FALLBACKS_REGION_OWNER = "@agentxm/hooks/fallbacks";

// -----------------------------------------------------------------------------
// Service tags
// -----------------------------------------------------------------------------

export class SkillManager extends ServiceMap.Service<
  SkillManager,
  ExtensionManager<SkillExtensionRef>
>()("@agentxm/extension-workspace/extension-workspace/managers/SkillManager") {}

export class McpServerManager extends ServiceMap.Service<
  McpServerManager,
  ExtensionManager<McpServerExtensionRef>
>()("@agentxm/extension-workspace/extension-workspace/managers/McpServerManager") {}

export interface SubagentManagerService extends ExtensionManager<SubagentExtensionRef> {
  readonly projectionObservation: (
    ref: SubagentExtensionRef,
  ) => Effect.Effect<
    { readonly present: boolean; readonly current: boolean },
    ExtensionManagerFailure
  >;
}

export class SubagentManager extends ServiceMap.Service<SubagentManager, SubagentManagerService>()(
  "@agentxm/extension-workspace/extension-workspace/managers/SubagentManager",
) {}

export interface RuleManagerService extends ExtensionManager<RuleExtensionRef> {
  readonly projectionPlans: () => Effect.Effect<
    ReadonlyArray<ProjectionPlan>,
    ExtensionManagerFailure
  >;
}

export class RuleManager extends ServiceMap.Service<RuleManager, RuleManagerService>()(
  "@agentxm/extension-workspace/extension-workspace/managers/RuleManager",
) {}

export interface HookManagerService extends ExtensionManager<HookExtensionRef> {
  readonly projectionPlans: () => Effect.Effect<
    ReadonlyArray<ProjectionPlan>,
    ExtensionManagerFailure
  >;
  readonly configuredAgentOutcomes?: (
    state: "projected" | "current",
  ) => Effect.Effect<ReadonlyArray<ConfiguredAgentOutcome>, ExtensionManagerFailure>;
  readonly configuredAgentOutcomesForRef?: (
    ref: HookExtensionRef,
    state: "projected" | "current",
  ) => Effect.Effect<ReadonlyArray<ConfiguredAgentOutcome>, ExtensionManagerFailure>;
}

export class HookManager extends ServiceMap.Service<HookManager, HookManagerService>()(
  "@agentxm/extension-workspace/extension-workspace/managers/HookManager",
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

export interface KnowledgeManagerService extends ExtensionManager<KnowledgeExtensionRef> {
  readonly projectionPlans: () => Effect.Effect<
    ReadonlyArray<ProjectionPlan>,
    ExtensionManagerFailure
  >;
  readonly refreshCatalog: () => Effect.Effect<void, ExtensionManagerFailure>;
  readonly sync: (options: {
    readonly dryRun: boolean;
  }) => Effect.Effect<KnowledgeSyncResult, ExtensionManagerFailure>;
  readonly install: (args: {
    readonly ref: KnowledgeExtensionRef;
    readonly versionRange: Option.Option<VersionRange>;
    readonly deferProjection?: boolean;
  }) => Effect.Effect<void, ExtensionManagerFailure>;
}

export class KnowledgeManager extends ServiceMap.Service<
  KnowledgeManager,
  KnowledgeManagerService
>()("@agentxm/extension-workspace/extension-workspace/managers/KnowledgeManager") {}

export class PackManager extends ServiceMap.Service<PackManager, ExtensionManager<PackRef>>()(
  "@agentxm/extension-workspace/extension-workspace/managers/PackManager",
) {}

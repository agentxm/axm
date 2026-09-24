/**
 * The vocabulary every install route shares.
 *
 * Root install, the seven per-type installs, and the configured-entry sweep
 * are one use case with the type either fixed by the command or detected from
 * what the source offers. They therefore share one request, one requirement
 * set, one per-type resolved intent, and one failure vocabulary; only the
 * grammar that produced the request differs.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type * as FileSystem from "effect/FileSystem";
import type * as Option from "effect/Option";
import type * as Path from "effect/Path";
import type * as Scope from "effect/Scope";
import type * as HttpClient from "effect/unstable/http/HttpClient";

import type { NativeWriteAuthority } from "../../projection/agent-adapters/index.js";
import type { ManagerRequirements, McpSecretStore } from "../../materialization/index.js";
import type { RecipeRequirements } from "../../reconciliation/index.js";
import type { ExtensionName } from "@agentxm/extension-model/unstable/extensions";
import type { HookExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/hook";
import type { KnowledgeExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/knowledge";
import type { McpServerExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/mcp-server";
import type { PackRef } from "@agentxm/extension-model/unstable/extensions/refs/pack";
import type { RuleExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/rule";
import type { SkillExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/skill";
import type { SubagentExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/subagent";
import type { ReleaseAgeEvaluation } from "@agentxm/extension-model/unstable/extensions/release-age";
import type { VersionRange } from "@agentxm/extension-model/unstable/version-constraints";
import type {
  ExtensionResolutionFailed,
  HeldReleasePolicy,
  PackDependencyRefResolver,
} from "../../resolution/index.js";
import type { SourceHostProviders, WorkspaceCatalog } from "../../resolution/sources/index.js";
import type {
  ApprovalRecoveryMissing,
  CandidateFingerprintFailed,
  OperationJournal,
  PlanInteractionFailed,
  ResolvePlanInteraction,
} from "../../transitions/planning/index.js";
import type { CodingAgentRepository, WorkspaceInvariantFacts } from "../../projection/index.js";
import type {
  AcceptedCanonicalRefError,
  AcceptedResolutionWriter,
  ConfiguredAgentOutcomesProvider,
  DesiredStateGraph,
  DesiredStateReader,
  DesiredStateWriter,
  ExtensionPaths,
  LockfileValidationError,
  LockfileReader,
  SettingsReader,
  SettingsWriter,
  WorkspaceLocation,
  WorkspaceRecords,
  WorkspaceSettingsReadFailure,
  WorkspaceStateReadFailure,
} from "../../desired-state/index.js";
import type {
  FootprintRecorder,
  WorkspaceTransactionScope,
  WorkspaceTransitionAcquireFailure,
} from "../../transitions/settlement/index.js";

import { ExtensionLifecycleFailed } from "../errors.js";

// -----------------------------------------------------------------------------
// Requirements
// -----------------------------------------------------------------------------

/**
 * What an install or uninstall plan step declares at execution time: the
 * manager's own requirements, the transaction scope its closure opens, the
 * keychain an MCP connection reads, and the owned workspace-state ports and agent
 * repository its artifact observes. These travel with the step and are
 * composed once at the application's runtime boundary; nothing is captured
 * into a step's closure on the way, and no failure adapter is among them.
 */
export type InstallStepRequirements =
  | ManagerRequirements
  | RecipeRequirements
  | McpSecretStore
  | CodingAgentRepository
  | LockfileReader
  | WorkspaceRecords
  | WorkspaceInvariantFacts
  | WorkspaceLocation
  | SettingsReader
  | SettingsWriter
  | LockfileReader
  | DesiredStateReader
  | DesiredStateWriter
  | AcceptedResolutionWriter
  | ExtensionPaths
  | NativeWriteAuthority;

/**
 * What routing a source locator, probing configured registries, and reading
 * what a source contains all need.
 */
export type ResolveInstallRequirements =
  | FileSystem.FileSystem
  | Path.Path
  | HttpClient.HttpClient
  | Scope.Scope
  | SourceHostProviders
  | WorkspaceCatalog
  | WorkspaceLocation
  | SettingsReader
  | LockfileReader
  | DesiredStateReader;

/**
 * Every failure resolving a settled install or removal can surface: the
 * approval and interaction refusals, the candidate revalidation, and the
 * transition an apply could not acquire. Step failures travel inside the
 * resolution rather than being raised, so the operator still sees what each
 * closure settled.
 */
export type InstallExecutionFailure =
  | ApprovalRecoveryMissing
  | CandidateFingerprintFailed
  | LockfileValidationError
  | PlanInteractionFailed
  | WorkspaceSettingsReadFailure
  | WorkspaceStateReadFailure
  | WorkspaceTransitionAcquireFailure;

/**
 * Everything settling an install reads, and everything resolving the settled
 * candidate writes through: the sources it resolves against, the workspace
 * state ports and agent outcomes it reads, the journal and footprint the operation
 * records into, and the interaction that presents and confirms it.
 */
export type PrepareInstallRequirements =
  | InstallStepRequirements
  | ResolveInstallRequirements
  | ConfiguredAgentOutcomesProvider
  | FootprintRecorder
  | OperationJournal
  | ResolvePlanInteraction
  | WorkspaceRecords
  | WorkspaceTransactionScope;

// -----------------------------------------------------------------------------
// Failures
// -----------------------------------------------------------------------------

/**
 * Refuse an install or uninstall with the category, wording, and recovery the
 * feature decided. The application converts the carried fields into its error
 * envelope verbatim, so the producer owns the refusal rather than the shell.
 */
export const installRefused = (fields: {
  readonly category: ExtensionLifecycleFailed["category"];
  readonly detail: string;
  readonly recover?: string;
  readonly cmd?: string;
  readonly suggestions?: ExtensionLifecycleFailed["suggestions"];
  readonly cause?: unknown;
}): ExtensionLifecycleFailed =>
  new ExtensionLifecycleFailed({
    category: fields.category,
    detail: fields.detail,
    ...(fields.recover === undefined ? {} : { recover: fields.recover }),
    ...(fields.cmd === undefined ? {} : { cmd: fields.cmd }),
    ...(fields.suggestions === undefined ? {} : { suggestions: fields.suggestions }),
    ...(fields.cause === undefined ? {} : { cause: fields.cause }),
  });

// -----------------------------------------------------------------------------
// Per-type resolved intents
// -----------------------------------------------------------------------------

/** One discovered package and the constraint the request placed on it. */
export interface ResolvedInstallRef<TRef> {
  readonly ref: TRef;
  readonly versionRange: Option.Option<VersionRange>;
}

/** Skills the request selected, and whether to re-materialize regardless. */
export interface SkillInstallIntent {
  readonly skillsToInstall: ReadonlyArray<ResolvedInstallRef<SkillExtensionRef>>;
  readonly force?: boolean;
}

/** Subagents the request selected, and whether to re-materialize regardless. */
export interface SubagentInstallIntent {
  readonly subagentsToInstall: ReadonlyArray<ResolvedInstallRef<SubagentExtensionRef>>;
  readonly force?: boolean;
}

/** Rules the request selected. */
export interface RuleInstallIntent {
  /** The enclosing semantic closure owns the trailing aggregate projection. */
  readonly deferProjections?: boolean;
  readonly refs: ReadonlyArray<ResolvedInstallRef<RuleExtensionRef>>;
}

/** Hooks packages the request selected. */
export interface HookInstallIntent {
  /** The enclosing semantic closure owns the trailing aggregate projection. */
  readonly deferProjections?: boolean;
  readonly refs: ReadonlyArray<ResolvedInstallRef<HookExtensionRef>>;
}

/** Knowledge bundles the request selected. */
export interface KnowledgeInstallIntent {
  /** The enclosing semantic closure owns the trailing aggregate projection. */
  readonly deferProjections?: boolean;
  readonly refs: ReadonlyArray<ResolvedInstallRef<KnowledgeExtensionRef>>;
}

/** One MCP connection, its local name, and the inputs the request supplied. */
export interface McpServerInstallIntent {
  readonly ref: McpServerExtensionRef;
  readonly localName: ExtensionName;
  readonly versionRange: Option.Option<string>;
  readonly force: boolean;
  readonly nonInteractive: boolean;
  readonly env?: Readonly<Record<string, string>>;
}

/**
 * The authority a recovery uses instead of re-selecting members: every member
 * ref comes from the accepted resolution already recorded for it.
 */
export type PackRecoveryDependencyResolver = PackDependencyRefResolver<
  AcceptedCanonicalRefError | ExtensionResolutionFailed,
  WorkspaceLocation | SettingsReader | LockfileReader | FileSystem.FileSystem | Path.Path
>;

/**
 * What an install does when the minimum release age holds back every release
 * a constraint admits: keep a complete, usable accepted resolution, or refuse
 * before any write. Targeted and configured installs, and the sync recovery
 * that replays a configured install, all take their policy from here.
 */
export const INSTALL_HELD_RELEASE_POLICY: HeldReleasePolicy = "preserve-or-block";

/** One pack graph transition and the policy that governs it. */
export interface PackInstallIntent {
  readonly packToInstall: PackRef;
  readonly versionRange: Option.Option<VersionRange>;
  readonly nonInteractive: boolean;
  /** The one evaluation every member is selected under. */
  readonly releaseAgeEvaluation: ReleaseAgeEvaluation;
  /** The policy the operation that classified this intent declared. */
  readonly heldRelease: HeldReleasePolicy;
  /** Immutable dependency authority a deterministic recovery workflow supplies. */
  readonly dependencyResolver?: PackRecoveryDependencyResolver;
  /** Render shared aggregate projections after a larger enclosing transition. */
  readonly deferProjections?: boolean;
  /**
   * Reacquire the Pack's canonical content instead of reusing the installed
   * tree. Recovery sets this because the observed tree already diverged from
   * the accepted resolution, so reusing it would preserve the divergence.
   */
  readonly forceCanonical?: boolean;
  /**
   * The proposed desired-state graph whose effective constraints the members
   * are selected within. A sweep that advances several Packs builds it once
   * with every selected Pack's manifest; omitted, this Pack's manifest is the
   * only proposed change.
   */
  readonly desiredGraph?: DesiredStateGraph;
}

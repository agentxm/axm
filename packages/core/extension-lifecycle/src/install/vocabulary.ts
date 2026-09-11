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

import type { NativeWriteAuthority } from "@agentxm/agent-integration";
import type {
  ManagerRequirements,
  McpSecretStore,
  RecipeRequirements,
} from "@agentxm/extension-materialization";
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
  PackDependencyRefResolver,
} from "@agentxm/extension-resolution";
import type { SourceHostProviders, WorkspaceCatalog } from "@agentxm/extension-sources";
import type {
  ApprovalRecoveryMissing,
  CandidateFingerprintFailed,
  OperationJournal,
  PlanInteractionFailed,
  ResolvePlanInteraction,
} from "@agentxm/workspace-operations";
import type { CodingAgentRepository } from "@agentxm/workspace-projection";
import type {
  AcceptedCanonicalRefError,
  ConfiguredAgentOutcomesProvider,
  LockfileValidationError,
  WorkspaceMutations,
  WorkspaceSettingsReadFailure,
  WorkspaceStateReadFailure,
} from "@agentxm/workspace-state";
import type {
  FootprintRecorder,
  WorkspaceTransactionScope,
  WorkspaceTransitionAcquireFailure,
} from "@agentxm/workspace-transactions";

import { ExtensionLifecycleFailed } from "../errors.js";

// -----------------------------------------------------------------------------
// Requirements
// -----------------------------------------------------------------------------

/**
 * What an install or uninstall plan step declares at execution time: the
 * manager's own requirements, the transaction scope its closure opens, the
 * keychain an MCP connection reads, and the workspace facade and agent
 * repository its artifact observes. These travel with the step and are
 * composed once at the application's runtime boundary; nothing is captured
 * into a step's closure on the way, and no failure adapter is among them.
 */
export type InstallStepRequirements =
  | ManagerRequirements
  | RecipeRequirements
  | McpSecretStore
  | CodingAgentRepository
  | WorkspaceMutations
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
  | WorkspaceMutations;

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
 * facade and agent outcomes it reads, the journal and footprint the operation
 * records into, and the interaction that presents and confirms it.
 */
export type PrepareInstallRequirements =
  | InstallStepRequirements
  | ResolveInstallRequirements
  | ConfiguredAgentOutcomesProvider
  | FootprintRecorder
  | OperationJournal
  | ResolvePlanInteraction
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

/** Subagents the request selected. */
export interface SubagentInstallIntent {
  readonly subagentsToInstall: ReadonlyArray<ResolvedInstallRef<SubagentExtensionRef>>;
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
  WorkspaceMutations | FileSystem.FileSystem | Path.Path
>;

/** One pack graph transition and the policy that governs it. */
export interface PackInstallIntent {
  readonly packToInstall: PackRef;
  readonly versionRange: Option.Option<VersionRange>;
  readonly unattended?: boolean;
  readonly nonInteractive: boolean;
  readonly releaseAgeEvaluation?: ReleaseAgeEvaluation;
  readonly releaseAgeHoldbackBehavior?: "continue" | "preserve-or-block";
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
}

/** Materialization capabilities required by workspace transitions. */
import type { ExtensionManifest } from "@agentxm/extension-content";
import type { HookConfigurationValues } from "@agentxm/extension-model/unstable/hooks/manifest-schema";
import type * as Effect from "effect/Effect";
import type * as Option from "effect/Option";
import type { ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import type { SourceHash } from "@agentxm/extension-model/unstable/sources/source-hash";
import type {
  ExtensionTarget,
  ExtensionTargetFor,
  LockEntryByType,
  DesiredStateGraph,
} from "../../workspace-state/index.js";
import type { ObservedProjectionPlans, AgentOutputAuthority } from "../../projection/index.js";

import type { HookNativeDeclaration } from "../../agent-adapters/index.js";

export interface NativeProjectionOptions {
  /** Explicit disable/uninstall selection; absence from desired state never supplies this. */
  readonly hookWithdrawals?: ReadonlyArray<HookNativeDeclaration>;
  readonly priorAuthority?: AgentOutputAuthority;
  readonly nativeInsertionEligibleNames?: ReadonlySet<string>;
  readonly nativeInsertionEligibleAgentIds?: ReadonlySet<string>;
  readonly configuredAgents?: ReadonlyArray<string>;
  readonly desiredGraph?: DesiredStateGraph;
  /** Prospective values validated and rendered before settings are committed. */
  readonly hookConfigurations?: ReadonlyMap<string, HookConfigurationValues>;
  /**
   * Package content hashes, by hook name, that the caller computed in this
   * same boundary; used only when the package root matches exactly.
   */
  readonly preparedContentHashes?: ReadonlyMap<
    string,
    { readonly packageRoot: string; readonly contentHash: string }
  >;
  /**
   * Deep-frozen package manifests, by extension name, that the caller decoded
   * in this same boundary; a manager prepares from one in place of its own
   * read only when both its package root and its type match exactly.
   */
  readonly preparedManifests?: ReadonlyMap<
    string,
    { readonly packageRoot: string; readonly manifest: ExtensionManifest }
  >;
  /**
   * `deferred` when a later step of the same operation reconciles instruction
   * aliases once every contributor region is written.
   */
  readonly instructionAliases?: "reconcile" | "deferred";
}

export interface MaterializationConfiguration<E, R> {
  readonly getConfiguredSource?: (args: {
    readonly target: ExtensionTarget;
  }) => Effect.Effect<Option.Option<string>, E, R>;
  readonly isConfigured?: (args: {
    readonly target: ExtensionTarget;
  }) => Effect.Effect<boolean, E, R>;
}

/**
 * One owner call over a manager's projection plans: the manager observes every
 * plan as its pre-write refusal, then hands that observation to `use`.
 */
export type ObservedProjectionPlansCall<E, R> = <A, E2, R2>(
  options: NativeProjectionOptions | undefined,
  use: (observed: ObservedProjectionPlans<E, R>) => Effect.Effect<A, E2, R2>,
) => Effect.Effect<A, E | E2, R | R2>;

export interface MaterializationProjection<E, R> {
  /** Aggregate projection runs after desired state and canonical content commit. */
  readonly observedProjectionPlans?: ObservedProjectionPlansCall<E, R>;
}

interface MaterializationAcquisition<TRef extends ExtensionRef, TFacts, E, R> {
  readonly isInstalled: (args: {
    readonly target: ExtensionTarget;
  }) => Effect.Effect<boolean, E, R>;
  readonly materializeInstall: (args: {
    readonly ref: TRef;
    readonly force?: boolean;
    readonly nativeInsertionEligible?: boolean;
    readonly nativeInsertionEligiblePaths?: ReadonlySet<string>;
    /**
     * The package content hash that the calling closure's own listing computed
     * for a workspace ref's package root, with no write to that tree since; a
     * manager records it in place of hashing only when its package root is
     * exactly this root.
     */
    readonly preparedSourceHash?: { readonly root: string; readonly hash: SourceHash };
  }) => Effect.Effect<TFacts, E, R>;
  /** The transition records accepted content identity with its desired-state changes. */
  readonly acceptedResolution: (args: {
    readonly ref: TRef;
    readonly materialization: Option.Option<TFacts>;
  }) => Effect.Effect<
    Option.Option<{ readonly key: string; readonly entry: LockEntryByType[TRef["type"]] }>,
    E,
    R
  >;
}

export interface InstallMaterialization<TRef extends ExtensionRef, TFacts, E, R>
  extends
    MaterializationAcquisition<TRef, TFacts, E, R>,
    MaterializationConfiguration<E, R>,
    MaterializationProjection<E, R> {
  /** Prepare cleanup before replacement; execute it after accepting the new source. */
  readonly prepareSourceTransition?: (args: {
    readonly ref: TRef;
  }) => Effect.Effect<Effect.Effect<void, E, R>, E, R>;
  /** Kinds with active native output can withdraw it while retaining canonical content. */
  readonly materializeDeactivate?: (args: {
    readonly target: ExtensionTargetFor<TRef>;
  }) => Effect.Effect<TFacts, E, R>;
}

export interface AuthorMaterialization<TRef extends ExtensionRef, TFacts, E, R>
  extends
    MaterializationAcquisition<TRef, TFacts, E, R>,
    MaterializationConfiguration<E, R>,
    MaterializationProjection<E, R> {
  readonly listMaterializable: () => Effect.Effect<ReadonlyArray<TRef>, E, R>;
  readonly materializeDeactivate?: (args: {
    readonly target: ExtensionTargetFor<TRef>;
  }) => Effect.Effect<TFacts, E, R>;
}

export interface SynchronizeMaterialization<
  TRef extends ExtensionRef,
  TFacts,
  E,
  R,
> extends MaterializationAcquisition<TRef, TFacts, E, R> {
  /** Acquire canonical content without producing native output for a disabled extension. */
  readonly acquireCanonical: MaterializationAcquisition<TRef, TFacts, E, R>["materializeInstall"];
}

export interface UninstallMaterialization<TTarget extends ExtensionTarget, TFacts, E, R>
  extends MaterializationConfiguration<E, R>, MaterializationProjection<E, R> {
  readonly isInstalled: (args: {
    readonly target: ExtensionTarget;
  }) => Effect.Effect<boolean, E, R>;
  readonly materializeUninstall: (args: {
    readonly target: TTarget;
    /** Loss of a Pack route does not authorize native registration removal. */
    readonly nativeCleanup?: "selected" | "retain";
  }) => Effect.Effect<TFacts, E, R>;
  /** Restore output from verified retained canonical content without resolving a source. */
  readonly materializeRetained: (args: { readonly target: TTarget }) => Effect.Effect<TFacts, E, R>;
  readonly withdrawnResolutionKeys: (args: {
    readonly target: TTarget;
    readonly materialization: Option.Option<TFacts>;
  }) => Effect.Effect<ReadonlyArray<string>, E, R>;
}

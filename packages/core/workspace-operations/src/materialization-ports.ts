/** Materialization capabilities required by workspace transitions. */
import type * as Effect from "effect/Effect";
import type * as Option from "effect/Option";
import type { ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import type {
  ExtensionTarget,
  ExtensionTargetFor,
  LockEntryByType,
} from "@agentxm/workspace-state";
import type { ProjectionPlan } from "@agentxm/workspace-projection";

export interface MaterializationConfiguration<E, R> {
  readonly getConfiguredSource?: (args: {
    readonly target: ExtensionTarget;
  }) => Effect.Effect<Option.Option<string>, E, R>;
  readonly isConfigured?: (args: {
    readonly target: ExtensionTarget;
  }) => Effect.Effect<boolean, E, R>;
}

export interface MaterializationProjection<E, R> {
  /** Aggregate projection runs after desired state and canonical content commit. */
  readonly projectionPlans?: () => Effect.Effect<ReadonlyArray<ProjectionPlan<void, E, R>>, E, R>;
}

interface MaterializationAcquisition<TRef extends ExtensionRef, TFacts, E, R> {
  readonly isInstalled: (args: {
    readonly target: ExtensionTarget;
  }) => Effect.Effect<boolean, E, R>;
  readonly materializeInstall: (args: {
    readonly ref: TRef;
    readonly force?: boolean;
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
  }) => Effect.Effect<TFacts, E, R>;
  /** Restore output from verified retained canonical content without resolving a source. */
  readonly materializeRetained: (args: { readonly target: TTarget }) => Effect.Effect<TFacts, E, R>;
  readonly withdrawnResolutionKeys: (args: {
    readonly target: TTarget;
    readonly materialization: Option.Option<TFacts>;
  }) => Effect.Effect<ReadonlyArray<string>, E, R>;
}

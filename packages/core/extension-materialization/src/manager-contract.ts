/**
 * Per-extension-type materialization manager contract.
 *
 * Implemented by the seven extension-type managers and consumed by the closure
 * recipes in `extensions/operations.ts`. Requirements stay explicit in `R`: a
 * manager never captures the platform into its members, and the command
 * boundary composes them once. Materialization facts travel forward as return
 * values, so a later settings or lockfile write reads what the materialization
 * observed instead of a mutable map the layer kept alive between calls.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import type * as Option from "effect/Option";
import type * as Path from "effect/Path";
import type * as HttpClient from "effect/unstable/http/HttpClient";

import type { ExtensionManagerFailure } from "./errors.js";
import type { NativeWriteAuthority } from "@agentxm/agent-integration";
import type { ProjectionPlan } from "@agentxm/workspace-projection";
import type { ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import type {
  ExtensionTarget,
  ExtensionTargetFor,
  LockEntryByType,
} from "@agentxm/workspace-state";

/**
 * The services every manager keeps in `R`: the platform it reads and writes
 * through, the registry transport its acquisition steps use, and the authority
 * that admits a native write. Uniform across the seven managers so a recipe
 * composes one requirement set, and identical to what a projection participant
 * declares so a manager registers as one without providing anything at a leaf.
 * The transaction scope belongs to the closure recipe, not to a manager: every
 * manager member runs inside a transition the recipe opened.
 */
export type ManagerRequirements =
  FileSystem.FileSystem | Path.Path | HttpClient.HttpClient | NativeWriteAuthority;

/**
 * Machine-local effects observed during the most recent materialization.
 *
 * This data is intentionally ephemeral. It supports operation output without
 * making agent-specific paths part of the shared lockfile contract.
 */
export interface MaterializationObservation {
  readonly agents: ReadonlyArray<string>;
  readonly targets: ReadonlyArray<{
    readonly path: string;
    readonly agentIds?: ReadonlyArray<string>;
  }>;
}

/** An empty observation, for transitions that projected nothing. */
export const NO_MATERIALIZATION_OBSERVATION: MaterializationObservation = {
  agents: [],
  targets: [],
};

/**
 * What one materialization observed. Each manager extends this with the
 * content identity its own settings and lockfile writes need; the closure
 * recipes carry the value from `materializeInstall` to those writes and to the
 * step's artifact without inspecting the extension.
 */
export interface MaterializationFacts {
  readonly observation: MaterializationObservation;
}

/**
 * Per-extension-type materialization manager contract.
 *
 * `TMaterialization` is what this manager's `materializeInstall` observed and
 * its entry writes consume; `R` is the requirement set its members declare.
 */
export interface ExtensionManager<
  TRef extends ExtensionRef,
  TMaterialization extends MaterializationFacts = MaterializationFacts,
  R = ManagerRequirements,
> {
  readonly type: TRef["type"];
  readonly isInstalled: (args: {
    readonly target: ExtensionTarget;
  }) => Effect.Effect<boolean, ExtensionManagerFailure, R>;
  /** Acquire canonical content and project it, reporting what it observed. */
  readonly materializeInstall: (args: {
    readonly ref: TRef;
    /** When true, re-materialize unconditionally instead of reusing an existing canonical tree. */
    readonly force?: boolean;
  }) => Effect.Effect<TMaterialization, ExtensionManagerFailure, R>;
  /**
   * Capture cleanup for the currently accepted canonical package before a
   * replacement writes its new lock entry. The returned effect runs only
   * after the replacement resolution has been committed inside the same
   * workspace transaction.
   */
  readonly prepareSourceTransition?: (args: {
    readonly ref: TRef;
  }) => Effect.Effect<Effect.Effect<void, ExtensionManagerFailure, R>, ExtensionManagerFailure, R>;
  /**
   * What this manager's shared aggregate units projected in this invocation.
   * Aggregate units render after desired state commits — later than
   * `materializeInstall` returns — so a closure reads the observation back
   * here instead of receiving it with the materialization facts. Managers
   * whose units are singletons report their targets in the facts instead and
   * do not implement this.
   */
  readonly aggregateProjectionObservation?: Effect.Effect<
    MaterializationObservation,
    ExtensionManagerFailure,
    R
  >;
  /** Build opaque projection plans after desired state and canonical content commit. */
  readonly projectionPlans?: () => Effect.Effect<
    ReadonlyArray<ProjectionPlan<void, ExtensionManagerFailure, R>>,
    ExtensionManagerFailure,
    R
  >;
  readonly getConfiguredSource?: (args: {
    readonly target: ExtensionTarget;
  }) => Effect.Effect<Option.Option<string>, ExtensionManagerFailure, R>;
  /**
   * Observe whether desired state declares the target independently of whether
   * that declaration points at a package source.
   */
  readonly isConfigured?: (args: {
    readonly target: ExtensionTarget;
  }) => Effect.Effect<boolean, ExtensionManagerFailure, R>;
  readonly listMaterializable: () => Effect.Effect<ReadonlyArray<TRef>, ExtensionManagerFailure, R>;
  /** Remove projections and canonical content, reporting what it withdrew. */
  readonly materializeUninstall: (args: {
    readonly target: ExtensionTargetFor<TRef>;
  }) => Effect.Effect<TMaterialization, ExtensionManagerFailure, R>;
  /** Acquire canonical content without producing any native agent output. */
  readonly acquireCanonical: ExtensionManager<TRef, TMaterialization, R>["materializeInstall"];
  /** Restore projections from verified retained canonical content, without source resolution. */
  readonly materializeRetained: (args: {
    readonly target: ExtensionTargetFor<TRef>;
  }) => Effect.Effect<TMaterialization, ExtensionManagerFailure, R>;
  /** Remove active projections while retaining canonical managed content. */
  readonly materializeDeactivate: (args: {
    readonly target: ExtensionTargetFor<TRef>;
  }) => Effect.Effect<TMaterialization, ExtensionManagerFailure, R>;
  /** Verified acquisition facts; recording the resolution belongs to reconciliation. */
  readonly acceptedResolution: (args: {
    readonly ref: TRef;
    readonly materialization: Option.Option<TMaterialization>;
  }) => Effect.Effect<
    Option.Option<{ readonly key: string; readonly entry: LockEntryByType[TRef["type"]] }>,
    ExtensionManagerFailure,
    R
  >;
  /** Accepted keys associated with the withdrawal observed by this adapter. */
  readonly withdrawnResolutionKeys: (args: {
    readonly target: ExtensionTargetFor<TRef>;
    readonly materialization: Option.Option<TMaterialization>;
  }) => Effect.Effect<ReadonlyArray<string>, ExtensionManagerFailure, R>;
}

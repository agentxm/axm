/**
 * Per-extension-type lifecycle manager contract.
 *
 * Implemented by the seven extension-type managers and consumed by the
 * lifecycle orchestration in `extensions/operations.ts`. Lives beside the
 * extension-type managers, outside the workspace facade contract.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type * as Effect from "effect/Effect";
import type * as Option from "effect/Option";

import type { ExtensionManagerFailure } from "./errors.js";
import type { ProjectionPlan } from "../projection/planning.js";
import type { ExtensionRef } from "../workspace/refs/extension-ref.js";
import type {
  ExtensionTarget,
  ExtensionTargetFor,
  WorkspaceTransactionRunner,
} from "../workspace/service-interface.js";

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

/**
 * Per-extension-type lifecycle manager contract.
 *
 * All methods have `R = never` — dependencies are captured during construction.
 */
export interface ExtensionManager<TRef extends ExtensionRef> {
  readonly type: TRef["type"];
  readonly runTransaction: WorkspaceTransactionRunner;
  readonly isInstalled: (args: {
    readonly target: ExtensionTarget;
  }) => Effect.Effect<boolean, ExtensionManagerFailure, never>;
  readonly materializeInstall: (args: {
    readonly ref: TRef;
    /** When true, re-materialize unconditionally instead of reusing an existing canonical tree. */
    readonly force?: boolean;
  }) => Effect.Effect<void, ExtensionManagerFailure, never>;
  /**
   * Capture cleanup for the currently accepted canonical package before a
   * replacement writes its new lock entry. The returned effect runs only
   * after the replacement resolution has been committed inside the same
   * workspace transaction.
   */
  readonly prepareSourceTransition?: (args: {
    readonly ref: TRef;
  }) => Effect.Effect<
    Effect.Effect<void, ExtensionManagerFailure, never>,
    ExtensionManagerFailure,
    never
  >;
  readonly getLastMaterialization?: (args: {
    readonly target: ExtensionTargetFor<TRef>;
  }) => Effect.Effect<MaterializationObservation, never, never>;
  /** Build opaque projection plans after desired state and canonical content commit. */
  readonly projectionPlans?: () => Effect.Effect<
    ReadonlyArray<ProjectionPlan>,
    ExtensionManagerFailure,
    never
  >;
  readonly getLastUnmaterialization?: (args: {
    readonly target: ExtensionTargetFor<TRef>;
  }) => Effect.Effect<MaterializationObservation, never, never>;
  readonly getConfiguredSource?: (args: {
    readonly target: ExtensionTarget;
  }) => Effect.Effect<Option.Option<string>, ExtensionManagerFailure, never>;
  /**
   * Observe whether desired state declares the target independently of whether
   * that declaration points at a package source.
   */
  readonly isConfigured?: (args: {
    readonly target: ExtensionTarget;
  }) => Effect.Effect<boolean, ExtensionManagerFailure, never>;
  readonly listMaterializable: () => Effect.Effect<
    ReadonlyArray<TRef>,
    ExtensionManagerFailure,
    never
  >;
  readonly materializeUninstall: (args: {
    readonly target: ExtensionTargetFor<TRef>;
  }) => Effect.Effect<void, ExtensionManagerFailure, never>;
  /** Remove active projections while retaining canonical managed content. */
  readonly materializeDeactivate: (args: {
    readonly target: ExtensionTargetFor<TRef>;
  }) => Effect.Effect<void, ExtensionManagerFailure, never>;
  readonly upsertSettingsEntry: (args: {
    readonly ref: TRef;
    readonly versionRange: Option.Option<string>;
  }) => Effect.Effect<void, ExtensionManagerFailure, never>;
  readonly removeSettingsEntry: (args: {
    readonly target: ExtensionTargetFor<TRef>;
  }) => Effect.Effect<void, ExtensionManagerFailure, never>;
  readonly upsertLockfileEntry: (args: {
    readonly ref: TRef;
  }) => Effect.Effect<void, ExtensionManagerFailure, never>;
  readonly removeLockfileEntry: (args: {
    readonly target: ExtensionTargetFor<TRef>;
  }) => Effect.Effect<void, ExtensionManagerFailure, never>;
}

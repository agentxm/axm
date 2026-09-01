/**
 * Live workspace composition: the one seam that needs both the workspace
 * state facade and the operations-side transaction machinery. Supplies the
 * transaction capabilities to `makeWorkspaceMutations` and publishes the
 * `loadWorkspace` effect and `layer` every entry point composes.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Semaphore from "effect/Semaphore";

import {
  WorkspaceMutations,
  makeWorkspaceMutations,
  type MakeWorkspaceTransactionCapabilities,
  type WorkspaceLayerOptions,
  type WorkspaceMutationsError,
  type WorkspaceMutationsService,
  type WorkspaceTransactionRunner,
  type WorkspaceTransitionAcquirer,
} from "@agentxm/workspace-state";
import { runWorkspaceTransaction } from "./transaction.js";
import { acquireWorkspaceTransitionLock } from "./transition-lock.js";

/**
 * The live transaction capabilities: the runner claims the shared settings
 * and lockfile targets by default, and both members eliminate FileSystem and
 * Path so the facade's methods stay `R = never` for callers.
 */
export const makeWorkspaceTransactionCapabilities: MakeWorkspaceTransactionCapabilities = ({
  workspaceDir,
  settingsPath,
  lockPath,
}) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    // Transaction admission must be distinct from the facade's mutation
    // mutex: a transaction calls the same service's mutation methods while
    // it owns the outer admission permit.
    const transactionSemaphore = yield* Semaphore.make(1);
    const fsLayer = Layer.mergeAll(
      Layer.succeed(FileSystem.FileSystem, fs),
      Layer.succeed(Path.Path, path),
    );

    const runTransaction: WorkspaceTransactionRunner = (args) =>
      runWorkspaceTransaction({
        workspaceDir,
        semaphore: transactionSemaphore,
        targets: [
          ...(args.claimDefaultTargets === false ? [] : [settingsPath, lockPath]),
          ...(args.targets ?? []),
        ],
        transition: args.transition,
        validate: args.validate,
        ...(args.onRestorationStarted === undefined
          ? {}
          : { onRestorationStarted: args.onRestorationStarted }),
      }).pipe(Effect.provide(fsLayer));

    const acquireTransition: WorkspaceTransitionAcquirer = (request) =>
      acquireWorkspaceTransitionLock({
        workspaceDir,
        holder: {
          command: request.command,
          pid: process.pid,
          ...(request.candidateId === undefined ? {} : { candidateId: request.candidateId }),
        },
        ...(request.onWaiting === undefined ? {} : { onWaiting: request.onWaiting }),
      }).pipe(Effect.provide(fsLayer));

    return { runTransaction, acquireTransition };
  });

/**
 * Create workspace mutations effect.
 *
 * Loads an existing workspace from disk.
 *
 * The workspace must already be initialized. Missing or invalid settings fail
 * fast with an `AppError`.
 *
 * @param options - WorkspaceMutations layer options
 * @returns Effect yielding WorkspaceMutationsService
 */
export const loadWorkspace = (
  options: WorkspaceLayerOptions,
): Effect.Effect<
  WorkspaceMutationsService,
  WorkspaceMutationsError,
  FileSystem.FileSystem | Path.Path
> => makeWorkspaceMutations(options, makeWorkspaceTransactionCapabilities);

/**
 * Create a layer that loads workspace read model from disk.
 *
 * The workspace must already be initialized.
 *
 * @param options - WorkspaceMutations layer options
 * @returns Layer providing WorkspaceMutations
 *
 * @experimental This API is unstable and may change without notice.
 */
export const layer = (options: WorkspaceLayerOptions) =>
  Layer.effect(WorkspaceMutations, loadWorkspace(options));

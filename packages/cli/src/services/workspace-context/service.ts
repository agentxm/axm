/**
 * Workspace context service for CLI commands.
 *
 * Provides access to parsed workspace settings and lockfile.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as FileSystem from "@effect/platform/FileSystem";
import {
  type LockfileError,
  readLockfile,
  readSettings,
  type Settings,
  type SettingsError,
} from "@agentxm/core/experimental/skills";
import { getAxmDir } from "@agentxm/core/experimental/paths";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { WorkspaceNotInitializedError } from "./errors.js";
import type { WorkspaceContextService } from "./types.js";

/**
 * Effect service tag for workspace context.
 *
 * @experimental This API is unstable and may change without notice.
 */
export class WorkspaceContext extends Context.Tag("@agentxm/cli/WorkspaceContext")<
  WorkspaceContext,
  WorkspaceContextService
>() {
  /**
   * Create a layer from a custom service implementation.
   */
  static readonly layer = (service: WorkspaceContextService): Layer.Layer<WorkspaceContext> =>
    Layer.succeed(WorkspaceContext, service);
}

/**
 * Error loading workspace context.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type WorkspaceContextError =
  | WorkspaceNotInitializedError
  | Exclude<SettingsError, { _tag: "SettingsNotFoundError" }>
  | LockfileError;

/**
 * Options for creating workspace context.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface WorkspaceContextOptions {
  /** Whether to use global workspace (~/.axm) or local (.axm) */
  readonly global: boolean;
}

/**
 * Create workspace context effect.
 *
 * Loads settings and lockfile based on workspace scope:
 * - Global mode: reads only global settings (fallback to {} if not found)
 * - Local mode: merges global and local settings (local overrides global),
 *   fails with WorkspaceNotInitializedError if local settings don't exist
 *
 * @param options - Workspace context options
 * @returns Effect yielding WorkspaceContextService
 *
 * @experimental This API is unstable and may change without notice.
 */
export const make = (
  options: WorkspaceContextOptions,
): Effect.Effect<WorkspaceContextService, WorkspaceContextError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const globalDir = getAxmDir(true);
    const localDir = getAxmDir(false);
    const workspaceDir = options.global ? globalDir : localDir;

    // Global settings: optional (fallback to {})
    const globalSettings = yield* readSettings(globalDir).pipe(
      Effect.catchTag("SettingsNotFoundError", () => Effect.succeed<Settings>({})),
    );

    // Local settings: required when global=false
    let localSettings: Settings = {};
    if (!options.global) {
      localSettings = yield* readSettings(localDir).pipe(
        Effect.catchTag("SettingsNotFoundError", () =>
          Effect.fail(new WorkspaceNotInitializedError({ path: localDir })),
        ),
      );
    }

    // Merge: local overrides global
    const settings: Settings = options.global
      ? globalSettings
      : { ...globalSettings, ...localSettings };

    // Lockfile from workspace dir
    const lockfile = yield* readLockfile(workspaceDir);

    return {
      global: options.global,
      settings,
      lockfile,
      path: workspaceDir,
    };
  });

/**
 * Create a layer that loads workspace context from disk.
 *
 * @param options - Workspace context options
 * @returns Layer providing WorkspaceContext
 *
 * @experimental This API is unstable and may change without notice.
 */
export const layer = (
  options: WorkspaceContextOptions,
): Layer.Layer<WorkspaceContext, WorkspaceContextError, FileSystem.FileSystem> =>
  Layer.effect(WorkspaceContext, make(options));

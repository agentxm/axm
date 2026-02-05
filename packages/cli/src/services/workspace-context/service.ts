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
  SettingsNotFoundError,
} from "@agentxm/core/experimental/skills";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
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
export type WorkspaceContextError = SettingsError | LockfileError;

/**
 * Create a live layer that loads settings and lockfile from disk.
 *
 * @param axmDir - Path to the .axm directory
 * @returns Layer providing WorkspaceContext
 *
 * @experimental This API is unstable and may change without notice.
 */
export const makeWorkspaceContextLayer = (
  axmDir: string,
): Layer.Layer<WorkspaceContext, WorkspaceContextError, FileSystem.FileSystem> =>
  Layer.effect(
    WorkspaceContext,
    Effect.gen(function* () {
      const [settings, lockfile] = yield* Effect.all([readSettings(axmDir), readLockfile(axmDir)]);

      return {
        settings,
        lockfile,
        path: axmDir,
      };
    }),
  );

/**
 * Create a live layer that loads settings and lockfile, with optional settings fallback.
 *
 * If settings.json doesn't exist, uses empty settings. Lockfile errors still propagate.
 *
 * @param axmDir - Path to the .axm directory
 * @returns Layer providing WorkspaceContext
 *
 * @experimental This API is unstable and may change without notice.
 */
export const makeWorkspaceContextLayerOptional = (
  axmDir: string,
): Layer.Layer<
  WorkspaceContext,
  Exclude<WorkspaceContextError, SettingsNotFoundError>,
  FileSystem.FileSystem
> =>
  Layer.effect(
    WorkspaceContext,
    Effect.gen(function* () {
      const settingsResult = yield* readSettings(axmDir).pipe(Effect.either);

      let settings: Settings;
      if (settingsResult._tag === "Right") {
        settings = settingsResult.right;
      } else if (settingsResult.left._tag === "SettingsNotFoundError") {
        settings = {};
      } else {
        return yield* Effect.fail(settingsResult.left);
      }

      const lockfile = yield* readLockfile(axmDir);

      return {
        settings,
        lockfile,
        path: axmDir,
      };
    }),
  );

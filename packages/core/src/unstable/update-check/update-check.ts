/**
 * UpdateCheck service — manages cached version checks and notifications.
 *
 * Reads/writes a `~/.axm/update-check.json` cache file, determines whether
 * the check should be skipped, and produces install-method-aware notification
 * messages.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as ServiceMap from "effect/Context";
import * as semver from "semver";

import type { InstallMethodType } from "../install-method/install-method.js";
import { resolveAxmDataDir } from "../utils/index.js";

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const CACHE_FILENAME = "update-check.json";
const CACHE_TTL_MS = 60 * 60 * 1000; // 60 minutes

// -----------------------------------------------------------------------------
// Cache schema
// -----------------------------------------------------------------------------

/** Schema for the on-disk update check cache file. */
export const UpdateCheckCacheSchema = Schema.Struct({
  latestVersion: Schema.String,
  checkedAt: Schema.String,
});

/** Decoded cache shape. */
export type UpdateCheckCache = typeof UpdateCheckCacheSchema.Type;

const decodeUpdateCheckCacheFromJsonString = Schema.decodeUnknownEffect(
  Schema.fromJsonString(UpdateCheckCacheSchema),
);

// -----------------------------------------------------------------------------
// Skip-check context
// -----------------------------------------------------------------------------

/**
 * Context used to determine whether the update check should be skipped.
 * Accepts parameters rather than reading globals directly for testability.
 */
export interface SkipCheckContext {
  readonly isJsonOutput: boolean;
  readonly noUpdateCheckEnv: boolean;
  readonly isUpgradeCommand: boolean;
  readonly isNonInteractive: boolean;
  readonly isStderrTTY: boolean;
  readonly isAgentSession: boolean;
}

export type NotificationAudience = "human" | "agent";

// -----------------------------------------------------------------------------
// Service interface
// -----------------------------------------------------------------------------

export interface UpdateCheckService {
  /** Read the cached update check, returning None if missing, invalid, or stale. */
  readonly readCache: () => Effect.Effect<Option.Option<UpdateCheckCache>>;
  /** Write the cache with the given version and current timestamp. */
  readonly writeCache: (latestVersion: string) => Effect.Effect<void>;
  /** Check if an update is available based on cached data. */
  readonly isUpdateAvailable: (
    localVersion: string,
  ) => Effect.Effect<Option.Option<{ readonly current: string; readonly latest: string }>>;
  /** Determine if the update check should be skipped entirely. */
  readonly shouldSkip: (context: SkipCheckContext) => boolean;
  /** Build an install-method-aware notification message. */
  readonly notificationMessage: (
    method: InstallMethodType,
    current: string,
    latest: string,
    audience?: NotificationAudience,
  ) => string;
}

/**
 * Effect service tag for update check management.
 *
 * @experimental This API is unstable and may change without notice.
 */
export class UpdateCheck extends ServiceMap.Service<UpdateCheck, UpdateCheckService>()(
  "@agentxm/client-core/unstable/update-check/update-check/UpdateCheck",
) {}

// -----------------------------------------------------------------------------
// Pure helpers
// -----------------------------------------------------------------------------

/**
 * Determine if the update check should be skipped.
 */
export const shouldSkip = (context: SkipCheckContext): boolean =>
  context.isJsonOutput ||
  context.noUpdateCheckEnv ||
  context.isUpgradeCommand ||
  (context.isNonInteractive && !context.isAgentSession) ||
  (!context.isStderrTTY && !context.isAgentSession);

const notificationCommand = (_method: InstallMethodType): string => "axm upgrade";

/**
 * Build an install-method-aware notification message.
 */
export const notificationMessage = (
  method: InstallMethodType,
  current: string,
  latest: string,
  audience: NotificationAudience = "human",
): string => {
  const command = notificationCommand(method);

  if (audience === "agent") {
    return `AXM_UPDATE_AVAILABLE current=${current} latest=${latest} command="${command}"`;
  }

  const header = `Update available: ${current} \u2192 ${latest}`;
  return `${header}\nRun: ${command}`;
};

/**
 * Check whether the cache is stale (older than 60 minutes).
 */
export const isCacheStale = (checkedAt: string, now: Date): boolean => {
  const checkedDate = new Date(checkedAt);
  if (isNaN(checkedDate.getTime())) return true;
  return now.getTime() - checkedDate.getTime() > CACHE_TTL_MS;
};

/**
 * Compare versions to determine if an update is available.
 * Returns true when remote version is greater than local.
 */
const isNewer = (localVersion: string, latestVersion: string): boolean => {
  const local = semver.valid(localVersion);
  const remote = semver.valid(latestVersion);
  if (local === null || remote === null) return false;
  return semver.lt(local, remote);
};

// -----------------------------------------------------------------------------
// Core effects
// -----------------------------------------------------------------------------

/**
 * Read and parse the cache file, returning None if missing, invalid, or stale.
 */
export const readCacheFromPath = (cachePath: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;

    const exists = yield* fs.exists(cachePath).pipe(Effect.catch(() => Effect.succeed(false)));
    if (!exists) return Option.none<UpdateCheckCache>();

    const content = yield* fs.readFileString(cachePath).pipe(Effect.option);
    if (Option.isNone(content)) return Option.none<UpdateCheckCache>();

    const decoded = yield* decodeUpdateCheckCacheFromJsonString(content.value).pipe(Effect.option);
    if (Option.isNone(decoded)) return Option.none<UpdateCheckCache>();

    const now = yield* Effect.sync(() => new Date());
    if (isCacheStale(decoded.value.checkedAt, now)) return Option.none<UpdateCheckCache>();

    return Option.some(decoded.value);
  });

/**
 * Write the cache file with the given version and current timestamp.
 */
export const writeCacheToPath = (cachePath: string, latestVersion: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const dir = path.dirname(cachePath);
    yield* fs.makeDirectory(dir, { recursive: true }).pipe(Effect.catch(() => Effect.void));

    const now = yield* Effect.sync(() => new Date().toISOString());
    const data: UpdateCheckCache = { latestVersion, checkedAt: now };
    yield* fs
      .writeFileString(cachePath, JSON.stringify(data))
      .pipe(Effect.catch(() => Effect.void));
  });

/**
 * Check if an update is available by reading the cache and comparing versions.
 */
export const isUpdateAvailableFromPath = (cachePath: string, localVersion: string) =>
  Effect.gen(function* () {
    const cache = yield* readCacheFromPath(cachePath);
    if (Option.isNone(cache))
      return Option.none<{ readonly current: string; readonly latest: string }>();

    if (isNewer(localVersion, cache.value.latestVersion)) {
      return Option.some({ current: localVersion, latest: cache.value.latestVersion });
    }
    return Option.none<{ readonly current: string; readonly latest: string }>();
  });

// -----------------------------------------------------------------------------
// Live layer
// -----------------------------------------------------------------------------

export const UpdateCheckLive = Layer.effect(
  UpdateCheck,
  Effect.gen(function* () {
    const pathService = yield* Path.Path;
    const fs = yield* FileSystem.FileSystem;

    const dataDir = yield* resolveAxmDataDir(pathService.join);
    const cachePath = pathService.join(dataDir, CACHE_FILENAME);

    const readCache: UpdateCheckService["readCache"] = () =>
      readCacheFromPath(cachePath).pipe(Effect.provideService(FileSystem.FileSystem, fs));

    const writeCache: UpdateCheckService["writeCache"] = (latestVersion) =>
      writeCacheToPath(cachePath, latestVersion).pipe(
        Effect.provideService(FileSystem.FileSystem, fs),
        Effect.provideService(Path.Path, pathService),
      );

    const isUpdateAvailable: UpdateCheckService["isUpdateAvailable"] = (localVersion) =>
      isUpdateAvailableFromPath(cachePath, localVersion).pipe(
        Effect.provideService(FileSystem.FileSystem, fs),
      );

    return {
      readCache,
      writeCache,
      isUpdateAvailable,
      shouldSkip,
      notificationMessage,
    } satisfies UpdateCheckService;
  }),
);

// -----------------------------------------------------------------------------
// Test layer factory
// -----------------------------------------------------------------------------

/**
 * Create an UpdateCheck layer for testing with a configurable cache path.
 */
export const UpdateCheckTest = (cachePath: string) =>
  Layer.effect(
    UpdateCheck,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const pathService = yield* Path.Path;

      const readCache: UpdateCheckService["readCache"] = () =>
        readCacheFromPath(cachePath).pipe(Effect.provideService(FileSystem.FileSystem, fs));

      const writeCache: UpdateCheckService["writeCache"] = (latestVersion) =>
        writeCacheToPath(cachePath, latestVersion).pipe(
          Effect.provideService(FileSystem.FileSystem, fs),
          Effect.provideService(Path.Path, pathService),
        );

      const isUpdateAvailable: UpdateCheckService["isUpdateAvailable"] = (localVersion) =>
        isUpdateAvailableFromPath(cachePath, localVersion).pipe(
          Effect.provideService(FileSystem.FileSystem, fs),
        );

      return {
        readCache,
        writeCache,
        isUpdateAvailable,
        shouldSkip,
        notificationMessage,
      } satisfies UpdateCheckService;
    }),
  );

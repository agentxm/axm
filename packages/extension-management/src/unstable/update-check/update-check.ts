/**
 * UpdateCheck service — manages cached version checks and notifications.
 *
 * Reads/writes a platform-cache `update-check.json` file, determines whether
 * the check should be skipped, and produces notification messages.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as ServiceMap from "effect/Context";
import * as semver from "semver";

import { DateTimeUtcSchema } from "@agentxm/extension-model/unstable/date-time";
import { resolveAxmCacheRoot } from "@agentxm/registry-client";

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const CACHE_FILENAME = "update-check.json";
const CACHE_TTL = Duration.minutes(60);

// -----------------------------------------------------------------------------
// Cache schema
// -----------------------------------------------------------------------------

/** Schema for the on-disk update check cache file. */
export const UpdateCheckCacheSchema = Schema.Struct({
  latestVersion: Schema.String,
  checkedAt: DateTimeUtcSchema,
});

/** Decoded cache shape. */
export type UpdateCheckCache = typeof UpdateCheckCacheSchema.Type;

const UpdateCheckCacheJsonSchema = Schema.fromJsonString(UpdateCheckCacheSchema);

const decodeUpdateCheckCacheFromJsonString = Schema.decodeUnknownEffect(UpdateCheckCacheJsonSchema);

const encodeUpdateCheckCacheToJsonString = Schema.encodeEffect(UpdateCheckCacheJsonSchema);

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
  /** Build a notification message. */
  readonly notificationMessage: (
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
  "@agentxm/extension-management/unstable/update-check/update-check/UpdateCheck",
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

const UPGRADE_COMMAND = "axm upgrade";

/**
 * Build a notification message.
 */
export const notificationMessage = (
  current: string,
  latest: string,
  audience: NotificationAudience = "human",
): string => {
  if (audience === "agent") {
    return `AXM_UPDATE_AVAILABLE current=${current} latest=${latest} command="${UPGRADE_COMMAND}"`;
  }

  return `Update available: ${current} \u2192 ${latest}\nRun: ${UPGRADE_COMMAND}`;
};

/**
 * Check whether the cache is stale (older than 60 minutes).
 */
export const isCacheStale = (checkedAt: DateTime.Utc): Effect.Effect<boolean> =>
  DateTime.isPast(DateTime.addDuration(checkedAt, CACHE_TTL));

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

    const stale = yield* isCacheStale(decoded.value.checkedAt);
    if (stale) return Option.none<UpdateCheckCache>();

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

    const data: UpdateCheckCache = { latestVersion, checkedAt: yield* DateTime.now };
    const content = yield* encodeUpdateCheckCacheToJsonString(data).pipe(Effect.option);
    if (Option.isNone(content)) return;

    yield* fs.writeFileString(cachePath, content.value).pipe(Effect.catch(() => Effect.void));
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

    const cacheRoot = yield* resolveAxmCacheRoot();
    const cachePath = pathService.join(cacheRoot, CACHE_FILENAME);

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

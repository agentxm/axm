/**
 * UpdateCheck service — validated stable-channel caching and notifications.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import { resolveAxmCacheRoot } from "@agentxm/registry-client";
import { DateTimeUtcSchema } from "@agentxm/extension-model/unstable/date-time";
import {
  StableChannelDocumentV1Schema,
  type StableChannelDocumentV1,
} from "@agentxm/extension-model/unstable/release-channel";
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

import { writeFileAtomic } from "../utils/index.js";

const CACHE_FILENAME = "update-check.json";
const CACHE_TTL = Duration.minutes(60);

export const UPDATE_CHECK_CACHE_SCHEMA = "axm.update-check-cache/v2";

/** Schema for the on-disk validated channel cache. */
export const UpdateCheckCacheSchema = Schema.Struct({
  schema: Schema.Literal(UPDATE_CHECK_CACHE_SCHEMA),
  channel: Schema.Literal("stable"),
  document: StableChannelDocumentV1Schema,
  etag: Schema.NullOr(Schema.String),
  validatedAt: DateTimeUtcSchema,
});

export type UpdateCheckCache = typeof UpdateCheckCacheSchema.Type;

export type UpdateCheckCacheState =
  | { readonly state: "missing" }
  | { readonly state: "invalid" }
  | { readonly state: "fresh"; readonly cache: UpdateCheckCache }
  | { readonly state: "stale"; readonly cache: UpdateCheckCache };

const UpdateCheckCacheJsonSchema = Schema.fromJsonString(UpdateCheckCacheSchema);
const decodeUpdateCheckCacheFromJsonString = Schema.decodeUnknownEffect(UpdateCheckCacheJsonSchema);
const encodeUpdateCheckCacheToJsonString = Schema.encodeEffect(UpdateCheckCacheJsonSchema);

export interface SkipCheckContext {
  readonly isJsonOutput: boolean;
  readonly noUpdateCheckEnv: boolean;
  readonly isUpgradeCommand: boolean;
  readonly isNonInteractive: boolean;
  readonly isStderrTTY: boolean;
  readonly isAgentSession: boolean;
}

export type NotificationAudience = "human" | "agent";

export interface UpdateCheckService {
  readonly readCacheState: () => Effect.Effect<UpdateCheckCacheState>;
  readonly readCache: () => Effect.Effect<Option.Option<UpdateCheckCache>>;
  readonly writeCache: (
    document: StableChannelDocumentV1,
    etag: string | null,
  ) => Effect.Effect<void>;
  readonly isUpdateAvailable: (
    localVersion: string,
  ) => Effect.Effect<Option.Option<{ readonly current: string; readonly latest: string }>>;
  readonly shouldSkip: (context: SkipCheckContext) => boolean;
  readonly notificationMessage: (
    current: string,
    latest: string,
    audience?: NotificationAudience,
  ) => string;
}

export class UpdateCheck extends ServiceMap.Service<UpdateCheck, UpdateCheckService>()(
  "axm.sh/update-check/update-check/UpdateCheck",
) {}

export const shouldSkip = (context: SkipCheckContext): boolean =>
  context.isJsonOutput ||
  context.noUpdateCheckEnv ||
  context.isUpgradeCommand ||
  (context.isNonInteractive && !context.isAgentSession) ||
  (!context.isStderrTTY && !context.isAgentSession);

const UPGRADE_COMMAND = "axm upgrade";

export const notificationMessage = (
  current: string,
  latest: string,
  audience: NotificationAudience = "human",
): string => {
  if (audience === "agent") {
    return `AXM_UPDATE_AVAILABLE current=${current} latest=${latest} command="${UPGRADE_COMMAND}"`;
  }
  return `Update available: ${current} → ${latest}\nRun: ${UPGRADE_COMMAND}`;
};

export const isCacheStale = (validatedAt: DateTime.Utc): Effect.Effect<boolean> =>
  DateTime.isPast(DateTime.addDuration(validatedAt, CACHE_TTL));

const isNewer = (localVersion: string, latestVersion: string): boolean => {
  const local = semver.valid(localVersion);
  const remote = semver.valid(latestVersion);
  return local !== null && remote !== null && semver.lt(local, remote);
};

/** Read the cache without collapsing missing, invalid, stale, and fresh states. */
export const readCacheStateFromPath = (cachePath: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const exists = yield* fs.exists(cachePath).pipe(Effect.catch(() => Effect.succeed(false)));
    if (!exists) return { state: "missing" } satisfies UpdateCheckCacheState;

    const content = yield* fs.readFileString(cachePath).pipe(Effect.option);
    if (Option.isNone(content)) return { state: "invalid" } satisfies UpdateCheckCacheState;

    const decoded = yield* decodeUpdateCheckCacheFromJsonString(content.value).pipe(Effect.option);
    if (Option.isNone(decoded)) return { state: "invalid" } satisfies UpdateCheckCacheState;

    return (yield* isCacheStale(decoded.value.validatedAt))
      ? ({ state: "stale", cache: decoded.value } satisfies UpdateCheckCacheState)
      : ({ state: "fresh", cache: decoded.value } satisfies UpdateCheckCacheState);
  });

export const readCacheFromPath = (cachePath: string) =>
  Effect.map(readCacheStateFromPath(cachePath), (state) =>
    state.state === "fresh" ? Option.some(state.cache) : Option.none<UpdateCheckCache>(),
  );

/** Atomically replace the validated channel cache. */
export const writeCacheToPath = (
  cachePath: string,
  document: StableChannelDocumentV1,
  etag: string | null,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    yield* fs.makeDirectory(path.dirname(cachePath), { recursive: true }).pipe(Effect.ignore);

    const data: UpdateCheckCache = {
      schema: UPDATE_CHECK_CACHE_SCHEMA,
      channel: "stable",
      document,
      etag,
      validatedAt: yield* DateTime.now,
    };
    const encoded = yield* encodeUpdateCheckCacheToJsonString(data).pipe(Effect.option);
    if (Option.isNone(encoded)) return;
    yield* writeFileAtomic(fs, {
      targetPath: cachePath,
      content: encoded.value,
      mapError: (failure) => failure.cause,
    }).pipe(Effect.ignore);
  });

export const isUpdateAvailableFromPath = (cachePath: string, localVersion: string) =>
  Effect.gen(function* () {
    const cache = yield* readCacheFromPath(cachePath);
    if (Option.isNone(cache) || !isNewer(localVersion, cache.value.document.version)) {
      return Option.none<{ readonly current: string; readonly latest: string }>();
    }
    return Option.some({ current: localVersion, latest: cache.value.document.version });
  });

const makeService = (cachePath: string, fs: FileSystem.FileSystem, path: Path.Path) => ({
  readCacheState: () =>
    readCacheStateFromPath(cachePath).pipe(Effect.provideService(FileSystem.FileSystem, fs)),
  readCache: () =>
    readCacheFromPath(cachePath).pipe(Effect.provideService(FileSystem.FileSystem, fs)),
  writeCache: (document: StableChannelDocumentV1, etag: string | null) =>
    writeCacheToPath(cachePath, document, etag).pipe(
      Effect.provideService(FileSystem.FileSystem, fs),
      Effect.provideService(Path.Path, path),
    ),
  isUpdateAvailable: (localVersion: string) =>
    isUpdateAvailableFromPath(cachePath, localVersion).pipe(
      Effect.provideService(FileSystem.FileSystem, fs),
    ),
  shouldSkip,
  notificationMessage,
});

export const UpdateCheckLive = Layer.effect(
  UpdateCheck,
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const fs = yield* FileSystem.FileSystem;
    const cacheRoot = yield* resolveAxmCacheRoot();
    return makeService(path.join(cacheRoot, CACHE_FILENAME), fs, path);
  }),
);

export const UpdateCheckTest = (cachePath: string) =>
  Layer.effect(
    UpdateCheck,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      return makeService(cachePath, fs, path);
    }),
  );

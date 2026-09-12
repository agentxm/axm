import {
  UpdateCheckUnavailable,
  type UpdateCheckCache,
} from "@agentxm/cli-maintenance/self-update/application";
import { DateTimeUtcSchema } from "@agentxm/extension-model/unstable/date-time";
import { StableChannelDocumentV1Schema } from "@agentxm/extension-model/unstable/release-channel";
import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import type * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { writeFileAtomic } from "../../internal/atomic-write.js";

const CACHE_SCHEMA = "axm.update-check-cache/v2";
const CacheJsonSchema = Schema.fromJsonString(
  Schema.Struct({
    schema: Schema.Literal(CACHE_SCHEMA),
    channel: Schema.Literal("stable"),
    document: StableChannelDocumentV1Schema,
    etag: Schema.NullOr(Schema.String),
    validatedAt: DateTimeUtcSchema,
  }),
);
const decodeCache = Schema.decodeUnknownEffect(CacheJsonSchema);
const encodeCache = Schema.encodeEffect(CacheJsonSchema);

/** Filesystem storage reports a validated snapshot; the application decides its freshness. */
export const makeUpdateCheckCache = (
  cachePath: string,
  fs: FileSystem.FileSystem,
  path: Path.Path,
): typeof UpdateCheckCache.Service => ({
  read: () =>
    Effect.gen(function* () {
      if (!(yield* fs.exists(cachePath))) return Option.none();
      const content = yield* fs.readFileString(cachePath);
      return yield* decodeCache(content).pipe(
        Effect.option,
        Effect.map(
          Option.map(({ document, etag, validatedAt }) => ({ document, etag, validatedAt })),
        ),
      );
    }).pipe(
      Effect.mapError((cause) => new UpdateCheckUnavailable({ operation: "cache-read", cause })),
    ),
  write: (cache) =>
    Effect.gen(function* () {
      const content = yield* encodeCache({ schema: CACHE_SCHEMA, channel: "stable", ...cache });
      yield* fs.makeDirectory(path.dirname(cachePath), { recursive: true });
      yield* writeFileAtomic(fs, {
        targetPath: cachePath,
        content,
        mapError: (failure) => failure.cause,
      });
    }).pipe(
      Effect.mapError((cause) => new UpdateCheckUnavailable({ operation: "cache-write", cause })),
    ),
});

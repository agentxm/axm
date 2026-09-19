import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import type { CachedLatestRelease } from "../domain/index.js";

/** Optional update information is unavailable; it must not fail an explicit command. */
export class UpdateCheckUnavailable extends Schema.TaggedError<UpdateCheckUnavailable>()(
  "UpdateCheckUnavailable",
  {
    operation: Schema.Literals([
      "cache-read",
      "cache-write",
      "latest-release-query",
      "latest-release-decode",
    ]),
    cause: Schema.optional(Schema.Unknown),
  },
) {}

export class UpdateCheckCache extends Context.Service<
  UpdateCheckCache,
  {
    readonly read: () => Effect.Effect<Option.Option<CachedLatestRelease>, UpdateCheckUnavailable>;
    readonly write: (cache: CachedLatestRelease) => Effect.Effect<void, UpdateCheckUnavailable>;
  }
>()("@agentxm/cli-maintenance/self-update/UpdateCheckCache") {}

/** The release host reports the current stable version from its latest-release redirect. */
export class LatestReleaseCheck extends Context.Service<
  LatestReleaseCheck,
  {
    readonly check: () => Effect.Effect<string, UpdateCheckUnavailable>;
  }
>()("@agentxm/cli-maintenance/self-update/LatestReleaseCheck") {}

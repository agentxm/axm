import type { StableChannelDocumentV1 } from "@agentxm/extension-model/unstable/release-channel";
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import type { CachedStableChannel } from "../domain/index.js";

/** Optional update information is unavailable; it must not fail an explicit command. */
export class UpdateCheckUnavailable extends Schema.TaggedError<UpdateCheckUnavailable>()(
  "UpdateCheckUnavailable",
  {
    operation: Schema.Literals(["cache-read", "cache-write", "channel-query", "channel-decode"]),
    cause: Schema.optional(Schema.Unknown),
  },
) {}

export class UpdateCheckCache extends Context.Service<
  UpdateCheckCache,
  {
    readonly read: () => Effect.Effect<Option.Option<CachedStableChannel>, UpdateCheckUnavailable>;
    readonly write: (cache: CachedStableChannel) => Effect.Effect<void, UpdateCheckUnavailable>;
  }
>()("@agentxm/cli-maintenance/self-update/UpdateCheckCache") {}

export type StableChannelCheckResult =
  | { readonly _tag: "NotModified" }
  | {
      readonly _tag: "Modified";
      readonly document: StableChannelDocumentV1;
      readonly etag: string | null;
    };

/** The release authority reports a document or confirms the caller's validator. */
export class StableChannelCheck extends Context.Service<
  StableChannelCheck,
  {
    readonly check: (
      etag: string | null,
    ) => Effect.Effect<StableChannelCheckResult, UpdateCheckUnavailable>;
  }
>()("@agentxm/cli-maintenance/self-update/StableChannelCheck") {}

import type { StableChannelDocumentV1 } from "@agentxm/extension-model/unstable/release-channel";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import {
  availableStartupUpdate,
  isChannelCacheStale,
  shouldSkipStartupCheck,
  type AvailableUpdate,
  type CachedStableChannel,
  type StartupCheckContext,
} from "../domain/index.js";
import { StableChannelCheck, UpdateCheckCache } from "./update-cache.js";

const REFRESH_TIMEOUT = "3 seconds";

/** Explicit upgrades may remember discovery, but cache failure cannot change their outcome. */
export const rememberStableChannel = (document: StableChannelDocumentV1, etag: string | null) =>
  Effect.gen(function* () {
    const cache = yield* UpdateCheckCache;
    yield* cache.write({ document, etag, validatedAt: yield* DateTime.now });
  }).pipe(Effect.catchTag("UpdateCheckUnavailable", () => Effect.void));

/** Revalidation preserves the old snapshot unless the authority confirms a valid replacement. */
export const refreshStartupUpdate = (snapshot: Option.Option<CachedStableChannel>) =>
  Effect.gen(function* () {
    const channel = yield* StableChannelCheck;
    const cached = Option.getOrNull(snapshot);
    const result = yield* channel.check(cached?.etag ?? null);
    if (result._tag === "Modified") {
      yield* rememberStableChannel(result.document, result.etag);
    } else if (cached !== null && cached.etag !== null) {
      yield* rememberStableChannel(cached.document, cached.etag);
    }
  }).pipe(
    Effect.timeout(REFRESH_TIMEOUT),
    Effect.catch(() => Effect.void),
  );

export interface StartupUpdateCheckOptions {
  readonly localVersion: string;
  readonly context: StartupCheckContext;
}

export type StartupUpdateCheckOutcome =
  | { readonly _tag: "Skipped" }
  | {
      readonly _tag: "Checked";
      readonly notification: Option.Option<AvailableUpdate>;
      readonly refreshing: boolean;
    };

/** The invocation's scope owns optional refresh work and cancels it when the command exits. */
export const checkStartupUpdate = Effect.fn("StartupUpdateCheck.run")(function* (
  options: StartupUpdateCheckOptions,
) {
  if (shouldSkipStartupCheck(options.context)) {
    return { _tag: "Skipped" } satisfies StartupUpdateCheckOutcome;
  }

  const cache = yield* UpdateCheckCache;
  const snapshot = yield* cache
    .read()
    .pipe(
      Effect.catchTag("UpdateCheckUnavailable", () =>
        Effect.succeed(Option.none<CachedStableChannel>()),
      ),
    );
  const now = yield* DateTime.now;
  const notification = Option.flatMap(snapshot, (value) =>
    availableStartupUpdate(options.localVersion, value, now),
  );
  const refreshing =
    Option.isNone(snapshot) || isChannelCacheStale(snapshot.value.validatedAt, now);
  if (refreshing) yield* Effect.forkScoped(refreshStartupUpdate(snapshot));

  return { _tag: "Checked", notification, refreshing } satisfies StartupUpdateCheckOutcome;
});

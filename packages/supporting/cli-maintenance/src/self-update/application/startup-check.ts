import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import {
  availableStartupUpdate,
  isReleaseCacheStale,
  shouldSkipStartupCheck,
  type AvailableUpdate,
  type CachedLatestRelease,
  type StartupCheckContext,
} from "../domain/index.js";
import { LatestReleaseCheck, UpdateCheckCache } from "./update-cache.js";

const REFRESH_TIMEOUT = "3 seconds";

/** Explicit upgrades may remember discovery, but cache failure cannot change their outcome. */
export const rememberLatestRelease = (version: string) =>
  Effect.gen(function* () {
    const cache = yield* UpdateCheckCache;
    yield* cache.write({ version, validatedAt: yield* DateTime.now });
  }).pipe(Effect.catchTag("UpdateCheckUnavailable", () => Effect.void));

/** Refresh preserves the old snapshot unless discovery confirms a valid replacement. */
export const refreshStartupUpdate = (_snapshot: Option.Option<CachedLatestRelease>) =>
  Effect.gen(function* () {
    const latest = yield* LatestReleaseCheck;
    yield* rememberLatestRelease(yield* latest.check());
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
        Effect.succeed(Option.none<CachedLatestRelease>()),
      ),
    );
  const now = yield* DateTime.now;
  const notification = Option.flatMap(snapshot, (value) =>
    availableStartupUpdate(options.localVersion, value, now),
  );
  const refreshing =
    Option.isNone(snapshot) || isReleaseCacheStale(snapshot.value.validatedAt, now);
  if (refreshing) yield* Effect.forkScoped(refreshStartupUpdate(snapshot));

  return { _tag: "Checked", notification, refreshing } satisfies StartupUpdateCheckOutcome;
});

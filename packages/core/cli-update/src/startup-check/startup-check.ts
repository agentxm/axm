/**
 * The startup update check: decide whether this invocation checks at all,
 * report the notification a fresh cache justifies, and revalidate the
 * promoted stable channel in the background when the cache is stale.
 *
 * The application composes this around every command and owns the argv the
 * skip context is derived from and the surface the notification is printed
 * on; the check itself — suppression, cache reading, revalidation — is the
 * capability.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as HttpClient from "effect/unstable/http/HttpClient";

import {
  STABLE_CHANNEL_URL,
  decodeStableChannelDocument,
} from "@agentxm/extension-model/unstable/release-channel";

import {
  UpdateCheck,
  type NotificationAudience,
  type SkipCheckContext,
} from "../update-check/update-check.js";

const REFRESH_TIMEOUT = "3 seconds";

const noUpdateCheckConfig = Config.option(Config.String("AXM_NO_UPDATE_CHECK"));

/** Whether `AXM_NO_UPDATE_CHECK=1` suppresses the check for this invocation. */
export const noUpdateCheckEnvironment: Effect.Effect<boolean> = Effect.map(
  // eslint-disable-next-line no-restricted-syntax -- Optional string decoding is total, so failure would mean the Config provider violated its contract.
  Effect.orDie(noUpdateCheckConfig),
  (value) => Option.getOrUndefined(value) === "1",
);

/**
 * Revalidate the promoted stable channel and atomically replace the cache.
 * Every failure — network, decode, write, or the bounded timeout — leaves the
 * cache as it was: a background refresh never affects the command that
 * triggered it.
 */
export const refreshCache = (): Effect.Effect<void, never, UpdateCheck | HttpClient.HttpClient> =>
  Effect.gen(function* () {
    const httpClient = yield* HttpClient.HttpClient;
    const updateCheck = yield* UpdateCheck;
    const state = yield* updateCheck.readCacheState();
    const cached = state.state === "fresh" || state.state === "stale" ? state.cache : null;
    const response = yield* httpClient.get(STABLE_CHANNEL_URL, {
      headers: {
        Accept: "application/json",
        "User-Agent": "axm-cli",
        ...(cached?.etag === null || cached?.etag === undefined
          ? {}
          : { "If-None-Match": cached.etag }),
      },
    });

    if (response.status === 304 && cached !== null) {
      yield* updateCheck.writeCache(cached.document, cached.etag);
      return;
    }
    if (response.status !== 200) return;
    const document = yield* response.json.pipe(Effect.flatMap(decodeStableChannelDocument));
    yield* updateCheck.writeCache(
      document,
      response.headers["etag"] ?? response.headers["ETag"] ?? null,
    );
  }).pipe(
    Effect.timeout(REFRESH_TIMEOUT),
    Effect.catch(() => Effect.void),
    Effect.catchCause(() => Effect.void),
  );

/** What the invocation observed about the runtime it is starting in. */
export interface StartupUpdateCheckOptions {
  /** The version the running executable reports. */
  readonly localVersion: string;
  /**
   * Everything except `noUpdateCheckEnv`, which the capability reads from
   * configuration unless the caller states it.
   */
  readonly context: Omit<SkipCheckContext, "noUpdateCheckEnv"> & {
    readonly noUpdateCheckEnv?: boolean | undefined;
  };
}

/** The notice a fresh cache justifies, already worded for its audience. */
export interface UpdateNotification {
  readonly current: string;
  readonly latest: string;
  readonly audience: NotificationAudience;
  readonly message: string;
}

/**
 * What the startup check settled: suppressed outright, or checked — with the
 * notification the cache justified, if any.
 */
export type StartupUpdateCheckOutcome =
  | { readonly _tag: "Skipped" }
  | {
      readonly _tag: "Checked";
      readonly notification: Option.Option<UpdateNotification>;
      readonly refreshing: boolean;
    };

/**
 * Run the startup check. Reads the cache, resolves the notification a fresh
 * cache justifies, and forks a detached revalidation when the cache is not
 * fresh. Never fails: a startup check must not change the outcome of the
 * command it precedes.
 */
export const run: (
  options: StartupUpdateCheckOptions,
) => Effect.Effect<StartupUpdateCheckOutcome, never, UpdateCheck | HttpClient.HttpClient> =
  Effect.fn("StartupUpdateCheck.run")(function* (options: StartupUpdateCheckOptions) {
    const updateCheck = yield* UpdateCheck;
    const context: SkipCheckContext = {
      ...options.context,
      noUpdateCheckEnv: options.context.noUpdateCheckEnv ?? (yield* noUpdateCheckEnvironment),
    };
    if (updateCheck.shouldSkip(context)) return { _tag: "Skipped" };

    const cacheState = yield* updateCheck.readCacheState();
    const notification = yield* Effect.gen(function* () {
      if (cacheState.state !== "fresh") return Option.none<UpdateNotification>();
      const available = yield* updateCheck.isUpdateAvailable(options.localVersion);
      if (Option.isNone(available)) return Option.none<UpdateNotification>();
      const audience: NotificationAudience = context.isAgentSession ? "agent" : "human";
      return Option.some({
        current: available.value.current,
        latest: available.value.latest,
        audience,
        message: updateCheck.notificationMessage(
          available.value.current,
          available.value.latest,
          audience,
        ),
      });
    });

    const refreshing = cacheState.state !== "fresh";
    if (refreshing) yield* Effect.forkDetach(refreshCache());

    return { _tag: "Checked", notification, refreshing };
  });

/** The application API for the startup update check. */
export const StartupUpdateCheck = { run } as const;

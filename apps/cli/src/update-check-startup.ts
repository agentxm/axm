/**
 * Update check integration for CLI startup.
 *
 * Runs early in the CLI lifecycle to:
 * 1. Read cached version info and queue a notification if an update is available
 * 2. Spawn a detached fiber to refresh the cache if stale or missing
 * 3. Print the notification before the command output
 *
 * The entire check is skipped under conditions defined by `UpdateCheck.shouldSkip()`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as HttpClient from "effect/unstable/http/HttpClient";

import {
  STABLE_CHANNEL_URL,
  decodeStableChannelDocument,
} from "@agentxm/extension-model/unstable/release-channel";
import { Screen, calloutDoc } from "./screen/index.js";
import { UpdateCheck } from "./update-check/update-check.js";
import { isAgent } from "./interaction.js";

// -----------------------------------------------------------------------------
// Skip detection from argv
// -----------------------------------------------------------------------------

/**
 * Detect whether the command being run is `axm upgrade` from raw argv.
 */
export const isUpgradeCommand = (args: ReadonlyArray<string>): boolean => {
  const terminatorIndex = args.indexOf("--");
  const commandTokens = args.slice(0, terminatorIndex === -1 ? args.length : terminatorIndex);
  return commandTokens.includes("upgrade");
};

/**
 * Detect non-interactive mode from raw argv and environment.
 */
export const resolveNonInteractiveFromArgv = (args: ReadonlyArray<string>): boolean =>
  args.includes("--non-interactive") ||
  // eslint-disable-next-line no-restricted-properties -- Centralized env var access for CI detection
  process.env["CI"] === "true" ||
  process.stdin.isTTY !== true;

// -----------------------------------------------------------------------------
// Build skip context from runtime signals
// -----------------------------------------------------------------------------

export interface UpdateCheckContextInputs {
  readonly args: ReadonlyArray<string>;
  readonly isNonInteractive: boolean;
  readonly isJsonOutput: boolean;
  /** Stderr TTY detection captured by the screen boundary. */
  readonly isStderrTTY?: boolean | undefined;
  /** Override AXM_NO_UPDATE_CHECK detection for testability. */
  readonly noUpdateCheckEnv?: boolean | undefined;
  /** Override agent-session detection for testability. Defaults to `isAgent(process.env)`. */
  readonly isAgentSession?: boolean | undefined;
}

export const buildSkipContext = (inputs: UpdateCheckContextInputs) => ({
  isJsonOutput: inputs.isJsonOutput,
  noUpdateCheckEnv:
    inputs.noUpdateCheckEnv ??
    // eslint-disable-next-line no-restricted-properties -- Centralized env var access for update check
    process.env["AXM_NO_UPDATE_CHECK"] === "1",
  isUpgradeCommand: isUpgradeCommand(inputs.args),
  isNonInteractive: inputs.isNonInteractive,
  isStderrTTY: inputs.isStderrTTY ?? false,
  // eslint-disable-next-line no-restricted-properties -- Centralized env var access for agent-session detection
  isAgentSession: inputs.isAgentSession ?? isAgent(process.env),
});

// -----------------------------------------------------------------------------
// Background cache refresh fiber
// -----------------------------------------------------------------------------

const REFRESH_TIMEOUT = "3 seconds";

/**
 * Revalidate the stable channel and atomically replace the cache.
 * Silently ignores all errors (network, parse, write).
 */
export const refreshCache = () =>
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

// -----------------------------------------------------------------------------
// Notification printer
// -----------------------------------------------------------------------------

/**
 * Print the update notification to stderr.
 */
export type NotificationPrinter = (message: string) => Effect.Effect<void>;

const UPDATE_AVAILABLE_PREFIX = "Update available: ";
const UPDATE_AVAILABLE_TITLE = "Update Available";

const toHumanUpdateNote = (
  message: string,
): { readonly message: string; readonly title: string } => {
  const [firstLine, ...rest] = message.split("\n");
  const headline = firstLine?.startsWith(UPDATE_AVAILABLE_PREFIX)
    ? firstLine.slice(UPDATE_AVAILABLE_PREFIX.length)
    : (firstLine ?? message);
  const body = rest.length > 0 ? [headline, ...rest].join("\n") : headline;

  return {
    message: body,
    title: UPDATE_AVAILABLE_TITLE,
  };
};

// -----------------------------------------------------------------------------
// Core integration effect
// -----------------------------------------------------------------------------

/**
 * Wrap a command program with the update check lifecycle.
 *
 * 1. Before: Read cache, queue notification if update available, spawn refresh fiber if stale
 * 2. Print notification if queued
 * 3. Run the command program
 *
 * The notification printer is injectable for testability.
 */
export const withUpdateCheck = <A, E, R>(
  program: Effect.Effect<A, E, R>,
  options: {
    readonly localVersion: string;
    readonly inputs: UpdateCheckContextInputs;
    readonly printNotification?: NotificationPrinter | undefined;
  },
) =>
  Effect.gen(function* () {
    const updateCheck = yield* UpdateCheck;
    const skipContext = buildSkipContext(options.inputs);
    const screen = yield* Screen;
    const printer =
      options.printNotification ??
      (skipContext.isAgentSession
        ? (message: string) => screen.note([{ _tag: "paragraph", text: message }])
        : (message: string) => {
            const note = toHumanUpdateNote(message);
            return screen.note(calloutDoc(note.message, note.title));
          });

    if (updateCheck.shouldSkip(skipContext)) {
      return yield* program;
    }

    // Phase 1: Read cache and resolve notification
    const cacheState = yield* updateCheck.readCacheState();
    const cache = cacheState.state === "fresh" ? Option.some(cacheState.cache) : Option.none();
    const notification = yield* Effect.gen(function* () {
      if (Option.isNone(cache)) return Option.none<string>();
      const updateAvailable = yield* updateCheck.isUpdateAvailable(options.localVersion);
      if (Option.isNone(updateAvailable)) return Option.none<string>();
      return Option.some(
        updateCheck.notificationMessage(
          updateAvailable.value.current,
          updateAvailable.value.latest,
          skipContext.isAgentSession ? "agent" : "human",
        ),
      );
    });

    // Phase 2: Spawn detached refresh fiber if cache is missing or stale
    const needsRefresh = cacheState.state !== "fresh";
    if (needsRefresh) {
      yield* Effect.forkDetach(refreshCache());
    }

    // Phase 3: Print notification before command output
    if (Option.isSome(notification)) {
      yield* printer(notification.value);
    }

    return yield* program;
  });

import type { StableChannelDocumentV1 } from "@agentxm/extension-model/unstable/release-channel";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Option from "effect/Option";
import { classifyVersionRelation } from "./policy.js";

export interface CachedStableChannel {
  readonly document: StableChannelDocumentV1;
  readonly etag: string | null;
  readonly validatedAt: DateTime.Utc;
}

export interface StartupCheckContext {
  readonly isJsonOutput: boolean;
  readonly noUpdateCheckEnv: boolean;
  readonly isUpgradeCommand: boolean;
  readonly isNonInteractive: boolean;
  readonly isStderrTTY: boolean;
  readonly isAgentSession: boolean;
}

/** An informational check never competes with structured output or an explicit upgrade. */
export const shouldSkipStartupCheck = (context: StartupCheckContext): boolean =>
  context.isJsonOutput ||
  context.noUpdateCheckEnv ||
  context.isUpgradeCommand ||
  (context.isNonInteractive && !context.isAgentSession) ||
  (!context.isStderrTTY && !context.isAgentSession);

const CACHE_TTL = Duration.minutes(60);

export const isChannelCacheStale = (validatedAt: DateTime.Utc, now: DateTime.Utc): boolean =>
  DateTime.isLessThan(DateTime.addDuration(validatedAt, CACHE_TTL), now);

export interface AvailableUpdate {
  readonly current: string;
  readonly latest: string;
}

/** Notification eligibility depends on one validated snapshot and one observed time. */
export const availableStartupUpdate = (
  localVersion: string,
  cache: CachedStableChannel,
  now: DateTime.Utc,
): Option.Option<AvailableUpdate> =>
  !isChannelCacheStale(cache.validatedAt, now) &&
  classifyVersionRelation(localVersion, cache.document.version).versionRelation ===
    "upgrade-available"
    ? Option.some({ current: localVersion, latest: cache.document.version })
    : Option.none();

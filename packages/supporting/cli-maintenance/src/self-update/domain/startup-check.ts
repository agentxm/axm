import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Option from "effect/Option";
import { classifyVersionRelation } from "./policy.js";

export interface CachedLatestRelease {
  readonly version: string;
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

export const isReleaseCacheStale = (validatedAt: DateTime.Utc, now: DateTime.Utc): boolean =>
  DateTime.isLessThan(DateTime.addDuration(validatedAt, CACHE_TTL), now);

export interface AvailableUpdate {
  readonly current: string;
  readonly latest: string;
}

/** Notification eligibility depends on one validated snapshot and one observed time. */
export const availableStartupUpdate = (
  localVersion: string,
  cache: CachedLatestRelease,
  now: DateTime.Utc,
): Option.Option<AvailableUpdate> =>
  !isReleaseCacheStale(cache.validatedAt, now) &&
  classifyVersionRelation(localVersion, cache.version).versionRelation === "upgrade-available"
    ? Option.some({ current: localVersion, latest: cache.version })
    : Option.none();

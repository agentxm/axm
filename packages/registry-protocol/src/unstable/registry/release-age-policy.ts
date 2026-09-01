import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import {
  matchesReleaseAgeExcludePattern,
  type ReleaseAgeExcludePattern,
} from "@agentxm/extension-model/unstable/extensions/fqn-pattern";
import type { ExtensionFqnParts } from "@agentxm/extension-model/unstable/extensions/common";
import type { VersionEntry } from "./schema.js";

export interface ScopedReleaseAgeExcludePattern {
  readonly pattern: ReleaseAgeExcludePattern;
  readonly scope: "project" | "user";
}

export interface ReleaseAgeEvaluation {
  readonly minimumReleaseAge: Duration.Duration;
  readonly evaluatedAt: DateTime.Utc;
  readonly mode: "enforce" | "ignore";
  readonly exclude?: ReadonlyArray<ScopedReleaseAgeExcludePattern>;
  readonly grantedExemption?: ReleaseAgeExemption;
}

export type ReleaseAgeExemption =
  | {
      readonly bypassCause: "exclude";
      readonly exemptionScope: "project" | "user";
    }
  | {
      readonly bypassCause: "ignore-flag";
    };

export const releaseAgeExemptionForIdentity = (
  evaluation: ReleaseAgeEvaluation,
  identity: ExtensionFqnParts,
): ReleaseAgeExemption | undefined => {
  if (evaluation.grantedExemption !== undefined) return evaluation.grantedExemption;
  const excluded = evaluation.exclude?.find(({ pattern }) =>
    matchesReleaseAgeExcludePattern(pattern, identity),
  );
  if (excluded !== undefined) {
    return { bypassCause: "exclude", exemptionScope: excluded.scope };
  }
  return evaluation.mode === "ignore" ? { bypassCause: "ignore-flag" } : undefined;
};

export interface ReleaseAgeEvidence {
  readonly version: string;
  readonly publishedAt: string;
  readonly eligibleAt: string;
  readonly minimumReleaseAgeSeconds: number;
}

export interface ReleaseAgeRecordBase {
  readonly reason: "minimum-release-age";
  readonly target: string;
  readonly dependencyPath: ReadonlyArray<string>;
  readonly requestedRange?: string;
  readonly currentVersion?: string;
  readonly selectedVersion?: string;
  readonly candidateVersion: string;
  readonly publishedAt: string;
  readonly eligibleAt: string;
  readonly minimumReleaseAgeSeconds: number;
}

export type ReleaseAgeHoldbackRecord = ReleaseAgeRecordBase;

export type ReleaseAgeBypassRecord = ReleaseAgeRecordBase &
  (
    | {
        readonly bypassCause: "exclude";
        readonly exemptionScope: "project" | "user";
      }
    | {
        readonly bypassCause: "ignore-flag";
      }
  );

export type ReleaseAgeRecord = ReleaseAgeHoldbackRecord | ReleaseAgeBypassRecord;

export interface ReleaseAgeOperationEvidence {
  readonly evaluatedAt: string;
  readonly holdbacks: ReadonlyArray<ReleaseAgeHoldbackRecord>;
  readonly bypasses: ReadonlyArray<ReleaseAgeBypassRecord>;
}

const releaseAgeRecordKey = (record: ReleaseAgeRecord): string =>
  [
    record.target,
    ...record.dependencyPath,
    record.candidateVersion,
    record.selectedVersion ?? "",
    record.currentVersion ?? "",
    record.requestedRange ?? "",
    "bypassCause" in record ? record.bypassCause : "",
    "exemptionScope" in record ? record.exemptionScope : "",
  ].join("\u0000");

/** Deduplicate and order operation evidence independently from concurrent resolution order. */
export const normalizeReleaseAgeRecords = <Record extends ReleaseAgeRecord>(
  records: ReadonlyArray<Record>,
): ReadonlyArray<Record> => {
  const byKey = new Map<string, Record>();
  for (const record of records) {
    byKey.set(releaseAgeRecordKey(record), record);
  }
  return [...byKey.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, record]) => record);
};

export const DEFAULT_MINIMUM_RELEASE_AGE = "24h";
export const DEFAULT_MINIMUM_RELEASE_AGE_DURATION = Duration.hours(24);

/**
 * Documented exception: hand-rolled parser for the compact duration grammar
 * (`24h`, `30d`, `500ms`).
 *
 * Effect v4 has no `Duration.decode`; the closest constructors are
 * `Duration.fromInput` / `Duration.fromInputUnsafe`, and the `Duration.Input`
 * string form only accepts space-separated long-unit strings ("30 days"), so
 * the compact grammar is not expressible upstream. `durationPattern` and
 * `parseMinimumReleaseAge` therefore stay as a thin syntax adapter over the
 * `Duration` constructors (`Duration.millis` / `seconds` / `minutes` /
 * `hours` / `days`).
 *
 * Removal condition: upstream `Duration` accepting the compact unit grammar.
 */
const durationPattern = /^(\d+)(ms|s|m|h|d)$/;

export const parseMinimumReleaseAge = (value: string): Option.Option<Duration.Duration> => {
  const trimmed = value.trim();
  const match = durationPattern.exec(trimmed);
  if (match === null) return Option.none();

  const amountText = match[1];
  const unit = match[2];
  if (amountText === undefined || unit === undefined) return Option.none();

  const amount = Number(amountText);
  if (!Number.isSafeInteger(amount)) return Option.none();

  switch (unit) {
    case "ms":
      return Option.some(Duration.millis(amount));
    case "s":
      return Option.some(Duration.seconds(amount));
    case "m":
      return Option.some(Duration.minutes(amount));
    case "h":
      return Option.some(Duration.hours(amount));
    case "d":
      return Option.some(Duration.days(amount));
  }

  // Unreachable at runtime, but `unit` is typed `string` (a regex capture),
  // so the switch is not statically exhaustive and the compiler (TS2366)
  // requires this ending return.
  return Option.none();
};

/**
 * Render a release-age window in the compact grammar the setting accepts, so
 * output names the policy in the same units the reader would configure.
 *
 * Days are used only from two days up: the default window is written `24h`,
 * and reporting it as `1d` would not match the setting the reader would edit.
 * Falls back to whole seconds when the window is not a clean larger unit.
 */
export const formatMinimumReleaseAgeSeconds = (seconds: number): string => {
  const whole = Math.max(0, Math.round(seconds));
  if (whole === 0) return "0s";
  if (whole % 86_400 === 0 && whole >= 172_800) return `${whole / 86_400}d`;
  if (whole % 3_600 === 0) return `${whole / 3_600}h`;
  if (whole % 60 === 0) return `${whole / 60}m`;
  return `${whole}s`;
};

export const isVersionEntryMature = (
  entry: VersionEntry,
  minimumAge: Duration.Duration,
): Effect.Effect<boolean> =>
  Duration.isLessThanOrEqualTo(minimumAge, Duration.zero)
    ? Effect.succeed(true)
    : DateTime.now.pipe(
        Effect.map((now) =>
          // Inclusive at the boundary: a release published exactly `minimumAge`
          // ago is mature, matching the original `now - published >= minimumAge`.
          DateTime.isLessThanOrEqualTo(DateTime.addDuration(entry.published, minimumAge), now),
        ),
      );

export const isVersionEntryEligibleAt = (
  entry: VersionEntry,
  evaluation: ReleaseAgeEvaluation,
): boolean =>
  Duration.isLessThanOrEqualTo(evaluation.minimumReleaseAge, Duration.zero) ||
  DateTime.isLessThanOrEqualTo(
    DateTime.addDuration(entry.published, evaluation.minimumReleaseAge),
    evaluation.evaluatedAt,
  );

export const releaseAgeEvidence = (
  entry: VersionEntry,
  evaluation: ReleaseAgeEvaluation,
): ReleaseAgeEvidence => ({
  version: entry.version,
  publishedAt: DateTime.formatIso(entry.published),
  eligibleAt: DateTime.formatIso(
    DateTime.addDuration(entry.published, evaluation.minimumReleaseAge),
  ),
  minimumReleaseAgeSeconds: Math.max(0, Duration.toMillis(evaluation.minimumReleaseAge) / 1_000),
});

export const filterMatureVersions = (
  versions: ReadonlyArray<VersionEntry>,
  minimumAge: Duration.Duration,
): Effect.Effect<ReadonlyArray<VersionEntry>> =>
  Effect.filter(versions, (entry) => isVersionEntryMature(entry, minimumAge));

export const releaseAgeHoldbackWarning = (args: {
  readonly fqn: string;
  readonly selectedVersion: string;
  readonly heldVersion: string;
  readonly minimumReleaseAge: string;
}): string =>
  `${args.fqn} held at ${args.selectedVersion} — ${args.heldVersion} has not reached the ${args.minimumReleaseAge} minimum release age`;

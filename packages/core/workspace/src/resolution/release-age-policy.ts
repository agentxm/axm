import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { matchesReleaseAgeExcludePattern } from "@agentxm/extension-model/unstable/extensions/fqn-pattern";
import type { ExtensionFqnParts } from "@agentxm/extension-model/unstable/extensions/common";
import type {
  ReleaseAgeEvaluation,
  ReleaseAgeEvidence,
  ReleaseAgeExemption,
} from "@agentxm/extension-model/unstable/extensions/release-age";
import type { VersionEntry } from "@agentxm/registry-protocol/unstable/registry/schema";

import { ExtensionResolutionFailed } from "./errors.js";

/**
 * What an operation does when the minimum release age holds back every
 * release its constraint admits. `preserve-or-block` keeps a complete, usable
 * accepted resolution unchanged or refuses the unit before any write;
 * `continue` leaves the unit unchanged and lets a sweep advance its other
 * units. Each operation declares its policy once, where it classifies its
 * intent, and the shared realization step applies it.
 */
export type HeldReleasePolicy = "preserve-or-block" | "continue";

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

/** Who a release-age record is about, and the ranges and versions the operation read. */
export interface ReleaseAgeRecordSubject {
  readonly target: string;
  /** The route to the target, root first; the target alone when omitted. */
  readonly dependencyPath?: ReadonlyArray<string>;
  readonly requestedRange?: string | undefined;
  readonly currentVersion?: string | undefined;
}

/** The one constructor every minimum-release-age record comes from. */
export const releaseAgeRecord = (
  subject: ReleaseAgeRecordSubject,
  evidence: ReleaseAgeEvidence,
  selectedVersion?: string,
): ReleaseAgeHoldbackRecord => ({
  reason: "minimum-release-age",
  target: subject.target,
  dependencyPath: subject.dependencyPath ?? [subject.target],
  ...(subject.requestedRange === undefined ? {} : { requestedRange: subject.requestedRange }),
  ...(subject.currentVersion === undefined ? {} : { currentVersion: subject.currentVersion }),
  ...(selectedVersion === undefined ? {} : { selectedVersion }),
  candidateVersion: evidence.version,
  publishedAt: evidence.publishedAt,
  eligibleAt: evidence.eligibleAt,
  minimumReleaseAgeSeconds: evidence.minimumReleaseAgeSeconds,
});

/** A release selection the minimum release age evaluated: taken normally, or taken early. */
export type ReleaseAgeSelection =
  | { readonly kind: "selected"; readonly newerHeld?: ReleaseAgeEvidence | undefined }
  | {
      readonly kind: "exempted";
      readonly bypassed: ReleaseAgeEvidence;
      readonly exemption: ReleaseAgeExemption;
    };

/**
 * The holdback and bypass records one selection carries: a newer release
 * the policy held back while an eligible one was selected, or the unaged
 * release an exemption let in.
 */
export const releaseAgeRecords = (
  subject: ReleaseAgeRecordSubject,
  selection: ReleaseAgeSelection,
  selectedVersion: string,
): {
  readonly holdbacks: ReadonlyArray<ReleaseAgeHoldbackRecord>;
  readonly bypasses: ReadonlyArray<ReleaseAgeBypassRecord>;
} =>
  selection.kind === "exempted"
    ? {
        holdbacks: [],
        bypasses: [
          {
            ...releaseAgeRecord(subject, selection.bypassed, selectedVersion),
            ...selection.exemption,
          },
        ],
      }
    : {
        holdbacks:
          selection.newerHeld === undefined
            ? []
            : [releaseAgeRecord(subject, selection.newerHeld, selectedVersion)],
        bypasses: [],
      };

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

const parseDuration = (value: string): Option.Option<Duration.Duration> => {
  const match = durationPattern.exec(value.trim());
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
 * The configured minimum release age, or the refusal every reader of the
 * setting reports for a value it cannot parse. There is no fallback: an
 * unreadable window never widens to "no minimum".
 */
export const parseMinimumReleaseAge = (
  value: string,
): Effect.Effect<Duration.Duration, ExtensionResolutionFailed> =>
  Option.match(parseDuration(value), {
    onNone: () =>
      Effect.fail(
        new ExtensionResolutionFailed({
          category: "validation",
          detail: `Invalid minimumReleaseAge "${value}"`,
          recover: "Use a duration such as 24h, 1440m, or 0s.",
        }),
      ),
    onSome: Effect.succeed,
  });

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

/**
 * Whether a release has reached the minimum age at the supplied instant.
 * Inclusive at the boundary: a release published exactly the minimum age ago
 * is eligible.
 */
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

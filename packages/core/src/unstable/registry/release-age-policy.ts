import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import type { VersionEntry } from "./schema.js";

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
  `${args.fqn} held at ${args.selectedVersion} because ${args.heldVersion} is newer than minimumReleaseAge ${args.minimumReleaseAge}`;

import * as Option from "effect/Option";

import type { VersionEntry } from "./schema.js";

export const DEFAULT_MINIMUM_RELEASE_AGE = "24h";
export const DEFAULT_MINIMUM_RELEASE_AGE_MS = 24 * 60 * 60 * 1000;

export interface ReleaseAgePolicy {
  readonly minimumAgeMs: number;
  readonly now: Date;
}

const durationPattern = /^(\d+)(ms|s|m|h|d)$/;

export const parseMinimumReleaseAge = (value: string): Option.Option<number> => {
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
      return Option.some(amount);
    case "s":
      return Option.some(amount * 1000);
    case "m":
      return Option.some(amount * 60 * 1000);
    case "h":
      return Option.some(amount * 60 * 60 * 1000);
    case "d":
      return Option.some(amount * 24 * 60 * 60 * 1000);
  }

  return Option.none();
};

export const isVersionEntryMature = (entry: VersionEntry, policy: ReleaseAgePolicy): boolean => {
  if (policy.minimumAgeMs <= 0) return true;
  const publishedAt = Date.parse(entry.published);
  if (!Number.isFinite(publishedAt)) return false;
  return policy.now.getTime() - publishedAt >= policy.minimumAgeMs;
};

export const filterMatureVersions = (
  versions: ReadonlyArray<VersionEntry>,
  policy: ReleaseAgePolicy,
): ReadonlyArray<VersionEntry> => versions.filter((entry) => isVersionEntryMature(entry, policy));

export const releaseAgeHoldbackWarning = (args: {
  readonly fqn: string;
  readonly selectedVersion: string;
  readonly heldVersion: string;
  readonly minimumReleaseAge: string;
}): string =>
  `${args.fqn} held at ${args.selectedVersion} because ${args.heldVersion} is newer than minimumReleaseAge ${args.minimumReleaseAge}`;

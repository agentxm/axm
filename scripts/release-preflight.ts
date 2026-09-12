import * as semver from "semver";

const RELEASE_TAG_PREFIX = "cli-v";

export const selectReleasedSkillTag = (
  currentVersion: string,
  reachableReleaseTags: readonly string[],
): string => {
  const candidates = reachableReleaseTags.flatMap((tag) => {
    if (!tag.startsWith(RELEASE_TAG_PREFIX)) return [];
    const version = tag.slice(RELEASE_TAG_PREFIX.length);
    return semver.valid(version) === version && semver.lte(version, currentVersion)
      ? [{ tag, version }]
      : [];
  });
  candidates.sort((left, right) => semver.rcompare(left.version, right.version));

  const selected = candidates[0];
  if (selected === undefined) {
    throw new Error(
      `No reachable released CLI tag exists at or before the current version ${currentVersion}.`,
    );
  }
  return selected.tag;
};

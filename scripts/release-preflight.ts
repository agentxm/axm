import * as semver from "semver";

const RELEASE_TAG_PREFIX = "cli-v";
const FULL_GIT_SHA = /^[0-9a-f]{40}$/u;

export const validateReleasePreparationSource = (
  declaredSourceSha: string,
  checkoutSha: string,
  originMainSha: string,
): void => {
  if (!FULL_GIT_SHA.test(declaredSourceSha)) {
    throw new Error("Release preparation requires an exact 40-character lowercase commit SHA.");
  }
  if (checkoutSha !== declaredSourceSha) {
    throw new Error(
      `Checked out ${checkoutSha}, but release preparation declared ${declaredSourceSha}.`,
    );
  }
  if (originMainSha !== declaredSourceSha) {
    throw new Error(
      `origin/main is ${originMainSha}, not declared source ${declaredSourceSha}; prepare from current main.`,
    );
  }
};

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

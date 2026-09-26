/** Dependency-free release identity grammar for pre-install CI and release scripts. */

import { readFileSync } from "node:fs";

import { capture } from "./release-command.js";

export const RELEASE_TAG_PREFIX = "cli-v";
const SEMVER_IDENTIFIER_PATTERN = "[0-9A-Za-z-]+";
export const SEMVER_VERSION_REGEX = new RegExp(
  `^(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)(?:-(?:${SEMVER_IDENTIFIER_PATTERN})(?:\\.${SEMVER_IDENTIFIER_PATTERN})*)?(?:\\+(?:${SEMVER_IDENTIFIER_PATTERN})(?:\\.${SEMVER_IDENTIFIER_PATTERN})*)?$`,
);
export const STABLE_VERSION_REGEX = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u;
export const FULL_GIT_SHA = /^[0-9a-f]{40}$/u;

const RELEASE_COMMIT_SUBJECT_REGEX = new RegExp(
  `^release: (${RELEASE_TAG_PREFIX}(${SEMVER_VERSION_REGEX.source.slice(1, -1)}))(?: \\(#[0-9]+\\))?$`,
  "u",
);

export const requireFullSha = (value: string, subject: string): string => {
  if (!FULL_GIT_SHA.test(value)) {
    throw new Error(`${subject} requires an exact 40-character lowercase commit SHA.`);
  }
  return value;
};

export const requireStableVersion = (version: string): string => {
  if (!STABLE_VERSION_REGEX.test(version)) {
    throw new Error("Expected a stable release version in major.minor.patch form.");
  }
  return version;
};

export const validateReleaseVersion = (version: string, source: string = version): string => {
  if (!SEMVER_VERSION_REGEX.test(version)) {
    throw new Error(`Release tag version is not valid semver: ${source}`);
  }
  return version;
};

export const releaseTagFromVersion = (version: string): string =>
  `${RELEASE_TAG_PREFIX}${validateReleaseVersion(version)}`;

export const validateReleaseTag = (tag: string): string => {
  if (!tag.startsWith(RELEASE_TAG_PREFIX)) {
    throw new Error(`Release tag must use the ${RELEASE_TAG_PREFIX}{VERSION} format: ${tag}`);
  }
  validateReleaseVersion(tag.slice(RELEASE_TAG_PREFIX.length), tag);
  return tag;
};

export const releaseVersionFromTag = (tag: string): string =>
  validateReleaseVersion(validateReleaseTag(tag).slice(RELEASE_TAG_PREFIX.length), tag);

export const parseReleaseCommitSubject = (
  subject: string,
): { readonly tag: string; readonly version: string } | undefined => {
  const match = RELEASE_COMMIT_SUBJECT_REGEX.exec(subject);
  if (match?.[1] === undefined || match[2] === undefined) return undefined;
  return { tag: match[1], version: match[2] };
};

export const isReleaseLikeSubject = (subject: string): boolean =>
  subject.startsWith(`release: ${RELEASE_TAG_PREFIX}`);

const isRecord = (value: unknown): value is Record<PropertyKey, unknown> =>
  value != null && typeof value === "object";

export const readVersionFromJson = (content: string, source: string): string => {
  const parsed: unknown = JSON.parse(content);
  if (!isRecord(parsed)) throw new Error(`Expected ${source} to contain a JSON object.`);
  const version = Reflect.get(parsed, "version");
  if (typeof version !== "string") {
    throw new Error(`Expected ${source} to contain a string version field.`);
  }
  return version;
};

export const readPackageVersion = (path: string): string =>
  readVersionFromJson(readFileSync(path, "utf8"), path);

export const readPackageVersionAtRef = (ref: string, path: string): string =>
  readVersionFromJson(capture("git", ["show", `${ref}:${path}`]), `${ref}:${path}`);
